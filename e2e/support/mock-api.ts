import type { Page, Route } from "@playwright/test";
import { createSeed, FAKE_AGENT_JWT, TENANT_A, type Seed } from "./fixtures";
import { TENANT_HEADER } from "./mocks/marketplace";

/** Fake API origin. Served through page.route(), nothing ever listens on it. */
export const API_ORIGIN = "https://api.e2e.test";

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface MockRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

/** Return this from a handler to control the status or send a raw (unwrapped) body. */
export class MockReply {
  constructor(
    readonly body: unknown,
    readonly status = 200,
  ) {}
}

export const reply = (body: unknown, status = 200) => new MockReply(body, status);

export interface RawReplyOptions {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
}

/** Return this from a handler to send raw bytes or text as they are (downloads, non-JSON bodies). */
export class MockRawReply {
  constructor(
    readonly body: string | Buffer,
    readonly options: RawReplyOptions = {},
  ) {}
}

export const replyRaw = (body: string | Buffer, options: RawReplyOptions = {}) => new MockRawReply(body, options);

/** One recorded API call. `url` is the path plus the query string. */
export interface RecordedRequest {
  method: string;
  path: string;
  url: string;
  body: unknown;
}

type Handler = (request: MockRequest) => unknown;

interface RouteEntry {
  method: Method;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

export interface MockApiOptions {
  isSuperPowerUser: boolean;
}

function nextId<T extends { id: number | string }>(items: T[]): T["id"] {
  if (items.some((item) => typeof item.id === "string")) {
    // Not items.length + 1: that repeats an id after a delete followed by a create.
    let n = items.length + 1;
    while (items.some((item) => item.id === `e2e-new-${n}`)) n += 1;
    return `e2e-new-${n}` as T["id"];
  }
  return (items.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1) as T["id"];
}

function compilePath(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:([A-Za-z]+)/g, (_match, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${source}$`), keys };
}

/**
 * A small stateful stand-in for the WKFlo MD/AI APIs. Entity collections live in memory, seeded
 * from fixtures, and the registered handlers read and write them, so a test can create an entity
 * and then see it in the list. Responses use the API's `{ data, resultType }` envelope.
 *
 * Any request that no handler matches is recorded in `unmocked` and answered with a 501; the
 * e2e `test` fixture fails the test when that list is not empty.
 */
export class MockApi {
  readonly seed: Seed = createSeed();
  readonly requests: RecordedRequest[] = [];
  readonly unmocked: string[] = [];
  /** Tag ids assigned per entity, keyed `${entityType}:${entityId}`. Seed it to start with tags assigned. */
  readonly entityTags = new Map<string, number[]>();
  private readonly routes: RouteEntry[] = [];

  constructor(readonly options: MockApiOptions) {
    this.registerDefaults();
  }

  /** Registers a handler. Later registrations win, so a test can override a default. */
  on(method: Method, pattern: string, handler: Handler): this {
    this.routes.unshift({ method, ...compilePath(pattern), handler });
    return this;
  }

  /** Registers list / get / create / update / delete handlers over one seeded collection. */
  collection<T extends { id: number | string }>(
    items: T[],
    paths: { list: string; item: string; create?: string },
    options: { newItem?: (body: Partial<T>, id: T["id"]) => T } = {},
  ): this {
    this.on("GET", paths.list, () => items);
    this.on("GET", paths.item, ({ params }) => {
      const found = items.find((item) => String(item.id) === params.id);
      return found ? found : reply({ message: "Not found" }, 404);
    });
    this.on("POST", paths.create ?? paths.item.replace("/:id", ""), ({ body }) => {
      const id = nextId(items);
      const created = options.newItem ? options.newItem(body as Partial<T>, id) : ({ ...(body as object), id } as T);
      items.push(created);
      return created;
    });
    this.on("PUT", paths.item, ({ params, body }) => {
      const index = items.findIndex((item) => String(item.id) === params.id);
      if (index < 0) return reply({ message: "Not found" }, 404);
      items[index] = { ...items[index], ...(body as object) };
      return items[index];
    });
    this.on("DELETE", paths.item, ({ params }) => {
      const index = items.findIndex((item) => String(item.id) === params.id);
      if (index >= 0) items.splice(index, 1);
      return true;
    });
    return this;
  }

  /** The recorded calls whose method matches and whose path matches `pattern` (`:param` or a RegExp). */
  requestsTo(method: Method, pattern: string | RegExp): RecordedRequest[] {
    const regex = typeof pattern === "string" ? compilePath(pattern).regex : pattern;
    return this.requests.filter((request) => {
      // A caller's global or sticky RegExp keeps lastIndex between test() calls.
      regex.lastIndex = 0;
      return request.method === method && regex.test(request.path);
    });
  }

  private registerDefaults() {
    const { seed, options } = this;

    // Layout baseline: every signed-in page loads these.
    this.on("GET", "/md/api/v1/me/permissions", () => ({
      isSuperPowerUser: options.isSuperPowerUser,
      accessibleTenantGuids: options.isSuperPowerUser ? [] : [TENANT_A.guid],
    }));
    this.on("GET", "/md/api/v1/tenants", () => seed.tenants);
    this.on("GET", "/ai/api/v1/tenant/jwt/token", () => FAKE_AGENT_JWT);

    this.collection(seed.agents, {
      list: "/md/api/v1/tenant/agents",
      item: "/md/api/v1/tenant/agent/:id",
      create: "/md/api/v1/tenant/agent",
    });
    this.collection(seed.tools, {
      list: "/md/api/v1/tenant/tools",
      item: "/md/api/v1/tenant/tool/:id",
      create: "/md/api/v1/tenant/tool",
    });
    this.collection(seed.tags, {
      list: "/md/api/v1/tenant/tags",
      item: "/md/api/v1/tenant/tag/:id",
      create: "/md/api/v1/tenant/tag",
    });
    this.on("GET", "/md/api/v1/tenant/knowledge", () => seed.knowledge);
    this.collection(seed.secrets, {
      list: "/md/api/v1/secrets",
      item: "/md/api/v1/secret/:id",
      create: "/md/api/v1/secret",
    });
    this.on("GET", "/md/api/v1/secrets/available", () => seed.secrets);
    this.collection(seed.aiModels, {
      list: "/md/api/v1/ai-models",
      item: "/md/api/v1/ai-model/:id",
      create: "/md/api/v1/ai-model",
    });
    this.on("GET", "/md/api/v1/marketplace/agents", () => seed.marketplaceAgents);
    this.on("GET", "/md/api/v1/marketplace/items", () => seed.marketplaceItems);

    this.on("GET", "/md/api/v1/super-power-users", () => seed.superPowerUsers);
    this.on("GET", "/md/api/v1/tenant-access", () => seed.tenantAccess);
    this.on("GET", "/md/api/v1/tenant/web-origins", ({ headers }) =>
      seed.webOrigins
        .filter((row) => row.tenantGuid === headers[TENANT_HEADER])
        .map(({ tenantGuid: _tenantGuid, ...row }) => row),
    );
    this.on("GET", "/md/api/v1/tenant/settings", () => seed.tenantSettings);
    this.on("PUT", "/md/api/v1/tenant/settings", ({ body }) => Object.assign(seed.tenantSettings, body));

    // Per-entity sub-resources. Detail pages request these next to the entity itself.
    this.on("GET", "/md/api/v1/tenant/agent/:id/tools", () => seed.agentTools);
    this.registerEntityTags();
    this.on("GET", "/md/api/v1/tenant/agent/:id/chat-setting/:kind", ({ params }) => ({
      ...seed.chatSetting,
      agentId: Number(params.id),
      isWidget: params.kind === "widget",
    }));
    this.on("GET", "/md/api/v1/ai-model/:id/ai-credit", ({ params }) => ({ ...seed.aiCredit, aiModelId: Number(params.id) }));

    this.on("GET", "/md/api/v1/tenant/audit", ({ query }) => {
      const page = Number(query.get("page") ?? 1);
      const pageSize = Number(query.get("pageSize") ?? 25);
      const all = seed.auditEntries;
      const items = all.slice((page - 1) * pageSize, page * pageSize);
      return { items, totalCount: all.length, page, pageSize, totalPages: Math.max(1, Math.ceil(all.length / pageSize)) };
    });

    this.registerPageLoadDefaults();
    this.registerChatDefaults();
  }

  /** GETs that the agent / tool pages fire on load, so feature slices never have to mock them. */
  private registerPageLoadDefaults() {
    this.on("GET", "/md/api/v1/tenant/agent/:id/tools/permissions", () => []);
    this.on("GET", "/ai/api/v1/tenant/agent/:id/spin-up/agents", () => []);
    this.on("GET", "/md/api/v1/tenant/agent/:id/chats", () => []);
    this.on("GET", "/md/api/v1/tenant/agent/:id/topic-classification-summary", () => []);
    this.on("GET", "/md/api/v1/tenant/tool/:id/functions", () => ({ functions: [], functionsDiscoveredOn: null }));
  }

  /** What a chat fires when it mounts, for the public (share id) and the tenant (agent id) variants. */
  private registerChatDefaults() {
    const { seed } = this;
    for (const base of ["/ai/api/v1/agent/:agentRef", "/ai/api/v1/tenant/agent/:agentRef"]) {
      this.on("GET", `${base}/chat/configuration`, ({ params }) => ({
        ...seed.chatSetting,
        agentId: Number(params.agentRef) || seed.chatSetting.agentId,
      }));
      this.on("GET", `${base}/spin-up/agents`, () => []);
      this.on("GET", `${base}/chat/:sessionId/session-messages`, () => []);
    }
    // SignalR's HTTP handshake. It answers with the bare negotiate payload, not the API envelope.
    this.on("POST", "/ai/api/v1/chathub/negotiate", () =>
      reply({
        negotiateVersion: 1,
        connectionId: "e2e-conn",
        connectionToken: "e2e-token",
        availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
      }),
    );
  }

  /** A stateful tag-assignment store: GET / assign (POST) / unassign (DELETE) for any entity. */
  private registerEntityTags() {
    const { seed, entityTags } = this;
    this.on("GET", "/md/api/v1/tenant/entity/:entityType/:entityId/tags", ({ params }) => {
      const ids = entityTags.get(`${params.entityType}:${params.entityId}`) ?? [];
      return seed.tags.filter((tag) => ids.includes(tag.id));
    });
    this.on("POST", "/md/api/v1/tenant/tag/:tagId/entity", ({ params, body }) => {
      const { entityType, entityId } = body as { entityType: string; entityId: number | string };
      const key = `${entityType}:${entityId}`;
      const ids = entityTags.get(key) ?? [];
      if (!ids.includes(Number(params.tagId))) ids.push(Number(params.tagId));
      entityTags.set(key, ids);
      return true;
    });
    this.on("DELETE", "/md/api/v1/tenant/tag/:tagId/entity/:entityType/:entityId", ({ params }) => {
      const key = `${params.entityType}:${params.entityId}`;
      entityTags.set(
        key,
        (entityTags.get(key) ?? []).filter((id) => id !== Number(params.tagId)),
      );
      return true;
    });
  }

  /** Wires this mock into a page: CORS preflights, the API origin, and the unmocked catch-all. */
  async install(page: Page): Promise<void> {
    await page.route(
      (url) => url.origin === API_ORIGIN,
      (route) => this.handle(route),
    );
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const corsHeaders: Record<string, string> = {
      "access-control-allow-origin": request.headers()["origin"] ?? "*",
      // SignalR negotiates with credentials: 'include', which browsers only allow with this header.
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "*",
      "access-control-max-age": "600",
    };

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const method = request.method();
    const raw = request.postData();
    let body: unknown = undefined;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    this.requests.push({ method, path: url.pathname, url: `${url.pathname}${url.search}`, body });
    const match = this.routes.find((entry) => entry.method === method && entry.regex.test(url.pathname));
    if (!match) {
      this.unmocked.push(`${method} ${url.pathname}${url.search}`);
      await route.fulfill({ status: 501, headers: corsHeaders, json: { message: "Unmocked e2e request" } });
      return;
    }

    const values = match.regex.exec(url.pathname)?.slice(1) ?? [];
    const params = Object.fromEntries(match.keys.map((key, index) => [key, decodeURIComponent(values[index])]));
    const result = match.handler({ method, path: url.pathname, params, query: url.searchParams, body, headers: request.headers() });
    if (result instanceof MockRawReply) {
      const { status = 200, contentType = "application/octet-stream", headers = {} } = result.options;
      await route.fulfill({ status, contentType, headers: { ...corsHeaders, ...headers }, body: result.body });
      return;
    }
    // The MD and AI APIs serialise ResultType as a number; Ok is 0 (AMAIS.WKFLO.Common/Models/Results/ResultType.cs).
    const response = result instanceof MockReply ? result : new MockReply({ data: result, resultType: 0 });
    await route.fulfill({ status: response.status, headers: corsHeaders, json: response.body });
  }
}
