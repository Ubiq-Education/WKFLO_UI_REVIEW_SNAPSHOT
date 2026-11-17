import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

const { permissions } = vi.hoisted(() => ({ permissions: { isSuperPowerUser: true } }));
vi.mock('@/hooks/use-super-power-user', () => ({
  useSuperPowerUser: () => ({ isSuperPowerUser: permissions.isSuperPowerUser, accessibleTenantGuids: [], isLoading: false }),
}));
vi.mock('@/hooks/use-auth', () => ({ default: () => 'fake-access-token' }));
vi.mock('wouter', () => ({ useLocation: () => ['/marketplace/browse', vi.fn()] }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import BrowseMarketplace from './browse';

const items = [
  {
    id: 'AIAgent_1', name: 'Sample Agent', description: 'An agent', type: 'Agent', category: 'General',
    price: null, stars: 3, userClickStar: false, userClickInstall: false, downloads: 10, vendor: 'Vendor',
  },
  {
    id: 'Tool_2', name: 'Sample Tool', description: 'A tool', type: 'Tool', category: 'General',
    price: '9.99', stars: 4, userClickStar: false, userClickInstall: true, downloads: 5, vendor: 'Vendor',
  },
];

beforeEach(() => {
  permissions.isSuperPowerUser = true;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: items }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BrowseMarketplace permissions', () => {
  it('shows Install/Re-install and delete icons to super power users, but never Purchase', async () => {
    render(<QueryClientProvider client={queryClient}><BrowseMarketplace /></QueryClientProvider>);

    expect(await screen.findByText('Sample Agent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-install' })).toBeInTheDocument();
    expect(document.querySelectorAll('svg.lucide-trash')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Purchase' })).toBeNull();
    expect(screen.queryByText('9.99')).toBeNull();
  });

  it('hides Install, Re-install, delete icons and Purchase from everyone else', async () => {
    permissions.isSuperPowerUser = false;
    render(<QueryClientProvider client={queryClient}><BrowseMarketplace /></QueryClientProvider>);

    expect(await screen.findByText('Sample Agent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Re-install' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Purchase' })).toBeNull();
    expect(screen.queryByText('9.99')).toBeNull();
    expect(document.querySelectorAll('svg.lucide-trash')).toHaveLength(0);
  });
});
