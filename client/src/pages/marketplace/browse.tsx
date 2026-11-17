import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, Filter, ArrowLeft, Star, Download, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import useAuth from "@/hooks/use-auth";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";
import { config } from '@/lib/config';
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
import { toast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { debug } from "console";

type MarketplaceItem = { 
  id: any; 
  name: string; 
  description: string;
  type: "Agent" | "Tool";
  category: string; 
  price: string | null; 
  stars: number;
  userClickStar: boolean;
  userClickInstall: boolean;
  downloads: number; 
  vendor: string; 
};

export default function BrowseMarketplace() {
  const [_, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [marketplaceItems, setMarketplaceItems] = useState([] as MarketplaceItem[]);
  const [loading, setLoading] = useState(false);
  const [installingItems, setInstallingItems] = useState<Set<string>>(new Set());
  // Add state for warning dialog
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [selectedItemForWarning, setSelectedItemForWarning] = useState<MarketplaceItem | null>(null);

  const token = useAuth();
  const { isSuperPowerUser } = useSuperPowerUser();
  const apiUrl= config.API_URL;
  
  const fetchMarketplaceItems = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const response = await fetch(`${apiUrl}/md/api/v1/marketplace/items`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          let datawrapper = await response.json();
          const apiItems = datawrapper.data as MarketplaceItem[];
          // Merge API items with mock items, avoiding duplicates by ID
          const mergedItems: MarketplaceItem[] = [];
          apiItems.forEach((apiItem: MarketplaceItem) => {
            if (!mergedItems.find(item => item.id === apiItem.id)) {
              mergedItems.push(apiItem);
            }
          });
          setMarketplaceItems(mergedItems);
        } else {
          console.error('Failed to fetch marketplace items');
          // Keep using mock data if API fails
        }
      } catch (error) {
        console.error('Error fetching marketplace items:', error);
        // Keep using mock data if API fails
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchMarketplaceItems();
  }, [token, apiUrl]);

  const agentStarMutation = useMutation({
    mutationFn: async ({ agentId, rating }: { agentId: number, rating: number }) => {
      const response = await apiRequest("POST", `/md/api/v1/marketplace/agent/${agentId}/rate`, { rating }, token);
      return response.json();
    },
    onSuccess: () => {
      fetchMarketplaceItems(); // Refresh the marketplace items to show updated rating
      toast({
        title: "Rating updated",
        description: "Thank you for rating this item!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update rating: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const toolStarMutation = useMutation({
    mutationFn: async ({ toolId, rating }: { toolId: number, rating: number }) => {
      const response = await apiRequest("POST", `/md/api/v1/marketplace/tool/${toolId}/rate`, { rating }, token);
      return response.json();
    },
    onSuccess: () => {
      fetchMarketplaceItems(); // Refresh the marketplace items to show updated rating
      toast({
        title: "Rating updated",
        description: "Thank you for rating this item!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update rating: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleStarClick = (item: MarketplaceItem, starRating: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // Prevent clicking if any mutation is pending
    if (agentStarMutation.isPending || toolStarMutation.isPending) {
      return;
    }

    if (item.type === "Agent") {
      const agentId = item.id.replace("AIAgent_", "");
      agentStarMutation.mutate({ agentId, rating: starRating });
    } else if (item.type === "Tool") {
      const toolId = item.id.replace("Tool_", "");
      toolStarMutation.mutate({ toolId, rating: starRating });
    }
  };

  const renderStars = (item: MarketplaceItem) => {
    const stars = [];
    const currentStars = Math.round(item.stars); // Round to nearest integer for display
    
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`h-4 w-4 cursor-pointer transition-all hover:scale-110 ${
            agentStarMutation.isPending || toolStarMutation.isPending
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:scale-110'
          } ${
            i <= currentStars
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-yellow-400 fill-transparent stroke-yellow-400'
          }`}
          aria-label={`Rate ${item.name} ${i} out of 5 stars`}
          onClick={(e) => handleStarClick(item, i, e)}
        />
      );
    }
    
    return stars;
  };

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const response = await apiRequest("DELETE", `/md/api/v1/marketplace/agent/${agentId}`, {}, token);
      return response.json();
    },
    onSuccess: (_data, agentId) => {
      // This mutation deletes the MarketplaceAgent catalog entry itself
      // (DELETE /md/api/v1/marketplace/agent/{id}), not a TenantAgent - the
      // Manage Marketplace Agents admin page reads the marketplace list via
      // React Query, so it needs its own key invalidated too, not just the
      // tenant-scoped keys below (kept in case a caller also has a tenant
      // copy of this agent installed).
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/marketplace/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}`] });
      fetchMarketplaceItems();
      toast({
        title: "Agent deleted",
        description: "The agent has been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete agent: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteToolMutation = useMutation({
    mutationFn: async (toolId: number) => {
      const response = await apiRequest("DELETE", `/md/api/v1/marketplace/tool/${toolId}`, {}, token);
      return response.json();
    },
    onSuccess: (_data, toolId) => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/tools"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/tool/${toolId}`] });
      fetchMarketplaceItems();
      toast({
        title: "Tool deleted",
        description: "The tool has been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete tool: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const installAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const response = await apiRequest("POST", `/md/api/v1/marketplace/agents/${agentId}/install`, {}, token);
      return response.json();
    },
    onSuccess: (_, agentId) => {
      setInstallingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(`AIAgent_${agentId}`);
        return newSet;
      });
      fetchMarketplaceItems();
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/tools"] });
      toast({
        title: "Agent installed",
        description: "The agent has been successfully installed.",
      });
    },
    onError: (error, agentId) => {
      setInstallingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(`AIAgent_${agentId}`);
        return newSet;
      });
      toast({
        title: "Error",
        description: `Failed to install agent: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const installToolMutation = useMutation({
    mutationFn: async (toolId: number) => {
      const response = await apiRequest("POST", `/md/api/v1/marketplace/tools/${toolId}/install`, {}, token);
      return response.json();
    },
    onSuccess: (_, toolId) => {
      setInstallingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(`Tool_${toolId}`);
        return newSet;
      });
      fetchMarketplaceItems();
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/tools"] });
      toast({
        title: "Tool installed",
        description: "The tool has been successfully installed.",
      });
    },
    onError: (error, toolId) => {
      setInstallingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(`Tool_${toolId}`);
        return newSet;
      });
      toast({
        title: "Error",
        description: `Failed to install tool: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Modify the handleInstallClick function
  const handleInstallClick = (item: MarketplaceItem, e: React.MouseEvent) => {
    e.stopPropagation();

    // Prevent clicking if this specific item is already being installed
    if (installingItems.has(item.id)) {
      return;
    }

    // Show warning if userClickInstall is true
    if (item.userClickInstall) {
      setSelectedItemForWarning(item);
      setShowWarningDialog(true);
      return;
    }

    // Proceed with installation if no warning needed
    proceedWithInstallation(item);
  };

  // Add new function to handle the actual installation
  const proceedWithInstallation = (item: MarketplaceItem) => {
    // Add item to installing set
    setInstallingItems(prev => new Set(prev).add(item.id));

    if (item.type === "Agent") {
      const agentId = item.id.replace("AIAgent_", "");
      installAgentMutation.mutate(agentId);
    } else if (item.type === "Tool") {
      const toolId = item.id.replace("Tool_", "");
      installToolMutation.mutate(toolId);
    }
  };

  
  const categories = ["All", "AI Agents", "Tools"];

  const filteredItems = marketplaceItems.filter((item: MarketplaceItem) => {
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedCategory !== "All" && item.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Search className="mr-3 h-6 w-6 text-blue-500" />
          <h1 className="text-2xl font-semibold">Browse Marketplace</h1>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <Input
          type="search"
          placeholder="Search marketplace items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              onClick={() => setSelectedCategory(category)}
              size="sm"
            >
              {category}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <Card key={item.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                  <p className="text-sm text-gray-500">by {item.vendor}</p>
                </div>
                <Badge variant="secondary">{item.category}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">{item.description}</CardDescription>
              
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-1">
                  <div className="flex items-center space-x-0.5">
                    {renderStars(item)}
                  </div>
                </div>
                <div className="flex items-center space-x-1 text-gray-500">
                  <Download className="h-4 w-4" />
                  <span className="text-sm">{item.downloads.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-1">
{isSuperPowerUser && (
                    <Button
                      size="sm"
                      onClick={(e) => handleInstallClick(item, e)}
                      disabled={installingItems.has(item.id)}
                    >
                      {installingItems.has(item.id)
                        ? "Installing..."
                        : (item.userClickInstall ? "Re-install" : "Install")}
                    </Button>
                  )}
                </div>

                {isSuperPowerUser && item.type === "Agent" && (
                  <div className="flex items-center space-x-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          aria-label={`Delete ${item.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the agent
                            and all associated data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteAgentMutation.mutate(item.id.replace("AIAgent_", ""))}
                            disabled={deleteAgentMutation.isPending}
                          >
                            {deleteAgentMutation.isPending ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                {isSuperPowerUser && item.type === "Tool" && (
                  <div className="flex items-center space-x-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          aria-label={`Delete ${item.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the tool
                            and all associated data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteToolMutation.mutate(item.id.replace("Tool_", ""))}
                            disabled={deleteToolMutation.isPending}
                          >
                            {deleteToolMutation.isPending ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                  
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
          <p className="text-gray-500">Try adjusting your search or filter criteria</p>
        </div>
      )}

      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Installation Warning</AlertDialogTitle>
            <AlertDialogDescription>
              You have already clicked to install this item before. Are you sure you want to proceed with the installation?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowWarningDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (selectedItemForWarning) {
                  proceedWithInstallation(selectedItemForWarning);
                }
                setShowWarningDialog(false);
                setSelectedItemForWarning(null);
              }}
            >
              Proceed with Installation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}