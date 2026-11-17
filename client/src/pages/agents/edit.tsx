import { useState, useEffect, useContext } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { type Agent } from "@shared/schema";
import { agentEditFormSchema } from "@/lib/entity-form-schemas";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AgentForm from "@/components/agents/agent-form";
import EntityTagsPanel from "@/components/tags/entity-tags-panel";
import { Skeleton } from "@/components/ui/skeleton";
import useAuth from "@/hooks/use-auth";
import { DataContext } from '@shared/models/chat-models';

type FormValues = z.output<typeof agentEditFormSchema>;
// Fields with `.default()` are optional on input and required on output (zod 4).
type FormInput = z.input<typeof agentEditFormSchema>;

export default function EditAgent() {
  const [match, params] = useRoute("/agents/:id/edit");
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const token = useAuth();
  const context = useContext(DataContext);

  const agentId = match ? params.id : null;
  
  const { data: agent, isLoading: isLoadingAgent } = useQuery<Agent>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
  });
  
  // We don't need to get the agent's tools anymore since we removed the tools selection
  // but keeping the query for compatibility with the rest of the code
  const { data: agentTools, isLoading: isLoadingTools } = useQuery<{ id: number }[]>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}/tools`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
  });
  
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(agentEditFormSchema),
    defaultValues: {
      name: "",
      description: "",
      aiModelId: undefined,
      systemPrompt: "",
      additionalInstructions: "",
      tools: [], // We keep this for compatibility but it won't be used in the UI
      enableSTM: false,
      enableLTM: false,
      enableSpinUpAgents: false,
    },
  });
  
  // Populate form once agent (and optionally agentTools) data is loaded
  useEffect(() => {
    if (agent) {
      form.reset({
        name: agent.name,
        description: agent.description,
        provider: agent.provider || "openai",
        apiKey: agent.apiKey || "",
        endpoint: agent.endpoint || "",
        aiModelId: agent.aiModelId ?? undefined,
        systemPrompt: agent.systemPrompt,
        // Always round-tripped in the PUT so saving here never wipes what the admin set in CMS.
        additionalInstructions: agent.additionalInstructions ?? "",
        enableSTM: (agent as any).enableSTM ?? false,
        enableLTM: (agent as any).enableLTM ?? false,
        enableSpinUpAgents: (agent as any).enableSpinUpAgents ?? false,
        tools: agentTools?.map((t) => t.id) ?? [],
      });
    }
  }, [agent, agentTools]);
  
  const updateAgentMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Extract the tools array from the form values
      const { tools, ...agentData } = values;
      
      // First, update the agent's basic information
      const agentResponse = await apiRequest("PUT", `/md/api/v1/tenant/agent/${agentId}`, agentData, token);
      const updatedAgent = await agentResponse.json();
      
      // Always update the agent's tools (even if empty array)
      // This ensures we remove all tools if none are selected
      // try {
      //   console.log("Updating agent tools:", tools);
      //   const toolsResponse = await apiRequest("PUT", `/md/api/v1/tenant/agent/${agentId}/tools`, { tools: tools || [] }, token);
      //   const updatedTools = await toolsResponse.json();
      //   return { ...updatedAgent, tools: updatedTools };
      // } catch (error) {
      //   console.error("Error updating agent tools:", error);
      //   return updatedAgent;
      // }

      return updatedAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}`] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}/tools`] });
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      toast({
        title: "Agent updated",
        description: "Your agent has been updated successfully.",
      });
      navigate(`/agents/view/${agentId}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update agent: ${error.message}`,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSaving(false);
    }
  });
  
  function onSubmit(values: FormValues) {
    console.log("Submitting form values:", values);
    console.log("Form errors:", form.formState.errors);
    setIsSaving(true);
    updateAgentMutation.mutate(values);
  }
  
  const isLoading = isLoadingAgent || isLoadingTools;
  
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
  
  if (!agent) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Agent not found</h1>
          <p>The agent you're trying to edit doesn't exist.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Edit Agent</h1>
        <AgentForm
          form={form}
          onSubmit={onSubmit}
          isSubmitting={isSaving}
          formTitle="Edit Agent"
          submitLabel="Save Changes"
          showAdditionalInstructions
        />
        <div className="mt-6">
          <EntityTagsPanel entityType="Agent" entityId={parseInt(agentId!)} />
        </div>
      </div>
    </div>
  );
}
