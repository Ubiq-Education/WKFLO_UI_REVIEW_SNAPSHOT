import React from 'react';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataContext, initialState } from '@shared/models/chat-models';
import { getQueryFn } from '@/lib/queryClient';
import ToolIntegration from './tool-integration';

vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const AGENT_ID = 1;

const allTools = [
  { id: 11, name: 'Weather API', description: 'weather questions', type: 'HTTP' },
  { id: 13, name: 'Search API', description: 'search questions', type: 'HTTP' },
];

const BASE_PROMPT = 'You are a helpful assistant.';
const WEATHER_SENTENCE = 'Use {{tool:11:Weather API}} to reply weather questions.';

interface ApiOptions {
  prompt?: string;
  linked?: number[];
  failPromptPut?: boolean;
  failUnlink?: boolean;
  /** When set, every agent GET after the first one waits for this promise (a slow refetch). */
  holdAgentRefetch?: Promise<void>;
}

function mockApi(options: ApiOptions = {}) {
  const state = {
    prompt: options.prompt ?? BASE_PROMPT,
    linked: new Set(options.linked ?? [11]),
    agentGets: 0,
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const respond = (ok: boolean, status: number, body: unknown) => ({
      ok, status, statusText: ok ? 'OK' : 'Error',
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response);

    const toolLink = /\/agent\/1\/tool\/(\d+)$/.exec(url);
    if (toolLink && method === 'DELETE') {
      if (options.failUnlink) return respond(false, 500, { message: 'boom' });
      state.linked.delete(Number(toolLink[1]));
      return respond(true, 200, { data: true });
    }
    if (toolLink && method === 'POST') {
      state.linked.add(Number(toolLink[1]));
      return respond(true, 200, { data: true });
    }
    if (method === 'PUT' && url.endsWith(`/agent/${AGENT_ID}`)) {
      if (options.failPromptPut) return respond(false, 500, { message: 'boom' });
      state.prompt = JSON.parse(init!.body as string).systemPrompt;
      return respond(true, 200, { data: true });
    }
    if (url.endsWith(`/agent/${AGENT_ID}/tools/permissions`)) return respond(true, 200, { data: { tools: [] } });
    if (url.endsWith('/md/api/v1/tenant/tools')) return respond(true, 200, { data: allTools });
    if (url.endsWith(`/agent/${AGENT_ID}/tools`)) return respond(true, 200, { data: allTools.filter(t => state.linked.has(t.id)) });
    if (url.endsWith(`/agent/${AGENT_ID}`)) {
      state.agentGets += 1;
      if (state.agentGets > 1 && options.holdAgentRefetch) await options.holdAgentRefetch;
      return respond(true, 200, { data: { id: AGENT_ID, systemPrompt: state.prompt } });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, state };
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'throw' }), retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const context = { ...initialState, selectedTenantGuid: 'tenant-guid-1', updateState: () => {} };
  return render(
    <QueryClientProvider client={queryClient}>
      <DataContext.Provider value={context}>
        <ToolIntegration agentId={AGENT_ID} />
      </DataContext.Provider>
    </QueryClientProvider>
  );
}

function rowFor(name: string) {
  return screen.getByText(name).closest('div.flex.items-center.justify-between') as HTMLElement;
}

const calls = (fetchMock: ReturnType<typeof mockApi>['fetchMock'], method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET').toUpperCase() === method);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toastMock.mockReset();
});

