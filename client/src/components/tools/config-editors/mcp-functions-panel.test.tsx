import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext, initialState } from '@shared/models/chat-models';
import { getQueryFn } from '@/lib/queryClient';
import McpFunctionsPanel from './mcp-functions-panel';
import { normalizeToolFunctions, describeToolFunctionsError } from '@/hooks/use-tool-functions';

vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

const TOOL_ID = 42;
const CONNECTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const baseSnapshot = {
  functionsDiscoveredOn: '2026-10-01T10:00:00Z',
  functions: [
    { name: 'search_docs', description: 'Search documents', isEnabled: true, status: 'Active' },
    { name: 'create_doc', description: 'Create a document', isEnabled: false, status: 'New' },
    { name: 'legacy_export', description: 'Old export', isEnabled: true, status: 'Removed' },
  ],
};

interface Route {
  method: string;
  match: (url: string) => boolean;
  respond: (init: RequestInit | undefined) => { ok: boolean; status?: number; body: unknown };
}

function mockFetch(routes: Route[]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = routes.find((r) => r.method === method && r.match(url));
    if (!route) throw new Error(`Unexpected ${method} ${url}`);
    const { ok, status = ok ? 200 : 500, body } = route.respond(init);
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const getFunctionsRoute = (snapshot: unknown = baseSnapshot): Route => ({
  method: 'GET',
  match: (url) => url.endsWith(`/md/api/v1/tenant/tool/${TOOL_ID}/functions`),
  respond: () => ({ ok: true, body: { data: snapshot } }),
});

function renderPanel(props: Partial<React.ComponentProps<typeof McpFunctionsPanel>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'throw' }), retry: false },
      mutations: { retry: false },
    },
  });
  const context = { ...initialState, selectedTenantGuid: 'tenant-guid-1', updateState: () => {} };
  const ui = (overrides: Partial<React.ComponentProps<typeof McpFunctionsPanel>>) => (
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={context}>
        <McpFunctionsPanel toolId={TOOL_ID} isOAuth={false} permissionsEnabled {...overrides} />
      </DataContext.Provider>
    </QueryClientProvider>
  );
  const result = render(ui(props));
  return {
    ...result,
    /** Re-renders with new props on top of the initial ones (e.g. the checkbox being toggled). */
    rerenderPanel: (overrides: Partial<React.ComponentProps<typeof McpFunctionsPanel>>) =>
      result.rerender(ui({ ...props, ...overrides })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('McpFunctionsPanel (WI 7447)', () => {
  it('lists functions with New/Removed badges and an "N of M enabled" count', async () => {
    mockFetch([getFunctionsRoute()]);
    renderPanel();

    expect(await screen.findByText('search_docs')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-functions-count')).toHaveTextContent('2 of 3 enabled');

    const rows = screen.getAllByTestId('mcp-function-row');
    expect(within(rows[1]).getByText('New')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Removed')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enable create_doc' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Enable search_docs' })).toBeChecked();
  });

  it('saves the enabled set through its own PUT, separate from the tool save', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      getFunctionsRoute(),
      {
        method: 'PUT',
        match: (url) => url.endsWith(`/md/api/v1/tenant/tool/${TOOL_ID}/functions`),
        respond: () => ({ ok: true, body: { data: true } }),
      },
    ]);
    renderPanel();

    const saveButton = await screen.findByRole('button', { name: 'Save functions' });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByRole('switch', { name: 'Enable create_doc' }));
    await user.click(screen.getByRole('switch', { name: 'Enable legacy_export' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(saveButton);

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(put![1]!.body as string)).toEqual({ enabledFunctions: ['search_docs', 'create_doc'] });
      expect((put![1]!.headers as Record<string, string>).Authorization).toBe('Bearer fake-access-token');
    });
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    // Saving only changes the draft tool - it reaches chat once the tool is published.
    expect(await screen.findByTestId('mcp-functions-publish-hint')).toHaveTextContent('Publish the tool to apply these changes in chat');

    // A new change hides the hint until it is saved too.
    await user.click(screen.getByRole('switch', { name: 'Enable create_doc' }));
    expect(screen.queryByTestId('mcp-functions-publish-hint')).not.toBeInTheDocument();
  });

  it('applies Enable all / Disable all only to the functions matching the search', async () => {
    const user = userEvent.setup();
    mockFetch([getFunctionsRoute()]);
    renderPanel();

    await user.type(await screen.findByRole('textbox', { name: 'Search functions' }), 'doc');
    expect(screen.getAllByTestId('mcp-function-row')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Disable all shown' }));
    expect(screen.getByTestId('mcp-functions-count')).toHaveTextContent('1 of 3 enabled');

    await user.clear(screen.getByRole('textbox', { name: 'Search functions' }));
    expect(screen.getByRole('switch', { name: 'Enable legacy_export' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Enable search_docs' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Enable all' }));
    expect(screen.getByTestId('mcp-functions-count')).toHaveTextContent('3 of 3 enabled');
  });

  it('shows an empty state and loads functions with "Refresh from server"', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      getFunctionsRoute({ functions: [], functionsDiscoveredOn: null }),
      {
        method: 'POST',
        match: (url) => url.endsWith(`/ai/api/v1/tenant/tool/${TOOL_ID}/functions/discover`),
        respond: () => ({ ok: true, body: { data: baseSnapshot } }),
      },
    ]);
    renderPanel();

    expect(await screen.findByText(/No functions yet/)).toBeInTheDocument();
    expect(screen.getByTestId('mcp-functions-discovered-on')).toHaveTextContent('Not loaded from the server yet.');

    await user.click(screen.getByRole('button', { name: /refresh from server/i }));

    expect(await screen.findByText('create_doc')).toBeInTheDocument();
    expect(await screen.findByTestId('mcp-functions-publish-hint')).toHaveTextContent('Publish the tool');
    expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'POST' && String(url).includes('/functions/discover'))).toBe(true);
  });

  it('shows the server message when discovery fails', async () => {
    const user = userEvent.setup();
    mockFetch([
      getFunctionsRoute({ functions: [], functionsDiscoveredOn: null }),
      {
        method: 'POST',
        match: (url) => url.includes('/functions/discover'),
        respond: () => ({ ok: false, status: 400, body: { message: 'Connect this tool before loading its functions.' } }),
      },
    ]);
    renderPanel();

    await user.click(await screen.findByRole('button', { name: /refresh from server/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connect this tool before loading its functions.');
    expect(screen.queryByTestId('mcp-functions-publish-hint')).not.toBeInTheDocument();
  });

  it('asks to connect first for an OAuth tool that is not connected, without loading functions', async () => {
    const fetchMock = mockFetch([
      {
        method: 'GET',
        match: (url) => url.includes(`/tool/${CONNECTION_ID}/mcp/oauth/status`),
        respond: () => ({ ok: true, body: { data: { status: 'NotConnected' } } }),
      },
      getFunctionsRoute(),
    ]);
    renderPanel({ isOAuth: true, mcpOAuthConnectionId: CONNECTION_ID });

    expect(await screen.findByText(/Connect this tool first/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/functions'))).toBe(false);
  });

  it('shows functions for an OAuth tool once it is connected', async () => {
    mockFetch([
      {
        method: 'GET',
        match: (url) => url.includes(`/tool/${CONNECTION_ID}/mcp/oauth/status`),
        respond: () => ({ ok: true, body: { data: { status: 'Connected' } } }),
      },
      getFunctionsRoute(),
    ]);
    renderPanel({ isOAuth: true, mcpOAuthConnectionId: CONNECTION_ID });

    expect(await screen.findByText('search_docs')).toBeInTheDocument();
  });

  it('shows an unavailable state when the OAuth status cannot be checked', async () => {
    mockFetch([
      {
        method: 'GET',
        match: (url) => url.includes('/mcp/oauth/status'),
        respond: () => ({ ok: false, status: 500, body: 'boom' }),
      },
    ]);
    renderPanel({ isOAuth: true, mcpOAuthConnectionId: CONNECTION_ID });

    expect(await screen.findByText(/Functions are unavailable/)).toBeInTheDocument();
  });
});

describe('McpFunctionsPanel — display name and description (WI 7726)', () => {
  const putRoute: Route = {
    method: 'PUT',
    match: (url) => url.endsWith(`/md/api/v1/tenant/tool/${TOOL_ID}/functions`),
    respond: () => ({ ok: true, body: { data: true } }),
  };

  const friendlySnapshot = {
    ...baseSnapshot,
    functions: [
      {
        name: 'search_docs',
        description: 'Calls GET /v2/docs/search',
        displayName: 'Find documents',
        displayDescription: 'Looks up documents by keyword',
        isEnabled: true,
        status: 'Active',
      },
      ...baseSnapshot.functions.slice(1),
    ],
  };

  const putBody = (fetchMock: ReturnType<typeof mockFetch>) => {
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    return put ? JSON.parse(put[1]!.body as string) : undefined;
  };

  it('shows the friendly name and description while keeping the original name and description visible', async () => {
    mockFetch([getFunctionsRoute(friendlySnapshot)]);
    renderPanel();

    const row = (await screen.findAllByTestId('mcp-function-row'))[0];
    expect(within(row).getByTestId('mcp-function-display-name')).toHaveTextContent('Find documents');
    expect(within(row).getByText('search_docs')).toBeInTheDocument();
    expect(within(row).getByTestId('mcp-function-display-description')).toHaveTextContent('Looks up documents by keyword');
    expect(within(row).getByTestId('mcp-function-server-description')).toHaveTextContent('Calls GET /v2/docs/search');
    // The switch is still identified by the original name.
    expect(screen.getByRole('switch', { name: 'Enable search_docs' })).toBeChecked();
  });

  it('saves edited display text with the allowlist, trimmed and with blanks as null', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([getFunctionsRoute(friendlySnapshot), putRoute]);
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Display name and description for create_doc' }));
    const fields = screen.getByTestId('mcp-function-display-fields');
    const nameInput = within(fields).getByLabelText('Display name');
    expect(nameInput).toHaveAttribute('placeholder', 'create_doc');
    expect(nameInput).toHaveAttribute('maxLength', '100');
    expect(within(fields).getByLabelText('Display description')).toHaveAttribute('maxLength', '500');

    await user.type(nameInput, '  New document  ');
    expect(within(fields).getByText('16/100')).toBeInTheDocument();

    // Clearing an existing friendly name sends null for it.
    await user.click(screen.getByRole('button', { name: 'Display name and description for search_docs' }));
    const searchFields = screen.getAllByTestId('mcp-function-display-fields')[0];
    await user.clear(within(searchFields).getByLabelText('Display name'));

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save functions' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({
        enabledFunctions: ['search_docs', 'legacy_export'],
        functions: [
          { name: 'search_docs', displayName: null, displayDescription: 'Looks up documents by keyword' },
          { name: 'create_doc', displayName: 'New document', displayDescription: null },
        ],
      })
    );
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
  });

  it('does not count whitespace-only edits as changes', async () => {
    const user = userEvent.setup();
    mockFetch([getFunctionsRoute()]);
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Display name and description for create_doc' }));
    await user.type(screen.getByLabelText('Display name'), '   ');

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save functions' })).toBeDisabled();
  });

  it('discards unsaved display text', async () => {
    const user = userEvent.setup();
    mockFetch([getFunctionsRoute()]);
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Display name and description for create_doc' }));
    await user.type(screen.getByLabelText('Display name'), 'New document');
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByLabelText('Display name')).toHaveValue('');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('matches the search against saved friendly values', async () => {
    const user = userEvent.setup();
    mockFetch([getFunctionsRoute(friendlySnapshot)]);
    renderPanel();

    await user.type(await screen.findByRole('textbox', { name: 'Search functions' }), 'keyword');
    const rows = screen.getAllByTestId('mcp-function-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('search_docs')).toBeInTheDocument();
  });

  it('offers no display text editing for functions the server no longer offers', async () => {
    mockFetch([getFunctionsRoute()]);
    renderPanel();

    await screen.findByText('legacy_export');
    expect(screen.queryByRole('button', { name: 'Display name and description for legacy_export' })).not.toBeInTheDocument();
  });
});

// Task 7857: with "Manage permissions for this tool" off the allowlist is ignored at runtime.
describe('McpFunctionsPanel — Manage permissions for this tool (Task 7857)', () => {
  const putRoute: Route = {
    method: 'PUT',
    match: (url) => url.endsWith(`/md/api/v1/tenant/tool/${TOOL_ID}/functions`),
    respond: () => ({ ok: true, body: { data: true } }),
  };

  const putBody = (fetchMock: ReturnType<typeof mockFetch>) => {
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    return put ? JSON.parse(put[1]!.body as string) : undefined;
  };

  it('when off, says every function is available and hides the switches and the count', async () => {
    mockFetch([getFunctionsRoute()]);
    renderPanel({ permissionsEnabled: false });

    expect(await screen.findByText('search_docs')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-functions-permissions-off-note')).toHaveTextContent(
      'All functions are available to agents. Turn on "Manage permissions for this tool" to choose which functions agents can use.'
    );
    expect(screen.getAllByTestId('mcp-function-row')).toHaveLength(3);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mcp-functions-count')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable all' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable all' })).not.toBeInTheDocument();
    // Search and refresh stay available.
    expect(screen.getByRole('textbox', { name: 'Search functions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh from server' })).toBeInTheDocument();
  });

  it('when off, still edits display text and saves the stored allowlist unchanged', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([getFunctionsRoute(), putRoute]);
    renderPanel({ permissionsEnabled: false });

    await user.click(await screen.findByRole('button', { name: 'Display name and description for create_doc' }));
    await user.type(screen.getByLabelText('Display name'), 'New document');
    await user.click(screen.getByRole('button', { name: 'Save functions' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({
        enabledFunctions: ['search_docs', 'legacy_export'],
        functions: [{ name: 'create_doc', displayName: 'New document', displayDescription: null }],
      })
    );
  });

  it('reacts to the setting being toggled and keeps switch changes made before it was turned off', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    const fetchMock = mockFetch([getFunctionsRoute(), putRoute]);
    const { rerenderPanel } = renderPanel({ permissionsEnabled: true, onDirtyChange });

    await user.click(await screen.findByRole('switch', { name: 'Enable create_doc' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    rerenderPanel({ permissionsEnabled: false });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByTestId('mcp-functions-permissions-off-note')).toBeInTheDocument();
    // Hidden switch changes are neither offered for saving nor counted as unsaved.
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save functions' })).toBeDisabled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    rerenderPanel({ permissionsEnabled: true });
    expect(screen.getByRole('switch', { name: 'Enable create_doc' })).toBeChecked();
    expect(screen.getByTestId('mcp-functions-count')).toHaveTextContent('3 of 3 enabled');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('when on with nothing selected, says all functions are available', async () => {
    mockFetch([
      getFunctionsRoute({
        ...baseSnapshot,
        functions: baseSnapshot.functions.slice(0, 2).map((f) => ({ ...f, isEnabled: false })),
      }),
    ]);
    renderPanel({ permissionsEnabled: true });

    expect(await screen.findByTestId('mcp-functions-count')).toHaveTextContent(
      'No functions selected — all functions are available'
    );
    expect(screen.getByRole('switch', { name: 'Enable search_docs' })).not.toBeChecked();
  });
});

describe('McpFunctionsPanel — ids', () => {
  it('does not build element ids from raw function names', async () => {
    mockFetch([getFunctionsRoute({
      functionsDiscoveredOn: null,
      functions: [{ name: 'files/read all', description: 'Odd name', isEnabled: false, status: 'Active' }],
    })]);
    renderPanel();

    const toggle = await screen.findByRole('switch', { name: 'Enable files/read all' });
    expect(toggle.id).not.toContain('files/read all');
    expect(screen.getByLabelText('files/read all')).toBe(toggle);
  });
});

describe('use-tool-functions helpers', () => {
  it('normalizes the envelope, a bare array, and unknown statuses', () => {
    expect(normalizeToolFunctions(baseSnapshot).functions).toHaveLength(3);
    expect(normalizeToolFunctions([{ name: 'a', isEnabled: true, status: 'new' }])).toEqual({
      functions: [
        { name: 'a', description: null, inputSchema: undefined, isEnabled: true, status: 'New', displayName: null, displayDescription: null },
      ],
      functionsDiscoveredOn: null,
    });
    expect(normalizeToolFunctions({ functions: [{ name: '' }, null, { name: 'b', status: 'weird' }] }).functions).toEqual([
      { name: 'b', description: null, inputSchema: undefined, isEnabled: false, status: 'Active', displayName: null, displayDescription: null },
    ]);
    expect(normalizeToolFunctions(undefined)).toEqual({ functions: [], functionsDiscoveredOn: null });
  });

  it('reads display text when present, trimmed, and treats blank values as not set', () => {
    const { functions } = normalizeToolFunctions([
      { name: 'a', displayName: '  Find documents ', displayDescription: '   ' },
      { name: 'b', displayName: 7 },
    ]);
    expect(functions[0]).toMatchObject({ displayName: 'Find documents', displayDescription: null });
    expect(functions[1]).toMatchObject({ displayName: null, displayDescription: null });
  });

  it('extracts a readable message from API errors', () => {
    expect(describeToolFunctionsError(new Error('400: {"message":"Not connected"}'))).toBe('Not connected');
    expect(describeToolFunctionsError(new Error('502: Bad gateway'))).toBe('Bad gateway');
    expect(describeToolFunctionsError(new Error('plain'))).toBe('plain');
  });
});
