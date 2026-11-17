import { describe, it, expect } from 'vitest';
import { isImageTooLarge, formatFileSize, MAX_IMAGE_SIZE_BYTES } from './file-validation';

function makeFile(sizeBytes: number, type: string): File {
  return new File([new Uint8Array(sizeBytes)], 'test-file', { type });
}

describe('isImageTooLarge', () => {
  it('uses the backend limit of 5,000,000 bytes', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(5_000_000);
  });

  it('returns false for an image at exactly the limit', () => {
    expect(isImageTooLarge(makeFile(MAX_IMAGE_SIZE_BYTES, 'image/png'))).toBe(false);
    expect(isImageTooLarge(makeFile(5_000_000, 'image/png'))).toBe(false);
  });

  it('returns true for an image one byte over the backend limit', () => {
    expect(isImageTooLarge(makeFile(5_000_001, 'image/jpeg'))).toBe(true);
  });

  it('returns true for an image over the limit', () => {
    expect(isImageTooLarge(makeFile(MAX_IMAGE_SIZE_BYTES + 1, 'image/png'))).toBe(true);
  });

  it('returns false for a non-image file over the limit', () => {
    expect(isImageTooLarge(makeFile(MAX_IMAGE_SIZE_BYTES + 1, 'application/pdf'))).toBe(false);
  });

  it('returns false for a small image', () => {
    expect(isImageTooLarge(makeFile(1024, 'image/jpeg'))).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats bytes as decimal MB with one decimal place', () => {
    expect(formatFileSize(MAX_IMAGE_SIZE_BYTES)).toBe('5.0 MB');
    expect(formatFileSize(1_500_000)).toBe('1.5 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.2 MB');
  });
});
