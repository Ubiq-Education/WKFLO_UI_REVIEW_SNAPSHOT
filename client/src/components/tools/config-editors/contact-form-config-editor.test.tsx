import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, UseFormReturn } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import ContactFormConfigEditor from './contact-form-config-editor';

// Bug 7466: the tool's IsActive flag is the only on/off control for the Contact Form tool.
// The editor must not expose a "Once per user" switch and must keep any legacy `enabled`
// key exactly as stored (older per-site CMS versions still read it).

function renderEditor(initialConfig: string) {
  const formRef: { current: UseFormReturn<any> | null } = { current: null };

  function Harness() {
    const form = useForm<any>({ defaultValues: { config: initialConfig } });
    formRef.current = form;
    return (
      <Form {...form}>
        <ContactFormConfigEditor form={form} />
      </Form>
    );
  }

  render(<Harness />);

  const getConfig = () => JSON.parse(formRef.current!.getValues('config'));
  return { getConfig };
}

describe('ContactFormConfigEditor', () => {
  it('does not render a "Once per user" control', () => {
    renderEditor(JSON.stringify({ enabled: true, whenToUse: 'x' }));

    expect(screen.queryByText(/once per user/i)).toBeNull();
    expect(screen.getByText('Mandatory')).toBeTruthy();
  });

  it('preserves an existing enabled:false through load and field edits', async () => {
    const user = userEvent.setup();
    const { getConfig } = renderEditor(
      JSON.stringify({ enabled: false, mandatory: false, whenToUse: 'old' })
    );

    await waitFor(() => expect(getConfig().enabled).toBe(false));

    await user.type(screen.getByPlaceholderText(/Show the contact form when/i), '!');

    await waitFor(() => expect(getConfig().whenToUse).toBe('old!'));
    expect(getConfig().enabled).toBe(false);
  });

  it('preserves an existing enabled:true', async () => {
    const { getConfig } = renderEditor(JSON.stringify({ enabled: true, whenToUse: 'x' }));

    await waitFor(() => expect(getConfig().whenToUse).toBe('x'));
    expect(getConfig().enabled).toBe(true);
  });

  it('does not add enabled to a config that lacks it', async () => {
    const user = userEvent.setup();
    const { getConfig } = renderEditor(JSON.stringify({ mandatory: true, whenToUse: 'x' }));

    await waitFor(() => expect(getConfig().submitButtonText).toBe('Submit'));
    expect('enabled' in getConfig()).toBe(false);

    await user.type(screen.getByPlaceholderText(/Show the contact form when/i), 'y');

    await waitFor(() => expect(getConfig().whenToUse).toBe('xy'));
    expect('enabled' in getConfig()).toBe(false);
    expect(getConfig().mandatory).toBe(true);
  });

  it('falls back to defaults without enabled when the config is not valid JSON', async () => {
    const { getConfig } = renderEditor('not json');

    await waitFor(() => expect(getConfig().submitButtonText).toBe('Submit'));
    expect('enabled' in getConfig()).toBe(false);
  });

  // US 8021: the CMS stores its admin email notification settings in this same config; the
  // WKFlo admin editor has no UI for them and must keep them exactly as stored.
  describe('admin email notification keys (US 8021)', () => {
    it('preserves adminNotificationsEnabled and adminNotificationEmails through load and field edits', async () => {
      const user = userEvent.setup();
      const { getConfig } = renderEditor(
        JSON.stringify({
          adminNotificationsEnabled: true,
          adminNotificationEmails: ['office@example.test', 'admissions@example.test'],
          whenToUse: 'old',
        })
      );

      await waitFor(() => expect(getConfig().submitButtonText).toBe('Submit'));
      expect(getConfig().adminNotificationsEnabled).toBe(true);
      expect(getConfig().adminNotificationEmails).toEqual(['office@example.test', 'admissions@example.test']);

      await user.type(screen.getByPlaceholderText(/Show the contact form when/i), '!');

      await waitFor(() => expect(getConfig().whenToUse).toBe('old!'));
      expect(getConfig().adminNotificationsEnabled).toBe(true);
      expect(getConfig().adminNotificationEmails).toEqual(['office@example.test', 'admissions@example.test']);
    });

    it('preserves a disabled toggle with an empty recipient list', async () => {
      const { getConfig } = renderEditor(
        JSON.stringify({ adminNotificationsEnabled: false, adminNotificationEmails: [], whenToUse: 'x' })
      );

      await waitFor(() => expect(getConfig().submitButtonText).toBe('Submit'));
      expect(getConfig().adminNotificationsEnabled).toBe(false);
      expect(getConfig().adminNotificationEmails).toEqual([]);
    });

    it('does not add the keys to a config that lacks them', async () => {
      const user = userEvent.setup();
      const { getConfig } = renderEditor(JSON.stringify({ mandatory: true, whenToUse: 'x' }));

      await waitFor(() => expect(getConfig().submitButtonText).toBe('Submit'));
      expect('adminNotificationsEnabled' in getConfig()).toBe(false);
      expect('adminNotificationEmails' in getConfig()).toBe(false);

      await user.type(screen.getByPlaceholderText(/Show the contact form when/i), 'y');

      await waitFor(() => expect(getConfig().whenToUse).toBe('xy'));
      expect('adminNotificationsEnabled' in getConfig()).toBe(false);
      expect('adminNotificationEmails' in getConfig()).toBe(false);
    });

    it('does not render any admin notification control', () => {
      renderEditor(JSON.stringify({ adminNotificationsEnabled: true, adminNotificationEmails: ['a@example.test'] }));

      expect(screen.queryByText(/admin/i)).toBeNull();
      expect(screen.queryByText(/notif/i)).toBeNull();
    });
  });
});
