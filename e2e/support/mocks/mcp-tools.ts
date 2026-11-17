import { reply, type MockApi, type MockRequest } from "../mock-api";

/**
 * Mocks for MCP tools (create / edit page, OAuth connection panel, Functions panel).
 *
 * NOTE: the tool handlers here overlap with `e2e/support/mocks/tools.ts` from the Tools core slice
 * (Task 8164, PR 17191). They were written separately to avoid file clashes between the two
 * unmerged PRs; consolidate them into one store once both are merged.
 *
 * The handlers follow the real backend (wkflo_services, read-only):
 *
 * - Every success is HTTP 200 `{ data }`. A failed command is HTTP 400 `{ resultType: 2, errors: [{ code, property }] }`
 *   (InvalidResult), a missing resource HTTP 404 with `resultType: 4`, an unhandled error HTTP 500 with
 *   `resultType: 5` (ResultType enum: AMAIS.WKFLO.Common/Models/Results/ResultType.cs).
 * - Create / update / get (MD API, Tools/Commands/{CreateTenantTool,UpdateTenantTool}, Models/TenantTool*Result.cs):
 *   every result carries the config through `McpClientSecretHelper.SanitizeForResponse`, so the stored client secret
 *   is never returned and an OAuth2 config gets a read-only `hasClientSecret`.
 * - The write contract for the client secret is `McpClientSecretHelper.MergeOnWrite` (Common.MD.Domain/Security):
 *   a blank secret keeps the stored one, a new one replaces it (encrypted), `clearClientSecret: true` removes it, and
 *   changing the endpoint or the client id drops it. A client secret without a client id fails with
 *   WKFLOMD1204 (property `Config`). A change of client id, secret or endpoint deletes every OAuth token of the tool.
 * - Saving an OAuth2 MCP tool provisions `mcpOAuthConnectionId` and `redirectUri` (McpOAuthConnectionIdProvisioner),
 *   and re-serializes the config as a full `McpServerConfig` (Common/Models/Config/McpServerConfig.cs).
 * - OAuth (MD API, EndPoints/Tenant/Tools/ToolMcpOAuth{Status,Start,Disconnect}.cs), keyed by the connection id:
 *   status is `{ status, reason, connectedOnUtc }`; start and disconnect have a validator that fails with WKFLOMD0402
 *   for an unknown connection (HTTP 400); status has none, so an unknown connection is HTTP 404 WKFLOMD0403.
 *   Start answers WKFLOMD1201 (config not usable: `McpServerConfig.Validate()`) or WKFLOMD1202 (consent could not start).
 * - Functions (MD API GET / PUT `tenant/tool/{id}/functions`, AI API POST `tenant/tool/{id}/functions/discover`) share
 *   `ToolFunctionsBuilder` (Common.MD.Domain/Models/Tools/ToolPermissions/ToolFunctions.cs): the snapshot plus every enabled
 *   name that the snapshot no longer has (status Removed). The MD API codes are WKFLOMD0402 (validator: no such tool),
 *   WKFLOMD0407 (not an MCP tool) and WKFLOMD0408 (function not available); the AI API codes are WKFLOAI0403 (404),
 *   WKFLOAI0405 (OAuth not connected) and WKFLOAI0406 (server cannot be reached).
 *
 * Timestamps come from a fake clock that moves forward on every call, so "edited after publish" is decided
 * by the order of the calls and never by the wall clock.
 */

export interface StoredFunction {
  name: string;
  description: string | null;
  inputSchema: unknown;
  isNew: boolean;
  displayName: string | null;
  displayDescription: string | null;
}

export interface ServerFunction {
  name: string;
  description: string | null;
  inputSchema: unknown;
}

export interface StoredMcpTool {
  id: number;
  name: string;
  description: string;
  type: string;
  /** The config as the backend stores it: the client secret is kept in its encrypted form. */
  config: string;
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
  mcpOAuthConnectionId: string | null;
  maxToolOutputLength: number | null;
  permissionsEnabled: boolean;
  /** Set when the tool is published: the published copy's time. */
  publishedOn: string | null;
  /** The latest function snapshot; null until the functions were discovered once. */
  discoveredFunctions: StoredFunction[] | null;
  enabledFunctions: string[];
  functionsDiscoveredOn: string | null;
}

