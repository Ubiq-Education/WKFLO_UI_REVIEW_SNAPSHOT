import React from 'react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { DataContext, initialState } from '@shared/models/chat-models';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import EditTool from './edit';

const { apiRequestMock, navigateMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  navigateMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: '7' }],
  useLocation: () => ['/tools/7/edit', navigateMock],
}));

// The page invalidates through the app-wide queryClient singleton (the one App.tsx provides),
// so the test uses that same instance as its provider; only apiRequest is stubbed.
vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: apiRequestMock };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/components/tags/entity-tags-panel', () => ({
  default: () => null,
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const TENANT = 'tenant-guid-1';
const TOKEN = 'fake-access-token';

const tool = {
  id: 7,
  name: 'Weather API',
  description: 'Answers weather questions',
  type: 'Knowledge',
  config: '{"tags":[]}',
  isActive: true,
  isPublished: false,
  isShared: false,
  createdOn: '2026-01-01T00:00:00Z',
  lastUpdatedOn: null,
  lastPublishedOn: null,
  permissionsEnabled: false,
};

afterEach(() => {
  appQueryClient.clear();
  vi.unstubAllGlobals();
  apiRequestMock.mockReset();
  navigateMock.mockReset();
  toastMock.mockReset();
});

describe('Edit tool page — refreshing agent tool data (WI 7447)', () => {
  it('saving "Manage permissions for this tool" invalidates every agent\'s tools and permissions queries', async () => {
    const user = userEvent.setup();
    // Any refetch the invalidation triggers for an observed query gets a harmless answer.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: tool }), text: async () => '' })));
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });

    const keys = {
      tool: [`/md/api/v1/tenant/tool/7`, TOKEN, TENANT],
      toolsList: ['/md/api/v1/tenant/tools', TOKEN, TENANT],
      agent1Permissions: ['/md/api/v1/tenant/agent/1/tools/permissions', TOKEN, TENANT],
      agent2Permissions: ['/md/api/v1/tenant/agent/2/tools/permissions', TOKEN, TENANT],
      agent1Tools: ['/md/api/v1/tenant/agent/1/tools', TOKEN, TENANT],
      agent1: ['/md/api/v1/tenant/agent/1', TOKEN, TENANT],
    };
    appQueryClient.setQueryData(keys.tool, tool);
    appQueryClient.setQueryData(keys.toolsList, [tool]);
    appQueryClient.setQueryData(keys.agent1Permissions, { tools: [] });
    appQueryClient.setQueryData(keys.agent2Permissions, { tools: [] });
    appQueryClient.setQueryData(keys.agent1Tools, [tool]);
    appQueryClient.setQueryData(keys.agent1, { id: 1 });

    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );

    const checkbox = await screen.findByRole('checkbox', { name: /manage permissions for this tool/i });
    await waitFor(() => expect(checkbox).not.toBeChecked());
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /save tool/i }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      'PUT', '/md/api/v1/tenant/tool/7', expect.objectContaining({ permissionsEnabled: true }), TOKEN
    ));
    await waitFor(() => {
      expect(appQueryClient.getQueryState(keys.agent1Permissions)?.isInvalidated).toBe(true);
      expect(appQueryClient.getQueryState(keys.agent2Permissions)?.isInvalidated).toBe(true);
      expect(appQueryClient.getQueryState(keys.agent1Tools)?.isInvalidated).toBe(true);
      expect(appQueryClient.getQueryState(keys.toolsList)?.isInvalidated).toBe(true);
    });
    expect(appQueryClient.getQueryState(keys.agent1)?.isInvalidated).toBe(false);
  });

  function renderEditPage() {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: tool }), text: async () => '' })));
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], tool);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );
  }

  it('tells the admin to publish the tool after changing "Manage permissions for this tool"', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const checkbox = await screen.findByRole('checkbox', { name: /manage permissions for this tool/i });
    await waitFor(() => expect(checkbox).not.toBeChecked());
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /save tool/i }));

    expect(await screen.findByTestId('tool-publish-hint')).toHaveTextContent('Publish the tool to apply these changes in chat');
  });

  it('shows no publish hint when the permissions option did not change', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const name = await screen.findByPlaceholderText('e.g., Search API');
    await waitFor(() => expect(name).toHaveValue('Weather API'));
    await user.type(name, ' 2');
    await user.click(screen.getByRole('button', { name: /save tool/i }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(screen.queryByTestId('tool-publish-hint')).not.toBeInTheDocument();
  });

  // PR review: saving the Functions panel used to refetch the tool detail query, which this page
  // copies into the form - wiping unsaved edits to the tool's other fields.
  it('keeps unsaved tool field edits when the Functions panel saves', async () => {
    const user = userEvent.setup();
    const mcpTool = {
      ...tool,
      type: 'MCP',
      config: JSON.stringify({ id: 'docs', transportType: 'Stdio', command: 'node', arguments: [], environmentVariables: {} }),
      // Task 7857: the function switches only show while permissions are managed.
      permissionsEnabled: true,
    };
    const functionsSnapshot = {
      functionsDiscoveredOn: '2026-10-01T10:00:00Z',
      functions: [{ name: 'search_docs', description: 'Search', isEnabled: false, status: 'Active' }],
    };
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: String(url).endsWith('/tool/7/functions') ? functionsSnapshot : mcpTool }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], mcpTool);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );

    const name = await screen.findByPlaceholderText('e.g., Search API');
    await waitFor(() => expect(name).toHaveValue('Weather API'));
    await user.type(name, ' (draft)');

    await user.click(await screen.findByRole('switch', { name: 'Enable search_docs' }));
    await user.click(screen.getByRole('button', { name: 'Save functions' }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      'PUT', '/md/api/v1/tenant/tool/7/functions', { enabledFunctions: ['search_docs'] }, TOKEN
    ));
    await screen.findByTestId('mcp-functions-publish-hint');
    expect(appQueryClient.getQueryState([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT])?.isInvalidated).toBe(false);
    expect(screen.getByPlaceholderText('e.g., Search API')).toHaveValue('Weather API (draft)');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/tenant/tool/7'))).toHaveLength(0);
  });
});

