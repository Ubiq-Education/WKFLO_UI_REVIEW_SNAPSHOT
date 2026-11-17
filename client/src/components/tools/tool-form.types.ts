import { UseFormReturn } from "react-hook-form";

export interface ToolFormProps {
  form: UseFormReturn<any>;
  onSubmit: (values: any) => void;
  isSubmitting: boolean;
  /**
   * The persisted tool's MCP OAuth connection id - only present on the edit page (see
   * pages/tools/edit.tsx), once the backend has provisioned it (happens automatically as soon
   * as an OAuth2 MCP tool is saved), undefined on create (pages/tools/create.tsx) since the
   * tool doesn't exist yet. Threaded through to McpConfigEditor so its OAuth "Connection" panel
   * can be edit-page-only, the same way EntityTagsPanel is today.
   */
  mcpOAuthConnectionId?: string | null;
  /**
   * WI 7447: the persisted tool's id - only present on the edit page. Drives the MCP
   * "Functions" panel, which reads/writes the tool's function allowlist through its own
   * endpoints and so needs a saved tool to talk to. Undefined on create.
   */
  toolId?: number | null;
  /** WI 7726: told whether the MCP Functions panel has unsaved edits (edit page only). */
  onFunctionsDirtyChange?: (dirty: boolean) => void;
  /**
   * Task 7851 (edit page only): the last successful save changed an OAuth2 MCP tool's endpoint or
   * client credentials, so the backend reset every existing connection. Shown in the Connection panel.
   */
  mcpConnectionsReset?: boolean;
}

/**
 * WI 7447: a tool's functions allowlist and its "Manage permissions for this tool" option are
 * saved on the draft tool and only reach chat once the tool is published (Publish is on the edit
 * page header and on the tool's card in the Tools list).
 */
export const PUBLISH_TOOL_HINT = "Saved. Publish the tool to apply these changes in chat.";

export interface ApiTestResponse {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
  duration?: number;
}

/** Props shared by every per-tool-type config editor. */
export interface ConfigEditorProps {
  form: UseFormReturn<any>;
}

/** Props for McpConfigEditor - extends the shared config editor props with the edit-page-only
 * mcpOAuthConnectionId, which drives the OAuth connection panel. */
export interface McpConfigEditorProps {
  form: UseFormReturn<any>;
  mcpOAuthConnectionId?: string | null;
  /**
   * Edit-page-only: persists the tool immediately (the same PUT the "Save Tool" button triggers)
   * right after the Connection Mode selector changes. Without this, Connect/Disconnect/Status
   * would act on whatever oAuthScope is still saved in the DB, not the just-changed dropdown
   * value - McpOAuthScopeResolver on the backend reads Tool.Config from the database, never from
   * this in-browser form state. Undefined on create (no tool row to update yet, and the
   * Connection panel isn't rendered there anyway).
   */
  onRequestImmediateSave?: () => void;
  /** True while a save (the normal Save Tool button, or the auto-save above) is in flight -
   * threaded down to the Connection panel so Connect/Disconnect can't race an in-progress write
   * of the scope they're about to act under. */
  isSaving?: boolean;
  /** WI 7447: persisted tool id (edit page only) - enables the Functions panel. */
  toolId?: number | null;
  /** WI 7726: told whether the MCP Functions panel has unsaved edits (edit page only). */
  onFunctionsDirtyChange?: (dirty: boolean) => void;
  /** Task 7851: see ToolFormProps.mcpConnectionsReset. */
  connectionsReset?: boolean;
}

export interface HttpInputConfig {
  name: string;
  description: string;
  type: string;
  required: boolean;
  value: string;
  defaultValue: string;
  hasDefaultValue: boolean;
}

export interface HttpToolConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  parameters: Record<string, string>;
  urlParams: Record<string, string>;
  body: string;
  parameterConfig: Record<string, any>;
  inputs: Record<string, HttpInputConfig>;
}

export interface KnowledgeToolConfig {
  tags: string[];
}

