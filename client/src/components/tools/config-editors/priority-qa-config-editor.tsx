import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { PriorityQaItem, PriorityQaToolConfig } from "../tool-form.types";

interface PriorityQaConfigEditorProps {
  form: UseFormReturn<any>;
}

/**
 * Pure normalization of a parsed config object into the Priority Q&A shape - tolerates
 * both camelCase and PascalCase input keys (legacy/back-end variance). Exported so the
 * orchestrator's submit handler can call the exact same logic used here, instead of
 * duplicating it (the original monolith had this logic copy-pasted in both places).
 */
export function normalizePriorityQaConfig(rawConfig: any): PriorityQaToolConfig {
  const rawItems: any[] = Array.isArray(rawConfig?.items)
    ? rawConfig.items
    : Array.isArray(rawConfig?.Items)
      ? rawConfig.Items
      : [];
  return {
    items: rawItems.map((item: any): PriorityQaItem => ({
      question: item.question ?? item.Question ?? "",
      answer: item.answer ?? item.Answer ?? "",
      links: item.links ?? item.Links ?? [],
    })),
  };
}

/** Config editor for the Priority_QA tool type: a repeatable question/answer/links list. */
export default function PriorityQaConfigEditor({ form }: PriorityQaConfigEditorProps) {
  const [configPriorityQaStr, setConfigPriorityQaStr] = useState<PriorityQaToolConfig | null>(null);

  const { updateField } = useJsonConfigField(form, {
    errorMessage: "Failed to update Q&A items.",
    onSaved: (config) => setConfigPriorityQaStr(config),
  });

  const getItems = (): PriorityQaItem[] => {
    try {
      const configStr = form.getValues("config");
      const config = JSON.parse(configStr);
      return Array.isArray(config.items) ? config.items : [];
    } catch {
      return [];
    }
  };

  const updateItems = (items: PriorityQaItem[]) => updateField("items", items);

  // Parse and sanitize the config once when this editor mounts (i.e. whenever the tool
  // type switches to Priority_QA), mirroring the original parsePriorityQaConfig effect
  // that ran on `toolType` change in the monolith.
  useEffect(() => {
    try {
      const configStr = form.getValues("config");
      try {
        const parsedConfig = configPriorityQaStr || JSON.parse(configStr);
        const config = normalizePriorityQaConfig(parsedConfig);
        setConfigPriorityQaStr(config);
        form.setValue("config", JSON.stringify(config, null, 2));
      } catch (e) {
        const defaultConfig: PriorityQaToolConfig = { items: [{ question: "", answer: "", links: [] }] };
        setConfigPriorityQaStr(defaultConfig);
        form.setValue("config", JSON.stringify(defaultConfig, null, 2));
      }
    } catch (e) {
      console.error("Error initializing Priority Q&A config:", e);
    }
    // Intentionally runs only on mount - matches the original effect's practical behavior
    // of firing once per toolType change into "Priority_QA".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="space-y-2 border-t pt-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium">Priority Q&amp;A Configuration</h3>
            <p className="text-sm text-muted-foreground mt-1">
              This tool is consulted before any other connected tool or knowledge source.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const items = getItems();
              updateItems([...items, { question: "", answer: "", links: [] }]);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>

        <div className="space-y-4 mt-2">
          {getItems().map((item: any, idx: number) => (
            <div key={idx} className="border rounded-md p-4 space-y-3 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Item {idx + 1}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const items = getItems();
                    updateItems(items.filter((_: any, i: number) => i !== idx));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-xs">Question <span className="text-red-500">*</span></FormLabel>
                <Input
                  value={item.question || ""}
                  onChange={(e) => {
                    const items = [...getItems()];
                    items[idx] = { ...items[idx], question: e.target.value };
                    updateItems(items);
                  }}
                  placeholder="e.g., What are your office hours?"
                />
              </div>

              <div className="space-y-2">
                <FormLabel className="text-xs">Answer <span className="text-red-500">*</span></FormLabel>
                <Textarea
                  value={item.answer || ""}
                  onChange={(e) => {
                    const items = [...getItems()];
                    items[idx] = { ...items[idx], answer: e.target.value };
                    updateItems(items);
                  }}
                  placeholder="e.g., Monday to Friday, 9am to 5pm."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <FormLabel className="text-xs">Links (optional)</FormLabel>
                <div className="space-y-2">
                  {(item.links || []).map((link: string, linkIdx: number) => (
                    <div key={linkIdx} className="flex items-center gap-2">
                      <Input
                        value={link}
                        onChange={(e) => {
                          const items = [...getItems()];
                          const links = [...(items[idx].links || [])];
                          links[linkIdx] = e.target.value;
                          items[idx] = { ...items[idx], links };
                          updateItems(items);
                        }}
                        placeholder="https://example.com"
                        type="url"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const items = [...getItems()];
                          const links = (items[idx].links || []).filter((_: string, i: number) => i !== linkIdx);
                          items[idx] = { ...items[idx], links };
                          updateItems(items);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const items = [...getItems()];
                      items[idx] = { ...items[idx], links: [...(items[idx].links || []), ""] };
                      updateItems(items);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Link
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {getItems().length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
              No Q&amp;A items yet. Click "Add Item" to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
