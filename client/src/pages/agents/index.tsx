import { useContext } from 'react';
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, List, Grid } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Agent } from "@shared/schema";
import AgentCard from "@/components/agents/agent-card";
import FilterButton from "@/components/ui/filter-button";
import useAuth from "@/hooks/use-auth";
import { DataContext } from '@shared/models/chat-models';

enum FilterStatus {
  IsActive = 1,
}

enum ViewMode {
  Grid = "grid",
  List = "list",
}

export default function AgentsPage() {
  const [_, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(FilterStatus.IsActive);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Grid);
  const [searchQuery, setSearchQuery] = useState("");
  const token = useAuth();
  const context = useContext(DataContext);
  
  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/md/api/v1/tenant/agents", token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid
  });

  const filteredAgents = agents?.filter((agent) => {
    if (filterStatus !== FilterStatus.IsActive && agent.isActive !== filterStatus) {
      return false;
    }
    
    if (searchQuery && !agent.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Agents</h1>
        <Button onClick={() => navigate("/agents/create")}>
          <Plus className="mr-2 h-4 w-4" /> Create Agent
        </Button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <Input
          type="search"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">View:</span>
          <Button 
            size="icon" 
            variant={viewMode === ViewMode.List ? "default" : "outline"}
            aria-label="List view"
            aria-pressed={viewMode === ViewMode.List}
            onClick={() => setViewMode(ViewMode.List)}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant={viewMode === ViewMode.Grid ? "default" : "outline"}
            aria-label="Grid view"
            aria-pressed={viewMode === ViewMode.Grid}
            onClick={() => setViewMode(ViewMode.Grid)}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Agent Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-card animate-pulse rounded-lg"></div>
          ))}
        </div>
      ) : filteredAgents && filteredAgents.length > 0 ? (
        <div className={`grid grid-cols-1 ${viewMode === ViewMode.Grid ? 'md:grid-cols-2 lg:grid-cols-3' : ''} gap-6`}>
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No agents found</h3>
          <p className="text-gray-500 mt-2">Create your first agent to get started</p>
          <Button 
            className="mt-4" 
            onClick={() => navigate("/agents/create")}
          >
            <Plus className="mr-2 h-4 w-4" /> Create Agent
          </Button>
        </div>
      )}
    </div>
  );
}