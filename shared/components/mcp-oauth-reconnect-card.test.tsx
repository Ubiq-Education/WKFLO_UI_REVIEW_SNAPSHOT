import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpOAuthReconnectCard } from './mcp-oauth-reconnect-card';

// Task 7130 Addendum 2: the reconnect card's button must fetch the (relative) start path with
// the widget's own auth headers — a bare clicked link can't carry the Authorization header the
// `/mcp/oauth/start` endpoint requires — then open the returned authorizationUrl in a new tab.
// Mirrors `useToolOAuthConnection.connect()`'s pattern on the tenant-dashboard side.

const reconnect = {
  toolName: 'Canva',
  startPath: '/ai/api/v1/agent/share-1/tool/conn-1/mcp/oauth/start',
  message: 'Canva needs to be reconnected to continue using this tool.',
};

describe('McpOAuthReconnectCard', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the message and a reconnect button', () => {
    render(<McpOAuthReconnectCard reconnect={reconnect} apiEndpoint="https://api.example.com" />);

    expect(screen.getByText(reconnect.message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect Canva' })).toBeInTheDocument();
  });

  it('fetches the start path with auth headers and opens the returned authorizationUrl', async () => {
    const user = userEvent.setup();
    const getAuthHeaders = vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: { authorizationUrl: 'https://canva.example.com/authorize' } }),
    } as Response);

    render(
      <McpOAuthReconnectCard
        reconnect={reconnect}
        getAuthHeaders={getAuthHeaders}
        apiEndpoint="https://api.example.com"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Reconnect Canva' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      'https://canva.example.com/authorize',
      '_blank',
      'noopener,noreferrer'
    ));

    expect(getAuthHeaders).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/ai/api/v1/agent/share-1/tool/conn-1/mcp/oauth/start',
      { headers: { Authorization: 'Bearer test-token' } }
    );
  });

  it('shows an inline error and re-enables the button when the response is not ok', async () => {
    const user = userEvent.setup();
    const getAuthHeaders = vi.fn().mockResolvedValue({});
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    render(
      <McpOAuthReconnectCard
        reconnect={reconnect}
        getAuthHeaders={getAuthHeaders}
        apiEndpoint="https://api.example.com"
      />
    );

    const button = screen.getByRole('button', { name: 'Reconnect Canva' });
    await user.click(button);

    await waitFor(() => expect(screen.getByText(/500: Internal Server Error/)).toBeInTheDocument());
    expect(openSpy).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();
  });

  it('shows an inline error and does not crash when fetch throws (network error)', async () => {
    const user = userEvent.setup();
    const getAuthHeaders = vi.fn().mockResolvedValue({});
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network failure'));

    render(
      <McpOAuthReconnectCard
        reconnect={reconnect}
        getAuthHeaders={getAuthHeaders}
        apiEndpoint="https://api.example.com"
      />
    );

    const button = screen.getByRole('button', { name: 'Reconnect Canva' });
    await user.click(button);

    await waitFor(() => expect(screen.getByText('Network failure')).toBeInTheDocument());
    expect(openSpy).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();
  });

  it('shows an inline error when the response is ok but has no authorizationUrl', async () => {
    const user = userEvent.setup();
    const getAuthHeaders = vi.fn().mockResolvedValue({});
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: {} }),
    } as Response);

    render(
      <McpOAuthReconnectCard
        reconnect={reconnect}
        getAuthHeaders={getAuthHeaders}
        apiEndpoint="https://api.example.com"
      />
    );

    const button = screen.getByRole('button', { name: 'Reconnect Canva' });
    await user.click(button);

    await waitFor(() =>
      expect(screen.getByText('The server did not return an authorization URL.')).toBeInTheDocument()
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();
  });
});
