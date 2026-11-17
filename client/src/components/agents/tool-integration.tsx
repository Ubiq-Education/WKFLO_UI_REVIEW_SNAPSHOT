import { useState, useEffect, useContext, useRef, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Check, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Tool, Agent } from '@shared/schema';
import useAuth from '@/hooks/use-auth';
import { DataContext } from '@shared/models/chat-models';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AgentToolPermissionsEntry, agentToolPermissionsPath, useAgentToolPermissions } from '@/hooks/use-agent-tool-permissions';
import AgentToolPermissionsDialog from './agent-tool-permissions-dialog';
import { buildToolPromptSentence, hasToolToken, removeToolTokens } from './prompt-tool-tokens';

/** Which step of disconnecting a tool failed - see manageToolMutation. */
class DisconnectToolError extends Error {
  constructor(readonly step: 'prompt' | 'unlink', readonly promptUpdated: boolean, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * WI 7447: per-agent tool permissions entry point. Enabled only when the tool takes part in
 * the permission system ("Manage permissions for this tool" on the tool).
 */
function ToolPermissionsButton({ entry, onOpen }: { entry: AgentToolPermissionsEntry | undefined; onOpen: () => void }) {
  const hintId = useId();
  const hint = entry ? "Turn on 'Manage permissions for this tool' on the tool first" : "Permissions are loading or unavailable";
  if (entry?.permissionsEnabled) {
    return (
      <Button size="sm" variant="outline" onClick={onOpen}>
        <ShieldCheck className="h-4 w-4 mr-1" /> Permissions
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons swallow pointer events, so the tooltip hangs off a focusable wrapper. */}
        <span tabIndex={0} data-testid="permissions-disabled-trigger" aria-describedby={hintId}>
          <Button size="sm" variant="outline" disabled className="pointer-events-none">
            <ShieldCheck className="h-4 w-4 mr-1" /> Permissions
          </Button>
          <span id={hintId} className="sr-only">{hint}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

interface ToolIntegrationProps {
  agentId: number;
  onToolsUpdated?: () => void;
}

export default function ToolIntegration({ agentId, onToolsUpdated }: ToolIntegrationProps) {
  const { toast } = useToast();
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  // The latest prompt this tab knows was saved: updated by every successful prompt save here and
  // by every agent (re)fetch. Prompt edits are always built from this, never from the agent
  // query's cached copy - right after a save that copy is still the old prompt until the refetch
  // lands, and building from it would silently drop the text just saved.
  const latestPromptRef = useRef<string>('');
  const setLatestPrompt = (prompt: string) => {
    latestPromptRef.current = prompt;
    setSystemPrompt(prompt);
  };
  const [permissionsToolId, setPermissionsToolId] = useState<number | null>(null);
  const { tools: toolPermissions } = useAgentToolPermissions(agentId);
  const permissionsFor = (toolId: number) => toolPermissions.find(entry => entry.toolId === toolId);
  const permissionsEntry = permissionsToolId !== null ? permissionsFor(permissionsToolId) : undefined;
  const token = useAuth();
  // The provider's client (the app-wide one in App.tsx) rather than the module singleton.
  const queryClient = useQueryClient();
  const context = useContext(DataContext);
  
  // Get all available tools
  const { data: allTools, isLoading: isLoadingTools } = useQuery<Tool[]>({
    queryKey: ['/md/api/v1/tenant/tools', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid
  });
  
  // Get agent's current tools
  const { data: agentTools, isLoading: isLoadingAgentTools } = useQuery<Tool[]>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}/tools`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
    // Tool settings change elsewhere (tool edit page, Functions panel): don't trust a copy older
    // than this; refetch when the tab is shown again or the window regains focus.
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  
  // Get agent data to access system prompt
  const { data: agent, isFetching: isFetchingAgent } = useQuery<Agent>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid
  });
  
  // Update systemPrompt when agent data is loaded
  // Also syncs an emptied prompt (e.g. after removing the only tool token).
  useEffect(() => {
    if (agent) {
      setLatestPrompt(agent.systemPrompt ?? '');
    }
  }, [agent]);

  const agentPath = `/md/api/v1/tenant/agent/${agentId}`;

  // Same partial agent update "Add to Prompt" uses: only systemPrompt is sent; the backend
  // leaves every field that isn't sent unchanged.
  const savePrompt = (newPrompt: string) => apiRequest('PUT', agentPath, { systemPrompt: newPrompt }, token);

  /** Removes the tool's token(s) from the saved prompt; returns whether anything changed. */
  const removeToolFromPrompt = async (toolId: number): Promise<boolean> => {
    const current = latestPromptRef.current;
    const updated = removeToolTokens(current, toolId);
    if (updated === current) return false;
    await savePrompt(updated);
    setLatestPrompt(updated);
    return true;
  };

  const removeFromPromptMutation = useMutation({
    mutationFn: async (tool: Tool) => removeToolFromPrompt(tool.id),
    onSuccess: (changed, tool) => {
      toast(changed
        ? { title: 'Removed from prompt', description: `${tool.name} is no longer referenced in the system prompt.` }
        : { title: 'Nothing to remove', description: `${tool.name} wasn't in the system prompt.` });
    },
    onError: (_error, tool) => {
      toast({
        title: 'Error',
        description: `Couldn't remove ${tool.name} from the system prompt. Please try again.`,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [agentPath] });
    },
  });
  
  // Update agent system prompt
  const updatePromptMutation = useMutation({
    mutationFn: async (newPrompt: string) => {
      await savePrompt(newPrompt);
      setLatestPrompt(newPrompt);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}`] });
      toast({
        title: 'Success',
        description: 'System prompt updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update system prompt: ${error}`,
        variant: 'destructive',
      });
    },
  });
  
  // Add/Remove tool from agent
  const manageToolMutation = useMutation({
    // Disconnecting first takes the tool's token(s) out of the prompt (a token left for an
    // unlinked tool would reach the model as literal text), then unlinks it. If the prompt
    // update fails nothing else is touched; if the unlink fails after the prompt was updated,
    // the error says so. Either way everything is refetched.
    mutationFn: async ({ toolId, action }: { toolId: number, action: 'add' | 'remove' }) => {
      if (action === 'add') {
        return apiRequest('POST', `/md/api/v1/tenant/agent/${agentId}/tool/${toolId}`, {}, token);
      }

      let promptUpdated = false;
      try {
        promptUpdated = await removeToolFromPrompt(toolId);
      } catch (error) {
        throw new DisconnectToolError('prompt', false, error);
      }
      try {
        return await apiRequest('DELETE', `/md/api/v1/tenant/agent/${agentId}/tool/${toolId}`, {}, token);
      } catch (error) {
        throw new DisconnectToolError('unlink', promptUpdated, error);
      }
    },
    onSuccess: () => {
      onToolsUpdated?.(); // Notify parent component of tool changes
      toast({
        title: 'Success',
        description: 'Agent tools updated successfully',
      });
    },
    onError: (error) => {
      let description = `Failed to update tools: ${error}`;
      if (error instanceof DisconnectToolError) {
        description = error.step === 'prompt'
          ? "Couldn't remove this tool from the system prompt, so it was not disconnected. Please try again."
          : error.promptUpdated
            ? 'The tool was removed from the system prompt, but disconnecting it failed. Please try again.'
            : "Couldn't disconnect this tool. Please try again.";
      }
      toast({
        title: 'Error',
        description,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}/tools`] });
      queryClient.invalidateQueries({ queryKey: [agentToolPermissionsPath(agentId)] });
      queryClient.invalidateQueries({ queryKey: [agentPath] });
    },
  });
  
  // Check if a tool is already added to the agent
  const isToolConnected = (toolId: number): boolean => {
    return agentTools?.some(tool => tool.id === toolId) || false;
  };
  
  // Check if a tool is referenced in the system prompt
  const isToolReferenced = (toolId: number): boolean => hasToolToken(systemPrompt, toolId);
  
  // Add a tool reference to the system prompt
  const addToolReference = (tool: Tool) => {
    const current = latestPromptRef.current;
    if (!current) return;
    
    // First check if the tool is already referenced
    if (hasToolToken(current, tool.id)) {
      toast({
        title: 'Tool already referenced',
        description: `${tool.name} is already referenced in the system prompt`,
      });
      return;
    }
    
    // Update system prompt with new tool reference
    const updatedPrompt = current + `\n\n${buildToolPromptSentence(tool.id, tool.name, tool.description)}`;
    
    // Save the updated prompt
    updatePromptMutation.mutate(updatedPrompt);
  };
  
  // Toggle a tool (add/remove) for this agent
  const toggleTool = (tool: Tool) => {
    const action = isToolConnected(tool.id) ? 'remove' : 'add';
    manageToolMutation.mutate({ toolId: tool.id, action });
  };
  
  // One write at a time, so two prompt edits can't race and overwrite each other - and none
  // while the agent is being refetched, so the buttons reflect the prompt that was just saved.
  const isPromptBusy = updatePromptMutation.isPending || removeFromPromptMutation.isPending || manageToolMutation.isPending || isFetchingAgent;

  if (isLoadingTools || isLoadingAgentTools) {
    return <div>Loading tools...</div>;
  }
  
  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      
      <Card>
        <CardHeader>
          <CardTitle>Available Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allTools?.map(tool => (
              <div 
                key={tool.id}
                role="group"
                aria-label={tool.name}
                className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium text-sm">{tool.name}</div>
                  <div className="text-xs text-gray-500">{tool.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  {tool.type === "Priority_QA" && isToolConnected(tool.id) && (
                    <Badge className="bg-purple-100 text-purple-800">Priority source</Badge>
                  )}

                  {tool.type === "Chat_Classification" && isToolConnected(tool.id) && (
                    <Badge className="bg-teal-100 text-teal-800">Auto-classifying</Badge>
                  )}

                  {tool.type !== "Integration_Amais" && tool.type !== "Priority_QA" && tool.type !== "Chat_Classification" && tool.type !== "Contact_Form" && (
                    <>
                      {isToolReferenced(tool.id) ? (
                        // Shown even for an unlinked tool, so a leftover token can still be cleaned up.
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-200 bg-green-100 text-green-800 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                              aria-label={`Remove ${tool.name} from prompt`}
                              disabled={isPromptBusy}
                              onClick={() => removeFromPromptMutation.mutate(tool)}
                            >
                              {removeFromPromptMutation.isPending && removeFromPromptMutation.variables?.id === tool.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <X className="h-4 w-4 mr-1" />
                              )}
                              In Prompt
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove from prompt</TooltipContent>
                        </Tooltip>
                      ) : isToolConnected(tool.id) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPromptBusy}
                          onClick={() => addToolReference(tool)}
                        >
                          Add to Prompt
                        </Button>
                      ) : null}
                    </>
                  )}

                  {isToolConnected(tool.id) && (
                    <ToolPermissionsButton
                      entry={permissionsFor(tool.id)}
                      onOpen={() => setPermissionsToolId(tool.id)}
                    />
                  )}

                  <Button
                    size="sm"
                    variant={isToolConnected(tool.id) ? "default" : "outline"}
                    disabled={isPromptBusy}
                    onClick={() => toggleTool(tool)}
                  >
                    {isToolConnected(tool.id) ? (
                      <>
                        <Check className="h-4 w-4 mr-1" /> Connected
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-1" /> Connect
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {permissionsEntry && (
        <AgentToolPermissionsDialog
          agentId={agentId}
          tool={permissionsEntry}
          open={permissionsToolId !== null}
          onOpenChange={(open) => { if (!open) setPermissionsToolId(null); }}
        />
      )}
    </div>
    </TooltipProvider>
  );
}
