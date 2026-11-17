import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToolOAuthConnection } from "@/hooks/use-tool-oauth-connection";

interface McpOAuthConnectionPanelProps {
  mcpOAuthConnectionId: string | null | undefined;
  /**
   * Task 7152: the tool's configured Shared/Per-user mode (see McpOAuthScope in
   * tool-form.types.ts). Defaults to "Shared" so this panel behaves exactly as it did for
   * WI 7097 when the caller doesn't pass it (e.g. any test or call site not yet updated for
   * this task).
   */
  oauthScope?: "Shared" | "PerUser";
  /**
   * Task 7152: true while the tool is being saved (e.g. the Connection Mode selector above just
   * triggered an auto-save - see McpConfigEditor). Disables Connect/Disconnect AND pauses the
   * status query entirely (see useToolOAuthConnection's `isSaving` param) until that write lands -
   * without pausing the query too, a status fetch could still land mid-save and get a response for
   * the *previous* mode cached under the query key for the mode just selected, since the backend
   * resolves Shared-vs-PerUser from the database (McpOAuthScopeResolver), not from this form.
   */
  disabled?: boolean;
  /**
   * US 7849: when set, Connect/Reconnect is disabled and this reason is shown - e.g. the Client
   * ID, Client Secret or Scopes were edited but not saved yet. The backend starts the OAuth flow
   * from the saved tool config, so connecting now would silently use the old values.
   */
  connectBlockedReason?: string | null;
  /**
   * US 7849: true right after a save that changed the client credentials or the endpoint. The backend deletes
   * every existing connection for the tool on such a change, so everyone has to connect again.
   */
  connectionsReset?: boolean;
}

export const CONNECTIONS_RESET_NOTICE =
  "The endpoint or client credentials changed, so existing connections to this tool were reset. Everyone who uses this tool needs to connect again.";

/**
 * OAuth 2.1 connection panel for MCP tools (e.g. Humantic.ai's MCP server, WI 7097; Canva,
 * Task 7152). Edit-page-only (see McpConfigEditor) since it needs a persisted
 * McpOAuthConnectionId to call the backend's oauth/{start,status,disconnect} endpoints against.
 *
 * Four states:
 * - "NotConnected" (from the status endpoint's `status` field): gray badge, Connect button.
 * - "Connected": green badge, Disconnect button.
 * - "ConnectionIssue": a `ToolOAuthToken` row exists (OAuth succeeded) but the MCP
 *   session/handshake never actually worked (e.g. Humantic's "No active subscription for
 *   this account."). Orange badge with the `reason`, plus both Disconnect and a relabeled
 *   "Reconnect" (re-running consent can resolve some failures without a fresh browser
 *   consent, but re-consenting is also a reasonable recovery path either way).
 * - Status fetch failed (network/backend error, not a status the endpoint returned): red
 *   "Status unavailable" badge. Deliberately never falls through to "Not connected" — an
 *   unknown state must not be presented as a confirmed one.
 *
 * Task 7152: when `oauthScope` is "PerUser", the badge/button logic above is unchanged (the
 * backend is expected to resolve status/start/disconnect against whichever user the bearer
 * token belongs to - see useToolOAuthConnection's doc comment), but the descriptive copy below
 * calls out that this is the *current user's own* connection rather than a tenant-wide one, so
 * an admin doesn't mistake "Connected" here for "everyone in the tenant is authorized."
 */
export default function McpOAuthConnectionPanel({
  mcpOAuthConnectionId,
  oauthScope = "Shared",
  disabled = false,
  connectBlockedReason = null,
  connectionsReset = false,
}: McpOAuthConnectionPanelProps) {
  const {
    isConnected,
    hasIssue,
    reason,
    isLoadingStatus,
    isStatusError,
    statusError,
    connect,
    isConnecting,
    connectError,
    disconnect,
    isDisconnecting,
    disconnectError,
  } = useToolOAuthConnection(mcpOAuthConnectionId, oauthScope, disabled);

  const isPerUser = oauthScope === "PerUser";

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Connection</CardTitle>
        <p className="text-xs text-muted-foreground">
          {isPerUser ? "Personal — connects your own account" : "Shared — connects for your whole tenant"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {isLoadingStatus ? (
            <Badge variant="outline" className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking status…
            </Badge>
          ) : isStatusError ? (
            // Deliberately distinct from "Not connected": a failed status fetch is a fetch
            // problem, not a confirmed disconnected state, and must never be presented as one.
            <Badge variant="destructive" className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Status unavailable
            </Badge>
          ) : hasIssue ? (
            <Badge variant="default" className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-500/90">
              <AlertTriangle className="h-3 w-3" />
              Connected — issue
            </Badge>
          ) : isConnected ? (
            <Badge variant="default" className="flex items-center gap-1.5 bg-green-600 hover:bg-green-600/90">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="flex items-center gap-1.5">
              <Circle className="h-3 w-3" />
              Not connected
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {isStatusError
            ? "Couldn't check this tool's connection status. Its actual state may differ from what's shown below."
            : hasIssue
              ? "This tool completed authorization, but the MCP server rejected the connection."
              : isConnected
                ? isPerUser
                  ? "You are authorized to call the MCP server with your own account. Other admins connect separately."
                  : "This tool is authorized to call the MCP server on behalf of your tenant."
                : isPerUser
                  ? "Authorize this tool to call the MCP server using your own account. You'll be asked to sign in and grant access in a new tab."
                  : "Authorize this tool to call the MCP server. You'll be asked to sign in and grant access in a new tab."}
        </p>

        {hasIssue && reason && <p className="text-xs text-destructive">{reason}</p>}

        {isStatusError && statusError && (
          <p className="text-xs text-destructive">{statusError.message}</p>
        )}

        {connectError && (
          <p className="text-xs text-destructive">
            Failed to start the connection: {connectError.message}
          </p>
        )}

        {disconnectError && (
          <p className="text-xs text-destructive">
            Failed to disconnect: {disconnectError.message}
          </p>
        )}

        {disabled && (
          <p className="text-xs text-muted-foreground">Saving the tool before allowing a connection action…</p>
        )}

        {connectionsReset && (
          <p className="text-xs text-amber-700" role="status" data-testid="mcp-oauth-connections-reset">
            {CONNECTIONS_RESET_NOTICE}
          </p>
        )}

        {connectBlockedReason && !disabled && (
          <p className="text-xs text-muted-foreground" id="mcp-oauth-connect-blocked-reason">
            {connectBlockedReason}
          </p>
        )}

        <div className="flex gap-2">
          {(isConnected || hasIssue) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => disconnect()}
              disabled={isDisconnecting || disabled}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting…
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          )}

          {(!isConnected || hasIssue) && (
            <Button
              type="button"
              size="sm"
              variant={hasIssue ? "outline" : "default"}
              onClick={() => connect()}
              disabled={isLoadingStatus || isConnecting || disabled || !!connectBlockedReason}
              aria-describedby={connectBlockedReason && !disabled ? "mcp-oauth-connect-blocked-reason" : undefined}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : hasIssue ? (
                "Reconnect"
              ) : (
                "Connect"
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
