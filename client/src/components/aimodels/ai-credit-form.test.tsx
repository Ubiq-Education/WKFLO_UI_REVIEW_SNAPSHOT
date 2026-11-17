import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AICreditForm from './ai-credit-form';
import { aiCreditFormSchema, type AICreditFormValues } from './ai-credit-form.types';

// AICreditForm itself doesn't call useAuth, but mocking it (and stubbing the jsdom gaps below)
// mirrors this repo's established harness pattern (see tool-form.test.tsx) so any future
// dependency added to this form doesn't silently break the test setup.
vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

beforeAll(() => {
  // jsdom doesn't implement the pointer-capture / scrollIntoView APIs Radix relies on.
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

interface RenderOptions {
  defaultValues?: Partial<AICreditFormValues>;
  isEditMode?: boolean;
  isSubmitting?: boolean;
}

const baseDefaults: AICreditFormValues = {
  aiModelId: 1,
  tokensIn: 0,
  costInMTok: 0,
  tokensOut: 0,
  costOutMTok: 0,
  multiplierIn: 1,
  multiplierOut: 1,
};

function renderAICreditForm(options: RenderOptions = {}) {
  const onSubmit = vi.fn();

  function Harness() {
    const form = useForm<AICreditFormValues>({
      resolver: zodResolver(aiCreditFormSchema),
      defaultValues: { ...baseDefaults, ...options.defaultValues },
    });
    return (
      <AICreditForm
        form={form}
        onSubmit={onSubmit}
        isSubmitting={options.isSubmitting ?? false}
        isEditMode={options.isEditMode ?? false}
      />
    );
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );

  return { onSubmit };
}

describe('AICreditForm', () => {
  it('renders pre-filled values in edit mode', () => {
    renderAICreditForm({
      isEditMode: true,
      defaultValues: {
        tokensIn: 1000000,
        costInMTok: 2.5,
        tokensOut: 500000,
        costOutMTok: 10,
        multiplierIn: 1.5,
        multiplierOut: 2,
      },
    });

    expect(screen.getByLabelText(/tokens in/i)).toHaveValue(1000000);
    expect(screen.getByLabelText(/cost in/i)).toHaveValue(2.5);
    expect(screen.getByLabelText(/tokens out/i)).toHaveValue(500000);
    expect(screen.getByLabelText(/cost out/i)).toHaveValue(10);
    expect(screen.getByLabelText(/multiplier in/i)).toHaveValue(1.5);
    expect(screen.getByLabelText(/multiplier out/i)).toHaveValue(2);

    expect(screen.getByRole('button', { name: /update ai credit/i })).toBeInTheDocument();
  });

  it('shows the multiplier-must-be-positive validation message on bad input and does not submit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderAICreditForm();

    const multiplierInInput = screen.getByLabelText(/multiplier in/i);
    // fireEvent.change sets the full string in one shot - typing char-by-char into a
    // type="number" input via userEvent.type is flaky for decimals in jsdom.
    fireEvent.change(multiplierInInput, { target: { value: '0' } });

    await user.click(screen.getByRole('button', { name: /create ai credit/i }));

    expect(await screen.findByText(/multiplier must be greater than 0/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts a fractional multiplier below 1', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderAICreditForm();

    fireEvent.change(screen.getByLabelText(/multiplier in/i), { target: { value: '0.01' } });
    fireEvent.change(screen.getByLabelText(/multiplier out/i), { target: { value: '0.02' } });

    await user.click(screen.getByRole('button', { name: /create ai credit/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      multiplierIn: 0.01,
      multiplierOut: 0.02,
    });
  });

  it('submits, calling the mutation with the expected payload shape', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderAICreditForm({
      defaultValues: {
        tokensIn: 1000,
        costInMTok: 1,
        tokensOut: 500,
        costOutMTok: 2,
        multiplierIn: 1,
        multiplierOut: 1,
      },
    });

    await user.click(screen.getByRole('button', { name: /create ai credit/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      aiModelId: 1,
      tokensIn: 1000,
      costInMTok: 1,
      tokensOut: 500,
      costOutMTok: 2,
      multiplierIn: 1,
      multiplierOut: 1,
    });
  });
});
