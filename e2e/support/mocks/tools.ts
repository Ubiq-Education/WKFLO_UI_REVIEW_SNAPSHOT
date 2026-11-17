import type { Page } from "@playwright/test";
import { API_ORIGIN, reply, type MockApi, type MockRequest } from "../mock-api";

/**
 * Mocks for the Tools area. They replace the shared tool handlers with a stateful store that
 * follows the real MD API (wkflo_services/AMAIS_WKFLO_MD_API):
 *
 * - Every success is HTTP 200 `{ data }` (BaseEndPoint.AmaisWkfloResult), including create and publish.
 * - Lists and details return TenantToolGetResult (Models/TenantToolGetResult.cs), tags included, and
 *   derive `isPublished`, `isShared` and `lastPublishedOn` from the published copy.
 * - Create / update / publish / share / delete return their own, smaller result DTOs
 *   (TenantToolCreateResult, TenantToolUpdateResult, TenantToolPublishResult, TenantToolShareResult,
 *   TenantToolDeleteResult), which the UI only reads `id` from.
 * - PUT merges the body over the stored tool (Endpoints/Tenant/Tools/TenantToolUpdate.cs): an omitted
 *   field keeps the stored value, and `maxToolOutputLength` is cleared only when the body carries it.
 * - A missing tool on update / delete / publish / share fails the command validator: HTTP 400 with
 *   `WKFLOMD0402` (ToolMustExist). A missing tool on GET is HTTP 404 with an empty `errors` list.
 * - Share needs a published copy (HTTP 404, `WKFLOMD0404`) that is not older than the draft
 *   (HTTP 400, `WKFLOMD0405`), see ShareTenantToolCommandHandler.cs.
 *
 * Timestamps come from a fake clock that moves forward on every call, so "edited after publish" is
 * decided by the order of the calls and never by the wall clock.
 */

export type ToolType =
  | "HTTP"
  | "Knowledge"
  | "Integration_Amais"
  | "Priority_QA"
  | "Chat_Classification"
  | "Contact_Form"
  | "Image_Generation";

export interface ToolTag {
  id: number;
  name: string;
  color: string | null;
  createdOn: string;
  lastUpdatedOn: string | null;
}

/** What the store keeps per tool; the GET shape (TenantToolGetResult) is derived from it. */
export interface StoredTool {
  id: number;
  name: string;
  description: string;
  type: string;
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
  isShared: boolean;
}

export interface ToolsStore {
  tools: StoredTool[];
  /** The fake clock: each call returns a later ISO time. */
  now(): string;
}

/** Ids of the fixture tools, one per non-MCP tool type (MCP tools are covered by their own slice). */
export const TOOL_IDS = {
  http: 1,
  priorityQa: 2,
  contactForm: 3,
  chatClassification: 4,
  knowledge: 5,
  integrationAmais: 6,
  imageGeneration: 7,
} as const;

/** The id the first tool created in a test gets. */
export const NEW_TOOL_ID = 8;

export const HTTP_INPUT_KEY = "query";

/** A realistic HTTP tool config: one input, a header, a parameter that uses the input, and a body. */
export const HTTP_CONFIG = {
  method: "POST",
  url: "https://example.test/api/records",
  headers: { "Content-Type": "application/json", "X-E2E-Header": "e2e-value" },
  parameters: { q: "{{query}}" },
  urlParams: {},
  body: '{"search":"{{query}}"}',
  parameterConfig: {},
  inputs: {
    [HTTP_INPUT_KEY]: {
      name: "Query",
      description: "Text to look up",
      type: "string",
      required: true,
      value: "",
      defaultValue: "",
      hasDefaultValue: false,
    },
  },
};

export const PRIORITY_QA_CONFIG = {
  items: [
    { question: "What are the opening hours?", answer: "Weekdays, 9am to 5pm.", links: ["https://example.test/hours"] },
    { question: "Where is the reception?", answer: "On the ground floor.", links: [] },
  ],
};

