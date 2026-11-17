import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GeneralSettings from './general-settings';

const mocks = vi.hoisted(() => ({
  useTenantSettings: vi.fn(),
  useUpdateTenantSettings: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/use-tenant-settings', () => ({
  useTenantSettings: mocks.useTenantSettings,
  useUpdateTenantSettings: mocks.useUpdateTenantSettings,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function queryState(overrides: Record<string, unknown>) {
  return { data: undefined, isPending: false, isError: false, error: null, isFetching: false, refetch: mocks.refetch, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useUpdateTenantSettings.mockReturnValue({ mutate: mocks.mutate, isPending: false });
});

describe('GeneralSettings', () => {
  it('shows a skeleton while the settings load', () => {
    mocks.useTenantSettings.mockReturnValue(queryState({ isPending: true }));

    render(<GeneralSettings />);

    expect(screen.getByLabelText('Loading settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry button when loading fails', async () => {
    const user = userEvent.setup();
    mocks.useTenantSettings.mockReturnValue(queryState({ isError: true, error: new Error('500: boom') }));

    render(<GeneralSettings />);

    expect(screen.getByText("Couldn't load settings")).toBeInTheDocument();
    expect(screen.getByText('500: boom')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Try again/ }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the saved settings in the form', () => {
    mocks.useTenantSettings.mockReturnValue(
      queryState({ data: { timeZone: 'Europe/London', dateFormat: 'dd/MM/yyyy', timeFormat: '12h' } })
    );

    render(<GeneralSettings />);

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent('Europe/London');
    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveTextContent('dd/MM/yyyy');
    expect(screen.getByRole('radio', { name: /12-hour/ })).toBeChecked();
  });

  it('saves the changes and toasts on success', async () => {
    const user = userEvent.setup();
    mocks.useTenantSettings.mockReturnValue(
      queryState({ data: { timeZone: 'UTC', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' } })
    );
    mocks.mutate.mockImplementation((_values, options) => options.onSuccess());

    render(<GeneralSettings />);
    await user.click(screen.getByRole('combobox', { name: 'Date format' }));
    await user.click(await screen.findByRole('option', { name: /^dd MMM, yyyy/ }));
    await user.click(screen.getByRole('radio', { name: /12-hour/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(mocks.mutate).toHaveBeenCalledWith(
      { timeZone: 'UTC', dateFormat: 'dd MMM, yyyy', timeFormat: '12h' },
      expect.any(Object)
    );
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Settings saved' }));
  });

  it('toasts the server error when saving fails', async () => {
    const user = userEvent.setup();
    mocks.useTenantSettings.mockReturnValue(queryState({ data: { timeZone: 'UTC', timeFormat: '24h' } }));
    mocks.mutate.mockImplementation((_values, options) => options.onError(new Error('400: Invalid time zone')));

    render(<GeneralSettings />);
    await user.click(screen.getByRole('radio', { name: /12-hour/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't save settings",
        description: '400: Invalid time zone',
        variant: 'destructive',
      })
    );
  });

  it('falls back to the server defaults for unexpected values', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.useTenantSettings.mockReturnValue(
      queryState({ data: { timeZone: '', dateFormat: 'weird', timeFormat: 'weird' } })
    );

    render(<GeneralSettings />);

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent('UTC');
    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveTextContent('yyyy-MM-dd');
    expect(screen.getByRole('radio', { name: /24-hour/ })).toBeChecked();
  });

  it('uses the default date format when the server omits it', () => {
    mocks.useTenantSettings.mockReturnValue(queryState({ data: { timeZone: 'UTC', timeFormat: '24h' } }));

    render(<GeneralSettings />);

    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveTextContent('yyyy-MM-dd');
  });
});
