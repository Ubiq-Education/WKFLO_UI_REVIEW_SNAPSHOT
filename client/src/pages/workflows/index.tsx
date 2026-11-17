import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { config } from '@/lib/config';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  Position,
  Handle
} from 'reactflow';
import 'reactflow/dist/style.css';

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getTenantHeaders } from '@/lib/tenant-config';
import { Loader2, Pencil, Trash2, Copy } from "lucide-react";
import useAuth from '@/hooks/use-auth';

// Simple Node Components
const TriggerNode = ({ data }: any) => (
  <div className="rounded-md border border-orange-400 bg-white p-1 shadow-md w-36">
    <div className="bg-orange-100 rounded-sm px-1 text-[10px] font-medium mb-0.5 flex items-center h-5">
      <div className="w-3 h-3 bg-orange-400 rounded-full mr-1 flex items-center justify-center text-white text-[8px]">T</div>
      Trigger
    </div>
    <div className="text-[10px] px-1 truncate">
      {data.label}
    </div>
    <Handle type="source" position={Position.Bottom} id="a" />
  </div>
);

const AgentNode = ({ data }: any) => (
  <div className="rounded-md border border-blue-400 bg-white p-1 shadow-md w-36">
    <div className="bg-blue-100 rounded-sm px-1 text-[10px] font-medium mb-0.5 flex items-center h-5">
      <div className="w-3 h-3 bg-blue-400 rounded-full mr-1 flex items-center justify-center text-white text-[8px]">A</div>
      Agent
    </div>
    <div className="text-[10px] px-1 truncate">
      {data.label}
    </div>
    <Handle type="target" position={Position.Top} id="a" />
    <Handle type="source" position={Position.Bottom} id="b" />
  </div>
);

const ToolNode = ({ data }: any) => (
  <div className="rounded-md border border-green-400 bg-white p-1 shadow-md w-36">
    <div className="bg-green-100 rounded-sm px-1 text-[10px] font-medium mb-0.5 flex items-center h-5">
      <div className="w-3 h-3 bg-green-400 rounded-full mr-1 flex items-center justify-center text-white text-[8px]">T</div>
      Tool
    </div>
    <div className="text-[10px] px-1 truncate">
      {data.label}
    </div>
    <Handle type="target" position={Position.Top} id="a" />
    <Handle type="source" position={Position.Bottom} id="b" />
  </div>
);

const ConditionNode = ({ data }: any) => (
  <div className="rounded-md border border-purple-400 bg-white p-1 shadow-md w-36">
    <div className="bg-purple-100 rounded-sm px-1 text-[10px] font-medium mb-0.5 flex items-center h-5">
      <div className="w-3 h-3 bg-purple-400 rounded-full mr-1 flex items-center justify-center text-white text-[8px]">C</div>
      Condition
    </div>
    <div className="text-[10px] px-1 truncate">
      {data.label}
    </div>
    <Handle type="target" position={Position.Top} id="a" />
    <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} />
    <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} />
  </div>
);

// Define node types
const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  tool: ToolNode,
  condition: ConditionNode
};

// Sample demo nodes (will be used for existing workflows)
const demoNodes: Node[] = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 250, y: 100 },
    data: { label: 'Manual message' }
  },
  {
    id: 'agent-1',
    type: 'agent',
    position: { x: 250, y: 250 },
    data: { label: 'UBIQ Contact Agent' }
  },
  {
    id: 'tool-1',
    type: 'tool',
    position: { x: 450, y: 200 },
    data: { label: 'Knowledge Table Update' }
  },
  {
    id: 'condition-1',
    type: 'condition',
    position: { x: 450, y: 320 },
    data: { label: 'Untitled condition' }
  },
  {
    id: 'agent-2',
    type: 'agent',
    position: { x: 450, y: 440 },
    data: { label: 'UBIQ Sales Companion - NEW' }
  }
];

// Sample demo edges
const demoEdges: Edge[] = [
  { id: 'e1-2', source: 'trigger-1', target: 'agent-1', animated: true },
  { id: 'e1-3', source: 'trigger-1', target: 'tool-1', animated: true, type: 'default' },
  { id: 'e3-4', source: 'tool-1', target: 'condition-1', animated: true },
  { id: 'e4-5', source: 'condition-1', target: 'agent-2', sourceHandle: 'true', animated: true },
];

// Empty nodes/edges for new workflows
const emptyNodes: Node[] = [];
const emptyEdges: Edge[] = [];

