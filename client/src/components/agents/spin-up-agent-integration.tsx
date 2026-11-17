import { useContext } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Agent, SpinUpAgentTarget } from '@shared/schema';
import useAuth from '@/hooks/use-auth';
import { DataContext } from '@shared/models/chat-models';

interface SpinUpAgentIntegrationProps {
  agentId: number;
}

export default function SpinUpAgentIntegration({ agentId }: SpinUpAgentIntegrationProps) {
  const { toast } = useToast();
  const token = useAuth();
  const context = useContext(DataContext);

  // Get all tenant agents to pick from (excluding this agent itself)
  const { data: allAgents, isLoading: isLoadingAgents } = useQuery<Agent[]>({
    queryKey: ['/md/api/v1/tenant/agents', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  // Get the agents currently allowed to be spun up by this agent.
  // Note: this endpoint returns names (+ icon URLs), not ids — matched against allAgents by name below.
  const { data: allowedSpinUpAgents, isLoading: isLoadingAllowed } = useQuery<SpinUpAgentTarget[]>({
    queryKey: [`/ai/api/v1/tenant/agent/${agentId}/spin-up/agents`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
  });

  // Add/remove an agent from this agent's spin-up allowlist
  const manageSpinUpAgentMutation = useMutation({
    mutationFn: async ({ allowedAgentId, action }: { allowedAgentId: number; action: 'add' | 'remove' }) => {
      if (action === 'add') {
        return apiRequest('POST', `/md/api/v1/tenant/agent/${agentId}/spin-up/agents/${allowedAgentId}`, {}, token);
      } else {
        return apiRequest('DELETE', `/md/api/v1/tenant/agent/${agentId}/spin-up/agents/${allowedAgentId}`, {}, token);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/ai/api/v1/tenant/agent/${agentId}/spin-up/agents`] });
      toast({
        title: 'Success',
        description: 'Spin-up agents updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update spin-up agents: ${error}`,
        variant: 'destructive',
      });
    },
  });

  // Check if an agent is already in the spin-up allowlist
  const isAgentAllowed = (agentName: string): boolean => {
    return allowedSpinUpAgents?.some((a) => a.name === agentName) || false;
  };

  // Toggle an agent (add/remove) in this agent's spin-up allowlist
  const toggleAgent = (targetAgent: Agent) => {
    const action = isAgentAllowed(targetAgent.name) ? 'remove' : 'add';
    manageSpinUpAgentMutation.mutate({ allowedAgentId: targetAgent.id, action });
  };

  const pickableAgents = allAgents?.filter((a) => a.id !== agentId) ?? [];

  if (isLoadingAgents || isLoadingAllowed) {
    return <div>Loading agents...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Spin-Up Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {pickableAgents.length > 0 ? (
            <div className="space-y-3">
              {pickableAgents.map((targetAgent) => (
                <div
                  key={targetAgent.id}
                  role="group"
                  aria-label={targetAgent.name}
                  className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium text-sm">{targetAgent.name}</div>
                    <div className="text-xs text-gray-500">{targetAgent.description}</div>
                  </div>
                  <Button
                    size="sm"
                    variant={isAgentAllowed(targetAgent.name) ? "default" : "outline"}
                    onClick={() => toggleAgent(targetAgent)}
                    disabled={manageSpinUpAgentMutation.isPending}
                  >
                    {isAgentAllowed(targetAgent.name) ? (
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
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No other agents available in this tenant.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
