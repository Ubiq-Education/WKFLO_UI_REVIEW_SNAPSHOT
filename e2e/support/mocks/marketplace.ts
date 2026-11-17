import type { Page } from "@playwright/test";
import { reply, type MockApi, type MockRequest } from "../mock-api";

/**
 * Mocks for the Marketplace area, following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * EndPoints/Marketplace and Application/{Agents,Tools,Items}). The gateway prefix is `/md`, the API
 * itself serves `/api/v1/...`.
 *
 * Shapes and status codes (each one is a deliberate copy of the backend, not an invention):
 * - Success is HTTP 200 `{ data }`. Failures are `{ resultType, errors: [{ code, property }] }` with
 *   `resultType` 2 (Invalid, HTTP 400), 4 (NotFound, 404), 5 (Unexpected, 500) or 6 (Forbidden, 403)
 *   (AMAIS.WKFLO.Common/Models/Results/ResultType.cs, BaseEndpoint.AmaisWkfloResult).
 * - `GET /marketplace/items` is `ListMarketplaceItemsQueryHandler`: agents (`AIAgent_{id}`, category
 *   "AI Agents") unioned with tools (`Tool_{id}`, category "Tools"), live star average rounded away
 *   from zero, `downloads` = live install count, `userClickStar` / `userClickInstall` per caller.
 * - `GET /marketplace/agents` is `ListMarketplaceAgentsQueryHandler`: the whole catalog, no tenant
 *   scoping, optional `?tag=` filter by tag name, `tags` resolved from the entity tags of type "Agent".
 * - Rate (`POST /marketplace/{agent|tool}/:id/rate`): `[Required]`/`[Range]` DataAnnotations run first
 *   and are merged with the business validators (ValidatorBehavior, no cascade). A deleted or unknown
 *   id fails the validator: HTTP 400 `WKFLOMD0303` (agent) / `WKFLOMD0403` (tool). The handler's own
 *   404 is unreachable.
 * - Install (`POST /marketplace/agents/:id/install`, `/tools/:id/install`): there is no existence
 *   validator, so a deleted or unknown id is the handler's HTTP 404 `WKFLOMD0303` / `WKFLOMD0403`.
 *   Installing again into a tenant that already has it returns the existing copy (idempotent), so the
 *   install count does not change.
 * - Delete (`DELETE /marketplace/agent/:id`, `/tool/:id`): soft delete. The validator rejects a missing
 *   or already deleted id with HTTP 400 `WKFLOMD0302` (agent) / `WKFLOMD0402` (tool).
 * - Update (`PUT /marketplace/agent/:id`): `[Required]` Name / Description / SystemPrompt
 *   (`WKFLOMD0002`) and `[MaxLength]` 300 / 500 (`WKFLOMD0004`), merged with the existence validator
 *   (`WKFLOMD0302`).
 * - Icon upload (`POST /marketplace/agent/:id/icon`, multipart field `file`): HTTP 200
 *   `{ relativePath, absoluteUrl }`; a file the server cannot decode is HTTP 400 `WKFLOMD1101`
 *   (UploadMarketplaceAgentIconCommandHandler). The mock decides on the bytes (PNG / JPEG / WEBP signature), like the handler.
 *
 * Tag assignment for a catalog agent uses the shared entity-tags store (`mockApi.entityTags`, key
 * `Agent:{id}`); the list below reads it so the Tags column follows what the dialog assigns.
 */

type FailureStatus = 400 | 403 | 404 | 500;

const RESULT_TYPE: Record<FailureStatus, number> = { 400: 2, 403: 6, 404: 4, 500: 5 };

/**
 * The reply of a failed command. Errors are `{ code, property }` pairs, passed here as
 * `[property, code]`. The numeric `resultType` comes from the backend's ResultType enum.
 */
export function errorReply(status: FailureStatus, ...errors: Array<[property: string, code: string]>) {
  return reply({ resultType: RESULT_TYPE[status], errors: errors.map(([property, code]) => ({ code, property })) }, status);
}

/** The reply of an unhandled server failure: HTTP 500 `WKFLO0001` with an empty property. */
export const unexpectedReply = () => errorReply(500, ["", "WKFLO0001"]);

/** A NotFoundResult built without arguments (e.g. an unknown row id): HTTP 404 with no errors. */
export const emptyNotFoundReply = () => reply({ resultType: 4, errors: [] }, 404);

export const TENANT_HEADER = "amais-wkflo-tenant-guid";

/** Where the mocked blob storage hands out icon URLs. */
export const ICON_HOST = "https://files.e2e.test";

const CREATED_ON = "2026-01-15T09:00:00Z";

