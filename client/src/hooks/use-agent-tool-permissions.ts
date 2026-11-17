import { useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";

/** Agent-level permission for a tool (non-MCP) or one MCP function (US 7575 / WI 7447). */
export type ToolPermission = "Allow" | "Ask" | "Block";

/**
 * PLAN.md decision 3 (updated): for a tool that manages permissions, a permission that isn't
 * set - missing, null or an unknown value - means Block, for MCP functions and whole tools alike.
 */
export const DEFAULT_TOOL_PERMISSION: ToolPermission = "Block";

const TOOL_PERMISSIONS: readonly ToolPermission[] = ["Allow", "Ask", "Block"];

export function normalizeToolPermission(value: unknown): ToolPermission {
  return TOOL_PERMISSIONS.includes(value as ToolPermission) ? (value as ToolPermission) : DEFAULT_TOOL_PERMISSION;
}

export interface AgentToolFunctionPermission {
  name: string;
  description?: string | null;
  /** WI 7726: optional friendly text set on the tool's Functions panel; `name` stays the key. */
  displayName?: string | null;
  displayDescription?: string | null;
  permission: ToolPermission | null;
}

/** One entry of GET /md/api/v1/tenant/agent/{id}/tools/permissions (PLAN.md contract). */
export interface AgentToolPermissionsEntry {
  toolId: number;
  name: string;
  description?: string | null;
  type: string;
  isActive: boolean;
  permissionsEnabled: boolean;
  usedByAgents?: Array<{ id: number; name: string }>;
  /** Non-MCP tools only; null when permissions are off. */
  permission: ToolPermission | null;
  /** MCP tools only (null for other types): the tool's ENABLED functions. */
  functions: AgentToolFunctionPermission[] | null;
}

export interface AgentToolPermissionsUpdateEntry {
  toolId: number;
  permission?: ToolPermission | null;
  functions?: Array<{ name: string; permission: ToolPermission }>;
}

export function isMcpTool(entry: Pick<AgentToolPermissionsEntry, "type">) {
  return entry.type === "MCP";
}

export function agentToolPermissionsPath(agentId: number) {
  return `/md/api/v1/tenant/agent/${agentId}/tools/permissions`;
}

/**
 * Builds the PUT entry for one tool with the exact shape the backend validates: MCP tools send
 * the full function list and never `permission`; every other type sends `permission` and never
 * `functions` (WKFLOMD0412 / WKFLOMD0413 otherwise).
 */
export function buildPermissionsUpdate(
  entry: AgentToolPermissionsEntry,
  permission: ToolPermission,
  functionPermissions: Record<string, ToolPermission>
): AgentToolPermissionsUpdateEntry {
  if (isMcpTool(entry)) {
    return {
      toolId: entry.toolId,
      functions: (entry.functions ?? []).map((fn) => ({
        name: fn.name,
        permission: normalizeToolPermission(functionPermissions[fn.name] ?? fn.permission),
      })),
    };
  }
  return { toolId: entry.toolId, permission: normalizeToolPermission(permission) };
}

const ERROR_MESSAGES: Record<string, string> = {
  WKFLOMD0001: "The request listed the same tool more than once. Reload the page and try again.",
  WKFLOMD0002: "Some permission details were missing. Reload the page and try again.",
  WKFLOMD0101: "Your workspace couldn't be identified. Reload the page and try again.",
  WKFLOMD0102: "Your workspace couldn't be identified. Reload the page and try again.",
  WKFLOMD0302: "This agent no longer exists.",
  WKFLOMD0303: "This agent no longer exists.",
  WKFLOMD0409: "This tool is no longer connected to the agent. Reload the page to see its current tools.",
  WKFLOMD0410: "Permissions are not managed for this tool. Turn on \"Manage permissions for this tool\" on the tool first.",
  WKFLOMD0411: "One of the chosen permissions isn't valid. Choose Always allow, Ask for permission or Always block.",
  WKFLOMD0412: "This tool takes a single permission for all of its functions.",
  WKFLOMD0413: "This MCP tool takes a permission per function.",
  WKFLOMD0414: "One of these functions is no longer enabled on the tool. Reload the page to see its current functions.",
};

const GENERIC_SAVE_ERROR = "Couldn't save the permissions. Please try again.";

/**
 * Turns an `apiRequest` error ("<status>: <body>", body `{ errors: [{ property, code }] }`) into
 * readable text. Never returns a raw WKFLOMD code or response body.
 */
export function describeAgentToolPermissionsError(error: unknown): string {
  if (!(error instanceof Error)) return GENERIC_SAVE_ERROR;
  const match = /^(\d{3}):\s*([\s\S]*)$/.exec(error.message);
  if (!match) return GENERIC_SAVE_ERROR;
  try {
    const body = JSON.parse(match[2]);
    const errors: unknown[] = Array.isArray(body?.errors) ? body.errors : [];
    const codes = errors
      .map((e) => (e && typeof e === "object" ? (e as { code?: unknown }).code : e))
      .filter((c): c is string => typeof c === "string");
    if (typeof body?.code === "string") codes.push(body.code);
    const messages = Array.from(new Set(codes.map((c) => ERROR_MESSAGES[c]).filter((m): m is string => !!m)));
    if (messages.length > 0) return messages.join(" ");
  } catch {
    /* not JSON */
  }
  if (match[1] === "404") return ERROR_MESSAGES.WKFLOMD0302;
  return GENERIC_SAVE_ERROR;
}

/** Loads and saves an agent's tool permissions (WI 7447: managed from the agent Tools tab). */
export function useAgentToolPermissions(agentId: number) {
  const token = useAuth();
  const context = useContext(DataContext);
  const queryClient = useQueryClient();
  const path = agentToolPermissionsPath(agentId);

  const query = useQuery<{ tools: AgentToolPermissionsEntry[] }>({
    queryKey: [path, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
    // Tool settings change elsewhere (tool edit page, Functions panel): don't trust a copy older
    // than this; refetch when the tab is shown again or the window regains focus.
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const saveMutation = useMutation({
    mutationFn: async (tools: AgentToolPermissionsUpdateEntry[]) => {
      await apiRequest("PUT", path, { tools }, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [path] });
    },
  });

  return {
    tools: query.data?.tools ?? [],
    isLoading: query.isLoading,
    loadError: query.error,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
    resetSave: saveMutation.reset,
  };
}
