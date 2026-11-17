import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoppedDivider } from './stopped-divider';

// US 7502: the divider marking where the user pressed Stop.
describe('StoppedDivider', () => {
  it('shows "Stopped. All agents cancelled." as text screen readers read', () => {
    render(<StoppedDivider />);

    const divider = screen.getByTestId('stopped-divider');
    const text = screen.getByText('Stopped. All agents cancelled.');
    expect(divider).toContainElement(text);
    // No role whose children are presentational (separator, img, presentation, none) and nothing
    // aria-hidden between the text and the page, so the text itself is exposed.
    for (let node: HTMLElement | null = text; node; node = node.parentElement) {
      expect(node).not.toHaveAttribute('aria-hidden', 'true');
      expect(['separator', 'img', 'presentation', 'none']).not.toContain(node.getAttribute('role'));
    }
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('hides the decorative lines and icon from assistive technology', () => {
    render(<StoppedDivider />);

    const divider = screen.getByTestId('stopped-divider');
    const decorative = divider.querySelectorAll('[aria-hidden="true"]');
    // Two lines and the stop icon.
    expect(decorative).toHaveLength(3);
    expect(divider.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('takes the full width with 12px text and an 8px gap', () => {
    render(<StoppedDivider />);

    const divider = screen.getByTestId('stopped-divider');
    expect(divider).toHaveClass('w-full');
    expect(divider.style.fontSize).toBe('12px');
    expect(divider.style.gap).toBe('8px');
  });

  it('shows the full text by default and "Stopped." in the short variant', () => {
    const { rerender } = render(<StoppedDivider />);
    expect(screen.getByTestId('stopped-divider')).toHaveTextContent(/^Stopped\. All agents cancelled\.$/);

    rerender(<StoppedDivider variant="short" />);
    const divider = screen.getByTestId('stopped-divider');
    expect(divider).toHaveTextContent(/^Stopped\.$/);
    expect(screen.queryByText('Stopped. All agents cancelled.')).not.toBeInTheDocument();
    // The short text is just as readable.
    const text = screen.getByText('Stopped.');
    expect(text.closest('[role="separator"], [aria-hidden="true"]')).toBeNull();
  });
});