describe('Edit tool page — Publish (WI 7726)', () => {
  function renderPage() {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: tool }), text: async () => '' })));
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], tool);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );
  }

  it('shows whether the tool is published', async () => {
    renderPage();
    expect(await screen.findByText('Unpublished')).toBeInTheDocument();
  });

  it('publishes the saved tool after confirmation, with the same toast as the Tools list', async () => {
    const user = userEvent.setup();
    renderPage();

    const toolFetches = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/md/api/v1/tenant/tool/7')).length;
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(toolFetches()).toBe(0);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByTestId('publish-saved-only-note')).toHaveTextContent('Only saved changes are published');
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('POST', '/md/api/v1/tenant/tool/7/publish', {}, TOKEN));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      title: 'Tool published',
      description: 'The tool has been published successfully.',
    }));
    // The tool is refreshed so the page shows its new published state.
    await waitFor(() => expect(toolFetches()).toBeGreaterThan(0));
  });

  it('does not publish when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

describe('Edit tool page — Delete (WI 7726)', () => {
  function renderPage() {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: tool }), text: async () => '' })));
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], tool);
    appQueryClient.setQueryData(['/md/api/v1/tenant/tools', TOKEN, TENANT], [tool]);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );
  }

  it('deletes the tool after confirmation, shows the Tools list toast and goes back to the list', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/permanently delete the tool/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('DELETE', '/md/api/v1/tenant/tool/7', {}, TOKEN));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/tools'));
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Tool deleted',
      description: 'The tool has been successfully deleted.',
    });
    expect(appQueryClient.getQueryState(['/md/api/v1/tenant/tools', TOKEN, TENANT])?.isInvalidated).toBe(true);
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('Edit tool page — publish state badge (WI 7726)', () => {
  const changedTool = {
    ...tool,
    isPublished: true,
    lastUpdatedOn: '2026-10-02T10:00:00Z',
    lastPublishedOn: '2026-10-01T10:00:00Z',
  };

  it('shows "Unpublished changes" with an explanation when the tool changed after its last publish', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: changedTool }), text: async () => '' })));
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], changedTool);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );

    const badge = await screen.findByTestId('tool-publish-badge');
    expect(badge).toHaveTextContent('Unpublished changes');
    expect(badge).toHaveAccessibleDescription(/changed after it was last published/);
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
  });

  it('switches the badge to "Published" once the tool is published from this page', async () => {
    const user = userEvent.setup();
    let current = changedTool;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: current }), text: async () => '' })));
    apiRequestMock.mockImplementation(async (method: string) => {
      if (method === 'POST') current = { ...changedTool, lastPublishedOn: '2026-10-03T10:00:00Z' };
      return { json: async () => ({ data: true }) };
    });
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], changedTool);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('tool-publish-badge')).toHaveTextContent('Unpublished changes');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(screen.getByTestId('tool-publish-badge')).toHaveTextContent(/^Published$/));
  });
});

