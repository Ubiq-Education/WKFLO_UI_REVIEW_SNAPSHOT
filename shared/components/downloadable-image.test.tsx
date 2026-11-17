import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadableImage, renderHtmlWithImages } from './downloadable-image';

function renderHtml(html: string) {
  const { container } = render(<>{renderHtmlWithImages(html)}</>);
  return container;
}

// Bug 7206: DOMPurify strips `target` by default, and ADD_ATTR alone would let
// target="_blank" links back in without the rel="noopener noreferrer" protection against
// reverse tabnabbing. A module-level afterSanitizeAttributes hook adds it back — these tests
// guard both the original _blank case and the Copilot review follow-ups (case-insensitivity
// and non-_blank named targets that also open a new browsing context).
describe('renderHtmlWithImages — target/rel sanitization (Bug 7206)', () => {
  it('keeps target="_blank" on a link and adds rel="noopener noreferrer"', () => {
    const container = renderHtml('<a href="https://example.com" target="_blank">link</a>');
    const anchor = container.querySelector('a');

    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('adds rel="noopener noreferrer" for target="_BLANK" (case-insensitive match)', () => {
    const container = renderHtml('<a href="https://example.com" target="_BLANK">link</a>');
    const anchor = container.querySelector('a');

    expect(anchor).toBeTruthy();
    // The rel fix is decided case-insensitively but the target attribute's own casing is untouched.
    expect(anchor?.getAttribute('target')).toBe('_BLANK');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('adds rel="noopener noreferrer" for a named target that is not _self/_parent/_top', () => {
    const container = renderHtml('<a href="https://example.com" target="report">link</a>');
    const anchor = container.querySelector('a');

    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('target')).toBe('report');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('does not force rel="noopener noreferrer" onto target="_self"', () => {
    const container = renderHtml('<a href="https://example.com" target="_self">link</a>');
    const anchor = container.querySelector('a');

    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('target')).toBe('_self');
    expect(anchor?.getAttribute('rel')).toBeNull();
  });
});

// Bug 7867: DOMPurify's serialized output escapes `&` in attribute values as `&amp;`, so
// pulling src/alt out of it with a regex handed React the still-escaped text — signed image
// URLs (e.g. Canva's) then broke on every query param after the first.
describe('renderHtmlWithImages — img src/alt entity decoding (Bug 7867)', () => {
  it('renders the img src and alt with HTML entities decoded', () => {
    const container = renderHtml('<p>Here:</p><img src="https://example.com/a.png?x=1&y=2" alt="A &amp; B">');
    const img = container.querySelector('img');

    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png?x=1&y=2');
    expect(img?.getAttribute('alt')).toBe('A & B');
  });
});

// Bug 7872: an <img> inside an HTML message whose URL has expired/broken (e.g. a Canva signed
// thumbnail returning 403 "Signature expired") showed the browser's broken-image icon instead
// of the image-expired.svg placeholder attachments already fall back to (Task 7030).
describe('renderHtmlWithImages — broken/expired image fallback (Bug 7872)', () => {
  const brokenHtml = '<p>Design:</p><img src="https://example.com/thumb.png?sig=old&exp=1" alt="Thumbnail">';
  const fallbackSrc = 'https://wkflo.example.com/assets/image-expired.svg';

  function renderWithFallback(html: string, fallback?: string) {
    const { container } = render(<>{renderHtmlWithImages(html, undefined, fallback)}</>);
    return container;
  }

  it('swaps a failing image to the fallback', () => {
    const container = renderWithFallback(brokenHtml, fallbackSrc);
    const img = container.querySelector('img') as HTMLImageElement;

    fireEvent.error(img);

    expect(img.getAttribute('src')).toBe(fallbackSrc);
    expect(img.getAttribute('alt')).toBe('Image no longer available');
  });

  it('does not loop when the fallback itself fails to load', () => {
    const container = renderWithFallback(brokenHtml, fallbackSrc);
    const img = container.querySelector('img') as HTMLImageElement;

    fireEvent.error(img);
    fireEvent.error(img);
    fireEvent.error(img);

    // Still the placeholder — not flipped back to the broken URL, and no re-render storm.
    expect(img.getAttribute('src')).toBe(fallbackSrc);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('hides the download button while the fallback is showing', () => {
    const container = renderWithFallback(brokenHtml, fallbackSrc);
    const img = container.querySelector('img') as HTMLImageElement;

    expect(screen.getByTitle('Download image')).toBeTruthy();

    fireEvent.error(img);

    expect(screen.queryByTitle('Download image')).toBeNull();
  });

  it('keeps the existing behavior when no fallback is passed', () => {
    const container = renderWithFallback(brokenHtml);
    const img = container.querySelector('img') as HTMLImageElement;

    fireEvent.error(img);

    // src/alt untouched (decoded, per Bug 7867) and the download button still there.
    expect(img.getAttribute('src')).toBe('https://example.com/thumb.png?sig=old&exp=1');
    expect(img.getAttribute('alt')).toBe('Thumbnail');
    expect(screen.getByTitle('Download image')).toBeTruthy();
  });
});

// Review follow-up (Bug 7872): once an authenticated image has fallen back, a re-render with a new
// getAuthHeaders identity must not refetch the expired URL or flash the loading spinner, while a
// new src still gets its own load attempt.
describe('DownloadableImage — authenticated image after fallback (Bug 7872)', () => {
  const assetSrc = 'https://api.example.com/api/v1/asset/expired-guid';
  const fallbackSrc = 'https://wkflo.example.com/assets/image-expired.svg';
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })) });
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderFallenBack() {
    const view = render(
      <DownloadableImage
        src={assetSrc}
        alt="Asset"
        getAuthHeaders={() => Promise.resolve({ Authorization: 'Bearer a' })}
        fallbackSrc={fallbackSrc}
      />
    );
    const img = await waitFor(() => {
      const el = view.container.querySelector('img');
      expect(el?.getAttribute('src')).toBe('blob:mock-url');
      return el as HTMLImageElement;
    });
    fireEvent.error(img);
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe(fallbackSrc);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return view;
  }

  it('does not refetch or show the spinner when getAuthHeaders changes identity', async () => {
    const view = await renderFallenBack();

    view.rerender(
      <DownloadableImage
        src={assetSrc}
        alt="Asset"
        getAuthHeaders={() => Promise.resolve({ Authorization: 'Bearer b' })}
        fallbackSrc={fallbackSrc}
      />
    );

    expect(view.container.querySelector('.animate-spin')).toBeNull();
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe(fallbackSrc);
    // Let any (incorrectly) scheduled fetch settle before asserting it never happened.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe(fallbackSrc);
  });

  it('still loads a new src after an earlier src fell back', async () => {
    const view = await renderFallenBack();

    view.rerender(
      <DownloadableImage
        src="https://api.example.com/api/v1/asset/fresh-guid"
        alt="Asset"
        getAuthHeaders={() => Promise.resolve({ Authorization: 'Bearer a' })}
        fallbackSrc={fallbackSrc}
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.com/api/v1/asset/fresh-guid');
    await waitFor(() =>
      expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:mock-url')
    );
  });
});
