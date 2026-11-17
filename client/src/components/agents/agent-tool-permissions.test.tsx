import React from 'react';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext, initialState } from '@shared/models/chat-models';
import { getQueryFn } from '@/lib/queryClient';
import ToolIntegration from './tool-integration';
import { describeAgentToolPermissionsError } from '@/hooks/use-agent-tool-permissions';
import { invalidateToolQueries } from '@/lib/tool-query-invalidation';

vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const AGENT_ID = 1;

const allTools = [
  { id: 10, name: 'Docs server', description: 'MCP docs', type: 'MCP' },
  { id: 11, name: 'Weather API', description: 'HTTP weather', type: 'HTTP' },
  { id: 12, name: 'Contact form', description: 'Collects details', type: 'Contact_Form' },
  { id: 13, name: 'Unlinked tool', description: 'Not on this agent', type: 'HTTP' },
];

function permissionsResponse(overrides: Partial<Record<number, object>> = {}) {
  return {
    tools: [
      {
        toolId: 10, name: 'Docs server', type: 'MCP', isActive: true, permissionsEnabled: true, permission: null,
        functions: [
          { name: 'search_docs', description: 'Search documents', permission: 'Allow' },
          { name: 'create_doc', description: 'Create a document', permission: 'Block' },
        ],
        ...overrides[10],
      },
      { toolId: 11, name: 'Weather API', type: 'HTTP', isActive: true, permissionsEnabled: true, permission: 'Ask', functions: null, ...overrides[11] },
      { toolId: 12, name: 'Contact form', type: 'Contact_Form', isActive: true, permissionsEnabled: false, permission: null, functions: null },
    ],
  };
}

