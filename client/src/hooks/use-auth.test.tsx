import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import useAuth from './use-auth';
import { DataContext, initialState } from '@shared/models/chat-models';

// Deferred so the test controls exactly when the secondary-JWT fetch resolves, to simulate a
// REQUEST_DELEGATED_TOKEN arriving before it does.
let resolveJwtFetch: (() => void) | undefined;

vi.mock('../services/jwt-services', () => ({
  JwtService: class {
    getJwtToken(tenantGuid: string) {
      return new Promise<void>((resolve) => {
        resolveJwtFetch = () => {
          localStorage.setItem('agent-token-' + tenantGuid, 'real-agent-token');
          resolve();
        };
      });
    }
  },
}));

vi.mock('@/lib/config', () => ({
  config: {
    API_URL: 'https://api.example.com',
    MSAL_REDIRECT_URI: 'http://localhost:3000/',
  },
}));

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: {
      getActiveAccount: () => ({ homeAccountId: 'account-1' }),
      acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'app-token' }),
    },
    accounts: [{ homeAccountId: 'account-1' }],
    inProgress: 'none',
  }),
}));

function HookHarness() {
  useAuth();
  return null;
}

function renderHook() {
  return render(
    <DataContext.Provider value={{ ...initialState, selectedTenantGuid: 'tenant-1', updateState: () => {} }}>
      <HookHarness />
    </DataContext.Provider>
  );
}

function postRequestDelegatedToken() {
  const fakeSource = { postMessage: vi.fn() };
  const event = new MessageEvent('message', {
    origin: 'http://localhost:3000',
    data: { type: 'REQUEST_DELEGATED_TOKEN' },
    source: fakeSource as unknown as MessagePort,
  });
  window.dispatchEvent(event);
  return fakeSource;
}

describe('useAuth REQUEST_DELEGATED_TOKEN handling', () => {
  beforeEach(() => {
    localStorage.clear();
    resolveJwtFetch = undefined;
  });

  it('answers a REQUEST_DELEGATED_TOKEN that arrives before the secondary-JWT fetch resolves, once it does', async () => {
    renderHook();

    // Arrives immediately — before the mocked JwtService fetch (still pending, held open by
    // resolveJwtFetch) has resolved. This reproduces the hard-reload race: a same-page consumer
    // (AgentChatInterface's own loadToken effect) can post this before useAuth's MSAL-token ->
    // tenant-guid -> JWT-fetch chain finishes.
    await waitFor(() => expect(resolveJwtFetch).toBeDefined());
    const fakeSource = postRequestDelegatedToken();

    // Not answered yet — the real token isn't known.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fakeSource.postMessage).not.toHaveBeenCalled();

    // Now the fetch resolves.
    resolveJwtFetch!();

    await waitFor(() => {
      expect(fakeSource.postMessage).toHaveBeenCalledWith(
        { type: 'DELEGATED_TOKEN', token: 'real-agent-token' },
        { targetOrigin: 'http://localhost:3000' }
      );
    });
  });

  it('answers a REQUEST_DELEGATED_TOKEN that arrives after the token is already cached', async () => {
    localStorage.setItem('agent-token-tenant-1', 'cached-agent-token');

    renderHook();

    await waitFor(() => {
      const fakeSource = postRequestDelegatedToken();
      return waitFor(() =>
        expect(fakeSource.postMessage).toHaveBeenCalledWith(
          { type: 'DELEGATED_TOKEN', token: 'cached-agent-token' },
          { targetOrigin: 'http://localhost:3000' }
        )
      );
    });
  });
});
