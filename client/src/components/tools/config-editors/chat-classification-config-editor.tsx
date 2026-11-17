import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { ChatClassificationTopic, ChatClassificationToolConfig } from "../tool-form.types";

interface ChatClassificationConfigEditorProps {
  form: UseFormReturn<any>;
}

/**
 * Pure normalization of a parsed config object into the Chat Classification shape -
 * tolerates both camelCase and PascalCase input keys (legacy/back-end variance).
 * Exported so the orchestrator's submit handler can call the exact same logic used
 * here, instead of duplicating it (the original monolith had this logic copy-pasted in
 * both places).
 */
export function normalizeChatClassificationConfig(rawConfig: any): ChatClassificationToolConfig {
  const rawTopics: any[] = Array.isArray(rawConfig?.topics)
    ? rawConfig.topics
    : Array.isArray(rawConfig?.Topics)
      ? rawConfig.Topics
      : [];
  return {
    topics: rawTopics.map((topic: any): ChatClassificationTopic => ({
      id: topic.id ?? topic.Id ?? crypto.randomUUID(),
      name: topic.name ?? topic.Name ?? "",
      description: topic.description ?? topic.Description ?? "",
      isActive: topic.isActive ?? true,
    })),
  };
}

/** Config editor for the Chat_Classification tool type: a repeatable topic list. */
export default function ChatClassificationConfigEditor({ form }: ChatClassificationConfigEditorProps) {
  const [configChatClassificationStr, setConfigChatClassificationStr] = useState<ChatClassificationToolConfig | null>(null);

  const { updateField } = useJsonConfigField(form, {
    errorMessage: "Failed to update classification topics.",
    onSaved: (config) => setConfigChatClassificationStr(config),
  });

  const getTopics = (): ChatClassificationTopic[] => {
    try {
      const configStr = form.getValues("config");
      const config = JSON.parse(configStr);
      return Array.isArray(config.topics) ? config.topics : [];
    } catch {
      return [];
    }
  };

  const updateTopics = (topics: ChatClassificationTopic[]) => updateField("topics", topics);

  // Parse and sanitize the config once when this editor mounts (i.e. whenever the tool
  // type switches to Chat_Classification), mirroring the original
  // parseChatClassificationConfig effect that ran on `toolType` change in the monolith.
  useEffect(() => {
    try {
      const configStr = form.getValues("config");
      try {
        const parsedConfig = configChatClassificationStr || JSON.parse(configStr);
        const config = normalizeChatClassificationConfig(parsedConfig);
        setConfigChatClassificationStr(config);
        form.setValue("config", JSON.stringify(config, null, 2));
      } catch (e) {
        const defaultConfig: ChatClassificationToolConfig = {
          topics: [{ id: crypto.randomUUID(), name: "", description: "", isActive: true }],
        };
        setConfigChatClassificationStr(defaultConfig);
        form.setValue("config", JSON.stringify(defaultConfig, null, 2));
      }
    } catch (e) {
      console.error("Error initializing Chat Classification config:", e);
    }
    // Intentionally runs only on mount - matches the original effect's practical behavior
    // of firing once per toolType change into "Chat_Classification".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="space-y-2 border-t pt-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium">Chat Classification Configuration</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Each user message will be automatically classified against these topics.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const topics = getTopics();
              updateTopics([...topics, { id: crypto.randomUUID(), name: "", description: "", isActive: true }]);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Topic
          </Button>
        </div>

        <div className="space-y-4 mt-2">
          {getTopics().map((topic: any, idx: number) => (
            <div key={topic.id || idx} className="border rounded-md p-4 space-y-3 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Topic {idx + 1}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={topic.isActive ?? true}
                      onChange={(e) => {
                        const topics = [...getTopics()];
                        topics[idx] = { ...topics[idx], isActive: e.target.checked };
                        updateTopics(topics);
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">Active</span>
                  </label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const topics = getTopics();
                      updateTopics(topics.filter((_: any, i: number) => i !== idx));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-xs">Name <span className="text-red-500">*</span></FormLabel>
                <Input
                  value={topic.name || ""}
                  onChange={(e) => {
                    const topics = [...getTopics()];
                    topics[idx] = { ...topics[idx], name: e.target.value };
                    updateTopics(topics);
                  }}
                  placeholder="e.g., Billing"
                />
              </div>

              <div className="space-y-2">
                <FormLabel className="text-xs">Description <span className="text-red-500">*</span></FormLabel>
                <Textarea
                  value={topic.description || ""}
                  onChange={(e) => {
                    const topics = [...getTopics()];
                    topics[idx] = { ...topics[idx], description: e.target.value };
                    updateTopics(topics);
                  }}
                  placeholder="e.g., Messages related to invoices, payments, subscriptions or pricing questions."
                  className="min-h-[80px]"
                />
              </div>
            </div>
          ))}

          {getTopics().length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
              No topics yet. Click "Add Topic" to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
