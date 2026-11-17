/**
 * Single source of truth for the app's routes (mirrors client/src/App.tsx), shared by the
 * page-loads, route-guard and navigation specs. Concrete ids point at entities in the mock
 * API's seed data.
 */
export type RouteGuard =
  /** Any signed-in user. */
  | "none"
  /** Super power users only; everyone else is sent to "/". */
  | "super-power-user-home"
  /** Super power users only; everyone else is sent to "/marketplace/browse". */
  | "super-power-user-marketplace"
  /** Super power users only; everyone else is sent to the default settings section. */
  | "super-power-user-settings";

export interface AppRoute {
  /** URL to open, with route params filled from the seed data. */
  path: string;
  /** Text of the page's <h1>. */
  heading: string | RegExp;
  guard: RouteGuard;
}

export const APP_ROUTES: readonly AppRoute[] = [
  { path: "/", heading: "Dashboard", guard: "none" },

  { path: "/agents", heading: "Agents", guard: "none" },
  { path: "/agents/create", heading: "Create New Agent", guard: "none" },
  { path: "/agents/1/edit", heading: "Edit Agent", guard: "none" },
  { path: "/agents/view/1", heading: "E2E Support Agent", guard: "none" },
  { path: "/agents/1/share/chat-ui", heading: "Share Agent - Chat UI", guard: "none" },
  { path: "/agents/1/share/chat-widget", heading: "Share Agent - Chat Widget", guard: "none" },

  { path: "/tools", heading: "Tools", guard: "none" },
  { path: "/tools/create", heading: "Create New Tool", guard: "none" },
  { path: "/tools/1/edit", heading: "Edit Tool", guard: "none" },

  { path: "/tags", heading: "Tags", guard: "super-power-user-home" },
  { path: "/tags/create", heading: "Create New Tag", guard: "super-power-user-home" },
  { path: "/tags/1/edit", heading: "Edit Tag", guard: "super-power-user-home" },

  { path: "/marketplace", heading: "Marketplace", guard: "none" },
  { path: "/marketplace/browse", heading: "Browse Marketplace", guard: "none" },
  { path: "/marketplace/purchases", heading: "My Purchases", guard: "none" },
  { path: "/marketplace/manage-agents", heading: "Manage Marketplace Agents", guard: "super-power-user-marketplace" },

  { path: "/aimodels", heading: "AI Models", guard: "super-power-user-home" },
  { path: "/aimodels/1/ai-credit", heading: "AI Credit Configuration", guard: "super-power-user-home" },

  { path: "/vault", heading: "Vault", guard: "super-power-user-home" },
  { path: "/knowledge", heading: "Knowledge Management", guard: "none" },
  { path: "/audit", heading: "Audit Log", guard: "super-power-user-home" },

  { path: "/settings/general", heading: "Settings", guard: "none" },
  { path: "/settings/super-power-users", heading: "Settings", guard: "super-power-user-settings" },
  { path: "/settings/web-origins", heading: "Settings", guard: "super-power-user-settings" },
];

/** Where a non-super power user lands when a guarded route redirects them. */
export const GUARD_REDIRECTS: Record<Exclude<RouteGuard, "none">, string> = {
  "super-power-user-home": "/",
  "super-power-user-marketplace": "/marketplace/browse",
  "super-power-user-settings": "/settings/general",
};
