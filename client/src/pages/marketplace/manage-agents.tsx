import { useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Pencil, RefreshCw, Store, Tags } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { MarketplaceAgentCatalogEntry } from "@shared/schema";
import EntityTagsPanel from "@/components/tags/entity-tags-panel";
import EditMarketplaceAgentDialog from "@/components/marketplace/edit-marketplace-agent-dialog";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";

// Fallback avatar shown when a Marketplace agent has no iconUrl (agents shared before this field
// existed, or whose source agent never had a chat icon configured) — colored initials, deterministic
// per name so the same agent always gets the same color across renders/reloads.
const AVATAR_FALLBACK_COLORS = [
  "#F97316", "#0EA5E9", "#8B5CF6", "#10B981", "#EC4899", "#EAB308", "#6366F1", "#14B8A6",
];

function getAgentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getAgentAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_FALLBACK_COLORS[Math.abs(hash) % AVATAR_FALLBACK_COLORS.length];
}

export default function ManageMarketplaceAgents() {
  const token = useAuth();
  const context = useContext(DataContext);
  const [searchQuery, setSearchQuery] = useState("");
  const [taggingAgent, setTaggingAgent] = useState<MarketplaceAgentCatalogEntry | null>(null);
  const [editingAgent, setEditingAgent] = useState<MarketplaceAgentCatalogEntry | null>(null);

  const {
    data: agents,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<MarketplaceAgentCatalogEntry[]>({
    queryKey: ["/md/api/v1/marketplace/agents", token],
    enabled: !!token,
  });

  const filteredAgents = agents?.filter((agent) => {
    if (searchQuery && !agent.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  function formatDate(date: string | null | undefined) {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex items-center mb-6">
        <Store className="mr-3 h-8 w-8 text-orange-500" />
        <h1 className="text-2xl font-semibold">Manage Marketplace Agents</h1>
      </div>

      <p className="text-gray-600 mb-6">
        Every Marketplace agent, across all tenants. Use this page to assign the{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">AMAIS</code> tag (or any other
        tag) to a Marketplace agent by its own catalog id - separate from the Agent tags you
        assign on a tenant's own agent edit page, which do not carry over when an agent is shared
        to the Marketplace. Tags you create here are saved under your currently selected tenant,
        but the Marketplace catalog filter (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">?tag=AMAIS</code>)
        matches by tag name across every tenant, so any tenant works.
      </p>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <Input
          type="search"
          placeholder="Search Marketplace agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-card animate-pulse rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load Marketplace agents</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error instanceof Error ? error.message : "An unexpected error occurred."}</span>
            <Button variant="outline" size="sm" className="self-start" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : filteredAgents && filteredAgents.length > 0 ? (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Installations</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="text-muted-foreground">{agent.id}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        {agent.iconUrl && (
                          <AvatarImage src={agent.iconUrl} alt={`${agent.name} icon`} />
                        )}
                        <AvatarFallback
                          className="text-xs font-semibold text-white"
                          style={{ backgroundColor: getAgentAvatarColor(agent.name) }}
                        >
                          {getAgentInitials(agent.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{agent.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={agent.description ?? undefined}>
                    {agent.description ?? "—"}
                  </TableCell>
                  <TableCell>{agent.type ?? "—"}</TableCell>
                  <TableCell>{agent.installations}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(agent.createdOn)}</TableCell>
                  <TableCell>
                    {agent.tags && agent.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {agent.tags.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant="outline"
                            className="flex items-center gap-1.5 text-xs font-normal"
                            style={tag.color ? { borderColor: tag.color } : {}}
                          >
                            {tag.color && (
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: tag.color }}
                              />
                            )}
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No tags</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingAgent(agent)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setTaggingAgent(agent)}>
                        <Tags className="mr-2 h-4 w-4" /> Manage Tags
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No Marketplace agents found</h3>
          <p className="text-gray-500 mt-2">
            Agents appear here once a tenant shares one to the Marketplace.
          </p>
        </div>
      )}

      <Dialog
        open={!!taggingAgent}
        onOpenChange={(open) => {
          if (!open) {
            setTaggingAgent(null);
            // The list's own "Tags" column reads from this query's cached response (not the
            // tenant-scoped per-entity endpoint EntityTagsPanel uses internally), so refetch on
            // close to pick up any tags assigned/removed while the dialog was open.
            refetch();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Tags — {taggingAgent?.name}</DialogTitle>
            <DialogDescription>
              Assign or remove tags for this Marketplace agent (catalog id {taggingAgent?.id}).
            </DialogDescription>
          </DialogHeader>
          {taggingAgent && (
            <Badge variant="outline" className="w-fit mb-2">
              Marketplace agent #{taggingAgent.id}
            </Badge>
          )}
          {context.selectedTenantGuid ? (
            taggingAgent && <EntityTagsPanel entityType="Agent" entityId={taggingAgent.id} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a tenant from the header above to manage tags.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <EditMarketplaceAgentDialog
        agent={editingAgent}
        onOpenChange={(open) => {
          if (!open) setEditingAgent(null);
        }}
      />
    </div>
  );
}