/**
 * Task 7152 (parent US 7151): whether an OAuth2 MCP tool's connection is shared tenant-wide
 * (WI 7097's original Humantic.ai behavior - one connection, any admin can see/manage it) or
 * per-user (each logged-in admin connects and sees their own status independently - added to
 * support Canva, which has no tenant-shared mode at all). Mutually exclusive, never both for
 * the same tool. Generic on purpose: any future OAuth2 MCP tool can pick either mode, matching
 * how `authType`/`transportType` are also generic enum-like fields here.
 *
 * Reconciled against the real backend contract (wkflo_services `McpServerConfig.OAuthScope`,
 * a `McpOAuthScope` enum serialized via `[JsonProperty("oAuthScope")]` with
 * `StringEnumConverter`): field key is `oAuthScope` (capital A, matching "OAuth" as a unit),
 * values are the strings "Shared" | "PerUser" - both already matched this repo's original guess.
 */
export type McpOAuthScope = "Shared" | "PerUser";

export interface McpToolConfig {
  id: string;
  transportType: "Stdio" | "Http";
  command: string;
  arguments: string[];
  environmentVariables: Record<string, string>;
  endpoint: string;
  additionalHeaders: Record<string, string>;
  /** Defaults to "None" so existing configs (static headers, e.g. a fixed Bearer token) are unaffected. */
  authType: "None" | "OAuth2";
  /**
   * Defaults to "Shared" so every existing OAuth2 MCP tool (e.g. Humantic.ai, WI 7097) keeps
   * its current tenant-wide behavior unchanged. Only meaningful when `authType` is "OAuth2".
   * Field key matches the backend's `[JsonProperty("oAuthScope")]` exactly - see the
   * `McpOAuthScope` doc comment above.
   */
  oAuthScope: McpOAuthScope;
  /**
   * US 7849: preconfigured OAuth client ID (OAuth2 only). Empty keeps the existing Dynamic
   * Client Registration behavior. Trimmed on submit (normalizeMcpConfigForSubmit).
   */
  clientId?: string;
  /**
   * US 7849: write-only. The backend never returns it (it is encrypted at rest); a non-empty
   * value replaces the stored secret on save, and it is omitted from the request when blank
   * (blank means "keep the stored secret"). Never coexists with `clearClientSecret`.
   */
  clientSecret?: string;
  /** US 7849: read-only, set by the backend when a client secret is stored. Never posted. */
  hasClientSecret?: boolean;
  /**
   * US 7849: write-only. `true` removes the stored client secret on save; only posted when
   * `true`, and a new `clientSecret` wins over it.
   */
  clearClientSecret?: boolean;
  /**
   * OAuth scopes to request (backend `McpServerConfig.Scopes`, a string array). Empty means
   * "request every scope the MCP server advertises".
   */
  scopes?: string[];
  /**
   * This type is a partial, *known* view over a config object the backend can attach extra
   * OAuth2-flow fields to (e.g. `redirectUri`) that this
   * UI never reads/renders but must round-trip untouched - see McpConfigEditor's mount effect,
   * which spreads the parsed config before normalizing only the fields declared above. Losing
   * that spread (rebuilding a config object from only the fields above) silently drops those
   * extra properties on every load+save round-trip; see PLAN.md's Bug B.
   */
  [key: string]: unknown;
}

export interface IntegrationAmaisToolConfig {
  isVoiceEnabled: boolean;
  areSkillsEnabled: boolean;
}

export interface PriorityQaItem {
  question: string;
  answer: string;
  links: string[];
}

export interface PriorityQaToolConfig {
  items: PriorityQaItem[];
}

export interface ChatClassificationTopic {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

export interface ChatClassificationToolConfig {
  topics: ChatClassificationTopic[];
}

export interface ContactFormToolConfig {
  /** Legacy, not editable: the tool's IsActive flag is the on/off control. Preserved as-is
   * when present because older per-site CMS versions still read it. */
  enabled?: boolean;
  /** US 8021: owned by the CMS (Admin Email Notifications), not editable here. Preserved as-is
   * when present, never added or changed. */
  adminNotificationsEnabled?: boolean;
  /** US 8021: owned by the CMS (Admin recipients), not editable here. Preserved as-is. */
  adminNotificationEmails?: string[];
  mandatory: boolean;
  firstNameRequired: boolean;
  lastNameRequired: boolean;
  emailRequired: boolean;
  whenToUse: string;
  submitButtonText: string;
  successMessageEnabled: boolean;
  successMessageText: string;
}

export interface ImageGenerationToolConfig {
  provider: string;
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion: string;
  model: string;
  quality: string;
  aspectRatio: string;
}