// Flow Editor Component
const FlowEditor = ({ 
  isNewWorkflow = false, 
  workflowId = null 
}: { 
  isNewWorkflow?: boolean,
  workflowId?: number | null
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  
  // Find the current workflow if one is selected
  const currentWorkflow = workflowId 
    ? sampleWorkflows.find(w => w.id === workflowId) 
    : null;
  
  // Initialize with the appropriate nodes and edges
  const [nodes, setNodes, onNodesChange] = useNodesState(
    isNewWorkflow ? emptyNodes : (currentWorkflow?.nodes || demoNodes)
  );
  
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    isNewWorkflow ? emptyEdges : (currentWorkflow?.edges || demoEdges)
  );
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Handle connections
  const onConnect = (params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  };

  // Handle node click
  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  };

  // Delete selected node
  const deleteSelectedNode = () => {
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((node) => node.id !== selectedNodeId));
      setSelectedNodeId(null);
    }
  };
  
  // Handle drop event to create new nodes
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const nodeData = event.dataTransfer.getData('application/json');
      
      // Check if the dropped element is valid
      if (!type || !reactFlowWrapper.current || !reactFlowInstance) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      let newNodeData = { label: 'New Node' };
      
      // Parse the node data if it exists
      if (nodeData) {
        try {
          newNodeData = JSON.parse(nodeData);
        } catch (e) {
          console.error('Error parsing node data:', e);
        }
      }
      
      // Create a new node
      const newNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: newNodeData,
      };
      
      setNodes((nds) => nds.concat(newNode as Node));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <div className="h-full w-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
        
        {selectedNodeId && (
          <Panel position="top-right">
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteSelectedNode}
            >
              Delete Selected Node
            </Button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};

