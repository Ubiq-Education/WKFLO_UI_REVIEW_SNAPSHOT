import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext, initialState } from '@shared/models/chat-models';
import { getQueryFn } from '@/lib/queryClient';
import { useToolOAuthConnection } from './use-tool-oauth-connection';

// Avoid pulling in the real MSAL dependency chain - only a truthy token is needed.
vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

function wrapper({ children }: { children: React.ReactNode }) {
  // Mirrors the real app's queryClient (lib/queryClient.ts) default queryFn - a fresh
  // QueryClient with no queryFn option has none at all, so the status useQuery would never
  // actually call fetch.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'throw' }), retry: false },
      mutations: { retry: false },
    },
  });
  const context = { ...initialState, selectedTenantGuid: 'tenant-guid-1', updateState: () => {} };
  return (
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={context}>{children}</DataContext.Provider>
    </QueryClientProvider>
  );
}

// WI 7097: the backend's actual contract (confirmed against the wkflo_services worktree,
// after the initial implementation was built against PLAN.md's sketch) uses singular "tool"
// routes and an authenticated GET .../start that returns { authorizationUrl } as JSON rather
// than issuing an HTTP redirect - the UI is responsible for navigating the browser itself.
const connectionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('useToolOAuthConnection', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches status from the singular /tool/{id}/mcp/oauth/status route with Bearer auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'Connected', connectedOnUtc: '2026-08-01T00:00:00Z', reason: null } }),
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId), { wrapper });

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.hasIssue).toBe(false);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain(`/md/api/v1/tenant/tool/${connectionId}/mcp/oauth/status`);
    expect(calledInit.headers.Authorization).toBe('Bearer fake-access-token');
  });

  // Covers the "Known gap" fixed per PLAN.md's Status section: a ToolOAuthToken row can exist
  // (OAuth token exchange succeeded) even though the MCP handshake/call never actually worked
  // (e.g. Humantic's "No active subscription for this account."). The status endpoint now
  // reports this distinctly as "ConnectionIssue" with a `reason`, rather than "Connected".
  it('surfaces status "ConnectionIssue" as hasIssue with its reason, and NOT as isConnected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            status: 'ConnectionIssue',
            connectedOnUtc: '2026-08-01T00:00:00Z',
            reason: 'No active subscription for this account.',
          },
        }),
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId), { wrapper });

    await waitFor(() => expect(result.current.hasIssue).toBe(true));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.reason).toBe('No active subscription for this account.');
  });

  it('connect() GETs the start endpoint with auth headers and opens the returned authorizationUrl (no redirect, no token in the URL)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { authorizationUrl: 'https://mcp.humantic.ai/oauth/authorize?foo=bar' } }),
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId), { wrapper });

    result.current.connect();

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));

    // The status query (enabled by default) also fires in the background, so pick out the
    // specific call made for `start` rather than assuming call order.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const startCall = fetchMock.mock.calls.find((call: any[]) => call[0].includes('/mcp/oauth/start'));
    expect(startCall).toBeTruthy();
    const [calledUrl, calledInit] = startCall!;
    expect(calledUrl).toContain(`/md/api/v1/tenant/tool/${connectionId}/mcp/oauth/start`);
    // No GET body (fetch spec forbids GET/HEAD with a body) and no token/tenant leaked into the URL.
    expect(calledInit.body).toBeUndefined();
    expect(calledUrl).not.toContain('access_token');
    expect(calledUrl).not.toContain('fake-access-token');
    expect(calledInit.headers.Authorization).toBe('Bearer fake-access-token');

    expect(openSpy).toHaveBeenCalledWith(
      'https://mcp.humantic.ai/oauth/authorize?foo=bar',
      '_blank',
      'noopener,noreferrer'
    );
  });

  // Copilot review finding on PR 16000: a failed status fetch previously left `status` undefined
  // with `isLoadingStatus` false, which the panel rendered identically to a legitimate
  // "NotConnected" state — masking real backend/network errors as a confirmed disconnected tool.
  it('exposes a failed status fetch as isStatusError, not as a legitimate NotConnected state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'boom',
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId), { wrapper });

    await waitFor(() => expect(result.current.isStatusError).toBe(true));
    expect(result.current.isLoadingStatus).toBe(false);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.hasIssue).toBe(false);
    expect(result.current.statusError).toBeTruthy();
  });

  // Copilot review finding on PR 16000: the hook exposed connectError but not disconnect
  // failures, so a failed DELETE left the admin with no feedback that the token wasn't cleared.
  it('exposes a failed disconnect() as disconnectError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'boom',
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId), { wrapper });

    result.current.disconnect();

    await waitFor(() => expect(result.current.isDisconnecting).toBe(false));
    expect(result.current.disconnectError).toBeTruthy();
  });

  // Task 7152 (Canva per-user connections): oauthScope is a client-side-only cache-key input
  // (see the hook's doc comment) - it must not change the request URL/headers, since the
  // backend resolves per-user vs per-tenant purely from the bearer token, not from a
  // client-supplied parameter. This proves passing it doesn't regress the existing request shape.
  it('accepts an oauthScope argument without changing the status request URL or headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'NotConnected', connectedOnUtc: null, reason: null } }),
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId, 'PerUser'), { wrapper });

    await waitFor(() => expect(result.current.isLoadingStatus).toBe(false));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain(`/md/api/v1/tenant/tool/${connectionId}/mcp/oauth/status`);
    expect(calledInit.headers.Authorization).toBe('Bearer fake-access-token');
  });

  it('disconnect() calls DELETE on the singular /tool/{id}/mcp/oauth route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: connectionId } }),
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId), { wrapper });

    result.current.disconnect();

    await waitFor(() => expect(result.current.isDisconnecting).toBe(false));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const deleteCall = fetchMock.mock.calls.find((call: any[]) => call[1]?.method === 'DELETE');
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![0]).toContain(`/md/api/v1/tenant/tool/${connectionId}/mcp/oauth`);
    expect(deleteCall![0]).not.toContain('/mcp/oauth/');
  });

  // Regression test (Copilot PR review, WI 7152): the backend resolves Shared-vs-PerUser from
  // whatever is currently persisted in the database, not from the oauthScope argument here - so
  // if the status query fetched while a save persisting a just-changed oauthScope was still in
  // flight, the response could reflect the *previous* mode but get cached under the *new* mode's
  // query key. isSaving=true must pause the query entirely, not just let it fetch anyway.
  it('isSaving=true pauses the status query - no fetch at all while a save is in flight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'NotConnected', connectedOnUtc: null, reason: null } }),
      })
    );

    const { result } = renderHook(() => useToolOAuthConnection(connectionId, 'PerUser', true), { wrapper });

    // Give the query a tick to have fired if it were going to.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.isLoadingStatus).toBe(false);
  });

  it('re-enables and fetches once isSaving flips back to false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'Connected', connectedOnUtc: '2026-08-01T00:00:00Z', reason: null } }),
      })
    );

    const { result, rerender } = renderHook(
      ({ isSaving }) => useToolOAuthConnection(connectionId, 'PerUser', isSaving),
      { wrapper, initialProps: { isSaving: true } }
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();

    rerender({ isSaving: false });

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(fetch).toHaveBeenCalled();
  });
});
