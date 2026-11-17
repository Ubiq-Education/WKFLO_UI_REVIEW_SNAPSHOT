import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Check, Loader2, PlayCircle, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getTenantHeaders } from "@/lib/tenant-config";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { ApiTestResponse, HttpToolConfig } from "../tool-form.types";

interface HttpConfigEditorProps {
  form: UseFormReturn<any>;
  /** Shared with the rest of the form via useVariableSuggestions in the orchestrator -
   * not re-invoked here, to avoid double-mounting the secrets query and the global {{
   * keyup listener. */
  showAvailableVariables: () => void;
}

/**
 * Config editor for the HTTP tool type - the largest and most stateful editor: dynamic
 * "Inputs" list (add/reorder/edit/remove) plus a Structured/Test API tabbed config
 * (Method/URL/Headers/Parameters/Body vs. per-input test values + Run + response viewer).
 *
 * `configInitialized` is now fully private to this editor. In the original monolith it
 * was shared across all 8 tool types' parse*Config functions but only ever read here (by
 * the test-inputs-priming effect below); every other type setting it was incidental
 * cross-contamination with no purpose of its own, so scoping it to HTTP-only is an
 * intentional behavioral decision made during this refactor (see ADO #6433 plan), not a
 * silent side effect.
 */
export default function HttpConfigEditor({ form, showAvailableVariables }: HttpConfigEditorProps) {
  const { toast } = useToast();

  const [apiResponse, setApiResponse] = useState<ApiTestResponse | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [configTab, setConfigTab] = useState("structured");
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [configInitialized, setConfigInitialized] = useState(false);
  const [showInputSettings, setShowInputSettings] = useState(false);
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const [configHttpStr, setConfigHttpStr] = useState<HttpToolConfig | null>(null);

  // Helper to get/update HTTP config fields for structured editing. Uses the generalized
  // useJsonConfigField hook; "headers"/"parameters"/"inputs"/"parameterConfig" always read
  // back as an object (falling back on falsy, not just undefined), matching the original
  // inline getHttpConfigField behavior.
  const { getField: getHttpConfigField, updateField: updateHttpConfigField } = useJsonConfigField(form, {
    emptyObjectFallbackFields: ["headers", "parameters", "inputs", "parameterConfig"],
    onBeforeSave: (config, fieldName, value) => {
      // Generic URL parameter handling
      if (fieldName === 'parameters') {
        // Check if any parameter value references a URL variable
        Object.entries(value).forEach(([key, paramValue]) => {
          if (typeof paramValue === 'string' && paramValue.includes('{{url}}')) {
            // Make sure url input exists with proper configuration
            if (!config.inputs) config.inputs = {};
            if (!config.inputs['url']) {
              config.inputs['url'] = {
                name: 'URL',
                description: 'Web URL or profile link',
                type: 'string',
                required: false,
                value: '',
                defaultValue: '',
                hasDefaultValue: false
              };
            }
          }
        });
      }
    },
    onSaved: (config) => setConfigHttpStr(config),
  });

  // Parse and sanitize the config once when this editor mounts (i.e. whenever the tool
  // type switches to HTTP), mirroring the original parseHttpConfig effect that ran on
  // `toolType` change in the monolith.
  useEffect(() => {
    try {
      // Try to ensure config is a valid JSON object for HTTP tools
      const configStr = form.getValues("config");

      const config: HttpToolConfig = {
        method: "GET",
        url: "",
        headers: {},
        parameters: {},
        urlParams: {},
        body: "",
        parameterConfig: {},
        inputs: {},
      };

      // If we have a valid config, make sure required fields are present
      try {
        const parsedConfig = configHttpStr || JSON.parse(configStr);

        config.headers = !parsedConfig.headers || typeof parsedConfig.headers !== 'object'
          ? { "Content-Type": "application/json" }
          : parsedConfig.headers;

        config.parameters = !parsedConfig.parameters || typeof parsedConfig.parameters !== 'object' ? {} : parsedConfig.parameters;

        config.urlParams = !parsedConfig.urlParams || typeof parsedConfig.urlParams !== 'object' ? {} : parsedConfig.urlParams;

        config.parameterConfig = !parsedConfig.parameterConfig || typeof parsedConfig.parameterConfig !== 'object'
          ? {}
          : parsedConfig.parameterConfig;

        config.inputs = !parsedConfig.inputs || typeof parsedConfig.inputs !== 'object' ? {} : parsedConfig.inputs;

        config.method = !parsedConfig.method ? "GET" : parsedConfig.method;
        config.url = !parsedConfig.url ? "" : parsedConfig.url;

        setConfigHttpStr(config);
        // Update the config with the sanitized version
        form.setValue("config", JSON.stringify(config, null, 2));
        setConfigInitialized(true);
      } catch (e) {
        // If parsing failed, initialize with default structure
        const defaultConfig: HttpToolConfig = {
          method: "GET",
          url: "",
          headers: { "Content-Type": "application/json" },
          parameters: {},
          urlParams: {},
          body: "",
          parameterConfig: {},
          inputs: {},
        };
        setConfigHttpStr(defaultConfig);
        form.setValue("config", JSON.stringify(defaultConfig, null, 2));
        setConfigInitialized(true);
      }
    } catch (e) {
      console.error("Error initializing config:", e);
    }
    // Intentionally runs only on mount - matches the original effect's practical behavior
    // of firing once per toolType change into "HTTP".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize test inputs with default values
  useEffect(() => {
    if (configInitialized) {
      try {
        const configStr = form.getValues("config");
        const config = JSON.parse(configStr);
        if (config.inputs) {
          const initialInputs: Record<string, string> = {};
          Object.entries(config.inputs).forEach(([key, val]) => {
            const input = val as any;
            if (input && input.defaultValue) {
              initialInputs[key] = input.defaultValue;
            }
          });
          setTestInputs(initialInputs);
        }
      } catch (e) {
        console.error("Error initializing test inputs:", e);
      }
    }
  }, [configInitialized, form]);

  // Test API when the tool is HTTP
  const handleTestApiCall = (useTestInputs = false) => {
    return (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      testApi(useTestInputs);
    };
  };

  const testApi = async (useTestInputs = false): Promise<void> => {
    setIsTestingApi(true);
    setApiResponse(null);

    try {
      const configStr = form.getValues("config");
      const config = JSON.parse(configStr);

      // Clone the config so we don't modify the original
      const testConfig = JSON.parse(JSON.stringify(config));

      // If using test inputs from the Test API tab, override the input values
      if (useTestInputs) {
        if (testConfig.inputs) {
          // Update input values with values from test form
          Object.entries(testConfig.inputs).forEach(([key, inputConfig]) => {
            const config = inputConfig as any;

            // If there's a test input value, use it
            if (testInputs[key] && testInputs[key].trim() !== '') {
              config.value = testInputs[key];
            }
            // Otherwise, only use default if hasDefaultValue is true
            else {
              // Clear the value field first
              config.value = '';

              // If a default value exists and is marked to be used (hasDefaultValue),
              // then copy the default value to the value field
              if (config.hasDefaultValue && config.defaultValue && config.defaultValue.trim() !== '') {
                config.value = config.defaultValue;
              }
            }
          });
        }
      }

      // Prepare the test API call data
      const testData = {
        method: testConfig.method,
        url: testConfig.url,
        headers: testConfig.headers || {},
        parameters: testConfig.parameters || {},
        urlParams: testConfig.urlParams || {},
        body: testConfig.body || "",
        inputs: testConfig.inputs || {},
      };

      // Make the test API call to the server endpoint that will proxy it
      const response = await fetch("/md/api/v1/test-tool", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getTenantHeaders(),
        },
        body: JSON.stringify(testData),
      });

      const result = await response.json();

      // Properly handle the status code - use the nested API response status
      // The status from 'response' is just our proxy endpoint status, not the actual API call
      setApiResponse({
        ...result,
        success: result.status >= 200 && result.status < 300, // Determine success based on actual API status code
        status: result.status, // Use the status code from the actual API call, not our proxy
        // If it's a successful response but doesn't have data, add it
        data: result.data || result
      });
    } catch (e) {
      console.error("Error testing API:", e);
      setApiResponse({
        success: false,
        error: e instanceof Error ? e.message : "Unknown error occurred",
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  // Add a new input field to the tool
  const addInput = () => {
    try {
      const inputs = {...getHttpConfigField("inputs", {})};
      const inputId = `input_${Date.now()}`;

      inputs[inputId] = {
        name: "New Input",
        description: "Description of this input",
        type: "string",
        required: true,
        value: "",
        defaultValue: "",
        hasDefaultValue: false
      };

      updateHttpConfigField("inputs", inputs);
      setSelectedInput(inputId);
      setShowInputSettings(true);
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to add input. Please check the JSON format.",
        variant: "destructive"
      });
    }
  };

  // Remove an input field
  const removeInput = (inputId: string) => {
    try {
      const inputs = {...getHttpConfigField("inputs", {})};
      delete inputs[inputId];
      updateHttpConfigField("inputs", inputs);

      if (selectedInput === inputId) {
        setSelectedInput(null);
        setShowInputSettings(false);
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to remove input. Please check the JSON format.",
        variant: "destructive"
      });
    }
  };

  // Update an input field property
  const updateInput = (inputId: string, property: string, value: any) => {
    try {
      const inputs = {...getHttpConfigField("inputs", {})};
      if (!inputs[inputId]) {
        inputs[inputId] = {};
      }
      inputs[inputId][property] = value;
      updateHttpConfigField("inputs", inputs);
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to update input. Please check the JSON format.",
        variant: "destructive"
      });
    }
  };

  // Update input variable name (the key in the inputs object)
  const updateInputKey = (oldKey: string, newKey: string) => {
    try {
      if (oldKey === newKey) return;

      const inputs = {...getHttpConfigField("inputs", {})};
      const inputData = inputs[oldKey];
      delete inputs[oldKey];

      // Generate a safe key based on the input name
      const safeKey = newKey.toLowerCase().replace(/\s+/g, '_');
      inputs[safeKey] = inputData;

      updateHttpConfigField("inputs", inputs);

      if (selectedInput === oldKey) {
        setSelectedInput(safeKey);
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to update input key. Please check the JSON format.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
      {/* Inputs section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-medium">Inputs</h3>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addInput}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Input
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          What your agent should pass into this tool, or what you need to set when adding this tool to an agent.
        </p>

        <div className="bg-gray-50 p-3 rounded-md text-sm text-muted-foreground">
          <p>Access these in your tool steps by wrapping the variable in brackets - e.g. &#123;&#123;name&#125;&#125;</p>
        </div>

        <div className="space-y-3 mt-4">
          {Object.entries(getHttpConfigField("inputs", {})).map(([inputId, inputConfig]: [string, any], index) => (
            // Keyed by list position, not by `inputId`: the "Variable Name" field below
            // renames this input's underlying object key on every keystroke (via
            // updateInputKey), so keying by `inputId` made React tear down and remount
            // this entire row (losing input focus) after every single character typed.
            // Position is stable across rename/add/remove/reorder, so keying by `index`
            // keeps the same DOM node - and focus - across a rename. Pre-existing bug,
            // unchanged since before the ADO #6433 refactor; fixed here as a drive-by
            // since this file already owns the code.
            <div key={index} className="border rounded-md p-4 bg-white">
              <div className="flex items-start">
                <div className="flex flex-col space-y-1 mr-3 self-center">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                      const inputs = {...getHttpConfigField("inputs", {})};
                      const inputsArray = Object.entries(inputs);

                      if (index > 0) {
                        // Swap with the input above
                        const newInputsArray = [...inputsArray];
                        [newInputsArray[index], newInputsArray[index - 1]] = [newInputsArray[index - 1], newInputsArray[index]];
                        const reorderedInputs = Object.fromEntries(newInputsArray);
                        updateHttpConfigField("inputs", reorderedInputs);
                      }
                    }}
                    aria-label={`Move ${inputConfig.name || "input"} up`}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                      const inputs = {...getHttpConfigField("inputs", {})};
                      const inputsArray = Object.entries(inputs);

                      if (index < inputsArray.length - 1) {
                        // Swap with the input below
                        const newInputsArray = [...inputsArray];
                        [newInputsArray[index], newInputsArray[index + 1]] = [newInputsArray[index + 1], newInputsArray[index]];
                        const reorderedInputs = Object.fromEntries(newInputsArray);
                        updateHttpConfigField("inputs", reorderedInputs);
                      }
                    }}
                    aria-label={`Move ${inputConfig.name || "input"} down`}
                    disabled={index === Object.entries(getHttpConfigField("inputs", {})).length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-medium">{inputConfig.name || "Unnamed Input"}</h4>
                      <Badge variant="outline" className="text-xs">
                        {inputConfig.type || "string"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {inputConfig.description || "No description"}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedInput(inputId);
                        setShowInputSettings(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeInput(inputId)}
                      aria-label={`Remove input ${inputConfig.name || inputId}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {selectedInput === inputId && showInputSettings && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <FormLabel className="text-xs">Input Name</FormLabel>
                      <Input
                        value={inputConfig.name || ""}
                        onChange={(e) => updateInput(inputId, "name", e.target.value)}
                        placeholder="e.g., Name, URL, Query"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel className="text-xs">Variable Name</FormLabel>
                      <Input
                        value={inputId.replace(/^input_\d+_?/, "")}
                        onChange={(e) => updateInputKey(inputId, e.target.value)}
                        placeholder="e.g., name, url, query"
                      />
                      <p className="text-xs text-muted-foreground">
                        This is used in parameter mapping
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <FormLabel className="text-xs">Description</FormLabel>
                    <Input
                      value={inputConfig.description || ""}
                      onChange={(e) => updateInput(inputId, "description", e.target.value)}
                      placeholder="Description of what this input is for"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <FormLabel className="text-xs">Type</FormLabel>
                      <Select
                        value={inputConfig.type || "string"}
                        onValueChange={(val) => updateInput(inputId, "type", val)}
                      >
                        <SelectTrigger aria-label="Input type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                          <SelectItem value="array">Array</SelectItem>
                          <SelectItem value="object">Object</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <FormLabel className="text-xs">Required</FormLabel>
                      <div className="flex items-center space-x-2 h-10">
                        <Switch
                          checked={inputConfig.required === true}
                          aria-label="Input required"
                          onCheckedChange={(checked) => updateInput(inputId, "required", checked)}
                        />
                        <span className="text-sm">
                          {inputConfig.required ? "Required" : "Optional"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <FormLabel className="text-xs">Input Value</FormLabel>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-muted-foreground">Set as default</span>
                        <Switch
                          checked={inputConfig.hasDefaultValue === true}
                          aria-label={`Set ${inputConfig.name || "input"} as default`}
                          onCheckedChange={(checked) => {
                            updateInput(inputId, "hasDefaultValue", checked);
                            // If turning on default value, copy current value to defaultValue
                            if (checked) {
                              updateInput(inputId, "defaultValue", inputConfig.value || "");
                            }
                          }}
                        />
                      </div>
                    </div>
                    <Input
                      value={inputConfig.value || ""}
                      onChange={(e) => {
                        updateInput(inputId, "value", e.target.value);
                        // If default value is enabled, update defaultValue as well
                        if (inputConfig.hasDefaultValue === true) {
                          updateInput(inputId, "defaultValue", e.target.value);
                        }
                      }}
                      placeholder="Enter value for this input"
                    />
                    {inputConfig.hasDefaultValue && (
                      <p className="text-xs text-muted-foreground mt-1">
                        This value will be used as the default when not specified
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowInputSettings(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* API Configuration section */}
      <div className="space-y-2 border-t pt-4 mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">API Configuration</h3>
        </div>

        <Tabs defaultValue="structured" onValueChange={setConfigTab}>
          <TabsList className="mb-2">
            <TabsTrigger value="structured">Structured</TabsTrigger>
            <TabsTrigger value="test">Test API</TabsTrigger>
          </TabsList>

          <TabsContent value="test" className="space-y-4">
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold mb-2">{form.watch("name")} {form.watch("type") === "HTTP" ? "API Call" : "Tool"}</h3>
                <p className="text-muted-foreground">{form.watch("description")}</p>
              </div>

              {Object.entries(getHttpConfigField("inputs", {})).map(([inputId, config]) => {
                const inputConfig = config as any;
                if (!inputConfig) return null;

                // Required indicator
                const isRequired = inputConfig.required === true;

                return (
                  <div key={inputId} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">
                        {inputConfig.name || inputId.replace(/^input_\d+_/, '')}
                        {isRequired && <span className="text-red-500 ml-1">*</span>}
                      </label>
                    </div>
                    {inputConfig.description && (
                      <p className="text-xs text-muted-foreground">
                        {inputConfig.description}
                      </p>
                    )}
                    <Input
                      placeholder={`Enter ${inputConfig.name || inputId.replace(/^input_\d+_/, '')}`}
                      value={testInputs[inputId] || ''}
                      onChange={(e) => {
                        setTestInputs(prev => ({
                          ...prev,
                          [inputId]: e.target.value
                        }));
                      }}
                    />
                  </div>
                );
              })}

              <Button
                type="button"
                onClick={handleTestApiCall(true)}
                disabled={isTestingApi}
                className="w-full"
              >
                {isTestingApi ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Run tool
                  </>
                )}
              </Button>

              {apiResponse && (
                <div className="mt-4 space-y-4">
                  <Tabs defaultValue="response_body">
                    <TabsList>
                      <TabsTrigger value="response_body">Tool Output</TabsTrigger>
                      <TabsTrigger value="status">Status</TabsTrigger>
                    </TabsList>
                    <TabsContent value="response_body" className="pt-4">
                      <pre className="bg-muted p-4 rounded-md overflow-auto text-sm h-64">
                        {JSON.stringify(apiResponse, null, 2)}
                      </pre>
                      <div className="flex justify-end mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(apiResponse.data, null, 2))
                              .then(() => toast({ title: "Copied to clipboard" }));
                          }}
                        >
                          <span className="mr-1">Formatted</span>
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </TabsContent>
                    <TabsContent value="status" className="pt-4">
                      <div className="bg-muted p-4 rounded-md">
                        <div className="flex justify-between border-b pb-2 mb-2">
                          <span className="font-medium">Status Code</span>
                          <span className={`font-semibold ${(apiResponse.status ?? 0) >= 200 && (apiResponse.status ?? 0) < 300 ? 'text-green-600' : 'text-red-600'}`}>
                            {apiResponse.status ?? 'N/A'}
                          </span>
                        </div>
                        {apiResponse.duration && (
                          <div className="flex justify-between border-b pb-2 mb-2">
                            <span className="font-medium">Response Time</span>
                            <span>{apiResponse.duration}ms</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="font-medium">Success</span>
                          <span className={apiResponse.success ? 'text-green-600' : 'text-red-600'}>
                            {apiResponse.success ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="structured" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* HTTP Method */}
              <div className="space-y-2">
                <FormLabel>HTTP Method</FormLabel>
                <Select
                  value={getHttpConfigField("method", "GET")}
                  onValueChange={(val) => updateHttpConfigField("method", val)}
                >
                  <SelectTrigger aria-label="HTTP method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* URL */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <FormLabel>API URL</FormLabel>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 p-1"
                    aria-label="Show available variables"
                    onClick={() => {
                      // Show variables that can be used in this field
                      showAvailableVariables();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                    </svg>
                  </Button>
                </div>
                <Input
                  value={getHttpConfigField("url", "")}
                  onChange={(e) => {
                    updateHttpConfigField("url", e.target.value);
                  }}
                  data-field="url"
                  placeholder="https://md/api.example.com/data"
                />
              </div>
            </div>

            {/* Headers */}
            <div className="space-y-2">
              <FormLabel>Headers</FormLabel>
              <div className="space-y-3 border p-3 rounded-md">
                {Object.entries(getHttpConfigField("headers", {})).map(([key, value], index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <Input
                        value={key}
                        onChange={(e) => {
                          const headers = {...getHttpConfigField("headers", {})};
                          const entries = Object.entries(headers);

                          // Update the key at this position
                          entries[index] = [e.target.value, entries[index][1]];

                          // Rebuild object from modified entries
                          const newHeaders = Object.fromEntries(entries);
                          updateHttpConfigField("headers", newHeaders);
                        }}
                        placeholder="Header name"
                      />
                      <Input
                        value={value as string}
                        onChange={(e) => {
                          const headers = {...getHttpConfigField("headers", {})};
                          headers[key] = e.target.value;
                          updateHttpConfigField("headers", headers);
                        }}
                        placeholder="Header value"
                        className="col-span-2"
                        data-header-key={key}
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove header ${key}`}
                      onClick={() => {
                        const headers = {...getHttpConfigField("headers", {})};
                        delete headers[key];
                        updateHttpConfigField("headers", headers);
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
                    const headers = {...getHttpConfigField("headers", {})};
                    headers[`header_${Object.keys(headers).length + 1}`] = "";
                    updateHttpConfigField("headers", headers);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Header
                </Button>
              </div>
            </div>

            {/* Parameters */}
            <div className="space-y-2">
              <FormLabel>Parameters</FormLabel>
              <div className="space-y-3 border p-3 rounded-md">
                {Object.entries(getHttpConfigField("parameters", {})).map(([key, value], index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <Input
                        value={key}
                        onChange={(e) => {
                          const params = {...getHttpConfigField("parameters", {})};
                          const entries = Object.entries(params);

                          // Update the key at this position
                          entries[index] = [e.target.value, entries[index][1]];

                          // Rebuild object from modified entries
                          const newParams = Object.fromEntries(entries);
                          updateHttpConfigField("parameters", newParams);
                        }}
                        placeholder="Parameter name"
                      />
                      <Input
                        value={value as string}
                        onChange={(e) => {
                          const params = {...getHttpConfigField("parameters", {})};
                          params[key] = e.target.value;

                          // Also update any corresponding parameterConfig if it exists
                          const paramConfig = {...getHttpConfigField("parameterConfig", {})};
                          if (paramConfig[key]) {
                            updateHttpConfigField("parameterConfig", paramConfig);
                          }

                          updateHttpConfigField("parameters", params);
                        }}
                        placeholder="Parameter value or {{input}}"
                        className="col-span-2"
                        data-param-key={key}
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove parameter ${key}`}
                      onClick={() => {
                        const params = {...getHttpConfigField("parameters", {})};
                        delete params[key];
                        updateHttpConfigField("parameters", params);
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
                    const params = {...getHttpConfigField("parameters", {})};
                    params[`param_${Object.keys(params).length + 1}`] = "";
                    updateHttpConfigField("parameters", params);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Parameter
                </Button>
              </div>
            </div>

            {/* Request Body (only for POST, PUT, PATCH) */}
            {["POST", "PUT", "PATCH"].includes(getHttpConfigField("method", "GET")) && (
              <div className="space-y-2">
                <FormLabel>Request Body</FormLabel>
                <Textarea
                  value={getHttpConfigField("body", "")}
                  onChange={(e) => updateHttpConfigField("body", e.target.value)}
                  placeholder="Enter JSON or string body"
                  className="min-h-[150px] font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  You can use variable substitution with &#123;&#123;input_name&#125;&#125; to use inputs.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
