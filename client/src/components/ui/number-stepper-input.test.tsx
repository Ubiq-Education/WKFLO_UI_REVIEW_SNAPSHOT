import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberStepperInput } from './number-stepper-input';

describe('NumberStepperInput', () => {
  it('renders empty (placeholder) when value is null', () => {
    render(<NumberStepperInput value={null} onChange={vi.fn()} placeholder="No limit" />);
    const input = screen.getByPlaceholderText('No limit') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders the given value', () => {
    render(<NumberStepperInput value={5000} onChange={vi.fn()} />);
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('5000');
  });

  it('disables the decrease button when value is null', () => {
    render(<NumberStepperInput value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Decrease')).toBeDisabled();
  });

  it('increase button starts from min-step when value is null, so the first click lands on min', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberStepperInput value={null} onChange={onChange} min={1} step={1} />);

    await user.click(screen.getByLabelText('Increase'));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('increase button adds step to the current value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberStepperInput value={10} onChange={onChange} step={5} />);

    await user.click(screen.getByLabelText('Increase'));

    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('decrease button subtracts step but never goes below min', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberStepperInput value={3} onChange={onChange} min={1} step={5} />);

    await user.click(screen.getByLabelText('Decrease'));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('clearing the input reports null, not zero or NaN', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberStepperInput value={100} onChange={onChange} />);

    await user.clear(screen.getByRole('spinbutton'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('typing a value below min clamps to min', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberStepperInput value={null} onChange={onChange} min={10} />);

    await user.type(screen.getByRole('spinbutton'), '3');

    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  // Regression guard: FormControl (form.tsx) wraps this component via Radix's Slot, which injects
  // id/aria-describedby/aria-invalid onto its child expecting them to reach a real input - dropping
  // them silently breaks FormLabel's htmlFor association and screen-reader-announced validation text.
  it('forwards id/aria-* and other passthrough props to the underlying input, not the outer container', () => {
    render(
      <NumberStepperInput
        value={5}
        onChange={vi.fn()}
        id="max-output-length"
        aria-describedby="max-output-length-description"
        aria-invalid={true}
        name="maxToolOutputLength"
      />
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('id', 'max-output-length');
    expect(input).toHaveAttribute('aria-describedby', 'max-output-length-description');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('name', 'maxToolOutputLength');
  });

  it('forwards a ref to the underlying <input> element', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<NumberStepperInput ref={ref} value={5} onChange={vi.fn()} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.value).toBe('5');
  });
});