// Sidebar Component with real agents and tools
const NodePalette = ({ agents, tools, loading }: { agents: any[], tools: any[], loading: boolean }) => {
  const onDragStart = (event: React.DragEvent, nodeType: string, nodeData: any = {}) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/json', JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = 'move';
  };

  if (loading) {
    return (
      <Card className="p-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Loading</CardTitle>
          <CardDescription>Fetching data...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Elements</CardTitle>
          <CardDescription>Drag elements to the canvas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="bg-orange-100 p-3 rounded-md border border-orange-300 cursor-grab flex items-center space-x-2"
            draggable
            onDragStart={(e) => onDragStart(e, 'trigger', { label: 'New Trigger' })}
          >
            <div className="w-6 h-6 bg-orange-300 rounded-full flex items-center justify-center text-orange-700">T</div>
            <span>Trigger</span>
          </div>
          
          <div
            className="bg-purple-100 p-3 rounded-md border border-purple-300 cursor-grab flex items-center space-x-2"
            draggable
            onDragStart={(e) => onDragStart(e, 'condition', { label: 'New Condition' })}
          >
            <div className="w-6 h-6 bg-purple-300 rounded-full flex items-center justify-center text-purple-700">C</div>
            <span>Condition</span>
          </div>
        </CardContent>
      </Card>

      {/* Agents Card */}
      <Card className="p-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Agents</CardTitle>
          <CardDescription>Drag an agent to the canvas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-60 overflow-y-auto">
          {agents.length > 0 ? (
            agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-blue-100 p-3 rounded-md border border-blue-300 cursor-grab flex items-center space-x-2"
                draggable
                onDragStart={(e) => onDragStart(e, 'agent', { label: agent.name, agentId: agent.id })}
              >
                <div className="w-6 h-6 bg-blue-300 rounded-full flex items-center justify-center text-blue-700">A</div>
                <span className="truncate">{agent.name}</span>
              </div>
            ))
          ) : (
            <div className="text-center py-2 text-gray-500">No agents found</div>
          )}
        </CardContent>
      </Card>

      {/* Tools Card */}
      <Card className="p-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Tools</CardTitle>
          <CardDescription>Drag a tool to the canvas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-60 overflow-y-auto">
          {tools.length > 0 ? (
            tools.map((tool) => (
              <div
                key={tool.id}
                className="bg-green-100 p-3 rounded-md border border-green-300 cursor-grab flex items-center space-x-2"
                draggable
                onDragStart={(e) => onDragStart(e, 'tool', { label: tool.name, toolId: tool.id })}
              >
                <div className="w-6 h-6 bg-green-300 rounded-full flex items-center justify-center text-green-700">T</div>
                <span className="truncate">{tool.name}</span>
              </div>
            ))
          ) : (
            <div className="text-center py-2 text-gray-500">No tools found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Sample data for saved workflows
interface Workflow {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string | null;
  status: 'active' | 'inactive' | 'draft';
  nodes?: Node[];
  edges?: Edge[];
}

// Generate some sample workflows with different node configurations
const sampleWorkflows: Workflow[] = [
  {
    id: 1,
    name: "Document Processing Flow",
    description: "Automatically processes uploaded documents and extracts key information",
    createdAt: "2025-05-10T14:30:00Z",
    updatedAt: "2025-05-18T09:15:00Z",
    status: 'active',
    // Sample workflow 1 - Document processing
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 100 },
        data: { label: 'New Document Upload' }
      },
      {
        id: 'tool-1',
        type: 'tool',
        position: { x: 250, y: 220 },
        data: { label: 'Document Processor' }
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 250, y: 340 },
        data: { label: 'Information Extractor' }
      }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger-1', target: 'tool-1', animated: true },
      { id: 'e2-3', source: 'tool-1', target: 'agent-1', animated: true }
    ]
  },
  {
    id: 2,
    name: "Customer Support Pipeline",
    description: "Routes and processes customer inquiries through appropriate agents",
    createdAt: "2025-05-12T11:20:00Z",
    updatedAt: null,
    status: 'active',
    // Sample workflow 2 - Customer support
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 100 },
        data: { label: 'Customer Message' }
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 250, y: 220 },
        data: { label: 'Message Type?' }
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 100, y: 340 },
        data: { label: 'Support Agent' }
      },
      {
        id: 'agent-2',
        type: 'agent',
        position: { x: 400, y: 340 },
        data: { label: 'Sales Agent' }
      }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger-1', target: 'condition-1', animated: true },
      { id: 'e2-3', source: 'condition-1', target: 'agent-1', sourceHandle: 'true', animated: true },
      { id: 'e2-4', source: 'condition-1', target: 'agent-2', sourceHandle: 'false', animated: true }
    ]
  },
  {
    id: 3,
    name: "Data Enrichment Flow",
    description: "Enhances customer data with additional information from various sources",
    createdAt: "2025-05-15T16:45:00Z",
    updatedAt: "2025-05-17T10:30:00Z",
    status: 'inactive',
    // Sample workflow 3 - Data enrichment
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 100 },
        data: { label: 'Customer Data Update' }
      },
      {
        id: 'tool-1',
        type: 'tool',
        position: { x: 120, y: 220 },
        data: { label: 'CRM Lookup' }
      },
      {
        id: 'tool-2',
        type: 'tool',
        position: { x: 380, y: 220 },
        data: { label: 'LinkedIn Enricher' }
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 250, y: 340 },
        data: { label: 'Data Consolidation Agent' }
      }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger-1', target: 'tool-1', animated: true },
      { id: 'e1-3', source: 'trigger-1', target: 'tool-2', animated: true },
      { id: 'e2-4', source: 'tool-1', target: 'agent-1', animated: true },
      { id: 'e3-4', source: 'tool-2', target: 'agent-1', animated: true }
    ]
  },
  {
    id: 4,
    name: "Sales Lead Qualification",
    description: "Analyzes and scores sales leads based on multiple criteria",
    createdAt: "2025-05-16T09:10:00Z",
    updatedAt: null,
    status: 'draft',
    // Sample workflow 4 - Demo workflow nodes from screenshot
    nodes: demoNodes,
    edges: demoEdges
  }
];

