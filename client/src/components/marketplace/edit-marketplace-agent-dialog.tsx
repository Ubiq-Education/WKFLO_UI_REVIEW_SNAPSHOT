import { useContext, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";
import type { AIModel } from "@/models/definitions";
import type { MarketplaceAgentCatalogEntry } from "@shared/schema";
import { uploadMarketplaceAgentIcon } from "@/services/marketplace-agent-icon-upload-service";

const MARKETPLACE_AGENTS_QUERY_KEY = "/md/api/v1/marketplace/agents";
const ALLOWED_ICON_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_ICON_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, matches the backend endpoint's own limit

const formSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  aiModelId: z.number().optional(),
  iconUrl: z.string().optional(),
  enableSTM: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function getAgentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface EditMarketplaceAgentDialogProps {
  agent: MarketplaceAgentCatalogEntry | null;
  onOpenChange: (open: boolean) => void;
}

export default function EditMarketplaceAgentDialog({ agent, onOpenChange }: EditMarketplaceAgentDialogProps) {
  const { toast } = useToast();
  const token = useAuth();
  const context = useContext(DataContext);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", aiModelId: undefined, iconUrl: "", enableSTM: false },
  });

  // Re-seed the form whenever a different agent is opened for editing.
  useEffect(() => {
    if (agent) {
      form.reset({
        name: agent.name,
        description: agent.description ?? "",
        aiModelId: agent.aiModelId ?? undefined,
        iconUrl: agent.iconUrl ?? "",
        enableSTM: agent.enableSTM,
      });
      setUploadError(null);
    }
  }, [agent, form]);

  const { data: models = [], isLoading: isLoadingModels } = useQuery<AIModel[]>({
    queryKey: ["/md/api/v1/ai-models", token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!agent) throw new Error("No agent selected");
      const response = await apiRequest(
        "PUT",
        `/md/api/v1/marketplace/agent/${agent.id}`,
        {
          // SystemPrompt is required by the backend command even though this dialog doesn't edit
          // it — carry the existing value through unchanged.
          id: agent.id,
          name: values.name,
          description: values.description,
          systemPrompt: agent.systemPrompt ?? "",
          aiModelId: values.aiModelId ?? null,
          iconUrl: values.iconUrl || null,
          enableSTM: values.enableSTM,
        },
        token
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MARKETPLACE_AGENTS_QUERY_KEY] });
      toast({ title: "Agent updated", description: "Marketplace agent has been updated successfully." });
      onOpenChange(false);
    },
    onError: (error) => {
      // A tenant-ownership mismatch (only the tenant that originally shared this agent may edit
      // it — see BeExistingMarketplaceAgentAndBelongToTenant in wkflo_services) surfaces here as a
      // generic 400 from the backend; the toast still shows the underlying message.
      toast({
        title: "Error",
        description: `Failed to update agent: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  async function handleIconFileSelect(file: File | null) {
    if (!file || !agent) return;

    if (!ALLOWED_ICON_MIME_TYPES.includes(file.type)) {
      setUploadError("Only PNG, JPEG, or WEBP images are supported.");
      return;
    }
    if (file.size > MAX_ICON_SIZE_BYTES) {
      setUploadError("Image must be 5MB or smaller.");
      return;
    }
    if (!token) {
      setUploadError("You must be logged in to upload an image.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    try {
      const result = await uploadMarketplaceAgentIcon(agent.id, file, token);
      form.setValue("iconUrl", result.absoluteUrl, { shouldDirty: true });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  }

  function onSubmit(values: FormValues) {
    updateMutation.mutate(values);
  }

  const previewIconUrl = form.watch("iconUrl");
  const previewName = form.watch("name") || agent?.name || "";

  return (
    <Dialog open={!!agent} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Marketplace Agent</DialogTitle>
          <DialogDescription>
            Update this template's name, description, AI model, icon, and Short Term Memory default
            (catalog id {agent?.id}).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 flex-shrink-0">
                {previewIconUrl && <AvatarImage src={previewIconUrl} alt={`${previewName} icon`} />}
                <AvatarFallback className="text-sm font-semibold">
                  {getAgentInitials(previewName || "?")}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <label htmlFor="marketplace-agent-icon-upload">
                  <Button type="button" variant="outline" size="sm" disabled={isUploading} asChild>
                    <span className="cursor-pointer">
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {isUploading ? "Uploading..." : "Upload icon"}
                    </span>
                  </Button>
                </label>
                <input
                  id="marketplace-agent-icon-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    void handleIconFileSelect(file);
                    e.target.value = "";
                  }}
                />
                {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Cam — Image Editor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What does this agent do?" className="min-h-20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="aiModelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>AI Model</FormLabel>
                  {isLoadingModels ? (
                    <Skeleton className="h-10 w-full rounded-md" />
                  ) : context.selectedTenantGuid ? (
                    <Select
                      onValueChange={(val) => field.onChange(val ? Number(val) : undefined)}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {models.map((option) => (
                          <SelectItem key={option.id} value={option.id.toString()} aria-label={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select a tenant from the header above to choose an AI model.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enableSTM"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel>Short Term Memory (STM)</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending || isUploading}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
