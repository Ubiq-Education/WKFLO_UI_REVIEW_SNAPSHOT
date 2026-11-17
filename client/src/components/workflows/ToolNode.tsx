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
import useAuth from '@/hooks/use-auth';

// Tool interface
interface Tool {
  id: number;
  name: string;
  description: string;
}

const ToolNode: React.FC<NodeProps> = ({ data, id }) => {
  const [toolId, setToolId] = useState<string | null>(data.toolId || null);
  const token = useAuth();
  
  // Fetch tools from the API
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['/md/api/v1/tenant/tools', token],
    queryFn: async () => {
      const response = await fetch('/md/api/v1/tenant/tools');
      if (!response.ok) {
        throw new Error('Failed to fetch tools');
      }
      return response.json();
    }
  });

  // Update node data when tool changes
  useEffect(() => {
    if (toolId) {
      const selectedTool = tools.find((tool: Tool) => tool.id.toString() === toolId);
      if (selectedTool) {
        data.toolId = toolId;
        data.name = selectedTool.name;
      }
    }
  }, [toolId, tools, data]);

  return (
    <div className="p-3 rounded-lg border-2 border-green-400 bg-white shadow-md w-64">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="w-6 h-6 bg-green-300 rounded-full flex items-center justify-center text-green-700 mr-2">
            T
          </div>
          <span className="font-medium">Tool</span>
        </div>
      </div>

      <div className="mb-2">
        <Select 
          value={toolId || ''} 
          onValueChange={(value) => setToolId(value)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full border-gray-300">
            <SelectValue placeholder="Select tool" />
          </SelectTrigger>
          <SelectContent>
            {isLoading ? (
              <SelectItem value="loading" disabled>Loading tools...</SelectItem>
            ) : tools.length > 0 ? (
              tools.map((tool: Tool) => (
                <SelectItem key={tool.id} value={tool.id.toString()}>
                  {tool.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" disabled>No tools available</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {toolId && (
        <div className="text-sm text-gray-600 border-t pt-2">
          <p className="truncate">{data.name}</p>
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#059669', width: '10px', height: '10px' }}
      />
      
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#059669', width: '10px', height: '10px' }}
      />
    </div>
  );
};

export default ToolNode;