export const CHAT_CLASSIFICATION_CONFIG = {
  topics: [
    { id: "e2e-topic-1", name: "Billing", description: "Questions about invoices and payments.", isActive: true },
    { id: "e2e-topic-2", name: "Support", description: "Questions about problems with the product.", isActive: false },
    { id: "e2e-topic-3", name: "Feedback", description: "Comments about the service.", isActive: true },
  ],
};

export const CONTACT_FORM_CONFIG = {
  mandatory: false,
  firstNameRequired: true,
  lastNameRequired: false,
  emailRequired: true,
  whenToUse: "Show the form when the visitor asks to be contacted.",
  submitButtonText: "Send request",
  successMessageEnabled: true,
  successMessageText: "Thanks, we will be in touch.",
};

export const KNOWLEDGE_CONFIG = { tags: ["handbook", "faq"] };
export const INTEGRATION_AMAIS_CONFIG = { isVoiceEnabled: true, areSkillsEnabled: false };

export const IMAGE_GENERATION_CONFIG = {
  provider: "azure",
  apiKey: "e2e-not-a-real-key",
  endpoint: "https://example.test/openai",
  deploymentName: "e2e-image-deployment",
  apiVersion: "2025-04-01",
  model: "",
  quality: "high",
  aspectRatio: "",
};

const CREATED_ON = "2026-01-15T09:00:00Z";

function fixtureTool(id: number, name: string, description: string, type: ToolType, config: object, extra: Partial<StoredTool> = {}): StoredTool {
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
    isShared: false,
    ...extra,
  };
}

/** The tools every Tools test starts with: one per non-MCP type, in a mix of publish states. */
export function createToolFixtures(): StoredTool[] {
  return [
    fixtureTool(TOOL_IDS.http, "E2E Lookup Tool", "Looks up a record over HTTP.", "HTTP", HTTP_CONFIG),
    // Published and not edited since.
    fixtureTool(TOOL_IDS.priorityQa, "E2E Priority Answers", "Answers fixed questions first.", "Priority_QA", PRIORITY_QA_CONFIG, {
      publishedOn: "2026-01-20T09:00:00Z",
      permissionsEnabled: true,
    }),
    // Switched off.
    fixtureTool(TOOL_IDS.contactForm, "E2E Contact Form", "Collects a visitor's contact details.", "Contact_Form", CONTACT_FORM_CONFIG, {
      isActive: false,
    }),
    // Published, then edited: the draft is newer than the published copy.
    fixtureTool(TOOL_IDS.chatClassification, "E2E Topic Classifier", "Sorts chats into topics.", "Chat_Classification", CHAT_CLASSIFICATION_CONFIG, {
      publishedOn: "2026-01-20T09:00:00Z",
      lastUpdatedOn: "2026-01-25T09:00:00Z",
    }),
    // Published and already in the marketplace.
    fixtureTool(TOOL_IDS.knowledge, "E2E Document Library", "Searches uploaded documents.", "Knowledge", KNOWLEDGE_CONFIG, {
      publishedOn: "2026-01-20T09:00:00Z",
      isShared: true,
    }),
    fixtureTool(TOOL_IDS.integrationAmais, "E2E Platform Integration", "Connects the agent to the platform.", "Integration_Amais", INTEGRATION_AMAIS_CONFIG),
    fixtureTool(TOOL_IDS.imageGeneration, "E2E Image Editor", "Edits an image from a prompt.", "Image_Generation", IMAGE_GENERATION_CONFIG),
  ];
}

/** A copy of a fixture tool with a different id, name and fields (e.g. a tool that was never published). */
export function withFields(tool: StoredTool, fields: Partial<StoredTool>): StoredTool {
  return { ...tool, ...fields };
}

function toGetResult(tool: StoredTool, tags: ToolTag[]) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    type: tool.type,
    config: tool.config,
    isActive: tool.isActive,
    isPublished: tool.publishedOn !== null,
    isShared: tool.isShared,
    isDeleted: tool.isDeleted,
    createdOn: tool.createdOn,
    lastUpdatedOn: tool.lastUpdatedOn,
    lastPublishedOn: tool.publishedOn,
    mcpOAuthConnectionId: tool.mcpOAuthConnectionId,
    maxToolOutputLength: tool.maxToolOutputLength,
    permissionsEnabled: tool.permissionsEnabled,
    tags,
  };
}

