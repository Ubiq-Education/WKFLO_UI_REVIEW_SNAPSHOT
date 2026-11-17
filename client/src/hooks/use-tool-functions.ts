import { useContext } from "react";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import useAuth from "@/hooks/use-auth";
import { authedGet } from "@/hooks/use-tool-oauth-connection";
import { DataContext } from "@shared/models/chat-models";
import { invalidateToolQueries } from "@/lib/tool-query-invalidation";
import { normalizeDisplayText } from "@shared/utils/tool-display";
import type { Tool } from "@shared/schema";
import { withDraftUpdatedNow } from "@/lib/tool-publish-state";

/**
 * WI 7447: one MCP function as returned by GET /md/api/v1/tenant/tool/{id}/functions (and by
 * the AI API's discover endpoint, which returns the same shape).
 * - "Active": in the latest snapshot and already decided (enabled or not) by an admin.
 * - "New": in the latest snapshot but never decided yet.
 * - "Removed": enabled, but missing from the latest snapshot (the server stopped offering it).
 */
export type ToolFunctionStatus = "Active" | "New" | "Removed";

export interface ToolFunction {
  name: string;
  description?: string | null;
  inputSchema?: unknown;
  isEnabled: boolean;
  status: ToolFunctionStatus;
  /** WI 7726: optional admin-chosen name shown instead of `name`; null when not set. */
  displayName?: string | null;
  /** WI 7726: optional admin-chosen description shown instead of `description`; null when not set. */
  displayDescription?: string | null;
}

/** WI 7726: one function's display text in the PUT body. null clears the value. */
export interface ToolFunctionDisplayUpdate {
  name: string;
  displayName: string | null;
  displayDescription: string | null;
}

/**
 * PUT /md/api/v1/tenant/tool/{id}/functions body. `functions` is optional: when it's left out the
 * server keeps every function's display text as it is.
 */
export interface SaveToolFunctionsRequest {
  enabledFunctions: string[];
  functions?: ToolFunctionDisplayUpdate[];
}

export interface ToolFunctionsSnapshot {
  functions: ToolFunction[];
  /** When the function list was last pulled from the MCP server; null if it never was. */
  functionsDiscoveredOn: string | null;
}

const STATUS_VALUES: readonly ToolFunctionStatus[] = ["Active", "New", "Removed"];

function normalizeStatus(value: unknown): ToolFunctionStatus {
  if (typeof value === "string") {
    const match = STATUS_VALUES.find((s) => s.toLowerCase() === value.trim().toLowerCase());
    if (match) return match;
  }
  return "Active";
}

/**
 * Accepts the contract's `{ functions: [...], functionsDiscoveredOn }` envelope and, defensively,
 * a bare array (no timestamp). Drops entries without a usable name.
 */
export function normalizeToolFunctions(raw: unknown): ToolFunctionsSnapshot {
  const source = raw as { functions?: unknown; functionsDiscoveredOn?: unknown } | unknown[] | null | undefined;
  const list = Array.isArray(source) ? source : Array.isArray(source?.functions) ? source.functions : [];
  const discoveredOn =
    !Array.isArray(source) && typeof source?.functionsDiscoveredOn === "string" ? source.functionsDiscoveredOn : null;

  const functions: ToolFunction[] = [];
  for (const item of list as Array<Record<string, unknown> | null | undefined>) {
    if (!item || typeof item.name !== "string" || item.name.trim() === "") continue;
    functions.push({
      name: item.name,
      description: typeof item.description === "string" ? item.description : null,
      inputSchema: item.inputSchema,
      isEnabled: item.isEnabled === true,
      status: normalizeStatus(item.status),
      // Older backends don't send these; missing means "not set".
      displayName: normalizeDisplayText(item.displayName),
      displayDescription: normalizeDisplayText(item.displayDescription),
    });
  }

  return { functions, functionsDiscoveredOn: discoveredOn };
}

/**
 * `apiRequest`/`authedGet` throw `Error("<status>: <body>")`. Turns the body into something an
 * admin can read: the server's own `message`/`title`/`error` when the body is JSON, the raw
 * text otherwise.
 */
export function describeToolFunctionsError(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Please try again.";
  const match = /^(\d{3}):\s*([\s\S]*)$/.exec(error.message);
  if (!match) return error.message;
  const body = match[2].trim();
  try {
    const parsed = JSON.parse(body);
    const candidates = [parsed?.message, parsed?.title, parsed?.error, parsed?.data?.message, parsed?.errors?.[0]?.message, parsed?.errors?.[0]];
    const text = candidates.find((c) => typeof c === "string" && c.trim() !== "");
    if (text) return text;
  } catch {
    /* not JSON */
  }
  return body || `Request failed (${match[1]}).`;
}

