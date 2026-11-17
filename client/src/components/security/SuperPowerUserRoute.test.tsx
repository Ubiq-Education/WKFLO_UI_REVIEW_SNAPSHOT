import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { permissions } = vi.hoisted(() => ({ permissions: { isSuperPowerUser: false, isLoading: false } }));
vi.mock('@/hooks/use-super-power-user', () => ({
  useSuperPowerUser: () => ({ ...permissions, accessibleTenantGuids: [] }),
}));
vi.mock('wouter', () => ({
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

import SuperPowerUserRoute from './SuperPowerUserRoute';

beforeEach(() => {
  permissions.isSuperPowerUser = false;
  permissions.isLoading = false;
});

describe('SuperPowerUserRoute', () => {
  it('renders children for a super power user', () => {
    permissions.isSuperPowerUser = true;
    render(<SuperPowerUserRoute><div>Admin content</div></SuperPowerUserRoute>);
    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });

  it('redirects everyone else to the marketplace browse page', () => {
    render(<SuperPowerUserRoute><div>Admin content</div></SuperPowerUserRoute>);
    expect(screen.queryByText('Admin content')).toBeNull();
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/marketplace/browse');
  });

  it('redirects to a custom target when redirectTo is given', () => {
    render(<SuperPowerUserRoute redirectTo="/"><div>Admin content</div></SuperPowerUserRoute>);
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/');
  });

  it('renders nothing (no redirect, no content) while permissions load', () => {
    permissions.isLoading = true;
    render(<SuperPowerUserRoute><div>Admin content</div></SuperPowerUserRoute>);
    expect(screen.queryByText('Admin content')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});
