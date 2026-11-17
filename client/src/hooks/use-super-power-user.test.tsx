import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { useSuperPowerUser } from './use-super-power-user';

vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: 'throw' }), retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSuperPowerUser', () => {
  it('fails closed while loading', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSuperPowerUser(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSuperPowerUser).toBe(false);
    expect(result.current.accessibleTenantGuids).toEqual([]);
  });

  it('returns the permissions from /md/api/v1/me/permissions', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { isSuperPowerUser: false, accessibleTenantGuids: ['guid-a', 'guid-b'] } })
    );
    const { result } = renderHook(() => useSuperPowerUser(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSuperPowerUser).toBe(false);
    expect(result.current.accessibleTenantGuids).toEqual(['guid-a', 'guid-b']);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/md/api/v1/me/permissions');
  });

  it('reports a super power user', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { isSuperPowerUser: true, accessibleTenantGuids: [] } }));
    const { result } = renderHook(() => useSuperPowerUser(), { wrapper });

    await waitFor(() => expect(result.current.isSuperPowerUser).toBe(true));
  });

  it('stays closed when the request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: [] }, 500));
    const { result } = renderHook(() => useSuperPowerUser(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuperPowerUser).toBe(false);
    expect(result.current.accessibleTenantGuids).toEqual([]);
  });
});
