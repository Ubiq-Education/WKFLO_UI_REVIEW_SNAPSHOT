import { useEffect, useId, useMemo, useState, type ComponentType } from "react";
import { Ban, CheckCircle2, Hand, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AgentToolPermissionsEntry,
  ToolPermission,
  DEFAULT_TOOL_PERMISSION,
  normalizeToolPermission,
  buildPermissionsUpdate,
  describeAgentToolPermissionsError,
  isMcpTool,
  useAgentToolPermissions,
} from "@/hooks/use-agent-tool-permissions";
import { toolDisplayDescription, toolDisplayName } from "@shared/utils/tool-display";

interface PermissionOption {
  value: ToolPermission;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  activeClass: string;
  /** Icon colour on the "Set all functions" buttons (a literal class, so Tailwind generates it). */
  iconClass: string;
}

// Same three choices and icons (check_circle / pan_tool / block) as the agent Tools section in
// the CMS, using their lucide equivalents.
export const PERMISSION_OPTIONS: readonly PermissionOption[] = [
  {
    value: "Allow",
    label: "Always allow",
    hint: "The agent uses it whenever it needs to.",
    icon: CheckCircle2,
    activeClass: "data-[state=on]:text-green-600",
    iconClass: "text-green-600",
  },
  {
    value: "Ask",
    label: "Ask for permission",
    hint: "The agent asks the person chatting before each use.",
    icon: Hand,
    activeClass: "data-[state=on]:text-amber-600",
    iconClass: "text-amber-600",
  },
  {
    value: "Block",
    label: "Always block",
    hint: "The agent never uses it.",
    icon: Ban,
    activeClass: "data-[state=on]:text-red-600",
    iconClass: "text-red-600",
  },
];

const ALL_FUNCTIONS_KEY = "__all__";

