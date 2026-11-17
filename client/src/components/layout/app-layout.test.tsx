import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { permissions, msal, refetch } = vi.hoisted(() => ({
  permissions: { isSuperPowerUser: false, accessibleTenantGuids: [] as string[], isLoading: false, isError: false },
  msal: { accounts: [{ username: 'user@example.com' }] as unknown[] },
  refetch: vi.fn(),
}));
vi.mock('@/hooks/use-super-power-user', () => ({ useSuperPowerUser: () => ({ ...permissions, refetch }) }));
vi.mock('@azure/msal-react', () => ({ useMsal: () => msal }));
vi.mock('./sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('./header', () => ({ default: () => <div data-testid="header" /> }));

import AppLayout from './app-layout';

const EMPTY = 'No workspaces are available. Please contact Support.';

function renderLayout() {
  render(<AppLayout><div>Page content</div></AppLayout>);
}

beforeEach(() => {
  permissions.isSuperPowerUser = false;
  permissions.accessibleTenantGuids = ['guid-1'];
  permissions.isLoading = false;
  permissions.isError = false;
  msal.accounts = [{ username: 'user@example.com' }];
  refetch.mockReset();
});

describe('AppLayout permissions gate', () => {
  it('renders the page once permissions are known', () => {
    renderLayout();

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('shows a spinner instead of the page while permissions load', () => {
    permissions.isLoading = true;
    renderLayout();

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Page content')).toBeNull();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('shows an alert with Retry instead of the page when permissions fail to load', async () => {
    const user = userEvent.setup();
    permissions.isError = true;
    renderLayout();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your permissions. Please contact Support.");
    expect(screen.queryByText('Page content')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('replaces the page with the no-workspaces state, keeping header and sidebar', () => {
    permissions.accessibleTenantGuids = [];
    renderLayout();

    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByText('Page content')).toBeNull();
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('never blocks super power users (who have an empty list)', () => {
    permissions.isSuperPowerUser = true;
    permissions.accessibleTenantGuids = [];
    renderLayout();

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('leaves the page (login) alone while signed out', () => {
    msal.accounts = [];
    permissions.isLoading = true;
    renderLayout();

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});
