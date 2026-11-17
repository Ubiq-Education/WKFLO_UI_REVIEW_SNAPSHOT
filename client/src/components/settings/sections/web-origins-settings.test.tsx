import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataContext } from '@shared/models/chat-models';

const { state } = vi.hoisted(() => ({
  state: { origins: [] as Array<Record<string, unknown>>, isPending: false, isError: false },
}));

vi.mock('@/hooks/use-tenant-web-origins', () => ({
  useTenantWebOrigins: () => ({ data: state.origins, isPending: state.isPending, isError: state.isError, isSuccess: !state.isPending && !state.isError }),
}));
vi.mock('@/hooks/use-tenant-access-admin', () => ({
  useAllTenants: () => ({
    data: [
      { id: '1', name: 'Workspace One', guid: 'guid-1' },
      { id: '2', name: 'Workspace Two', guid: 'guid-2' },
    ],
  }),
}));

import WebOriginsSettings from './web-origins-settings';

function ui(selectedTenantGuid = 'guid-1') {
  return (
    <DataContext.Provider value={{ selectedTenantGuid } as unknown as React.ContextType<typeof DataContext>}>
      <WebOriginsSettings />
    </DataContext.Provider>
  );
}

const row = (host: string) => screen.getByRole('row', { name: new RegExp(host.replace(/\./g, '\\.')) });

beforeEach(() => {
  state.isPending = false;
  state.isError = false;
  state.origins = [
    { id: 1, webOriginType: 'SignalR', name: 'https://live.example.test', isActive: true, isDeleted: false, createdOn: '2026-01-01T00:00:00Z', lastUpdatedOn: '2026-02-01T00:00:00Z' },
    { id: 2, webOriginType: 'SignalR', name: 'https://paused.example.test', isActive: false, isDeleted: false, createdOn: '2026-01-02T00:00:00Z', lastUpdatedOn: null },
    { id: 3, webOriginType: 'SignalR', name: 'https://gone.example.test', isActive: true, isDeleted: true, createdOn: '2026-01-03T00:00:00Z', lastUpdatedOn: null },
    { id: 4, webOriginType: 'Other', name: 'https://other.example.test', isActive: true, isDeleted: false, createdOn: '2026-01-04T00:00:00Z', lastUpdatedOn: null },
  ];
});

describe('WebOriginsSettings', () => {
  it('names the selected tenant in the title and explains the allow-list', () => {
    render(ui('guid-2'));

    expect(screen.getAllByText('Web origins for Workspace Two')[0]).toBeInTheDocument();
    expect(screen.getByText(/accepted from the active SignalR origins of all tenants combined/)).toBeInTheDocument();
    expect(screen.getByText(/ones this tenant contributes/)).toBeInTheDocument();
  });

  it('renders the columns and no write actions', () => {
    render(ui());

    for (const name of ['Type', 'Origin', 'Status', 'In use', 'Added on', 'Updated on']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('marks In use only for active, non-deleted SignalR origins', async () => {
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('switch', { name: 'Show deleted' }));

    expect(within(row('live.example.test')).getByText('Yes')).toBeInTheDocument();
    expect(within(row('paused.example.test')).getByText('No')).toBeInTheDocument();
    expect(within(row('gone.example.test')).getByText('No')).toBeInTheDocument();
    expect(within(row('other.example.test')).getByText('No')).toBeInTheDocument();
  });

  it('shows Active, Inactive and Deleted badges', async () => {
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('switch', { name: 'Show deleted' }));

    expect(within(row('live.example.test')).getByText('Active')).toBeInTheDocument();
    expect(within(row('paused.example.test')).getByText('Inactive')).toBeInTheDocument();
    expect(within(row('gone.example.test')).getByText('Deleted')).toBeInTheDocument();
  });

  it('hides deleted rows until Show deleted is switched on', async () => {
    const user = userEvent.setup();
    render(ui());

    const toggle = screen.getByRole('switch', { name: 'Show deleted' });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText('https://gone.example.test')).toBeNull();
    expect(screen.getByText('https://live.example.test')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('https://gone.example.test')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByText('https://gone.example.test')).toBeNull();
  });

  it('shows a dash when an origin was never updated', () => {
    state.origins = [state.origins[1]];
    render(ui());

    const cells = within(row('paused.example.test')).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('-');
  });

  it('treats the origin type case-insensitively', () => {
    state.origins = [{ ...state.origins[0], webOriginType: 'signalr' }];
    render(ui());

    expect(within(row('live.example.test')).getByText('Yes')).toBeInTheDocument();
  });

  it('shows a dash for an unparseable date', () => {
    state.origins = [{ ...state.origins[0], createdOn: 'not-a-date', lastUpdatedOn: 'also-bad' }];
    render(ui());

    const cells = within(row('live.example.test')).getAllByRole('cell');
    expect(cells[4]).toHaveTextContent('-');
    expect(cells[5]).toHaveTextContent('-');
  });

  it('names the table for assistive technology', () => {
    render(ui());

    expect(screen.getByRole('table', { name: 'Web origins for Workspace One' })).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    state.isPending = true;
    render(ui());

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading web origins');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a destructive alert on error', () => {
    state.isError = true;
    render(ui());

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load web origins. Please contact Support.");
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the empty state when there are no origins', () => {
    state.origins = [];
    render(ui());

    expect(screen.getByText('No web origins found.')).toBeInTheDocument();
  });

  it('shows the empty state when only deleted origins exist and the toggle is off', () => {
    state.origins = [state.origins[2]];
    render(ui());

    expect(screen.getByText('No web origins found.')).toBeInTheDocument();
  });

  it('asks for a tenant when none is selected', () => {
    state.isPending = true;
    render(ui(''));

    expect(screen.getByText('Select a tenant in the top bar.')).toBeInTheDocument();
  });
});
