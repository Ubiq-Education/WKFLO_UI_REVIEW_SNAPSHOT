import { describe, it, expect } from 'vitest';
import { normalizeDisplayText, toolDisplayDescription, toolDisplayName } from './tool-display';

describe('normalizeDisplayText', () => {
  it('trims values and turns blank or non-string values into null', () => {
    expect(normalizeDisplayText('  Find documents  ')).toBe('Find documents');
    expect(normalizeDisplayText('   ')).toBeNull();
    expect(normalizeDisplayText('')).toBeNull();
    expect(normalizeDisplayText(null)).toBeNull();
    expect(normalizeDisplayText(undefined)).toBeNull();
    expect(normalizeDisplayText(42)).toBeNull();
  });
});

describe('toolDisplayName', () => {
  it('uses the friendly name when set', () => {
    expect(toolDisplayName({ name: 'search_docs', displayName: 'Find documents' })).toBe('Find documents');
  });

  it('falls back to the original name when the friendly name is missing or blank', () => {
    expect(toolDisplayName({ name: 'search_docs' })).toBe('search_docs');
    expect(toolDisplayName({ name: 'search_docs', displayName: null })).toBe('search_docs');
    expect(toolDisplayName({ name: 'search_docs', displayName: '  ' })).toBe('search_docs');
  });
});

describe('toolDisplayDescription', () => {
  it('uses the friendly description when set', () => {
    expect(
      toolDisplayDescription({ name: 'a', description: 'Calls GET /docs', displayDescription: ' Looks up documents ' })
    ).toBe('Looks up documents');
  });

  it('falls back to the original description, or null when there is none', () => {
    expect(toolDisplayDescription({ name: 'a', description: 'Calls GET /docs', displayDescription: '' })).toBe('Calls GET /docs');
    expect(toolDisplayDescription({ name: 'a', description: '' })).toBeNull();
    expect(toolDisplayDescription({ name: 'a' })).toBeNull();
  });
});
