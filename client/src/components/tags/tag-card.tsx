import { useLocation } from "wouter";
import { Pencil, Trash } from "lucide-react";
import type { Tag } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import useAuth from "@/hooks/use-auth";

interface TagCardProps {
  tag: Tag;
  listView?: boolean;
}

export default function TagCard({ tag, listView = false }: TagCardProps) {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const token = useAuth();

  function formatDate(date: string | null | undefined) {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  }

  const deleteTagMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/md/api/v1/tenant/tag/${tag.id}`, {}, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/tags"] });
      toast({ title: "Tag deleted", description: "The tag has been successfully deleted." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to delete tag: ${error.message}`, variant: "destructive" });
    },
  });

  const colorSwatch = (
    <div
      className="w-8 h-8 rounded-full border border-gray-200 flex-shrink-0"
      style={{ backgroundColor: tag.color || "#e5e7eb" }}
    />
  );

  const editButton = (
    <Button
      size="icon"
      variant="ghost"
      onClick={(e) => { e.stopPropagation(); navigate(`/tags/${tag.id}/edit`); }}
      title="Edit Tag"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );

  const deleteDialog = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()} title="Delete Tag">
          <Trash className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the tag "{tag.name}".
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteTagMutation.mutate()}
            disabled={deleteTagMutation.isPending}
          >
            {deleteTagMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <Card
      className={`hover:shadow-lg transition-shadow duration-200 p-6 cursor-pointer ${listView ? 'w-full' : ''}`}
      onClick={() => navigate(`/tags/${tag.id}/edit`)}
    >
      {listView ? (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 flex-1">
            {colorSwatch}
            <div>
              <h3 className="font-semibold">{tag.name}</h3>
              {tag.color && <p className="text-xs text-gray-500">{tag.color}</p>}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-4">
              <div className="text-xs text-gray-500">Created: {formatDate(tag.createdOn)}</div>
              <div className="text-xs text-gray-500">Updated: {formatDate(tag.lastUpdatedOn)}</div>
            </div>
            <div className="flex items-center space-x-2">
              {editButton}
              {deleteDialog}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              {colorSwatch}
              <h3 className="font-semibold">{tag.name}</h3>
            </div>
            <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
              {editButton}
              {deleteDialog}
            </div>
          </div>
          {tag.color && <p className="text-xs text-gray-500 mb-3">{tag.color}</p>}
          <div className="text-xs text-gray-500 space-y-1">
            <div>Created: {formatDate(tag.createdOn)}</div>
            {tag.lastUpdatedOn && <div>Updated: {formatDate(tag.lastUpdatedOn)}</div>}
          </div>
        </>
      )}
    </Card>
  );
}
