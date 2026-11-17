import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext } from '@shared/models/chat-models';
import { getQueryFn } from '@/lib/queryClient';
import { TENANT_SETTINGS_URL, useTenantSettings, useUpdateTenantSettings } from './use-tenant-settings';

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
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'throw' }), retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
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

describe('useTenantSettings', () => {
  it('GETs the tenant settings and unwraps the data envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { timeZone: 'Europe/London', timeFormat: '12h' } }));

    const { result } = renderHook(() => useTenantSettings(), { wrapper: createWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ timeZone: 'Europe/London', timeFormat: '12h' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(TENANT_SETTINGS_URL);
    expect(init.headers.Authorization).toBe('Bearer fake-access-token');
  });

  it('does not fetch until a tenant is selected', () => {
    const { result } = renderHook(() => useTenantSettings(), { wrapper: createWrapper(newQueryClient(), '') });

    expect(result.current.isPending).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keys the cache by tenant guid', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { timeZone: 'UTC', timeFormat: '24h' } }));
    const queryClient = newQueryClient();

    const { result } = renderHook(() => useTenantSettings(), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData([TENANT_SETTINGS_URL, 'fake-access-token', TENANT_GUID])).toEqual({
      timeZone: 'UTC',
      timeFormat: '24h',
    });
  });
});

describe('useUpdateTenantSettings', () => {
  it('PUTs the changed settings, updates the cache and refetches', async () => {
    const saved = { timeZone: 'America/New_York', timeFormat: '12h', lastUpdatedOn: '2026-10-15T13:05:00Z' };
    // Fresh Response per call: the PUT and the follow-up refetch each consume a body.
    fetchMock.mockImplementation(async () => jsonResponse({ data: saved }));
    const queryClient = newQueryClient();
    const key = [TENANT_SETTINGS_URL, 'fake-access-token', TENANT_GUID];
    queryClient.setQueryData(key, { timeZone: 'UTC', timeFormat: '24h' });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTenantSettings(), { wrapper: createWrapper(queryClient) });
    result.current.mutate({ timeZone: 'America/New_York', timeFormat: '12h' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(TENANT_SETTINGS_URL);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ timeZone: 'America/New_York', timeFormat: '12h' });
    expect(result.current.data).toEqual(saved);
    expect(queryClient.getQueryData(key)).toEqual(saved);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [TENANT_SETTINGS_URL] });
  });

  it('writes the saved settings to the tenant that started the save, even if the tenant changes meanwhile', async () => {
    const TENANT_B = '00000000-0000-0000-0000-000000000002';
    const saved = { timeZone: 'Asia/Tokyo', timeFormat: '24h' } as const;
    let resolvePut: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePut = resolve; }));
    fetchMock.mockImplementation(async () => jsonResponse({ data: { timeZone: 'UTC', timeFormat: '24h' } }));
    const queryClient = newQueryClient();
    const keyA = [TENANT_SETTINGS_URL, 'fake-access-token', TENANT_GUID];
    const keyB = [TENANT_SETTINGS_URL, 'fake-access-token', TENANT_B];
    queryClient.setQueryData(keyB, { timeZone: 'UTC', timeFormat: '24h' });

    let currentTenant = TENANT_GUID;
    function SwitchableWrapper({ children }: { children: React.ReactNode }) {
      return createWrapper(queryClient, currentTenant)({ children });
    }
    const { result, rerender } = renderHook(() => useUpdateTenantSettings(), { wrapper: SwitchableWrapper });

    result.current.mutate(saved);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    currentTenant = TENANT_B;
    rerender();
    resolvePut(jsonResponse({ data: saved }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(keyA)).toEqual(saved);
    expect(queryClient.getQueryData(keyB)).toEqual({ timeZone: 'UTC', timeFormat: '24h' });
  });

  it('surfaces the server error (e.g. 400 for an invalid time zone)', async () => {
    fetchMock.mockResolvedValue(new Response('Invalid time zone', { status: 400 }));

    const { result } = renderHook(() => useUpdateTenantSettings(), { wrapper: createWrapper(newQueryClient()) });
    result.current.mutate({ timeZone: 'Not/AZone' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('400: Invalid time zone');
  });
});
