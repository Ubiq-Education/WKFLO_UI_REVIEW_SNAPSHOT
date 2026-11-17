import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, UseFormReturn } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import ImageGenerationConfigEditor from './image-generation-config-editor';

// US 7562: Google aspect ratio defaults to "Auto (match input image)". Radix Select can't use ""
// as an item value, so the editor maps a sentinel to/from the stored "" without changing the shape.

function renderEditor(initialConfig: object) {
  const formRef: { current: UseFormReturn<any> | null } = { current: null };

  function Harness() {
    const form = useForm<any>({ defaultValues: { config: JSON.stringify(initialConfig) } });
    formRef.current = form;
    return (
      <Form {...form}>
        <ImageGenerationConfigEditor form={form} />
      </Form>
    );
  }

  render(<Harness />);
  const getConfig = () => JSON.parse(formRef.current!.getValues('config'));
  return { getConfig };
}

// Radix Select relies on pointer-capture / scrollIntoView, which jsdom does not implement.
function polyfillRadixSelect() {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
}

describe('ImageGenerationConfigEditor aspect ratio', () => {
  it('shows Auto when the stored aspectRatio is empty', () => {
    renderEditor({ provider: 'google', model: 'm', aspectRatio: '' });

    expect(screen.getByText('Auto (match input image)')).toBeTruthy();
    expect(screen.getByText(/matches the input image's aspect ratio/i)).toBeTruthy();
  });

  it('shows the stored fixed ratio', () => {
    renderEditor({ provider: 'google', model: 'm', aspectRatio: '4:5' });

    expect(screen.getByText('4:5')).toBeTruthy();
    expect(screen.queryByText('Auto (match input image)')).toBeNull();
  });

  it('saves "" when Auto is picked and offers 4:5 and 5:4', async () => {
    polyfillRadixSelect();
    const user = userEvent.setup();
    const { getConfig } = renderEditor({ provider: 'google', model: 'm', aspectRatio: '16:9' });

    const trigger = screen.getByText('16:9').closest('button')!;
    await user.click(trigger);
    expect(screen.getByRole('option', { name: '4:5' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '5:4' })).toBeTruthy();

    await user.click(screen.getByRole('option', { name: 'Auto (match input image)' }));

    await waitFor(() => expect(getConfig().aspectRatio).toBe(''));
  });

  it('shows Auto when aspectRatio is null', () => {
    renderEditor({ provider: 'google', model: 'm', aspectRatio: null });
    expect(screen.getByText('Auto (match input image)')).toBeTruthy();
  });

  it('shows Auto when aspectRatio is missing', () => {
    renderEditor({ provider: 'google', model: 'm' });
    expect(screen.getByText('Auto (match input image)')).toBeTruthy();
  });

  it('saves a fixed ratio picked from Auto', async () => {
    polyfillRadixSelect();
    const user = userEvent.setup();
    const { getConfig } = renderEditor({ provider: 'google', model: 'm', aspectRatio: '' });

    await user.click(screen.getByText('Auto (match input image)').closest('button')!);
    await user.click(screen.getByRole('option', { name: '16:9' }));

    await waitFor(() => expect(getConfig().aspectRatio).toBe('16:9'));
  });

  it('clears aspectRatio when the provider changes', async () => {
    polyfillRadixSelect();
    const user = userEvent.setup();
    const { getConfig } = renderEditor({ provider: 'google', model: 'm', aspectRatio: '16:9' });

    const providerTrigger = screen.getAllByRole('combobox')[0];
    await user.click(providerTrigger);
    await user.click(screen.getByRole('option', { name: /azure/i }));

    await waitFor(() => expect(getConfig().provider).toBe('azure'));
    expect(getConfig().aspectRatio).toBe('');
  });
});
