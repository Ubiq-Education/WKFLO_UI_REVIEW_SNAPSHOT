import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import McpOAuthConnectionPanel, { CONNECTIONS_RESET_NOTICE } from './mcp-oauth-connection-panel';
import { useToolOAuthConnection } from '@/hooks/use-tool-oauth-connection';

vi.mock('@/hooks/use-tool-oauth-connection', () => ({
  useToolOAuthConnection: vi.fn(),
}));

const mockedUseToolOAuthConnection = vi.mocked(useToolOAuthConnection);

/** Default return shape for the hook; individual tests override just what they need. */
function hookResult(overrides: Partial<ReturnType<typeof useToolOAuthConnection>> = {}) {
  return {
    status: undefined,
    reason: undefined,
    connectedOnUtc: undefined,
    isLoadingStatus: false,
    isStatusError: false,
    statusError: null,
    isConnected: false,
    hasIssue: false,
    connect: vi.fn(),
    isConnecting: false,
    connectError: null,
    disconnect: vi.fn(),
    isDisconnecting: false,
    disconnectError: null,
    ...overrides,
  } as ReturnType<typeof useToolOAuthConnection>;
}

// WI 7097 follow-up: the status endpoint now distinguishes "ConnectionIssue" (a
// ToolOAuthToken row exists because OAuth succeeded, but the MCP handshake/call never
// actually worked - e.g. Humantic's "No active subscription for this account.") from a
// clean "Connected". This panel must render that as a visibly distinct third state, not
// silently as either "Connected" or "Not connected".
describe('McpOAuthConnectionPanel', () => {
  beforeEach(() => {
    mockedUseToolOAuthConnection.mockReset();
  });

  it('renders the Not connected state with only a Connect button', () => {
    mockedUseToolOAuthConnection.mockReturnValue(hookResult());

    render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
  });

  it('renders the Connected state (green badge) with only a Disconnect button', () => {
    mockedUseToolOAuthConnection.mockReturnValue(hookResult({ isConnected: true, status: 'Connected' }));

    render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

    const badge = screen.getByText('Connected');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('div')).toHaveClass('bg-green-600');
    expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
  });

  it('renders the ConnectionIssue state (orange badge) with its reason and BOTH Disconnect and Reconnect buttons', () => {
    mockedUseToolOAuthConnection.mockReturnValue(
      hookResult({
        hasIssue: true,
        isConnected: false,
        status: 'ConnectionIssue',
        reason: 'No active subscription for this account.',
      })
    );

    render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

    const badge = screen.getByText('Connected — issue');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('div')).toHaveClass('bg-orange-500');

    expect(screen.getByText('No active subscription for this account.')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reconnect$/i })).toBeInTheDocument();
    // Not the "Not connected" state's plain Connect label.
    expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument();
  });

  // Copilot review finding on PR 16000: a failed status fetch previously rendered identically
  // to a legitimate "Not connected" state, masking real backend/network errors.
  it('renders a distinct "Status unavailable" state on a status fetch error, never falling through to Not connected', () => {
    mockedUseToolOAuthConnection.mockReturnValue(
      hookResult({ isStatusError: true, statusError: new Error('500: boom') })
    );

    render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

    const badge = screen.getByText('Status unavailable');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('div')).toHaveClass('bg-destructive');
    expect(screen.getByText('500: boom')).toBeInTheDocument();
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
  });

  // Copilot review finding on PR 16000: disconnect failures were silent - no error was ever
  // shown, so an admin had no way to know the token was not actually cleared.
  it('renders an error message when disconnect() fails', () => {
    mockedUseToolOAuthConnection.mockReturnValue(
      hookResult({ isConnected: true, status: 'Connected', disconnectError: new Error('500: boom') })
    );

    render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

    expect(screen.getByText('Failed to disconnect: 500: boom')).toBeInTheDocument();
  });

  // Task 7152 (Canva per-user connections): oauthScope defaults to "Shared" when the prop is
  // omitted, so every WI 7097-era call site keeps rendering exactly as before this task.
  it('defaults to Shared copy when oauthScope is omitted (WI 7097 call sites unaffected)', () => {
    mockedUseToolOAuthConnection.mockReturnValue(hookResult());

    render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

    expect(screen.getByText('Shared — connects for your whole tenant')).toBeInTheDocument();
    expect(
      screen.getByText('Authorize this tool to call the MCP server. You\'ll be asked to sign in and grant access in a new tab.')
    ).toBeInTheDocument();
  });

  it('renders Per-user copy (Not connected) when oauthScope is "PerUser"', () => {
    mockedUseToolOAuthConnection.mockReturnValue(hookResult());

    render(
      <McpOAuthConnectionPanel
        mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        oauthScope="PerUser"
      />
    );

    expect(screen.getByText('Personal — connects your own account')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Authorize this tool to call the MCP server using your own account. You'll be asked to sign in and grant access in a new tab."
      )
    ).toBeInTheDocument();
  });

  it('renders Per-user copy (Connected) distinguishing "your own account" from a tenant-wide connection', () => {
    mockedUseToolOAuthConnection.mockReturnValue(hookResult({ isConnected: true, status: 'Connected' }));

    render(
      <McpOAuthConnectionPanel
        mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        oauthScope="PerUser"
      />
    );

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(
      screen.getByText('You are authorized to call the MCP server with your own account. Other admins connect separately.')
    ).toBeInTheDocument();
  });

  it('passes oauthScope through to useToolOAuthConnection', () => {
    mockedUseToolOAuthConnection.mockReturnValue(hookResult());

    render(
      <McpOAuthConnectionPanel
        mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        oauthScope="PerUser"
      />
    );

    expect(mockedUseToolOAuthConnection).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'PerUser',
      false
    );
  });

  // Regression test (Copilot PR review, WI 7152): `disabled` (true while an auto-save triggered
  // by a Connection Mode change is in flight) must reach the hook's `isSaving` param too, not
  // just gate the Connect/Disconnect buttons - otherwise the status query could still fetch mid-save
  // and cache a response for the *previous* mode under the *new* mode's query key.
  it('passes disabled through to useToolOAuthConnection as isSaving', () => {
    mockedUseToolOAuthConnection.mockReturnValue(hookResult());

    render(
      <McpOAuthConnectionPanel
        mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        oauthScope="PerUser"
        disabled
      />
    );

    expect(mockedUseToolOAuthConnection).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'PerUser',
      true
    );
  });

  it('clicking Reconnect in the ConnectionIssue state calls connect()', async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    mockedUseToolOAuthConnection.mockReturnValue(
      hookResult({
        hasIssue: true,
        status: 'ConnectionIssue',
        reason: 'No active subscription for this account.',
        connect,
      })
    );

    render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

    await user.click(screen.getByRole('button', { name: /^reconnect$/i }));

    expect(connect).toHaveBeenCalledTimes(1);
  });
  // US 7849: the backend starts the OAuth flow from the saved tool config, so Connect waits
  // until edited client credentials/scopes are saved.
  describe('client credentials gating (US 7849)', () => {
    const reason = 'Save the tool before connecting so the new endpoint, client credentials and scopes are used.';

    it('disables Connect and shows the reason while connectBlockedReason is set', () => {
      mockedUseToolOAuthConnection.mockReturnValue(hookResult());

      render(
        <McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" connectBlockedReason={reason} />
      );

      const connect = screen.getByRole('button', { name: /^connect$/i });
      expect(connect).toBeDisabled();
      expect(connect).toHaveAccessibleDescription(reason);
      expect(screen.getByText(reason)).toBeInTheDocument();
    });

    it('also disables Reconnect, but leaves Disconnect available', () => {
      mockedUseToolOAuthConnection.mockReturnValue(
        hookResult({ hasIssue: true, status: 'ConnectionIssue', reason: 'Nope' })
      );

      render(
        <McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" connectBlockedReason={reason} />
      );

      expect(screen.getByRole('button', { name: /^reconnect$/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeEnabled();
    });

    it('keeps Connect enabled and shows no reason by default', () => {
      mockedUseToolOAuthConnection.mockReturnValue(hookResult());

      render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />);

      expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
      expect(screen.queryByText(reason)).not.toBeInTheDocument();
      expect(screen.queryByText(CONNECTIONS_RESET_NOTICE)).not.toBeInTheDocument();
    });

    it('tells the admin existing connections were reset when connectionsReset is set', () => {
      mockedUseToolOAuthConnection.mockReturnValue(hookResult());

      render(<McpOAuthConnectionPanel mcpOAuthConnectionId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" connectionsReset />);

      expect(screen.getByRole('status')).toHaveTextContent(CONNECTIONS_RESET_NOTICE);
    });
  });
});
