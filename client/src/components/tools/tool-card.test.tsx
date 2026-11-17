import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Tool } from '@shared/schema';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import ToolCard from './tool-card';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

const { permissions } = vi.hoisted(() => ({ permissions: { isSuperPowerUser: true } }));
vi.mock('@/hooks/use-auth', () => ({ default: () => 'fake-access-token' }));
vi.mock('@/hooks/use-super-power-user', () => ({
  useSuperPowerUser: () => ({ isSuperPowerUser: permissions.isSuperPowerUser, accessibleTenantGuids: [], isLoading: false }),
}));
vi.mock('wouter', () => ({ useLocation: () => ['/tools', vi.fn()] }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: apiRequestMock };
});

const tool = {
  id: 7,
  name: 'Weather API',
  description: 'Answers weather questions',
  type: 'Knowledge',
  config: '{"tags":[]}',
  isActive: true,
  isPublished: false,
  isShared: false,
  createdOn: '2026-01-01T00:00:00Z',
  lastUpdatedOn: null,
  lastPublishedOn: null,
  maxToolOutputLength: 5000,
} as unknown as Tool;

afterEach(() => {
  permissions.isSuperPowerUser = true;
  appQueryClient.clear();
  apiRequestMock.mockReset();
});

// Bug 7871: the backend keeps the stored Max Output Length only when the PUT omits the field, and
// clears it on an explicit null. The enable/disable switch must send only isActive, so it never
// posts a stale cap (or a null) from the card's copy of the tool.
describe('ToolCard — enable/disable switch', () => {
  it.each([false, true])('sends only isActive (listView: %s)', async (listView) => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ json: async () => ({ data: true }) });
    render(
      <QueryClientProvider client={appQueryClient}>
        <ToolCard tool={tool} listView={listView} />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole('switch'));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock).toHaveBeenCalledWith(
      'PUT', '/md/api/v1/tenant/tool/7', { isActive: false }, 'fake-access-token'
    );
  });
});

describe('ToolCard — share to marketplace', () => {
  function renderCard() {
    render(
      <QueryClientProvider client={appQueryClient}>
        <ToolCard tool={tool} listView={false} />
      </QueryClientProvider>
    );
  }

  it('is offered to super power users', () => {
    renderCard();
    expect(screen.getByTitle('Share Tool to Marketplace')).toBeInTheDocument();
  });

  it('is hidden from everyone else, while Publish stays', () => {
    permissions.isSuperPowerUser = false;
    renderCard();
    expect(screen.queryByTitle('Share Tool to Marketplace')).toBeNull();
    expect(screen.getByTitle('Publish Tool')).toBeInTheDocument();
  });
});