/**
 * The reply of a failed command: HTTP 400 is an InvalidResult (`resultType` 2), HTTP 404 a NotFoundResult (4).
 * Errors are `{ code, property }` pairs, passed here as `[property, code]`. The shape is the one the repo's own
 * client tests use (client/src/services/tenant-api-service.test.ts), the ResultType enum is in
 * AMAIS.WKFLO.Common/Models/Results/ResultType.cs; the exact key order on the wire is not proven.
 */
export function errorReply(status: 400 | 404, ...errors: Array<[property: string, code: string]>) {
  return reply({ resultType: status === 404 ? 4 : 2, errors: errors.map(([property, code]) => ({ code, property })) }, status);
}

/** The command validators' answer for an id that is not a live tool of the tenant. */
const toolMustExist = () => errorReply(400, ["Tool", "WKFLOMD0402"]);

/**
 * Registers the tool handlers on `mockApi` and returns the store behind them.
 * `tools` replaces the default fixtures.
 */
export function installToolsMocks(mockApi: MockApi, options: { tools?: StoredTool[] } = {}): ToolsStore {
  const tools = options.tools ?? createToolFixtures();
  let tick = 0;
  // Starts after every fixture timestamp, then moves one minute per call.
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();

  const live = (id: string) => tools.find((tool) => String(tool.id) === id && !tool.isDeleted);
  const tagsOf = (tool: StoredTool): ToolTag[] => {
    const ids = mockApi.entityTags.get(`Tool:${tool.id}`) ?? [];
    return mockApi.seed.tags.filter((tag) => ids.includes(tag.id)) as ToolTag[];
  };

  mockApi.on("GET", "/md/api/v1/tenant/tools", () => tools.filter((tool) => !tool.isDeleted).map((tool) => toGetResult(tool, tagsOf(tool))));

  mockApi.on("GET", "/md/api/v1/tenant/tool/:id", ({ params }) => {
    const tool = live(params.id);
    // GetTenantToolByIdQueryHandler returns a bare NotFoundResult(): no error entries.
    return tool ? toGetResult(tool, tagsOf(tool)) : reply({ resultType: 4, errors: [] }, 404);
  });

  // CreateTenantToolCommand: isActive is a plain bool (false when omitted), permissionsEnabled is optional.
  mockApi.on("POST", "/md/api/v1/tenant/tool", ({ body }: MockRequest) => {
    const input = body as Partial<StoredTool>;
    const created: StoredTool = {
      id: tools.reduce((max, tool) => Math.max(max, tool.id), 0) + 1,
      name: input.name ?? "",
      description: input.description ?? "",
      type: input.type ?? "",
      config: input.config ?? "",
      isActive: input.isActive ?? false,
      isDeleted: false,
      createdOn: now(),
      lastUpdatedOn: null,
      mcpOAuthConnectionId: null,
      maxToolOutputLength: input.maxToolOutputLength ?? null,
      permissionsEnabled: input.permissionsEnabled ?? false,
      publishedOn: null,
      isShared: false,
    };
    tools.push(created);
    const { id, name, description, type, config, isActive, isDeleted, createdOn, lastUpdatedOn, mcpOAuthConnectionId, maxToolOutputLength, permissionsEnabled } = created;
    return { id, name, description, type, config, isActive, isDeleted, createdOn, lastUpdatedOn, mcpOAuthConnectionId, maxToolOutputLength, permissionsEnabled };
  });

  mockApi.on("PUT", "/md/api/v1/tenant/tool/:id", ({ params, body }: MockRequest) => {
    const tool = live(params.id);
    const input = body as Record<string, unknown>;
    if (!tool) {
      // TenantToolUpdate.cs merges the stored tool into the command before ValidatorBehavior runs, so for a missing tool
      // only the body's own fields are set: each missing [Required] field fails WKFLOMD0002 (technical validation, first),
      // then the business validator adds Tool/WKFLOMD0402. A full-form PUT has all four fields, so only 0402 remains.
      const missing = (["Name", "Description", "Type", "Config"] as const).filter((field) => typeof input[field.toLowerCase()] !== "string" || input[field.toLowerCase()] === "");
      return errorReply(400, ...missing.map((field): [string, string] => [field, "WKFLOMD0002"]), ["Tool", "WKFLOMD0402"]);
    }
    if (typeof input.name === "string") tool.name = input.name;
    if (typeof input.description === "string") tool.description = input.description;
    if (typeof input.type === "string") tool.type = input.type;
    if (typeof input.config === "string") tool.config = input.config;
    if (typeof input.isActive === "boolean") tool.isActive = input.isActive;
    if (typeof input.permissionsEnabled === "boolean") tool.permissionsEnabled = input.permissionsEnabled;
    // Bug 7871 behaviour: an explicit null clears the cap, an omitted field keeps it.
    if ("maxToolOutputLength" in input) tool.maxToolOutputLength = (input.maxToolOutputLength as number | null) ?? null;
    tool.lastUpdatedOn = now();
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      type: tool.type,
      config: tool.config,
      isActive: tool.isActive,
      isDeleted: tool.isDeleted,
      createdOn: tool.createdOn,
      lastUpdatedOn: tool.lastUpdatedOn,
      mcpOAuthConnectionId: tool.mcpOAuthConnectionId,
      maxToolOutputLength: tool.maxToolOutputLength,
      permissionsEnabled: tool.permissionsEnabled,
    };
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
      config: tool.config,
      isActive: tool.isActive,
      createdByTenantToolId: tool.id,
      isDeleted: false,
      createdOn: tool.publishedOn,
      lastUpdatedOn: null,
    };
  });

  mockApi.on("POST", "/md/api/v1/tenant/tool/:id/share", ({ params }) => {
    const tool = live(params.id);
    if (!tool) return toolMustExist();
    if (tool.publishedOn === null) return errorReply(404, ["PublishedTenantTool", "WKFLOMD0404"]);
    if (tool.lastUpdatedOn !== null && Date.parse(tool.lastUpdatedOn) > Date.parse(tool.publishedOn)) {
      return errorReply(400, ["PublishedTenantTool", "WKFLOMD0405"]);
    }
    tool.isShared = true;
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      type: tool.type,
      config: tool.config,
      sharedAt: now(),
      sharedByTenantId: 1,
      sharedByTenantName: "E2E Tenant A",
    };
  });

  return { tools, now };
}

