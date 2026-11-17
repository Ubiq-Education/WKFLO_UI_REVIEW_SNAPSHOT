import { useLocation } from "wouter";
import { Pencil, Trash, Power, Wrench, KeyRound, Share2, Upload, MessageSquareText, Tags, ClipboardList } from "lucide-react";
import type { Tool } from "@shared/schema";
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
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { invalidateToolQueries } from "@/lib/tool-query-invalidation";
import { useToast } from "@/hooks/use-toast";
import useAuth from "@/hooks/use-auth";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";
import { parseErrorMessage } from "@/lib/utils";
import { DeleteToolDialog, PublishToolDialog } from "./tool-actions";
import ToolPublishBadge from "./tool-publish-badge";

interface ToolCardProps {
  tool: Tool;
  listView?: boolean;
}

export default function ToolCard({ tool, listView = false }: ToolCardProps) {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const token = useAuth();
  const { isSuperPowerUser } = useSuperPowerUser();

  
  const renderShareDialog = () => !isSuperPowerUser ? null : (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="ghost"
          disabled={shareToolMutation.isPending}
          onClick={(e) => e.stopPropagation()}
          title="Share Tool to Marketplace"
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Share Tool to Marketplace</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to share this tool to the marketplace? 
            This will make the tool publicly available to all users.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => shareToolMutation.mutate()}
            disabled={shareToolMutation.isPending}>
            {shareToolMutation.isPending ? "Sharing..." : "Share"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const renderPublishDialog = () => (
    <PublishToolDialog
      toolId={tool.id}
      renderTrigger={(isPending) => (
        <Button 
          variant="ghost"
          disabled={isPending}
          onClick={(e) => e.stopPropagation()}
          title="Publish Tool"
        >
          <Upload className="h-4 w-4" />
        </Button>
      )}
    />
  );
  
  const renderEditButton = () => (
    <Button 
      size="icon" 
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/tools/${tool.id}/edit`);
      }}
      title="Edit Tool"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
  
  const renderDeleteDialog = () => (
    <DeleteToolDialog
      toolId={tool.id}
      renderTrigger={() => (
        <Button 
          size="icon" 
          variant="ghost"
          onClick={(e) => e.stopPropagation()}
          title="Delete Tool"
        >
          <Trash className="h-4 w-4" />
        </Button>
      )}
    />
  );

  const toggleToolMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", `/md/api/v1/tenant/tool/${tool.id}`, {
        isActive: !tool.isActive,
      }, token);
      return response.json();
    },
    onSuccess: () => {
      invalidateToolQueries(queryClient, tool.id);
      toast({
        title: tool.isActive ? "Tool disabled" : "Tool enabled",
        description: `The tool has been ${tool.isActive ? "disabled" : "enabled"} successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to toggle tool status: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const shareToolMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/md/api/v1/tenant/tool/${tool.id}/share`, {}, token);
      return response.json();
    },
    onSuccess: (data) => {
      invalidateToolQueries(queryClient, tool.id);
      toast({
        title: "Tool shared",
        description: "The tool has been shared successfully.",
      });
    },
    onError: (error) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to share tool");

      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  function formatDate(date: string | null | undefined) {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  }

  function getPriorityQaItemCount(): number {
    if (tool.type !== "Priority_QA") return 0;
    try {
      const config = JSON.parse(tool.config);
      return Array.isArray(config.items) ? config.items.length : Array.isArray(config.Items) ? config.Items.length : 0;
    } catch {
      return 0;
    }
  }

  function getChatClassificationTopicCount(): number {
    if (tool.type !== "Chat_Classification") return 0;
    try {
      const config = JSON.parse(tool.config);
      return Array.isArray(config.topics) ? config.topics.length : Array.isArray(config.Topics) ? config.Topics.length : 0;
    } catch {
      return 0;
    }
  }

  function renderToolIcon() {
    if (tool.type === "Priority_QA") {
      return <MessageSquareText className="h-5 w-5 text-white" />;
    }
    if (tool.type === "Chat_Classification") {
      return <Tags className="h-5 w-5 text-white" />;
    }
    if (tool.type === "Contact_Form") {
      return <ClipboardList className="h-5 w-5 text-white" />;
    }
    return <Wrench className="h-5 w-5 text-white" />;
  }

  function renderTypeBadge(extraClass = "") {
    if (tool.type === "Priority_QA") {
      return (
        <div className={`flex items-center gap-1 ${extraClass}`}>
          <Badge variant="outline" className="bg-purple-100 text-purple-800 hover:bg-purple-100">
            Priority Q&amp;A
          </Badge>
          <Badge variant="outline" className="bg-purple-50 text-purple-700 hover:bg-purple-50 text-xs">
            {getPriorityQaItemCount()} pairs
          </Badge>
        </div>
      );
    }
    if (tool.type === "Chat_Classification") {
      return (
        <div className={`flex items-center gap-1 ${extraClass}`}>
          <Badge variant="outline" className="bg-teal-100 text-teal-800 hover:bg-teal-100">
            Chat Classification
          </Badge>
          <Badge variant="outline" className="bg-teal-50 text-teal-700 hover:bg-teal-50 text-xs">
            {getChatClassificationTopicCount()} topics
          </Badge>
        </div>
      );
    }
    if (tool.type === "Contact_Form") {
      return (
        <Badge variant="outline" className={`bg-orange-100 text-orange-800 hover:bg-orange-100 ${extraClass}`}>
          Contact Form
        </Badge>
      );
    }
    if (tool.type === "Image_Generation") {
      return (
        <Badge variant="outline" className={`bg-orange-100 text-orange-800 hover:bg-orange-100 ${extraClass}`}>
          Image to Image
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className={`bg-blue-100 text-blue-800 hover:bg-blue-100 ${extraClass}`}>
        {tool.type}
      </Badge>
    );
  }
  
  return (
    <Card 
      className={`hover:shadow-lg transition-shadow duration-200 p-6 ${listView ? 'w-full' : ''}`}
      onClick={() => navigate(`/tools/${tool.id}/edit`)}
    >
      {listView ? (
        // List view layout
        <div className="flex justify-between items-center">
          <div className="flex items-center flex-1 h-15 w-15 mr-4">
            <Wrench className="h-10 w-10 text-accent" />
            <div className="ml-4">
              <h3 className="font-semibold">{tool.name}</h3>
              <p className="text-sm text-gray-500 line-clamp-1">{tool.description}</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-4">
              {renderTypeBadge()}
              <Badge variant={tool.isShared ? "default" : "secondary"} className={tool.isShared ? "bg-yellow-100 text-yellow-800" : ""}>
                {tool.isShared ? "Shared" : "Unshared"}
              </Badge>
              <ToolPublishBadge tool={tool} />
              {(tool.tags?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1">
                  {tool.tags!.slice(0, 2).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border bg-white"
                      style={tag.color ? { borderColor: tag.color } : { borderColor: "#e5e7eb" }}
                    >
                      {tag.color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
                      {tag.name}
                    </span>
                  ))}
                  {tool.tags!.length > 2 && (
                    <span className="text-xs text-muted-foreground">+{tool.tags!.length - 2}</span>
                  )}
                </div>
              )}
              <div className="text-xs text-gray-500">Created: {formatDate(tool.createdOn)}</div>
              <div className="text-xs text-gray-500">Updated: {formatDate(tool.lastUpdatedOn)}</div>
              <div className="text-xs text-gray-500">Published: {formatDate(tool.lastPublishedOn)}</div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div onClick={(e) => e.stopPropagation()}>
                <Switch 
                  checked={tool.isActive} 
                  onCheckedChange={() => toggleToolMutation.mutate()}
                  disabled={toggleToolMutation.isPending}
                  aria-label={`Toggle ${tool.name} active`}
                />
              </div>

              {renderShareDialog()}
              {renderPublishDialog()}
              {renderEditButton()}
              {renderDeleteDialog()}
            </div>
          </div>
        </div>
      ) : (
        // Grid view layout (original)
        <>
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-lg bg-accent bg-opacity-10 flex items-center justify-center mr-3">
                {renderToolIcon()}
              </div>
              <h3 className="font-semibold">{tool.name}</h3>
            </div>
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <Switch 
                checked={tool.isActive} 
                onCheckedChange={() => toggleToolMutation.mutate()}
                disabled={toggleToolMutation.isPending}
                aria-label={`Toggle ${tool.name} active`}
              />
            </div>
          </div>
          
          <p className="text-sm text-gray-500 mb-4 line-clamp-2">{tool.description}</p>
          
          <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
            <div>Created: {formatDate(tool.createdOn)}</div>
            <div>
              <Badge variant={tool.isShared ? "default" : "secondary"} className={tool.isShared ? "bg-yellow-100 text-yellow-800" : ""}>
                {tool.isShared ? "Shared" : "Unshared"}
              </Badge>
              <ToolPublishBadge tool={tool} />
            </div>
            
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
            <div>Updated: {formatDate(tool.lastUpdatedOn)}</div>
            <div>Published: {formatDate(tool.lastPublishedOn)}</div>
          </div>
          
          {(tool.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {tool.tags!.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border bg-white"
                  style={tag.color ? { borderColor: tag.color } : { borderColor: "#e5e7eb" }}
                >
                  {tag.color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
                  {tag.name}
                </span>
              ))}
              {tool.tags!.length > 3 && (
                <span className="text-xs text-muted-foreground self-center">+{tool.tags!.length - 3}</span>
              )}
            </div>
          )}
          <div className="flex justify-between items-center">
            {renderTypeBadge()}

            <div className="flex space-x-2">
              {renderShareDialog()}
              {renderPublishDialog()}
              {renderEditButton()}
              {renderDeleteDialog()}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}