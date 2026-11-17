import React, { useState, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from '@/components/ui/select';

// Agent interface
interface Agent {
  id: number;
  name: string;
  description: string;
}

const AgentNode: React.FC<NodeProps> = ({ data, id }) => {
  const [agentId, setAgentId] = useState<string | null>(data.agentId || null);
  
  // Fetch agents from the API
  const { data: agents = [] as Agent[], isLoading } = useQuery<Agent[]>({
    queryKey: ['/md/api/v1/tenant/agents'],
    // queryFn: async () => {
    //   const response = await fetch('/md/api/v1/tenant/agents');
    //   if (!response.ok) {
    //     throw new Error('Failed to fetch agents');
    //   }
    //   return response.json();
    // }
  });

  // Update node data when agent changes
  useEffect(() => {
    if (agentId) {
      const selectedAgent = agents.find((agent: Agent) => agent.id.toString() === agentId);
      if (selectedAgent) {
        data.agentId = agentId;
        data.name = selectedAgent.name;
      }
    }
  }, [agentId, agents, data]);

  return (
    <div className="p-3 rounded-lg border-2 border-blue-400 bg-white shadow-md w-64">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="w-6 h-6 bg-blue-300 rounded-full flex items-center justify-center text-blue-700 mr-2">
            A
          </div>
          <span className="font-medium">Agent</span>
        </div>
      </div>

      <div className="mb-2">
        <Select 
          value={agentId || ''} 
          onValueChange={(value) => setAgentId(value)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full border-gray-300">
            <SelectValue placeholder="Select agent" />
          </SelectTrigger>
          <SelectContent>
            {isLoading ? (
              <SelectItem value="loading" disabled>Loading agents...</SelectItem>
            ) : agents.length > 0 ? (
              agents.map((agent: Agent) => (
                <SelectItem key={agent.id} value={agent.id.toString()}>
                  {agent.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" disabled>No agents available</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {agentId && (
        <div className="text-sm text-gray-600 border-t pt-2">
          <p className="truncate">{data.name}</p>
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#1E40AF', width: '10px', height: '10px' }}
      />
      
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#1E40AF', width: '10px', height: '10px' }}
      />
    </div>
  );
};

export default AgentNode;