/** The recorded body of the last `method` call to `pattern`, or undefined when there was none. */
export function lastBody<T = Record<string, unknown>>(mockApi: MockApi, method: "POST" | "PUT" | "DELETE", pattern: string): T | undefined {
  return mockApi.requestsTo(method, pattern).at(-1)?.body as T | undefined;
}

/** What the HTTP editor's "Run tool" button posts (a relative URL, so it goes to the app origin). */
export interface TestToolRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  parameters: Record<string, string>;
  urlParams: Record<string, string>;
  body: string;
  inputs: Record<string, { value?: string; defaultValue?: string; hasDefaultValue?: boolean }>;
}

export interface TestToolMock {
  /** The bodies posted to the test route, in order. */
  readonly requests: TestToolRequest[];
}

/**
 * The HTTP editor's "Run tool" button posts to `/md/api/v1/test-tool` with a relative URL
 * (http-config-editor.tsx), so the request goes to the app's own origin and never reaches the
 * mocked API origin. `wkflo_services` has no such route (searched for "test-tool"), so the shape of
 * `result` follows what the editor reads (`ApiTestResponse` in tool-form.types.ts): the upstream
 * `status`, a `data` payload and an optional `duration`.
 */
export async function mockTestToolRoute(page: Page, result: { status: number; data?: unknown; duration?: number }): Promise<TestToolMock> {
  const requests: TestToolRequest[] = [];
  await page.route(
    (url) => url.origin !== API_ORIGIN && url.pathname === "/md/api/v1/test-tool",
    async (route) => {
      requests.push(route.request().postDataJSON() as TestToolRequest);
      await route.fulfill({ status: 200, json: result });
    },
  );
  return { requests };
}
