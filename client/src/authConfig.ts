// src/authConfig.ts
import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { config } from "@/lib/config";

export const msalConfig = {
  auth: {
    clientId: config.ENTRA_CLIENT_ID || "your-client-id",
    authority: `https://login.microsoftonline.com/${config.ENTRA_TENANT_ID}`,
    redirectUri: config.MSAL_REDIRECT_URI,
    // Bug 7147 (follow-up): MSAL's default (true) makes handleRedirectPromise() perform a hard
    // `window.location.assign()` back to wherever loginRedirect() was originally invoked from —
    // in this app, `/login` (see RedirectClient.handleRedirectPromise() and
    // NavigationClient.navigateInternal()'s defaultNavigateWindow). `/login` is a client-side
    // (wouter) route with no matching static file, so on staging the CDN/nginx return a 404 for
    // it and get redirected to `/index.html`, a path wouter doesn't recognize as any known
    // route — the app never settles and MSAL keeps hard-navigating in a loop. Setting this to
    // false disables MSAL's own post-redirect navigation entirely and leaves routing to
    // ProtectedRoute's existing client-side (history.replaceState-based) logic, which already
    // correctly sends the user to "/" once `accounts.length > 0`.
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
  // Bug 7147: MsalProvider (@azure/msal-react) swallows any error thrown by
  // handleRedirectPromise() without logging it (its own source comment says failures should be
  // surfaced via the LOGIN_FAILURE event instead), and MSAL's internal Logger — a separate
  // channel from that event system, used e.g. by RedirectClient.getRedirectResponse()'s
  // validateInteractionType() catch block — is silent by default unless loggerCallback is
  // configured. Together these made real MSAL failures completely invisible. Warning level
  // keeps this from being noisy while still surfacing genuine problems.
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (_level: LogLevel, message: string, containsPii: boolean) => {
        if (containsPii) {
          return;
        }
        console.warn("[MSAL]", message);
      },
    },
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", config.ENTRA_SCOPE],
};

export const msalInstance = new PublicClientApplication(msalConfig);

// See the system.loggerOptions comment above — this covers the event-based failure channel
// MsalProvider itself doesn't surface.
msalInstance.addEventCallback((event) => {
  if (event.error) {
    console.error("[MSAL]", event.eventType, event.error);
  }
});
