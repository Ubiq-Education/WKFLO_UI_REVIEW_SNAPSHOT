import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useContext } from "react";
import { 
  ArrowUpRight, 
  Users, 
FileText, 
  Wrench, 
  Clock, 
  PlusCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent, Tool } from "@shared/schema";
import useAuth from "@/hooks/use-auth";
import { DataContext } from '@shared/models/chat-models';

export default function Dashboard() {
  const [_, navigate] = useLocation();
  const token = useAuth();
  const context = useContext(DataContext);

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["/md/api/v1/tenant/agents", token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });
  
  const { data: tools, isLoading: toolsLoading } = useQuery<Tool[]>({
    queryKey: ["/md/api/v1/tenant/tools", token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid
  });
  
  // Fetch documents from knowledge API
  const { data: documents = [], isLoading: documentsLoading } = useQuery<string[]>({
    queryKey: ["/md/api/v1/tenant/knowledge", token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid
  });
  
const stats = [
    {
      title: "Agents",
      value: agents?.length || 0,
      description: "Total AI assistants",
      icon: <Users className="h-5 w-5" />,
      color: "bg-blue-50 text-blue-600",
      onClick: () => navigate("/agents")
    },
    {
      title: "Tools",
      value: tools?.length || 0,
      description: "Available integrations",
      icon: <Wrench className="h-5 w-5" />,
      color: "bg-purple-50 text-purple-600",
      onClick: () => navigate("/tools")
    },
{
      title: "Documents",
      value: documents.length,
      description: "Knowledge base items",
      icon: <FileText className="h-5 w-5" />,
      color: "bg-green-50 text-green-600",
      onClick: () => navigate("/knowledge")
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow" onClick={stat.onClick}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">{stat.title}</CardTitle>
              <div className={`p-2 rounded-full ${stat.color}`}>
                {stat.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <p className="text-sm text-muted-foreground">{stat.description}</p>
            </CardContent>
            <CardFooter className="pt-0">
              <Button variant="ghost" className="text-sm p-0 h-auto">
                View all <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/agents/create")}>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-medium">Create Agent</h3>
              <p className="text-sm text-muted-foreground">Build a new AI assistant</p>
            </div>
            <PlusCircle className="h-8 w-8 text-blue-500" />
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/tools/create")}>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-medium">Add Tool</h3>
              <p className="text-sm text-muted-foreground">Create new integration</p>
            </div>
            <PlusCircle className="h-8 w-8 text-purple-500" />
          </CardContent>
        </Card>
        
<Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/knowledge")}>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-medium">Upload Document</h3>
              <p className="text-sm text-muted-foreground">Add to knowledge base</p>
            </div>
            <PlusCircle className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity - will be implemented when we have activity tracking */}
      <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8 text-center text-muted-foreground">
            <div>
              <Clock className="h-12 w-12 mb-3 mx-auto opacity-50" />
              <h3 className="font-medium mb-1">No recent activity</h3>
              <p className="text-sm max-w-md mx-auto">
                Recent activities will appear here as you work with agents, tools, and workflows
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
