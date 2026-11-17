/**
 * Stand-in for client/src/authConfig.ts, swapped in by e2e/vite.e2e.config.ts. It keeps the
 * real module's exports (msalConfig, loginRequest, msalInstance) but never talks to Entra ID.
 *
 * Sign-in state comes from `window.__E2E_AUTH__` (set per test by an init script). Calling
 * loginRedirect() flips it to signed in for the rest of the browser session, like the real flow
 * landing back on the app with an account in the cache.
 */
import { Logger, LogLevel, type AccountInfo, type AuthenticationResult } from "@azure/msal-browser";

export interface E2EAuthState {
  signedIn: boolean;
  account?: Partial<AccountInfo>;
}

declare global {
  interface Window {
    __E2E_AUTH__?: E2EAuthState;
  }
}

const SIGNED_IN_KEY = "e2e.auth.signedIn";
const SIGNED_OUT_KEY = "e2e.auth.signedOut";
const FAKE_ACCESS_TOKEN = "e2e-access-token";

const DEFAULT_ACCOUNT: AccountInfo = {
  homeAccountId: "e2e-home-account-id",
  localAccountId: "e2e-local-account-id",
  environment: "login.e2e.test",
  tenantId: "e2e-entra-tenant-id",
  username: "e2e.user@example.test",
  name: "E2E User",
};

function isSignedIn(): boolean {
  if (sessionStorage.getItem(SIGNED_OUT_KEY) === "1") return false;
  if (sessionStorage.getItem(SIGNED_IN_KEY) === "1") return true;
  return window.__E2E_AUTH__?.signedIn === true;
}

function currentAccount(): AccountInfo {
  return { ...DEFAULT_ACCOUNT, ...window.__E2E_AUTH__?.account };
}

function accounts(): AccountInfo[] {
  return isSignedIn() ? [currentAccount()] : [];
}

function tokenResult(): AuthenticationResult {
  const account = currentAccount();
  return {
    authority: "https://login.e2e.test",
    uniqueId: account.localAccountId,
    tenantId: account.tenantId,
    scopes: [],
    account,
    idToken: "e2e-id-token",
    idTokenClaims: {},
    accessToken: FAKE_ACCESS_TOKEN,
    fromCache: true,
    expiresOn: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: "Bearer",
    correlationId: "e2e-correlation-id",
  };
}

export const msalConfig = {
  auth: { clientId: "e2e-client-id", authority: "https://login.e2e.test/e2e", redirectUri: "/" },
  cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
};

export const loginRequest = { scopes: ["openid", "profile", "api://e2e/access"] };

// A real Logger (silent) so msal-react's `getLogger().clone(...)` works.
const logger = new Logger({ logLevel: LogLevel.Error, loggerCallback: () => {} }, "e2e-fake-msal", "0.0.0");

let nextCallbackId = 0;
const callbacks = new Map<string, unknown>();

export const msalInstance = {
  initializeWrapperLibrary: () => {},
  getLogger: () => logger,
  addEventCallback: (callback: unknown) => {
    const id = `e2e-callback-${nextCallbackId++}`;
    callbacks.set(id, callback);
    return id;
  },
  removeEventCallback: (id: string) => {
    callbacks.delete(id);
  },
  initialize: async () => {},
  handleRedirectPromise: async () => null,
  getAllAccounts: () => accounts(),
  getActiveAccount: () => accounts()[0] ?? null,
  setActiveAccount: () => {},
  acquireTokenSilent: async () => tokenResult(),
  acquireTokenRedirect: async () => {},
  clearCache: async () => {},
  /** The chat's azure-ad mode signs in with a popup; in the fake it just flips the state. */
  loginPopup: async () => {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    sessionStorage.setItem(SIGNED_IN_KEY, "1");
    return tokenResult();
  },
  loginRedirect: async () => {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    sessionStorage.setItem(SIGNED_IN_KEY, "1");
    window.location.assign("/");
  },
  logoutRedirect: async () => {
    sessionStorage.removeItem(SIGNED_IN_KEY);
    sessionStorage.setItem(SIGNED_OUT_KEY, "1");
    window.location.assign("/login");
  },
};
