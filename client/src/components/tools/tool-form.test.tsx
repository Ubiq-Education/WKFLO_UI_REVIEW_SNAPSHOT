import React from 'react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext, initialState } from '@shared/models/chat-models';
import ToolForm from './tool-form';

// Avoid pulling in the real MSAL/DataContext dependency chain — useVariableSuggestions
// only needs a truthy token to decide whether to enable its secrets query, and the
// secrets query itself stays disabled anyway (no DataContext.selectedTenantGuid in this
// test), so the returned value's shape doesn't matter beyond being a string.
vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

beforeAll(() => {
  // jsdom doesn't implement the pointer-capture / scrollIntoView APIs Radix's Select
  // relies on for its open/close and scroll-into-view behavior.
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

interface RenderOptions {
  type?: string;
  /** Mirrors the edit page's mcpOAuthConnectionId prop - omit to simulate the create page. */
  mcpOAuthConnectionId?: string;
  /** Initial "config" JSON string - simulates a tool loaded from the backend on the edit page. */
  config?: string;
  /** Mirrors the page's isSubmitting prop (e.g. an in-flight save mutation). Defaults to false. */
  isSubmitting?: boolean;
  /** WI 7447: initial "Manage permissions for this tool" value. */
  permissionsEnabled?: boolean;
  /** Task 7851: mirrors the edit page's mcpConnectionsReset prop. */
  mcpConnectionsReset?: boolean;
  /**
   * Task 7857: mirrors the edit page's toolId prop (renders the MCP Functions panel). Also
   * provides a tenant so the panel's functions query runs - stub `fetch` when setting it.
   */
  toolId?: number;
}

/** The form instance the last renderToolForm Harness created (lets a test simulate a save). */
let lastForm: UseFormReturn<any> | null = null;

function renderToolForm(options: RenderOptions = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  function Harness() {
    const form = useForm<any>({
      defaultValues: {
        name: '',
        description: '',
        type: options.type ?? 'HTTP',
        config: options.config ?? '{}',
        isActive: true,
        tags: [],
        permissionsEnabled: options.permissionsEnabled,
      },
    });
    lastForm = form;
    return (
      <ToolForm
        form={form}
        onSubmit={onSubmit}
        isSubmitting={options.isSubmitting ?? false}
        onCancel={onCancel}
        mcpOAuthConnectionId={options.mcpOAuthConnectionId}
        mcpConnectionsReset={options.mcpConnectionsReset}
        toolId={options.toolId}
      />
    );
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      {options.toolId === undefined ? (
        <Harness />
      ) : (
        <DataContext.Provider value={{ ...initialState, selectedTenantGuid: 'tenant-guid-1', updateState: () => {} }}>
          <Harness />
        </DataContext.Provider>
      )}
    </QueryClientProvider>
  );

  return { onSubmit, onCancel };
}

// Minimal smoke coverage for the ADO #6433 refactor (tool-form.tsx split into
// tool-form.types.ts + hooks/ + config-editors/). There was zero automated coverage on
// this component before the refactor; this only exercises the orchestrator's three most
// structurally significant behaviors (default render, tool-type dispatch, and submit) —
// it is not a substitute for manually exercising every one of the 8 tool types.
describe('ToolForm', () => {
  it('renders the HTTP config editor by default', () => {
    renderToolForm();

    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('API Configuration')).toBeInTheDocument();
  });

  it('switches to the Knowledge tool type and renders its config editor instead', async () => {
    const user = userEvent.setup();
    renderToolForm();

    const trigger = screen.getByRole('combobox', { name: /tool type/i });
    await user.click(trigger);

    const option = await screen.findByRole('option', { name: /document library/i });
    await user.click(option);

    expect(await screen.findByText('Knowledge Configuration')).toBeInTheDocument();
    expect(screen.queryByText('API Configuration')).not.toBeInTheDocument();
  });

  // Regression test for a pre-existing bug (present in the monolith before the ADO #6433
  // refactor, not introduced by it) surfaced during manual testing of the refactor:
  // renaming an HTTP input's "Variable Name" used to rename the underlying object key on
  // every keystroke while the list row was keyed by that same object key, so React tore
  // down and remounted the row (dropping input focus) after every single character typed.
  it('keeps the Variable Name input mounted and focused while typing (HTTP Inputs list)', async () => {
    const user = userEvent.setup();
    renderToolForm();

    await user.click(screen.getByRole('button', { name: /add input/i }));

    const variableNameInput = screen.getByPlaceholderText('e.g., name, url, query');
    await user.type(variableNameInput, 'myvar');

    // Same DOM node must still be the one mounted and focused — if the row were keyed by
    // the renamable object key, each keystroke would swap in a brand-new <input> and focus
    // would be lost (nothing auto-refocuses a freshly mounted element).
    expect(screen.getByPlaceholderText('e.g., name, url, query')).toBe(variableNameInput);
    expect(variableNameInput).toHaveFocus();
  });

  it('submits the form, calling onSubmit with the current field values', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderToolForm();

    await user.type(screen.getByPlaceholderText('e.g., Search API'), 'My Tool');
    await user.type(
      screen.getByPlaceholderText('Describe what this tool does...'),
      'A test tool description'
    );

    await user.click(screen.getByRole('button', { name: /save tool/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'My Tool',
      description: 'A test tool description',
    });
  });
});

// WI 7097: MCP tool type gained an Auth Type selector (None | OAuth2) and, for OAuth2, a
// Connection panel to authorize the tool against the MCP server (e.g. Humantic.ai's).
describe('ToolForm — MCP Auth Type (WI 7097)', () => {
  // McpConfigEditor's own field selects (Transport Method, Auth Type) are plain
  // FormLabel+Select siblings rather than proper FormItem/FormField-wrapped fields (unlike
  // the "Tool Type" select on the outer ToolForm). Auth Type's label/trigger are explicitly
  // wired via htmlFor/id (a Copilot review finding on PR 16000 - the label had no accessible
  // association before), so it can be queried by label; Transport Method still can't and is
  // selected positionally: [0] Tool Type is always first; once MCP + Http transport is active,
  // [1] is Transport Method and [2] is Auth Type (same element getByLabelText(/auth type/i)
  // below also finds).
  async function switchToMcpHttpTransport(user: ReturnType<typeof userEvent.setup>) {
    const typeTrigger = screen.getByRole('combobox', { name: /tool type/i });
    await user.click(typeTrigger);
    await user.click(await screen.findByRole('option', { name: /^mcp$/i }));

    const transportTrigger = screen.getAllByRole('combobox')[1];
    await user.click(transportTrigger);
    await user.click(await screen.findByRole('option', { name: /^http$/i }));
  }

  it('defaults Auth Type to None and shows the Additional Headers field for Http transport', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);

    expect(screen.getAllByRole('combobox')[2]).toHaveTextContent('None');
    expect(screen.getByText('Additional Headers')).toBeInTheDocument();
  });

  it('has an accessible name for the Auth Type select (Copilot finding on PR 16000)', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);

    // Findable by its associated label, not just positionally - proves the
    // FormLabel htmlFor / SelectTrigger id association actually works, not just compiles.
    expect(screen.getByLabelText(/auth type/i)).toBe(screen.getAllByRole('combobox')[2]);
  });

  it('hides Additional Headers once Auth Type is switched to OAuth 2.1', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);

    const authTypeTrigger = screen.getAllByRole('combobox')[2];
    await user.click(authTypeTrigger);
    await user.click(await screen.findByRole('option', { name: /oauth 2\.1/i }));

    expect(screen.queryByText('Additional Headers')).not.toBeInTheDocument();
  });

  it('does not render the Connection panel on the create page (no mcpOAuthConnectionId)', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP' }); // no mcpOAuthConnectionId, like pages/tools/create.tsx
    await switchToMcpHttpTransport(user);

    const authTypeTrigger = screen.getAllByRole('combobox')[2];
    await user.click(authTypeTrigger);
    await user.click(await screen.findByRole('option', { name: /oauth 2\.1/i }));

    expect(screen.queryByText('Connection')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument();
  });

  it('renders the Connection panel with a Connect button on the edit page (mcpOAuthConnectionId provided)', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP', mcpOAuthConnectionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }); // like pages/tools/edit.tsx
    await switchToMcpHttpTransport(user);

    const authTypeTrigger = screen.getAllByRole('combobox')[2];
    await user.click(authTypeTrigger);
    await user.click(await screen.findByRole('option', { name: /oauth 2\.1/i }));

    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument();
  });
});

