import { useContext } from 'react';
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, List, Grid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import type { Tool } from "@shared/schema";
import ToolCard from "@/components/tools/tool-card";
import useAuth from "@/hooks/use-auth";
import { DataContext } from '@shared/models/chat-models';

enum ViewMode {
  Grid = "grid",
  List = "list",
}

export default function ToolsIndex() {
  const [_, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Grid);
  const token = useAuth();
  const context = useContext(DataContext);
  
  const { data: tools, isLoading } = useQuery<Tool[]>({
   queryKey: ["/md/api/v1/tenant/tools", token, context.selectedTenantGuid],
   enabled: !!token && !!context.selectedTenantGuid
  });

  const filteredTools = tools?.filter((tool) => {
    if (searchQuery && !tool.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Tools</h1>
        <Button onClick={() => navigate("/tools/create")}>
          <Plus className="mr-2 h-4 w-4" /> Create Tool
        </Button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <Input
          type="search"
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">View:</span>
          <Button 
            size="icon" 
            variant={viewMode === ViewMode.List ? "default" : "outline"}
            onClick={() => setViewMode(ViewMode.List)}
            aria-label="List view"
            aria-pressed={viewMode === ViewMode.List}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant={viewMode === ViewMode.Grid ? "default" : "outline"}
            onClick={() => setViewMode(ViewMode.Grid)}
            aria-label="Grid view"
            aria-pressed={viewMode === ViewMode.Grid}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-card animate-pulse rounded-lg"></div>
          ))}
        </div>
      ) : filteredTools && filteredTools.length > 0 ? (
        <div className={`grid grid-cols-1 ${viewMode === ViewMode.Grid ? 'md:grid-cols-2 lg:grid-cols-3' : ''} gap-6`}>
          {filteredTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} listView={viewMode === ViewMode.List} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No tools found</h3>
          <p className="text-gray-500 mt-2">Create your first tool to get started</p>
          <Button 
            className="mt-4" 
            onClick={() => navigate("/tools/create")}
          >
            <Plus className="mr-2 h-4 w-4" /> Create Tool
          </Button>
        </div>
      )}
    </div>
  );
}
