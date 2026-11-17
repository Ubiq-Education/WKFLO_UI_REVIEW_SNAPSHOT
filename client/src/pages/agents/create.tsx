import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { agentCreateFormSchema as formSchema } from "@/lib/entity-form-schemas";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AgentForm from "@/components/agents/agent-form";
import { Button } from "@/components/ui/button";
import useAuth from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";

type FormValues = z.output<typeof formSchema>;
// Fields with `.default()` are optional on input and required on output (zod 4).
type FormInput = z.input<typeof formSchema>;

export default function CreateAgent() {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const token = useAuth();

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt: "",
      aiModelId: undefined,
      enableSTM: false,
      enableLTM: false,
      enableSpinUpAgents: false,
    },
  });

  const createAgentMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await apiRequest("POST", "/md/api/v1/tenant/agent", values, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/agents"] });
      toast({
        title: "Agent created",
        description: "Your agent has been created successfully.",
      });
      navigate("/agents");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create agent: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: FormValues) {
    console.log("Form submitted with values:", values);
    setIsSaving(true);
    createAgentMutation.mutate(values);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/agents")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-semibold ml-4">Create New Agent</h1>
        </div>
        <AgentForm 
          form={form} 
          onSubmit={onSubmit} 
          isSubmitting={isSaving}
          formTitle="Create Agent"
          submitLabel="Create Agent"
        />
      </div>
    </div>
  );
}
