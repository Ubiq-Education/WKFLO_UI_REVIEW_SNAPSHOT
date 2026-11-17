export interface PageContext {
  path: string;
  /**
   * The host CMS's page ID, when the host supplies it in its PAGE_PATH reply.
   * Null when the host doesn't send one (older hosts), when the widget isn't in an iframe,
   * or when the host doesn't answer in time.
   */
  pageId: string | null;
}

export class PageContextService {
  private static instance: PageContextService | null = null;
  private pageContext: PageContext | null = null;
  private contextPromise: Promise<PageContext> | null = null;

  public static getInstance(): PageContextService {
    if (!PageContextService.instance) {
      PageContextService.instance = new PageContextService();
    }
    return PageContextService.instance;
  }

  public async getPagePath(): Promise<string> {
    return (await this.getPageContext()).path;
  }

  public async getPageId(): Promise<string | null> {
    return (await this.getPageContext()).pageId;
  }

  public async getPageContext(): Promise<PageContext> {
    if (this.pageContext) return this.pageContext;
    if (this.contextPromise) return this.contextPromise;

    // Not in an iframe — use current page path directly; there is no host to supply a page ID
    if (window === window.parent) {
      this.pageContext = { path: window.location.pathname, pageId: null };
      return this.pageContext;
    }

    this.contextPromise = this.requestPageContext();
    try {
      this.pageContext = await this.contextPromise;
      return this.pageContext;
    } finally {
      this.contextPromise = null;
    }
  }

  private requestPageContext(): Promise<PageContext> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        resolve({ path: window.location.pathname, pageId: null });
      }, 2000);

      const handleMessage = (event: MessageEvent) => {
        // Only the host that was asked may answer; any other window could otherwise inject a path or page ID.
        if (event.source !== window.parent) return;
        const { type, path, pageId } = (event.data ?? {}) as { type?: string; path?: unknown; pageId?: unknown };
        if (type === 'PAGE_PATH' && typeof path === 'string') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          resolve({ path, pageId: normalisePageId(pageId) });
        }
      };

      window.addEventListener('message', handleMessage);
      window.parent.postMessage({ type: 'REQUEST_PAGE_PATH' }, '*');
    });
  }

  public clearCache(): void {
    this.pageContext = null;
    this.contextPromise = null;
  }

  public static resetInstance(): void {
    PageContextService.instance?.clearCache();
    PageContextService.instance = null;
  }
}

const HEADER_SAFE_VALUE = /^[\t\x20-\x7E\x80-\xFF]+$/;

/**
 * Accepts a non-empty string or a finite number; anything else is treated as "no page ID".
 * The value is sent as a request header, so a string with characters a header can't carry (e.g. CR/LF,
 * or anything outside Latin-1) is dropped: an illegal header would make every fetch throw instead of
 * falling back to the path-only lookup.
 */
function normalisePageId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 && HEADER_SAFE_VALUE.test(trimmed) ? trimmed : null;
  }
  return null;
}
