/**
 * Stand-in for `@azure/msal-browser`, swapped in by e2e/vite.e2e.config.ts for
 * shared/services/auth-service.ts only (the chat's "azure-ad" security mode, which builds its own
 * PublicClientApplication). It re-exports the real package and shadows PublicClientApplication
 * with a class that delegates to the same fake instance the app shell uses, so both share one
 * sign-in state and nothing talks to Entra ID.
 */
import { msalInstance } from "./fake-auth-config";

export * from "@azure/msal-browser";

export class PublicClientApplication {
  /** Set to the config the chat passed in, so a test can assert it. */
  static lastConfig: unknown;

  constructor(config?: unknown) {
    PublicClientApplication.lastConfig = config;
    (window as unknown as { __E2E_MSAL_CONFIG__?: unknown }).__E2E_MSAL_CONFIG__ = config;
  }

  initialize = () => msalInstance.initialize();
  getAllAccounts = () => msalInstance.getAllAccounts();
  getActiveAccount = () => msalInstance.getActiveAccount();
  setActiveAccount = () => msalInstance.setActiveAccount();
  acquireTokenSilent = () => msalInstance.acquireTokenSilent();
  loginPopup = () => msalInstance.loginPopup();
  loginRedirect = () => msalInstance.loginRedirect();
  logoutRedirect = () => msalInstance.logoutRedirect();
  handleRedirectPromise = () => msalInstance.handleRedirectPromise();
  clearCache = () => msalInstance.clearCache();
}
