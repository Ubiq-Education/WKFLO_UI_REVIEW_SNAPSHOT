import { describe, it, expect } from 'vitest';
import {
  didSaveResetConnections,
  hasClientSecretAfterSave,
  hasUnsavedClientCredentials,
  normalizeMcpConfigForSubmit,
  parseConfigObject,
  parseScopes,
  readScopes,
  settleClientSecretAfterSave,
  willDropSavedSecret,
} from './mcp-oauth-client-credentials';

// US 7849 / Task 7851: OAuth client credentials (Client ID / Client Secret) and Scopes on MCP tools.
describe('parseScopes / readScopes', () => {
  it('splits on spaces and commas, dropping blanks and duplicates', () => {
    expect(parseScopes(' profile:read, design:meta:read  design:meta:read,,asset:read ')).toEqual([
      'profile:read',
      'design:meta:read',
      'asset:read',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(parseScopes('   ')).toEqual([]);
  });

  it('reads the stored array shape and tolerates a string or garbage', () => {
    expect(readScopes(['a', ' b ', 3, 'a'])).toEqual(['a', 'b']);
    expect(readScopes('a b')).toEqual(['a', 'b']);
    expect(readScopes(undefined)).toEqual([]);
  });
});

describe('normalizeMcpConfigForSubmit', () => {
  it('drops hasClientSecret, a blank clientSecret and a non-true clearClientSecret, and trims clientId', () => {
    expect(
      normalizeMcpConfigForSubmit({
        endpoint: 'https://mcp.example.com',
        clientId: '  my-client  ',
        clientSecret: '   ',
        hasClientSecret: true,
        clearClientSecret: false,
        scopes: ['a'],
      })
    ).toEqual({ endpoint: 'https://mcp.example.com', clientId: 'my-client', scopes: ['a'] });
  });

  it('posts a new secret as typed', () => {
    expect(normalizeMcpConfigForSubmit({ clientId: 'c', clientSecret: 's3cret' })).toEqual({
      clientId: 'c',
      clientSecret: 's3cret',
    });
  });

  it('posts clearClientSecret only when true', () => {
    expect(normalizeMcpConfigForSubmit({ clientId: 'c', clearClientSecret: true, hasClientSecret: true })).toEqual({
      clientId: 'c',
      clearClientSecret: true,
    });
  });

  it('lets a new secret win over a clear (never posts both)', () => {
    expect(normalizeMcpConfigForSubmit({ clientSecret: 'new', clearClientSecret: true })).toEqual({
      clientSecret: 'new',
    });
  });

  it('does not mutate its input', () => {
    const input = { hasClientSecret: true, clientSecret: '' };
    normalizeMcpConfigForSubmit(input);
    expect(input).toEqual({ hasClientSecret: true, clientSecret: '' });
  });
});

describe('hasUnsavedClientCredentials', () => {
  const saved = { clientId: 'c', hasClientSecret: true, scopes: ['a', 'b'], endpoint: 'https://x' };

  it('is false when nothing connection-related changed (other fields may differ)', () => {
    expect(hasUnsavedClientCredentials(saved, { ...saved, id: 'renamed', oAuthScope: 'PerUser' })).toBe(false);
  });

  it('is true for a changed endpoint, ignoring whitespace-only differences', () => {
    expect(hasUnsavedClientCredentials(saved, { ...saved, endpoint: 'https://y' })).toBe(true);
    expect(hasUnsavedClientCredentials(saved, { ...saved, endpoint: ' https://x ' })).toBe(false);
  });

  it('is true for a changed Client ID, a typed secret, a pending clear or changed scopes', () => {
    expect(hasUnsavedClientCredentials(saved, { ...saved, clientId: 'other' })).toBe(true);
    expect(hasUnsavedClientCredentials(saved, { ...saved, clientSecret: 'new' })).toBe(true);
    expect(hasUnsavedClientCredentials(saved, { ...saved, clearClientSecret: true })).toBe(true);
    expect(hasUnsavedClientCredentials(saved, { ...saved, scopes: ['a'] })).toBe(true);
  });

  it('ignores whitespace-only Client ID edits and blank secrets', () => {
    expect(hasUnsavedClientCredentials(saved, { ...saved, clientId: ' c ', clientSecret: '  ' })).toBe(false);
  });

  it('is false when there is no saved baseline', () => {
    expect(hasUnsavedClientCredentials(null, { clientId: 'c' })).toBe(false);
  });
});

describe('willDropSavedSecret', () => {
  const saved = { clientId: 'c', hasClientSecret: true, endpoint: 'https://x' };

  it('warns when the endpoint or Client ID changes with a saved secret and no new one', () => {
    expect(willDropSavedSecret(saved, { ...saved, endpoint: 'https://evil' })).toBe(true);
    expect(willDropSavedSecret(saved, { ...saved, clientId: 'other' })).toBe(true);
  });

  it('does not warn when a new secret is entered, a clear is pending, or no secret is saved', () => {
    expect(willDropSavedSecret(saved, { ...saved, endpoint: 'https://y', clientSecret: 'new' })).toBe(false);
    expect(willDropSavedSecret(saved, { ...saved, endpoint: 'https://y', clearClientSecret: true })).toBe(false);
    expect(willDropSavedSecret(saved, { ...saved, endpoint: 'https://y', hasClientSecret: false })).toBe(false);
    expect(willDropSavedSecret(saved, saved)).toBe(false);
  });
});

describe('didSaveResetConnections', () => {
  const before = { clientId: 'c', hasClientSecret: true, endpoint: 'https://x', scopes: ['a'] };

  it('is true when the save changed the Client ID, posted a new secret or cleared the saved one', () => {
    expect(didSaveResetConnections(before, { ...before, clientId: 'other' })).toBe(true);
    expect(didSaveResetConnections(before, { ...before, clientSecret: 'new' })).toBe(true);
    expect(didSaveResetConnections(before, { ...before, clearClientSecret: true })).toBe(true);
  });

  it('is true when the endpoint changed and the saved secret was dropped', () => {
    expect(didSaveResetConnections(before, { ...before, endpoint: 'https://y' })).toBe(true);
  });

  it('is true when the endpoint changed even with no secret stored (Task 7850 review change)', () => {
    const noSecret = { clientId: '', hasClientSecret: false, endpoint: 'https://x' };
    expect(didSaveResetConnections(noSecret, { ...noSecret, endpoint: 'https://y' })).toBe(true);
  });

  it('ignores whitespace-only endpoint differences', () => {
    expect(didSaveResetConnections(before, { ...before, endpoint: ' https://x ' })).toBe(false);
  });

  it('is false for saves that leave the credentials alone (scopes, mode, refetch after a save)', () => {
    expect(didSaveResetConnections(before, { ...before, scopes: ['b'], oAuthScope: 'PerUser' })).toBe(false);
    // The refetch after a save replaces the submitted values with the server's copy.
    expect(didSaveResetConnections({ ...before, clientSecret: 'new' }, before)).toBe(false);
  });

  it('is false without a before/after pair', () => {
    expect(didSaveResetConnections(null, before)).toBe(false);
  });
});

describe('parseConfigObject', () => {
  it('parses a JSON object and rejects anything else', () => {
    expect(parseConfigObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseConfigObject('[1]')).toBeNull();
    expect(parseConfigObject('nope')).toBeNull();
    expect(parseConfigObject(undefined)).toBeNull();
  });
});

describe('hasClientSecretAfterSave', () => {
  const before = { authType: 'OAuth2', clientId: 'c', endpoint: 'https://x', hasClientSecret: true };

  it('follows the backend write rules', () => {
    expect(hasClientSecretAfterSave(before, { ...before, hasClientSecret: undefined })).toBe(true); // kept
    expect(hasClientSecretAfterSave({ ...before, hasClientSecret: false }, { ...before, clientSecret: 'new' })).toBe(true);
    expect(hasClientSecretAfterSave(before, { ...before, clearClientSecret: true })).toBe(false);
    expect(hasClientSecretAfterSave(before, { ...before, endpoint: 'https://y' })).toBe(false); // dropped
    expect(hasClientSecretAfterSave(before, { ...before, clientId: 'other' })).toBe(false); // dropped
    expect(hasClientSecretAfterSave(before, { ...before, authType: 'None' })).toBe(false);
    expect(hasClientSecretAfterSave(before, { ...before, authType: 1 })).toBe(true); // legacy int enum
  });
});

describe('settleClientSecretAfterSave', () => {
  const posted = { authType: 'OAuth2', clientSecret: 'saved' };

  it('removes the saved secret and sets hasClientSecret', () => {
    const settled = JSON.parse(settleClientSecretAfterSave(JSON.stringify({ authType: 'OAuth2', clientSecret: 'saved', hasClientSecret: false }), posted, true));
    expect(settled).toEqual({ authType: 'OAuth2', hasClientSecret: true });
  });

  it('keeps a different secret typed while the save was in flight', () => {
    const settled = JSON.parse(settleClientSecretAfterSave(JSON.stringify({ authType: 'OAuth2', clientSecret: 'newer' }), posted, true));
    expect(settled.clientSecret).toBe('newer');
  });

  it('removes a saved clear, but keeps one made after the save started', () => {
    const cleared = { authType: 'OAuth2', clearClientSecret: true };
    expect(JSON.parse(settleClientSecretAfterSave(JSON.stringify(cleared), cleared, false))).toEqual({ authType: 'OAuth2', hasClientSecret: false });
    expect(JSON.parse(settleClientSecretAfterSave(JSON.stringify(cleared), { authType: 'OAuth2' }, true)).clearClientSecret).toBe(true);
  });

  it('leaves hasClientSecret alone for a non-OAuth2 config and passes invalid JSON through', () => {
    expect(JSON.parse(settleClientSecretAfterSave('{"authType":"None"}', {}, false))).toEqual({ authType: 'None' });
    expect(settleClientSecretAfterSave('not json', {}, false)).toBe('not json');
  });
});
