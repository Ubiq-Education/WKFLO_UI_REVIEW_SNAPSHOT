import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DataContext } from '@shared/models/chat-models';

const { permissions, tenantStore } = vi.hoisted(() => ({
  permissions: { isSuperPowerUser: false, accessibleTenantGuids: [] as string[], isLoading: false },
  tenantStore: { guid: '', cleared: 0 },
}));
vi.mock('@/hooks/use-super-power-user', () => ({ useSuperPowerUser: () => ({ ...permissions }) }));
vi.mock('../../hooks/use-auth', () => ({ default: () => 'fake-access-token' }));
// Stable references: the header refetches tenants whenever `accounts` changes identity.
const { msal } = vi.hoisted(() => ({
  msal: {
    instance: { getActiveAccount: () => null, logoutRedirect: () => {} },
    accounts: [{ username: 'user@example.com', name: 'Test User' }],
  },
}));
vi.mock('@azure/msal-react', () => ({ useMsal: () => msal }));
vi.mock('wouter', () => ({ useLocation: () => ['/', vi.fn()] }));
vi.mock('../../lib/tenant-config', () => ({
  getTenantGuid: () => tenantStore.guid,
  setTenantGuid: (g: string) => { tenantStore.guid = g; },
  setTenantName: vi.fn(),
  clearTenant: () => { tenantStore.guid = ''; tenantStore.cleared += 1; },
}));
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ options, value }: { options: { value: string; label: string }[]; value: string }) => (
    <div data-testid="tenant-combobox" data-value={value}>
      {options.map(o => <span key={o.value}>{o.label}</span>)}
    </div>
  ),
}));

import Header from './header';

const tenants = [
  { id: '1', name: 'Workspace One', guid: 'guid-1' },
  { id: '2', name: 'Workspace Two', guid: 'guid-2' },
  { id: '3', name: 'Workspace Three', guid: 'guid-3' },
];

const updateState = vi.fn();

function renderHeader() {
  return render(
    <DataContext.Provider value={{ updateState } as unknown as React.ContextType<typeof DataContext>}>
      <Header />
    </DataContext.Provider>
  );
}

beforeEach(() => {
  permissions.isSuperPowerUser = false;
  permissions.accessibleTenantGuids = [];
  permissions.isLoading = false;
  tenantStore.guid = '';
  tenantStore.cleared = 0;
  updateState.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: tenants }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Header tenant switcher', () => {
  it('lists every tenant for a super power user', async () => {
    permissions.isSuperPowerUser = true;
    renderHeader();

    expect(await screen.findByText('Workspace Three')).toBeInTheDocument();
    expect(screen.getByText('Workspace One')).toBeInTheDocument();
    expect(screen.getByText('Workspace Two')).toBeInTheDocument();
  });

  it('lists only the accessible tenants for everyone else', async () => {
    permissions.accessibleTenantGuids = ['guid-2'];
    renderHeader();

    expect(await screen.findByText('Workspace Two')).toBeInTheDocument();
    expect(screen.queryByText('Workspace One')).toBeNull();
    expect(screen.queryByText('Workspace Three')).toBeNull();
  });

  it('falls back to the first allowed tenant when the stored one is not allowed', async () => {
    tenantStore.guid = 'guid-1';
    permissions.accessibleTenantGuids = ['guid-3', 'guid-2'];
    renderHeader();

    // Order follows the tenants list, so the first allowed tenant is guid-2.
    await waitFor(() => expect(updateState).toHaveBeenCalledWith({ selectedTenantGuid: 'guid-2' }));
    expect(tenantStore.guid).toBe('guid-2');
  });

  it('shows an empty state when no workspace is available', async () => {
    tenantStore.guid = 'guid-1';
    renderHeader();

    expect(await screen.findByText('No workspaces are available. Please contact Support.')).toBeInTheDocument();
    expect(screen.queryByTestId('tenant-combobox')).toBeNull();
    // The stored tenant must go too, or API calls keep sending its guid.
    expect(tenantStore.cleared).toBeGreaterThan(0);
    expect(tenantStore.guid).toBe('');
  });

  it('does not show the emptystate or any tenant while permissions load', async () => {
    permissions.isLoading = true;
    renderHeader();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/No workspaces are available/)).toBeNull();
    expect(screen.queryByText('Workspace One')).toBeNull();
  });
});
