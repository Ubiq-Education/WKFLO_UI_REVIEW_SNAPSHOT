import type { QueryClient } from "@tanstack/react-query";

/**
 * Query keys in this app start with the request path (see getQueryFn). These are the per-agent
 * queries that carry copies of tool data, for any agent id:
 * - `/md/api/v1/tenant/agent/{id}/tools` - the agent's linked tools (agent Tools tab);
 * - `/md/api/v1/tenant/agent/{id}/tools/permissions` - per-tool permissionsEnabled / isActive
 *   and the MCP tools' enabled functions (agent tool permissions dialog).
 */
const AGENT_TOOL_DATA_PATH = /^\/md\/api\/v1\/tenant\/agent\/\d+\/tools(\/permissions)?$/;

export function isAgentToolDataQueryKey(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === "string" && AGENT_TOOL_DATA_PATH.test(queryKey[0]);
}

/**
 * WI 7447: call after anything that changes a tool (create, edit incl. "Manage permissions for
 * this tool", active toggle, delete, share/publish, its Functions allowlist). Marks every query
 * holding that tool's data stale: active ones refetch now, the rest refetch when next mounted -
 * so an agent's Tools tab never keeps showing a tool's old settings.
 */
export function invalidateToolQueries(queryClient: QueryClient, toolId?: number | null): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/tools"] }),
    queryClient.invalidateQueries({ predicate: (query) => isAgentToolDataQueryKey(query.queryKey) }),
  ];
  if (toolId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/tool/${toolId}`] }),
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/tool/${toolId}/functions`] })
    );
  }
  return Promise.all(invalidations).then(() => undefined);
}
