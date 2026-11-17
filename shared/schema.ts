import { z } from "zod";

// Plain TypeScript shapes for the entities returned by the WKFlo MD API. There is no local
// database, so they are declared directly. A nullable API field is typed `| null`.

// Max length enforced by wkflo_services' UpdateTenantAgentCommand validator.
export const AGENT_ADDITIONAL_INSTRUCTIONS_MAX_LENGTH = 2000;

export type MarketplaceAgent = {
  id: number;
  name: string;
  description: string;
  model: string | null;
  aiModelId: number | null; // ID of the AI model used
  provider: string | null; // openai, azure, google, anthropic, cohere
  apiKey: string | null; // For provider-specific API keys
  endpoint: string | null; // For Azure endpoints
  systemPrompt: string;
  createdOn: string;
  type: string | null; // text, chat, vision, analytics, etc.
};

export type Agent = {
  id: number;
  name: string;
  description: string;
  model: string | null;
  aiModelId: number | null; // ID of the AI model used
  provider: string | null; // openai, azure, google, anthropic, cohere
  apiKey: string | null; // For provider-specific API keys
  endpoint: string | null; // For Azure endpoints
  systemPrompt: string;
  // Admin-supplied text appended after the system prompt at runtime (set from AMAIS CMS). Mirrors
  // wkflo_services' TenantAgent AdditionalInstructions: on PUT, null = leave unchanged, "" = clear.
  additionalInstructions: string | null;
  isActive: boolean;
  isPublished: boolean;
  isShared: boolean;
  enableSTM: boolean;
  enableLTM: boolean;
  enableSpinUpAgents: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
  lastRunAt: string | null;
  lastPublishedOn: string | null;
  type: string | null; // text, chat, vision, analytics, etc.
  tags?: Tag[];
};

// Tool/Plugin model
export type Tool = {
  id: number;
  name: string;
  description: string;
  type: string; // HTTP, Database, Email, Text, etc.
  config: string; // JSON string for configuration
  isActive: boolean;
  isPublished: boolean;
  isShared: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
  lastPublishedOn: string | null;
  tags?: Tag[];
  mcpOAuthConnectionId?: string | null;
  maxToolOutputLength?: number | null;
  /**
   * WI 7447 / US 7575: whether this tool takes part in the per-agent permission system
   * (Always allow / Ask for permission / Block). Off by default for every tool type (opt-in).
   * Optional because an older backend may not return it yet; callers then treat it as off.
   */
  permissionsEnabled?: boolean;
};

// Secrets/Vault model
export type Secret = {
  id: number;
  name: string;
  description: string | null;
  value: string; // This will store securely hashed API keys and other sensitive values
  provider: string | null; // e.g., openai, azure, google, etc.
  isActive: boolean; // Whether this API key is active and usable
  createdAt: string;
  updatedAt: string | null;
};

// Tag types (API-backed)
export const createTagSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  color: z.string().max(20, "Color must be at most 20 characters").nullable().optional(),
});

export const updateTagSchema = createTagSchema.extend({
  id: z.number(),
});

export type Tag = {
  id: number;
  name: string;
  color: string | null;
  createdOn: string;
  lastUpdatedOn: string | null;
};

export type CreateTag = z.infer<typeof createTagSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;

// Audit log types (API-backed).
// Mirrors the MD API's AuditLogEntry entity / ListAuditLog query result (see PLAN.md,
// User Story 7256) — keep in sync with wkflo_services if the contract shifts.
export type AuditAction = "Create" | "Update" | "Delete";

export type AuditLogEntry = {
  id: number;
  tenantGuid: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorUserGuid: string | null;
  actorUserName: string | null;
  actorUserEmail: string | null;
  timestamp: string;
  changes: string | null;
  correlationId: string | null;
};

export type AuditLogPage = {
  items: AuditLogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Marketplace agent catalog entry (API-backed).
// Mirrors wkflo_services' MarketplaceAgentGetResult, returned by
// GET /api/v1/marketplace/agents (optionally filtered via ?tag=) - see PLAN.md, WI 7312's
// "AMAIS"-tagged template catalog. Distinct from the narrower legacy `MarketplaceAgent` shape
// above, this contract includes stars/installations/agentTools/etc. Keep it in sync with
// wkflo_services if the contract shifts.
export type MarketplaceAgentCatalogEntry = {
  id: number;
  name: string;
  description: string | null;
  // The FK this agent's AI Model is actually stored under (distinct from aiModelName/model/
  // provider below, which describe the resolved model but can't pre-select an edit form's AI
  // Model dropdown by id) - see MarketplaceAgentGetResult.AIModelId's doc comment.
  aiModelId: number | null;
  aiModelName: string | null;
  model: string | null;
  provider: string | null;
  apiKey: string | null;
  endpoint: string | null;
  systemPrompt: string | null;
  type: string | null;
  stars: number;
  installations: number;
  // Absolute URL of the agent's icon, copied from the source TenantAgent's configured chat icon at
  // share-time (see MarketplaceAgent.IconUrl's doc comment in wkflo_services). Null for agents
  // shared before this field existed, or whose source agent never had a chat icon configured.
  iconUrl: string | null;
  // Whether a TenantAgent installed from this template gets Short Term Memory enabled by default
  // (see MarketplaceAgent.EnableSTM's doc comment in wkflo_services) - distinct from an installed
  // agent's own runtime EnableSTM toggle, this is only the template's install-time default.
  enableSTM: boolean;
  agentTools: unknown[] | null;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
  // Tags currently assigned to this Marketplace agent, resolved cross-tenant by the backend (see
  // MarketplaceAgentGetResult.Tags doc comment) — safe to render directly, unlike a per-row fetch
  // of GET /md/api/v1/tenant/entity/Agent/{id}/tags, which is tenant-scoped and would silently
  // return an empty list whenever the tag was assigned under a different tenant than the one
  // currently selected in this app's header.
  tags: Tag[];
};

// Spin-up agent target (API-backed).
// Mirrors wkflo_services' AgentSpinUpTargetResult, returned by the tenant and public
// spin-up-agents endpoints (Task 7296) — used to populate the @mention picker in the chat
// input with the target agent's real icon instead of a generic placeholder.
export type SpinUpAgentTarget = {
  name: string;
  iconUrl?: string | null;
};