function PermissionControl({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: ToolPermission;
  disabled: boolean;
  onChange: (value: ToolPermission) => void;
}) {
  const hintIdPrefix = useId();
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix sends "" when the selected item is clicked again - a permission is always set.
        if (next) onChange(next as ToolPermission);
      }}
      disabled={disabled}
      aria-label={`Permission for ${label}`}
      // Grey pill track; the selected option is a white "thumb" with a light shadow and a
      // coloured icon (same look as the CMS agent Tools section).
      className="shrink-0 gap-0.5 rounded-full bg-muted p-0.5"
    >
      {PERMISSION_OPTIONS.map((option) => {
        const Icon = option.icon;
        const hintId = `${hintIdPrefix}-${option.value}`;
        return (
          <Tooltip key={option.value}>
            {/* The tooltip trigger must be a wrapper, not the item itself: with asChild, Radix
                Slot merges the trigger's own data-state ("closed"/"delayed-open") onto the
                button and overwrites the toggle's data-state="on" the selected styles hang on.
                Focus/blur bubble to the wrapper, so the tooltip still shows on keyboard focus. */}
            <TooltipTrigger asChild>
              <span className="inline-flex" data-testid="permission-option-tooltip-trigger">
                <ToggleGroupItem
                  value={option.value}
                  aria-label={`${option.label}: ${label}`}
                  // The tooltip text, for screen readers on the focused option.
                  aria-describedby={hintId}
                  size="sm"
                  className={`h-8 w-8 min-w-0 rounded-full p-0 text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 data-[state=on]:bg-white data-[state=on]:shadow-sm ${option.activeClass}`}
                >
                  <Icon className="h-4 w-4" />
                </ToggleGroupItem>
                <span id={hintId} className="sr-only">{option.hint}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-medium">{option.label}</span> - {option.hint}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

interface AgentToolPermissionsDialogProps {
  agentId: number;
  tool: AgentToolPermissionsEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * WI 7447: lets a WKFLO admin set Always allow / Ask for permission / Always block for one tool
 * linked to an agent - per enabled function for MCP tools, one "All functions" row otherwise.
 * Saves only this tool's entry through PUT tenant/agent/{id}/tools/permissions. Like every other
 * agent edit in this app, it reaches chat once the agent is published.
 */
export default function AgentToolPermissionsDialog({ agentId, tool, open, onOpenChange }: AgentToolPermissionsDialogProps) {
  const { save, isSaving, saveError, resetSave } = useAgentToolPermissions(agentId);
  const isMcp = isMcpTool(tool);
  const functions = tool.functions ?? [];

  const initial = useMemo(() => {
    const values: Record<string, ToolPermission> = {};
    if (isMcp) {
      for (const fn of functions) values[fn.name] = normalizeToolPermission(fn.permission);
    } else {
      values[ALL_FUNCTIONS_KEY] = normalizeToolPermission(tool.permission);
    }
    return values;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const [draft, setDraft] = useState<Record<string, ToolPermission>>(initial);
  const [savedHint, setSavedHint] = useState(false);

  // Fresh copy whenever the dialog opens (Cancel discards) or the saved values change.
  useEffect(() => {
    setDraft(initial);
  }, [initial, open]);

  useEffect(() => {
    if (open) {
      setSavedHint(false);
      resetSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDirty = Object.keys(initial).some((key) => initial[key] !== draft[key]);

  const setPermission = (key: string, value: ToolPermission) => {
    setSavedHint(false);
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  // Bulk action for MCP tools: same draft change as picking the option on every function row.
  const setAllPermissions = (value: ToolPermission) => {
    setSavedHint(false);
    setDraft((previous) => {
      const next = { ...previous };
      for (const fn of functions) next[fn.name] = value;
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await save([buildPermissionsUpdate(tool, draft[ALL_FUNCTIONS_KEY] ?? DEFAULT_TOOL_PERMISSION, draft)]);
      setSavedHint(true);
    } catch {
      // saveError is rendered below.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permissions: {tool.name}</DialogTitle>
          <DialogDescription>
            Choose when this agent can use {isMcp ? "each function of this tool" : "this tool"}: always, only after someone
            approves it, or never.
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider delayDuration={200}>
          {!tool.isActive && (
            <p className="text-xs text-muted-foreground">
              This tool is switched off, so agents can't use it right now. These settings apply once it's switched back on.
            </p>
          )}

          {isMcp && functions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Set all functions" data-testid="bulk-permissions">
              <span className="text-xs text-muted-foreground">Set all functions:</span>
              {PERMISSION_OPTIONS.map((option) => {
                const Icon = option.icon;
                const allMatch = functions.every((fn) => (draft[fn.name] ?? DEFAULT_TOOL_PERMISSION) === option.value);
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={allMatch ? "secondary" : "outline"}
                    className="h-8 px-2.5 text-xs"
                    aria-pressed={allMatch}
                    aria-label={`Set all functions to ${option.label}`}
                    disabled={isSaving}
                    onClick={() => setAllPermissions(option.value)}
                  >
                    <Icon className={option.iconClass} />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          )}

          {isMcp && functions.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground" data-testid="no-enabled-functions">
              No functions are enabled on this tool yet. Enable them in the tool's Functions panel first.
            </p>
          ) : (
            <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border" aria-label="Tool permissions">
              {isMcp ? (
                functions.map((fn) => {
                  const displayName = toolDisplayName(fn);
                  const description = toolDisplayDescription(fn);
                  // The original name/description are fallbacks only: never shown next to friendly text.
                  const hasFriendlyName = displayName !== fn.name;
                  return (
                    <li key={fn.name} className="flex items-start justify-between gap-3 p-3" data-testid="permission-row">
                      <div className="min-w-0">
                        <div className={hasFriendlyName ? "break-words text-sm font-medium" : "break-all font-mono text-sm"}>
                          {displayName}
                        </div>
                        {description && <p className="text-xs text-muted-foreground">{description}</p>}
                      </div>
                      <PermissionControl
                        label={displayName}
                        value={draft[fn.name] ?? DEFAULT_TOOL_PERMISSION}
                        disabled={isSaving}
                        onChange={(value) => setPermission(fn.name, value)}
                      />
                    </li>
                  );
                })
              ) : (
                <li className="flex items-center justify-between gap-3 p-3" data-testid="permission-row">
                  <div className="text-sm font-medium">All functions</div>
                  <PermissionControl
                    label="All functions"
                    value={draft[ALL_FUNCTIONS_KEY] ?? DEFAULT_TOOL_PERMISSION}
                    disabled={isSaving}
                    onChange={(value) => setPermission(ALL_FUNCTIONS_KEY, value)}
                  />
                </li>
              )}
            </ul>
          )}

          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Key">
            {PERMISSION_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <li key={option.value} className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5" /> {option.label}
                </li>
              );
            })}
          </ul>
        </TooltipProvider>

        {saveError && (
          <p className="text-sm text-destructive" role="alert">
            {describeAgentToolPermissionsError(saveError)}
          </p>
        )}
        {savedHint && (
          <p className="text-sm text-green-700" role="status">
            Permissions saved. Publish the agent to apply these permissions in chat.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {savedHint ? "Close" : "Cancel"}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
