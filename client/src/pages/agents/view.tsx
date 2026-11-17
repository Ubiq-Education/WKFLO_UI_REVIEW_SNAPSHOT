import { useContext, useRef } from 'react';
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Pencil, Play, ArrowLeft, Trash, Wrench, Share2, Upload, Eraser } from "lucide-react";
import type { Agent, Tool } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import AgentChat, { AgentChatRef } from "@/components/agents/agent-chat";
import ToolIntegration from "@/components/agents/tool-integration";
import SpinUpAgentIntegration from "@/components/agents/spin-up-agent-integration";
import AgentChatList from "@/components/agents/agent-chat-list";
import AgentClassifications from "@/components/agents/agent-classifications";
import useAuth from "@/hooks/use-auth";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";
import { generateGuid } from "@shared/utils/session-manager";
import { DataContext } from '@shared/models/chat-models';
import { config } from '@/lib/config';


// Helper function to extract tools from the system prompt
function extractToolsFromPrompt(prompt: string): Array<{id: string, name: string}> {
  const tools: Array<{id: string, name: string}> = [];
  const regex = /\{\{tool:(\d+):([^}]+)\}\}/g;
  let match;
  
  while ((match = regex.exec(prompt)) !== null) {
    tools.push({
      id: match[1],
      name: match[2]
    });
  }
  
  return tools;
}

