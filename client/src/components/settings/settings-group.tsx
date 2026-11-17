import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional footer (e.g. a Save button) rendered below the group's fields, separated by a border. */
  footer?: ReactNode;
  className?: string;
}

// A titled card that groups related settings inside a section (e.g. "Date & time" inside General).
// Sections are expected to stack several of these, so keep it purely presentational.
export default function SettingsGroup({ title, description, children, footer, className }: SettingsGroupProps) {
  return (
    <Card className={cn("border-border", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>
      ) : null}
    </Card>
  );
}
