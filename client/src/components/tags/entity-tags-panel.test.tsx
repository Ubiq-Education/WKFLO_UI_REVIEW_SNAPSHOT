import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataContext } from '@shared/models/chat-models';

const { permissions } = vi.hoisted(() => ({ permissions: { isSuperPowerUser: false } }));
vi.mock('@/hooks/use-super-power-user', () => ({
  useSuperPowerUser: () => ({ isSuperPowerUser: permissions.isSuperPowerUser, accessibleTenantGuids: [], isLoading: false }),
}));
vi.mock('@/hooks/use-auth', () => ({ default: () => 'fake-access-token' }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery:() => ({ data: [], isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import EntityTagsPanel from './entity-tags-panel';

function renderPanel() {
  render(
    <DataContext.Provider value={{ selectedTenantGuid: 'guid-1' } as unknown as React.ContextType<typeof DataContext>}>
      <EntityTagsPanel entityType="Agent" entityId={1} />
    </DataContext.Provider>
  );
}

beforeEach(() => {
  permissions.isSuperPowerUser = false;
});

describe('EntityTagsPanel empty state', () => {
  it('links to tag creation for super power users', () => {
    permissions.isSuperPowerUser = true;
    renderPanel();

    expect(screen.getByRole('link', { name: 'Create a tag' })).toHaveAttribute('href', '/tags/create');
  });

  it('does not link to the super-power-user-only tags pages for everyone else', () => {
    renderPanel();

    expect(screen.getByText(/No tags exist yet/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create a tag' })).toBeNull();
  });
});
