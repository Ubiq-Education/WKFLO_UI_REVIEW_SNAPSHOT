import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToolOAuthConnection } from "@/hooks/use-tool-oauth-connection";
import {
  describeToolFunctionsError,
  ToolFunction,
  ToolFunctionDisplayUpdate,
  useToolFunctions,
} from "@/hooks/use-tool-functions";
import {
  normalizeDisplayText,
  TOOL_DISPLAY_DESCRIPTION_MAX_LENGTH,
  TOOL_DISPLAY_NAME_MAX_LENGTH,
} from "@shared/utils/tool-display";
import { PUBLISH_TOOL_HINT } from "../tool-form.types";

interface McpFunctionsPanelProps {
  /** Persisted tool id - the panel is edit-page only. */
  toolId: number;
  /** True when the tool's Auth Type is OAuth2: functions can only be listed once connected. */
  isOAuth: boolean;
  mcpOAuthConnectionId?: string | null;
  oauthScope?: "Shared" | "PerUser";
  /** True while the tool itself is being saved - pauses actions that read its saved config. */
  disabled?: boolean;
  /** WI 7726: told whether the panel has unsaved edits (the edit page holds Publish until saved). */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Task 7857: the live (possibly unsaved) "Manage permissions for this tool" value. When off,
   * the allowlist is ignored at runtime, so the per-function switches are hidden; the stored
   * allowlist is left as it is, so turning the setting back on brings the admin's choice back.
   */
  permissionsEnabled: boolean;
}

const PERMISSIONS_OFF_NOTE =
  "All functions are available to agents. Turn on \"Manage permissions for this tool\" to choose which functions agents can use.";

/**
 * WI 7447: lets a WKFLO admin choose which functions of an MCP server agents may use. With no
 * function selected, all of them are available (Bug 7856); with "Manage permissions for this
 * tool" off the selection is ignored and only display text can be edited (Task 7857).
 * "Refresh from server" re-runs `tools/list` against the saved configuration. Saved through its
 * own endpoint, separate from "Save Tool".
 *
 * OAuth2 tools need a working connection before the server can be asked for its functions, so
 * for those this first waits for the Connection panel's status to be "Connected".
 */
