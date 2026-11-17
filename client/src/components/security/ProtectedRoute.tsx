// client/src/ProtectedRoute.tsx
import React, { useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { Redirect, useLocation } from 'wouter';
import { initializeTenant } from '../../lib/tenant-config';

interface ProtectedRouteProps {
  children: React.ReactNode;
}
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [location] = useLocation();
  const { accounts, inProgress } = useMsal();

  // Initialize tenant configuration only when user is authenticated
  useEffect(() => {
    if (accounts.length > 0) {
      initializeTenant().then(() => {
        console.log('Tenant configuration initialized for authenticated user');
      }).catch((error) => {
        console.warn('Tenant initialization failed for authenticated user:', error);
      });
    }
  }, [accounts.length]);

  // Bug 7147: MsalProvider's own handleRedirectPromise() runs in a useEffect, which fires
  // *after* this component's first render/commit (child effects run before parent effects).
  // On that first render, right after landing back from Microsoft with #code=... in the URL,
  // accounts.length is still 0 (nothing processed yet) and location is "/" (the redirectUri) —
  // tripping the branch below into `<Redirect to="/login" replace/>` via history.replaceState,
  // which strips the hash fragment *before* MsalProvider's effect ever gets to read it. This
  // never mattered for the old popup flow (the main window's location never changed), but it's
  // fatal for loginRedirect. Wait for MSAL to finish initializing/processing any redirect
  // response (same inProgress guard already used in use-auth.ts) before making a routing call.
  if (inProgress !== InteractionStatus.None) {
    return null;
  }

  if (accounts.length === 0 && location != '/login') {
    // User is not logged in, redirect to login
    return <Redirect  to="/login" replace />;
  } else if (accounts.length > 0 && location == '/login') {
    // Bug 7147: this used to require accounts.length === 1 exactly. MSAL's
    // cache lives in localStorage, so a stale second account left over from
    // an earlier session (a previous login attempt, a different tenant
    // account, etc.) meant a fully successful login could still leave the
    // user stuck on /login forever, since accounts.length would be 2+.
    return <Redirect  to="/" replace />;
  }
  // User is logged in, render the child components
  return <>{children}</>;
};
export default ProtectedRoute;