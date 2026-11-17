import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { ImageGenerationToolConfig } from "../tool-form.types";

interface ImageGenerationConfigEditorProps {
  form: UseFormReturn<any>;
}

// Radix Select items can't use "" as a value, so "Auto" uses a sentinel that is
// mapped to/from the stored empty-string aspectRatio.
const AUTO_ASPECT_RATIO = "auto";

const DEFAULT_IMAGE_GENERATION_CONFIG: ImageGenerationToolConfig = {
  provider: "azure",
  apiKey: "",
  endpoint: "",
  deploymentName: "",
  apiVersion: "2025-04-01-preview",
  model: "",
  quality: "high",
  aspectRatio: "",
};

/** Config editor for the Image_Generation tool type: provider-conditional fields. */
export default function ImageGenerationConfigEditor({ form }: ImageGenerationConfigEditorProps) {
  const [configImageGenerationStr, setConfigImageGenerationStr] = useState<ImageGenerationToolConfig | null>(null);

  // "provider" changing resets "model" and "aspectRatio" - the two providers offer different model
  // catalogs, matching the original inline behavior.
  const { getField, updateField } = useJsonConfigField(form, {
    onBeforeSave: (config, fieldName) => {
      if (fieldName === "provider") {
        config.model = "";
        config.aspectRatio = "";
      }
    },
    onSaved: (config) => setConfigImageGenerationStr(config),
  });

  // Parse and sanitize the config once when this editor mounts (i.e. whenever the tool
  // type switches to Image_Generation), mirroring the original
  // parseImageGenerationConfig effect that ran on `toolType` change in the monolith.
  useEffect(() => {
    try {
      const configStr = form.getValues("config");
      try {
        const parsedConfig = configImageGenerationStr || JSON.parse(configStr);
        const config: ImageGenerationToolConfig = {
          provider: parsedConfig.provider ?? "azure",
          apiKey: parsedConfig.apiKey ?? "",
          endpoint: parsedConfig.endpoint ?? "",
          deploymentName: parsedConfig.deploymentName ?? "",
          apiVersion: parsedConfig.apiVersion ?? "2025-04-01-preview",
          model: parsedConfig.model ?? "",
          quality: parsedConfig.quality ?? "high",
          aspectRatio: parsedConfig.aspectRatio ?? "",
        };
        setConfigImageGenerationStr(config);
        form.setValue("config", JSON.stringify(config, null, 2));
      } catch (e) {
        setConfigImageGenerationStr(DEFAULT_IMAGE_GENERATION_CONFIG);
        form.setValue("config", JSON.stringify(DEFAULT_IMAGE_GENERATION_CONFIG, null, 2));
      }
    } catch (e) {
      console.error("Error initializing Image Generation config:", e);
    }
    // Intentionally runs only on mount - matches the original effect's practical behavior
    // of firing once per toolType change into "Image_Generation".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="space-y-4 border-t pt-4 mt-4">
        <h3 className="text-base font-medium">Image to Image Configuration</h3>

        {/* Provider */}
        <div className="space-y-2">
          <FormLabel>Provider <span className="text-red-500">*</span></FormLabel>
          <Select
            value={getField("provider", "azure")}
            onValueChange={(value) => updateField("provider", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="azure">Azure OpenAI</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <FormLabel>API Key <span className="text-red-500">*</span></FormLabel>
          <Input
            type="password"
            value={getField("apiKey", "")}
            onChange={(e) => updateField("apiKey", e.target.value)}
            placeholder="Enter API key"
          />
        </div>

        {/* Azure-only fields */}
        {getField("provider", "azure") === "azure" && (
          <>
            <div className="space-y-2">
              <FormLabel>Endpoint <span className="text-red-500">*</span></FormLabel>
              <Input
                value={getField("endpoint", "")}
                onChange={(e) => updateField("endpoint", e.target.value)}
                placeholder="e.g., https://my-resource.openai.azure.com"
              />
            </div>

            <div className="space-y-2">
              <FormLabel>Deployment Name <span className="text-red-500">*</span></FormLabel>
              <Input
                value={getField("deploymentName", "")}
                onChange={(e) => updateField("deploymentName", e.target.value)}
                placeholder="e.g., gpt-image-2"
              />
            </div>

            <div className="space-y-2">
              <FormLabel>API Version</FormLabel>
              <Input
                value={getField("apiVersion", "2025-04-01-preview")}
                onChange={(e) => updateField("apiVersion", e.target.value)}
                placeholder="2025-04-01-preview"
              />
            </div>

            <div className="space-y-2">
              <FormLabel>Model (optional override)</FormLabel>
              <Input
                value={getField("model", "")}
                onChange={(e) => updateField("model", e.target.value)}
                placeholder="e.g., gpt-image-2"
              />
            </div>

            <div className="space-y-2">
              <FormLabel>Quality</FormLabel>
              <Select
                value={getField("quality", "high")}
                onValueChange={(value) => updateField("quality", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Google-only fields */}
        {getField("provider", "azure") === "google" && (
          <>
            <div className="space-y-2">
              <FormLabel>Model <span className="text-red-500">*</span></FormLabel>
              <Input
                value={getField("model", "")}
                onChange={(e) => updateField("model", e.target.value)}
                placeholder="e.g., imagen-3.0-edit-v1"
              />
            </div>

            <div className="space-y-2">
              <FormLabel>Quality</FormLabel>
              <Select
                value={getField("quality", "high")}
                onValueChange={(value) => updateField("quality", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <FormLabel>Aspect Ratio</FormLabel>
              <Select
                value={getField("aspectRatio", "") || AUTO_ASPECT_RATIO}
                onValueChange={(value) =>
                  updateField("aspectRatio", value === AUTO_ASPECT_RATIO ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select aspect ratio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_ASPECT_RATIO}>Auto (match input image)</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="2:3">2:3</SelectItem>
                  <SelectItem value="3:2">3:2</SelectItem>
                  <SelectItem value="3:4">3:4</SelectItem>
                  <SelectItem value="4:3">4:3</SelectItem>
                  <SelectItem value="4:5">4:5</SelectItem>
                  <SelectItem value="5:4">5:4</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="21:9">21:9</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                With Auto, the output matches the input image's aspect ratio. Choose a fixed ratio to override it.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
