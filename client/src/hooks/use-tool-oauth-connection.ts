import { useContext } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { config } from "@/lib/config";
import { getTenantHeaders } from "@/lib/tenant-config";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";

/**
 * Shape returned by GET /md/api/v1/tenant/tool/{id}/mcp/oauth/status - matches the backend's
 * ToolMcpOAuthStatusResult (AMAIS.WKFLO.MD.Application.Tools.Models), serialized camelCase
 * per this API's default System.Text.Json convention (see e.g. shared/schema.ts's `Tag` type
 * for the same PascalCase-C#-to-camelCase-JSON pattern).
 *
 * "ConnectionIssue" covers the gap noted in PLAN.md's Status section: a `ToolOAuthToken` row
 * can exist (written as soon as the OAuth token exchange succeeds) even though the actual MCP
 * handshake/call never worked (e.g. Humantic's "No active subscription for this account.").
 * `reason` is only populated for that state; `connectedOnUtc` is null unless `status` is
 * "Connected" or "ConnectionIssue" (a token row exists).
 *
 * Task 7152 (per-user connections for Canva - see McpOAuthScope in tool-form.types.ts):
 * confirmed against the real backend (`ToolMcpOAuthStatusResult`) that this response shape is
 * unchanged by per-user support - it carries no scope/owning-user field. The backend resolves
 * per-user vs per-tenant token rows entirely server-side from the bearer token identifying the
 * current user (this hook already sends it, see `authedGet`/`apiRequest` below) plus the tool's
 * configured `oAuthScope`, so the client never needs to know which row it got back.
 */
export interface McpOAuthStatus {
  status: "NotConnected" | "Connected" | "ConnectionIssue";
  connectedOnUtc?: string | null;
  reason?: string | null;
}

/** Shape returned by GET .../mcp/oauth/start (ToolMcpOAuthStartResult). */
interface McpOAuthStartResult {
  authorizationUrl: string;
}

function oauthBasePath(mcpOAuthConnectionId: string) {
  return `/md/api/v1/tenant/tool/${mcpOAuthConnectionId}/mcp/oauth`;
}

/**
 * Authenticated GET matching the exact headers `getQueryFn` (lib/queryClient.ts) sends for
 * every other query in this app (Authorization + tenant headers, no body). Needed here
 * instead of `apiRequest()` because `apiRequest` only attaches the Authorization header when
 * a `data` argument is truthy (see its DELETE-with-`{}` usage in EntityTagsPanel) - and a GET
 * request can't carry a body to trigger that, browsers throw on "GET/HEAD with body".
 */
export async function authedGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(`${config.API_URL}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...getTenantHeaders(),
    },
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  const wrapper = await res.json();
  return wrapper?.data;
}

/**
 * Wraps the MCP OAuth endpoints (WI 7097, Humantic.ai MCP connection):
 * status/start/disconnect/callback are all keyed by the same `mcpOAuthConnectionId` (a GUID,
 * `RunableTool.McpOAuthConnectionId` on the backend - shared by a tenant tool and its published
 * copy, so they share one connection) at `/md/api/v1/tenant/tool/{mcpOAuthConnectionId}/mcp/oauth/*`.
 * That id is provisioned as soon as an OAuth2 MCP tool is saved (see
 * McpOAuthConnectionIdProvisioner on the backend), so it's already present on the tool by the
 * time this hook is ever used - never generated client-side. Follows the same
 * apiRequest/getQueryFn + TanStack Query conventions used elsewhere in this app (see
 * EntityTagsPanel) - the status query is polled on an interval and refetched on window focus,
 * since this app has no postMessage-based OAuth popup callback channel to invalidate the
 * query eagerly instead once the user completes the browser consent that `connect()` opens.
 *
 * `oauthScope` (Task 7152 - see McpOAuthScope/`oAuthScope` in tool-form.types.ts) is the tool's
 * configured Shared/Per-user mode. Confirmed against the real backend: status/start/disconnect
 * take no scope parameter - per-user resolution happens entirely server-side, keyed off the
 * bearer token's user plus the tool's `oAuthScope`. So this is intentionally NOT sent in any
 * request; it's threaded into the status query key purely as a client-side safety net so that
 * editing a tool's mode (Shared -> PerUser or back) without a full page reload re-fetches
 * status under a new cache key rather than momentarily showing another mode's cached result.
 *
 * `isSaving` (Task 7152, Copilot PR review) pauses the status query entirely while true. The
 * backend resolves Shared-vs-PerUser from whatever is currently persisted in the database, not
 * from `oauthScope` here - so if the query key already reflects a just-changed `oauthScope` while
 * the save that persists it is still in flight, a response for the *previous* mode could get
 * fetched and cached under the *new* mode's key. Gating on `isSaving` avoids that window entirely:
 * once saving finishes, the key already reflects the new scope, so the query fetches fresh and
 * correctly the moment it's re-enabled - no separate invalidate/refetch needed.
 */
export function useToolOAuthConnection(
  mcpOAuthConnectionId: string | null | undefined,
  oauthScope?: "Shared" | "PerUser",
  isSaving?: boolean
) {
  const token = useAuth();
  const context = useContext(DataContext);

  const enabled = !!mcpOAuthConnectionId && !!token && !!context.selectedTenantGuid && !isSaving;
  const statusUrl = mcpOAuthConnectionId ? `${oauthBasePath(mcpOAuthConnectionId)}/status` : "";
  const statusQueryKey = [statusUrl, token, context.selectedTenantGuid, oauthScope];

  const statusQuery = useQuery<McpOAuthStatus>({
    queryKey: statusQueryKey,
    enabled,
    refetchInterval: enabled ? 5000 : false,
    refetchOnWindowFocus: true,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!mcpOAuthConnectionId) throw new Error("Cannot disconnect: tool has not been saved yet.");
      const response = await apiRequest("DELETE", oauthBasePath(mcpOAuthConnectionId), {}, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [statusUrl] });
    },
  });

  /**
   * `start` is a normal authenticated tenant endpoint - unlike `callback` (which the
   * authorization server itself redirects the bare browser to, and so must be unauthenticated)
   * - and it returns the provider's authorize URL as JSON rather than issuing an HTTP redirect
   * itself. So this fetches `start` first (with the app's usual Bearer + tenant headers), then
   * opens the returned `authorizationUrl` in a new tab for the user to complete consent on.
   */
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!mcpOAuthConnectionId) throw new Error("Cannot connect: tool has not been saved yet.");
      const result = await authedGet<McpOAuthStartResult>(`${oauthBasePath(mcpOAuthConnectionId)}/start`, token);
      if (!result?.authorizationUrl) {
        throw new Error("The server did not return an authorization URL.");
      }
      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
      return result;
    },
  });

  const status = statusQuery.data?.status;

  return {
    status,
    reason: statusQuery.data?.reason,
    connectedOnUtc: statusQuery.data?.connectedOnUtc,
    isLoadingStatus: statusQuery.isLoading,
    // A failed status fetch (network/backend error) must be distinguishable from a legitimate
    // "no token row" NotConnected state — the caller needs this to avoid rendering the two the
    // same way and misleading an admin about the real connection health.
    isStatusError: statusQuery.isError,
    statusError: statusQuery.error,
    isConnected: status === "Connected",
    hasIssue: status === "ConnectionIssue",
    connect: connectMutation.mutate,
    isConnecting: connectMutation.isPending,
    connectError: connectMutation.error,
    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
    disconnectError: disconnectMutation.error,
  };
}
