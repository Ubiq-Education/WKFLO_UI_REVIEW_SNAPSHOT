import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataContext } from '@shared/models/chat-models';

const { state, addMutate, removeMutate } = vi.hoisted(() => ({
  state: { entries: [] as unknown[] },
  addMutate: vi.fn(),
  removeMutate: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-tenant-access-admin', () => ({
  useTenantAccess: () => ({ data: state.entries, isPending: false, isError: false }),
  useAllTenants: () => ({
    data: [
      { id: '1', name: 'Workspace One', guid: 'guid-1' },
      { id: '2', name: 'Workspace Two', guid: 'guid-2' },
    ],
  }),
  useAddTenantAccess: () => ({ mutate: addMutate, isPending: false }),
  useRemoveTenantAccess: () => ({ mutate: removeMutate, isPending: false }),
}));

import TenantAccessList from './tenant-access-list';

function ui(selectedTenantGuid: string) {
  return (
    <DataContext.Provider value={{ selectedTenantGuid } as unknown as React.ContextType<typeof DataContext>}>
      <TenantAccessList />
    </DataContext.Provider>
  );
}

beforeEach(() => {
  addMutate.mockReset();
  removeMutate.mockReset();
  state.entries = [
    { id: 10, tenantGuid: 'guid-1', tenantName: 'Workspace One', email: 'alpha@example.com', createdBy: null, createdOn: '2026-01-01T00:00:00Z' },
    { id: 11, tenantGuid: 'guid-2', tenantName: 'Workspace Two', email: 'beta@example.com', createdBy: 'x@example.com', createdOn: '2026-01-02T00:00:00Z' },
    { id: 12, tenantGuid: 'guid-1', tenantName: 'Workspace One', email: 'gamma@example.com', createdBy: null, createdOn: '2026-01-03T00:00:00Z' },
  ];
});

describe('TenantAccessList', () => {
  it('shows only the selected header tenant, named in the title, without its own tenant pickers', () => {
    render(ui('guid-1'));

    expect(screen.getByText('Who can access Workspace One')).toBeInTheDocument();
    expect(screen.getByText('alpha@example.com')).toBeInTheDocument();
    expect(screen.getByText('gamma@example.com')).toBeInTheDocument();
    expect(screen.queryByText('beta@example.com')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Tenant')).toBeNull();
    expect(screen.getByText(/top bar/)).toBeInTheDocument();
  });

  it('updates the list and title when the header tenant switches', () => {
    const { rerender } = render(ui('guid-1'));
    rerender(ui('guid-2'));

    expect(screen.getByText('Who can access Workspace Two')).toBeInTheDocument();
    expect(screen.getByText('beta@example.com')).toBeInTheDocument();
    expect(screen.queryByText('alpha@example.com')).toBeNull();
  });

  it('filters the selected tenant rows by email search', async () => {
    const user = userEvent.setup();
    render(ui('guid-1'));

    await user.type(screen.getByLabelText('Search by email'), 'GAMMA');
    expect(screen.getByText('gamma@example.com')).toBeInTheDocument();
    expect(screen.queryByText('alpha@example.com')).toBeNull();
  });

  it('adds access for the selected header tenant', async () => {
    const user = userEvent.setup();
    const { rerender } = render(ui('guid-1'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Add access' }));
    await vi.waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toEqual({ tenantGuid: 'guid-1', email: 'new@example.com' });

    rerender(ui('guid-2'));
    await user.clear(screen.getByPlaceholderText('user@example.com'));
    await user.type(screen.getByPlaceholderText('user@example.com'), 'other@example.com');
    await user.click(screen.getByRole('button', { name: 'Add access' }));
    await vi.waitFor(() => expect(addMutate).toHaveBeenCalledTimes(2));
    expect(addMutate.mock.calls[1][0]).toEqual({ tenantGuid: 'guid-2', email: 'other@example.com' });
  });

  it('validates the email before adding', async () => {
    const user = userEvent.setup();
    render(ui('guid-1'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Add access' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(addMutate).not.toHaveBeenCalled();
  });

  it('disables the add form and shows a hint when no tenant is selected', () => {
    render(ui(''));

    expect(screen.getByText('Select a tenant in the top bar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add access' })).toBeDisabled();
    expect(screen.getByPlaceholderText('user@example.com')).toBeDisabled();
    expect(screen.queryByText('alpha@example.com')).toBeNull();
  });

  it('closes a pending remove dialog when the tenant switches, without deleting anything', async () => {
    const user = userEvent.setup();
    const { rerender } = render(ui('guid-1'));

    await user.click(screen.getByRole('button', { name: 'Remove alpha@example.com' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/switch to Workspace One/)).toBeInTheDocument();

    rerender(ui('guid-2'));

    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(removeMutate).not.toHaveBeenCalled();
  });

  it('confirms before removing a row',async () => {
    const user = userEvent.setup();
    render(ui('guid-1'));

    await user.click(screen.getByRole('button', { name: 'Remove alpha@example.com' }));
    expect(removeMutate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(removeMutate.mock.calls[0][0]).toBe(10);
  });
});
