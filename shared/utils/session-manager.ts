// Utility functions for session management

/**
 * Generate a GUID/UUID v4
 */
export function generateGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Test chats (CMS Test Agent page, data-is-test-chat="true") keep their session id in memory only,
// so every page load starts a brand-new conversation, exactly like pressing the reset button.
// Persisting it in localStorage let a stale session (e.g. one already deleted server-side) be
// reused indefinitely, and those messages never showed up in Chat Logs. The map lives for the
// page's lifetime, so the id stays stable across re-renders/effect re-runs within one page load.
const testChatSessionStore = new Map<string, string>();
const inMemoryTestSessionStore: SessionStore = {
  getItem: (key) => testChatSessionStore.get(key) ?? null,
  setItem: (key, value) => { testChatSessionStore.set(key, value); },
  removeItem: (key) => { testChatSessionStore.delete(key); },
};

function getSessionStore(isTestChat: boolean): SessionStore {
  return isTestChat ? inMemoryTestSessionStore : localStorage;
}

/**
 * Build the storage key for a chat session. Test chats get a distinct "-test" suffix so they
 * never share a session with the public widget for the same site/agent/user.
 */
export function buildSessionKey(shareId: string, siteId: string, userId: string = 'anonymous', isTestChat: boolean = false): string {
  const baseKey = `wkflo-chat-session-${siteId.toLowerCase()}-${shareId}-${userId}`;
  return isTestChat ? `${baseKey}-test` : baseKey;
}

export interface SessionIdentity {
  shareId: string;
  siteId: string;
  userId: string;
  isTestChat: boolean;
}

export interface SessionIdentitySource {
  securityType?: string;
  shareId?: string;
  tenantGuid?: string;
  jwtCallbackTokenSiteId?: string;
  jwtCallbackTokenSub?: string;
  userName?: string;
  isTestChat?: boolean;
}

/**
 * Resolve the site/user identity a chat session is keyed by. Site/user identity comes from the
 * JWT callback claims when that security mode is active, otherwise from the tenant guid / logged-in
 * user. Shared by session creation and reset so both always address the same storage key.
 * @returns null when there is not enough information yet to key a session
 */
export function resolveSessionIdentity(source: SessionIdentitySource): SessionIdentity | null {
  if (!source.securityType || !source.shareId) return null;

  const isJwtCallback = source.securityType === 'jwt-token-callback';
  const siteId = isJwtCallback ? source.jwtCallbackTokenSiteId : source.tenantGuid;
  if (!siteId) return null;

  const userId = isJwtCallback ? source.jwtCallbackTokenSub : source.userName;

  return {
    shareId: source.shareId,
    siteId,
    userId: userId || 'anonymous',
    isTestChat: source.isTestChat === true,
  };
}

/**
 * Get or create a session ID for the chat widget
 * @param shareId - The share ID to create a unique session key
 * @param isTestChat - Test chats keep their session in memory only (fresh session per page load)
 * @returns The session ID (GUID format)
 */
export function getOrCreateSessionId(shareId: string, siteId: string, userId: string = 'anonymous', isTestChat: boolean = false): string {

  const sessionKey = buildSessionKey(shareId, siteId, userId, isTestChat);
  const store = getSessionStore(isTestChat);

  // Try to get an existing session for this key
  let sessionId = store.getItem(sessionKey);

  // If no session exists or it's invalid, create a new one
  if (!sessionId || !isValidGuid(sessionId)) {
    sessionId = generateGuid();
    store.setItem(sessionKey, sessionId);
  }

  return sessionId;
}

/**
 * US 7506: make `sessionId` the current session of the agent and site, so a reload reopens it.
 */
export function storeSessionId(shareId: string, siteId: string, userId: string = 'anonymous', sessionId: string, isTestChat: boolean = false): void {
  getSessionStore(isTestChat).setItem(buildSessionKey(shareId, siteId, userId, isTestChat), sessionId);
}

/**
 * Clear the session ID for a specific agent and site
 * @param agentId - The agent ID to clear the session for
 */
export function clearSessionId(agentId: string, siteId: string, userId: string = 'anonymous', isTestChat: boolean = false): void {
  getSessionStore(isTestChat).removeItem(buildSessionKey(agentId, siteId, userId, isTestChat));
}

/**
 * Validate if a string is a valid GUID format
 * @param guid - The string to validate
 * @returns True if valid GUID format
 */
function isValidGuid(guid: string): boolean {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(guid);
}

/**
 * Get all session IDs stored in localStorage
 * @returns Array of objects with agentId and sessionId
 */
export function getAllSessions(): Array<{ agentId: string; sessionId: string }> {
  const sessions: Array<{ agentId: string; sessionId: string }> = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('wkflo-chat-session-')) {
      const agentId = key.replace('wkflo-chat-session-', '');
      const sessionId = localStorage.getItem(key);
      if (sessionId && isValidGuid(sessionId)) {
        sessions.push({ agentId, sessionId });
      }
    }
  }
  
  return sessions;
}

/**
 * Clear all chat sessions from localStorage
 */
export function clearAllSessions(): void {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('wkflo-chat-session-')) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
}