// Workflow Card Component
const WorkflowCard = ({ 
  workflow, 
  onEdit, 
  onDelete 
}: { 
  workflow: Workflow, 
  onEdit: (id: number) => void,
  onDelete: (id: number) => void 
}) => {
  const [status, setStatus] = useState(workflow.status === 'active');
  
  const handleStatusToggle = () => {
    setStatus(!status);
    // Here you would update the workflow status on the server
    // For now, we'll just update the UI state
  };
  
  return (
    <Card className="hover:shadow-lg transition-shadow duration-200 p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center mr-3">
            <div className="text-orange-500 font-medium">W</div>
          </div>
          <h3 className="font-semibold">{workflow.name}</h3>
        </div>
        <div className="flex items-center">
          <Switch
            checked={status}
            onCheckedChange={handleStatusToggle}
            className="data-[state=checked]:bg-orange-500"
          />
        </div>
      </div>
      
      <p className="text-sm text-gray-500 mb-4 line-clamp-2">{workflow.description}</p>
      
      <div className="flex-grow">
        {/* Empty space to push content to the bottom */}
      </div>
      
      <div className="flex justify-between items-center">
        <div className="text-xs text-gray-500">
          Created: {new Date(workflow.createdAt).toLocaleDateString()}
          {workflow.updatedAt && ` • Updated: ${new Date(workflow.updatedAt).toLocaleDateString()}`}
        </div>
        
        <div className="flex space-x-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => onEdit(workflow.id)}
            className="h-8 w-8"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => onDelete(workflow.id)}
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

// Main Workflow Page
const WorkflowsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'editor' | 'saved'>('saved');
  const [currentWorkflowId, setCurrentWorkflowId] = useState<number | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  // Store workflows in localStorage to persist and make available for dashboard
  const [workflows, setWorkflows] = useState<Workflow[]>(() => {
    // Force storage of sample workflows initially if none exist
    const savedWorkflows = localStorage.getItem('workflows');
    if (!savedWorkflows) {
      localStorage.setItem('workflows', JSON.stringify(sampleWorkflows));
    }
    // Use saved workflows or sample data if none found
    return savedWorkflows ? JSON.parse(savedWorkflows) : sampleWorkflows;
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<number | null>(null);
  const token = useAuth();

  // Fetch agents and tools data
  useEffect(() => {
    
    const fetchData = async () => {
      
      if (!!token) {
        setLoading(true);
        try {
          const apiUrl = config.API_URL;
          const tenantHeaders = getTenantHeaders();
          const [agentsResponse, toolsResponse] = await Promise.all([
            fetch(`${apiUrl}/md/api/v1/tenant/agents`, {
              headers: { 
                Authorization: `Bearer ${token as string}`, 
                "Content-Type": "application/json",
                ...tenantHeaders
              },
              //credentials: "include",
            }),
            fetch(`${apiUrl}/md/api/v1/tenant/tools`, {
              headers: { 
                Authorization: `Bearer ${token as string}`, 
                "Content-Type": "application/json",
                ...tenantHeaders
              },
              //credentials: "include",
            })
          ]);
          
          if (agentsResponse.ok && toolsResponse.ok) {
            
            const [agentsData, toolsData] = await Promise.all([
              agentsResponse.json(),
              toolsResponse.json()
            ]);
            
            setAgents(agentsData);
            setTools(toolsData);
          } else {
            toast({
              title: "Error",
              description: "Failed to load agents or tools",
              variant: "destructive"
            });
          }
        } catch (error) {
          console.error('Error fetching data:', error);
          toast({
            title: "Error",
            description: "An error occurred while fetching data",
            variant: "destructive"
          });
        } finally {
          setLoading(false);
        }
        
      } else {
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);
  
  // Filter workflows based on search query
  const filteredWorkflows = workflows.filter(workflow => {
    if (searchQuery && !workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !workflow.description.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Handle editing a workflow
  const handleEditWorkflow = (id: number) => {
    const workflowToEdit = workflows.find(w => w.id === id);
    if (workflowToEdit) {
      setCurrentWorkflowId(id);
      setWorkflowName(workflowToEdit.name);
      setWorkflowDescription(workflowToEdit.description);
      setActiveTab('editor');
    }
  };

  // Create a new workflow
  const createNewWorkflow = () => {
    setCurrentWorkflowId(null);
    setWorkflowName('Untitled Workflow');
    setWorkflowDescription('');
    setActiveTab('editor');
  };
  
  // Track if we're creating a new workflow (for empty canvas)
  const isNewWorkflow = currentWorkflowId === null;
  
  // Delete a workflow
  const handleDeleteWorkflow = (id: number) => {
    const updatedWorkflows = workflows.filter(workflow => workflow.id !== id);
    setWorkflows(updatedWorkflows);
    
    toast({
      title: 'Workflow deleted',
      description: 'The workflow has been deleted.',
    });
  };

  // Save the current workflow
  const saveWorkflow = () => {
    // In a real application, this would send data to the server
    // For now, we'll just update our local state
    if (currentWorkflowId) {
      // Update existing workflow
      const updatedWorkflows = workflows.map(workflow => {
        if (workflow.id === currentWorkflowId) {
          return {
            ...workflow,
            name: workflowName,
            description: workflowDescription || 'No description provided',
            updatedAt: new Date().toISOString(),
          };
        }
        return workflow;
      });
      
      setWorkflows(updatedWorkflows);
      
      // Save updated workflows to localStorage for dashboard access
      localStorage.setItem('workflows', JSON.stringify(updatedWorkflows));
      
      toast({
        title: 'Workflow updated',
        description: `${workflowName} has been updated.`,
      });
    } else {
      // Create new workflow
      const newWorkflow: Workflow = {
        id: Date.now(),
        name: workflowName,
        description: workflowDescription || 'No description provided',
        createdAt: new Date().toISOString(),
        updatedAt: null,
        status: 'draft'
      };
      
      const updatedWorkflows = [...workflows, newWorkflow];
      setWorkflows(updatedWorkflows);
      setCurrentWorkflowId(newWorkflow.id);
      
      // Save updated workflows to localStorage for dashboard access
      localStorage.setItem('workflows', JSON.stringify(updatedWorkflows));
      
      toast({
        title: 'Workflow created',
        description: `${workflowName} has been created.`,
      });
    }
    
    // Switch to saved workflows tab to show the workflow
    setActiveTab('saved');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-secondary">
      <div className="bg-white border-b py-6 px-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold">Workflows</h1>
            <p className="text-gray-500">Create and manage automated workflows</p>
          </div>
          <div className="space-x-2">
            {activeTab === 'saved' ? (
              <Button onClick={createNewWorkflow}>
                Create New Workflow
              </Button>
            ) : (
              <Button onClick={saveWorkflow}>
                {currentWorkflowId ? 'Save Changes' : 'Save Workflow'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6">
          <div className="bg-background p-1 rounded-md inline-flex mb-6">
            <Button
              variant={activeTab === 'saved' ? 'default' : 'ghost'}
              className="rounded-sm"
              onClick={() => setActiveTab('saved')}
            >
              Workflows
            </Button>
            <Button
              variant={activeTab === 'editor' ? 'default' : 'ghost'}
              className="rounded-sm"
              onClick={() => setActiveTab('editor')}
            >
              Editor
            </Button>
          </div>
        </div>
        
        {activeTab === 'editor' ? (
          <div className="flex gap-4 h-[calc(100vh-290px)]">
            <aside className="w-72 overflow-y-auto">
              <div className="mb-4">
                {isEditingName ? (
                  <Input
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                    className="text-lg font-semibold"
                    autoFocus
                  />
                ) : (
                  <h2 
                    className="text-lg font-semibold mb-1 cursor-pointer hover:text-primary" 
                    onClick={() => setIsEditingName(true)}
                    title="Click to edit workflow name"
                  >
                    {workflowName}
                  </h2>
                )}
                
                {isEditingDescription ? (
                  <Input
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    onBlur={() => setIsEditingDescription(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingDescription(false)}
                    className="text-gray-500 mt-1"
                    placeholder="Add a description..."
                    autoFocus
                  />
                ) : (
                  <p 
                    className="text-gray-500 text-sm cursor-pointer hover:text-gray-700"
                    onClick={() => setIsEditingDescription(true)}
                    title="Click to edit description"
                  >
                    {workflowDescription || "Add a description..."}
                  </p>
                )}
              </div>
              <NodePalette agents={agents} tools={tools} loading={loading} />
            </aside>
            <main className="flex-1 bg-white border rounded-md overflow-hidden">
              <ReactFlowProvider>
                <FlowEditor 
                  isNewWorkflow={isNewWorkflow} 
                  workflowId={currentWorkflowId} 
                />
              </ReactFlowProvider>
            </main>
          </div>
        ) : (
          <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <Input
                type="search"
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
            
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="h-40 animate-pulse">
                    <CardHeader className="pb-2">
                      <div className="h-5 bg-muted rounded w-2/3 mb-2"></div>
                      <div className="h-4 bg-muted rounded w-full"></div>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </CardContent>
                    <div className="flex border-t divide-x">
                      <div className="flex-1 h-10"></div>
                      <div className="flex-1 h-10"></div>
                      <div className="flex-1 h-10"></div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredWorkflows.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowCard 
                    key={workflow.id} 
                    workflow={workflow} 
                    onEdit={handleEditWorkflow}
                    onDelete={handleDeleteWorkflow}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📝</div>
                <h3 className="text-lg font-medium mb-2">No workflows found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? "No workflows match your search criteria" : "You haven't created any workflows yet"}
                </p>
                <Button onClick={() => setActiveTab('editor')}>
                  Create Your First Workflow
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowsPage;