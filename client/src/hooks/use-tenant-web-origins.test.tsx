import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext } from '@shared/models/chat-models';
import { getQueryFn } from '@/lib/queryClient';
import { TENANT_WEB_ORIGINS_URL, useTenantWebOrigins } from './use-tenant-web-origins';

vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

const TENANT_GUID = '00000000-0000-0000-0000-000000000001';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function createWrapper(queryClient: QueryClient, selectedTenantGuid = TENANT_GUID) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <DataContext.Provider value={{ selectedTenantGuid } as React.ContextType<typeof DataContext>}>
          {children}
        </DataContext.Provider>
      </QueryClientProvider>
    );
  };
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: 'throw' }), retry: false, staleTime: Infinity } },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTenantWebOrigins', () => {
  it('GETs the web origins with the bearer token and unwraps the data envelope', async () => {
    const rows = [
      { id: 1, webOriginType: 'SignalR', name: 'https://app.example.test', isActive: true, isDeleted: false, createdOn: '2026-01-01T00:00:00Z', lastUpdatedOn: null },
    ];
    fetchMock.mockResolvedValue(jsonResponse({ data: rows }));

    const { result } = renderHook(() => useTenantWebOrigins(), { wrapper: createWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(TENANT_WEB_ORIGINS_URL);
    expect(init.headers.Authorization).toBe('Bearer fake-access-token');
  });

  it('does not fetch until a tenant is selected', () => {
    const { result } = renderHook(() => useTenantWebOrigins(), { wrapper: createWrapper(newQueryClient(), '') });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a separate cache entry per tenant', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }));
    const queryClient = newQueryClient();

    const first = renderHook(() => useTenantWebOrigins(), { wrapper: createWrapper(queryClient, 'guid-1') });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useTenantWebOrigins(), { wrapper: createWrapper(queryClient, 'guid-2') });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData([TENANT_WEB_ORIGINS_URL, 'fake-access-token', 'guid-1'])).toEqual([]);
    expect(queryClient.getQueryData([TENANT_WEB_ORIGINS_URL, 'fake-access-token', 'guid-2'])).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches on mount even when a cached list is fresh', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }));
    const queryClient = newQueryClient();

    const first = renderHook(() => useTenantWebOrigins(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    renderHook(() => useTenantWebOrigins(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('surfaces a 403 as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: [{ code: 'WKFLOMD1601' }] }, 403));

    const { result } = renderHook(() => useTenantWebOrigins(), { wrapper: createWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
