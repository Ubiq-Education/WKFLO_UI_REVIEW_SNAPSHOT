import { useState, useEffect, useContext, useId, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { type Tool } from "@shared/schema";
import { toolFormSchema as formSchema } from "@/lib/entity-form-schemas";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { invalidateToolQueries } from "@/lib/tool-query-invalidation";
import { useToast } from "@/hooks/use-toast";
import ToolForm from "@/components/tools/tool-form";
import { PUBLISH_TOOL_HINT } from "@/components/tools/tool-form.types";
import {
  didSaveResetConnections,
  hasClientSecretAfterSave,
  parseConfigObject,
  settleClientSecretAfterSave,
} from "@/components/tools/config-editors/mcp-oauth-client-credentials";
import EntityTagsPanel from "@/components/tags/entity-tags-panel";
import { DeleteToolDialog, PublishToolDialog } from "@/components/tools/tool-actions";
import ToolPublishBadge from "@/components/tools/tool-publish-badge";
import { ArrowLeft, Trash, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import useAuth from "@/hooks/use-auth";
import { DataContext } from '@shared/models/chat-models';

type FormValues = z.infer<typeof formSchema>;

export default function EditTool() {
  const [match, params] = useRoute("/tools/:id/edit");
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  // WI 7447: "Manage permissions for this tool" only reaches chat once the tool is published.
  const [showPublishHint, setShowPublishHint] = useState(false);
  const token = useAuth();
  const context = useContext(DataContext);
  
  const toolId = match ? parseInt(params.id) : null;
  
  const { data: tool, isLoading } = useQuery<Tool>({
    queryKey: [`/md/api/v1/tenant/tool/${toolId}`, token, context.selectedTenantGuid],
    enabled: !!toolId && !!token && !!context.selectedTenantGuid,
  });
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "HTTP",
      config: "{}",
      isActive: true,
      tags: [],
      maxToolOutputLength: null,
      permissionsEnabled: false,
    },
  });
  
  // Read during render so the form tracks it (react-hook-form only updates subscribed state).
  const isFormDirty = form.formState.isDirty;
  // WI 7726: unsaved edits in the MCP Functions panel (its own draft, saved separately).
  const [hasUnsavedFunctions, setHasUnsavedFunctions] = useState(false);
  const hasUnsavedChanges = isFormDirty || hasUnsavedFunctions;
  // The form's values when the current save started (before submit-time normalization).
  const submittedValuesRef = useRef<FormValues | null>(null);
  // The config the backend holds as far as this page knows (the loaded tool, then each save).
  const savedConfigRef = useRef<string | null>(null);
  // Task 7851: the last successful save changed an OAuth2 MCP tool's endpoint or client
  // credentials, so the backend reset every existing connection.
  const [mcpConnectionsReset, setMcpConnectionsReset] = useState(false);

  // Update form when tool data is loaded. `reset` (not setValue) makes these the form's saved
  // values, so isDirty reflects real edits. A refetch never overwrites unsaved edits (e.g. the
  // tool detail cache changing after a publish or a Functions panel save).
  useEffect(() => {
    if (!tool || form.formState.isDirty) return;
    form.reset({
      ...form.getValues(),
      name: tool.name,
      description: tool.description,
      type: tool.type,
      config: tool.config,
      isActive: tool.isActive,
      maxToolOutputLength: tool.maxToolOutputLength ?? null,
      // Off when the backend doesn't return the flag (opt-in for every type, PLAN.md decision 8).
      permissionsEnabled: tool.permissionsEnabled ?? false,
    });
    savedConfigRef.current = tool.config;
  }, [tool, form]);
  
  const updateToolMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await apiRequest("PUT", `/md/api/v1/tenant/tool/${toolId}`, values, token);
      return response.json();
    },
    onSuccess: (_result, values) => {
      setShowPublishHint(values.permissionsEnabled !== (tool?.permissionsEnabled ?? false));
      // `values.config` is what was actually posted (ToolForm normalizes it on submit).
      const posted = values.type === "MCP" ? parseConfigObject(values.config) : null;
      const before = parseConfigObject(savedConfigRef.current);
      setMcpConnectionsReset(posted ? didSaveResetConnections(before, posted) : false);
      markSavedValues(
        submittedValuesRef.current ?? values,
        posted ? { posted, hasClientSecret: hasClientSecretAfterSave(before, posted) } : null
      );
      // Stay on this page after saving (rather than navigating back to the list) and let the
      // invalidated tool query refetch in place - the refetch's useEffect below re-syncs the form,
      // so e.g. a newly-provisioned mcpOAuthConnectionId (see McpOAuthConnectionIdProvisioner)
      // shows up immediately without the admin having to navigate away and back.
      // Also refreshes every agent's copy of this tool's data (e.g. a changed "Manage
      // permissions for this tool" must enable/disable the agent Tools tab's Permissions button).
      invalidateToolQueries(queryClient, toolId);
      toast({
        title: "Tool updated",
        description: "Your tool has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update tool: ${error.message}`,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSaving(false);
    }
  });
  
  /**
   * The saved values are no longer unsaved changes, so the refetch below may re-sync the form.
   * Edits typed while the save was in flight stay, and stay unsaved (so Publish waits and the
   * refetch leaves them alone). The baseline is the form's own values at submit, not the
   * submitted ones: ToolForm re-serializes some configs on submit (Priority_QA,
   * Chat_Classification), and with reset(values, { keepDirtyValues: true }) an edited config
   * would keep differing from that re-serialized copy, leaving the form dirty after every save.
   *
   * Task 7851: for an MCP tool, the client secret / clear that were just saved are removed from
   * both copies and hasClientSecret is set to what the backend now holds - otherwise a typed
   * secret stayed in the form (the refetch doesn't re-sync it when the tool comes back unchanged)
   * and was posted again on every later save.
   */
  function markSavedValues(
    saved: FormValues,
    mcpSecret: { posted: Record<string, unknown>; hasClientSecret: boolean } | null
  ) {
    const current = { ...form.getValues() };
    if (mcpSecret) {
      saved = { ...saved, config: settleClientSecretAfterSave(saved.config, mcpSecret.posted, mcpSecret.hasClientSecret) };
      current.config = settleClientSecretAfterSave(current.config, mcpSecret.posted, mcpSecret.hasClientSecret);
    }
    form.reset(saved);
    savedConfigRef.current = saved.config;
    for (const key of Object.keys(current) as Array<keyof FormValues>) {
      if (JSON.stringify(current[key]) !== JSON.stringify(saved[key])) {
        form.setValue(key, current[key] as never, { shouldDirty: true });
      }
    }
  }

  function onSubmit(values: FormValues) {
    submittedValuesRef.current = form.getValues();
    setIsSaving(true);
    updateToolMutation.mutate(values);
  }
  
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    );
  }
  
  if (!tool) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Tool not found</h1>
          <p>The tool you're trying to edit doesn't exist.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/tools")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-semibold ml-2">Edit Tool</h1>
          <ToolPublishBadge tool={tool} />
          {toolId && (
            <div className="ml-auto flex items-center gap-2">
              {/* Same publish flow as the tool card. It publishes what is saved, so it's
                  unavailable while there are unsaved changes or the tool is being saved. */}
              {hasUnsavedChanges ? (
                <SaveBeforePublishing />
              ) : (
                <PublishToolDialog
                  toolId={toolId}
                  note={
                    <p className="text-sm text-muted-foreground" data-testid="publish-saved-only-note">
                      Only saved changes are published. Save any changes on this page first.
                    </p>
                  }
                  renderTrigger={(isPending) => (
                    <Button variant="outline" size="sm" disabled={isPending || isSaving}>
                      <Upload className="mr-2 h-4 w-4" />
                      {isPending ? "Publishing..." : "Publish"}
                    </Button>
                  )}
                />
              )}
              {/* Same delete flow as the tool card; the tool is gone afterwards, so go back to the list. */}
              <DeleteToolDialog
                toolId={toolId}
                onDeleted={() => navigate("/tools")}
                renderTrigger={(isPending) => (
                  <Button variant="outline" size="sm" disabled={isPending || isSaving}>
                    <Trash className="mr-2 h-4 w-4" />
                    {isPending ? "Deleting..." : "Delete"}
                  </Button>
                )}
              />
            </div>
          )}
        </div>
        
        <ToolForm
          form={form}
          onSubmit={onSubmit}
          isSubmitting={isSaving}
          onCancel={() => navigate("/tools")}
          mcpOAuthConnectionId={tool.mcpOAuthConnectionId}
          toolId={toolId}
          onFunctionsDirtyChange={setHasUnsavedFunctions}
          mcpConnectionsReset={mcpConnectionsReset}
        />
        {showPublishHint && (
          <p className="mt-3 text-sm text-green-700" role="status" data-testid="tool-publish-hint">
            {PUBLISH_TOOL_HINT}
          </p>
        )}
        {toolId && (
          <div className="mt-6">
            <EntityTagsPanel entityType="Tool" entityId={toolId} />
          </div>
        )}
      </div>
    </div>
  );
}

const SAVE_BEFORE_PUBLISHING = "Save your changes before publishing.";

/** Disabled Publish button, with the reason as a tooltip (also for keyboard and screen readers). */
function SaveBeforePublishing() {
  const hintId = useId();
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer or focus events, so the tooltip hangs on a focusable
              wrapper that stands in for the button (one "Publish, unavailable" target); the
              visual button inside is hidden from assistive tech. */}
          <span
            role="button"
            aria-disabled="true"
            aria-label="Publish"
            tabIndex={0}
            aria-describedby={hintId}
            className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="publish-disabled-trigger"
          >
            <Button variant="outline" size="sm" disabled aria-hidden="true" tabIndex={-1}>
              <Upload className="mr-2 h-4 w-4" />
              Publish
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{SAVE_BEFORE_PUBLISHING}</TooltipContent>
      </Tooltip>
      <span id={hintId} className="sr-only">{SAVE_BEFORE_PUBLISHING}</span>
    </TooltipProvider>
  );
}
