import { useLayoutEffect } from 'react';

interface UseAutosizeTextareaOptions {
  minHeight: number;
  maxHeight: number;
}

// Hand-rolled scrollHeight-based auto-grow, intentionally not using a package like
// react-textarea-autosize — this hook ships inside an embeddable widget bundle, and pulling
// in a dependency for what's a ~15-line effect isn't worth the extra bytes.
export function useAutosizeTextarea(
  ref: React.RefObject<HTMLTextAreaElement>,
  value: string,
  { minHeight, maxHeight }: UseAutosizeTextareaOptions
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Empty content can never legitimately need more than the minimum height, so skip
    // measuring scrollHeight entirely in that case (secondary fix bundled with Task 7030).
    // Measuring scrollHeight right at mount is subject to a real-browser race — fonts/styles
    // not fully settled yet immediately after a page reload can occasionally make scrollHeight
    // read larger than the content actually needs — which then sticks (grows the empty textarea
    // all the way up to maxHeight) since this effect never re-runs on its own once `value`
    // stops changing. Forcing minHeight whenever there's no content sidesteps that race
    // entirely, regardless of its exact cause, without affecting genuine auto-grow for actual
    // multi-line content below.
    if (!value) {
      el.style.height = `${minHeight}px`;
      el.style.overflowY = 'hidden';
      return;
    }

    // Reset height first so scrollHeight reflects the content's natural height, not the
    // previously-applied clamped height (otherwise shrinking on delete would never happen).
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [ref, value, minHeight, maxHeight]);
}