export default function McpFunctionsPanel({
  toolId,
  isOAuth,
  mcpOAuthConnectionId,
  oauthScope,
  disabled = false,
  onDirtyChange,
  permissionsEnabled,
}: McpFunctionsPanelProps) {
  return (
    <Card className="border-border" data-testid="mcp-functions-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Functions</CardTitle>
        {permissionsEnabled ? (
          <p className="text-xs text-muted-foreground">
            Choose which of this MCP server's functions agents can use. If none are selected, all functions are available.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="mcp-functions-permissions-off-note">
            {PERMISSIONS_OFF_NOTE}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isOAuth ? (
          <OAuthGatedFunctions
            toolId={toolId}
            mcpOAuthConnectionId={mcpOAuthConnectionId}
            oauthScope={oauthScope}
            disabled={disabled}
            onDirtyChange={onDirtyChange}
            selectable={permissionsEnabled}
          />
        ) : (
          <FunctionsEditor
            toolId={toolId}
            disabled={disabled}
            onDirtyChange={onDirtyChange}
            selectable={permissionsEnabled}
          />
        )}
      </CardContent>
    </Card>
  );
}

function OAuthGatedFunctions({
  toolId,
  mcpOAuthConnectionId,
  oauthScope,
  disabled,
  onDirtyChange,
  selectable,
}: {
  toolId: number;
  mcpOAuthConnectionId?: string | null;
  oauthScope?: "Shared" | "PerUser";
  disabled: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  selectable: boolean;
}) {
  // Same query key as the Connection panel's own status query, so React Query shares one
  // request between them rather than polling twice.
  const { isConnected, isLoadingStatus, isStatusError } = useToolOAuthConnection(mcpOAuthConnectionId, oauthScope, disabled);

  if (!mcpOAuthConnectionId) {
    return <StateMessage>Save the tool, then connect it, to see its functions.</StateMessage>;
  }
  if (isLoadingStatus) {
    return (
      <StateMessage>
        <Loader2 className="h-3 w-3 animate-spin" /> Checking the connection…
      </StateMessage>
    );
  }
  if (isStatusError) {
    return (
      <StateMessage tone="warning">
        <AlertTriangle className="h-3 w-3" /> Functions are unavailable because this tool's connection status couldn't be checked.
      </StateMessage>
    );
  }
  if (!isConnected) {
    return <StateMessage>Connect this tool first. Its functions can be loaded once the connection works.</StateMessage>;
  }
  return <FunctionsEditor toolId={toolId} disabled={disabled} onDirtyChange={onDirtyChange} selectable={selectable} />;
}

function StateMessage({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" }) {
  return (
    <p
      className={`flex items-center gap-1.5 text-xs ${tone === "warning" ? "text-orange-600" : "text-muted-foreground"}`}
      data-testid="mcp-functions-state"
    >
      {children}
    </p>
  );
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size !== b.size) return false;
  return Array.from(a).every((value) => b.has(value));
}

function matchesSearch(fn: ToolFunction, term: string) {
  if (!term) return true;
  // Saved values only, so a row doesn't disappear while its display text is being edited.
  return [fn.name, fn.description, fn.displayName, fn.displayDescription].some((value) =>
    (value ?? "").toLowerCase().includes(term)
  );
}

/** WI 7726: the admin's unsaved display text for one function, as typed. */
interface DisplayDraft {
  displayName: string;
  displayDescription: string;
}

function savedDisplayText(fn: ToolFunction): DisplayDraft {
  return { displayName: fn.displayName ?? "", displayDescription: fn.displayDescription ?? "" };
}

/** Display text can be set on functions the server still offers - not on Removed ones. */
function canEditDisplay(fn: ToolFunction) {
  return fn.status !== "Removed";
}

/**
 * The PUT entries for functions whose display text differs from the saved one. Both values are
 * always sent, trimmed, with blank meaning "use the server's" (null).
 */
function changedDisplayUpdates(functions: ToolFunction[], drafts: Record<string, DisplayDraft>): ToolFunctionDisplayUpdate[] {
  const updates: ToolFunctionDisplayUpdate[] = [];
  for (const fn of functions) {
    const draft = drafts[fn.name];
    if (!draft || !canEditDisplay(fn)) continue;
    const displayName = normalizeDisplayText(draft.displayName);
    const displayDescription = normalizeDisplayText(draft.displayDescription);
    if (displayName !== (fn.displayName ?? null) || displayDescription !== (fn.displayDescription ?? null)) {
      updates.push({ name: fn.name, displayName, displayDescription });
    }
  }
  return updates;
}

/**
 * `selectable` is false while "Manage permissions for this tool" is off: the switches are hidden
 * and only display text can be saved. Unsaved switch changes are kept aside (neither saved nor
 * discarded) and come back if the setting is turned on again; a save in that state always sends
 * the stored allowlist unchanged.
 */
function FunctionsEditor({
  toolId,
  disabled,
  onDirtyChange,
  selectable,
}: {
  toolId: number;
  disabled: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  selectable: boolean;
}) {
  const { snapshot, isLoading, loadError, discoverAsync, isDiscovering, discoverError, save, isSaving, saveError } =
    useToolFunctions(toolId);
  // Shown after a successful save or refresh: both only change the draft tool.
  const [showPublishHint, setShowPublishHint] = useState(false);

  const [search, setSearch] = useState("");
  // null = no local edits; otherwise the admin's working copy of the enabled set.
  const [draft, setDraft] = useState<Set<string> | null>(null);
  // Keyed by the original function name; only functions the admin has typed into.
  const [displayDrafts, setDisplayDrafts] = useState<Record<string, DisplayDraft>>({});

  const functions = snapshot?.functions ?? [];
  const serverEnabled = useMemo(
    () => new Set((snapshot?.functions ?? []).filter((f) => f.isEnabled).map((f) => f.name)),
    [snapshot]
  );
  // While the switches are hidden, the stored allowlist is what gets saved.
  const enabled = selectable && draft !== null ? draft : serverEnabled;
  const displayUpdates = useMemo(() => changedDisplayUpdates(functions, displayDrafts), [functions, displayDrafts]);
  const isDirty = !setsEqual(enabled, serverEnabled) || displayUpdates.length > 0;

  // Report unsaved edits upward; nothing is unsaved once this editor goes away.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => functions.filter((f) => matchesSearch(f, term)), [functions, term]);
  const enabledCount = functions.reduce((count, f) => (enabled.has(f.name) ? count + 1 : count), 0);
  const isBusy = disabled || isSaving;

  const updateDraft = (mutate: (next: Set<string>) => void) => {
    setShowPublishHint(false);
    setDraft((previous) => {
      const next = new Set(previous ?? serverEnabled);
      mutate(next);
      return next;
    });
  };

  const updateDisplayDraft = (fn: ToolFunction, change: Partial<DisplayDraft>) => {
    setShowPublishHint(false);
    setDisplayDrafts((previous) => ({
      ...previous,
      [fn.name]: { ...(previous[fn.name] ?? savedDisplayText(fn)), ...change },
    }));
  };

  // With the switches hidden, Save and Discard only cover display text; hidden switch changes stay.
  const discardChanges = () => {
    if (selectable) setDraft(null);
    setDisplayDrafts({});
  };

  const handleSave = async () => {
    const names = new Set(functions.map((f) => f.name));
    try {
      await save({
        enabledFunctions: Array.from(enabled).filter((name) => names.has(name)),
        functions: displayUpdates,
      });
      discardChanges();
      setShowPublishHint(true);
    } catch {
      // saveError is rendered below; keep the draft so nothing the admin chose is lost.
    }
  };

  const handleDiscover = async () => {
    setShowPublishHint(false);
    try {
      await discoverAsync();
      setShowPublishHint(true);
    } catch {
      // discoverError is rendered below.
    }
  };

  const discoveredOn = snapshot?.functionsDiscoveredOn ? new Date(snapshot.functionsDiscoveredOn) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" data-testid="mcp-functions-discovered-on">
          {discoveredOn && !Number.isNaN(discoveredOn.getTime())
            ? `Last refreshed ${discoveredOn.toLocaleString()}`
            : "Not loaded from the server yet."}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={handleDiscover} disabled={isDiscovering || disabled}>
          {isDiscovering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh from server
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Refreshing uses the tool's saved settings. Save the tool first if you changed them.</p>

      {discoverError && (
        <p className="text-xs text-destructive" role="alert">
          Couldn't load functions from the server: {describeToolFunctionsError(discoverError)}
        </p>
      )}

      {isLoading ? (
        <StateMessage>
          <Loader2 className="h-3 w-3 animate-spin" /> Loading functions…
        </StateMessage>
      ) : loadError ? (
        <StateMessage tone="warning">
          <AlertTriangle className="h-3 w-3" /> Functions are unavailable right now: {describeToolFunctionsError(loadError)}
        </StateMessage>
      ) : functions.length === 0 ? (
        <StateMessage>No functions yet. Use "Refresh from server" to load the functions this MCP server offers.</StateMessage>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search functions"
                aria-label="Search functions"
                className="pl-8"
              />
            </div>
            {selectable && (
              <>
                <span className="text-xs text-muted-foreground" data-testid="mcp-functions-count">
                  {enabledCount === 0
                    ? "No functions selected — all functions are available"
                    : `${enabledCount} of ${functions.length} enabled`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isBusy || filtered.length === 0}
                  onClick={() => updateDraft((next) => filtered.forEach((f) => next.add(f.name)))}
                >
                  {term ? "Enable all shown" : "Enable all"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isBusy || filtered.length === 0}
                  onClick={() => updateDraft((next) => filtered.forEach((f) => next.delete(f.name)))}
                >
                  {term ? "Disable all shown" : "Disable all"}
                </Button>
              </>
            )}
          </div>

          {filtered.length === 0 ? (
            <StateMessage>No functions match "{search.trim()}".</StateMessage>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto rounded-md border" aria-label="MCP functions">
              {filtered.map((fn) => (
                <FunctionRow
                  key={fn.name}
                  fn={fn}
                  selectable={selectable}
                  checked={enabled.has(fn.name)}
                  disabled={isBusy}
                  onCheckedChange={(on) => updateDraft((next) => (on ? next.add(fn.name) : next.delete(fn.name)))}
                  displayDraft={displayDrafts[fn.name]}
                  onDisplayChange={(change) => updateDisplayDraft(fn, change)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {saveError && (
        <p className="text-xs text-destructive" role="alert">
          Couldn't save functions: {describeToolFunctionsError(saveError)}
        </p>
      )}

      {showPublishHint && !isDirty && (
        <p className="text-xs text-green-700" role="status" data-testid="mcp-functions-publish-hint">
          {PUBLISH_TOOL_HINT}
        </p>
      )}

      {functions.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          {isDirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>}
          {isDirty && (
            <Button type="button" size="sm" variant="ghost" onClick={discardChanges} disabled={isSaving}>
              Discard
            </Button>
          )}
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isBusy}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save functions"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function FunctionRow({
  fn,
  selectable,
  checked,
  disabled,
  onCheckedChange,
  displayDraft,
  onDisplayChange,
}: {
  fn: ToolFunction;
  /** False while "Manage permissions for this tool" is off: no enable switch is shown. */
  selectable: boolean;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  displayDraft: DisplayDraft | undefined;
  onDisplayChange: (change: Partial<DisplayDraft>) => void;
}) {
  // Generated ids: raw MCP function names can hold characters that aren't valid in an id.
  const switchId = useId();
  const displayFieldsId = useId();
  // Start open when the row has unsaved display text (e.g. it was filtered out and back in).
  const [showDisplayFields, setShowDisplayFields] = useState(() => displayDraft !== undefined);
  const editable = canEditDisplay(fn);
  const displayName = editable ? fn.displayName : null;
  const displayDescription = editable ? fn.displayDescription : null;

  return (
    <li className="flex items-start gap-3 p-3" data-testid="mcp-function-row">
      {selectable && (
        <Switch
          id={switchId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-label={`Enable ${fn.name}`}
          className="mt-0.5"
        />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        {displayName && (
          <p className="break-words text-sm font-medium" data-testid="mcp-function-display-name">
            {displayName}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* The original name always stays visible: it's what agents and permissions use. */}
          {selectable ? (
            <label htmlFor={switchId} className={`break-all font-mono ${displayName ? "text-xs text-muted-foreground" : "text-sm"}`}>
              {fn.name}
            </label>
          ) : (
            <span className={`break-all font-mono ${displayName ? "text-xs text-muted-foreground" : "text-sm"}`}>
              {fn.name}
            </span>
          )}
          {fn.status === "New" && (
            <Badge variant="default" className="bg-blue-600 hover:bg-blue-600/90" title="Found on the server since functions were last reviewed">
              New
            </Badge>
          )}
          {fn.status === "Removed" && (
            <Badge variant="destructive" title="The server no longer offers this function, so agents can't use it">
              Removed
            </Badge>
          )}
        </div>
        {displayDescription ? (
          <>
            <p className="text-xs text-muted-foreground" data-testid="mcp-function-display-description">
              {displayDescription}
            </p>
            {fn.description && (
              <p className="text-xs italic text-muted-foreground" data-testid="mcp-function-server-description">
                From the server: {fn.description}
              </p>
            )}
          </>
        ) : fn.description ? (
          <p className="text-xs text-muted-foreground">{fn.description}</p>
        ) : null}
        {editable && (
          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              aria-expanded={showDisplayFields}
              aria-controls={displayFieldsId}
              aria-label={`Display name and description for ${fn.name}`}
              onClick={() => setShowDisplayFields((open) => !open)}
            >
              {showDisplayFields ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />}
              Display name and description
            </Button>
            {showDisplayFields && (
              <DisplayFields
                id={displayFieldsId}
                fn={fn}
                value={displayDraft ?? savedDisplayText(fn)}
                disabled={disabled}
                onChange={onDisplayChange}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function DisplayFields({
  id,
  fn,
  value,
  disabled,
  onChange,
}: {
  id: string;
  fn: ToolFunction;
  value: DisplayDraft;
  disabled: boolean;
  onChange: (change: Partial<DisplayDraft>) => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const hintId = useId();
  return (
    <div id={id} className="mt-1 space-y-2 rounded-md border bg-muted/30 p-2" data-testid="mcp-function-display-fields">
      <p id={hintId} className="text-xs text-muted-foreground">
        Shown to people instead of the server's wording; agents still get the original. Leave a field empty to use the
        server's name or description.
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={nameId} className="text-xs">
            Display name
          </Label>
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            {value.displayName.length}/{TOOL_DISPLAY_NAME_MAX_LENGTH}
          </span>
        </div>
        <Input
          id={nameId}
          value={value.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          maxLength={TOOL_DISPLAY_NAME_MAX_LENGTH}
          placeholder={fn.name}
          disabled={disabled}
          aria-describedby={hintId}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={descriptionId} className="text-xs">
            Display description
          </Label>
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            {value.displayDescription.length}/{TOOL_DISPLAY_DESCRIPTION_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id={descriptionId}
          value={value.displayDescription}
          onChange={(e) => onChange({ displayDescription: e.target.value })}
          maxLength={TOOL_DISPLAY_DESCRIPTION_MAX_LENGTH}
          placeholder={fn.description ?? ""}
          disabled={disabled}
          aria-describedby={hintId}
          rows={2}
          className="min-h-[3.5rem] text-sm"
        />
      </div>
    </div>
  );
}
