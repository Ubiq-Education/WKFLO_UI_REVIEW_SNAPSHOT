import { useContext, useId, useMemo, useState } from "react";
import { DataContext } from "@shared/models/chat-models";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAllTenants } from "@/hooks/use-tenant-access-admin";
import { useTenantWebOrigins } from "@/hooks/use-tenant-web-origins";
import type { TenantWebOrigin } from "@/models/definitions";
import SettingsGroup from "@/components/settings/settings-group";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

// Only active, non-deleted SignalR origins are added to the chat widget's CORS allow-list.
export function isInUse(origin: TenantWebOrigin): boolean {
  return origin.isActive && !origin.isDeleted && origin.webOriginType?.toLowerCase() === "signalr";
}

function StatusBadge({ origin }: { origin: TenantWebOrigin }) {
  if (origin.isDeleted) return <Badge variant="destructive">Deleted</Badge>;
  return origin.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>;
}

// Read-only view of the web origins stored for the tenant selected in the top bar.
export default function WebOriginsSettings() {
  const { selectedTenantGuid } = useContext(DataContext);
  const { data: origins, isPending, isError, isSuccess } = useTenantWebOrigins();
  const { data: tenants } = useAllTenants();
  const [showDeleted, setShowDeleted] = useState(false);
  const toggleId = useId();

  const tenantName = tenants?.find((t) => t.guid === selectedTenantGuid)?.name;
  const visibleOrigins = useMemo(
    () => (origins ?? []).filter((o) => showDeleted || !o.isDeleted),
    [origins, showDeleted]
  );

  const title = tenantName ? `Web origins for ${tenantName}` : "Web origins";

  return (
    <SettingsGroup
      title={title}
      description="Chat connections are accepted from the active SignalR origins of all tenants combined. Rows marked “In use” are the ones this tenant contributes."
    >
      {isSuccess ? (
        <div className="flex items-center gap-2">
          <Switch id={toggleId} checked={showDeleted} onCheckedChange={setShowDeleted} />
          <Label htmlFor={toggleId}>Show deleted</Label>
        </div>
      ) : null}

      {!selectedTenantGuid ? (
        <p className="text-sm text-muted-foreground">Select a tenant in the top bar.</p>
      ) : isPending ? (
        <Skeleton className="h-24 w-full" role="status" aria-busy="true">
          <span className="sr-only">Loading web origins</span>
        </Skeleton>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Couldn't load web origins. Please contact Support.</AlertDescription>
        </Alert>
      ) : (
        <Table>
          <caption className="sr-only">Web origins for {tenantName ?? "the selected tenant"}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>In use</TableHead>
              <TableHead>Added on</TableHead>
              <TableHead>Updated on</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleOrigins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No web origins found.
                </TableCell>
              </TableRow>
            ) : (
              visibleOrigins.map((origin) => (
                <TableRow key={origin.id}>
                  <TableCell>{origin.webOriginType}</TableCell>
                  <TableCell>{origin.name}</TableCell>
                  <TableCell>
                    <StatusBadge origin={origin} />
                  </TableCell>
                  <TableCell>{isInUse(origin) ? "Yes" : "No"}</TableCell>
                  <TableCell>{formatDate(origin.createdOn)}</TableCell>
                  <TableCell>{formatDate(origin.lastUpdatedOn)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </SettingsGroup>
  );
}
