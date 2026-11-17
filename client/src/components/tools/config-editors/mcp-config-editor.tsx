import { useEffect, useState } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useJsonConfigField } from "../hooks/use-json-config-field";
import { McpConfigEditorProps, McpOAuthScope, McpToolConfig } from "../tool-form.types";
import McpOAuthConnectionPanel from "./mcp-oauth-connection-panel";
import McpFunctionsPanel from "./mcp-functions-panel";
import McpOAuthClientCredentialsFields from "./mcp-oauth-client-credentials-fields";
import {
  hasUnsavedClientCredentials,
  parseConfigObject,
  willDropSavedSecret,
} from "./mcp-oauth-client-credentials";

const TRANSPORT_TYPE_VALUES = ["Stdio", "Http"] as const;
const AUTH_TYPE_VALUES = ["None", "OAuth2"] as const;
/** Task 7152: see `McpOAuthScope`'s doc comment in tool-form.types.ts. */
const OAUTH_SCOPE_VALUES: readonly McpOAuthScope[] = ["Shared", "PerUser"];

const SAVE_BEFORE_CONNECTING =
  "Save the tool before connecting so the new endpoint, client credentials and scopes are used.";

/**
 * US 7849: keeps a new client secret and a pending clear mutually exclusive, and never stores a
 * blank secret in the form (blank means "keep the saved secret" to the backend).
 */
function keepClientSecretWritesExclusive(config: any, fieldName: string, value: any) {
  if (fieldName === "clientSecret") {
    // Whitespace-only counts as empty, so it never cancels a pending Clear.
    if (typeof value !== "string" || value.trim() === "") delete config.clientSecret;
    else delete config.clearClientSecret;
  } else if (fieldName === "clearClientSecret") {
    if (value === true) delete config.clientSecret;
    else delete config.clearClientSecret;
  }
}

/**
 * Normalizes a stored enum-like field to one of `values`, tolerating both the intended string
 * format (exact or case-insensitive match) and the legacy JSON-integer format a backend
 * enum-serialization bug briefly wrote into some rows (see PLAN.md) - `values[0]` is what a
 * stored `0` means, `values[1]` is what a stored `1` means, and so on, matching C#'s default
 * enum-to-int ordinal mapping. Falls back to `values[0]` (the original default) for anything
 * else, including `undefined`/`null`/garbage - so already-corrupted rows self-heal the next
 * time someone opens them for editing, without a manual DB edit.
 */
function normalizeEnumField<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value === "string") {
    const stringMatch = values.find((v) => v.toLowerCase() === value.trim().toLowerCase());
    if (stringMatch) return stringMatch;

    const asIndex = Number(value);
    if (Number.isInteger(asIndex) && values[asIndex] !== undefined) {
      return values[asIndex];
    }
  } else if (typeof value === "number" && Number.isInteger(value) && values[value] !== undefined) {
    return values[value];
  }
  return values[0];
}

/**
 * Config editor for the MCP tool type: server id/transport/stdio/http fields, plus (WI 7097)
 * an Auth Type selector and, for OAuth2, a Connection panel to authorize the tool against the
 * MCP server (e.g. Humantic.ai).
 *
 * This accessor is MCP-only - Integration_Amais has its own IntegrationAmaisConfigEditor
 * with its own useJsonConfigField instance (resolved during that editor's extraction, see
 * config-editors/integration-amais-config-editor.tsx) rather than importing from here.
 */