describe('Edit tool page — unsaved changes and Publish (WI 7726 review)', () => {
  const mcpTool = {
    ...tool,
    type: 'MCP',
    config: JSON.stringify({ id: 'docs', transportType: 'Stdio', command: 'node', arguments: [], environmentVariables: {} }),
    isPublished: true,
    lastUpdatedOn: '2026-10-01T09:00:00Z',
    lastPublishedOn: '2026-10-01T10:00:00Z',
    // Task 7857: the function switches only show while permissions are managed.
    permissionsEnabled: true,
  };
  const functionsSnapshot = {
    functionsDiscoveredOn: '2026-10-01T10:00:00Z',
    functions: [{ name: 'search_docs', description: 'Search', isEnabled: false, status: 'Active' }],
  };

  function renderWith(toolData: object, getTool: () => object = () => toolData) {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: String(url).endsWith('/tool/7/functions') ? functionsSnapshot : getTool() }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], toolData);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );
    return fetchMock;
  }

  // While held, a focusable stand-in is the only "Publish" button: unavailable, with the reason.
  function expectPublishHeld() {
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).toHaveAttribute('tabIndex', '0');
    expect(publish).toHaveAccessibleDescription('Save your changes before publishing.');
    expect(screen.getAllByRole('button', { name: 'Publish' })).toHaveLength(1);
  }

  function expectPublishAvailable() {
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeEnabled();
    expect(publish).not.toHaveAttribute('aria-disabled');
  }

  const toolDetailFetches = (fetchMock: ReturnType<typeof renderWith>) =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/md/api/v1/tenant/tool/7')).length;

  it('holds Publish while the tool form has unsaved changes, until they are saved', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    renderWith(tool);

    const name = await screen.findByPlaceholderText('e.g., Search API');
    await waitFor(() => expect(name).toHaveValue('Weather API'));
    expectPublishAvailable();

    await user.type(name, ' 2');
    expectPublishHeld();

    await user.click(screen.getByRole('button', { name: /save tool/i }));
    await waitFor(expectPublishAvailable);
  });

  // PR review: edits typed while a save is in flight must survive the save and stay unsaved.
  it('keeps edits typed while a save is in flight, and holds Publish until they are saved too', async () => {
    const user = userEvent.setup();
    let finishSave!: () => void;
    apiRequestMock.mockImplementationOnce(
      () => new Promise((resolve) => { finishSave = () => resolve({ json: async () => ({ data: true }) }); })
    );
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    let current: object = tool;
    const fetchMock = renderWith(tool, () => current);

    const name = await screen.findByPlaceholderText('e.g., Search API');
    const description = screen.getByPlaceholderText(/describe/i);
    await waitFor(() => expect(name).toHaveValue('Weather API'));
    await user.type(name, ' 2');
    await user.click(screen.getByRole('button', { name: /save tool/i }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));

    await user.type(description, ' today');
    current = { ...tool, name: 'Weather API 2' };
    finishSave();

    await waitFor(() => expect(toolDetailFetches(fetchMock)).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole('button', { name: /save tool/i })).toBeEnabled());
    expect(name).toHaveValue('Weather API 2');
    expect(description).toHaveValue('Answers weather questions today');
    expectPublishHeld();

    await user.click(screen.getByRole('button', { name: /save tool/i }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenLastCalledWith(
      'PUT', '/md/api/v1/tenant/tool/7', expect.objectContaining({ description: 'Answers weather questions today' }), TOKEN
    ));
    await waitFor(expectPublishAvailable);
  });

  it('holds Publish while the Functions panel has unsaved changes', async () => {
    const user = userEvent.setup();
    renderWith(mcpTool);

    const toggle = await screen.findByRole('switch', { name: 'Enable search_docs' });
    expectPublishAvailable();

    await user.click(toggle);
    expectPublishHeld();

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expectPublishAvailable();
  });

  it('does not overwrite form edits made while a publish is in flight', async () => {
    const user = userEvent.setup();
    let current: object = tool;
    let finishPublish!: () => void;
    apiRequestMock.mockImplementation((method: string) => {
      if (method !== 'POST') return Promise.resolve({ json: async () => ({ data: true }) });
      return new Promise((resolve) => {
        finishPublish = () => {
          current = { ...tool, isPublished: true, lastPublishedOn: '2026-10-03T10:00:00Z' };
          resolve({ json: async () => ({ data: true }) });
        };
      });
    });
    const fetchMock = renderWith(tool, () => current);

    const name = await screen.findByPlaceholderText('e.g., Search API');
    await waitFor(() => expect(name).toHaveValue('Weather API'));
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('POST', '/md/api/v1/tenant/tool/7/publish', {}, TOKEN));

    await user.type(name, ' (draft)');
    finishPublish();

    // The tool is refreshed (its badge flips to Published) but the unsaved name is kept.
    await waitFor(() => expect(toolDetailFetches(fetchMock)).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByTestId('tool-publish-badge')).toHaveTextContent(/^Published$/));
    expect(screen.getByPlaceholderText('e.g., Search API')).toHaveValue('Weather API (draft)');
  });

  it('shows "Unpublished changes" after saving functions, without refetching the tool', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    const fetchMock = renderWith(mcpTool);

    expect(await screen.findByTestId('tool-publish-badge')).toHaveTextContent(/^Published$/);
    await user.click(await screen.findByRole('switch', { name: 'Enable search_docs' }));
    await user.click(screen.getByRole('button', { name: 'Save functions' }));

    await waitFor(() => expect(screen.getByTestId('tool-publish-badge')).toHaveTextContent('Unpublished changes'));
    expect(toolDetailFetches(fetchMock)).toBe(0);
  });

  it("drops the deleted tool's own queries instead of refetching them", async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    const removeQueries = vi.spyOn(appQueryClient, 'removeQueries');
    renderWith(tool);

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/tools'));
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['/md/api/v1/tenant/tool/7'] });
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['/md/api/v1/tenant/tool/7/functions'] });
  });
});

