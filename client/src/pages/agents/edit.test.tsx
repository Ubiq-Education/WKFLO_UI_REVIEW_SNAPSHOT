import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext, initialState } from '@shared/models/chat-models';
import type { Agent } from '@shared/schema';
import EditAgent from './edit';

const { apiRequestMock, navigateMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: '5' }],
  useLocation: () => ['/agents/5/edit', navigateMock],
}));

vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: apiRequestMock };
});

// Tags panel runs its own tenant-scoped queries; irrelevant to this form.
vi.mock('@/components/tags/entity-tags-panel', () => ({
  default: () => null,
}));

const TENANT = 'tenant-guid-1';
const TOKEN = 'fake-access-token';

function baseAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 5,
    name: 'Maisy',
    description: 'Assistant agent',
    model: null,
    aiModelId: 1,
    provider: 'openai',
    apiKey: null,
    endpoint: null,
    systemPrompt: 'You are a helpful assistant.',
    additionalInstructions: null,
    isActive: true,
    isPublished: false,
    isShared: false,
    enableSTM: false,
    enableLTM: false,
    enableSpinUpAgents: false,
    createdOn: '2026-01-01T00:00:00Z',
    lastUpdatedOn: null,
    lastRunAt: null,
    lastPublishedOn: null,
    type: null,
    ...overrides,
  };
}

function renderPage(agent: Agent) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData([`/md/api/v1/tenant/agent/${agent.id}`, TOKEN, TENANT], agent);
  queryClient.setQueryData([`/md/api/v1/tenant/agent/${agent.id}/tools`, TOKEN, TENANT], []);
  queryClient.setQueryData(['/md/api/v1/tenant/tools', TOKEN, TENANT], []);
  queryClient.setQueryData(['/md/api/v1/ai-models', TOKEN, TENANT], []);

  const context = { ...initialState, selectedTenantGuid: TENANT, updateState: () => {} };
  render(
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={context}>
        <EditAgent />
      </DataContext.Provider>
    </QueryClientProvider>
  );
}

function lastPutBody() {
  const call = apiRequestMock.mock.calls.find(([method]) => method === 'PUT');
  expect(call).toBeDefined();
  return call![2] as Record<string, unknown>;
}

describe('EditAgent - additional instructions', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ json: async () => ({}) });
    navigateMock.mockReset();
  });

  it('loads additional instructions from the agent and round-trips them unchanged on save', async () => {
    const user = userEvent.setup();
    renderPage(baseAgent({ additionalInstructions: 'Always use a warm, welcoming tone.' }));

    const textarea = await screen.findByLabelText('Additional Instructions');
    expect(textarea).toHaveValue('Always use a warm, welcoming tone.');
    expect(textarea).toHaveAttribute('maxLength', '2000');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(lastPutBody().additionalInstructions).toBe('Always use a warm, welcoming tone.');
  });

  it('sends an empty string (not undefined) when the agent has no additional instructions', async () => {
    const user = userEvent.setup();
    renderPage(baseAgent({ additionalInstructions: null }));

    expect(await screen.findByLabelText('Additional Instructions')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(lastPutBody()).toHaveProperty('additionalInstructions', '');
  });

  it('sends edited additional instructions', async () => {
    const user = userEvent.setup();
    renderPage(baseAgent({ additionalInstructions: 'Old text' }));

    const textarea = await screen.findByLabelText('Additional Instructions');
    await user.clear(textarea);
    await user.type(textarea, 'Keep answers short.');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(lastPutBody().additionalInstructions).toBe('Keep answers short.');
  });
});
