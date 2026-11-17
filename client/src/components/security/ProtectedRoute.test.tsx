import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InteractionStatus } from '@azure/msal-browser';

// Bug 7147: this redirect-away-from-/login check used to require
// accounts.length === 1 exactly. MSAL's cache lives in localStorage, so a
// stale second account left over from an earlier session (a previous login
// attempt, a different tenant account, etc.) meant a fully successful login
// could still leave the user stuck on /login forever, since accounts.length
// would be 2+ rather than exactly 1. It must redirect for ANY non-zero
// account count.
let mockAccounts: unknown[] = [];
let mockInProgress: InteractionStatus = InteractionStatus.None;
vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ accounts: mockAccounts, inProgress: mockInProgress }),
}));

vi.mock('../../lib/tenant-config', () => ({
  initializeTenant: vi.fn().mockResolvedValue(undefined),
}));

let mockLocation = '/login';
vi.mock('wouter', () => ({
  useLocation: () => [mockLocation, vi.fn()],
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

import ProtectedRoute from './ProtectedRoute';

describe('ProtectedRoute — redirect-away-from-login account check (Bug 7147)', () => {
  it('redirects away from /login when there is exactly one cached account', () => {
    mockAccounts = [{ username: 'user@example.com' }];
    mockInProgress = InteractionStatus.None;
    mockLocation = '/login';

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    );

    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/');
  });

  it('still redirects away from /login when a stale second cached account is present', () => {
    mockAccounts = [{ username: 'old@example.com' }, { username: 'user@example.com' }];
    mockInProgress = InteractionStatus.None;
    mockLocation = '/login';

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    );

    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/');
  });

  it('redirects to /login when there are no accounts', () => {
    mockAccounts = [];
    mockInProgress = InteractionStatus.None;
    mockLocation = '/';

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    );

    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/login');
  });

  it('renders children once authenticated and already off /login', () => {
    mockAccounts = [{ username: 'user@example.com' }];
    mockInProgress = InteractionStatus.None;
    mockLocation = '/';

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
  });

  it('does not redirect to /login while MSAL is still processing a redirect response, even with zero accounts and no hash yet consumed', () => {
    // The actual Bug 7147 repro: landing back on "/" (the redirectUri) with #code=... in the
    // URL, before MsalProvider's handleRedirectPromise() effect has run. accounts.length is
    // still 0 here — without this guard, the branch below would fire
    // `<Redirect to="/login" replace/>`, stripping the hash via history.replaceState before
    // MSAL ever gets to read it.
    mockAccounts = [];
    mockInProgress = InteractionStatus.HandleRedirect;
    mockLocation = '/';

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
