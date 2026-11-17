import { describe, it, expect } from 'vitest';
import { msalConfig } from './authConfig';

// Bug 7147 (follow-up): the earlier fix (PR 16061) stopped ProtectedRoute from racing
// handleRedirectPromise() and stripping the auth response hash, but staging still showed an
// endless reload loop between /login and /index.html after a real, successful Azure AD login.
//
// Root cause: msal-browser's default (navigateToLoginRequestUrl: true) makes
// handleRedirectPromise() perform a hard `window.location.assign()` back to wherever
// loginRedirect() was originally invoked from (`/login` in this app) once it finishes
// processing the auth response. `/login` is a client-side-only (wouter) route with no matching
// static file in the deployed container, so the CDN/nginx 404 on it, get redirected to
// /index.html, and the app can never settle into a known client-side route — perpetuating a
// hard-navigation loop. Setting navigateToLoginRequestUrl: false disables that automatic
// navigation entirely and leaves routing to ProtectedRoute's own client-side redirect logic
// (history.pushState/replaceState via wouter, no reload), which already handles sending an
// authenticated user from /login to / once accounts.length > 0.
describe('msalConfig — post-redirect navigation (Bug 7147 follow-up)', () => {
  it('disables MSAL automatic post-redirect navigation (navigateToLoginRequestUrl: false)', () => {
    expect(msalConfig.auth.navigateToLoginRequestUrl).toBe(false);
  });
});
