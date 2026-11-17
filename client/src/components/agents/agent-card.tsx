import { useLocation } from "wouter";
import { Pencil, Trash, Upload, Image } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Agent } from "@shared/schema";
import { isImageTooLarge, formatFileSize, MAX_IMAGE_SIZE_BYTES } from "@shared/utils/file-validation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import BadgeList from "../ui/badge-list";
import useAuth from "@/hooks/use-auth";

interface AgentCardProps {
  agent: Agent;
}

export default function AgentCard({ agent }: AgentCardProps) {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const token = useAuth();

  // State for custom agent image
  const [agentImage, setAgentImage] = useState<string | null>(
    localStorage.getItem(`agent-image-${agent.id}`) || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const deleteAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/md/api/v1/tenant/agent/${agent.id}`, {}, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agent.id}`] });
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
  
  const toggleAgentMutation = useMutation({
    mutationFn: async () => {
      // Toggle between "active" and "inactive" status
      const response = await apiRequest("PUT", `/md/api/v1/tenant/agent/${agent.id}`, {
        isActive: !agent.isActive,
      }, token);

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agent.id}`] });
      toast({
        title: agent.isActive ? "Agent disabled" : "Agent enabled",
        description: `The agent has been ${agent.isActive ? "disabled" : "enabled"} successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to toggle agent status: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "pending":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }
  
  function formatDate(date: string | null | undefined) {
    if (!date) return "Never";
    return new Date(date).toLocaleString();
  }
  
  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      if (isImageTooLarge(file)) {
        toast({
          title: "Image Too Large",
          description: `"${file.name}" is ${formatFileSize(file.size)}. Images must be ${formatFileSize(MAX_IMAGE_SIZE_BYTES)} or smaller.`,
          variant: "destructive",
        });
        e.target.value = '';
        return;
      }

      const reader = new FileReader();

      reader.onload = (event) => {
        const imageDataUrl = event.target?.result as string;
        setAgentImage(imageDataUrl);
        // Save to localStorage for persistence
        localStorage.setItem(`agent-image-${agent.id}`, imageDataUrl);
        
        toast({
          title: "Image uploaded",
          description: "The agent image has been updated.",
        });
      };
      
      reader.readAsDataURL(file);
    }
  };
  
  // Trigger file input click
  const triggerFileUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };
  
  return (
    <Card 
      className="hover:shadow-lg transition-shadow duration-200 p-6" 
      onClick={() => navigate(`/agents/view/${agent.id}`)}
    >
      {/* Hidden file input for image upload */}
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept="image/*" 
        aria-label={`Upload image for ${agent.name}`}
        onChange={handleImageUpload}
        onClick={(e) => e.stopPropagation()}
      />
      
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="w-10 h-10 rounded-lg bg-white flex items-center justify-center mr-3 cursor-pointer relative group overflow-hidden"
                  onClick={triggerFileUpload}
                >
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
                  
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Upload className="h-4 w-4 text-white" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Click to upload a custom image</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <h3 className="font-semibold">{agent.name}</h3>
        </div>
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <Switch 
            checked={agent.isActive} 
            onCheckedChange={() => toggleAgentMutation.mutate()}
            disabled={toggleAgentMutation.isPending}
            aria-label={`Toggle ${agent.name} active`}
          />
        </div>
      </div>
      
      <p className="text-sm text-gray-500 mb-4 line-clamp-2">{agent.description}</p>
      
      <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
        <div>Created: {formatDate(agent.createdOn)}</div>
        <div>
          <Badge variant={agent.isShared ? "default" : "secondary"} className={agent.isShared ? "bg-yellow-100 text-yellow-800" : ""}>
            {agent.isShared ? "Shared" : "Unshared"}
          </Badge>
          <Badge variant={agent.isPublished ? "default" : "secondary"} className={agent.isPublished ? "bg-green-100 text-green-800" : ""}>
            {agent.isPublished ? "Published" : "Unpublished"}
          </Badge>
        </div>
        
      </div>
      <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
          <div>Updated: {formatDate(agent.lastUpdatedOn)}</div>
          <div>Published: {formatDate(agent.lastPublishedOn)}</div>
        </div>
      {(agent.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.tags!.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border bg-white"
              style={tag.color ? { borderColor: tag.color } : { borderColor: "#e5e7eb" }}
            >
              {tag.color && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              )}
              {tag.name}
            </span>
          ))}
          {agent.tags!.length > 3 && (
            <span className="text-xs text-muted-foreground self-center">+{agent.tags!.length - 3}</span>
          )}
        </div>
      )}
      <div className="flex justify-between items-center">
        <BadgeList
          items={[
            { label: agent.model ?? "Unknown Model", color: "blue" },
            ...(agent.provider ? [{ label: agent.provider, color: "purple" }] : []),
            ...(agent.enableSTM ? [{ label: "STM", color: "green" }] : []),
            ...(agent.enableLTM ? [{ label: "LTM", color: "yellow" }] : []),
            ...(agent.enableSpinUpAgents ? [{ label: "Spin Up Agents", color: "indigo" }] : [])
          ]}
        />
        
        <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
          <Button 
            size="icon" 
            variant="ghost"
            aria-label={`Edit ${agent.name}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/agents/${agent.id}/edit`);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost"
                aria-label={`Delete ${agent.name}`}
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
                  onClick={() => deleteAgentMutation.mutate()}
                  disabled={deleteAgentMutation.isPending}
                >
                  {deleteAgentMutation.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}
