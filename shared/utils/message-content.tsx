import React from 'react';
import { renderHtmlWithImages } from '../components/downloadable-image';

type GetAuthHeaders = () => Promise<Record<string, string>>;

// Common HTML tags that might appear in chat messages
const VALID_HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio',
  'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
  'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
  'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html',
  'i', 'iframe', 'img', 'input', 'ins',
  'kbd',
  'label', 'legend', 'li', 'link',
  'main', 'map', 'mark', 'meta', 'meter',
  'nav', 'noscript',
  'object', 'ol', 'optgroup', 'option', 'output',
  'p', 'param', 'picture', 'pre', 'progress',
  'q',
  'rp', 'rt', 'ruby',
  's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track',
  'u', 'ul',
  'var', 'video',
  'wbr'
]);

// Extracted from chat-messages.tsx / agent-chat-messages.tsx, which previously carried
// byte-for-byte duplicate copies of this function (Task 7087).
export function isTextValidHtml(text: string): boolean {
  if (!text) {
    return false;
  }

  // Extract all HTML tags from the text
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  const matches = Array.from(text.matchAll(tagRegex));

  if (matches.length === 0) {
    return false; // No HTML tags found
  }

  // Check if all found tag names are valid HTML tags
  for (const match of matches) {
    const tagName = match[1].toLowerCase();
    if (!VALID_HTML_TAGS.has(tagName)) {
      return false; // Found an invalid tag name
    }
  }

  return true; // All tags are valid HTML tags
}

// Extracted from chat-messages.tsx / agent-chat-messages.tsx (Task 7087) — same duplication
// as isTextValidHtml above.
// imageFallbackSrc: see renderHtmlWithImages (Bug 7872); optional, so existing calls are unchanged.
export function renderTextWithLineBreaks(text: string, getAuthHeaders?: GetAuthHeaders, imageFallbackSrc?: string): React.ReactNode {
  if (!text) return null;

  return text.split('\n').map((line, index, array) => {
    if (isTextValidHtml(line)) {
      return (<React.Fragment key={index}>
        {renderHtmlWithImages(line, getAuthHeaders, imageFallbackSrc)}
      </React.Fragment>);
    }
    else {
      return (<React.Fragment key={index}>
        {line}
        {index < array.length - 1 && <br />}
      </React.Fragment>);
    }
  });
}

// Shared dispatch pattern used by every message-content render site: full-text HTML goes
// through the sanitizing HTML+image renderer, everything else falls back to per-line text
// (itself HTML-aware line by line). Factored out here so new render sites (e.g.
// TextSuggestionCard) don't have to re-implement the dispatch inline (Task 7087).
export function renderMessageContent(text: string, getAuthHeaders?: GetAuthHeaders, imageFallbackSrc?: string): React.ReactNode {
  if (!text) return null;

  return isTextValidHtml(text)
    ? renderHtmlWithImages(text, getAuthHeaders, imageFallbackSrc)
    : renderTextWithLineBreaks(text, getAuthHeaders, imageFallbackSrc);
}
