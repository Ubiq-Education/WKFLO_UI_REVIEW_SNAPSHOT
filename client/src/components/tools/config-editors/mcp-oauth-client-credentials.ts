/**
 * US 7849 / Task 7851: helpers for an OAuth2 MCP tool's preconfigured client credentials
 * (Client ID, Client Secret) and requested Scopes, all stored inside the tool's `config` JSON.
 *
 * Backend contract (wkflo_services, Task 7850):
 * - `clientSecret` is never returned. Reads carry a read-only `hasClientSecret` instead.
 * - Writes: a blank or missing `clientSecret` keeps the stored secret; a non-empty one replaces
 *   it; `clearClientSecret: true` removes it. `hasClientSecret` on input is ignored.
 * - Changing `endpoint` or `clientId` without posting a new secret drops the stored secret.
 * - Changing the client ID, the secret (including a clear or a drop) or the endpoint deletes
 *   every existing connection (token) for the tool, so everyone has to connect again. An
 *   endpoint change resets connections even when no secret is stored.
 * - A config that isn't a valid JSON object is rejected with 400 WKFLOMD1205.
 * - `scopes` is a string array (`McpServerConfig.Scopes`). Empty means "request every scope
 *   the MCP server advertises".
 */

type ConfigLike = Record<string, unknown>;

const SCOPE_SEPARATOR = /[\s,]+/;

/** Splits admin-entered scopes on spaces and/or commas, dropping blanks and duplicates. */
export function parseScopes(text: string): string[] {
  const scopes: string[] = [];
  for (const part of text.split(SCOPE_SEPARATOR)) {
    if (part && !scopes.includes(part)) scopes.push(part);
  }
  return scopes;
}

/** Reads a stored `scopes` value as a clean string array, tolerating a missing or malformed value. */
export function readScopes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return parseScopes(value.filter((s): s is string => typeof s === "string").join(" "));
  }
  if (typeof value === "string") return parseScopes(value);
  return [];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function hasNewSecret(config: ConfigLike): boolean {
  return readString(config.clientSecret).trim() !== "";
}

/**
 * Shapes an MCP tool config for the save request: never posts the read-only `hasClientSecret`,
 * a blank `clientSecret` (blank means "keep" on the backend, so it's simply omitted), or a
 * `clearClientSecret` that isn't `true`. A new secret and a clear are mutually exclusive - the
 * new secret wins, matching the backend. Trims `clientId`. Applies to both the Save Tool button
 * and the Connection Mode auto-save, since both go through ToolForm's submitValues.
 */
export function normalizeMcpConfigForSubmit<T extends ConfigLike>(config: T): T {
  const next: ConfigLike = { ...config };
  delete next.hasClientSecret;

  if (!hasNewSecret(next)) delete next.clientSecret;
  if (next.clearClientSecret !== true || next.clientSecret !== undefined) delete next.clearClientSecret;

  if (typeof next.clientId === "string") next.clientId = next.clientId.trim();

  return next as T;
}

/** The parts of the config that decide which endpoint, client credentials and scopes Connect would use. */
function credentialsFingerprint(config: ConfigLike): string {
  return JSON.stringify([
    readString(config.endpoint).trim(),
    readString(config.clientId).trim(),
    hasNewSecret(config) ? readString(config.clientSecret) : "",
    config.clearClientSecret === true && !hasNewSecret(config),
    readScopes(config.scopes),
  ]);
}

/**
 * True when the endpoint, Client ID, Client Secret or Scopes in the form differ from the saved
 * config (whitespace-insensitive, like didSaveResetConnections). Connect is blocked meanwhile:
 * the backend starts the OAuth flow from the saved config, so connecting now would silently use
 * the old values - and saving an endpoint change resets every connection anyway.
 */
export function hasUnsavedClientCredentials(saved: ConfigLike | null, current: ConfigLike): boolean {
  if (!saved) return false;
  return credentialsFingerprint(saved) !== credentialsFingerprint(current);
}

/**
 * True when saving the form as it is would make the backend drop the stored secret: a secret is
 * saved, no new one was entered, and the endpoint or Client ID changed (the backend's guard
 * against redirecting the saved secret to a different server).
 */
export function willDropSavedSecret(saved: ConfigLike | null, current: ConfigLike): boolean {
  if (!saved || current.hasClientSecret !== true) return false;
  if (hasNewSecret(current) || current.clearClientSecret === true) return false;
  return (
    readString(current.endpoint).trim() !== readString(saved.endpoint).trim() ||
    readString(current.clientId).trim() !== readString(saved.clientId).trim()
  );
}

/**
 * Given the saved config before a save and the config that save posted, whether it changed the
 * client credentials or the endpoint - in which case the backend deleted every existing
 * connection for the tool. Only call it for a save that succeeded (the edit page does, from the
 * mutation's onSuccess): a baseline that moves for any other reason (initial load, a refetch)
 * says nothing about connections.
 */
export function didSaveResetConnections(before: ConfigLike | null, after: ConfigLike | null): boolean {
  if (!before || !after) return false;
  if (readString(before.clientId).trim() !== readString(after.clientId).trim()) return true;
  if (hasNewSecret(after)) return true;

  if (before.hasClientSecret === true && after.clearClientSecret === true) return true;
  // Any endpoint change resets connections, whether or not a secret is stored.
  return readString(before.endpoint).trim() !== readString(after.endpoint).trim();
}

function isOAuth2(config: ConfigLike): boolean {
  const authType = config.authType;
  return (typeof authType === "string" && authType.trim().toLowerCase() === "oauth2") || authType === 1;
}

/**
 * Whether the backend holds a client secret after saving `posted` (the normalized config that was
 * sent) over `before` (the config saved until then), following the write contract above.
 */
export function hasClientSecretAfterSave(before: ConfigLike | null, posted: ConfigLike): boolean {
  if (!isOAuth2(posted)) return false;
  if (hasNewSecret(posted)) return true;
  if (posted.clearClientSecret === true || !before) return false;
  const endpointOrClientIdChanged =
    readString(before.endpoint).trim() !== readString(posted.endpoint).trim() ||
    readString(before.clientId).trim() !== readString(posted.clientId).trim();
  return !endpointOrClientIdChanged && before.hasClientSecret === true;
}

/**
 * After a successful save, puts a form config in the state the backend now holds: removes the
 * secret / clear that were just saved (so a typed secret is never posted again and the field
 * shows "Secret saved") and sets `hasClientSecret`. A secret or clear entered while the save was
 * in flight differs from what was posted and is kept.
 */
export function settleClientSecretAfterSave(configStr: string, posted: ConfigLike, hasClientSecret: boolean): string {
  const config = parseConfigObject(configStr);
  if (!config) return configStr;

  if (!hasNewSecret(config) || readString(config.clientSecret) === readString(posted.clientSecret)) {
    delete config.clientSecret;
  }
  if (config.clearClientSecret !== true || posted.clearClientSecret === true) delete config.clearClientSecret;
  if (isOAuth2(config)) config.hasClientSecret = hasClientSecret;

  return JSON.stringify(config, null, 2);
}

/** Parses a config JSON string, or returns null when it isn't a JSON object. */
export function parseConfigObject(configStr: unknown): ConfigLike | null {
  if (typeof configStr !== "string") return null;
  try {
    const parsed = JSON.parse(configStr);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