export interface OAuthState {
  status: "NotConnected" | "Connected" | "ConnectionIssue";
  reason: string | null;
  connectedOnUtc: string | null;
}

export interface McpToolsStore {
  tools: StoredMcpTool[];
  /** The OAuth token state per connection id (the caller's own row for a per-user tool). */
  oauth: Map<string, OAuthState>;
  /** What the fake MCP server answers to `tools/list` on the next "Refresh from server". */
  serverFunctions: ServerFunction[];
  /** Makes "Refresh from server" fail like an unreachable server (WKFLOAI0406). */
  discoverFails: boolean;
  /** Makes "Connect" fail like a consent flow that cannot start (WKFLOMD1202). */
  consentFails: boolean;
  /** The fake clock: each call returns a later ISO time. */
  now(): string;
  tool(id: number): StoredMcpTool;
  /** Sets the OAuth state of a tool's connection (what the status endpoint reports next). */
  setOAuth(toolId: number, state: Partial<OAuthState> & Pick<OAuthState, "status">): void;
}

/** Ids of the fixture tools. */
export const MCP_TOOL_IDS = {
  /** A plain HTTP tool, to switch to MCP in the editor. */
  http: 1,
  /** MCP over Stdio. */
  stdio: 2,
  /** MCP over Http without auth, with a function snapshot, published. */
  httpNoAuth: 3,
  /** MCP over Http + OAuth2, Shared connection, client credentials saved. */
  oauthShared: 4,
  /** MCP over Http + OAuth2, Per-user connection, dynamic client registration (no client id). */
  oauthPerUser: 5,
} as const;

/** The id the first tool created in a test gets. */
export const NEW_MCP_TOOL_ID = 6;

/** A fake secret. Only the mock ever sees it (the backend never returns it). */
export const FAKE_CLIENT_SECRET = "e2e-not-a-real-secret";

const CREATED_ON = "2026-01-15T09:00:00Z";
const REDIRECT_URI = "https://md.e2e.test/md/api/v1/tenant/tool/mcp/oauth/callback";
const SERVER_FUNCTIONS_SCHEMA = { type: "object", properties: { query: { type: "string" } } };

/** The functions the fake MCP server offers by default. */
export const DEFAULT_SERVER_FUNCTIONS: ServerFunction[] = [
  { name: "search_records", description: "Search records by keyword.", inputSchema: SERVER_FUNCTIONS_SCHEMA },
  { name: "get_record", description: "Fetch a single record by its ID.", inputSchema: SERVER_FUNCTIONS_SCHEMA },
  { name: "create_note", description: "Create a note on a record.", inputSchema: SERVER_FUNCTIONS_SCHEMA },
  { name: "list_tags", description: "List the tags of a record.", inputSchema: SERVER_FUNCTIONS_SCHEMA },
];

/** A GUID for a fixture tool's connection id (the routes only need a path segment, the real one is a GUID). */
export const connectionIdOf = (toolId: number) => `00000000-0000-4000-8000-${String(toolId).padStart(12, "0")}`;

/** The full runtime shape `McpServerConfig` serializes to (what the backend stores after provisioning). */
export function serverConfig(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "",
    name: "",
    transportType: "Stdio",
    command: "",
    arguments: [],
    environmentVariables: {},
    additionalHeaders: {},
    workingDirectory: "",
    endpoint: "",
    connectionTimeout: "00:00:30",
    maxRetries: 1,
    authType: "None",
    scopes: [],
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    oAuthScope: "Shared",
    ...fields,
  };
}

const encrypt = (plaintext: string) => `enc:v1:${Buffer.from(plaintext).toString("base64")}`;

