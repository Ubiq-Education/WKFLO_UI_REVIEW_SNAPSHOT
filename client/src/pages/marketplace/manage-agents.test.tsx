import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ManageMarketplaceAgents from './manage-agents';
import type { MarketplaceAgentCatalogEntry } from '@shared/schema';

// Mirrors this repo's established harness pattern (see ai-credit-form.test.tsx): mock useAuth so
// the page's useQuery is `enabled` and its queryKey token matches what we seed via setQueryData.
vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

beforeAll(() => {
  // jsdom doesn't implement the pointer-capture / scrollIntoView APIs Radix relies on.
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  // @radix-ui/react-avatar's <AvatarImage> tracks load status via an off-DOM `new window.Image()`
  // instance (see its useImageLoadingStatus), not the rendered <img> element's own load event.
  // jsdom never actually fetches image resources, so the real Image never fires load/error and
  // the fallback would render forever. Stub a minimal Image that resolves asynchronously so tests
  // can assert on the real <img> the same way a browser would render it.
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 0;
    private _src = '';
    private listeners: Record<string, Array<() => void>> = {};

    addEventListener(event: string, cb: () => void) {
      (this.listeners[event] ??= []).push(cb);
    }

    removeEventListener(event: string, cb: () => void) {
      this.listeners[event] = (this.listeners[event] ?? []).filter((l) => l !== cb);
    }

    set src(value: string) {
      this._src = value;
      if (!value) return;
      setTimeout(() => {
        this.complete = true;
        this.naturalWidth = 1;
        this.listeners['load']?.forEach((cb) => cb());
      }, 0);
    }

    get src() {
      return this._src;
    }
  }

  vi.stubGlobal('Image', MockImage);
});

function baseAgent(overrides: Partial<MarketplaceAgentCatalogEntry>): MarketplaceAgentCatalogEntry {
  return {
    id: 1,
    name: 'Test Agent',
    description: 'A test agent',
    aiModelId: null,
    aiModelName: null,
    model: null,
    provider: null,
    apiKey: null,
    endpoint: null,
    systemPrompt: null,
    type: null,
    stars: 0,
    installations: 0,
    iconUrl: null,
    enableSTM: false,
    agentTools: null,
    isDeleted: false,
    createdOn: '2026-01-01T00:00:00Z',
    lastUpdatedOn: null,
    tags: [],
    ...overrides,
  };
}

function renderPage(agents: MarketplaceAgentCatalogEntry[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      // No queryFn is registered on this test QueryClient — data is seeded directly via
      // setQueryData below. staleTime: Infinity / refetchOnMount: false stop React Query from
      // treating that seeded data as stale and attempting a real (queryFn-less) background
      // refetch on mount, which would otherwise surface as a "Missing queryFn" error state.
      queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(['/md/api/v1/marketplace/agents', 'fake-access-token'], agents);

  render(
    <QueryClientProvider client={queryClient}>
      <ManageMarketplaceAgents />
    </QueryClientProvider>
  );
}

describe('ManageMarketplaceAgents', () => {
  it('renders an <img> for an agent with an iconUrl', async () => {
    renderPage([
      baseAgent({ id: 1, name: 'Cam — Image Editor', iconUrl: 'https://static.example.com/cam.png' }),
    ]);

    const img = await screen.findByRole('img', { name: 'Cam — Image Editor icon' });
    expect(img).toHaveAttribute('src', 'https://static.example.com/cam.png');
  });

  it('falls back to generated initials when iconUrl is null', () => {
    renderPage([baseAgent({ id: 2, name: 'Tracey Researcher', iconUrl: null })]);

    expect(screen.queryByRole('img', { name: /icon$/i })).not.toBeInTheDocument();
    expect(screen.getByText('TR')).toBeInTheDocument();
  });

  it('falls back to generated initials when iconUrl is an empty string', () => {
    renderPage([baseAgent({ id: 3, name: 'Scout', iconUrl: '' })]);

    expect(screen.queryByRole('img', { name: /icon$/i })).not.toBeInTheDocument();
    expect(screen.getByText('SC')).toBeInTheDocument();
  });

  it('opens the Edit dialog pre-filled with the agent, and Cancel closes it', async () => {
    const user = userEvent.setup();
    renderPage([
      baseAgent({ id: 4, name: 'Scout', description: 'Socials agent', iconUrl: null }),
    ]);

    await user.click(screen.getByRole('button', { name: /edit/i }));

    expect(await screen.findByText('Edit Marketplace Agent')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Scout');
    expect(screen.getByLabelText('Description')).toHaveValue('Socials agent');

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText('Edit Marketplace Agent')).not.toBeInTheDocument();
    });
  });
});
