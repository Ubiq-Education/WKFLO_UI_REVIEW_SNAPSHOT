import React, { useState } from 'react';

// Task 7130 Addendum 2: the `/mcp/oauth/start` endpoint requires `AuthorizationMethod.AmaisJwtOnly`,
// which a bare clicked link can't carry (a plain browser navigation sends no Authorization header).
// So this card's button fetches `startPath` itself with the widget's own auth headers (the same
// "public service auth headers" mechanism TextSuggestionCard already receives — see
// chat-messages.tsx), then opens the returned authorizationUrl in a new tab — mirroring
// `useToolOAuthConnection.connect()` on the tenant-dashboard side
// (client/src/hooks/use-tool-oauth-connection.ts), just via the public/widget auth service
// instead of MSAL.
interface McpOAuthReconnectCardProps {
  reconnect: {
    toolName: string;
    startPath: string;
    message: string;
  };
  getAuthHeaders?: () => Promise<Record<string, string>>;
  apiEndpoint?: string;
}

export const McpOAuthReconnectCard: React.FC<McpOAuthReconnectCardProps> = ({
  reconnect,
  getAuthHeaders,
  apiEndpoint,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReconnect = async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const headers = getAuthHeaders ? await getAuthHeaders() : {};
      const response = await fetch(`${apiEndpoint ?? ''}${reconnect.startPath}`, { headers });

      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }

      const wrapper = await response.json();
      const authorizationUrl = wrapper?.data?.authorizationUrl;
      if (!authorizationUrl) {
        throw new Error('The server did not return an authorization URL.');
      }

      window.open(authorizationUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconnection failed. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="wkflo-mcp-oauth-reconnect-card">
      <p className="wkflo-mcp-oauth-reconnect-message">{reconnect.message}</p>

      <button
        type="button"
        className="wkflo-mcp-oauth-reconnect-btn"
        onClick={handleReconnect}
        disabled={isConnecting}
      >
        {isConnecting ? 'Connecting…' : `Reconnect ${reconnect.toolName}`}
      </button>

      {error && <p className="wkflo-mcp-oauth-reconnect-error">{error}</p>}
    </div>
  );
};