// Task 7851 bug: "…existing connections to this tool were reset…" appeared without the admin
// changing anything. The notice must come only from a real save that changed the endpoint or the
// client credentials, and a typed secret must not linger in the form after it was saved.
describe('Edit tool page — MCP OAuth connections reset notice (Task 7851)', () => {
  const CONNECTIONS_RESET = /existing connections to this tool were reset/i;
  const oauthConfig = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    id: 'design-mcp',
    transportType: 'Http',
    endpoint: 'https://mcp.example.com/mcp',
    authType: 'OAuth2',
    oAuthScope: 'PerUser',
    clientId: 'client-123',
    hasClientSecret: true,
    scopes: ['profile:read'],
    ...overrides,
  });
  const oauthTool = {
    ...tool,
    type: 'MCP',
    config: oauthConfig(),
    mcpOAuthConnectionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  };

  /** Every GET returns `getTool()` for the tool itself (the backend never echoes the secret). */
  function renderWith(getTool: () => object = () => oauthTool) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      const data = u.endsWith('/functions')
        ? { functionsDiscoveredOn: null, functions: [] }
        : u.includes('/mcp/oauth/status')
          ? { status: 'NotConnected' }
          : getTool();
      return { ok: true, status: 200, json: async () => ({ data }), text: async () => '' };
    }));
    appQueryClient.setQueryData([`/md/api/v1/tenant/tool/7`, TOKEN, TENANT], getTool());
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );
  }

  async function save(user: ReturnType<typeof userEvent.setup>, times: number) {
    await user.click(screen.getByRole('button', { name: /save tool/i }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(times));
    await waitFor(() => expect(screen.getByRole('button', { name: /save tool/i })).toBeEnabled());
  }

  const postedConfig = (call: number) => JSON.parse(apiRequestMock.mock.calls[call][2].config);

  it('shows no notice after loading the tool, nor after saving it without changes', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    renderWith();

    await screen.findByLabelText('Client ID');
    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled());

    await save(user, 1);

    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
    expect(postedConfig(0)).not.toHaveProperty('clientSecret');
    expect(postedConfig(0)).not.toHaveProperty('hasClientSecret');
  });

  it('shows the notice after saving an endpoint change even with no secret stored', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    const noSecretTool = { ...oauthTool, config: oauthConfig({ clientId: '', hasClientSecret: false }) };
    renderWith(() => noSecretTool);

    await user.type(await screen.findByPlaceholderText(/endpoint must be an absolute uri/i), '/v2');
    await save(user, 1);

    expect(screen.getByText(CONNECTIONS_RESET)).toBeInTheDocument();
  });

  it('marks the secret as removed in the form after saving a Clear', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    renderWith();

    await user.click(await screen.findByRole('button', { name: /clear saved client secret/i }));
    await save(user, 1);

    expect(postedConfig(0).clearClientSecret).toBe(true);
    expect(screen.getByText('Optional for public / PKCE-only clients.')).toBeInTheDocument();

    await save(user, 2);
    expect(postedConfig(1)).not.toHaveProperty('clearClientSecret');
  });

  it('after saving a typed secret, clears it from the form so a later save neither re-posts it nor reports a reset', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    renderWith(); // hasClientSecret was already true, so the refetched tool is identical

    await user.type(await screen.findByLabelText('Client Secret'), 'n3w-s3cret');
    await save(user, 1);
    expect(postedConfig(0).clientSecret).toBe('n3w-s3cret');
    expect(screen.getByText(CONNECTIONS_RESET)).toBeInTheDocument();
    expect(screen.getByLabelText('Client Secret')).toHaveValue('');
    expect(screen.getByText('Secret saved. Leave blank to keep it.')).toBeInTheDocument();

    // Save again without changes: nothing new to report.
    await save(user, 2);
    expect(postedConfig(1)).not.toHaveProperty('clientSecret');
    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();

    // A later scopes-only change is not a credentials change either.
    await user.type(screen.getByLabelText('Scopes'), ' asset:read');
    await save(user, 3);
    expect(postedConfig(2)).not.toHaveProperty('clientSecret');
    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
  });

  it('shows no notice when the refetched tool differs (e.g. another admin saved it), only on a save', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    let current: object = oauthTool;
    renderWith(() => current);

    await screen.findByLabelText('Client ID');
    current = { ...oauthTool, name: 'Renamed', config: oauthConfig({ clientId: 'someone-elses-client' }) };
    await appQueryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/tool/7`] });
    await waitFor(() => expect(screen.getByLabelText('Client ID')).toHaveValue('someone-elses-client'));

    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
    void user;
  });

  it.each([
    ['an endpoint change', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByPlaceholderText(/endpoint must be an absolute uri/i), '/v2');
    }],
    ['a Client ID change', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByLabelText('Client ID'), '-v2');
    }],
    ['a cleared secret', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: /clear saved client secret/i }));
    }],
  ])('shows the notice after saving %s', async (_label, edit) => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    renderWith();

    await screen.findByLabelText('Client ID');
    await edit(user);
    await save(user, 1);

    expect(screen.getByText(CONNECTIONS_RESET)).toBeInTheDocument();
  });
});

// Bug 7871: clearing "Max Output Length" and saving kept the old cap. The backend ignored the
// explicit null and returned the old cap, and the refetch after the save then re-synced the form
// to it, so the next save posted the old cap again. These tests run the page against a backend
// that stores what the PUT sends (an explicit null clears the cap, an omitted field keeps it),
// and check that no path that saves or refetches makes the page post a stale cap.
describe('Edit tool page — Max Output Length (Bug 7871)', () => {
  const cappedTool = { ...tool, maxToolOutputLength: 5000 };
  const TOOL_URL = '/md/api/v1/tenant/tool/7';

  /**
   * A backend that merges each PUT body over the stored tool and stamps lastUpdatedOn. A GET reads
   * the stored tool when it is requested; after `holdNextGet`, the next tool GET's answer is held
   * back until `releaseHeldGet`, to simulate a refetch still in flight. `releaseHeldGet` returns a
   * promise that settles once the page has read that answer's body, so a test can wait for the
   * late answer to have been handled instead of guessing with a timer.
   */
  function fakeBackend(initial: Record<string, unknown>) {
    const stored: Record<string, unknown> = { ...initial };
    let holdNext = false;
    const held: Array<() => Promise<void>> = [];
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      const data = u.endsWith('/functions')
        ? { functionsDiscoveredOn: null, functions: [] }
        : u.includes('/mcp/oauth/status')
          ? { status: 'NotConnected' }
          : { ...stored };
      const response = { ok: true, status: 200, json: async () => ({ data }), text: async () => '' };
      if (holdNext && u.endsWith(TOOL_URL)) {
        holdNext = false;
        return new Promise((resolve) =>
          held.push(
            () =>
              new Promise<void>((bodyRead) => {
                resolve({ ...response, json: async () => { bodyRead(); return { data }; } });
              })
          )
        );
      }
      return response;
    });
    vi.stubGlobal('fetch', fetchMock);
    let puts = 0;
    const storePut = (method: string, url: string, body: Record<string, unknown>) => {
      if (method !== 'PUT' || url !== TOOL_URL) return;
      puts += 1;
      Object.assign(stored, body, { lastUpdatedOn: `2026-10-0${puts}T12:00:00Z` });
    };
    // Something else changes the tool (e.g. a publish), so a refetch returns a new tool object
    // that the page re-syncs from - unless the form has unsaved edits.
    const publishElsewhere = () => {
      Object.assign(stored, { isPublished: true, lastPublishedOn: '2026-10-09T12:00:00Z' });
    };
    apiRequestMock.mockImplementation(async (method: string, url: string, body: Record<string, unknown>) => {
      storePut(method, url, body);
      return { json: async () => ({ data: true }) };
    });
    return {
      stored,
      storePut,
      publishElsewhere,
      holdNextGet: () => { holdNext = true; },
      releaseHeldGet: () => held.shift()?.() ?? Promise.resolve(),
      toolGets: () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(TOOL_URL)).length,
    };
  }

  function renderPage(initial: Record<string, unknown>) {
    const backend = fakeBackend(initial);
    appQueryClient.setQueryData([TOOL_URL, TOKEN, TENANT], initial);
    const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
    render(
      <QueryClientProvider client={appQueryClient}>
        <DataContext.Provider value={context}>
          <EditTool />
        </DataContext.Provider>
      </QueryClientProvider>
    );
    return backend;
  }

  const toolPuts = () => apiRequestMock.mock.calls.filter(([method, url]) => method === 'PUT' && url === TOOL_URL);
  const lastPutBody = () => toolPuts().at(-1)![2] as Record<string, unknown>;
  const maxOutputInput = () => screen.getByLabelText('Max Output Length');
  const cachedCap = () =>
    appQueryClient.getQueryData<{ maxToolOutputLength?: number | null }>([TOOL_URL, TOKEN, TENANT])?.maxToolOutputLength;
  /**
   * Waits until a released held GET has been fully handled: its body was read (`bodyRead`), no
   * tool query is still fetching, and one macrotask turn has passed. Everything between reading
   * the body and TanStack Query writing (or dropping) the data is promise continuations with no
   * timers, so they have all run by the next macrotask - no arbitrary delay involved.
   */
  async function lateAnswerHandled(bodyRead: Promise<void>) {
    await bodyRead;
    await waitFor(() => expect(appQueryClient.isFetching({ queryKey: [TOOL_URL] })).toBe(0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  async function save(user: ReturnType<typeof userEvent.setup>) {
    const before = toolPuts().length;
    await user.click(screen.getByRole('button', { name: /save tool/i }));
    await waitFor(() => expect(toolPuts()).toHaveLength(before + 1));
    await waitFor(() => expect(screen.getByRole('button', { name: /save tool/i })).toBeEnabled());
  }

  async function renameAndSave(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText('e.g., Search API'), ' 2');
    await save(user);
  }

  it('posts null after clearing the field, and keeps it cleared after the save and its refetch', async () => {
    const user = userEvent.setup();
    const backend = renderPage(cappedTool);
    await waitFor(() => expect(maxOutputInput()).toHaveValue(5000));

    await user.clear(maxOutputInput());
    await save(user);

    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);
    await waitFor(() => expect(backend.toolGets()).toBe(1));
    await waitFor(() => expect(cachedCap()).toBeNull());
    expect(maxOutputInput()).toHaveValue(null);
    // Nothing unsaved is left, so Publish is available.
    expect(screen.getByRole('button', { name: 'Publish' })).not.toHaveAttribute('aria-disabled');

    // A later save of another field doesn't bring the old cap back.
    await renameAndSave(user);
    expect(lastPutBody()).toMatchObject({ name: 'Weather API 2', maxToolOutputLength: null });
    expect(backend.stored.maxToolOutputLength).toBeNull();
  });

  it('posts a changed cap, and keeps it after the refetch', async () => {
    const user = userEvent.setup();
    const backend = renderPage(cappedTool);
    await waitFor(() => expect(maxOutputInput()).toHaveValue(5000));

    await user.clear(maxOutputInput());
    await user.type(maxOutputInput(), '1200');
    await save(user);

    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', 1200);
    await waitFor(() => expect(backend.toolGets()).toBe(1));
    await waitFor(() => expect(cachedCap()).toBe(1200));
    expect(maxOutputInput()).toHaveValue(1200);
  });

  it('keeps a cleared, unsaved field when a refetch returns the old cap', async () => {
    const user = userEvent.setup();
    const backend = renderPage(cappedTool);
    await waitFor(() => expect(maxOutputInput()).toHaveValue(5000));

    await user.clear(maxOutputInput());
    backend.publishElsewhere();
    await appQueryClient.invalidateQueries({ queryKey: [TOOL_URL] });
    expect(backend.toolGets()).toBe(1);
    await waitFor(() => expect(screen.getByTestId('tool-publish-badge')).toHaveTextContent(/^Published$/));
    expect(maxOutputInput()).toHaveValue(null);

    await save(user);
    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);
  });

  it('drops a refetch that read the old cap before the save and answers after it', async () => {
    const user = userEvent.setup();
    const backend = renderPage(cappedTool);
    await waitFor(() => expect(maxOutputInput()).toHaveValue(5000));

    backend.publishElsewhere();
    backend.holdNextGet();
    void appQueryClient.invalidateQueries({ queryKey: [TOOL_URL] });
    await waitFor(() => expect(backend.toolGets()).toBe(1));

    await user.clear(maxOutputInput());
    await save(user);
    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);
    // The save's own refetch reads the cleared cap...
    await waitFor(() => expect(backend.toolGets()).toBe(2));
    await waitFor(() => expect(cachedCap()).toBeNull());

    // ...and the earlier one's late answer (cap 5000) is dropped.
    await lateAnswerHandled(backend.releaseHeldGet());
    expect(cachedCap()).toBeNull();
    expect(maxOutputInput()).toHaveValue(null);

    await renameAndSave(user);
    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);
  });

  it('ignores a refetch that read the old cap and answers while the save is in flight', async () => {
    const user = userEvent.setup();
    const backend = renderPage(cappedTool);
    await waitFor(() => expect(maxOutputInput()).toHaveValue(5000));

    backend.publishElsewhere();
    backend.holdNextGet();
    void appQueryClient.invalidateQueries({ queryKey: [TOOL_URL] });
    await waitFor(() => expect(backend.toolGets()).toBe(1));

    await user.clear(maxOutputInput());
    let finishSave!: () => void;
    apiRequestMock.mockImplementationOnce(async (method: string, url: string, body: Record<string, unknown>) => {
      await new Promise<void>((resolve) => { finishSave = resolve; });
      backend.storePut(method, url, body);
      return { json: async () => ({ data: true }) };
    });
    await user.click(screen.getByRole('button', { name: /save tool/i }));
    await waitFor(() => expect(toolPuts()).toHaveLength(1));
    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);

    // The stale answer lands while the cleared field is still unsaved: the form keeps it.
    backend.releaseHeldGet();
    await waitFor(() => expect(screen.getByTestId('tool-publish-badge')).toHaveTextContent(/^Published$/));
    expect(cachedCap()).toBe(5000);
    expect(maxOutputInput()).toHaveValue(null);

    finishSave();
    await waitFor(() => expect(backend.toolGets()).toBe(2));
    await waitFor(() => expect(cachedCap()).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: /save tool/i })).toBeEnabled());
    expect(maxOutputInput()).toHaveValue(null);

    await renameAndSave(user);
    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);
  });

  it('posts the cleared cap when an MCP Connection Mode change saves the tool immediately', async () => {
    const user = userEvent.setup();
    const oauthTool = {
      ...cappedTool,
      type: 'MCP',
      config: JSON.stringify({
        id: 'design-mcp',
        transportType: 'Http',
        endpoint: 'https://mcp.example.com/mcp',
        authType: 'OAuth2',
        oAuthScope: 'PerUser',
        clientId: 'client-123',
        hasClientSecret: true,
        scopes: ['profile:read'],
      }),
      mcpOAuthConnectionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    };
    const backend = renderPage(oauthTool);
    await waitFor(() => expect(maxOutputInput()).toHaveValue(5000));

    await user.clear(maxOutputInput());
    await user.click(screen.getByRole('combobox', { name: 'Connection Mode' }));
    await user.click(await screen.findByRole('option', { name: /shared/i }));

    await waitFor(() => expect(toolPuts()).toHaveLength(1));
    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);
    expect(JSON.parse(lastPutBody().config as string).oAuthScope).toBe('Shared');
    await waitFor(() => expect(backend.toolGets()).toBe(1));
    await waitFor(() => expect(cachedCap()).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: /save tool/i })).toBeEnabled());
    expect(maxOutputInput()).toHaveValue(null);

    await save(user);
    expect(lastPutBody()).toHaveProperty('maxToolOutputLength', null);
  });
});
