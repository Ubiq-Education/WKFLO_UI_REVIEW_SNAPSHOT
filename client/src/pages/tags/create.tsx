import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createTagSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import useAuth from "@/hooks/use-auth";

const formSchema = createTagSchema;
type FormValues = z.infer<typeof formSchema>;

export default function CreateTag() {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const token = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", color: "" },
  });

  const colorValue = form.watch("color");

  const createTagMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = { name: values.name, color: values.color || null };
      const response = await apiRequest("POST", "/md/api/v1/tenant/tag", payload, token);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/md/api/v1/tenant/tags"] });
      toast({ title: "Tag created", description: "Your tag has been created successfully." });
      navigate("/tags");
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to create tag: ${error.message}`, variant: "destructive" });
    },
  });

  function onSubmit(values: FormValues) {
    createTagMutation.mutate(values);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/tags")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-semibold ml-4">Create New Tag</h1>
        </div>

        <Card>
          <CardContent className="py-6 px-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tag Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Production, Marketing, Finance" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color (optional)</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={colorValue || "#6366f1"}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer border border-input p-0.5 bg-white"
                          />
                          <Input
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                            placeholder="#6366f1"
                            maxLength={20}
                          />
                          {field.value && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange(null)}>
                              Clear
                            </Button>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/tags")}
                    disabled={createTagMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTagMutation.isPending}>
                    {createTagMutation.isPending ? "Creating..." : "Create Tag"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