function fixtureTool(id: number, name: string, description: string, type: string, config: unknown, extra: Partial<StoredMcpTool> = {}): StoredMcpTool {
  return {
    id,
    name,
    description,
    type,
    config: JSON.stringify(config),
    isActive: true,
    isDeleted: false,
    createdOn: CREATED_ON,
    lastUpdatedOn: null,
    mcpOAuthConnectionId: null,
    maxToolOutputLength: null,
    permissionsEnabled: false,
    publishedOn: null,
    discoveredFunctions: null,
    enabledFunctions: [],
    functionsDiscoveredOn: null,
    ...extra,
  };
}

function descriptor(fn: ServerFunction, extra: Partial<StoredFunction> = {}): StoredFunction {
  return { name: fn.name, description: fn.description, inputSchema: fn.inputSchema, isNew: false, displayName: null, displayDescription: null, ...extra };
}

/** The tools every MCP test starts with. */
export function createMcpToolFixtures(): StoredMcpTool[] {
  const [search, get, create, list] = DEFAULT_SERVER_FUNCTIONS;
  return [
    fixtureTool(MCP_TOOL_IDS.http, "E2E Lookup Tool", "Looks up a record over HTTP.", "HTTP", { method: "GET", url: "https://example.test/api" }),
    fixtureTool(
      MCP_TOOL_IDS.stdio,
      "E2E Stdio Server",
      "An MCP server started as a local process.",
      "MCP",
      {
        id: "e2e-stdio-server",
        transportType: "Stdio",
        command: "node",
        arguments: ["server.js", "--stdio"],
        environmentVariables: { E2E_API_BASE: "https://example.test/api" },
        endpoint: "",
        additionalHeaders: {},
        authType: "None",
        oAuthScope: "Shared",
      },
    ),
    // Published and not edited since. One function is New, one is Removed (enabled, gone from the server).
    fixtureTool(
      MCP_TOOL_IDS.httpNoAuth,
      "E2E Http Server",
      "An MCP server reached over Http.",
      "MCP",
      {
        id: "e2e-http-server",
        transportType: "Http",
        command: "",
        arguments: [],
        environmentVariables: {},
        endpoint: "https://mcp.example.test/mcp",
        additionalHeaders: { "X-E2E-Header": "e2e-value" },
        authType: "None",
        oAuthScope: "Shared",
      },
      {
        permissionsEnabled: true,
        publishedOn: "2026-01-20T09:00:00Z",
        functionsDiscoveredOn: "2026-01-18T09:00:00Z",
        enabledFunctions: ["search_records", "legacy_export"],
        discoveredFunctions: [
          descriptor(search),
          descriptor(get, { displayName: "Look up record", displayDescription: "Finds one record by its ID." }),
          descriptor(create, { isNew: true }),
          descriptor(list),
        ],
      },
    ),
    fixtureTool(
      MCP_TOOL_IDS.oauthShared,
      "E2E OAuth Server",
      "An MCP server that needs OAuth 2.1 consent.",
      "MCP",
      serverConfig({
        id: "e2e-oauth-server",
        transportType: "Http",
        endpoint: "https://oauth-mcp.example.test/mcp",
        authType: "OAuth2",
        scopes: ["records:read"],
        clientId: "e2e-client-id",
        clientSecret: encrypt(FAKE_CLIENT_SECRET),
        redirectUri: REDIRECT_URI,
        oAuthScope: "Shared",
      }),
      { mcpOAuthConnectionId: connectionIdOf(MCP_TOOL_IDS.oauthShared), permissionsEnabled: true },
    ),
    fixtureTool(
      MCP_TOOL_IDS.oauthPerUser,
      "E2E Personal OAuth Server",
      "An MCP server where every admin connects their own account.",
      "MCP",
      serverConfig({
        id: "e2e-personal-server",
        transportType: "Http",
        endpoint: "https://personal-mcp.example.test/mcp",
        authType: "OAuth2",
        redirectUri: REDIRECT_URI,
        oAuthScope: "PerUser",
      }),
      { mcpOAuthConnectionId: connectionIdOf(MCP_TOOL_IDS.oauthPerUser) },
    ),
  ];
}

