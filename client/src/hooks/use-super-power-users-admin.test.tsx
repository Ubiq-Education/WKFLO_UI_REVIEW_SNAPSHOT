import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('@/hooks/use-auth', () => ({ default: () => 'fake-access-token' }));
vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: apiRequestMock };
});

import { MY_PERMISSIONS_URL } from './use-super-power-user';
import { SUPER_POWER_USERS_URL, useAddSuperPowerUser, useRemoveSuperPowerUser } from './use-super-power-users-admin';
import { TENANT_ACCESS_URL, useAddTenantAccess, useRemoveTenantAccess } from './use-tenant-access-admin';

let queryClient: QueryClient;
let invalidate: ReturnType<typeof vi.spyOn>;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function invalidatedKeys() {
  return invalidate.mock.calls.map((c: unknown[]) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ json: async () => ({ data: { id: 1 } }) });
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  invalidate = vi.spyOn(queryClient, 'invalidateQueries');
});

describe('Super power users admin hooks', () => {
  it('add posts the email and refreshes the list and my permissions', async () => {
    const { result } = renderHook(() => useAddSuperPowerUser(), { wrapper });
    result.current.mutate({ email: 'user@example.com' });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(apiRequestMock).toHaveBeenCalledWith('POST', SUPER_POWER_USERS_URL, { email: 'user@example.com' }, 'fake-access-token');
    expect(invalidatedKeys()).toEqual([SUPER_POWER_USERS_URL, MY_PERMISSIONS_URL]);
  });

  it('remove deletes by id and refreshes the list and my permissions', async () => {
    const { result } = renderHook(() => useRemoveSuperPowerUser(), { wrapper });
    result.current.mutate(5);

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(apiRequestMock.mock.calls[0].slice(0, 2)).toEqual(['DELETE', `${SUPER_POWER_USERS_URL}/5`]);
    expect(invalidatedKeys()).toEqual([SUPER_POWER_USERS_URL, MY_PERMISSIONS_URL]);
  });
});

describe('Tenant access admin hooks', () => {
  it('add posts tenant and email and refreshes the list and my permissions', async () => {
    const { result } = renderHook(() => useAddTenantAccess(), { wrapper });
    result.current.mutate({ tenantGuid: 'guid-1', email: 'user@example.com' });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(apiRequestMock.mock.calls[0].slice(0, 3)).toEqual([
      'POST', TENANT_ACCESS_URL, { tenantGuid: 'guid-1', email: 'user@example.com' },
    ]);
    expect(invalidatedKeys()).toEqual([TENANT_ACCESS_URL, MY_PERMISSIONS_URL]);
  });

  it('remove deletes by id', async () => {
    const { result } = renderHook(() => useRemoveTenantAccess(), { wrapper });
    result.current.mutate(9);

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(apiRequestMock.mock.calls[0].slice(0, 2)).toEqual(['DELETE', `${TENANT_ACCESS_URL}/9`]);
  });
});
