import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateToolQueries, isAgentToolDataQueryKey } from './tool-query-invalidation';

const T = 'token';
const G = 'tenant';

function seeded() {
  const client = new QueryClient();
  const keys = {
    toolsList: ['/md/api/v1/tenant/tools', T, G],
    tool: ['/md/api/v1/tenant/tool/7', T, G],
    toolFunctions: ['/md/api/v1/tenant/tool/7/functions', T, G],
    otherTool: ['/md/api/v1/tenant/tool/8', T, G],
    agent1Permissions: ['/md/api/v1/tenant/agent/1/tools/permissions', T, G],
    agent2Permissions: ['/md/api/v1/tenant/agent/2/tools/permissions', T, G],
    agent1Tools: ['/md/api/v1/tenant/agent/1/tools', T, G],
    agent1: ['/md/api/v1/tenant/agent/1', T, G],
    agents: ['/md/api/v1/tenant/agents', T, G],
  };
  Object.values(keys).forEach(key => client.setQueryData(key, { seeded: true }));
  const invalidated = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;
  return { client, keys, invalidated };
}

describe('invalidateToolQueries (WI 7447)', () => {
  it('matches only the per-agent tool data keys', () => {
    expect(isAgentToolDataQueryKey(['/md/api/v1/tenant/agent/12/tools/permissions'])).toBe(true);
    expect(isAgentToolDataQueryKey(['/md/api/v1/tenant/agent/12/tools'])).toBe(true);
    expect(isAgentToolDataQueryKey(['/md/api/v1/tenant/agent/12'])).toBe(false);
    expect(isAgentToolDataQueryKey(['/md/api/v1/tenant/agent/12/spin-up/agents'])).toBe(false);
    expect(isAgentToolDataQueryKey([42])).toBe(false);
  });

  it('marks the tool, its functions, the tools list and every agent copy stale', async () => {
    const { client, keys, invalidated } = seeded();

    await invalidateToolQueries(client, 7);

    expect(invalidated(keys.toolsList)).toBe(true);
    expect(invalidated(keys.tool)).toBe(true);
    expect(invalidated(keys.toolFunctions)).toBe(true);
    expect(invalidated(keys.agent1Permissions)).toBe(true);
    expect(invalidated(keys.agent2Permissions)).toBe(true);
    expect(invalidated(keys.agent1Tools)).toBe(true);
    expect(invalidated(keys.otherTool)).toBe(false);
    expect(invalidated(keys.agent1)).toBe(false);
    expect(invalidated(keys.agents)).toBe(false);
  });

  it('without a tool id, still refreshes the tools list and every agent copy', async () => {
    const { client, keys, invalidated } = seeded();

    await invalidateToolQueries(client);

    expect(invalidated(keys.toolsList)).toBe(true);
    expect(invalidated(keys.agent2Permissions)).toBe(true);
    expect(invalidated(keys.tool)).toBe(false);
  });
});
