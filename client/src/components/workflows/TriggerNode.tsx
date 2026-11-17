import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from '@/components/ui/select';

const TriggerNode: React.FC<NodeProps> = ({ data }) => {
  const [triggerType, setTriggerType] = useState<string>(data.type || 'manual');

  // Update node data when trigger type changes
  const handleTriggerChange = (value: string) => {
    setTriggerType(value);
    
    // Update the node data
    data.type = value;
    
    // Set label based on trigger type
    switch(value) {
      case 'manual':
        data.label = 'Manual message';
        break;
      case 'scheduled':
        data.label = 'Scheduled trigger';
        break;
      case 'webhook':
        data.label = 'Webhook trigger';
        break;
      default:
        data.label = 'Trigger';
    }
  };

  return (
    <div className="p-3 rounded-lg border-2 border-orange-400 bg-white shadow-md w-64">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="w-6 h-6 bg-orange-300 rounded-full flex items-center justify-center text-orange-700 mr-2">
            T
          </div>
          <span className="font-medium">Trigger</span>
        </div>
      </div>

      <div className="mb-2">
        <Select 
          value={triggerType} 
          onValueChange={handleTriggerChange}
        >
          <SelectTrigger className="w-full border-gray-300">
            <SelectValue placeholder="Select trigger type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual message</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-gray-600 border-t pt-2">
        <p className="truncate">{data.label}</p>
        
        {triggerType === 'scheduled' && (
          <div className="mt-1 text-xs bg-orange-50 p-1 rounded">
            Runs on a schedule (Configure in advanced settings)
          </div>
        )}
        
        {triggerType === 'webhook' && (
          <div className="mt-1 text-xs bg-orange-50 p-1 rounded">
            Triggered by external HTTP request
          </div>
        )}
      </div>

      {/* Only output handle for trigger (no input) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#D97706', width: '10px', height: '10px' }}
      />
    </div>
  );
};

export default TriggerNode;