export default function ViewAgent() {
  const [match, params] = useRoute("/agents/view/:id");
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const token = useAuth();
  const { isSuperPowerUser } = useSuperPowerUser();
  const context = useContext(DataContext);
  const agentChatRef = useRef<AgentChatRef>(null);

  const apiUrl = config.API_URL;
  const agentId = match ? params.id : null;

  // State for custom agent image
  const [agentImage, setAgentImage] = useState<string | null>(
    localStorage.getItem(`agent-image-${agentId}`) || null
  );

  const [selectedSession, setSelectedSession] = useState<{sessionId: string, chatName: string | null}>({sessionId: generateGuid(), chatName: null});
  const [toolsUpdated, setToolsUpdated] = useState(0); // Counter to track tool changes

  
  useEffect(() => {
    if (!selectedSession.sessionId) {
      setSelectedSession({sessionId: generateGuid(), chatName: null});
    }
  }, [selectedSession.sessionId]);
  
  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
  });

  const { data: agentTools = [] } = useQuery<Tool[]>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}/tools`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
  });

  const classificationTool = agentTools.find(t => t.type === 'Chat_Classification') ?? null;
  
  const deleteAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/md/api/v1/tenant/agent/${agentId}`, {}, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}`] });
      toast({
        title: "Agent deleted",
        description: "The agent has been successfully deleted.",
      });
      navigate("/");
    },
    onError: (error) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to delete agent");
      
      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  const shareAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/md/api/v1/tenant/agent/${agentId}/share`, {}, token);
      return response.json();
    },
    onSuccess: (data) => {
      // Sharing clones this TenantAgent into a NEW MarketplaceAgent row - the
      // Manage Marketplace Agents admin page reads that list separately via
      // React Query, so it needs its own key invalidated too.
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/marketplace/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}`] });
      toast({
        title: "Agent shared",
        description: "Agent has been shared successfully.",
      });
    },
    onError: (error, variables, context) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to share agent");
      
      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  const publishAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/md/api/v1/tenant/agent/${agentId}/publish`, {}, token);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}`] });
      toast({
        title: "Agent published",
        description: "The agent has been successfully published to the marketplace.",
      });
    },
    onError: (error) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to publish agent");
      
      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  const toggleAgentMutation = useMutation({
    mutationFn: async () => {
      // Toggle between "active" and "inactive" status
      const response = await apiRequest("PUT", `/md/api/v1/tenant/agent/${agentId}`, {
        isActive: !agent?.isActive,
      }, token);

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}`] });
      toast({
        title: agent?.isActive ? "Agent disabled" : "Agent enabled",
        description: `The agent has been ${agent?.isActive ? "disabled" : "enabled"} successfully.`,
      });
    },
    onError: (error) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to toggle agent status");
      
      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  const wipeSTMMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/md/api/v1/tenant/agent/${agentId}/memory/short-term`, {}, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}/chats`] });
      // Clear messages in the current chat UI
      agentChatRef.current?.clearMessages();
      toast({
        title: "Short term memory wiped",
        description: "All short term memory for this agent has been deleted.",
      });
    },
    onError: (error) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to wipe short term memory");
      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  const wipeLTMMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/md/api/v1/tenant/agent/${agentId}/memory/long-term`, {}, token);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Long term memory wiped",
        description: "All long term memory for this agent has been deleted.",
      });
    },
    onError: (error) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to wipe long term memory");
      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  const [toolCallHistory, setToolCallHistory] = useState<Array<{
    name: string;
    status: 'success' | 'failed';
    statusCode?: number;
    timestamp: string;
  }>>([]);

  const runAgentMutation = useMutation({
    mutationFn: async ({ input, sessionId }: { input: string; sessionId: string | null }) => {
      // Clear tool call history for new run
      setToolCallHistory([]);
      const response = await apiRequest("POST", `/ai/api/v1/tenant/agent/${agentId}/run`, { input, sessionId }, token);
      let datawrapper = await response.json();
      return (datawrapper)?.data;
    },
    onSuccess: (data) => {
      setIsRunning(false);
      toast({
        title: "Agent executed successfully",
        description: "The agent has completed its execution.",
      });
    },
    onError: (error) => {
      setIsRunning(false);
      setTestResponse(`Error: ${error.message}`);
      
      const errorDetails = parseErrorMessage(error.message, "Failed to run agent");
      
      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  function runAgentTest() {
    setIsRunning(true);
    setTestResponse("");
    runAgentMutation.mutate({ input: "Test Input", sessionId: "your-session-id" });
  }
  
  function getFlagColor(status: boolean) {
    switch (status) {
      case true: return "bg-green-100 text-green-800";
      case false: return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  }
  
  function formatDate(date: string | null | undefined) {
    if (!date) return "Never";
    if (typeof date === 'string') {
      return new Date(date).toLocaleString();
    }
    return "Invalid date";
  }
  
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center space-x-2">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-8 w-64" />
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }
  
  if (!agent) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Agent not found</h1>
          <p className="mb-4">The agent you're looking for doesn't exist.</p>
          <Button onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }
  
  return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center mb-6 gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate("/agents")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center mr-3 cursor-pointer relative group overflow-hidden">
              {agentImage ? (
                <img 
                  src={agentImage} 
                  alt={agent.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
            </div>
            
            <h1 className="text-2xl font-semibold">{agent.name}</h1>
            <div className="ml-auto space-x-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the agent
                      and all associated data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteAgentMutation.mutate()}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {isSuperPowerUser && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={shareAgentMutation.isPending}
                  >
                    <Share2 className="mr-2 h-4 w-4" /> 
                    {shareAgentMutation.isPending ? "Sharing..." : "Share to Marketplace"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Share Agent to Marketplace</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to share this agent to the marketplace? 
                      This will make the agent publicly available to all users.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => shareAgentMutation.mutate()}>
                      Share
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={publishAgentMutation.isPending}
                  >
                    <Upload className="mr-2 h-4 w-4" /> 
                    {publishAgentMutation.isPending ? "Publishing..." : "Publish"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Publish Agent</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to publish this agent? This will make the agent 
                      accessible from public workflows and chats in your organization.
                      Also it will be ready to be shared in the marketplace.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => publishAgentMutation.mutate()}>
                      Publish
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              
              <Button variant="outline" size="sm" onClick={() => navigate(`/agents/${agentId}/edit`)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
              
              <Button size="sm" onClick={() => runAgentTest()} disabled={isRunning}>
                <Play className="mr-2 h-4 w-4" /> {isRunning ? "Running..." : "Run Agent"}
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500 flex items-center justify-between">
                  Status
                  <Switch 
                    checked={agent.isActive} 
                    onCheckedChange={() => toggleAgentMutation.mutate()}
                    disabled={toggleAgentMutation.isPending}
                    className="scale-75"
                    aria-label="Agent status"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  {agent.isActive ? 'Active' : 'Inactive'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500 flex items-center justify-between">
                  Short Term Memory
                  {agent.enableSTM && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-white" disabled={wipeSTMMutation.isPending}>
                          <Eraser className="h-3 w-3 mr-1" />
                          {wipeSTMMutation.isPending ? "Wiping..." : "Wipe"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Wipe Short Term Memory?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete all short term memory (chat history) for this agent across all users. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => wipeSTMMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Wipe Memory
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getFlagColor(agent.enableSTM)}`}>
                  {agent.enableSTM ? 'Enabled' : 'Disabled'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500 flex items-center justify-between">
                  Long Term Memory
                  {agent.enableLTM && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-white" disabled={wipeLTMMutation.isPending}>
                          <Eraser className="h-3 w-3 mr-1" />
                          {wipeLTMMutation.isPending ? "Wiping..." : "Wipe"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Wipe Long Term Memory?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete all long term memory (vector embeddings) for this agent across all users. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => wipeLTMMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Wipe Memory
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getFlagColor(agent.enableLTM)}`}>
                  {agent.enableLTM ? 'Enabled' : 'Disabled'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500 flex items-center justify-between">
                  Spin Up Agents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getFlagColor(agent.enableSpinUpAgents)}`}>
                  {agent.enableSpinUpAgents ? 'Enabled' : 'Disabled'}
                </div>
              </CardContent>
            </Card>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500">Created</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">{formatDate(agent.createdOn?.toString())}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500">Updated</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">{formatDate(agent.lastUpdatedOn?.toString())}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500">Last Run</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">{formatDate(agent.lastRunAt?.toString())}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-gray-500">Publish</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">{formatDate(agent.lastPublishedOn?.toString())}</div>
              </CardContent>
            </Card>
          </div>
          
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              {/* <TabsTrigger value="runs">Run History</TabsTrigger> */}
              <TabsTrigger value="test">Test Agent</TabsTrigger>
              <TabsTrigger value="share">Share</TabsTrigger>
              {classificationTool && (
                <TabsTrigger value="classifications">Classifications</TabsTrigger>
              )}
              {agent.enableSpinUpAgents && (
                <TabsTrigger value="spin-up-agents">Spin-Up Agents</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="details" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Agent Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-1">Description</h3>
                    <p className="text-sm text-gray-600">{agent.description}</p>
                  </div>
                  
                  {agent.model && (
                    <div>
                      <h3 className="font-medium mb-1">AI Model</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{agent.model}</Badge>
                        {agent.provider && (
                          <Badge variant="secondary">{agent.provider}</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {agent.type && (
                    <div>
                      <h3 className="font-medium mb-1">Type</h3>
                      <Badge variant="outline">{agent.type}</Badge>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div>
                    <h3 className="font-medium mb-1">System Prompt</h3>
                    <div className="bg-gray-50 border border-border rounded-lg p-3 text-sm font-mono whitespace-pre-wrap">
                      {agent.systemPrompt}
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Tools</CardTitle>
                </CardHeader>
                <CardContent>
                  {agent.systemPrompt && agent.systemPrompt.includes("{{tool:") ? (
                    <div className="space-y-2">
                      {extractToolsFromPrompt(agent.systemPrompt).map((tool, index) => (
                        <div key={index} className="flex items-center px-3 py-2 rounded-md border border-border">
                          <div className="w-8 h-8 rounded-md bg-opacity-10 flex items-center justify-center mr-3">
                            <Wrench className="h-10 w-10 text-accent" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{tool.name}</div>
                            <div className="text-xs text-gray-500">ID: {tool.id}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No tools attached to this agent.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="tools" className="mt-6">
              {agent && (
                <ToolIntegration
                  agentId={agent.id}
                  onToolsUpdated={() => setToolsUpdated(prev => prev + 1)}
                />
              )}
            </TabsContent>

            {agent.enableSpinUpAgents && (
              <TabsContent value="spin-up-agents" className="mt-6">
                <SpinUpAgentIntegration agentId={agent.id} />
              </TabsContent>
            )}

            {/* <TabsContent value="runs" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Run History</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500">No run history available for this agent.</p>
                </CardContent>
              </Card>
            </TabsContent> */}
            
            <TabsContent value="test" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <div className="flex items-center">
                      <span>Chat with Agent</span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex flex-row gap-4">
                  {/* Chat List */}
                  {agent && agent.enableSTM && (
                    <div className="w-64 border-r pl-4 pr-4 py-4 overflow-y-auto max-h-[500px]">
                      <AgentChatList
                        agentId={agent.id}
                        selectedSession={selectedSession}
                        onSelectSession={(session) => {
                          // Invalidate messages query before setting selected session
                          if (session.sessionId) {
                            queryClient.invalidateQueries({ queryKey: [`/ai/api/v1/tenant/agent/${agentId}/chat/${session.sessionId}/messages`] });
                          }
                          setSelectedSession(session);
                        }}
                      />
                    </div>
                  )}
                  {/* Chat Window */}
                  <div className="flex-1 h-auto flex flex-col">
                    {agent && selectedSession && (
                      <AgentChat
                        ref={agentChatRef}
                        key={`agent-chat-${toolsUpdated}`} // Force remount when tools change
                        agent={agent}
                        session={selectedSession}
                        apiEndpoint={`${apiUrl}`}
                        security={{ type: 'azure-ad', azureAd: {
                          clientId: config.ENTRA_CLIENT_ID || "your-client-id",
                          tenantId: config.ENTRA_TENANT_ID || "your-azure-tenant-id",
                          scopes: ['openid', 'profile', config.ENTRA_SCOPE || "api-scope"]
                        } }}
                      />
                    )}
                    {!selectedSession && (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        Select a chat session to start chatting.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="share" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Share Agent</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Make your agent available for external use through embed options.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
                          onClick={() => navigate(`/agents/${agentId}/share/chat-ui`)}>
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-medium">Chat UI</h3>
                            <p className="text-xs text-gray-500">Embed as iframe with full chat interface</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
                          onClick={() => navigate(`/agents/${agentId}/share/chat-widget`)}>
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-medium">Chat Widget</h3>
                            <p className="text-xs text-gray-500">JavaScript widget for any website</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {classificationTool && (
              <TabsContent value="classifications" className="mt-6">
                <AgentClassifications agentId={agent.id} classificationTool={classificationTool} />
              </TabsContent>
            )}

          </Tabs>
        </div>
      </div>
  );
}
