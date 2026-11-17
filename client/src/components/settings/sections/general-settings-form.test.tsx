import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GeneralSettingsForm from './general-settings-form';
import { DATE_FORMATS } from '@shared/utils/format-date-time';
import { generalSettingsFormSchema, type GeneralSettingsFormValues } from './general-settings-form.types';

beforeAll(() => {
  // jsdom doesn't implement the pointer-capture / scrollIntoView APIs Radix and cmdk rely on.
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const SAVED: GeneralSettingsFormValues = { timeZone: 'Europe/London', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' };

function renderForm(props: Partial<React.ComponentProps<typeof GeneralSettingsForm>> = {}) {
  const onSubmit = vi.fn();
  const utils = render(
    <GeneralSettingsForm values={SAVED} onSubmit={onSubmit} isSubmitting={false} {...props} />
  );
  return { ...utils, onSubmit };
}

describe('GeneralSettingsForm', () => {
  it('shows the saved time zone with its GMT offset, date format and time format', () => {
    renderForm();

    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveTextContent('yyyy-MM-dd');

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent(/\(GMT[+-]\d{2}:\d{2}\) Europe\/London/);
    expect(screen.getByRole('radio', { name: /24-hour/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /12-hour/ })).not.toBeChecked();
  });

  it('disables Save and Discard until something changes', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  });

  it('updates the preview live when the time format changes', async () => {
    const user = userEvent.setup();
    renderForm();
    const preview = screen.getByTestId('time-preview');
    expect(preview.textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    await user.click(screen.getByRole('radio', { name: /12-hour/ }));

    expect(preview.textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('lists every whitelisted date format with an example', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('combobox', { name: 'Date format' }));

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent?.split(' (')[0])).toEqual([...DATE_FORMATS]);
    expect(screen.getByRole('option', { name: /^dd\/MM\/yyyy \(\d{2}\/\d{2}\/\d{4}\)$/ })).toBeInTheDocument();
  });

  it('updates the preview live when the date format changes', async () => {
    const user = userEvent.setup();
    renderForm();
    const preview = screen.getByTestId('time-preview');

    await user.click(screen.getByRole('combobox', { name: 'Date format' }));
    await user.click(await screen.findByRole('option', { name: /^ddd, dd MMMM, yyyy/ }));

    expect(preview.textContent).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]+, \d{4} \d{2}:\d{2}$/);
  });

  it('submits the chosen time zone and time format', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('combobox', { name: 'Time zone' }));
    await user.type(screen.getByPlaceholderText('Search time zones...'), 'New_York');
    await user.click(await screen.findByRole('option', { name: /America\/New_York/ }));
    await user.click(screen.getByRole('combobox', { name: 'Date format' }));
    await user.click(await screen.findByRole('option', { name: /^MM\/dd\/yyyy/ }));
    await user.click(screen.getByRole('radio', { name: /12-hour/ }));

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent('America/New_York');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      timeZone: 'America/New_York',
      dateFormat: 'MM/dd/yyyy',
      timeFormat: '12h',
    });
  });

  it('discards unsaved changes', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: /12-hour/ }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByRole('radio', { name: /24-hour/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('resets to new saved values (e.g. after a successful save)', async () => {
    const { rerender, onSubmit } = renderForm();

    rerender(
      <GeneralSettingsForm values={{ timeZone: 'UTC', dateFormat: 'dd/MM/yyyy', timeFormat: '12h' }} onSubmit={onSubmit} isSubmitting={false} />
    );

    await waitFor(() => expect(screen.getByRole('radio', { name: /12-hour/ })).toBeChecked());
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent('(GMT+00:00) UTC');
    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveTextContent('dd/MM/yyyy');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('still shows a saved zone the browser does not list', () => {
    renderForm({ values: { timeZone: 'Asia/Calcutta', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' } });

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveTextContent('Asia/Calcutta');
  });

  it('shows when the settings were last updated, in the saved zone and formats', () => {
    renderForm({ lastUpdatedOn: '2026-10-15T13:05:00Z' });

    expect(screen.getByText('Last updated 2026-10-15 14:05')).toBeInTheDocument();
  });

  it('formats the last updated time with the saved date and time formats', () => {
    renderForm({
      values: { timeZone: 'America/New_York', dateFormat: 'MMM dd, yyyy', timeFormat: '12h' },
      lastUpdatedOn: '2026-10-15T13:05:00Z',
    });

    expect(screen.getByText('Last updated Oct 15, 2026 9:05 AM')).toBeInTheDocument();
  });

  it('shows a spinner and disables the fields while saving', () => {
    renderForm({ isSubmitting: true });

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Date format' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /12-hour/ })).toBeDisabled();
  });
});

describe('generalSettingsFormSchema', () => {
  it('accepts a valid IANA zone, a whitelisted date format and a 12h/24h format', () => {
    expect(
      generalSettingsFormSchema.safeParse({ timeZone: 'Europe/London', dateFormat: 'dd MMMM, yyyy', timeFormat: '12h' }).success
    ).toBe(true);
  });

  it.each([
    [{ timeZone: '', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' }, 'Select a time zone'],
    [{ timeZone: 'Not/AZone', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' }, 'Select a valid time zone'],
    [{ timeZone: 'UTC', dateFormat: 'YYYY-MM-DD', timeFormat: '24h' }, 'Select a date format'],
    [{ timeZone: 'UTC', dateFormat: 'yyyy-MM-dd', timeFormat: '24H' }, 'Select a time format'],
  ])('rejects %j', (input, message) => {
    const result = generalSettingsFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});