interface CatalogItem {
  id: number;
  name: string;
  description: string;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
  /** Ratings left by other users; the caller's own rating lives in the store. */
  ratings: number[];
  /** Installs that exist before the test starts (other tenants). */
  baseInstallations: number;
  /** Tenants (by guid) the caller installed it into during the test. */
  installedTenants: Set<string>;
}

export interface CatalogAgent extends CatalogItem {
  aiModelId: number | null;
  systemPrompt: string;
  iconUrl: string | null;
  enableSTM: boolean;
}

export type CatalogTool = CatalogItem;

export interface MarketplaceStore {
  agents: CatalogAgent[];
  tools: CatalogTool[];
  /** The caller's ratings, keyed by item id (`AIAgent_1`). */
  myRatings: Map<string, number>;
  /** Items the caller has ever installed (the backend's UserInstall rows). */
  userInstalls: Set<string>;
}

const item = (id: number, name: string, description: string, ratings: number[], baseInstallations: number): CatalogItem => ({
  id,
  name,
  description,
  isDeleted: false,
  createdOn: CREATED_ON,
  lastUpdatedOn: null,
  ratings,
  baseInstallations,
  installedTenants: new Set(),
});

export function createMarketplaceStore(): MarketplaceStore {
  return {
    agents: [
      {
        ...item(1, "E2E Template Agent", "A template agent that answers questions.", [4], 3),
        aiModelId: 1,
        systemPrompt: "You are a template.",
        iconUrl: null,
        enableSTM: false,
      },
      {
        ...item(2, "E2E Research Template", "A template agent that summarises documents.", [5, 4], 7),
        aiModelId: 1,
        systemPrompt: "You summarise documents.",
        iconUrl: null,
        enableSTM: true,
      },
    ],
    tools: [
      item(1, "E2E Template Tool", "A template tool that calls an API.", [3], 1),
      item(2, "E2E Lookup Plugin", "A template tool that looks up records.", [], 0),
    ],
    myRatings: new Map(),
    userInstalls: new Set(),
  };
}

const installationsOf = (entry: CatalogItem) => entry.baseInstallations + entry.installedTenants.size;

/** Average of every rating, rounded away from zero (as the list handlers do); 0 when nobody rated. */
function starsOf(entry: CatalogItem, mine: number | undefined): number {
  const all = mine === undefined ? entry.ratings : [...entry.ratings, mine];
  if (all.length === 0) return 0;
  return Math.round(all.reduce((sum, value) => sum + value, 0) / all.length);
}

const tenantOf = (request: MockRequest) => request.headers[TENANT_HEADER] ?? "";

/** What the mocked Marketplace endpoints can be told to do. */
export interface MarketplaceMocks {
  store: MarketplaceStore;
}

/**
 * Registers the Marketplace handlers on `mockApi` (replacing the shared defaults for these paths) and
 * returns the store behind them so a test can read or change the catalog.
 */