// Task 7152 (parent US 7151): MCP OAuth2 tools gained a Shared/Per-user "Connection Mode"
// toggle so tools like Canva (which has no tenant-shared mode at all) can be configured for
// per-admin connections instead of Humantic.ai's original tenant-wide-only behavior. See
// McpOAuthScope's doc comment in tool-form.types.ts.
describe('ToolForm — MCP Connection Mode / oAuthScope (Task 7152)', () => {
  async function switchToMcpHttpTransport(user: ReturnType<typeof userEvent.setup>) {
    const typeTrigger = screen.getByRole('combobox', { name: /tool type/i });
    await user.click(typeTrigger);
    await user.click(await screen.findByRole('option', { name: /^mcp$/i }));

    const transportTrigger = screen.getAllByRole('combobox')[1];
    await user.click(transportTrigger);
    await user.click(await screen.findByRole('option', { name: /^http$/i }));
  }

  async function switchToOAuth2(user: ReturnType<typeof userEvent.setup>) {
    const authTypeTrigger = screen.getAllByRole('combobox')[2];
    await user.click(authTypeTrigger);
    await user.click(await screen.findByRole('option', { name: /oauth 2\.1/i }));
  }

  it('does not render Connection Mode while Auth Type is None', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);

    expect(screen.queryByText('Connection Mode')).not.toBeInTheDocument();
  });

  it('defaults Connection Mode to Shared once Auth Type is switched to OAuth2', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);
    await switchToOAuth2(user);

    expect(screen.getByText('Connection Mode')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[3]).toHaveTextContent('Shared (tenant-wide)');
  });

  it('has an accessible name for the Connection Mode select', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);
    await switchToOAuth2(user);

    expect(screen.getByLabelText(/connection mode/i)).toBe(screen.getAllByRole('combobox')[3]);
  });

  it('switching Connection Mode to Per-user and submitting writes oAuthScope: "PerUser" into config', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);
    await switchToOAuth2(user);

    const scopeTrigger = screen.getAllByRole('combobox')[3];
    await user.click(scopeTrigger);
    await user.click(await screen.findByRole('option', { name: /^per-user$/i }));

    await user.click(screen.getByRole('button', { name: /save tool/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const written = JSON.parse(onSubmit.mock.calls[0][0].config);
    expect(written.oAuthScope).toBe('PerUser');
  });

  it('a legacy config with no oAuthScope round-trips to "Shared" (existing OAuth2 tools unaffected)', async () => {
    const user = userEvent.setup();
    const storedConfig = JSON.stringify({
      id: 'humantic-mcp',
      transportType: 'Http',
      endpoint: 'https://mcp.humantic.ai/mcp',
      authType: 'OAuth2',
      // no oAuthScope field at all - matches every tool saved before Task 7152 existed.
    });

    const { onSubmit } = renderToolForm({ type: 'MCP', config: storedConfig });

    const typeTrigger = screen.getByRole('combobox', { name: /tool type/i });
    await user.click(typeTrigger);
    await user.click(await screen.findByRole('option', { name: /^mcp$/i }));

    expect(screen.getByText('Connection Mode')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[3]).toHaveTextContent('Shared (tenant-wide)');

    await user.click(screen.getByRole('button', { name: /save tool/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const written = JSON.parse(onSubmit.mock.calls[0][0].config);
    expect(written.oAuthScope).toBe('Shared');
  });

  it('threads the Connection Mode through to the Connection panel on the edit page', async () => {
    const user = userEvent.setup();
    renderToolForm({ type: 'MCP', mcpOAuthConnectionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    await switchToMcpHttpTransport(user);
    await switchToOAuth2(user);

    const scopeTrigger = screen.getAllByRole('combobox')[3];
    await user.click(scopeTrigger);
    await user.click(await screen.findByRole('option', { name: /^per-user$/i }));

    expect(await screen.findByText('Personal — connects your own account')).toBeInTheDocument();
  });

  // Regression test: Connect/Disconnect/Status resolve Shared-vs-PerUser from whatever is
  // currently persisted in Tool.Config in the database (McpOAuthScopeResolver, backend) - never
  // from this form's in-browser state. Switching Connection Mode and immediately clicking
  // Connect, without an auto-save in between, would silently act under the *previous* mode.
  it('switching Connection Mode on the edit page saves the tool immediately, without clicking Save Tool', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderToolForm({ type: 'MCP', mcpOAuthConnectionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    await switchToMcpHttpTransport(user);
    await switchToOAuth2(user);

    const scopeTrigger = screen.getAllByRole('combobox')[3];
    await user.click(scopeTrigger);
    await user.click(await screen.findByRole('option', { name: /^per-user$/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const written = JSON.parse(onSubmit.mock.calls[0][0].config);
    expect(written.oAuthScope).toBe('PerUser');
  });

  // On create there's no persisted tool yet for an auto-save to target (and no Connection panel
  // is rendered at all - see McpConfigEditor), so switching Connection Mode there must behave
  // exactly like every other field: local form state only, no implicit submit.
  it('switching Connection Mode on the create page does not auto-save', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderToolForm({ type: 'MCP' });
    await switchToMcpHttpTransport(user);
    await switchToOAuth2(user);

    const scopeTrigger = screen.getAllByRole('combobox')[3];
    await user.click(scopeTrigger);
    await user.click(await screen.findByRole('option', { name: /^per-user$/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Regression test (Copilot PR review, WI 7152): while a save (the auto-save above, or the
  // normal Save Tool button) is in flight, the Connection Mode selector must be disabled - firing
  // a second mode change before the first save's PUT lands could resolve out of order, leaving
  // the database on a different oAuthScope than the UI shows.
  it('disables the Connection Mode selector while a save is in flight (isSubmitting)', async () => {
    const user = userEvent.setup();
    renderToolForm({
      type: 'MCP',
      mcpOAuthConnectionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      isSubmitting: true,
    });
    await switchToMcpHttpTransport(user);
    await switchToOAuth2(user);

    expect(screen.getAllByRole('combobox')[3]).toBeDisabled();
  });
});

// WI 7097 follow-up (Bug B): McpConfigEditor's mount effect used to rebuild a brand-new
// config object containing only the fields McpToolConfig knows about, then wrote that back
// via form.setValue - silently dropping any other properties the backend had stored (e.g.
// redirectUri, scopes, clientId, clientSecret from the OAuth2 flow) on every load. Since
// UpdateTenantTool wholesale-replaces Tool.Config with whatever the UI posts, opening a tool
// for edit and saving (even untouched) permanently wiped those fields. Also covers the
// self-healing tolerant parsing for legacy integer enum values a separate backend bug wrote
// into some rows (transportType/authType stored as 0/1 instead of "Stdio"/"Http"/"None"/"OAuth2").
describe('ToolForm — MCP config round-trip preserves unknown fields and heals legacy enums (WI 7097 Bug B)', () => {
  // Asserts against the actually-submitted payload (same pattern as the "submits the form"
  // test above) rather than reading form.getValues() from an externally-captured form
  // instance mid-effect: ToolForm's own `useEffect(() => {...}, [form.watch("config")])`
  // (the tags-sync effect) subscribes to "config" via the imperative `form.watch(...)` call
  // in its dependency array, and reading the live form value from outside React's render/
  // effect-flush cycle while that subscription is mid-flight is flaky. Submitting is both
  // more robust and exactly what "opening a tool for edit and saving" (the real bug
  // scenario) actually does.
  it('preserves redirectUri/scopes/clientId/clientSecret and normalizes legacy integer enums, end to end through submit', async () => {
    const user = userEvent.setup();
    const storedConfig = JSON.stringify({
      id: 'humantic-mcp',
      transportType: 1, // legacy int for "Http"
      command: '',
      arguments: [],
      environmentVariables: {},
      endpoint: 'https://mcp.humantic.ai/mcp',
      additionalHeaders: {},
      authType: 1, // legacy int for "OAuth2"
      redirectUri: 'https://app.example.com/md/api/v1/tenant/tool/3002/mcp/oauth/callback',
      scopes: ['profile.read'],
      clientId: 'dcr-client-123',
      clientSecret: 'dcr-secret-456',
    });

    const { onSubmit } = renderToolForm({ type: 'MCP', config: storedConfig });

    // Re-selecting "MCP" on the Tool Type select (even though it's already MCP by default)
    // settles ToolForm's toolType-driven editor swap - on the very first render, before
    // form.watch("type") resolves, ToolForm can render RawJsonConfigEditor's Controller-based
    // "config" field for a tick before McpConfigEditor's imperative form.setValue takes over;
    // this same settle step is why every other MCP test in this file does it too.
    const typeTrigger = screen.getByRole('combobox', { name: /tool type/i });
    await user.click(typeTrigger);
    await user.click(await screen.findByRole('option', { name: /^mcp$/i }));

    await user.click(screen.getByRole('button', { name: /save tool/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const written = JSON.parse(onSubmit.mock.calls[0][0].config);

    // Bug B: these must survive the round-trip (load -> save), not be silently dropped.
    expect(written.redirectUri).toBe('https://app.example.com/md/api/v1/tenant/tool/3002/mcp/oauth/callback');
    expect(written.scopes).toEqual(['profile.read']);
    expect(written.clientId).toBe('dcr-client-123');
    expect(written.clientSecret).toBe('dcr-secret-456');

    // Tolerant parsing: legacy integer enums self-heal to their string equivalents rather
    // than resetting to defaults ("Stdio"/"None").
    expect(written.transportType).toBe('Http');
    expect(written.authType).toBe('OAuth2');
  });

  it('still defaults to Stdio/None for genuinely invalid transportType/authType values', async () => {
    const user = userEvent.setup();
    const storedConfig = JSON.stringify({
      id: 'some-server',
      transportType: 'not-a-real-value',
      authType: 'also-not-real',
    });

    const { onSubmit } = renderToolForm({ type: 'MCP', config: storedConfig });

    await user.click(screen.getByRole('button', { name: /save tool/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const written = JSON.parse(onSubmit.mock.calls[0][0].config);
    expect(written.transportType).toBe('Stdio');
    expect(written.authType).toBe('None');
  });
});

// WI 7447 / US 7575: per-tool flag deciding whether agents' tool permissions apply at all.
describe('ToolForm — Manage permissions for this tool (WI 7447)', () => {
  it('renders the checkbox reflecting permissionsEnabled for any tool type', () => {
    renderToolForm({ type: 'Knowledge', permissionsEnabled: true });

    expect(screen.getByRole('checkbox', { name: /manage permissions for this tool/i })).toBeChecked();
  });

  it('submits permissionsEnabled: false after the admin unticks it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderToolForm({ permissionsEnabled: true });

    await user.type(screen.getByPlaceholderText('e.g., Search API'), 'My Tool');
    await user.type(screen.getByPlaceholderText('Describe what this tool does...'), 'A test tool description');
    await user.click(screen.getByRole('checkbox', { name: /manage permissions for this tool/i }));
    await user.click(screen.getByRole('button', { name: /save tool/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ permissionsEnabled: false });
  });

  it('does not render the MCP Functions panel without a saved tool id (create page)', async () => {
    const user = userEvent.setup();
    renderToolForm();

    await user.click(screen.getByRole('combobox', { name: /tool type/i }));
    await user.click(await screen.findByRole('option', { name: /^mcp$/i }));

    expect(screen.queryByText('Functions')).not.toBeInTheDocument();
  });
});

// Task 7857: the checkbox is the single access switch for an MCP tool's functions - when off,
// every function is available and the Functions panel hides its per-function switches.
describe('ToolForm — MCP functions follow Manage permissions (Task 7857)', () => {
  const TOOL_ID = 42;
  const CHECKBOX = { name: /manage permissions for this tool/i };

  function stubFunctionsFetch() {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (!url.endsWith(`/md/api/v1/tenant/tool/${TOOL_ID}/functions`)) throw new Error(`Unexpected ${url}`);
      const body = {
        data: {
          functionsDiscoveredOn: '2026-10-01T10:00:00Z',
          functions: [
            { name: 'search_docs', description: 'Search documents', isEnabled: true, status: 'Active' },
            { name: 'create_doc', description: 'Create a document', isEnabled: false, status: 'Active' },
          ],
        },
      };
      return { ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => JSON.stringify(body) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const mcpConfig = JSON.stringify({ id: 'docs', transportType: 'Stdio', command: 'node', authType: 'None' });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides the function switches while unticked and shows them as soon as it is ticked, without saving', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFunctionsFetch();
    const { onSubmit } = renderToolForm({ type: 'MCP', config: mcpConfig, toolId: TOOL_ID, permissionsEnabled: false });

    expect(await screen.findByText('search_docs')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-functions-permissions-off-note')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', CHECKBOX));
    expect(screen.getByRole('switch', { name: 'Enable search_docs' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Enable create_doc' })).not.toBeChecked();
    expect(screen.getByTestId('mcp-functions-count')).toHaveTextContent('1 of 2 enabled');
    expect(screen.queryByTestId('mcp-functions-permissions-off-note')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', CHECKBOX));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    // Toggling only changes the form; nothing is written until the admin saves.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
  });

  it('explains what the setting means for an MCP tool', () => {
    renderToolForm({ type: 'MCP', config: mcpConfig });

    expect(screen.getByTestId('permissions-enabled-help')).toHaveTextContent(
      'When on, choose which of this tool\'s functions agents can use, and set each agent to use them always, only after someone approves it, or never. When off, agents can use every function of this tool without asking.'
    );
  });

  it('keeps the general explanation for other tool types', () => {
    renderToolForm({ type: 'Knowledge' });

    expect(screen.getByTestId('permissions-enabled-help')).toHaveTextContent(
      'When on, each agent that uses this tool can be set to use it always, only after someone approves it, or never. When off, agents use this tool without asking.'
    );
  });
});

// US 7849 / Task 7851: preconfigured OAuth Client ID / Client Secret and Scopes for Http +
// OAuth2 MCP tools (e.g. Canva, which has no Dynamic Client Registration). The backend never
// returns the secret, only hasClientSecret; blank means "keep", clearClientSecret removes it.
describe('ToolForm — MCP OAuth client credentials (US 7849)', () => {
  const CONNECTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const SAVE_BEFORE_CONNECTING = 'Save the tool before connecting so the new endpoint, client credentials and scopes are used.';
  const CONNECTIONS_RESET = /existing connections to this tool were reset/i;

  const savedOAuthConfig = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: 'canva',
      transportType: 'Http',
      endpoint: 'https://mcp.example.com/mcp',
      authType: 'OAuth2',
      oAuthScope: 'PerUser',
      clientId: 'client-123',
      hasClientSecret: true,
      scopes: ['profile:read', 'design:meta:read'],
      ...overrides,
    });

  /** Renders a saved OAuth2 MCP tool and settles the editor (see the Bug B tests above). */
  async function renderSavedTool(user: ReturnType<typeof userEvent.setup>, options: RenderOptions = {}) {
    const result = renderToolForm({ type: 'MCP', config: savedOAuthConfig(), ...options });
    await user.click(screen.getByRole('combobox', { name: /tool type/i }));
    await user.click(await screen.findByRole('option', { name: /^mcp$/i }));
    return result;
  }

  async function save(user: ReturnType<typeof userEvent.setup>, onSubmit: ReturnType<typeof vi.fn>) {
    await user.click(screen.getByRole('button', { name: /save tool/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    return JSON.parse(onSubmit.mock.calls[0][0].config);
  }

  /** What the edit page does after a successful save: the submitted form values become the baseline. */
  function simulateSaved() {
    act(() => {
      lastForm!.reset(lastForm!.getValues());
    });
  }

  it('is hidden for Auth Type None and shown for Http + OAuth2', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { config: savedOAuthConfig({ authType: 'None' }) });

    expect(screen.queryByLabelText('Client ID')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/auth type/i));
    await user.click(await screen.findByRole('option', { name: /oauth 2\.1/i }));

    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Client Secret')).toBeInTheDocument();
    expect(screen.getByLabelText('Scopes')).toBeInTheDocument();
  });

  it('is hidden for Stdio transport even with authType OAuth2 stored', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { config: savedOAuthConfig({ transportType: 'Stdio' }) });

    expect(screen.queryByLabelText('Client ID')).not.toBeInTheDocument();
  });

  it('shows a saved secret as kept and posts neither the secret nor hasClientSecret when untouched', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    expect(screen.getByLabelText('Client ID')).toHaveValue('client-123');
    expect(screen.getByLabelText('Client Secret')).toHaveValue('');
    expect(screen.getByText('Secret saved. Leave blank to keep it.')).toBeInTheDocument();
    expect(screen.getByLabelText('Scopes')).toHaveValue('profile:read design:meta:read');

    const written = await save(user, onSubmit);
    expect(written.clientId).toBe('client-123');
    expect(written.scopes).toEqual(['profile:read', 'design:meta:read']);
    expect(written).not.toHaveProperty('clientSecret');
    expect(written).not.toHaveProperty('hasClientSecret');
    expect(written).not.toHaveProperty('clearClientSecret');
  });

  it('shows the optional hint when no secret is saved', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { config: savedOAuthConfig({ hasClientSecret: false }) });

    expect(screen.getByText('Optional for public / PKCE-only clients.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear saved client secret/i })).not.toBeInTheDocument();
  });

  it('posts a newly typed secret and a trimmed Client ID', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    const clientId = screen.getByLabelText('Client ID');
    await user.clear(clientId);
    await user.type(clientId, '  new-client  ');
    await user.type(screen.getByLabelText('Client Secret'), 'n3w-s3cret');
    expect(screen.getByText('Replaces the saved secret when you save.')).toBeInTheDocument();

    const written = await save(user, onSubmit);
    expect(written.clientId).toBe('new-client');
    expect(written.clientSecret).toBe('n3w-s3cret');
    expect(written).not.toHaveProperty('clearClientSecret');
    expect(written).not.toHaveProperty('hasClientSecret');
  });

  it('never posts an empty secret after typing and deleting one', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    const secret = screen.getByLabelText('Client Secret');
    await user.type(secret, 'abc');
    await user.clear(secret);

    const written = await save(user, onSubmit);
    expect(written).not.toHaveProperty('clientSecret');
  });

  it('Clear marks the saved secret for removal, and Undo restores the keep state', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    await user.click(screen.getByRole('button', { name: /clear saved client secret/i }));
    expect(screen.getByText('Will be removed when you save.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.getByText('Secret saved. Leave blank to keep it.')).toBeInTheDocument();

    const written = await save(user, onSubmit);
    expect(written).not.toHaveProperty('clearClientSecret');
    expect(written).not.toHaveProperty('clientSecret');
  });

  it('posts clearClientSecret: true after Clear', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    await user.click(screen.getByRole('button', { name: /clear saved client secret/i }));

    const written = await save(user, onSubmit);
    expect(written.clearClientSecret).toBe(true);
    expect(written).not.toHaveProperty('clientSecret');
  });

  it('typing a new secret after Clear replaces it instead (never both)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    await user.click(screen.getByRole('button', { name: /clear saved client secret/i }));
    await user.type(screen.getByLabelText('Client Secret'), 'replacement');

    const written = await save(user, onSubmit);
    expect(written.clientSecret).toBe('replacement');
    expect(written).not.toHaveProperty('clearClientSecret');
  });

  it('the Eye toggle reveals and hides the typed secret', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user);

    const secret = screen.getByLabelText('Client Secret');
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveAttribute('autocomplete', 'new-password');

    await user.click(screen.getByRole('button', { name: /show client secret/i }));
    expect(secret).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide client secret/i }));
    expect(secret).toHaveAttribute('type', 'password');
  });

  it('accepts space- or comma-separated scopes and posts them as an array', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    const scopes = screen.getByLabelText('Scopes');
    await user.clear(scopes);
    await user.type(scopes, 'profile:read, asset:read folder:read ');
    // The raw text (including the trailing separator) stays while typing.
    expect(scopes).toHaveValue('profile:read, asset:read folder:read ');

    const written = await save(user, onSubmit);
    expect(written.scopes).toEqual(['profile:read', 'asset:read', 'folder:read']);
  });

  it('posts empty scopes when the Scopes box is cleared', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    await user.clear(screen.getByLabelText('Scopes'));

    const written = await save(user, onSubmit);
    expect(written.scopes).toEqual([]);
  });

  it('warns that the saved secret will be removed when the endpoint changes without a new secret', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user);

    expect(screen.queryByTestId('mcp-oauth-secret-will-drop')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/endpoint must be an absolute uri/i), '/v2');
    expect(screen.getByTestId('mcp-oauth-secret-will-drop')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Client Secret'), 'again');
    expect(screen.queryByTestId('mcp-oauth-secret-will-drop')).not.toBeInTheDocument();
  });

  it('the Connection Mode auto-save never posts hasClientSecret', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user, { mcpOAuthConnectionId: CONNECTION_ID });

    await user.click(screen.getByLabelText(/connection mode/i));
    await user.click(await screen.findByRole('option', { name: /shared \(tenant-wide\)/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const written = JSON.parse(onSubmit.mock.calls[0][0].config);
    expect(written.oAuthScope).toBe('Shared');
    expect(written).not.toHaveProperty('hasClientSecret');
    expect(written).not.toHaveProperty('clientSecret');
  });

  it('disables Connect with a reason while client credentials are unsaved, and re-enables it once saved', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { mcpOAuthConnectionId: CONNECTION_ID });

    const connect = screen.getByRole('button', { name: /^connect$/i });
    expect(connect).toBeEnabled();

    await user.type(screen.getByLabelText('Client Secret'), 'n3w');
    expect(connect).toBeDisabled();
    expect(screen.getByText(SAVE_BEFORE_CONNECTING)).toBeInTheDocument();

    simulateSaved();

    expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
    expect(screen.queryByText(SAVE_BEFORE_CONNECTING)).not.toBeInTheDocument();
    // Whether connections were reset is the edit page's call (on a successful save), not ToolForm's.
    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
  });

  it('disables Connect while only the scopes are unsaved, without reporting reset connections after saving', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { mcpOAuthConnectionId: CONNECTION_ID });

    await user.type(screen.getByLabelText('Scopes'), ' asset:read');
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeDisabled();

    simulateSaved();

    expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
  });

  it('shows the reset notice only when the page says connections were reset, hiding it while new edits are unsaved', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { mcpOAuthConnectionId: CONNECTION_ID, mcpConnectionsReset: true });

    expect(screen.getByText(CONNECTIONS_RESET)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Client ID'), '-v3');
    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
  });

  it('never shows the reset notice by itself, e.g. right after loading a saved tool', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { mcpOAuthConnectionId: CONNECTION_ID });

    expect(screen.queryByText(CONNECTIONS_RESET)).not.toBeInTheDocument();
  });

  it('a whitespace-only secret does not cancel a pending Clear', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSavedTool(user);

    await user.click(screen.getByRole('button', { name: /clear saved client secret/i }));
    await user.type(screen.getByLabelText('Client Secret'), '   ');
    expect(screen.getByText('Will be removed when you save.')).toBeInTheDocument();

    const written = await save(user, onSubmit);
    expect(written.clearClientSecret).toBe(true);
    expect(written).not.toHaveProperty('clientSecret');
  });

  it('disables Connect while an endpoint edit is unsaved, and re-enables it once saved', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { mcpOAuthConnectionId: CONNECTION_ID });

    await user.type(screen.getByPlaceholderText(/endpoint must be an absolute uri/i), '/v2');
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeDisabled();
    expect(screen.getByText(SAVE_BEFORE_CONNECTING)).toBeInTheDocument();

    simulateSaved();

    expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
  });

  it('does not gate Connect on unrelated edits', async () => {
    const user = userEvent.setup();
    await renderSavedTool(user, { mcpOAuthConnectionId: CONNECTION_ID });

    await user.type(screen.getByPlaceholderText(/mcp server id/i), '-x');

    expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
  });
});
