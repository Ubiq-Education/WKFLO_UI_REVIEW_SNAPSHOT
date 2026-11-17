import { describe, it, expect, afterEach, vi } from 'vitest';
import { PageContextService } from './page-context-service';

type FakeParent = { postMessage: ReturnType<typeof vi.fn> };

// A message event as the browser delivers it, with `source` set to the window that posted it.
function messageFrom(source: unknown, data: unknown): MessageEvent {
  const event = new MessageEvent('message', { data });
  Object.defineProperty(event, 'source', { value: source });
  return event;
}

// Makes the widget look like it is embedded in an iframe. When `reply` is given, the fake
// host answers REQUEST_PAGE_PATH with it (as a message event on the widget's window).
function embedInIframe(reply?: Record<string, unknown>): FakeParent {
  const parent: FakeParent = {
    postMessage: vi.fn((message: { type: string }) => {
      if (reply && message.type === 'REQUEST_PAGE_PATH') {
        queueMicrotask(() => window.dispatchEvent(messageFrom(parent, reply)));
      }
    }),
  };
  vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window);
  return parent;
}

describe('PageContextService', () => {
  afterEach(() => {
    PageContextService.resetInstance();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses the current location and a null pageId when not in an iframe', async () => {
    const context = await PageContextService.getInstance().getPageContext();

    expect(context).toEqual({ path: window.location.pathname, pageId: null });
  });

  it('reads path and a string pageId from the host PAGE_PATH reply', async () => {
    const parent = embedInIframe({ type: 'PAGE_PATH', path: '/about', pageId: 'abc-123' });

    const context = await PageContextService.getInstance().getPageContext();

    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'REQUEST_PAGE_PATH' }, '*');
    expect(context).toEqual({ path: '/about', pageId: 'abc-123' });
  });

  it('normalises a numeric pageId to a string', async () => {
    embedInIframe({ type: 'PAGE_PATH', path: '/about', pageId: 42 });

    expect(await PageContextService.getInstance().getPageId()).toBe('42');
  });

  it('keeps pageId null when the host reply has no pageId (older hosts)', async () => {
    embedInIframe({ type: 'PAGE_PATH', path: '/about' });

    const service = PageContextService.getInstance();

    expect(await service.getPagePath()).toBe('/about');
    expect(await service.getPageId()).toBeNull();
  });

  it.each([
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['NaN', Number.NaN],
    ['an object', { id: 1 }],
    ['null', null],
    ['a boolean', true],
  ])('treats %s pageId as null', async (_label, pageId) => {
    embedInIframe({ type: 'PAGE_PATH', path: '/about', pageId });

    expect(await PageContextService.getInstance().getPageId()).toBeNull();
  });

  it('falls back to the current location and a null pageId when the host does not answer', async () => {
    vi.useFakeTimers();
    embedInIframe();

    const pending = PageContextService.getInstance().getPageContext();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await pending).toEqual({ path: window.location.pathname, pageId: null });
  });

  it('caches the page context and only asks the host once', async () => {
    const parent = embedInIframe({ type: 'PAGE_PATH', path: '/about', pageId: '7' });
    const service = PageContextService.getInstance();

    await Promise.all([service.getPageContext(), service.getPagePath(), service.getPageId()]);
    await service.getPageId();

    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('clearCache drops the cached pageId so the next call asks the host again', async () => {
    const parent = embedInIframe({ type: 'PAGE_PATH', path: '/about', pageId: '7' });
    const service = PageContextService.getInstance();
    await service.getPageId();

    parent.postMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'REQUEST_PAGE_PATH') {
        queueMicrotask(() => window.dispatchEvent(messageFrom(parent, { type: 'PAGE_PATH', path: '/contact' })));
      }
    });
    service.clearCache();

    expect(await service.getPageContext()).toEqual({ path: '/contact', pageId: null });
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('ignores a PAGE_PATH reply that does not come from the host window', async () => {
    const parent = embedInIframe();
    parent.postMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'REQUEST_PAGE_PATH') {
        queueMicrotask(() => {
          window.dispatchEvent(messageFrom({}, { type: 'PAGE_PATH', path: '/forged', pageId: '999' }));
          window.dispatchEvent(messageFrom(parent, { type: 'PAGE_PATH', path: '/about', pageId: '7' }));
        });
      }
    });

    expect(await PageContextService.getInstance().getPageContext()).toEqual({ path: '/about', pageId: '7' });
  });

  it.each([['line\r\nbreak'], ['line\nbreak'], ['日本']])('drops a pageId that cannot be sent as a header (%j)', async (pageId) => {
    embedInIframe({ type: 'PAGE_PATH', path: '/about', pageId });

    expect(await PageContextService.getInstance().getPageContext()).toEqual({ path: '/about', pageId: null });
  });
});
