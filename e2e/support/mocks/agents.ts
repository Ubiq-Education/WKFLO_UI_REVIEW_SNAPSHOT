import { reply, type MockApi } from "../mock-api";

/** Ids of the extra agents this area's mocks add on top of the shared seed (ids 1 and 2). */
export const MEMORY_AGENT_ID = 3;

/**
 * Mocks for the agents area: a third agent with STM, LTM and spin-up enabled (so the wipe buttons
 * and the Spin-Up tab exist), and the agent actions the shared setup does not cover (publish,
 * share to marketplace, wipe memory). Publish and share update the stored agent, so the next GET
 * shows the new state.
 */
export function installAgentsMocks(mockApi: MockApi): void {
  const { seed } = mockApi;

  seed.agents.push({
    // A deep copy, so changing a nested field on one agent can't change the other.
    ...structuredClone(seed.agents[0]),
    id: MEMORY_AGENT_ID,
    name: "E2E Memory Agent",
    description: "Remembers earlier conversations.",
    systemPrompt: "You remember what users told you earlier.",
    enableSTM: true,
    enableLTM: true,
    enableSpinUpAgents: true,
  });

  const findAgent = (id: string) => seed.agents.find((agent) => String(agent.id) === id);

  mockApi.on("POST", "/md/api/v1/tenant/agent/:id/publish", ({ params }) => {
    const agent = findAgent(params.id);
    if (!agent) return reply({ message: "Not found" }, 404);
    agent.isPublished = true;
    agent.lastPublishedOn = "2026-02-01T09:00:00Z";
    return agent;
  });
  mockApi.on("POST", "/md/api/v1/tenant/agent/:id/share", ({ params }) => {
    const agent = findAgent(params.id);
    if (!agent) return reply({ message: "Not found" }, 404);
    agent.isShared = true;
    return agent;
  });
  mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id/memory/short-term", () => true);
  mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id/memory/long-term", () => true);
}

/** Makes one agent report a Chat_Classification tool, which adds the view page's Classifications tab. */
export function addClassificationTool(mockApi: MockApi, agentId: number): void {
  mockApi.on("GET", "/md/api/v1/tenant/agent/:id/tools", ({ params }) =>
    Number(params.id) === agentId
      ? [{ ...mockApi.seed.tools[0], id: 99, name: "E2E Classification", type: "Chat_Classification" }]
      : [],
  );
}