export function toolFunctionsPath(toolId: number) {
  return `/md/api/v1/tenant/tool/${toolId}/functions`;
}

export function discoverToolFunctionsPath(toolId: number) {
  return `/ai/api/v1/tenant/tool/${toolId}/functions/discover`;
}

/**
 * WI 7726: saving or refreshing functions changes the draft tool (the server updates its
 * lastUpdatedOn), but the tool detail query is deliberately not refetched (see below). Patch the
 * cached tool instead, so the edit page's publish badge shows the unpublished change.
 */
function markToolDraftUpdated(queryClient: QueryClient, toolId: number) {
  queryClient.setQueriesData<Tool>({ queryKey: [`/md/api/v1/tenant/tool/${toolId}`] }, (tool) =>
    tool ? withDraftUpdatedNow(tool) : tool
  );
}

/**
 * WI 7447: reads, refreshes (discover) and saves an MCP tool's function allowlist. Saving goes
 * through its own PUT, independent of the tool's main "Save Tool" (PLAN.md contract). Saving and
 * refreshing only change the draft tool: they reach chat once the tool is published (tool
 * publish copies them), the same draft/publish model as agents.
 */
export function useToolFunctions(toolId: number | null | undefined, options: { enabled?: boolean } = {}) {
  const token = useAuth();
  const context = useContext(DataContext);
  const queryClient = useQueryClient();

  const path = toolId ? toolFunctionsPath(toolId) : "";
  const queryKey = [path, token, context.selectedTenantGuid];
  const enabled = (options.enabled ?? true) && !!toolId && !!token && !!context.selectedTenantGuid;

  const query = useQuery<ToolFunctionsSnapshot>({
    queryKey,
    enabled,
    queryFn: async () => normalizeToolFunctions(await authedGet<unknown>(path, token)),
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      if (!toolId) throw new Error("Save the tool before loading its functions.");
      const response = await apiRequest("POST", discoverToolFunctionsPath(toolId), {}, token);
      const wrapper = await response.json();
      return normalizeToolFunctions(wrapper?.data);
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKey, snapshot);
      markToolDraftUpdated(queryClient, toolId!);
      // No tool id: the functions query was just set from the response, and the tool detail
      // query must not refetch (it would overwrite unsaved edits on the edit page).
      invalidateToolQueries(queryClient);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (request: SaveToolFunctionsRequest) => {
      if (!toolId) throw new Error("Save the tool before changing its functions.");
      // Only send `functions` when there is display text to change, so a plain allowlist save
      // keeps the body older backends expect.
      const body: SaveToolFunctionsRequest = request.functions?.length
        ? { enabledFunctions: request.enabledFunctions, functions: request.functions }
        : { enabledFunctions: request.enabledFunctions };
      await apiRequest("PUT", toolFunctionsPath(toolId), body, token);
      return body;
    },
    onSuccess: ({ enabledFunctions, functions: displayUpdates }) => {
      // Reflect the save immediately, then let the server's view (statuses New -> Active)
      // replace it.
      const enabledSet = new Set(enabledFunctions);
      const displayByName = new Map((displayUpdates ?? []).map((u) => [u.name, u]));
      queryClient.setQueryData<ToolFunctionsSnapshot>(queryKey, (previous) =>
        previous
          ? {
              ...previous,
              functions: previous.functions.map((f) => {
                const display = displayByName.get(f.name);
                return {
                  ...f,
                  isEnabled: enabledSet.has(f.name),
                  ...(display ? { displayName: display.displayName, displayDescription: display.displayDescription } : {}),
                };
              }),
            }
          : previous
      );
      // The functions list itself plus every agent's copy (the permissions dialog lists the
      // tool's enabled functions). Deliberately NOT the tool detail query
      // (/tenant/tool/{id}): the edit page copies it into the form on every refetch, which would
      // throw away unsaved edits to the tool's other fields.
      queryClient.invalidateQueries({ queryKey: [toolFunctionsPath(toolId!)] });
      markToolDraftUpdated(queryClient, toolId!);
      invalidateToolQueries(queryClient);
    },
  });

  return {
    snapshot: query.data,
    isLoading: query.isLoading,
    loadError: query.error,
    discover: discoverMutation.mutate,
    discoverAsync: discoverMutation.mutateAsync,
    isDiscovering: discoverMutation.isPending,
    discoverError: discoverMutation.error,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
    resetSaveError: saveMutation.reset,
  };
}
