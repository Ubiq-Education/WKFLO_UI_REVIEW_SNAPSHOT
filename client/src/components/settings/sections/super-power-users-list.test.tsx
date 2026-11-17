import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { listState, addMutate, removeMutate } = vi.hoisted(() => ({
  listState: { data: [] as unknown[] },
  addMutate: vi.fn(),
  removeMutate: vi.fn(),
}));

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: { getActiveAccount: () => null },
    accounts: [{ username: 'Me@Example.com' }],
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-super-power-users-admin', () => ({
  useSuperPowerUsers: () => ({ data: listState.data, isPending: false, isError: false }),
  useAddSuperPowerUser: () => ({ mutate: addMutate, isPending: false }),
  useRemoveSuperPowerUser: () => ({ mutate: removeMutate, isPending: false }),
}));

import SuperPowerUsersList from './super-power-users-list';

beforeEach(() => {
  addMutate.mockReset();
  removeMutate.mockReset();
  listState.data = [
    { id: 1, email: 'me@example.com', createdBy: null, createdOn: '2026-01-01T00:00:00Z' },
    { id: 2, email: 'other@example.com', createdBy: 'me@example.com', createdOn: '2026-02-01T00:00:00Z' },
  ];
});

describe('SuperPowerUsersList', () => {
  it('lists users and disables removing the signed-in user (case-insensitive)', () => {
    render(<SuperPowerUsersList />);

    expect(screen.getByText('other@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove me@example.com' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove other@example.com' })).toBeEnabled();
  });

  it('validates the email before adding', async () => {
    const user = userEvent.setup();
    render(<SuperPowerUsersList />);

    await user.type(screen.getByPlaceholderText('user@example.com'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Add super power user' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(addMutate).not.toHaveBeenCalled();
  });

  it('adds a valid email', async () => {
    const user = userEvent.setup();
    render(<SuperPowerUsersList />);

    await user.type(screen.getByPlaceholderText('user@example.com'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Add super power user' }));

    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate.mock.calls[0][0]).toEqual({ email: 'new@example.com' });
  });

  it('asks for confirmation before removing', async () => {
    const user = userEvent.setup();
    render(<SuperPowerUsersList />);

    await user.click(screen.getByRole('button', { name: 'Remove other@example.com' }));
    expect(removeMutate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(removeMutate).toHaveBeenCalledTimes(1);
    expect(removeMutate.mock.calls[0][0]).toBe(2);
  });
});
