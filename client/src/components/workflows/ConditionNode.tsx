import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ConditionNode: React.FC<NodeProps> = ({ data }) => {
  const [condition, setCondition] = useState<string>(data.condition || 'untitled condition');

  // Update node data when condition changes
  const handleConditionChange = (value: string) => {
    setCondition(value);
    data.condition = value;
  };

  return (
    <div className="p-3 rounded-lg border-2 border-purple-400 bg-white shadow-md w-64">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="w-6 h-6 bg-purple-300 rounded-full flex items-center justify-center text-purple-700 mr-2">
            C
          </div>
          <span className="font-medium">Condition</span>
        </div>
      </div>

      <div className="mb-2">
        <Label htmlFor="condition-name" className="text-xs block mb-1">Condition Name</Label>
        <Input
          id="condition-name"
          value={condition}
          onChange={(e) => handleConditionChange(e.target.value)}
          placeholder="Enter condition name"
          className="border-gray-300"
        />
      </div>

      <div className="text-sm text-gray-600 border-t pt-2">
        <div className="flex justify-between mt-1">
          <span className="text-xs">True</span>
          <span className="text-xs">False</span>
        </div>
      </div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#7E22CE', width: '10px', height: '10px' }}
      />
      
      {/* Two output handles for true/false paths */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ background: '#16A34A', width: '10px', height: '10px', left: '30%' }}
      />
      
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ background: '#DC2626', width: '10px', height: '10px', left: '70%' }}
      />
    </div>
  );
};

export default ConditionNode;