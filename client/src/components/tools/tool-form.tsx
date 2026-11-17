import { useEffect } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NumberStepperInput } from "@/components/ui/number-stepper-input";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

import { ToolFormProps } from "./tool-form.types";
import { useVariableSuggestions } from "./hooks/use-variable-suggestions";
import HttpConfigEditor from "./config-editors/http-config-editor";
import IntegrationAmaisConfigEditor from "./config-editors/integration-amais-config-editor";
import RawJsonConfigEditor from "./config-editors/raw-json-config-editor";
import KnowledgeConfigEditor from "./config-editors/knowledge-config-editor";
import McpConfigEditor from "./config-editors/mcp-config-editor";
import { normalizeMcpConfigForSubmit, parseConfigObject } from "./config-editors/mcp-oauth-client-credentials";
import ContactFormConfigEditor from "./config-editors/contact-form-config-editor";
import ImageGenerationConfigEditor from "./config-editors/image-generation-config-editor";
import PriorityQaConfigEditor, { normalizePriorityQaConfig } from "./config-editors/priority-qa-config-editor";
import ChatClassificationConfigEditor, { normalizeChatClassificationConfig } from "./config-editors/chat-classification-config-editor";

export default function ToolForm({ form, onSubmit, isSubmitting, onCancel, mcpOAuthConnectionId, toolId, onFunctionsDirtyChange, mcpConnectionsReset }: ToolFormProps & { onCancel?: () => void }) {
  const toolType = form.watch("type");

  const { showAvailableVariables } = useVariableSuggestions(form);

  // Sync tags from config to form field
  useEffect(() => {
    const tags = getTagsField();
    form.setValue("tags", tags);
  }, [form.watch("config")]);

  const getTagsField = () => {
    try {
      const configStr = form.getValues("config");
      const config = JSON.parse(configStr);
      return Array.isArray(config.tags) ? config.tags : [];
    } catch {
      return [];
    }
  };

  // Shared with the submit button below and with McpConfigEditor's Connection Mode auto-save
  // (see McpConfigEditorProps.onRequestImmediateSave) - both need the exact same
  // validate-then-normalize-then-onSubmit path, not a second, divergent copy of it.
  const submitValues = (values: any) => {
    if (values.type === "Priority_QA") {
      try {
        const parsed = JSON.parse(values.config);
        const normalized = normalizePriorityQaConfig(parsed);
        values = { ...values, config: JSON.stringify(normalized) };
      } catch { /* leave config as-is */ }
    }
    if (values.type === "Chat_Classification") {
      try {
        const parsed = JSON.parse(values.config);
        const normalized = normalizeChatClassificationConfig(parsed);
        values = { ...values, config: JSON.stringify(normalized) };
      } catch { /* leave config as-is */ }
    }
    if (values.type === "MCP") {
      // US 7849: never post hasClientSecret, a blank clientSecret or a non-true clearClientSecret.
      const parsed = parseConfigObject(values.config);
      if (parsed) {
        values = { ...values, config: JSON.stringify(normalizeMcpConfigForSubmit(parsed), null, 2) };
      }
    }
    onSubmit(values);
  };
  const triggerSave = () => form.handleSubmit(submitValues)();

  return (
    <Card className="border-border">
      <CardContent className="py-6 px-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submitValues)} className="space-y-6 relative">
            
            {/* We'll use the built-in autocomplete instead of a custom component */}
            
            {/* Basic Info Section */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tool Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Search API" {...field} />
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
                      <Textarea 
                        placeholder="Describe what this tool does..." 
                        className="min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tool Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a tool type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="HTTP">HTTP API</SelectItem>
                        <SelectItem value="Knowledge">Document Library</SelectItem>
                        <SelectItem value="MCP">MCP</SelectItem>
                        <SelectItem value="Integration_Amais">AMAIS Integration</SelectItem>
                        <SelectItem value="Priority_QA">Priority Q&amp;A</SelectItem>
                        <SelectItem value="Chat_Classification">Chat Classification</SelectItem>
                        <SelectItem value="Contact_Form">Contact Form</SelectItem>
                        <SelectItem value="Image_Generation">Image to Image</SelectItem>
                        {/* <SelectItem value="Python">Python Script</SelectItem>
                        <SelectItem value="JavaScript">JavaScript</SelectItem> */}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxToolOutputLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Output Length</FormLabel>
                    <FormControl>
                      <NumberStepperInput
                        value={field.value ?? null}
                        onChange={field.onChange}
                        min={1}
                        placeholder="No limit"
                        className="max-w-[160px]"
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      Caps this tool's output (in characters) before it's sent to the AI model. Leave empty for no limit.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* WI 7447 / US 7575 (PLAN.md decision 8): whether agents' per-tool permissions
                  (Always allow / Ask for permission / Block) apply to this tool at all. When off,
                  every agent uses the tool without asking - for an MCP tool, every function, since
                  the Functions panel's selection is ignored (Bug 7856 / Task 7857). */}
              <FormField
                control={form.control}
                name="permissionsEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Manage permissions for this tool</FormLabel>
                      <p className="text-sm text-muted-foreground" data-testid="permissions-enabled-help">
                        {toolType === "MCP"
                          ? "When on, choose which of this tool's functions agents can use, and set each agent to use them always, only after someone approves it, or never. When off, agents can use every function of this tool without asking."
                          : "When on, each agent that uses this tool can be set to use it always, only after someone approves it, or never. When off, agents use this tool without asking."}
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {toolType === "HTTP" && (
                <HttpConfigEditor form={form} showAvailableVariables={showAvailableVariables} />
              )}

              {toolType === "Knowledge" && (
                <KnowledgeConfigEditor form={form} />
              )}

              {toolType === "MCP" && (
                <McpConfigEditor
                  form={form}
                  mcpOAuthConnectionId={mcpOAuthConnectionId}
                  onRequestImmediateSave={mcpOAuthConnectionId ? triggerSave : undefined}
                  isSaving={isSubmitting}
                  toolId={toolId}
                  onFunctionsDirtyChange={onFunctionsDirtyChange}
                  connectionsReset={mcpConnectionsReset}
                />
              )}

              {toolType === "Integration_Amais" && (
                <IntegrationAmaisConfigEditor form={form} />
              )}

              {toolType === "Priority_QA" && (
                <PriorityQaConfigEditor form={form} />
              )}

              {toolType === "Chat_Classification" && (
                <ChatClassificationConfigEditor form={form} />
              )}

              {toolType === "Contact_Form" && (
                <ContactFormConfigEditor form={form} />
              )}

              {toolType === "Image_Generation" && (
                <ImageGenerationConfigEditor form={form} />
              )}

              {/* Config field for any tool type without a dedicated config editor */}
              {toolType !== "HTTP" && toolType !== "Knowledge" && toolType !== "MCP" && toolType !== "Integration_Amais" && toolType !== "Priority_QA" && toolType !== "Chat_Classification" && toolType !== "Contact_Form" && toolType !== "Image_Generation" && (
                <RawJsonConfigEditor form={form} />
              )}
            </div>
            
            <div className="flex justify-end space-x-2">
              {onCancel && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>Save Tool</>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}