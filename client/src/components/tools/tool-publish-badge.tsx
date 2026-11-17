import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getToolPublishState, type ToolPublishFields } from "@/lib/tool-publish-state";

const CHANGED_HINT = "This tool was changed after it was last published. Publish it to apply the changes in chat.";

/** WI 7726: Published / Unpublished / Unpublished changes, shared by the tool card and edit page. */
export default function ToolPublishBadge({ tool }: { tool: ToolPublishFields }) {
  const hintId = useId();
  const state = getToolPublishState(tool);

  if (state === "changed") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Badge doesn't forward refs, so the trigger is a focusable wrapper. */}
            <span className="inline-flex" tabIndex={0} aria-describedby={hintId} data-testid="tool-publish-badge">
              <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">
                Unpublished changes
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>{CHANGED_HINT}</TooltipContent>
        </Tooltip>
        <span id={hintId} className="sr-only">{CHANGED_HINT}</span>
      </TooltipProvider>
    );
  }

  const published = state === "published";
  return (
    <Badge
      variant={published ? "default" : "secondary"}
      className={published ? "bg-green-100 text-green-800" : ""}
      data-testid="tool-publish-badge"
    >
      {published ? "Published" : "Unpublished"}
    </Badge>
  );
}
