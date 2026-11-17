import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Bug 7147 (Task 7149): loginPopup relies on MSAL's popup-polling monitor
// (monitorPopupForHash), which breaks against Microsoft's own login pages —
// they send Cross-Origin-Opener-Policy: same-origin, severing the
// opener<->popup relationship and producing `hash_empty_error` regardless of
// this app's (already-correct) redirectUri config. loginRedirect sidesteps
// the popup-monitor entirely, so this test locks in that the login button
// calls loginRedirect (not loginPopup) with the expected request shape.
const loginRedirectMock = vi.fn().mockResolvedValue(undefined);
const loginPopupMock = vi.fn();

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: {
      loginRedirect: loginRedirectMock,
      loginPopup: loginPopupMock,
    },
  }),
}));

import Login from './login';

describe('Login page — handleLogin', () => {
  beforeEach(() => {
    loginRedirectMock.mockClear();
    loginPopupMock.mockClear();
  });

  it('calls instance.loginRedirect (not loginPopup) with the expected request shape when clicked', () => {
    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /log in with azure/i }));

    expect(loginRedirectMock).toHaveBeenCalledTimes(1);
    expect(loginRedirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'select_account' })
    );
    expect(loginPopupMock).not.toHaveBeenCalled();
  });
});
