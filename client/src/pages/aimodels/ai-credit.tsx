import { useEffect, useContext, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertTriangle, ArrowLeft, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";
import { AIModel, AICredit } from "@/models/definitions";
import AICreditForm from "@/components/aimodels/ai-credit-form";
import { aiCreditFormSchema, AICreditFormValues } from "@/components/aimodels/ai-credit-form.types";

export default function AIModelAICreditPage() {
  const [match, params] = useRoute("/aimodels/:id/ai-credit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = useAuth();
  const context = useContext(DataContext);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const aiModelId = match ? parseInt(params.id) : null;
  const aiCreditQueryKey = `/md/api/v1/ai-model/${aiModelId}/ai-credit`;

  const {
    data: aiModel,
    isLoading: isLoadingModel,
    isError: isModelError,
    error: modelError,
  } = useQuery<AIModel>({
    queryKey: [`/md/api/v1/ai-model/${aiModelId}`, token, context.selectedTenantGuid],
    enabled: !!aiModelId && !!token && !!context.selectedTenantGuid,
    retry: false,
  });

  // Same distinction as the AICredit query below: a 404 genuinely means "this AI Model doesn't
  // exist" (-> the existing "AI Model not found" state), but any other failure (401/500/network)
  // must not be silently treated the same way - it's an operational/auth problem, not a 404.
  const isModelNotFound = isModelError && modelError instanceof Error && modelError.message.startsWith("404");
  const isModelRealError = isModelError && !isModelNotFound;

  // A 404 here means the AIModel has no AICredit configured yet - it's the expected signal to
  // render the Create form rather than an unexpected error (see the endpoint's contract).
  const {
    data: aiCredit,
    isLoading: isLoadingCredit,
    isError: isCreditError,
    error: creditError,
  } = useQuery<AICredit>({
    queryKey: [aiCreditQueryKey, token, context.selectedTenantGuid],
    enabled: !!aiModelId && !!token && !!context.selectedTenantGuid,
    retry: false,
  });

  const isNotFound = isCreditError && creditError instanceof Error && creditError.message.startsWith("404");
  // Any other query failure (500, 401, network error, ...) must NOT be treated as "not configured
  // yet" - that would silently show a blank Create form even when an AICredit actually exists,
  // and submitting it would fail server-side with a confusing "already exists" error instead of
  // surfacing the real problem.
  const isRealError = isCreditError && !isNotFound;
  const isEditMode = !!aiCredit && !isNotFound;

  const form = useForm<AICreditFormValues>({
    resolver: zodResolver(aiCreditFormSchema),
    defaultValues: {
      aiModelId: aiModelId ?? 0,
      tokensIn: 0,
      costInMTok: 0,
      tokensOut: 0,
      costOutMTok: 0,
      multiplierIn: 1,
      multiplierOut: 1,
    },
  });

  // Pre-fill the form once the existing AICredit loads (edit mode).
  useEffect(() => {
    if (aiCredit) {
      form.reset({
        aiModelId: aiCredit.aiModelId,
        tokensIn: aiCredit.tokensIn,
        costInMTok: aiCredit.costInMTok,
        tokensOut: aiCredit.tokensOut,
        costOutMTok: aiCredit.costOutMTok,
        multiplierIn: aiCredit.multiplierIn,
        multiplierOut: aiCredit.multiplierOut,
      });
    }
  }, [aiCredit, form]);

  const createMutation = useMutation({
    mutationFn: async (values: AICreditFormValues) => {
      const response = await apiRequest("POST", "/md/api/v1/ai-credit", values, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [aiCreditQueryKey] });
      toast({ title: "AI Credit Created", description: "AI Credit configuration has been saved." });
    },
    onError: (error) => {
      toast({ title: "Error Creating AI Credit", description: error instanceof Error ? error.message : "An error occurred.", variant: "destructive" });
    },
    onSettled: () => setIsSaving(false),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: AICreditFormValues) => {
      const response = await apiRequest("PUT", `/md/api/v1/ai-credit/${aiCredit?.id}`, values, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [aiCreditQueryKey] });
      toast({ title: "AI Credit Updated", description: "AI Credit configuration has been updated." });
    },
    onError: (error) => {
      toast({ title: "Error Updating AI Credit", description: error instanceof Error ? error.message : "An error occurred.", variant: "destructive" });
    },
    onSettled: () => setIsSaving(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!aiCredit?.id) return;
      await apiRequest("DELETE", `/md/api/v1/ai-credit/${aiCredit.id}`, {}, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [aiCreditQueryKey] });
      toast({ title: "AI Credit Deleted", description: "AI Credit configuration has been removed." });
      form.reset({
        aiModelId: aiModelId ?? 0,
        tokensIn: 0,
        costInMTok: 0,
        tokensOut: 0,
        costOutMTok: 0,
        multiplierIn: 1,
        multiplierOut: 1,
      });
    },
    onError: (error) => {
      toast({ title: "Error Deleting AI Credit", description: error instanceof Error ? error.message : "An error occurred.", variant: "destructive" });
    },
    onSettled: () => setIsDeleting(false),
  });

  const onSubmit = (values: AICreditFormValues) => {
    setIsSaving(true);
    if (isEditMode && aiCredit) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const handleDelete = () => {
    setIsDeleting(true);
    deleteMutation.mutate();
  };

  if (isLoadingModel || isLoadingCredit) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (isModelRealError || isRealError) {
    const message = isModelRealError
      ? (modelError instanceof Error ? modelError.message : "An error occurred loading this AI Model.")
      : (creditError instanceof Error ? creditError.message : "An error occurred loading this AI Model's credit configuration.");

    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-3xl mx-auto space-y-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/aimodels")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to AI Models
          </Button>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{isModelRealError ? "Couldn't load AI Model" : "Couldn't load AI Credit"}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!aiModel) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-secondary">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">AI Model not found</h1>
          <Button variant="outline" size="sm" onClick={() => navigate("/aimodels")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to AI Models
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate("/aimodels")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">AI Credit Configuration</h1>
              <p className="text-sm text-muted-foreground">{aiModel.name}</p>
            </div>
          </div>
          {isEditMode && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Delete AI Credit" disabled={isDeleting}>
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete AI Credit</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this AI Credit configuration? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild>
                    <Button variant="outline" type="button">Cancel</Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button variant="destructive" type="button" onClick={handleDelete}>
                      Delete
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <AICreditForm
          form={form}
          onSubmit={onSubmit}
          isSubmitting={isSaving || createMutation.isPending || updateMutation.isPending}
          isEditMode={isEditMode}
        />
      </div>
    </div>
  );
}
