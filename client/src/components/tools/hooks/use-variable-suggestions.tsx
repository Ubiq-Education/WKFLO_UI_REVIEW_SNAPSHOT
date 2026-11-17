import { useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { UseFormReturn } from "react-hook-form";
import { Secret } from "@shared/schema";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";
import { useToast } from "@/hooks/use-toast";

/**
 * Fetches the tenant's secrets list and exposes `showAvailableVariables()`, a toast
 * listing the `{{input}}` / `{{secrets_x}}` variables available for the current tool's
 * config. Also installs a global `keyup` listener that pops the toast whenever the user
 * types `{{` in any input/textarea inside the form — this fires for every tool type,
 * not just HTTP/MCP, matching the original tool-form.tsx behavior.
 *
 * Note: this is a `.tsx` file (not `.ts` as originally sketched in the refactor plan)
 * because the toast description renders JSX.
 */
export function useVariableSuggestions(form: UseFormReturn<any>) {
  const { toast } = useToast();
  const token = useAuth();
  const context = useContext(DataContext);

  const { data: secretsList = [] } = useQuery<Secret[]>({
    queryKey: ['/md/api/v1/secrets', token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  // Helper function to create a clickable list of variables for copy-paste
  const showAvailableVariables = () => {
    // Get input variables directly from the raw config JSON. This intentionally does
    // not go through any tool-type-specific accessor (e.g. getHttpConfigField) so the
    // behavior is identical regardless of which tool type is currently selected, exactly
    // like the original inline implementation.
    let inputs: Record<string, any> = {};
    try {
      const configStr = form.getValues("config");
      const parsed = JSON.parse(configStr);
      inputs = parsed.inputs || {};
    } catch (e) {
      inputs = {};
    }
    const inputVars = Object.keys(inputs).map(key => `{{${key}}}`);

    // Get secrets variables
    const secretVars = secretsList.map(secret => `{{secrets_${secret.name}}}`);

    // Show formatted variables in a toast
    toast({
      title: "Available Variables",
      description: (
        <div className="space-y-2 mt-2">
          {inputVars.length > 0 && (
            <div>
              <div className="font-medium mb-1">Input Variables:</div>
              <div className="space-y-1">
                {inputVars.map((v, i) => (
                  <div
                    key={i}
                    className="pl-2 font-mono text-sm cursor-pointer hover:bg-gray-100 rounded p-1"
                    onClick={() => {
                      navigator.clipboard.writeText(v)
                        .then(() => {
                          toast({
                            title: "Copied to clipboard",
                            description: `${v} has been copied to your clipboard`,
                            duration: 2000,
                          });
                        });
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {secretVars.length > 0 && (
            <div>
              <div className="font-medium mb-1 mt-2">Secrets:</div>
              <div className="space-y-1">
                {secretVars.map((v, i) => (
                  <div
                    key={i}
                    className="pl-2 font-mono text-sm cursor-pointer hover:bg-gray-100 rounded p-1"
                    onClick={() => {
                      navigator.clipboard.writeText(v)
                        .then(() => {
                          toast({
                            title: "Copied to clipboard",
                            description: `${v} has been copied to your clipboard`,
                            duration: 2000,
                          });
                        });
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {inputVars.length === 0 && secretVars.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No variables available. Add inputs to create variables.
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Click a variable to copy it to your clipboard
          </div>
        </div>
      ),
      duration: 10000,
    });
  };

  // Add event listener to show variable suggestions when typing {{
  useEffect(() => {
    // Create an event listener for typing {{ in any input field
    const handleInputEvent = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;

        // Only process if the last two characters typed are {{
        const value = target.value;
        const cursorPos = target.selectionStart || 0;

        if (e.key === '{' && cursorPos > 0 && value[cursorPos - 1] === '{') {
          // Show the variables toast when typing {{
          showAvailableVariables();
        }
      }
    };

    // Add the event listener to the document
    document.addEventListener('keyup', handleInputEvent);

    return () => {
      document.removeEventListener('keyup', handleInputEvent);
    };
  }, [secretsList]);

  return { showAvailableVariables };
}
