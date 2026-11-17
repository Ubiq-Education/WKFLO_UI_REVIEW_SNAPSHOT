import React, { useEffect, useState } from 'react';
import { Download, Loader2, ImageOff } from 'lucide-react';
import DOMPurify from 'dompurify';

// DOMPurify's default config strips `target` (not in its attribute allowlist) and never
// adds `rel="noopener noreferrer"` on its own, so any target="_blank" link that survives
// sanitization (via ADD_ATTR below) would otherwise open with reverse-tabnabbing access to
// `window.opener`. Registered once at module load, not per render.
// Any target value other than the special keywords _self/_parent/_top can make the browser
// open a new/separate browsing context (target="_blank" always does; an arbitrary named
// target like target="report" does too whenever no existing frame/window already has that
// name) — all of those carry the same reverse-tabnabbing exposure, so all of them need the
// rel fix. Compared case-insensitively since HTML attribute values aren't case-sensitive
// here, but the element's own `target` attribute is left with whatever casing it had.
const SAFE_TARGET_KEYWORDS = new Set(['_self', '_parent', '_top']);

function targetOpensNewContext(target: string | null): boolean {
  if (!target) return false;
  return !SAFE_TARGET_KEYWORDS.has(target.toLowerCase());
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && targetOpensNewContext(node.getAttribute('target'))) {
    const existingRel = node.getAttribute('rel')?.split(/\s+/).filter(Boolean) ?? [];
    const rel = new Set([...existingRel, 'noopener', 'noreferrer']);
    node.setAttribute('rel', Array.from(rel).join(' '));
  }
});

type GetAuthHeaders = () => Promise<Record<string, string>>;

// Only the protected asset endpoint expects a JWT; other image sources (external URLs,
// data: URLs) must not have the bearer token attached.
function requiresAuthHeaders(src: string): boolean {
  return src.includes('/api/v1/asset/');
}

interface DownloadableImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: React.ReactEventHandler<HTMLImageElement>;
  fileName?: string;
  getAuthHeaders?: GetAuthHeaders;
  // Placeholder (e.g. image-expired.svg) to swap in when the image fails to load. Swapped at
  // most once per src, so a missing/broken placeholder can't loop back into onError, and the
  // download button is hidden while it's showing (Bug 7872). Takes precedence over onError.
  fallbackSrc?: string;
}

async function fetchAsBlob(src: string, getAuthHeaders?: GetAuthHeaders): Promise<Blob> {
  
  if (src.startsWith('data:')) {
    const [header, data] = src.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/png';
    if (header.includes(';base64')) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    }
    return new Blob([decodeURIComponent(data)], { type: mimeType });
  }

  const headers = getAuthHeaders && requiresAuthHeaders(src) ? await getAuthHeaders() : undefined;
  const response = await fetch(src, { headers: headers && headers?.Authorization ? { "Authorization": headers.Authorization } : undefined });
  return response.blob();
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/avif': 'avif',
};

