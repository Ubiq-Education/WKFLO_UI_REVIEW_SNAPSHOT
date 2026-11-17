import { useMemo } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatJson } from "@/lib/format-json";
import type { AuditLogEntry } from "@shared/schema";

type AuditChangesDialogProps = {
  /** The entry whose changes are shown; the dialog is open while this is non-null. */
  entry: AuditLogEntry | null;
  onClose: () => void;
};

export function AuditChangesDialog({ entry, onClose }: AuditChangesDialogProps) {
  const { toast } = useToast();
  const changes = entry?.changes ?? null;

  // Only format when the dialog actually has something to show (i.e. it's open), so the
  // table rows never pay for parsing large payloads.
  const formatted = useMemo(() => (changes === null ? null : formatJson(changes)), [changes]);

  function copyToClipboard() {
    if (!formatted) return;
    navigator.clipboard
      .writeText(formatted.text)
      .then(() => toast({ title: "Copied to clipboard" }))
      .catch(() => toast({ title: "Could not copy to clipboard", variant: "destructive" }));
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Changes</DialogTitle>
          <DialogDescription>
            {entry ? `${entry.entityType} ${entry.entityId} - ${entry.action}` : ""}
          </DialogDescription>
        </DialogHeader>

        {formatted && (
          <>
            {!formatted.isValidJson && (
              <p className="text-sm text-muted-foreground">
                This content is not valid JSON, so it is shown as-is.
              </p>
            )}
            <pre
              tabIndex={0}
              aria-label="Changes content"
              className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 font-mono text-sm whitespace-pre"
            >
              {formatted.text}
            </pre>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={copyToClipboard} disabled={!formatted}>
            <Copy className="mr-2 h-4 w-4" /> Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
