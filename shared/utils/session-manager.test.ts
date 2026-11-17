import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  buildSessionKey,
  clearSessionId,
  getOrCreateSessionId,
  resolveSessionIdentity,
  storeSessionId,
} from './session-manager';

// client/src/test-setup.ts replaces window.location with a plain object, which breaks jsdom's
// origin-bound localStorage — stub a minimal in-memory one (same approach as the
// agent-chat-interface component tests).
function stubLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size; },
    },
    configurable: true,
  });
  return store;
}

const GUID = '11111111-2222-4333-8444-555555555555';

describe('session-manager — public vs test chat sessions (Bug 7958)', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
  let store: Map<string, string>;

  beforeEach(() => {
    store = stubLocalStorage();
    clearSessionId('share', 'SITE', 'user', true);
  });

  afterAll(() => {
    if (originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage);
  });

  it('keeps reusing the persisted localStorage session for public chats', () => {
    store.set(buildSessionKey('share', 'SITE', 'user'), GUID);

    expect(getOrCreateSessionId('share', 'SITE', 'user')).toBe(GUID);
  });

  it('never reuses the persisted public session for a test chat and never writes to localStorage', () => {
    store.set(buildSessionKey('share', 'SITE', 'user'), GUID);

    const testSessionId = getOrCreateSessionId('share', 'SITE', 'user', true);

    expect(testSessionId).not.toBe(GUID);
    expect(Array.from(store.keys())).toEqual([buildSessionKey('share', 'SITE', 'user')]);
  });

  it('ignores any test-keyed localStorage entry so a stale session is not resumed', () => {
    store.set(buildSessionKey('share', 'SITE', 'user', true), GUID);

    expect(getOrCreateSessionId('share', 'SITE', 'user', true)).not.toBe(GUID);
  });

  it('returns a stable test session id within the same page load until it is cleared', () => {
    const first = getOrCreateSessionId('share', 'SITE', 'user', true);

    expect(getOrCreateSessionId('share', 'SITE', 'user', true)).toBe(first);

    clearSessionId('share', 'SITE', 'user', true);
    expect(getOrCreateSessionId('share', 'SITE', 'user', true)).not.toBe(first);
  });

  it('stores a switched-to session in localStorage for public chats so a reload reopens it', () => {
    storeSessionId('share', 'SITE', 'user', GUID);

    expect(getOrCreateSessionId('share', 'SITE', 'user')).toBe(GUID);
  });

  it('keeps a switched-to test chat session in memory only', () => {
    storeSessionId('share', 'SITE', 'user', GUID, true);

    expect(getOrCreateSessionId('share', 'SITE', 'user', true)).toBe(GUID);
    expect(store.size).toBe(0);
  });

  it('uses a distinct "-test" key for test chats', () => {
    expect(buildSessionKey('share', 'SITE', 'user')).toBe('wkflo-chat-session-site-share-user');
    expect(buildSessionKey('share', 'SITE', 'user', true)).toBe('wkflo-chat-session-site-share-user-test');
  });
});

describe('resolveSessionIdentity', () => {
  it('uses tenant guid and logged-in user for non-JWT security', () => {
    expect(resolveSessionIdentity({
      securityType: 'none',
      shareId: 'share',
      tenantGuid: 'tenant',
      jwtCallbackTokenSiteId: 'jwt-site',
      jwtCallbackTokenSub: 'jwt-sub',
      userName: 'jane',
    })).toEqual({ shareId: 'share', siteId: 'tenant', userId: 'jane', isTestChat: false });
  });

  it('uses JWT claims for jwt-token-callback security', () => {
    expect(resolveSessionIdentity({
      securityType: 'jwt-token-callback',
      shareId: 'share',
      tenantGuid: 'tenant',
      jwtCallbackTokenSiteId: 'jwt-site',
      jwtCallbackTokenSub: 'jwt-sub',
      userName: 'jane',
      isTestChat: true,
    })).toEqual({ shareId: 'share', siteId: 'jwt-site', userId: 'jwt-sub', isTestChat: true });
  });

  it('falls back to "anonymous" when there is no user', () => {
    expect(resolveSessionIdentity({ securityType: 'none', shareId: 'share', tenantGuid: 'tenant' })?.userId)
      .toBe('anonymous');
  });

  it('returns null when the session cannot be keyed yet', () => {
    expect(resolveSessionIdentity({ shareId: 'share', tenantGuid: 'tenant' })).toBeNull();
    expect(resolveSessionIdentity({ securityType: 'none', tenantGuid: 'tenant' })).toBeNull();
    expect(resolveSessionIdentity({ securityType: 'jwt-token-callback', shareId: 'share', tenantGuid: 'tenant' })).toBeNull();
  });
});
