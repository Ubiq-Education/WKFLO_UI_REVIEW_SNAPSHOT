import { UseFormReturn } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";

export interface UseJsonConfigFieldOptions {
  /**
   * Field names that, on read, fall back to `defaultValue` when the parsed value is
   * falsy (not just `undefined`) - e.g. HTTP's "headers"/"parameters"/"inputs"/
   * "parameterConfig" always need to come back as an object, even if the stored config
   * has them set to `null` or omitted entirely. Fields not listed here use a plain
   * `!== undefined` check instead.
   */
  emptyObjectFallbackFields?: string[];
  /** Runs against the mutable parsed config, after `config[fieldName] = value` is
   * applied but before it's written back to the form - for field-specific side effects
   * on other keys of the same config object (e.g. resetting a dependent field). */
  onBeforeSave?: (config: any, fieldName: string, value: any) => void;
  /** Runs inside the debounce `setTimeout`, after the form value has settled - typically
   * used to refresh a per-tool-type raw-config cache `useState`. */
  onSaved?: (config: any) => void;
  /** Toast description shown when parsing/saving the config fails. */
  errorMessage?: string;
}

/**
 * Generalizes the "parse config JSON -> read/mutate one field -> stringify back into the
 * form -> defer local cache refresh" pattern repeated across tool-form's per-type config
 * editors (HTTP, MCP, Contact Form, Image Generation all had hand-written, structurally
 * identical copies of this before this extraction).
 *
 * Both `getField` and `updateField` always re-parse `form.getValues("config")` fresh -
 * they never read from a cached state value - matching the original inline
 * implementations exactly.
 */
export function useJsonConfigField(form: UseFormReturn<any>, options: UseJsonConfigFieldOptions = {}) {
  const { toast } = useToast();
  const { emptyObjectFallbackFields = [], onBeforeSave, onSaved, errorMessage } = options;

  const getField = (fieldName: string, defaultValue: any = "") => {
    const useEmptyObjectFallback = emptyObjectFallbackFields.includes(fieldName);
    try {
      const configStr = form.getValues("config");
      const config = JSON.parse(configStr);
      if (useEmptyObjectFallback) {
        return config[fieldName] || defaultValue;
      }
      return config[fieldName] !== undefined ? config[fieldName] : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };

  const updateField = (fieldName: string, value: any) => {
    try {
      const configStr = form.getValues("config");
      const config = JSON.parse(configStr);
      config[fieldName] = value;

      onBeforeSave?.(config, fieldName, value);

      // shouldDirty: an edit made through a config editor is an unsaved change (the edit page
      // holds Publish until it's saved).
      form.setValue("config", JSON.stringify(config, null, 2), { shouldDirty: true });

      // Defer the cache refresh + validation trigger to let form.setValue settle first,
      // matching the original setTimeout(..., 10) debounce-via-timeout pattern.
      setTimeout(() => {
        onSaved?.(config);
        form.trigger("config");
      }, 10);
    } catch (e) {
      toast({
        title: "Error",
        description: errorMessage ?? "Failed to update config. Please check the JSON format.",
        variant: "destructive"
      });
    }
  };

  return { getField, updateField };
}
