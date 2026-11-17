import { describe, it, expect } from 'vitest';
import { isExpiredImageSentinel, findExpiredImageContentItem } from './expired-image-sentinel';

describe('isExpiredImageSentinel', () => {
  it('matches the exact backend sentinel (em dash)', () => {
    expect(
      isExpiredImageSentinel('[Image no longer available — the uploaded image has expired]')
    ).toBe(true);
  });

  it('matches case-insensitively and with a plain hyphen', () => {
    expect(
      isExpiredImageSentinel('[image no longer available - the uploaded image has expired]')
    ).toBe(true);
  });

  it('matches a "deleted" variant', () => {
    expect(
      isExpiredImageSentinel('[Image no longer available - the uploaded image was deleted]')
    ).toBe(true);
  });

  it('does not match ordinary assistant prose mentioning similar words', () => {
    expect(
      isExpiredImageSentinel('The image is no longer available because it expired yesterday.')
    ).toBe(false);
  });

  it('does not match unrelated content', () => {
    expect(isExpiredImageSentinel('Hello from the agent')).toBe(false);
  });

  it('returns false for empty/null/undefined', () => {
    expect(isExpiredImageSentinel('')).toBe(false);
    expect(isExpiredImageSentinel(null)).toBe(false);
    expect(isExpiredImageSentinel(undefined)).toBe(false);
  });
});

describe('findExpiredImageContentItem', () => {
  it('finds the contentItems entry carrying the sentinel', () => {
    const contentItems = [
      {
        name: 'Text Content',
        data: "\n FileName: 'photo.webp'\n FileType: 'image/webp'",
        status: 'success' as const,
        statusCode: 200,
      },
      {
        name: 'Text Content',
        data: '[Image no longer available — the uploaded image has expired]',
        status: 'success' as const,
        statusCode: 200,
      },
    ];

    expect(findExpiredImageContentItem(contentItems)).toBe(contentItems[1]);
  });

  it('returns undefined when no entry matches', () => {
    const contentItems = [
      { name: 'Text Content', data: 'Just some text', status: 'success' as const, statusCode: 200 },
    ];
    expect(findExpiredImageContentItem(contentItems)).toBeUndefined();
  });

  it('returns undefined for undefined/empty contentItems', () => {
    expect(findExpiredImageContentItem(undefined)).toBeUndefined();
    expect(findExpiredImageContentItem([])).toBeUndefined();
  });
});