/** A copy of a fixture tool with different fields (e.g. a config of its own). */
export function withMcpFields(tool: StoredMcpTool, fields: Partial<StoredMcpTool>): StoredMcpTool {
  return { ...tool, ...fields };
}

/**
 * The reply of a failed command: HTTP 400 is an InvalidResult (`resultType` 2), 404 a NotFoundResult (4), 500 an
 * UnexpectedResult (5). Errors are `{ code, property }` pairs, passed here as `[property, code]`. The shape is the one
 * the repo's own client tests use (client/src/services/tenant-api-service.test.ts).
 */
export function mcpErrorReply(status: 400 | 404 | 500, ...errors: Array<[property: string, code: string]>) {
  const resultType = status === 400 ? 2 : status === 404 ? 4 : 5;
  return reply({ resultType, errors: errors.map(([property, code]) => ({ code, property })) }, status);
}

/** The command validators' answer for a tool that is not a live tool of the tenant (MD API). */
const toolMustExist = () => mcpErrorReply(400, ["Tool", "WKFLOMD0402"]);

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const secretOf = (config: Json) => (typeof config.clientSecret === "string" ? config.clientSecret : "");

function parseObject(json: string | null): Json | null {
  if (json === null) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isOAuth2(config: Json): boolean {
  return typeof config.authType === "string" ? config.authType.toLowerCase() === "oauth2" : config.authType === 1;
}

/** McpClientSecretHelper.SanitizeForResponse: no secret, no clear flag, a read-only hasClientSecret for OAuth2. */
function sanitizeForResponse(tool: StoredMcpTool): string {
  const config = parseObject(tool.config);
  if (!config || tool.type !== "MCP") return tool.config;
  const hasKeys = "clientSecret" in config || "hasClientSecret" in config || "clearClientSecret" in config;
  if (!isOAuth2(config) && !hasKeys) return tool.config;
  const hasSecret = secretOf(config) !== "";
  delete config.clientSecret;
  delete config.clearClientSecret;
  config.hasClientSecret = hasSecret;
  return JSON.stringify(config);
}

interface MergeResult {
  config: string;
  credentialsChanged: boolean;
  error?: "WKFLOMD1204" | "WKFLOMD1205";
}

/** McpClientSecretHelper.MergeOnWrite, for the camelCase configs the UI posts. */
function mergeOnWrite(type: string, newConfigJson: string, previousConfigJson: string | null): MergeResult {
  if (type !== "MCP") return { config: newConfigJson, credentialsChanged: false };
  const config = parseObject(newConfigJson);
  if (!config) return { config: newConfigJson, credentialsChanged: false, error: "WKFLOMD1205" };
  const previous = parseObject(previousConfigJson);

  delete config.hasClientSecret;
  const clearRequested = config.clearClientSecret === true || config.clearClientSecret === "true";
  delete config.clearClientSecret;

  const oauth2 = isOAuth2(config);
  const incoming = secretOf(config);
  const hasIncomingSecret = incoming.trim() !== "" && !incoming.startsWith("enc:v1:");
  const clientId = trimmed(config.clientId);
  if (oauth2 && hasIncomingSecret && clientId === "") return { config: newConfigJson, credentialsChanged: false, error: "WKFLOMD1204" };

  const previousSecret = previous ? secretOf(previous) : "";
  const hadPreviousSecret = previousSecret !== "";
  const clientIdChanged = previous !== null && trimmed(previous.clientId) !== clientId;
  const endpointChanged = previous !== null && trimmed(previous.endpoint) !== trimmed(config.endpoint);

  let stored: string | null;
  let secretChanged: boolean;
  if (!oauth2) {
    stored = null;
    secretChanged = hadPreviousSecret;
  } else if (hasIncomingSecret) {
    stored = encrypt(incoming);
    secretChanged = !hadPreviousSecret || previousSecret !== stored;
  } else if (clearRequested || clientIdChanged || endpointChanged) {
    stored = null;
    secretChanged = hadPreviousSecret;
  } else if (hadPreviousSecret) {
    stored = previousSecret;
    secretChanged = false;
  } else {
    stored = null;
    secretChanged = false;
  }

  if (stored === null) delete config.clientSecret;
  else config.clientSecret = stored;

  return { config: JSON.stringify(config), credentialsChanged: clientIdChanged || endpointChanged || secretChanged };
}

/** McpServerConfig.Validate(), for the saved config of an OAuth2 tool. Returns whether the config is usable. */
function isUsableOAuthConfig(tool: StoredMcpTool): boolean {
  const config = parseObject(tool.config);
  if (!config || tool.type !== "MCP" || !isOAuth2(config)) return false;
  if (trimmed(config.id) === "" || trimmed(tool.name) === "") return false;
  if (config.transportType !== "Http") return false;
  const isAbsoluteUri = (value: unknown) => {
    try {
      new URL(trimmed(value));
      return true;
    } catch {
      return false;
    }
  };
  return isAbsoluteUri(config.endpoint) && isAbsoluteUri(config.redirectUri);
}

/** ToolFunctionsBuilder.Build: the snapshot, then every enabled name the snapshot no longer has (Removed). */
function buildFunctions(tool: StoredMcpTool) {
  const snapshot = tool.discoveredFunctions ?? [];
  const names = new Set(snapshot.map((fn) => fn.name));
  const functions = [
    ...snapshot.map((fn) => ({
      name: fn.name,
      description: fn.description,
      inputSchema: fn.inputSchema,
      isEnabled: tool.enabledFunctions.includes(fn.name),
      status: fn.isNew ? "New" : "Active",
      displayName: fn.displayName,
      displayDescription: fn.displayDescription,
    })),
    ...tool.enabledFunctions
      .filter((name) => !names.has(name))
      .sort()
      .map((name) => ({ name, description: null, inputSchema: null, isEnabled: true, status: "Removed", displayName: null, displayDescription: null })),
  ];
  return { functions, functionsDiscoveredOn: tool.functionsDiscoveredOn };
}

/** The display value as the backend stores it: trimmed, blank means not set (McpFunctionDescriptor.NormalizeDisplayValue). */
const normalizeDisplay = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/**
 * Registers the MCP tool handlers on `mockApi` and returns the store behind them.
 * `tools` replaces the default fixtures.
 */
export function installMcpToolsMocks(mockApi: MockApi, options: { tools?: StoredMcpTool[] } = {}): McpToolsStore {
  const tools = options.tools ?? createMcpToolFixtures();
  let tick = 0;
  // Starts after every fixture timestamp, then moves one minute per call.
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();
  const oauth = new Map<string, OAuthState>();

  const live = (id: string) => tools.find((tool) => String(tool.id) === id && !tool.isDeleted);
  // Reads do not hide soft-deleted tools: GetTenantToolByIdQueryHandler and GetToolMcpOAuthStatusQueryHandler filter
  // by id / connection id and tenant only, and DeleteTenantToolCommandHandler keeps the connection id and tokens.
  const anyTool = (id: string) => tools.find((tool) => String(tool.id) === id);
  const anyByConnection = (id: string) => tools.find((tool) => tool.mcpOAuthConnectionId === id);
  const byConnection = (id: string) => tools.find((tool) => tool.mcpOAuthConnectionId === id && !tool.isDeleted);

  const store: McpToolsStore = {
    tools,
    oauth,
    serverFunctions: DEFAULT_SERVER_FUNCTIONS.map((fn) => ({ ...fn })),
    discoverFails: false,
    consentFails: false,
    now,
    tool(id) {
      const found = tools.find((tool) => tool.id === id);
      if (!found) throw new Error(`No fixture tool ${id}`);
      return found;
    },
    setOAuth(toolId, state) {
      const connectionId = store.tool(toolId).mcpOAuthConnectionId;
      if (!connectionId) throw new Error(`Tool ${toolId} has no OAuth connection`);
      oauth.set(connectionId, { reason: null, connectedOnUtc: state.status === "NotConnected" ? null : "2026-02-01T09:00:00Z", ...state });
    },
  };

  const toGetResult = (tool: StoredMcpTool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    type: tool.type,
    config: sanitizeForResponse(tool),
    isActive: tool.isActive,
    isPublished: tool.publishedOn !== null,
    isShared: false,
    isDeleted: tool.isDeleted,
    createdOn: tool.createdOn,
    lastUpdatedOn: tool.lastUpdatedOn,
    lastPublishedOn: tool.publishedOn,
    mcpOAuthConnectionId: tool.mcpOAuthConnectionId,
    maxToolOutputLength: tool.maxToolOutputLength,
    permissionsEnabled: tool.permissionsEnabled,
    tags: [],
  });

  // TenantToolCreateResult / TenantToolUpdateResult: the same fields, no publish state.
  const toWriteResult = (tool: StoredMcpTool) => {
    const { isPublished: _p, isShared: _s, lastPublishedOn: _l, tags: _t, ...result } = toGetResult(tool);
    return result;
  };

  /** McpOAuthConnectionIdProvisioner.EnsureProvisioned: connection id + redirect uri, config re-serialized as McpServerConfig. */
  const provision = (tool: StoredMcpTool) => {
    const config = parseObject(tool.config);
    if (tool.type !== "MCP" || !config || !isOAuth2(config)) return;
    let changed = false;
    if (tool.mcpOAuthConnectionId === null) {
      tool.mcpOAuthConnectionId = connectionIdOf(tool.id);
      changed = true;
    }
    if (config.redirectUri !== REDIRECT_URI) {
      config.redirectUri = REDIRECT_URI;
      changed = true;
    }
    if (changed) {
      const known = Object.keys(serverConfig({}));
      const kept = Object.fromEntries(Object.entries(config).filter(([key]) => known.includes(key)));
      tool.config = JSON.stringify(serverConfig(kept));
    }
  };

  mockApi.on("GET", "/md/api/v1/tenant/tools", () => tools.filter((tool) => !tool.isDeleted).map(toGetResult));

  mockApi.on("GET", "/md/api/v1/tenant/tool/:id", ({ params }) => {
    const tool = anyTool(params.id);
    // GetTenantToolByIdQueryHandler returns a bare NotFoundResult(): no error entries.
    return tool ? toGetResult(tool) : reply({ resultType: 4, errors: [] }, 404);
  });

  mockApi.on("POST", "/md/api/v1/tenant/tool", ({ body }: MockRequest) => {
    const input = body as Json;
    const type = String(input.type ?? "");
    const merged = mergeOnWrite(type, String(input.config ?? ""), null);
    // CreateTenantToolCommandHandler: the 1205 / 1204 checks come before anything is saved.
    if (merged.error) return mcpErrorReply(400, ["Config", merged.error]);
    const tool = fixtureTool(
      tools.reduce((max, existing) => Math.max(max, existing.id), 0) + 1,
      String(input.name ?? ""),
      String(input.description ?? ""),
      type,
      {},
      {
        config: merged.config,
        // `isActive` is a plain bool in CreateTenantToolCommand: false when omitted.
        isActive: input.isActive === true,
        createdOn: now(),
        maxToolOutputLength: (input.maxToolOutputLength as number | null | undefined) ?? null,
        permissionsEnabled: input.permissionsEnabled === true,
      },
    );
    provision(tool);
    tools.push(tool);
    return toWriteResult(tool);
  });

  mockApi.on("PUT", "/md/api/v1/tenant/tool/:id", ({ params, body }: MockRequest) => {
    const tool = live(params.id);
    const input = body as Json;
    if (!tool) return toolMustExist();
    const before = { ...tool };
    const previousType = tool.type;
    const previousConfig = tool.config;
    if (typeof input.name === "string") tool.name = input.name;
    if (typeof input.description === "string") tool.description = input.description;
    if (typeof input.type === "string") tool.type = input.type;
    if (typeof input.config === "string") tool.config = input.config;
    if (typeof input.isActive === "boolean") tool.isActive = input.isActive;
    if (typeof input.permissionsEnabled === "boolean") tool.permissionsEnabled = input.permissionsEnabled;
    // Bug 7871 behaviour: an explicit null clears the cap, an omitted field keeps it.
    if ("maxToolOutputLength" in input) tool.maxToolOutputLength = (input.maxToolOutputLength as number | null) ?? null;

    const merged = mergeOnWrite(tool.type, tool.config, previousType === "MCP" ? previousConfig : null);
    if (merged.error) {
      // UpdateTenantToolCommandHandler returns before saving: the stored tool stays as it was.
      Object.assign(tool, before);
      return mcpErrorReply(400, ["Config", merged.error]);
    }
    tool.config = merged.config;
    const leftMcp = previousType === "MCP" && tool.type !== "MCP";
    if (leftMcp) {
      const config = parseObject(tool.config);
      if (config) {
        for (const key of ["clientId", "clientSecret", "hasClientSecret", "clearClientSecret"]) delete config[key];
        tool.config = JSON.stringify(config);
      }
    }
    provision(tool);
    if ((merged.credentialsChanged || leftMcp) && tool.mcpOAuthConnectionId) oauth.delete(tool.mcpOAuthConnectionId);
    tool.lastUpdatedOn = now();
    return toWriteResult(tool);
  });

  mockApi.on("DELETE", "/md/api/v1/tenant/tool/:id", ({ params }) => {
    const tool = live(params.id);
    if (!tool) return toolMustExist();
    tool.isDeleted = true;
    return { id: tool.id };
  });

  mockApi.on("POST", "/md/api/v1/tenant/tool/:id/publish", ({ params }) => {
    const tool = live(params.id);
    if (!tool) return toolMustExist();
    tool.publishedOn = now();
    return {
      id: tool.id,
      toolType: tool.type,
      name: tool.name,
      description: tool.description,
      type: tool.type,
      config: sanitizeForResponse(tool),
      isActive: tool.isActive,
      createdByTenantToolId: tool.id,
      isDeleted: false,
      createdOn: tool.publishedOn,
      lastUpdatedOn: null,
    };
  });

  // --- OAuth connection ---------------------------------------------------------------------------------
  const oauthPath = "/md/api/v1/tenant/tool/:id/mcp/oauth";

  mockApi.on("GET", `${oauthPath}/status`, ({ params }) => {
    const tool = anyByConnection(params.id);
    // GetToolMcpOAuthStatusQueryHandler: no validator for the tool, so an unknown connection is a 404.
    if (!tool) return mcpErrorReply(404, ["Tool", "WKFLOMD0403"]);
    const state = oauth.get(params.id) ?? { status: "NotConnected", reason: null, connectedOnUtc: null };
    return { status: state.status, reason: state.reason, connectedOnUtc: state.connectedOnUtc };
  });

  mockApi.on("GET", `${oauthPath}/start`, ({ params }) => {
    const tool = byConnection(params.id);
    if (!tool) return toolMustExist();
    if (!isUsableOAuthConfig(tool)) return mcpErrorReply(400, ["Config", "WKFLOMD1201"]);
    if (store.consentFails) return mcpErrorReply(400, ["Tool", "WKFLOMD1202"]);
    return { authorizationUrl: `https://auth.e2e.test/authorize?client_id=e2e&state=e2e-state-${tool.id}` };
  });

  mockApi.on("DELETE", oauthPath, ({ params }) => {
    const tool = byConnection(params.id);
    if (!tool) return toolMustExist();
    oauth.delete(params.id);
    return { id: params.id };
  });

  // --- Functions ----------------------------------------------------------------------------------------
  mockApi.on("GET", "/md/api/v1/tenant/tool/:id/functions", ({ params }) => {
    const tool = live(params.id);
    if (!tool) return toolMustExist();
    if (tool.type !== "MCP") return mcpErrorReply(400, ["Type", "WKFLOMD0407"]);
    return buildFunctions(tool);
  });

  mockApi.on("PUT", "/md/api/v1/tenant/tool/:id/functions", ({ params, body }: MockRequest) => {
    const tool = live(params.id);
    if (!tool) return toolMustExist();
    const input = body as { enabledFunctions?: string[]; functions?: Array<{ name: string; displayName?: string | null; displayDescription?: string | null }> };
    if (tool.type !== "MCP") return mcpErrorReply(400, ["Type", "WKFLOMD0407"]);

    // Only names of the snapshot, plus names that are already enabled, may be enabled.
    const snapshot = tool.discoveredFunctions ?? [];
    const enableable = new Set([...snapshot.map((fn) => fn.name), ...tool.enabledFunctions]);
    const requested = Array.from(new Set(input.enabledFunctions ?? []));
    if (requested.some((name) => !enableable.has(name))) return mcpErrorReply(400, ["EnabledFunctions", "WKFLOMD0408"]);
    const display = input.functions ?? [];
    if (display.some((fn) => !snapshot.some((known) => known.name === fn.name))) return mcpErrorReply(400, ["Functions", "WKFLOMD0408"]);

    tool.enabledFunctions = requested;
    // Saving means every listed function was reviewed (MarkAllReviewed); display values replace both fields of a function.
    if (tool.discoveredFunctions) {
      tool.discoveredFunctions = tool.discoveredFunctions.map((fn) => {
        const update = display.find((entry) => entry.name === fn.name);
        return {
          ...fn,
          isNew: false,
          ...(update ? { displayName: normalizeDisplay(update.displayName), displayDescription: normalizeDisplay(update.displayDescription) } : {}),
        };
      });
    }
    tool.lastUpdatedOn = now();
    return buildFunctions(tool);
  });

  // AI API: connects to the MCP server and saves the result as the tool's snapshot (DiscoverTenantToolFunctionsCommandHandler).
  mockApi.on("POST", "/ai/api/v1/tenant/tool/:id/functions/discover", ({ params }) => {
    const tool = live(params.id);
    if (!tool) return mcpErrorReply(404, ["TenantTool", "WKFLOAI0403"]);
    if (tool.type !== "MCP") return mcpErrorReply(400, ["Type", "WKFLOAI0404"]);
    const config = parseObject(tool.config);
    if (config && isOAuth2(config)) {
      const connected = tool.mcpOAuthConnectionId !== null && (oauth.get(tool.mcpOAuthConnectionId)?.status ?? "NotConnected") !== "NotConnected";
      if (!connected) return mcpErrorReply(400, ["Tool", "WKFLOAI0405"]);
    }
    if (store.discoverFails) return mcpErrorReply(400, ["Tool", "WKFLOAI0406"]);

    // ToolFunctionsBuilder.MergeSnapshot: a known function keeps its New flag and display text, an unknown one is New
    // unless it is already enabled.
    const previous = new Map((tool.discoveredFunctions ?? []).map((fn) => [fn.name, fn]));
    tool.discoveredFunctions = store.serverFunctions.map((fn) => {
      const known = previous.get(fn.name);
      return descriptor(fn, {
        isNew: known ? known.isNew : !tool.enabledFunctions.includes(fn.name),
        displayName: known?.displayName ?? null,
        displayDescription: known?.displayDescription ?? null,
      });
    });
    tool.functionsDiscoveredOn = now();
    tool.lastUpdatedOn = now();
    return buildFunctions(tool);
  });

  return store;
}

/** The recorded body of the last `method` call to `pattern`, or undefined when there was none. */
export function lastBody<T = Record<string, unknown>>(mockApi: MockApi, method: "POST" | "PUT" | "DELETE", pattern: string): T | undefined {
  return mockApi.requestsTo(method, pattern).at(-1)?.body as T | undefined;
}

/** The parsed `config` of the last PUT / POST of a tool. */
export function lastSavedConfig(mockApi: MockApi, method: "POST" | "PUT" = "PUT"): Json {
  const pattern = method === "PUT" ? "/md/api/v1/tenant/tool/:id" : "/md/api/v1/tenant/tool";
  const body = lastBody<{ config: string }>(mockApi, method, pattern);
  return JSON.parse(body?.config ?? "null") as Json;
}