export function installMarketplaceMocks(mockApi: MockApi, options: { store?: MarketplaceStore } = {}): MarketplaceMocks {
  const store = options.store ?? createMarketplaceStore();
  const { seed, entityTags } = mockApi;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();
  const live = <T extends CatalogItem>(entries: T[], id: string) => entries.find((entry) => String(entry.id) === id && !entry.isDeleted);

  mockApi.on("GET", "/md/api/v1/marketplace/items", () => [
    ...store.agents
      .filter((agent) => !agent.isDeleted)
      .map((agent) => itemRow(store, agent, "AIAgent", "Agent", "AI Agents")),
    ...store.tools.filter((tool) => !tool.isDeleted).map((tool) => itemRow(store, tool, "Tool", "Tool", "Tools")),
  ]);

  mockApi.on("GET", "/md/api/v1/marketplace/agents", ({ query }: MockRequest) => {
    const tagName = query.get("tag");
    return store.agents
      .filter((agent) => !agent.isDeleted)
      .map((agent) => {
        const model = seed.aiModels.find((candidate) => candidate.id === agent.aiModelId);
        const tags = seed.tags.filter((tag) => (entityTags.get(`Agent:${agent.id}`) ?? []).includes(tag.id));
        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          aiModelId: agent.aiModelId,
          aiModelName: model?.name ?? null,
          model: model?.model ?? null,
          provider: model?.provider ?? null,
          apiKey: null,
          endpoint: null,
          systemPrompt: agent.systemPrompt,
          type: model?.type ?? null,
          stars: starsOf(agent, undefined),
          installations: installationsOf(agent),
          iconUrl: agent.iconUrl,
          enableSTM: agent.enableSTM,
          agentTools: [],
          isDeleted: false,
          createdOn: agent.createdOn,
          lastUpdatedOn: agent.lastUpdatedOn,
          tags,
        };
      })
      .filter((agent) => !tagName || agent.tags.some((tag) => tag.name === tagName));
  });

  // Rate. Rating bounds are enforced by [Range(1, 5)] (and the FluentValidation rule), merged with the existence check.
  const rate = (kind: "agent" | "tool") => (request: MockRequest) => {
    const entries = kind === "agent" ? store.agents : store.tools;
    const body = request.body as { rating?: number };
    const errors: Array<[string, string]> = [];
    if (!Number.isInteger(body?.rating) || body.rating! < 1 || body.rating! > 5) {
      errors.push(["Rating", kind === "agent" ? "WKFLOMD0307" : "WKFLOMD0406"]);
    }
    const entry = live(entries, request.params.id);
    if (!entry) errors.push([kind === "agent" ? "MarketplaceAgent" : "MarketplaceTool", kind === "agent" ? "WKFLOMD0303" : "WKFLOMD0403"]);
    if (errors.length > 0) return errorReply(400, ...errors);
    store.myRatings.set(`${kind === "agent" ? "AIAgent" : "Tool"}_${entry!.id}`, body.rating!);
    return true;
  };
  mockApi.on("POST", "/md/api/v1/marketplace/agent/:id/rate", rate("agent"));
  mockApi.on("POST", "/md/api/v1/marketplace/tool/:id/rate", rate("tool"));

  // Install. Creates the tenant copy (the shared agents / tools collections) unless the tenant already has it.
  mockApi.on("POST", "/md/api/v1/marketplace/agents/:id/install", (request: MockRequest) => {
    const agent = live(store.agents, request.params.id);
    if (!agent) return errorReply(404, ["MarketplaceAgent", "WKFLOMD0303"]);
    const tenant = tenantOf(request);
    const copyName = agent.name;
    let copy = seed.agents.find((candidate) => (candidate as { installedFromMarketplaceAgentId?: number }).installedFromMarketplaceAgentId === agent.id);
    if (!agent.installedTenants.has(tenant)) {
      agent.installedTenants.add(tenant);
      copy = {
        ...seed.agents[0],
        id: seed.agents.reduce((max, existing) => Math.max(max, existing.id), 0) + 1,
        name: seed.agents.some((existing) => existing.name === copyName) ? `${copyName} (Copy 1)` : copyName,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        isActive: true,
        isPublished: false,
        installedFromMarketplaceAgentId: agent.id,
      } as unknown as (typeof seed.agents)[number];
      seed.agents.push(copy);
    }
    store.userInstalls.add(`AIAgent_${agent.id}`);
    return { id: copy!.id, name: copy!.name, description: copy!.description, systemPrompt: copy!.systemPrompt, isActive: true };
  });

  mockApi.on("POST", "/md/api/v1/marketplace/tools/:id/install", (request: MockRequest) => {
    const tool = live(store.tools, request.params.id);
    if (!tool) return errorReply(404, ["MarketplaceTool", "WKFLOMD0403"]);
    const tenant = tenantOf(request);
    let copy = seed.tools.find((candidate) => (candidate as { installedFromMarketplaceToolId?: number }).installedFromMarketplaceToolId === tool.id);
    if (!tool.installedTenants.has(tenant)) {
      tool.installedTenants.add(tenant);
      copy = {
        ...seed.tools[0],
        id: seed.tools.reduce((max, existing) => Math.max(max, existing.id), 0) + 1,
        name: tool.name,
        description: tool.description,
        isActive: true,
        installedFromMarketplaceToolId: tool.id,
      } as unknown as (typeof seed.tools)[number];
      seed.tools.push(copy);
    }
    store.userInstalls.add(`Tool_${tool.id}`);
    return { id: copy!.id, name: copy!.name, description: copy!.description, type: copy!.type, config: copy!.config, isActive: true, isDeleted: false };
  });

  // Delete (soft). The validators reject a missing or already deleted id before the handler runs.
  mockApi.on("DELETE", "/md/api/v1/marketplace/agent/:id", ({ params }: MockRequest) => {
    const agent = live(store.agents, params.id);
    if (!agent) return errorReply(400, ["Agent", "WKFLOMD0302"]);
    agent.isDeleted = true;
    return { id: agent.id };
  });
  mockApi.on("DELETE", "/md/api/v1/marketplace/tool/:id", ({ params }: MockRequest) => {
    const tool = live(store.tools, params.id);
    if (!tool) return errorReply(400, ["Tool", "WKFLOMD0402"]);
    tool.isDeleted = true;
    return { id: tool.id };
  });

  // Update (the manage-agents edit dialog).
  mockApi.on("PUT", "/md/api/v1/marketplace/agent/:id", ({ params, body }: MockRequest) => {
    const input = body as Partial<{
      name: string;
      description: string;
      systemPrompt: string;
      aiModelId: number | null;
      iconUrl: string | null;
      enableSTM: boolean;
    }>;
    const errors: Array<[string, string]> = [];
    if (!input.name) errors.push(["Name", "WKFLOMD0002"]);
    else if (input.name.length > 300) errors.push(["Name", "WKFLOMD0004"]);
    if (!input.description) errors.push(["Description", "WKFLOMD0002"]);
    else if (input.description.length > 500) errors.push(["Description", "WKFLOMD0004"]);
    if (!input.systemPrompt) errors.push(["SystemPrompt", "WKFLOMD0002"]);
    if (input.iconUrl && input.iconUrl.length > 500) errors.push(["IconUrl", "WKFLOMD0004"]);
    const agent = live(store.agents, params.id);
    if (!agent) errors.push(["Agent", "WKFLOMD0302"]);
    if (errors.length > 0) return errorReply(400, ...errors);
    agent!.name = input.name!;
    agent!.description = input.description!;
    agent!.systemPrompt = input.systemPrompt!;
    agent!.aiModelId = input.aiModelId ?? null;
    agent!.iconUrl = input.iconUrl ?? null;
    agent!.enableSTM = input.enableSTM === true;
    agent!.lastUpdatedOn = now();
    return {
      id: agent!.id,
      name: agent!.name,
      description: agent!.description,
      systemPrompt: agent!.systemPrompt,
      aiModelId: agent!.aiModelId,
      iconUrl: agent!.iconUrl,
      enableSTM: agent!.enableSTM,
      lastRunAt: null,
      agentTools: [],
    };
  });

  // Icon upload. Only uploads: the saved URL reaches the agent through the dialog's own PUT.
  mockApi.on("POST", "/md/api/v1/marketplace/agent/:id/icon", ({ params, body }: MockRequest) => {
    const raw = typeof body === "string" ? body : "";
    // Same literal the endpoint uses when the request has no (or an empty) file part.
    const content = /name="file"[^\r\n]*\r\n(?:[^\r\n]+\r\n)*\r\n([\s\S]*)\r\n--/.exec(raw)?.[1];
    if (!content) return errorReply(400, ["Uploader", "No file was uploaded."]);
    if (!live(store.agents, params.id)) return errorReply(400, ["MarketplaceAgent", "WKFLOMD0303"]);
    // The handler decodes the bytes with SKCodec, so the content decides, never the name or content type.
    // The recorded body is text, so a non-UTF-8 signature byte arrives as U+FFFD; the checks allow for that.
    const format = detectImageFormat(content);
    if (format === "gif") return errorReply(400, ["ContentType", "WKFLOMD1102"]);
    if (!format) return errorReply(400, ["Content", "WKFLOMD1101"]);
    const extension = format === "jpeg" ? "jpg" : format;
    const relativePath = `marketplace-agent/${params.id}/e2e-icon-${tick++}.${extension}`;
    return { relativePath, absoluteUrl: `${ICON_HOST}/${relativePath}` };
  });

  return { store };
}

