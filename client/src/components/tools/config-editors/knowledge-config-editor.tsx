import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { KnowledgeToolConfig } from "../tool-form.types";

interface KnowledgeConfigEditorProps {
  form: UseFormReturn<any>;
}

/**
 * Config editor for the Knowledge tool type: a tags editor.
 *
 * Tags are read from the form's own "tags" field (kept in sync with `config.tags` by the
 * cross-cutting effect in tool-form.tsx that runs for every tool type, not just
 * Knowledge - that effect intentionally stays in the orchestrator rather than moving
 * here, since it isn't Knowledge-specific behavior). This editor only needs to persist
 * edits back into the JSON `config` string.
 */
export default function KnowledgeConfigEditor({ form }: KnowledgeConfigEditorProps) {
  const [configKnowledgeStr, setConfigKnowledgeStr] = useState<KnowledgeToolConfig | null>(null);

  const { updateField: updateTagsField } = useJsonConfigField(form, {
    errorMessage: "Failed to update tags. Please check the JSON format.",
    onSaved: (config) => setConfigKnowledgeStr(config),
  });

  // Parse and sanitize the config once when this editor mounts (i.e. whenever the tool
  // type switches to Knowledge), mirroring the original parseKnowledgeConfig effect that
  // ran on `toolType` change in the monolith.
  useEffect(() => {
    try {
      const configStr = form.getValues("config");
      const config: KnowledgeToolConfig = { tags: [] };
      try {
        const parsedConfig = configKnowledgeStr || JSON.parse(configStr);
        config.tags = !parsedConfig.tags || !Array.isArray(parsedConfig.tags) ? [] : parsedConfig.tags;
        setConfigKnowledgeStr(config);
        form.setValue("config", JSON.stringify(config, null, 2));
      } catch (e) {
        const defaultConfig: KnowledgeToolConfig = { tags: [] };
        setConfigKnowledgeStr(defaultConfig);
        form.setValue("config", JSON.stringify(defaultConfig, null, 2));
      }
    } catch (e) {
      console.error("Error initializing config:", e);
    }
    // Intentionally runs only on mount - matches the original effect's practical behavior
    // of firing once per toolType change into "Knowledge".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {/* Knowledge Configuration section */}
      <div className="space-y-2 border-t pt-4 mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Knowledge Configuration</h3>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <FormLabel>Tags</FormLabel>
          <div className="space-y-3 border p-3 rounded-md">
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {field.value?.map((tag: string, idx: number) => (
                      <span key={idx} className="inline-flex items-center px-2 py-1 bg-muted rounded text-xs">
                        {tag}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const newTags = field.value.filter((_: string, i: number) => i !== idx);
                            field.onChange(newTags);
                            updateTagsField("tags", newTags);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Input
                    type="text"
                    placeholder="Add a tag and press Enter"
                    onKeyDown={e => {
                      if (e.key === "Enter" && e.currentTarget.value.trim()) {
                        e.preventDefault();
                        const newTags = [...(field.value || []), e.currentTarget.value.trim()];
                        field.onChange(newTags);
                        updateTagsField("tags", newTags);
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
