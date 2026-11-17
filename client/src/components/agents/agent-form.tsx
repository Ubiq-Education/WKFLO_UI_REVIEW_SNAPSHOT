import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useContext } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { type Tool, AGENT_ADDITIONAL_INSTRUCTIONS_MAX_LENGTH } from "@shared/schema";
import useAuth from "@/hooks/use-auth";
import { AIModel } from "@/models/definitions";
import { useLocation } from "wouter";
import { DataContext } from '@shared/models/chat-models';

interface AgentFormProps {
  form: UseFormReturn<any>;
  onSubmit: (values: any) => void;
  isSubmitting: boolean;
  formTitle?: string;
  submitLabel?: string;
  // Only the edit page round-trips AdditionalInstructions; create doesn't send it.
  showAdditionalInstructions?: boolean;
}

export default function AgentForm({ 
  form, 
  onSubmit, 
  isSubmitting,
  formTitle = "Agent Configuration",
  submitLabel = "Save",
  showAdditionalInstructions = false
}: AgentFormProps) {

  const token = useAuth();
  const context = useContext(DataContext);
  const [_, navigate] = useLocation();
  
  const { data: tools } = useQuery<Tool[]>({
    queryKey: ["/md/api/v1/tenant/tools", token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  // Query to fetch all AI models
  const { data: models = [], isLoading } = useQuery<AIModel[]>({
    queryKey: ['/md/api/v1/ai-models', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
    refetchOnWindowFocus: false
  });
  
  // States for tool slash command functionality
  const [showToolMenu, setShowToolMenu] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [searchText, setSearchText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Filter tools based on search text when user types after "/"
  const filteredTools = tools?.filter(tool => 
    searchText === "" || tool.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];
  
  // Handle textarea input to detect when "/" is typed
  const handleSystemPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>, onChange: (...event: any[]) => void) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setCursorPosition(cursorPos);
            // Query to fetch all AI models and memory options
    // Find the last "/" before the cursor
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastSlashPos = textBeforeCursor.lastIndexOf('/');
    
    if (lastSlashPos !== -1 && lastSlashPos === cursorPos - 1) {
      // User just typed a slash, show the menu
      setShowToolMenu(true);
      setSearchText("");
    } else if (lastSlashPos !== -1 && cursorPos > lastSlashPos + 1) {
      // User is typing after a slash, update search
      const searchAfterSlash = textBeforeCursor.substring(lastSlashPos + 1);
      setSearchText(searchAfterSlash);
      setShowToolMenu(true);
    } else {
      // No slash or cursor moved away from slash position
      setShowToolMenu(false);
    }
    
    // Call the original onChange handler to update form state
    onChange(e);
  };
  
  // Insert tool reference into the system prompt
  const insertToolReference = (tool: Tool) => {
    const systemPrompt = form.getValues("systemPrompt");
    const position = cursorPosition;
    
    // Find the last slash before cursor to replace it with the tool reference
    const textBeforeCursor = systemPrompt.substring(0, position);
    const lastSlashPos = textBeforeCursor.lastIndexOf('/');
    
    if (lastSlashPos !== -1) {
      // Replace the slash and any text after it up to cursor with the tool reference
      const newPrompt = 
        systemPrompt.substring(0, lastSlashPos) + 
        `{{tool:${tool.id}:${tool.name}}}` + 
        systemPrompt.substring(position);
      
      // Update form state
      form.setValue("systemPrompt", newPrompt);
      
      // Move cursor to after the inserted reference
      setTimeout(() => {
        if (textareaRef.current) {
          const newPosition = lastSlashPos + `{{tool:${tool.id}:${tool.name}}}`.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    }
    
    // Close the menu
    setShowToolMenu(false);
  };
  
  return (
    <Card className="border-border">
      <CardContent className="py-6 px-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Content Analyzer" {...field} />
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
                          placeholder="What does this agent do?" 
                          className="min-h-24" 
                          {...field} 
                        />
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
                      {isLoading ? (
                        <Skeleton className="h-10 w-full rounded-md" />
                      ) : (
                        <Select
                          onValueChange={val => field.onChange(val ? Number(val) : undefined)}
                          value={field.value != null ? String(field.value) : ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {models.map(option => (
                              <SelectItem key={option.id} value={option.id.toString()} aria-label={option.name}>
                                {option.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="systemPrompt"
                  render={({ field }) => (
                    <FormItem className="relative">
                      <FormLabel>System Prompt</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Textarea 
                            ref={textareaRef}
                            placeholder="Instructions for the AI model... (Type / to insert tools)" 
                            className="min-h-44 font-mono text-sm" 
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleSystemPromptChange(e, field.onChange)}
                            onBlur={() => {
                              // Delay hiding the menu to allow clicking on items
                              setTimeout(() => setShowToolMenu(false), 200);
                              field.onBlur();
                            }}
                            value={field.value}
                            name={field.name}
                          />
                        </FormControl>
                        
                        {/* Tool selection menu */}
                        {showToolMenu && tools && tools.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full max-w-md bg-white rounded-md shadow-lg border border-gray-200">
                            <div className="p-2 text-sm text-gray-500 border-b">
                              {searchText ? `Search: ${searchText}` : "Select a tool to insert"}
                            </div>
                            <ScrollArea className="max-h-64">
                              {filteredTools.length > 0 ? (
                                <div className="py-1">
                                  {filteredTools.map((tool) => (
                                    <div
                                      key={tool.id}
                                      className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 flex items-center"
                                      onClick={() => insertToolReference(tool)}
                                    >
                                      <span className="font-medium">{tool.name}</span>
                                      <span className="ml-2 text-xs text-gray-500">({tool.type})</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">
                                  No tools match "{searchText}"
                                </div>
                              )}
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Type / to insert tool references into your prompt
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showAdditionalInstructions && (
                  <FormField
                    control={form.control}
                    name="additionalInstructions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Instructions</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Optional guidance appended after the system prompt"
                            className="min-h-24 text-sm"
                            maxLength={AGENT_ADDITIONAL_INSTRUCTIONS_MAX_LENGTH}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500 mt-1">
                          Appended after the system prompt at runtime. Normally set by an administrator in AMAIS CMS.
                          {" "}({(field.value ?? "").length}/{AGENT_ADDITIONAL_INSTRUCTIONS_MAX_LENGTH})
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* STM and LTM switches */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="enableSTM"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel>Short Term Memory (STM)</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="enableLTM"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel>Long Term Memory (LTM)</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enableSpinUpAgents"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel>Spin Up Agents</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

              </div>
            </div>
            
            <Separator />
            
            <div className="flex justify-end space-x-3">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => navigate("/agents")}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
