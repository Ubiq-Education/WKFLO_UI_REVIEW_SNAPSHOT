import React, { useRef } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useAutosizeTextarea } from './use-autosize-textarea';

// jsdom never computes real layout, so `scrollHeight` is always 0 by default — it can't
// reproduce the actual browser race (fonts/styles not settled yet right after a reload) that
// occasionally inflates it. Instead, these tests stub scrollHeight to a large value to simulate
// "the environment (falsely) reports a tall content height", and assert the hook's behavior
// around that stub — this is what actually encodes the fix's guarantee: empty content must
// always resolve to minHeight, regardless of whatever scrollHeight happens to read.
function stubScrollHeight(value: number) {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return value;
    },
  });
}

afterEach(() => {
  // Restore the real (jsdom-default) descriptor so later tests/files aren't affected.
  delete (HTMLTextAreaElement.prototype as any).scrollHeight;
});

function TestArea({ value }: { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(ref, value, { minHeight: 40, maxHeight: 155 });
  return <textarea ref={ref} value={value} readOnly />;
}

describe('useAutosizeTextarea — empty-content race (Task 7030 secondary fix)', () => {
  it('forces minHeight for empty content even when scrollHeight (falsely) reports a large value', () => {
    stubScrollHeight(300); // simulates the mount-time measurement race inflating scrollHeight
    const { getByRole } = render(<TestArea value="" />);
    const textarea = getByRole('textbox') as HTMLTextAreaElement;

    expect(textarea.style.height).toBe('40px');
    expect(textarea.style.overflowY).toBe('hidden');
  });

  it('shrinks back to minHeight when content is cleared, even under the same inflated scrollHeight stub', () => {
    stubScrollHeight(300);
    const { getByRole, rerender } = render(<TestArea value="line one\nline two\nline three" />);
    const textarea = getByRole('textbox') as HTMLTextAreaElement;
    // With non-empty content, the stubbed 300 exceeds maxHeight and gets clamped.
    expect(textarea.style.height).toBe('155px');

    rerender(<TestArea value="" />);
    expect(textarea.style.height).toBe('40px');
  });

  it('still clamps to maxHeight for genuinely tall multi-line content (auto-grow unaffected)', () => {
    stubScrollHeight(300);
    const { getByRole } = render(<TestArea value="a\nb\nc\nd\ne\nf\ng" />);
    const textarea = getByRole('textbox') as HTMLTextAreaElement;

    expect(textarea.style.height).toBe('155px');
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('grows to the measured height for moderate multi-line content, within the min/max range', () => {
    stubScrollHeight(80);
    const { getByRole } = render(<TestArea value="two\nlines" />);
    const textarea = getByRole('textbox') as HTMLTextAreaElement;

    expect(textarea.style.height).toBe('80px');
    expect(textarea.style.overflowY).toBe('hidden');
  });
});
