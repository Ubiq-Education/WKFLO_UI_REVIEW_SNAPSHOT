import { TENANT_A, TENANT_B } from "../fixtures";
import type { MockApi, MockRequest } from "../mock-api";
import { TENANT_HEADER } from "./marketplace";

/**
 * Mocks for the header's tenant switch. Tenant data is scoped by the `amais-wkflo-tenant-guid` request
 * header (the API reads it into its TenantContext), so `GET /tenant/agents` answers a different list per
 * tenant and records the tenant guid of every call. A test can then assert that switching tenants
 * refetched the data for the new tenant, not just that the screen changed.
 */
export interface TenantScopedAgents {
  /** The tenant guid header of each `GET /tenant/agents` call, oldest first. */
  agentListTenants: string[];
}

export const TENANT_B_AGENT_NAME = "E2E Tenant B Agent";

export function installTenantScopedAgents(mockApi: MockApi): TenantScopedAgents {
  const [first] = mockApi.seed.agents;
  const byTenant = new Map<string, typeof mockApi.seed.agents>([
    [TENANT_A.guid, mockApi.seed.agents],
    [TENANT_B.guid, [{ ...first, id: 21, name: TENANT_B_AGENT_NAME, description: "Lives in tenant B only." }]],
  ]);
  const recorded: TenantScopedAgents = { agentListTenants: [] };
  mockApi.on("GET", "/md/api/v1/tenant/agents", (request: MockRequest) => {
    const tenant = request.headers[TENANT_HEADER] ?? "";
    recorded.agentListTenants.push(tenant);
    return byTenant.get(tenant) ?? [];
  });
  return recorded;
}