function mockApi(options: { permissions?: object; putResponse?: { ok: boolean; status: number; body: unknown } } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const respond = (ok: boolean, status: number, body: unknown) => ({
      ok, status, statusText: ok ? 'OK' : 'Bad Request',
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response);

    if (method === 'PUT' && url.endsWith(`/agent/${AGENT_ID}/tools/permissions`)) {
      const r = options.putResponse ?? { ok: true, status: 200, body: { data: permissionsResponse() } };
      return respond(r.ok, r.status, r.body);
    }
    if (url.endsWith(`/agent/${AGENT_ID}/tools/permissions`)) return respond(true, 200, { data: options.permissions ?? permissionsResponse() });
    if (url.endsWith('/md/api/v1/tenant/tools')) return respond(true, 200, { data: allTools });
    if (url.endsWith(`/agent/${AGENT_ID}/tools`)) return respond(true, 200, { data: allTools.slice(0, 3) });
    if (url.endsWith(`/agent/${AGENT_ID}`)) return respond(true, 200, { data: { id: AGENT_ID, systemPrompt: '' } });
    throw new Error(`Unexpected ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderTab() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'throw' }), retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const context = { ...initialState, selectedTenantGuid: 'tenant-guid-1', updateState: () => {} };
  return render(
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={context}>
        <ToolIntegration agentId={AGENT_ID} />
      </DataContext.Provider>
    </QueryClientProvider>
  );
}

let queryClient: QueryClient;

function rowFor(name: string) {
  return screen.getByText(name).closest('div.flex.items-center.justify-between') as HTMLElement;
}

async function openPermissions(user: ReturnType<typeof userEvent.setup>, toolName: string) {
  await screen.findByText(toolName);
  const button = await waitFor(() => {
    const b = within(rowFor(toolName)).getByRole('button', { name: /permissions/i });
    expect(b).toBeEnabled();
    return b;
  });
  await user.click(button);
  return screen.findByRole('dialog');
}

const putCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([, init]) => JSON.parse(init!.body as string));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Agent Tools tab — tool permissions (WI 7447)', () => {
  it('shows Permissions only on linked tools, disabled when the tool does not manage permissions', async () => {
    mockApi();
    renderTab();

    await screen.findByText('Docs server');
    await waitFor(() => expect(within(rowFor('Docs server')).getByRole('button', { name: /permissions/i })).toBeEnabled());
    expect(within(rowFor('Weather API')).getByRole('button', { name: /permissions/i })).toBeEnabled();
    expect(within(rowFor('Contact form')).getByRole('button', { name: /permissions/i })).toBeDisabled();
    expect(within(rowFor('Unlinked tool')).queryByRole('button', { name: /permissions/i })).not.toBeInTheDocument();
  });

  it('saves the full function list for an MCP tool, without a tool-level permission', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi();
    renderTab();

    const dialog = await openPermissions(user, 'Docs server');
    expect(within(dialog).getAllByTestId('permission-row')).toHaveLength(2);
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.click(within(dialog).getByRole('radio', { name: 'Ask for permission: search_docs' }));
    expect(save).toBeEnabled();
    await user.click(save);

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Publish the agent to apply these permissions in chat');
    expect(putCalls(fetchMock)).toEqual([
      { tools: [{ toolId: 10, functions: [{ name: 'search_docs', permission: 'Ask' }, { name: 'create_doc', permission: 'Block' }] }] },
    ]);
    // Refetched after saving.
    await waitFor(() => {
      const gets = fetchMock.mock.calls.filter(([url, init]) => !init?.method && String(url).endsWith('/tools/permissions'));
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('saves one permission for a non-MCP tool, without functions', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi();
    renderTab();

    const dialog = await openPermissions(user, 'Weather API');
    expect(within(dialog).getByText('All functions')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Ask for permission: All functions' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(dialog).getByRole('radio', { name: 'Always block: All functions' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(putCalls(fetchMock)).toEqual([{ tools: [{ toolId: 11, permission: 'Block' }] }]));
  });

  it('shows a readable error instead of the backend code', async () => {
    const user = userEvent.setup();
    mockApi({ putResponse: { ok: false, status: 400, body: { errors: [{ property: 'Tools[0]', code: 'WKFLOMD0414' }] } } });
    renderTab();

    const dialog = await openPermissions(user, 'Docs server');
    await user.click(within(dialog).getByRole('radio', { name: 'Always allow: create_doc' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('no longer enabled on the tool');
    expect(alert.textContent).not.toMatch(/WKFLOMD/);
  });

  // Regression: the tooltip trigger used to be the toggle item itself (asChild), so Radix Slot
  // overwrote the item's data-state="on" with the tooltip's "closed" and the selected option
  // never got its highlight.
  it('highlights the selected option through data-state="on", also after changing it', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();

    const dialog = await openPermissions(user, 'Weather API');
    const ask = within(dialog).getByRole('radio', { name: 'Ask for permission: All functions' });
    const block = within(dialog).getByRole('radio', { name: 'Always block: All functions' });

    expect(ask).toHaveAttribute('data-state', 'on');
    expect(ask.className).toContain('data-[state=on]:bg-white');
    expect(block).toHaveAttribute('data-state', 'off');

    await user.hover(block);
    await user.click(block);

    expect(block).toHaveAttribute('data-state', 'on');
    expect(block.className).toContain('data-[state=on]:text-red-600');
    expect(ask).toHaveAttribute('data-state', 'off');
  });

  it('discards unsaved changes on Cancel', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();

    let dialog = await openPermissions(user, 'Weather API');
    await user.click(within(dialog).getByRole('radio', { name: 'Always block: All functions' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openPermissions(user, 'Weather API');
    expect(within(dialog).getByRole('radio', { name: 'Ask for permission: All functions' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('explains when an MCP tool has no enabled functions', async () => {
    const user = userEvent.setup();
    mockApi({ permissions: permissionsResponse({ 10: { functions: [] } }) });
    renderTab();

    const dialog = await openPermissions(user, 'Docs server');
    expect(within(dialog).getByTestId('no-enabled-functions')).toHaveTextContent('No functions are enabled on this tool yet');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('Agent tool permissions — friendly function names (WI 7726)', () => {
  it('shows only the friendly text when set, falls back to the original when unset, and still saves by original name', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      permissions: permissionsResponse({
        10: {
          functions: [
            {
              name: 'search_docs',
              description: 'Calls GET /v2/docs/search',
              displayName: 'Find documents',
              displayDescription: 'Looks up documents by keyword',
              permission: 'Allow',
            },
            { name: 'create_doc', description: 'Create a document', displayName: '  ', displayDescription: null, permission: 'Block' },
          ],
        },
      }),
    });
    renderTab();

    const dialog = await openPermissions(user, 'Docs server');
    const [friendlyRow, plainRow] = within(dialog).getAllByTestId('permission-row');
    expect(within(friendlyRow).getByText('Find documents')).toBeInTheDocument();
    // Original values are fallbacks only: not shown next to the friendly ones.
    expect(within(friendlyRow).queryByText('search_docs')).not.toBeInTheDocument();
    expect(within(friendlyRow).getByText('Looks up documents by keyword')).toBeInTheDocument();
    expect(within(friendlyRow).queryByText('Calls GET /v2/docs/search')).not.toBeInTheDocument();
    expect(within(plainRow).getByText('create_doc')).toBeInTheDocument();
    expect(within(plainRow).getByText('Create a document')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: 'Ask for permission: Find documents' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(putCalls(fetchMock)).toEqual([
        { tools: [{ toolId: 10, functions: [{ name: 'search_docs', permission: 'Ask' }, { name: 'create_doc', permission: 'Block' }] }] },
      ])
    );
  });
});

describe('Agent tool permissions — unset means Block (PLAN.md decision 3)', () => {
  it('shows unset or unknown MCP function permissions as Always block and sends Block for them', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      permissions: permissionsResponse({
        10: {
          functions: [
            { name: 'search_docs', description: 'Search documents', permission: null },
            { name: 'create_doc', description: 'Create a document', permission: 'Whatever' },
            { name: 'list_docs', description: 'List documents' },
          ],
        },
      }),
    });
    renderTab();

    const dialog = await openPermissions(user, 'Docs server');
    for (const name of ['search_docs', 'create_doc', 'list_docs']) {
      expect(within(dialog).getByRole('radio', { name: `Always block: ${name}` })).toHaveAttribute('data-state', 'on');
    }

    await user.click(within(dialog).getByRole('radio', { name: 'Ask for permission: search_docs' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(putCalls(fetchMock)).toEqual([
      {
        tools: [{
          toolId: 10,
          functions: [
            { name: 'search_docs', permission: 'Ask' },
            { name: 'create_doc', permission: 'Block' },
            { name: 'list_docs', permission: 'Block' },
          ],
        }],
      },
    ]));
  });

  it('shows an unset whole-tool permission as Always block', async () => {
    const user = userEvent.setup();
    mockApi({ permissions: permissionsResponse({ 11: { permission: null } }) });
    renderTab();

    const dialog = await openPermissions(user, 'Weather API');

    expect(within(dialog).getByRole('radio', { name: 'Always block: All functions' })).toHaveAttribute('data-state', 'on');
    expect(within(dialog).getByRole('radio', { name: 'Always allow: All functions' })).toHaveAttribute('data-state', 'off');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('Agent Tools tab — fresh tool settings (WI 7447)', () => {
  it('enables the Permissions button once the tool turns permissions on elsewhere', async () => {
    const offResponse = permissionsResponse({ 11: { permissionsEnabled: false, permission: null } });
    const fetchMock = mockApi({ permissions: offResponse });
    renderTab();

    await screen.findByText('Weather API');
    await waitFor(() => expect(within(rowFor('Docs server')).getByRole('button', { name: /permissions/i })).toBeEnabled());
    expect(within(rowFor('Weather API')).getByRole('button', { name: /permissions/i })).toBeDisabled();

    // The tool edit page saves "Manage permissions for this tool" = on and invalidates.
    vi.unstubAllGlobals();
    mockApi();
    await invalidateToolQueries(queryClient, 11);

    await waitFor(() => expect(within(rowFor('Weather API')).getByRole('button', { name: /permissions/i })).toBeEnabled());
    expect(fetchMock).toBeDefined();
  });
});

describe('Agent tool permissions — screen reader hints', () => {
  it('describes each option with its tooltip text', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();

    const dialog = await openPermissions(user, 'Weather API');
    const block = within(dialog).getByRole('radio', { name: 'Always block: All functions' });
    const describedBy = block.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('The agent never uses it.');
  });

  it('describes why the Permissions button is unavailable on its focusable wrapper', async () => {
    mockApi();
    renderTab();

    await screen.findByText('Contact form');
    const trigger = await waitFor(() => within(rowFor('Contact form')).getByTestId('permissions-disabled-trigger'));
    await waitFor(() => {
      const describedBy = trigger.getAttribute('aria-describedby');
      expect(document.getElementById(describedBy!)).toHaveTextContent("Turn on 'Manage permissions for this tool' on the tool first");
    });
  });
});

describe('Agent tool permissions — set all functions (Bug 7871)', () => {
  const bulkCases = [
    { button: 'Always allow', value: 'Allow' },
    { button: 'Ask for permission', value: 'Ask' },
    { button: 'Always block', value: 'Block' },
  ] as const;

  for (const { button, value } of bulkCases) {
    it(`sets every function to ${button} and saves them through the usual save`, async () => {
      const user = userEvent.setup();
      const fetchMock = mockApi({
        permissions: permissionsResponse({
          10: {
            functions: [
              { name: 'search_docs', description: 'Search documents', permission: 'Allow' },
              { name: 'create_doc', description: 'Create a document', permission: 'Block' },
              { name: 'list_docs', description: 'List documents', permission: 'Ask' },
            ],
          },
        }),
      });
      renderTab();

      const dialog = await openPermissions(user, 'Docs server');
      const bulk = within(dialog).getByRole('button', { name: `Set all functions to ${button}` });
      expect(bulk).toHaveAttribute('aria-pressed', 'false');

      await user.click(bulk);

      for (const name of ['search_docs', 'create_doc', 'list_docs']) {
        expect(within(dialog).getByRole('radio', { name: `${button}: ${name}` })).toHaveAttribute('data-state', 'on');
      }
      expect(bulk).toHaveAttribute('aria-pressed', 'true');

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(putCalls(fetchMock)).toEqual([
        {
          tools: [{
            toolId: 10,
            functions: [
              { name: 'search_docs', permission: value },
              { name: 'create_doc', permission: value },
              { name: 'list_docs', permission: value },
            ],
          }],
        },
      ]));
    });
  }

  it('does not show the set-all buttons for a non-MCP tool or an MCP tool without enabled functions', async () => {
    const user = userEvent.setup();
    mockApi({ permissions: permissionsResponse({ 10: { functions: [] } }) });
    renderTab();

    let dialog = await openPermissions(user, 'Weather API');
    expect(within(dialog).queryByTestId('bulk-permissions')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openPermissions(user, 'Docs server');
    expect(within(dialog).queryByTestId('bulk-permissions')).not.toBeInTheDocument();
  });

  it('can be undone by Cancel like any other unsaved change', async () => {
    const user = userEvent.setup();
    mockApi();
    renderTab();

    let dialog = await openPermissions(user, 'Docs server');
    await user.click(within(dialog).getByRole('button', { name: 'Set all functions to Always block' }));
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openPermissions(user, 'Docs server');
    expect(within(dialog).getByRole('radio', { name: 'Always allow: search_docs' })).toHaveAttribute('data-state', 'on');
  });
});

describe('describeAgentToolPermissionsError', () => {
  it('maps known codes and never echoes unknown ones', () => {
    expect(describeAgentToolPermissionsError(new Error('400: {"errors":[{"property":"x","code":"WKFLOMD0410"}]}')))
      .toContain('Manage permissions for this tool');
    expect(describeAgentToolPermissionsError(new Error('400: {"errors":[{"code":"WKFLOMD9999"}]}')))
      .toBe("Couldn't save the permissions. Please try again.");
    expect(describeAgentToolPermissionsError(new Error('500: boom'))).toBe("Couldn't save the permissions. Please try again.");
    expect(describeAgentToolPermissionsError(new Error('404: '))).toBe('This agent no longer exists.');
  });
});
