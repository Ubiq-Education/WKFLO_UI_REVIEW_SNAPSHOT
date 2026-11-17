import type { MockApi } from "../mock-api";
import { errorReply } from "./ai-models";

/**
 * Mock for the Audit Log page, following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * Application/Audit/Queries/ListAuditLog and WebAPI/EndPoints/Tenant/Audit/AuditLogList.cs):
 *
 * - `GET /tenant/audit?entityType&action&actor&dateFrom&dateTo&page&pageSize` returns HTTP 200
 *   `{ data: { items, totalCount, page, pageSize, totalPages } }`, newest first (OrderByDescending(Timestamp)),
 *   `totalPages = ceil(totalCount / pageSize)`. Items are AuditLogEntryResult (no `tenantGuid`).
 * - `entityType` and `action` are exact matches. `actor` matches `actorUserGuid` exactly or is a case-insensitive
 *   substring of the name or the email. `dateFrom` is an inclusive lower bound; `dateTo` covers the whole day it
 *   names (exclusive bound at midnight of the next day). A bare date binds to midnight, taken as UTC here.
 * - ListAuditLogQueryValidator (HTTP 400, `errors[].code` carries the message text because the rules use plain
 *   WithMessage): an action outside Create / Update / Delete, `Page` < 1, `PageSize` outside 1..100, and
 *   "DateFrom must be less than or equal to DateTo." (property `DateFrom`).
 * - Past the last page the handler simply returns an empty `items` list with the real `totalPages`.
 */

export interface StoredAuditEntry {
  id: number;
  entityType: string;
  entityId: string;
  action: "Create" | "Update" | "Delete";
  actorUserGuid: string | null;
  actorUserName: string | null;
  actorUserEmail: string | null;
  timestamp: string;
  changes: string | null;
  correlationId: string | null;
}

/** Entries 6 to 30 (page 1 at 25 per page) are newer than entries 1 to 5 (page 2), one per day from 2026-01-01. */
export function createAuditFixtures(): StoredAuditEntry[] {
  const day = (n: number) => new Date(Date.UTC(2026, 0, n, 12, 0, 0)).toISOString();
  const entries: StoredAuditEntry[] = [];
  for (let id = 1; id <= 25; id++) {
    entries.push({
      id,
      entityType: "Conversation",
      entityId: String(id),
      action: "Create",
      // Entry 5 is a system write: no actor at all (the table shows a dash).
      actorUserGuid: id === 5 ? null : "e2e-actor-filler",
      actorUserName: id === 5 ? null : "E2E Filler",
      actorUserEmail: id === 5 ? null : "e2e.filler@example.test",
      timestamp: day(id),
      changes: null,
      correlationId: null,
    });
  }
  entries.push(
    {
      id: 26,
      entityType: "Tool",
      entityId: "7",
      action: "Create",
      actorUserGuid: "e2e-actor-admin",
      actorUserName: "E2E Admin",
      actorUserEmail: "e2e.admin@example.test",
      timestamp: day(26),
      changes: null,
      correlationId: null,
    },
    {
      id: 27,
      entityType: "AIModel",
      entityId: "2",
      action: "Update",
      actorUserGuid: "e2e-actor-admin",
      actorUserName: "E2E Admin",
      actorUserEmail: "e2e.admin@example.test",
      timestamp: day(27),
      changes: '{"IsActive":{"old":true,"new":false}}',
      correlationId: "e2e-correlation-27",
    },
    {
      id: 28,
      entityType: "Secret",
      entityId: "3",
      action: "Delete",
      actorUserGuid: "e2e-actor-admin",
      actorUserName: "E2E Admin",
      actorUserEmail: "e2e.admin@example.test",
      timestamp: day(28),
      // Not valid JSON: the dialog must show it as-is.
      changes: "{broken",
      correlationId: null,
    },
    {
      id: 29,
      entityType: "Tag",
      entityId: "1",
      action: "Create",
      // No display name: the table falls back to the email.
      actorUserGuid: "e2e-actor-second",
      actorUserName: null,
      actorUserEmail: "e2e.second@example.test",
      timestamp: day(29),
      changes: null,
      correlationId: null,
    },
    {
      id: 30,
      entityType: "Agent",
      entityId: "1",
      action: "Update",
      actorUserGuid: "e2e-actor-user",
      actorUserName: "E2E User",
      actorUserEmail: "e2e.user@example.test",
      timestamp: day(30),
      changes: '{"Name":{"old":"E2E Agent","new":"E2E Agent Renamed"}}',
      correlationId: null,
    },
  );
  return entries;
}

const ACTIONS = ["Create", "Update", "Delete"];

/** Registers the audit handler and returns the entries behind it (mutate the array to change what later calls see). */
export function installAuditMocks(mockApi: MockApi, options: { entries?: StoredAuditEntry[] } = {}): StoredAuditEntry[] {
  const entries = options.entries ?? createAuditFixtures();

  mockApi.on("GET", "/md/api/v1/tenant/audit", ({ query }) => {
    const entityType = query.get("entityType");
    const action = query.get("action");
    const actor = query.get("actor");
    const dateFrom = query.get("dateFrom");
    const dateTo = query.get("dateTo");
    const page = Number(query.get("page") ?? 1);
    const pageSize = Number(query.get("pageSize") ?? 15);

    const errors: Array<[string, string]> = [];
    if (action && !ACTIONS.includes(action)) errors.push(["Action", `Action must be one of: ${ACTIONS.join(", ")}.`]);
    if (!(page >= 1)) errors.push(["Page", "Page must be greater than or equal to 1."]);
    if (!(pageSize >= 1 && pageSize <= 100)) errors.push(["PageSize", "PageSize must be between 1 and 100."]);
    if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
      errors.push(["DateFrom", "DateFrom must be less than or equal to DateTo."]);
    }
    if (errors.length > 0) return errorReply(400, ...errors);

    const from = dateFrom ? Date.parse(dateFrom) : null;
    const toExclusive = dateTo ? Date.parse(dateTo) + 24 * 60 * 60 * 1000 : null;
    const actorLower = actor?.toLowerCase() ?? null;
    const matching = entries
      .filter((entry) => !entityType || entry.entityType === entityType)
      .filter((entry) => !action || entry.action === action)
      .filter(
        (entry) =>
          !actorLower ||
          entry.actorUserGuid === actor ||
          (entry.actorUserName?.toLowerCase().includes(actorLower) ?? false) ||
          (entry.actorUserEmail?.toLowerCase().includes(actorLower) ?? false),
      )
      .filter((entry) => from === null || Date.parse(entry.timestamp) >= from)
      .filter((entry) => toExclusive === null || Date.parse(entry.timestamp) < toExclusive)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    return {
      items: matching.slice((page - 1) * pageSize, page * pageSize),
      totalCount: matching.length,
      page,
      pageSize,
      totalPages: Math.ceil(matching.length / pageSize),
    };
  });

  return entries;
}
