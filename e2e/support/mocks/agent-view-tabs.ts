import { reply, type MockApi } from "../mock-api";

/**
 * Mocks for the tabs on the agent view page (/agents/view/:id): Tools, tool permissions,
 * Spin-Up Agents, Classifications and the Test Agent tab's chat sessions. Every collection is
 * stateful, so a connect / save / create / delete shows up on the next read.
 */

export const AGENT_ID = 1;

export type Permission = "Allow" | "Ask" | "Block";

export interface PermissionFunction {
  name: string;
  description?: string | null;
  displayName?: string | null;
  displayDescription?: string | null;
  permission: Permission | null;
}

export interface TabsTool {
  id: number;
  name: string;
  description: string;
  type: string;
  isActive: boolean;
  isPublished: boolean;
  isShared: boolean;
  config: string;
  createdOn: string;
  lastUpdatedOn: string | null;
  lastPublishedOn: string | null;
  permissionsEnabled: boolean;
  permission: Permission | null;
  functions: PermissionFunction[] | null;
}

export interface ChatSessionRow {
  agentId: number;
  sessionId: string;
  name: string;
  createdAt: string;
  totalThumbsUp: number;
  totalThumbsDown: number;
}

export interface TopicRow {
  topicName: string;
  count: number;
}

const CREATED_ON = "2026-01-15T09:00:00Z";

/** Seed tool 1 ("E2E Lookup Tool", HTTP) comes from the shared fixtures; these are the extra ones. */
export const TOOL_HTTP_ID = 1;
export const TOOL_MCP_ID = 2;
export const TOOL_CLASSIFIER_ID = 3;
export const TOOL_PRIORITY_ID = 4;

const tool = (overrides: Partial<TabsTool> & Pick<TabsTool, "id" | "name" | "type">): TabsTool => ({
  description: `${overrides.name} description`,
  isActive: true,
  isPublished: false,
  isShared: false,
  config: "{}",
  createdOn: CREATED_ON,
  lastUpdatedOn: null,
  lastPublishedOn: null,
  permissionsEnabled: false,
  permission: null,
  functions: null,
  ...overrides,
});

/** Extra tools for the tabs: an MCP tool with two functions, a classification tool, a priority source. */
function extraTools(): TabsTool[] {
  return [
    tool({
      id: TOOL_MCP_ID,
      name: "E2E Directory Tool",
      type: "MCP",
      description: "Browses a fake directory.",
      permissionsEnabled: true,
      functions: [
        { name: "list_entries", description: "Lists entries.", displayName: "List entries", displayDescription: "Shows every entry.", permission: "Allow" },
        { name: "delete_entry", description: "Deletes an entry.", permission: "Block" },
      ],
    }),
    tool({ id: TOOL_CLASSIFIER_ID, name: "E2E Classifier Tool", type: "Chat_Classification", description: "Labels chat topics." }),
    tool({ id: TOOL_PRIORITY_ID, name: "E2E Priority Source", type: "Priority_QA", description: "Answers from a priority list." }),
  ];
}

export interface AgentViewTabsState {
  /** Ids of the tools linked to the agent, in connect order. */
  connectedToolIds: number[];
  /** Every tool in the mock (the same objects the tools list serves). */
  tools: TabsTool[];
  /** Names of the agents the view agent may spin up. */
  spinUpNames: string[];
  chats: ChatSessionRow[];
  /** Topic rows per `dateRange` query value; a range that is missing returns []. */
  topicsByRange: Record<string, TopicRow[]>;
}

export interface AgentViewTabsOptions {
  /** Tool ids connected to the agent at the start. */
  connectedToolIds?: number[];
  /** Use this prompt for the agent. */
  systemPrompt?: string;
  enableSTM?: boolean;
  enableSpinUpAgents?: boolean;
  chats?: ChatSessionRow[];
  spinUpNames?: string[];
  topicsByRange?: Record<string, TopicRow[]>;
}

export function makeChat(n: number, name = `E2E Chat ${n}`): ChatSessionRow {
  return {
    agentId: AGENT_ID,
    sessionId: `e2e-session-0000-0000-${String(n).padStart(6, "0")}`,
    name,
    createdAt: "2026-02-01T10:00:00Z",
    totalThumbsUp: 0,
    totalThumbsDown: 0,
  };
}

/**
 * Installs the stateful handlers and tweaks agent 1 for the tab under test. Returns the live
 * state so a test can seed more rows or read what the app wrote.
 */
