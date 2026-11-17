import { useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Maximize2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import FilterButton from "@/components/ui/filter-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import type { AuditAction, AuditLogEntry, AuditLogPage } from "@shared/schema";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";
import { AuditChangesDialog } from "./audit-changes-dialog";

const PAGE_SIZE = 25;

const ACTIONS: AuditAction[] = ["Create", "Update", "Delete"];

// Master Data entity types that flow through MasterDataDbContext's audit interceptor.
// Kept as a static list (rather than fetched) since the MD API's audit endpoint filters
// by name, not by an enumerable lookup. Mirrors every DbSet<T> in IMasterDataDbContext
// (wkflo_services) except AuditLogEntry itself - update this list if that interface changes.
const ENTITY_TYPES = [
  "Tenant",
  "Agent",
  "MarketplaceAgent",
  "TenantAgent",
  "PublishedTenantAgent",
  "MarketplaceTool",
  "TenantTool",
  "PublishedTenantTool",
  "AgentTool",
  "AgentChatSetting",
  "PredefinedPrompt",
  "AIModel",
  "AICredit",
  "Secret",
  "ToolOAuthToken",
  "McpOAuthPendingFlow",
  "WebOrigin",
  "Conversation",
  "ConversationAnalysis",
  "UserStar",
  "UserInstall",
  "User",
  "MessageTopicClassification",
  "ClassificationJob",
  "Tag",
  "EntityTag",
  "AgentAllowedSpinUpAgent",
  "DxpIntegration",
  "ContactFormPluginLog",
];

const ACTION_BADGE_VARIANT: Record<AuditAction, "default" | "secondary" | "destructive"> = {
  Create: "default",
  Update: "secondary",
  Delete: "destructive",
};

const ALL_FILTER_VALUE = "all";
const ACTOR_DEBOUNCE_MS = 400;

export default function AuditIndex() {
  const token = useAuth();
  const context = useContext(DataContext);

  const [entityType, setEntityTypeState] = useState<string>(ALL_FILTER_VALUE);
  const [action, setActionState] = useState<string>(ALL_FILTER_VALUE);
  const [actorInput, setActorInput] = useState("");
  const [actor, setActor] = useState("");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Each filter setter resets `page` synchronously in the same state update (React batches
  // these into a single re-render), so only one request fires per filter change - rather than
  // resetting `page` via a separate useEffect, which would fire one request for
  // (new filter, stale page) before a second, superseding request for (new filter, page 1).
  function setEntityType(value: string) {
    setEntityTypeState(value);
    setPage(1);
  }

  function setAction(value: string) {
    setActionState(value);
    setPage(1);
  }

  function setDateFrom(value: string) {
    setDateFromState(value);
    setPage(1);
  }

  function setDateTo(value: string) {
    setDateToState(value);
    setPage(1);
  }

  // The actor text input is debounced before it drives a request; the debounce timer commits
  // both the settled value and the page reset together so that, again, only one request fires.
  useEffect(() => {
    const timer = setTimeout(() => {
      setActor(actorInput);
      setPage(1);
    }, ACTOR_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [actorInput]);

  const hasActiveFilters =
    entityType !== ALL_FILTER_VALUE || action !== ALL_FILTER_VALUE || !!actor.trim() || !!dateFrom || !!dateTo;

  const params = new URLSearchParams();
  if (entityType !== ALL_FILTER_VALUE) params.set("entityType", entityType);
  if (action !== ALL_FILTER_VALUE) params.set("action", action);
  if (actor.trim()) params.set("actor", actor.trim());
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));

  const queryUrl = `/md/api/v1/tenant/audit?${params.toString()}`;

  const { data, isLoading, isError, error, refetch } = useQuery<AuditLogPage>({
    queryKey: [queryUrl, token, context.selectedTenantGuid],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  const entries = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;

  // If entries got deleted/aged out between fetches while the user was sitting on a later
  // page, the server can report a `totalPages` smaller than the current `page`. The response
  // then comes back with an empty `items` array and, since the pager only renders alongside
  // entries, the user would otherwise have no visible way back to page 1. Clamp here instead.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function clearFilters() {
    setEntityTypeState(ALL_FILTER_VALUE);
    setActionState(ALL_FILTER_VALUE);
    setActorInput("");
    setActor("");
    setDateFromState("");
    setDateToState("");
    setPage(1);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <Combobox
            options={[
              { value: ALL_FILTER_VALUE, label: "All entity types" },
              ...ENTITY_TYPES.map((type) => ({ value: type, label: type })),
            ]}
            value={entityType}
            onValueChange={setEntityType}
            placeholder="Entity type"
            searchPlaceholder="Search entity types..."
            emptyText="No entity types found."
            className="w-full md:w-52"
          />

          <Input
            type="search"
            placeholder="Filter by actor (name or email)..."
            value={actorInput}
            onChange={(e) => setActorInput(e.target.value)}
            className="max-w-sm"
          />

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
              aria-label="From date"
            />
            <span className="text-sm text-gray-500">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
              aria-label="To date"
            />
          </div>

          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <FilterButton active={action === ALL_FILTER_VALUE} onClick={() => setAction(ALL_FILTER_VALUE)}>
            All actions
          </FilterButton>
          {ACTIONS.map((a) => (
            <FilterButton key={a} active={action === a} onClick={() => setAction(a)}>
              {a}
            </FilterButton>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 bg-card animate-pulse rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load audit log</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error instanceof Error ? error.message : "An unexpected error occurred."}</span>
            <Button variant="outline" size="sm" className="self-start" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : entries.length > 0 ? (
        <>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Entity type</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>{entry.entityType}</TableCell>
                    <TableCell>{entry.entityId}</TableCell>
                    <TableCell>
                      <Badge variant={ACTION_BADGE_VARIANT[entry.action]}>{entry.action}</Badge>
                    </TableCell>
                    <TableCell>{entry.actorUserName || entry.actorUserEmail || "—"}</TableCell>
                    <TableCell className="max-w-xs">
                      {entry.changes === null ? (
                        "—"
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 flex-1 truncate">{entry.changes}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label={`View changes for ${entry.entityType} ${entry.entityId}`}
                            onClick={() => setSelectedEntry(entry)}
                          >
                            <Maximize2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <Pagination className="mt-6 justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                    className={cn(page <= 1 && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-4 text-sm text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages, p + 1));
                    }}
                    className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No audit log entries found</h3>
          <p className="text-gray-500 mt-2">
            {hasActiveFilters
              ? "Try adjusting your filters."
              : "Create, update, or delete a Master Data record to see it appear here."}
          </p>
        </div>
      )}

      <AuditChangesDialog entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