describe('Agent Tools tab — prompt tokens (WI 7447)', () => {
  it('offers Add to Prompt only for linked tools', async () => {
    mockApi();
    renderTab();

    await screen.findByText('Weather API');
    await waitFor(() => expect(within(rowFor('Weather API')).getByRole('button', { name: 'Add to Prompt' })).toBeInTheDocument());
    expect(within(rowFor('Search API')).queryByRole('button', { name: 'Add to Prompt' })).not.toBeInTheDocument();
  });

  it('removes the tool from the prompt when "In Prompt" is clicked', async () => {
    const user = userEvent.setup();
    const { state } = mockApi({ prompt: `${BASE_PROMPT}\n\n${WEATHER_SENTENCE}` });
    renderTab();

    const inPrompt = await screen.findByRole('button', { name: 'Remove Weather API from prompt' });
    await user.click(inPrompt);

    await waitFor(() => expect(state.prompt).toBe(BASE_PROMPT));
    expect(await within(rowFor('Weather API')).findByRole('button', { name: 'Add to Prompt' })).toBeInTheDocument();
  });

  it('removes the token(s) from the prompt before unlinking the tool', async () => {
    const user = userEvent.setup();
    const { fetchMock, state } = mockApi({
      prompt: `${BASE_PROMPT}\n\n${WEATHER_SENTENCE}\n\nAlso try {{tool:11:Old name}} first.`,
    });
    renderTab();

    await screen.findByRole('button', { name: 'Remove Weather API from prompt' });
    await user.click(within(rowFor('Weather API')).getByRole('button', { name: /connected/i }));

    await waitFor(() => expect(state.linked.has(11)).toBe(false));
    expect(state.prompt).toBe(`${BASE_PROMPT}\n\nAlso try first.`);
    const putIndex = fetchMock.mock.calls.findIndex(([, init]) => init?.method === 'PUT');
    const deleteIndex = fetchMock.mock.calls.findIndex(([, init]) => init?.method === 'DELETE');
    expect(putIndex).toBeGreaterThan(-1);
    expect(putIndex).toBeLessThan(deleteIndex);
    // Partial update: only the prompt is sent.
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[putIndex][1]!.body as string))).toEqual(['systemPrompt']);
  });

  it('unlinks without touching the prompt when the tool is not in it', async () => {
    const user = userEvent.setup();
    const { fetchMock, state } = mockApi();
    renderTab();

    await screen.findByText('Weather API');
    await user.click(within(rowFor('Weather API')).getByRole('button', { name: /connected/i }));

    await waitFor(() => expect(state.linked.has(11)).toBe(false));
    expect(calls(fetchMock, 'PUT')).toHaveLength(0);
  });

  it('keeps the tool linked and reports it when the prompt update fails', async () => {
    const user = userEvent.setup();
    const { fetchMock, state } = mockApi({ prompt: `${BASE_PROMPT}\n\n${WEATHER_SENTENCE}`, failPromptPut: true });
    renderTab();

    await screen.findByRole('button', { name: 'Remove Weather API from prompt' });
    await user.click(within(rowFor('Weather API')).getByRole('button', { name: /connected/i }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive',
      description: expect.stringContaining('was not disconnected'),
    })));
    expect(calls(fetchMock, 'DELETE')).toHaveLength(0);
    expect(state.linked.has(11)).toBe(true);
  });

  it('says the prompt was updated when unlinking fails afterwards, and refetches', async () => {
    const user = userEvent.setup();
    const { fetchMock } = mockApi({ prompt: `${BASE_PROMPT}\n\n${WEATHER_SENTENCE}`, failUnlink: true });
    renderTab();

    await screen.findByRole('button', { name: 'Remove Weather API from prompt' });
    const agentGetsBefore = fetchMock.mock.calls.filter(([url, init]) => !init?.method && String(url).endsWith(`/agent/${AGENT_ID}`)).length;
    await user.click(within(rowFor('Weather API')).getByRole('button', { name: /connected/i }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive',
      description: expect.stringContaining('removed from the system prompt, but disconnecting it failed'),
    })));
    await waitFor(() => {
      const agentGetsAfter = fetchMock.mock.calls.filter(([url, init]) => !init?.method && String(url).endsWith(`/agent/${AGENT_ID}`)).length;
      expect(agentGetsAfter).toBeGreaterThan(agentGetsBefore);
    });
  });

  // Regression (pre-PR review): right after a prompt save the agent query still serves the old
  // prompt until its refetch lands. Removing another tool in that window used to build the new
  // prompt from that stale copy and silently drop the text just saved.
  it('keeps a just-added sentence when another tool is removed while the agent refetch is pending', async () => {
    const user = userEvent.setup();
    let releaseRefetch: () => void = () => {};
    const holdAgentRefetch = new Promise<void>(resolve => { releaseRefetch = resolve; });
    const { fetchMock, state } = mockApi({
      prompt: `${BASE_PROMPT}\n\n${WEATHER_SENTENCE}`,
      linked: [11, 13],
      holdAgentRefetch,
    });
    renderTab();

    await user.click(await within(await waitFor(() => rowFor('Search API'))).findByRole('button', { name: 'Add to Prompt' }));
    await waitFor(() => expect(state.prompt).toContain('{{tool:13:Search API}}'));

    // The refetch is still pending: the prompt buttons wait for it instead of acting on old data.
    const removeWeather = screen.getByRole('button', { name: 'Remove Weather API from prompt' });
    await waitFor(() => expect(removeWeather).toBeDisabled());
    expect(within(rowFor('Weather API')).getByRole('button', { name: /connected/i })).toBeDisabled();

    releaseRefetch();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Weather API from prompt' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Remove Weather API from prompt' }));

    await waitFor(() => expect(state.prompt).toBe(`${BASE_PROMPT}\n\nUse {{tool:13:Search API}} to reply search questions.`));
    expect(calls(fetchMock, 'PUT')).toHaveLength(2);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Removed from prompt' }));
  });

  it('builds a disconnect from the latest saved prompt, not the cached one', async () => {
    const user = userEvent.setup();
    let releaseRefetch: () => void = () => {};
    const holdAgentRefetch = new Promise<void>(resolve => { releaseRefetch = resolve; });
    const { state } = mockApi({
      prompt: `${BASE_PROMPT}\n\n${WEATHER_SENTENCE}`,
      linked: [11, 13],
      holdAgentRefetch,
    });
    renderTab();

    await user.click(await within(await waitFor(() => rowFor('Search API'))).findByRole('button', { name: 'Add to Prompt' }));
    await waitFor(() => expect(state.prompt).toContain('{{tool:13:Search API}}'));
    releaseRefetch();

    const disconnect = within(rowFor('Weather API')).getByRole('button', { name: /connected/i });
    await waitFor(() => expect(disconnect).toBeEnabled());
    await user.click(disconnect);

    await waitFor(() => expect(state.linked.has(11)).toBe(false));
    expect(state.prompt).toBe(`${BASE_PROMPT}\n\nUse {{tool:13:Search API}} to reply search questions.`);
  });

  it('reports a failed "In Prompt" removal', async () => {
    const user = userEvent.setup();
    mockApi({ prompt: `${BASE_PROMPT}\n\n${WEATHER_SENTENCE}`, failPromptPut: true });
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Remove Weather API from prompt' }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive',
      description: expect.stringContaining("Couldn't remove Weather API from the system prompt"),
    })));
    expect(screen.getByRole('button', { name: 'Remove Weather API from prompt' })).toBeInTheDocument();
  });
});
