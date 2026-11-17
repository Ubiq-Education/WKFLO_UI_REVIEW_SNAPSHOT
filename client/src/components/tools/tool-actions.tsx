import type { ReactElement, ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateToolQueries } from "@/lib/tool-query-invalidation";
import { useToast } from "@/hooks/use-toast";
import useAuth from "@/hooks/use-auth";
import { parseErrorMessage } from "@/lib/utils";

/**
 * Publish and delete flows for one tool, shared by the tool card (Tools list) and the tool edit
 * page so both use the same endpoint, confirmation and toasts.
 */
export function usePublishTool(toolId: number) {
  const { toast } = useToast();
  const token = useAuth();
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/md/api/v1/tenant/tool/${toolId}/publish`, {}, token);
      return response.json();
    },
    onSuccess: () => {
      invalidateToolQueries(queryClient, toolId);
      toast({
        title: "Tool published",
        description: "The tool has been published successfully.",
      });
    },
    onError: (error) => {
      const errorDetails = parseErrorMessage(error.message, "Failed to publish tool");

      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteTool(toolId: number, options: { onDeleted?: () => void } = {}) {
  const { toast } = useToast();
  const token = useAuth();
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/md/api/v1/tenant/tool/${toolId}`, {}, token);
      return response.json();
    },
    onSuccess: () => {
      // The tool is gone: drop its own queries rather than refetch them, then refresh the lists
      // and agent data that mentioned it.
      queryClient.removeQueries({ queryKey: [`/md/api/v1/tenant/tool/${toolId}`] });
      queryClient.removeQueries({ queryKey: [`/md/api/v1/tenant/tool/${toolId}/functions`] });
      invalidateToolQueries(queryClient);
      toast({
        title: "Tool deleted",
        description: "The tool has been successfully deleted.",
      });
      options.onDeleted?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete tool: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

interface ToolActionDialogProps {
  toolId: number;
  /** The button that opens the confirmation; receives whether the action is running. */
  renderTrigger: (isPending: boolean) => ReactElement;
}

export function PublishToolDialog({ toolId, renderTrigger, note }: ToolActionDialogProps & { note?: ReactNode }) {
  const publishToolMutation = usePublishTool(toolId);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{renderTrigger(publishToolMutation.isPending)}</AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish Tool</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to publish this tool? This will make the tool
            accessible from public workflows and chats in your organization.
            Also it will be ready to be shared in the marketplace.
          </AlertDialogDescription>
          {note}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => publishToolMutation.mutate()}
            disabled={publishToolMutation.isPending}>
            {publishToolMutation.isPending ? "Publishing..." : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteToolDialog({ toolId, renderTrigger, onDeleted }: ToolActionDialogProps & { onDeleted?: () => void }) {
  const deleteToolMutation = useDeleteTool(toolId, { onDeleted });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{renderTrigger(deleteToolMutation.isPending)}</AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the tool
            and remove it from any agents using it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteToolMutation.mutate()}
            disabled={deleteToolMutation.isPending}
          >
            {deleteToolMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
