import { describe, it, expect } from 'vitest';
import { getFeatureTypeColor } from './feature-badge';

describe('getFeatureTypeColor', () => {
  it('returns the mapped color for a known feature type', () => {
    expect(getFeatureTypeColor('Text')).toBe('#3b82f6');
  });

  it('returns the fallback color for an unrecognized feature type', () => {
    expect(getFeatureTypeColor('SomethingNew')).toBe('#6b7280');
  });
});
