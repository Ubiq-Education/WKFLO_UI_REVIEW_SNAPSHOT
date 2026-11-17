import { useContext, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Plus, Tags } from "lucide-react";
import type { Tag } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";

export type TaggableEntityType = "Agent" | "Tool" | "AIModel";

interface EntityTagsPanelProps {
  entityType: TaggableEntityType;
  entityId: number;
}

export default function EntityTagsPanel({ entityType, entityId }: EntityTagsPanelProps) {
  const { toast } = useToast();
  const token = useAuth();
  const { isSuperPowerUser } = useSuperPowerUser();
  const context= useContext(DataContext);
  const [selectedTagId, setSelectedTagId] = useState<string>("");

  const entityTagsKey = `/md/api/v1/tenant/entity/${entityType}/${entityId}/tags`;

  const { data: entityTags = [], isLoading: isLoadingEntityTags } = useQuery<Tag[]>({
    queryKey: [entityTagsKey, token, context.selectedTenantGuid],
    enabled: !!entityId && !!token && !!context.selectedTenantGuid,
  });

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["/md/api/v1/tenant/tags", token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  const assignedIds = new Set(entityTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !assignedIds.has(t.id));

  const assignMutation = useMutation({
    mutationFn: async (tagId: number) => {
      const response = await apiRequest(
        "POST",
        `/md/api/v1/tenant/tag/${tagId}/entity`,
        { id: tagId, entityType, entityId },
        token
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entityTagsKey] });
      setSelectedTagId("");
      toast({ title: "Tag assigned", description: "Tag has been assigned successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to assign tag: ${error.message}`, variant: "destructive" });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (tagId: number) => {
      const response = await apiRequest(
        "DELETE",
        `/md/api/v1/tenant/tag/${tagId}/entity/${entityType}/${entityId}`,
        {},
        token
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entityTagsKey] });
      toast({ title: "Tag removed", description: "Tag has been removed successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to remove tag: ${error.message}`, variant: "destructive" });
    },
  });

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tags className="h-4 w-4" />
          Tags
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assigned tags */}
        <div className="flex flex-wrap gap-2 min-h-[32px]">
          {isLoadingEntityTags ? (
            <>
              <div className="h-7 w-20 bg-muted animate-pulse rounded-full" />
              <div className="h-7 w-16 bg-muted animate-pulse rounded-full" />
            </>
          ) : entityTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags assigned yet.</p>
          ) : (
            entityTags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 text-sm font-normal"
                style={tag.color ? { borderColor: tag.color } : {}}
              >
                {tag.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tag.name}
                <button
                  type="button"
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-muted transition-colors"
                  onClick={() => unassignMutation.mutate(tag.id)}
                  disabled={unassignMutation.isPending}
                  aria-label={`Remove tag ${tag.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        {/* Add tag row */}
        {allTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tags exist yet.
            {isSuperPowerUser ? (
              <>
                {" "}
                <a href="/tags/create" className="text-primary underline hover:no-underline">
                  Create a tag
                </a>{" "}
                to get started.
              </>
            ) : null}
          </p>
        ) : availableTags.length > 0 ? (
          <div className="flex items-center gap-2">
            <Select value={selectedTagId} onValueChange={setSelectedTagId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Add a tag…" />
              </SelectTrigger>
              <SelectContent>
                {availableTags.map((tag) => (
                  <SelectItem key={tag.id} value={String(tag.id)}>
                    <div className="flex items-center gap-2">
                      {tag.color ? (
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                      ) : (
                        <span className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-200" />
                      )}
                      {tag.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={() => selectedTagId && assignMutation.mutate(parseInt(selectedTagId))}
              disabled={!selectedTagId || assignMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">All available tags have been assigned.</p>
        )}
      </CardContent>
    </Card>
  );
}
