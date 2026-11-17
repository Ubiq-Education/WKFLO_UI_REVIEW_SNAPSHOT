import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toolFormSchema as formSchema } from "@/lib/entity-form-schemas";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { invalidateToolQueries } from "@/lib/tool-query-invalidation";
import { useToast } from "@/hooks/use-toast";
import ToolForm from "@/components/tools/tool-form";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import useAuth from "@/hooks/use-auth";

type FormValues = z.infer<typeof formSchema>;

export default function CreateTool() {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const token = useAuth();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "HTTP",
      config: "{}",
      isActive: true,
      tags: [],
      maxToolOutputLength: null,
      // Opt-in for every tool type (PLAN.md decision 8).
      permissionsEnabled: false,
    },
  });

  const createToolMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await apiRequest("POST", "/md/api/v1/tenant/tool", values, token);
      return response.json();
    },
    onSuccess: (result) => {
      // Stay on the tool (now in edit view) after creating, the same way edit.tsx stays put after
      // saving, instead of bouncing back to the list - lets the admin immediately keep configuring
      // it (e.g. connect MCP OAuth) without an extra click back into what they just created.
      invalidateToolQueries(queryClient, result?.data?.id);
      toast({
        title: "Tool created",
        description: "Your tool has been created successfully.",
      });
      navigate(`/tools/${result.data.id}/edit`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create tool: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: FormValues) {
    setIsSaving(true);
    createToolMutation.mutate(values);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/tools")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-semibold ml-4">Create New Tool</h1>
        </div>
        
        <ToolForm 
          form={form} 
          onSubmit={onSubmit} 
          isSubmitting={isSaving}
          onCancel={() => navigate("/tools")}
        />
      </div>
    </div>
  );
}
