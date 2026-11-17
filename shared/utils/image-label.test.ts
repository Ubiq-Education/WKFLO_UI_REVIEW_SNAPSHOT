import { describe, it, expect } from 'vitest';
import { isImageLabel, isImageOnly } from './image-label';

const fileUrl = 'https://blob.example/chat-images/edited.png?sas';
const returnedLabel = "FileName: 'edited.png'\nFileType: 'image/png'";
const uploadedLabel = "\n FileName: 'photo.png'\n FileType: 'image/png'";

describe('isImageOnly', () => {
  it('is true for an image with no text', () => {
    expect(isImageOnly({ fileUrl, content: '' })).toBe(true);
    expect(isImageOnly({ fileUrl, content: null })).toBe(true);
    expect(isImageOnly({ fileUrl })).toBe(true);
  });

  it('is true for an image that still carries its FileName/FileType label (older backend)', () => {
    expect(isImageOnly({ fileUrl, content: returnedLabel })).toBe(true);
    expect(isImageOnly({ fileUrl, content: uploadedLabel })).toBe(true);
  });

  it('is false when the image comes with real text', () => {
    expect(isImageOnly({ fileUrl, content: 'Here is the edited version.' })).toBe(false);
    expect(isImageOnly({ fileUrl, content: `${returnedLabel}\nAnything else?` })).toBe(false);
  });

  it('is false without an image', () => {
    expect(isImageOnly({ content: '' })).toBe(false);
    expect(isImageOnly({ content: returnedLabel })).toBe(false);
  });

  it('is false when a metadata url still needs the text row', () => {
    expect(isImageOnly({ fileUrl, content: '', metadata: { url: 'https://example.com/page' } })).toBe(false);
  });
});

describe('isImageLabel', () => {
  it('recognises both label forms and nothing else', () => {
    expect(isImageLabel(returnedLabel)).toBe(true);
    expect(isImageLabel(uploadedLabel)).toBe(true);
    expect(isImageLabel("FileName: 'report.pdf'")).toBe(false);
    expect(isImageLabel('Here is the edited version.')).toBe(false);
    expect(isImageLabel(null)).toBe(false);
  });
});