// blob.type comes from the response's Content-Type header (or is set explicitly for
// data: URLs in fetchAsBlob) — use it to correct fileName's extension, since inferFileName
// only guesses from the URL and defaults to .png when the URL has none.
function withExtensionForMimeType(fileName: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType.toLowerCase()];
  if (!ext) return fileName;
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${base}.${ext}`;
}

async function downloadImage(src: string, fileName: string, getAuthHeaders?: GetAuthHeaders) {
  const blob = await fetchAsBlob(src, getAuthHeaders);
  const resolvedFileName = withExtensionForMimeType(fileName, blob.type);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = resolvedFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function inferFileName(src: string): string {
  if (src.startsWith('data:')) {
    const ext = src.match(/data:image\/(\w+);/)?.[1] ?? 'png';
    return `image.${ext}`;
  }
  try {
    const pathname = new URL(src).pathname;
    const name = pathname.split('/').filter(Boolean).pop();
    // Asset URLs like /api/v1/asset/{guid} have no dot in the last segment; use the
    // segment itself (e.g. the guid) as the base name so downloads aren't all named
    // "image" — withExtensionForMimeType corrects/appends the real extension after fetch.
    if (name) return name.includes('.') ? name : `${name}.png`;
  } catch {
    // relative URL
    const name = src.split('/').filter(Boolean).pop();
    if (name) return name.includes('.') ? name : `${name}.png`;
  }
  return 'image.png';
}

// fallbackSrc (Bug 7872): placeholder each <img> swaps to when its URL is broken/expired (e.g.
// Canva's signed thumbnails 403 with "Signature expired" after ~1h). Omitted, images keep the
// browser's default broken-image behavior, as before.
export function renderHtmlWithImages(html: string, getAuthHeaders?: GetAuthHeaders, fallbackSrc?: string): React.ReactNode {
  // DOMPurify parses via the browser's HTML parser and re-serializes balanced, sanitized
  // markup — this both closes the XSS gap left by the naive tag-name whitelist in
  // isTextValidHtml() and fixes malformed/unclosed tags that could otherwise break the
  // surrounding chat DOM (Task 7087). ADD_ATTR keeps `target` (stripped by DOMPurify's
  // default allowlist), and the module-level hook above pairs target="_blank" with
  // rel="noopener noreferrer" to prevent reverse tabnabbing.
  const sanitized = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });

  if (!/<img\b/i.test(sanitized)) {
    return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }

  const parts: React.ReactNode[] = [];
  const imgRegex = /<img\b[^>]*\/?>/gi;
  let lastIndex = 0;
  let keyIdx = 0;
  let match: RegExpExecArray | null;
  // <template> content is inert: assigning innerHTML doesn't load images or run handlers.
  const imgParser = document.createElement('template');

  while ((match = imgRegex.exec(sanitized)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={keyIdx++} dangerouslySetInnerHTML={{ __html: sanitized.slice(lastIndex, match.index) }} />
      );
    }
    // Read src/alt from a parsed element rather than regex-matching the serialized markup:
    // serialization escapes `&` as `&amp;` in attribute values, and React would set that
    // literal text on <img src>, breaking every query param after the first (e.g. signed
    // Canva URLs → 403). getAttribute returns the entity-decoded value (Bug 7867).
    imgParser.innerHTML = match[0];
    const img = imgParser.content.querySelector('img');
    const src = img?.getAttribute('src') ?? '';
    const alt = img?.getAttribute('alt') ?? '';
    parts.push(
      <DownloadableImage
        key={keyIdx++}
        src={src}
        alt={alt}
        style={{ maxHeight: '200px', objectFit: 'contain' }}
        className="rounded-lg"
        getAuthHeaders={getAuthHeaders}
        fallbackSrc={fallbackSrc}
      />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < sanitized.length) {
    parts.push(
      <span key={keyIdx++} dangerouslySetInnerHTML={{ __html: sanitized.slice(lastIndex) }} />
    );
  }

  return <>{parts}</>;
}

export const DownloadableImage: React.FC<DownloadableImageProps> = ({
  src,
  alt,
  className,
  style,
  onError,
  fileName,
  getAuthHeaders,
  fallbackSrc,
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // The src that failed and was swapped for fallbackSrc. Derived against the current src (not
  // reset in the effect below) so a genuinely new src still gets its own load attempt, while the
  // effect and the loading branch below both yield to it — a re-render with an unstable
  // getAuthHeaders must not refetch the broken URL or flash the spinner over the placeholder (Bug 7872).
  const [fallbackFor, setFallbackFor] = useState<string | null>(null);
  const showingFallback = Boolean(fallbackSrc) && fallbackFor === src;
  const needsAuthFetch = Boolean(getAuthHeaders) && requiresAuthHeaders(src);

  useEffect(() => {
    setLoadError(false);
    setObjectUrl(null);

    if (!needsAuthFetch || showingFallback) {
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    fetchAsBlob(src, getAuthHeaders).then((blob) => {
      if (cancelled) return;
      createdUrl = URL.createObjectURL(blob);
      setObjectUrl(createdUrl);
    }).catch((error) => {
      console.error('Failed to load authenticated image:', error);
      if (!cancelled) setLoadError(true);
    });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [needsAuthFetch, showingFallback, src, getAuthHeaders]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadImage(src, fileName ?? inferFileName(src), getAuthHeaders);
  };

  if (needsAuthFetch && !showingFallback && !objectUrl && !loadError) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 rounded-lg animate-pulse ${className ?? ''}`}
        style={{ minHeight: '120px', minWidth: '160px', ...style }}
      >
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  // Only fall back to the generic "Image unavailable" placeholder when the caller didn't
  // wire up its own onError handler. Callers that did (e.g. chat-messages.tsx swapping the
  // src to image-expired.svg) get the real <img> below instead, so their fallback — not this
  // generic one — decides what's shown; previously this early return always won, making the
  // caller's onError dead code for every authenticated asset URL (Task 7030). A fallbackSrc
  // counts as the caller's own fallback here too (Bug 7872).
  if (needsAuthFetch && loadError && !onError && !fallbackSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-gray-100 rounded-lg text-gray-400 ${className ?? ''}`}
        style={{ minHeight: '120px', minWidth: '160px', ...style }}
      >
        <ImageOff className="h-6 w-6" />
        <span className="text-xs">Image unavailable</span>
      </div>
    );
  }

  return (
    <div className="relative group inline-block">
      <img
        // Once the authenticated fetch has failed, fall back to the original (unauthenticated)
        // src instead of leaving it undefined: the browser's own request will fail the same way
        // (401/404/410) and fire the native onerror event below, which is what the caller's
        // handler is wired up to catch.
        src={showingFallback ? fallbackSrc : needsAuthFetch ? objectUrl ?? (loadError ? src : undefined) : src}
        alt={showingFallback ? 'Image no longer available' : alt}
        className={className}
        style={style}
        // With a fallbackSrc, only the first error (on the real src) swaps it in; an error on the
        // placeholder itself is ignored so it can't loop (Bug 7872).
        onError={fallbackSrc ? () => { if (!showingFallback) setFallbackFor(src); } : onError}
      />
      {/* Downloading the placeholder SVG is pointless, so no download button while it shows. */}
      {!showingFallback && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            title="Download image"
            onClick={handleDownload}
            className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
