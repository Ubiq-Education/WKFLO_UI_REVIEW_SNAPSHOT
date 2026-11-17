import { useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface WorkflowStep {
  id: string;
  toolName: string;
  toolIcon?: string;
  status: 'completed' | 'in-progress' | 'pending';
  description: string;
}

interface AgentWorkflowProps {
  steps: WorkflowStep[];
  isVisible: boolean;
}

export function AgentWorkflow({ steps, isVisible }: AgentWorkflowProps) {
  if (!isVisible || steps.length === 0) return null;

  return (
    <div className="mb-4 mt-4 p-3 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex flex-col space-y-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-start">
            {/* Vertical line connecting steps */}
            {index < steps.length - 1 && (
              <div className="absolute ml-6 border-l-2 border-gray-200 border-dashed" />
            )}
            
            {/* Tool icon/status */}
            <div className="relative mr-4 flex-shrink-0">
              <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full border border-gray-200">
                {step.toolIcon ? (
                  <img src={step.toolIcon} alt={step.toolName} className="w-6 h-6" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-xs font-medium text-indigo-800">
                      {step.toolName.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              {step.status === 'completed' && (
                <div className="absolute -right-1 -bottom-1">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              )}
            </div>
            
            {/* Step details */}
            <div className="flex flex-col mb-2">
              <div className="flex items-center">
                <span className="font-medium text-gray-900">Used {step.toolName}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hook to manage workflow steps
export function useAgentWorkflow() {
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [isWorkflowVisible, setIsWorkflowVisible] = useState(false);
  
  const addWorkflowStep = (step: Omit<WorkflowStep, 'id'>) => {
    
    const newStep = {
      ...step,
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    };
    
    setWorkflowSteps(prev => [...prev, newStep]);
    if (!isWorkflowVisible) {
      setIsWorkflowVisible(true);
    }
  };
  
  const clearWorkflow = () => {
    setWorkflowSteps([]);
    setIsWorkflowVisible(false);
  };
  
  return {
    workflowSteps,
    isWorkflowVisible,
    addWorkflowStep,
    clearWorkflow,
    setIsWorkflowVisible
  };
}