export function installAgentViewTabsMocks(mockApi: MockApi, options: AgentViewTabsOptions = {}): AgentViewTabsState {
  const { seed } = mockApi;
  const allTools = seed.tools as unknown as TabsTool[];
  allTools.push(...extraTools());

  const agent = seed.agents.find((a) => a.id === AGENT_ID)!;
  agent.enableSTM = options.enableSTM ?? false;
  agent.enableSpinUpAgents = options.enableSpinUpAgents ?? false;
  if (options.systemPrompt !== undefined) agent.systemPrompt = options.systemPrompt;

  const state: AgentViewTabsState = {
    connectedToolIds: [...(options.connectedToolIds ?? [])],
    tools: allTools,
    spinUpNames: [...(options.spinUpNames ?? [])],
    chats: [...(options.chats ?? [])],
    topicsByRange: options.topicsByRange ?? {},
  };

  // Tools linked to the agent.
  mockApi.on("GET", "/md/api/v1/tenant/agent/:id/tools", () =>
    state.connectedToolIds.map((id) => allTools.find((t) => t.id === id)).filter(Boolean),
  );
  mockApi.on("POST", "/md/api/v1/tenant/agent/:id/tool/:toolId", ({ params }) => {
    const toolId = Number(params.toolId);
    if (!state.connectedToolIds.includes(toolId)) state.connectedToolIds.push(toolId);
    return true;
  });
  mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id/tool/:toolId", ({ params }) => {
    state.connectedToolIds = state.connectedToolIds.filter((id) => id !== Number(params.toolId));
    return true;
  });

  // Tool permissions: one entry per connected tool.
  mockApi.on("GET", "/md/api/v1/tenant/agent/:id/tools/permissions", () => ({
    tools: state.connectedToolIds
      .map((id) => allTools.find((t) => t.id === id))
      .filter((t): t is TabsTool => !!t)
      .map((t) => ({
        toolId: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        isActive: t.isActive,
        permissionsEnabled: t.permissionsEnabled,
        permission: t.type === "MCP" ? null : t.permission,
        functions: t.type === "MCP" ? t.functions : null,
      })),
  }));
  mockApi.on("PUT", "/md/api/v1/tenant/agent/:id/tools/permissions", ({ body }) => {
    const { tools } = body as {
      tools: Array<{ toolId: number; permission?: Permission | null; functions?: Array<{ name: string; permission: Permission }> }>;
    };
    for (const update of tools) {
      const target = allTools.find((t) => t.id === update.toolId);
      if (!target) continue;
      if (update.permission !== undefined) target.permission = update.permission;
      for (const fn of update.functions ?? []) {
        const existing = target.functions?.find((f) => f.name === fn.name);
        if (existing) existing.permission = fn.permission;
      }
    }
    return true;
  });

  // Spin-up allowlist. The GET returns names, the writes are keyed by agent id.
  mockApi.on("GET", "/ai/api/v1/tenant/agent/:id/spin-up/agents", () => state.spinUpNames.map((name) => ({ name, iconUrl: null })));
  mockApi.on("POST", "/md/api/v1/tenant/agent/:id/spin-up/agents/:targetId", ({ params }) => {
    const name = seed.agents.find((a) => a.id === Number(params.targetId))?.name;
    if (name && !state.spinUpNames.includes(name)) state.spinUpNames.push(name);
    return true;
  });
  mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id/spin-up/agents/:targetId", ({ params }) => {
    const name = seed.agents.find((a) => a.id === Number(params.targetId))?.name;
    state.spinUpNames = state.spinUpNames.filter((n) => n !== name);
    return true;
  });

  // Chat sessions of the Test Agent tab.
  mockApi.on("GET", "/md/api/v1/tenant/agent/:id/chats", () => state.chats);
  mockApi.on("POST", "/md/api/v1/tenant/agent/:id/chat", ({ body }) => {
    const { sessionId } = body as { sessionId: string };
    state.chats.push({ agentId: AGENT_ID, sessionId, name: "", createdAt: "2026-03-01T10:00:00Z", totalThumbsUp: 0, totalThumbsDown: 0 });
    return true;
  });
  mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id/chat/:sessionId", ({ params }) => {
    state.chats = state.chats.filter((c) => c.sessionId !== params.sessionId);
    return true;
  });

  // Classification analytics, keyed by the dateRange query value.
  mockApi.on("GET", "/md/api/v1/tenant/agent/:id/topic-classification-summary", ({ query }) => state.topicsByRange[query.get("dateRange") ?? ""] ?? []);

  return state;
}

/** A WKFLO validation error body, as the permissions PUT returns it. */
export const permissionsError = (...codes: string[]) => reply({ errors: codes.map((code) => ({ property: "tools", code })) }, 400);