/** PNG, JPEG and WEBP are accepted; GIF decodes but is not an allowed format; anything else cannot be decoded. */
function detectImageFormat(content: string): "png" | "jpeg" | "webp" | "gif" | null {
  if (/^.PNG/.test(content)) return "png";
  if (/^RIFF[\s\S]{4}WEBP/.test(content)) return "webp";
  if (/^\uFFFD\uFFFD/.test(content)) return "jpeg";
  if (/^GIF8/.test(content)) return "gif";
  return null;
}

function itemRow(store: MarketplaceStore, entry: CatalogItem, prefix: string, type: string, category: string) {
  const id = `${prefix}_${entry.id}`;
  const mine = store.myRatings.get(id);
  return {
    id,
    name: entry.name,
    type,
    description: entry.description,
    category,
    stars: starsOf(entry, mine),
    installations: installationsOf(entry),
    userClickStar: mine !== undefined,
    userClickInstall: store.userInstalls.has(id),
    price: null,
    downloads: installationsOf(entry),
    vendor: "UBIQ Education",
    isDeleted: false,
    createdOn: entry.createdOn,
    lastUpdatedOn: entry.lastUpdatedOn,
  };
}

/** 1x1 transparent PNG, served for every URL on the mocked icon host. */
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Answers the icon host's image requests so an uploaded icon renders without a real network call. */
export async function mockIconHost(page: Page): Promise<void> {
  await page.route(
    (url) => url.origin === ICON_HOST,
    (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG }),
  );
}

/** The recorded `rating` bodies sent for one item, newest last. */
export function ratingsSent(mockApi: MockApi, kind: "agent" | "tool", id: number): unknown[] {
  return mockApi.requestsTo("POST", `/md/api/v1/marketplace/${kind}/${id}/rate`).map((request) => request.body);
}