export default function McpConfigEditor({ form, mcpOAuthConnectionId, onRequestImmediateSave, isSaving, toolId, onFunctionsDirtyChange, connectionsReset = false }: McpConfigEditorProps) {
  const [configMcpStr, setConfigMcpStr] = useState<McpToolConfig | null>(null);
  const [visibleEnvVars, setVisibleEnvVars] = useState<Record<string, boolean>>({});
  const [visibleAdditionalHeaders, setVisibleAdditionalHeaders] = useState<Record<string, boolean>>({});

  const { getField, updateField } = useJsonConfigField(form, {
    onBeforeSave: keepClientSecretWritesExclusive,
    onSaved: (config) => setConfigMcpStr(config),
  });

  // US 7849: the tool's saved config (the form's baseline: the loaded tool, then whatever was
  // last saved) vs. the live one, to gate Connect on unsaved endpoint/credentials/scopes.
  // Whether a save reset existing connections is decided by the edit page when the save
  // succeeds (connectionsReset), never inferred here from the baseline moving: it also moves on
  // the initial load and on refetches, which say nothing about connections.
  const savedConfig = parseConfigObject(form.formState.defaultValues?.config);
  const currentConfig = parseConfigObject(form.getValues("config")) ?? {};
  const credentialsUnsaved = hasUnsavedClientCredentials(savedConfig, currentConfig);

  // Task 7857: the live checkbox value (saved or not), so the Functions panel reacts as soon as
  // "Manage permissions for this tool" is toggled.
  const permissionsEnabled = useWatch({ control: form.control, name: "permissionsEnabled" }) === true;

  // Parse and sanitize the config once when this editor mounts (i.e. whenever the tool
  // type switches to MCP), mirroring the original parseMcpConfig effect that ran on
  // `toolType` change in the monolith.
  useEffect(() => {
    try {
      const configStr = form.getValues("config");

      try {
        const parsedConfig = configMcpStr || JSON.parse(configStr);

        // Spread the parsed config FIRST, then normalize/default only the fields this editor
        // knows about on top of it - any other properties (e.g. redirectUri, or fields edited
        // elsewhere such as clientId/scopes/hasClientSecret) pass through untouched.
        // Rebuilding a brand-new object from only the known fields (the old behavior) silently
        // dropped those extra properties on every load+save round-trip, since UpdateTenantTool
        // wholesale-replaces Tool.Config with whatever the UI posts - see PLAN.md's Bug B.
        const config: McpToolConfig = {
          ...parsedConfig,
          id: !parsedConfig.id || typeof parsedConfig.id !== "string" ? "" : parsedConfig.id,
          transportType: normalizeEnumField(parsedConfig.transportType, TRANSPORT_TYPE_VALUES),
          command: !parsedConfig.command || typeof parsedConfig.command !== "string" ? "" : parsedConfig.command,
          arguments: !parsedConfig.arguments || !Array.isArray(parsedConfig.arguments) ? [] : parsedConfig.arguments,
          environmentVariables:
            !parsedConfig.environmentVariables || typeof parsedConfig.environmentVariables !== "object"
              ? {}
              : parsedConfig.environmentVariables,
          endpoint: !parsedConfig.endpoint || typeof parsedConfig.endpoint !== "string" ? "" : parsedConfig.endpoint,
          additionalHeaders:
            !parsedConfig.additionalHeaders || typeof parsedConfig.additionalHeaders !== "object"
              ? {}
              : parsedConfig.additionalHeaders,
          authType: normalizeEnumField(parsedConfig.authType, AUTH_TYPE_VALUES),
          oAuthScope: normalizeEnumField(parsedConfig.oAuthScope, OAUTH_SCOPE_VALUES),
        };

        setConfigMcpStr(config);
        form.setValue("config", JSON.stringify(config, null, 2));
      } catch (e) {
        const defaultConfig: McpToolConfig = {
          id: "",
          transportType: "Stdio",
          command: "",
          arguments: [],
          environmentVariables: {},
          endpoint: "",
          additionalHeaders: {},
          authType: "None",
          oAuthScope: "Shared",
        };
        setConfigMcpStr(defaultConfig);
        form.setValue("config", JSON.stringify(defaultConfig, null, 2));
      }
    } catch (e) {
      console.error("Error initializing MCP config:", e);
    }
    // Intentionally runs only on mount - matches the original effect's practical behavior
    // of firing once per toolType change into "MCP".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Normalize on every render (not just once in the mount effect above): Radix's <Select>
  // is a controlled component, and if its `value` prop doesn't match any <SelectItem> - as
  // happens for one render tick while a stored raw/legacy value hasn't been normalized into
  // the form yet - it can itself fire `onValueChange("")`, which our own handler then writes
  // back into the form, permanently corrupting the field before the mount effect's fix ever
  // lands. Normalizing here closes that window: the Select never sees an invalid value.
  const transportType = normalizeEnumField(getField("transportType", "Stdio"), TRANSPORT_TYPE_VALUES);
  const authType = normalizeEnumField(getField("authType", "None"), AUTH_TYPE_VALUES);
  const oauthScope = normalizeEnumField(getField("oAuthScope", "Shared"), OAUTH_SCOPE_VALUES);

  return (
    <div className="space-y-2">
      {/* MCP Configuration section */}
      <div className="space-y-2 border-t pt-4 mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">MCP Configuration</h3>
        </div>

        <div className="space-y-2">
          <FormLabel className="text-xs">MCP Server ID</FormLabel>
          <Input
            value={getField("id", "")}
            onChange={(e) => updateField("id", e.target.value)}
            placeholder="MCP Server ID (e.g., mcp-server; space will be replaced with hyphen)"
          />
        </div>

        <div className="space-y-2">
          <FormLabel htmlFor="mcp-transport-type">Transport Method</FormLabel>
          <Select
            value={transportType}
            onValueChange={(val) => updateField("transportType", val)}
          >
            <SelectTrigger id="mcp-transport-type">
              <SelectValue placeholder="Select transport method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Stdio">Stdio</SelectItem>
              <SelectItem value="Http">Http</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {transportType === "Stdio" && (
          <div className="space-y-2">
            {/* MCP Command */}
            <div className="space-y-2">
              <FormLabel className="text-xs">Command</FormLabel>
              <Input
                value={getField("command", "")}
                onChange={(e) => updateField("command", e.target.value)}
                placeholder="MCP command (e.g., python, node, dotnet)"
              />
            </div>
            {/* MCP Arguments */}
            <div className="space-y-2">

              <FormLabel className="text-xs">Arguments</FormLabel>
              <div className="space-y-3 border p-3 rounded-md">
                {getField("arguments", []).map((arg: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={arg}
                      onChange={e => {
                        const args = [...getField("arguments", [])];
                        args[idx] = e.target.value;
                        updateField("arguments", args);
                      }}
                      placeholder={`Argument #${idx + 1}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove argument ${idx + 1}`}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const args = [...getField("arguments", [])];
                        args.splice(idx, 1);
                        updateField("arguments", args);
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
                    const args = [...getField("arguments", [])];
                    args.push("");
                    updateField("arguments", args);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Argument
                </Button>
              </div>
            </div>


            {/* MCP Environment Variables */}
            <div className="space-y-2">
              <FormLabel className="text-xs">Environment Variables</FormLabel>
              <div className="space-y-3 border p-3 rounded-md">
                {Object.entries(getField("environmentVariables", {})).map(([key, value], idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={key}
                      type="text"
                      onChange={e => {
                        const envVars = { ...getField("environmentVariables", {}) };
                        const entries = Object.entries(envVars);

                        // Update the key at this position
                        entries[idx] = [e.target.value, entries[idx][1]];

                        // Rebuild object from modified entries
                        const newEnvVars = Object.fromEntries(entries);
                        updateField("environmentVariables", newEnvVars);
                      }}
                      placeholder="Variable name"
                    />
                    <Input
                      type={visibleEnvVars[key] ? "text" : "password"}
                      value={value as string}
                      onChange={e => {
                        const envVars = { ...getField("environmentVariables", {}) };
                        envVars[key] = e.target.value;
                        updateField("environmentVariables", envVars);
                      }}
                      placeholder="Value"
                      className="col-span-2"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Toggle visibility of environment variable ${key}`}
                      className="h-8 w-8"
                      onClick={() =>
                        setVisibleEnvVars(prev => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                      tabIndex={-1}
                    >
                      {visibleEnvVars[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove environment variable ${key}`}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const envVars = { ...getField("environmentVariables", {}) };
                        delete envVars[key];
                        updateField("environmentVariables", envVars);
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
                    const envVars = { ...getField("environmentVariables", {}) };
                    envVars[`env_${Object.keys(envVars).length + 1}`] = "";
                    updateField("environmentVariables", envVars);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variable
                </Button>
              </div>
            </div>
          </div>
        )}
        {transportType === "Http" && (
          <div className="space-y-2">
            {/* MCP Endpoint */}
            <div className="space-y-2">
              <FormLabel className="text-xs">Endpoint</FormLabel>
              <Input
                value={getField("endpoint", "")}
                onChange={(e) => updateField("endpoint", e.target.value)}
                placeholder="Endpoint (Endpoint must be an absolute URI.)"
              />
            </div>

            {/* MCP Auth Type */}
            <div className="space-y-2">
              <FormLabel htmlFor="mcp-auth-type">Auth Type</FormLabel>
              <Select
                value={authType}
                onValueChange={(val) => updateField("authType", val)}
              >
                <SelectTrigger id="mcp-auth-type">
                  <SelectValue placeholder="Select auth type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="OAuth2">OAuth 2.1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Task 7152: Shared vs Per-user connection mode - only meaningful for OAuth2.
                Fixed, mutually exclusive choice made by the admin here; never both at once for
                the same tool. "Shared" preserves WI 7097's original Humantic.ai behavior
                (tenant-wide, one connection). "Per-user" is for tools like Canva that have no
                tenant-shared mode: each admin who opens this tool connects and sees their own
                status independently. See McpOAuthScope's doc comment (tool-form.types.ts).

                On the edit page, changing this immediately saves the tool (onRequestImmediateSave)
                rather than waiting for the admin to click "Save Tool" separately: Connect/
                Disconnect/Status below all resolve Shared-vs-PerUser from whatever is currently
                persisted in Tool.Config in the database (McpOAuthScopeResolver, backend), never
                from this form's in-browser state - so switching the mode and immediately clicking
                Connect, without this auto-save, would silently act under the *old* mode instead
                of the one just selected.

                Disabled while isSaving: without this, a second mode change fired before the first
                save's PUT lands could resolve out of order (the earlier request's response arriving
                after the later one's), leaving the database on a different oAuthScope than this
                Select shows. Disabling serializes changes to one in flight at a time. */}
            {authType === "OAuth2" && (
              <div className="space-y-2">
                <FormLabel htmlFor="mcp-oauth-scope">Connection Mode</FormLabel>
                <Select
                  value={oauthScope}
                  disabled={isSaving}
                  onValueChange={(val) => {
                    updateField("oAuthScope", val);
                    onRequestImmediateSave?.();
                  }}
                >
                  <SelectTrigger id="mcp-oauth-scope">
                    <SelectValue placeholder="Select connection mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Shared">Shared (tenant-wide)</SelectItem>
                    <SelectItem value="PerUser">Per-user</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {oauthScope === "PerUser"
                    ? "Each admin who opens this tool connects their own account. Statuses are not shared between admins."
                    : "One connection is shared by your whole tenant. Any admin can see and manage its status."}
                </p>
              </div>
            )}

            {/* US 7849: preconfigured client credentials + scopes, for MCP servers without
                Dynamic Client Registration (e.g. Canva). Saved with the tool, never auto-saved. */}
            {authType === "OAuth2" && (
              <McpOAuthClientCredentialsFields
                getField={getField}
                updateField={updateField}
                willDropSavedSecret={willDropSavedSecret(savedConfig, currentConfig)}
              />
            )}

            {/* MCP OAuth Connection panel - edit page only, once the tool has been saved and the
                backend has provisioned its McpOAuthConnectionId (happens automatically on save) */}
            {authType === "OAuth2" && mcpOAuthConnectionId && (
              <McpOAuthConnectionPanel
                mcpOAuthConnectionId={mcpOAuthConnectionId}
                oauthScope={oauthScope}
                disabled={isSaving}
                connectBlockedReason={credentialsUnsaved ? SAVE_BEFORE_CONNECTING : null}
                connectionsReset={connectionsReset && !credentialsUnsaved}
              />
            )}

            {/* MCP Additional Headers - not applicable when using OAuth2 */}
            {authType !== "OAuth2" && (
            <div className="space-y-2">
              <FormLabel className="text-xs">Additional Headers</FormLabel>
              <div className="space-y-3 border p-3 rounded-md">
                {Object.entries(getField("additionalHeaders", {})).map(([key, value], idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={key}
                      onChange={e => {
                        const additionalHeaders = { ...getField("additionalHeaders", {}) };
                        const entries = Object.entries(additionalHeaders);

                        // Update the key at this position
                        entries[idx] = [e.target.value, entries[idx][1]];

                        // Rebuild object from modified entries
                        const newHeaders = Object.fromEntries(entries);
                        updateField("additionalHeaders", newHeaders);
                      }}
                      placeholder="Variable name"
                    />
                    <Input
                      type={visibleAdditionalHeaders[key] ? "text" : "password"}
                      value={value as string}
                      onChange={e => {
                        const additionalHeaders = { ...getField("additionalHeaders", {}) };
                        additionalHeaders[key] = e.target.value;
                        updateField("additionalHeaders", additionalHeaders);
                      }}
                      placeholder="Value"
                      className="col-span-2"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Toggle visibility of header ${key}`}
                      className="h-8 w-8"
                      onClick={() =>
                        setVisibleAdditionalHeaders(prev => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                      tabIndex={-1}
                    >
                      {visibleAdditionalHeaders[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove header ${key}`}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const additionalHeaders = { ...getField("additionalHeaders", {}) };
                        delete additionalHeaders[key];
                        updateField("additionalHeaders", additionalHeaders);
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
                    const additionalHeaders = { ...getField("additionalHeaders", {}) };
                    additionalHeaders[`header_${Object.keys(additionalHeaders).length + 1}`] = "";
                    updateField("additionalHeaders", additionalHeaders);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variable
                </Button>
              </div>
            </div>
            )}
          </div>
        )}

        {/* WI 7447: function allowlist - edit page only (needs a saved tool to read/write). */}
        {toolId ? (
          <McpFunctionsPanel
            toolId={toolId}
            isOAuth={transportType === "Http" && authType === "OAuth2"}
            mcpOAuthConnectionId={mcpOAuthConnectionId}
            oauthScope={oauthScope}
            disabled={isSaving}
            onDirtyChange={onFunctionsDirtyChange}
            permissionsEnabled={permissionsEnabled}
          />
        ) : null}
      </div>
    </div>
  );
}
