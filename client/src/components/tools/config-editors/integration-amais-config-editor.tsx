import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { IntegrationAmaisToolConfig } from "../tool-form.types";

interface IntegrationAmaisConfigEditorProps {
  form: UseFormReturn<any>;
}

/**
 * Config editor for the Integration_Amais tool type: two boolean switches.
 *
 * Uses its own useJsonConfigField instance rather than sharing MCP's accessor - in the
 * pre-refactor monolith, Integration_Amais incidentally reused MCP's generic
 * getMcpConfigField/updateMcpConfigField purely because both configs are flat
 * key-value objects, not because of any real MCP-specific behavior. Giving it its own
 * accessor here avoids stranding it once MCP's block lives in its own file.
 */
export default function IntegrationAmaisConfigEditor({ form }: IntegrationAmaisConfigEditorProps) {
  const [configIntegrationAmaisStr, setConfigIntegrationAmaisStr] = useState<IntegrationAmaisToolConfig | null>(null);

  const { getField, updateField } = useJsonConfigField(form, {
    onSaved: (config) => setConfigIntegrationAmaisStr(config),
  });

  // Parse and sanitize the config once when this editor mounts - i.e. whenever the tool
  // type switches to Integration_Amais - mirroring the original parseIntegrationAmaisConfig
  // effect that ran on `toolType` change in the monolith.
  useEffect(() => {
    try {
      const configStr = form.getValues("config");
      const config: IntegrationAmaisToolConfig = {
        isVoiceEnabled: false,
        areSkillsEnabled: false,
      };
      try {
        const parsedConfig = configIntegrationAmaisStr || JSON.parse(configStr);
        config.isVoiceEnabled = typeof parsedConfig.isVoiceEnabled === "boolean" ? parsedConfig.isVoiceEnabled : false;
        config.areSkillsEnabled = typeof parsedConfig.areSkillsEnabled === "boolean" ? parsedConfig.areSkillsEnabled : false;
        setConfigIntegrationAmaisStr(config);
        form.setValue("config", JSON.stringify(config, null, 2));
      } catch (e) {
        const defaultConfig: IntegrationAmaisToolConfig = { isVoiceEnabled: false, areSkillsEnabled: false };
        setConfigIntegrationAmaisStr(defaultConfig);
        form.setValue("config", JSON.stringify(defaultConfig, null, 2));
      }
    } catch (e) {
      console.error("Error initializing Integration Amais config:", e);
    }
    // Intentionally runs only on mount (i.e. on every switch into this tool type) -
    // matches the original effect's practical behavior of firing once per toolType
    // change into "Integration_Amais".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {/* Integration Amais Configuration section */}
      <div className="space-y-2 border-t pt-4 mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Integration Amais Configuration</h3>
        </div>

        {/* Is Voice Enabled */}
        <div className="space-y-2">
          <FormLabel>Is Voice Enabled</FormLabel>
          <div className="flex items-center space-x-2">
            <Switch
              checked={getField("isVoiceEnabled", false)}
              onCheckedChange={(checked) => {
                updateField("isVoiceEnabled", checked);
              }}
            />
            <span className="text-sm text-muted-foreground">
              {getField("isVoiceEnabled", false) ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        {/* Are Skill Enabled */}
        <div className="space-y-2">
          <FormLabel>Are Skill Enabled</FormLabel>
          <div className="flex items-center space-x-2">
            <Switch
              checked={getField("areSkillsEnabled", false)}
              onCheckedChange={(checked) => updateField("areSkillsEnabled", checked)}
            />
            <span className="text-sm text-muted-foreground">
              {getField("areSkillsEnabled", false) ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
