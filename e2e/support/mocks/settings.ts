import { TENANT_A, TENANT_B } from "../fixtures";
import type { MockApi, MockRequest } from "../mock-api";
import { emptyNotFoundReply, errorReply, TENANT_HEADER } from "./marketplace";

/**
 * Mocks for the Settings area, following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * Application/{TenantSettings,SuperPowerUsers,TenantAccesses}). Failure bodies come from `errorReply`.
 *
 * - `GET /tenant/settings` returns the settings of the tenant named by the `amais-wkflo-tenant-guid`
 *   header (GetTenantSettingsQueryHandler). `PUT` validates each value against the same whitelists the UI
 *   mirrors: an unknown value is HTTP 400 with `WKFLOMD1501` (time zone), `WKFLOMD1502` (time format) or
 *   `WKFLOMD1503` (date format) on property `TimeZone` / `TimeFormat` / `DateFormat`
 *   (UpdateTenantSettingsCommandValidator). It answers the saved row with a fresh `lastUpdatedOn`.
 * - `GET/POST/DELETE /super-power-users`: emails are trimmed and lower-cased (PermissionHelper.NormaliseEmail),
 *   the list is ordered by email. Adding an email that is already active is a success that returns the
 *   existing row (AddSuperPowerUserCommandHandler). Removing: unknown or already removed id is HTTP 404
 *   with no errors, the caller's own row is HTTP 400 `WKFLOMD1602`, the last remaining row is `WKFLOMD1603`
 *   (RemoveSuperPowerUserCommandHandler).
 * - `GET/POST/DELETE /tenant-access`: the list covers every tenant, ordered by tenant name then email (the UI
 *   filters to the selected tenant). Adding for an unknown tenant is HTTP 400 `WKFLOMD1604` on `TenantGuid`;
 *   re-adding an active pair returns the existing row; removing an unknown id is HTTP 404 with no errors
 *   (AddTenantAccessCommandHandler, RemoveTenantAccessCommandHandler).
 * - A syntactically invalid email passes the browser's own check only when the form is bypassed; the server
 *   rule is FluentValidation's `EmailAddress()` (`WKFLOMD0011` on `Email`).
 */

export const CALLER_EMAIL = "e2e.user@example.test";

const DATE_FORMATS = [
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "yyyy-MM-dd",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "MMM dd, yyyy",
  "MMMM dd, yyyy",
  "dd MMM, yyyy",
  "dd MMMM, yyyy",
  "ddd, MMMM dd, yyyy",
  "ddd, dd MMMM, yyyy",
];

interface StoredSettings {
  timeZone: string;
  timeFormat: string;
  dateFormat: string;
  lastUpdatedOn: string | null;
}

interface SuperPowerUserRow {
  id: number;
  email: string;
  createdBy: string;
  createdOn: string;
}

interface TenantAccessRow {
  id: number;
  tenantGuid: string;
  tenantName: string;
  email: string;
  createdBy: string;
  createdOn: string;
}

export interface SettingsStore {
  /** Settings per tenant guid. */
  settings: Map<string, StoredSettings>;
  superPowerUsers: SuperPowerUserRow[];
  tenantAccess: TenantAccessRow[];
}

const CREATED_ON = "2026-01-15T09:00:00Z";

export function createSettingsStore(): SettingsStore {
  return {
    settings: new Map([
      [TENANT_A.guid, { timeZone: "Europe/London", timeFormat: "12h", dateFormat: "dd/MM/yyyy", lastUpdatedOn: "2026-02-10T13:05:00Z" }],
      [TENANT_B.guid, { timeZone: "UTC", timeFormat: "24h", dateFormat: "yyyy-MM-dd", lastUpdatedOn: null }],
    ]),
    superPowerUsers: [
      { id: 1, email: "e2e.admin@example.test", createdBy: "e2e.seed@example.test", createdOn: CREATED_ON },
      { id: 2, email: CALLER_EMAIL, createdBy: "e2e.seed@example.test", createdOn: CREATED_ON },
    ],
    tenantAccess: [
      { id: 1, tenantGuid: TENANT_A.guid, tenantName: TENANT_A.name, email: "e2e.member@example.test", createdBy: CALLER_EMAIL, createdOn: CREATED_ON },
      { id: 2, tenantGuid: TENANT_A.guid, tenantName: TENANT_A.name, email: "e2e.reviewer@example.test", createdBy: CALLER_EMAIL, createdOn: CREATED_ON },
      { id: 3, tenantGuid: TENANT_B.guid, tenantName: TENANT_B.name, email: "e2e.partner@example.test", createdBy: CALLER_EMAIL, createdOn: CREATED_ON },
    ],
  };
}

const normalise = (email: string) => email.trim().toLowerCase();
const looksLikeEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

const toSettingsBody = (settings: StoredSettings) => ({ ...settings });

export function installSettingsMocks(mockApi: MockApi, options: { store?: SettingsStore } = {}): SettingsStore {
  const store = options.store ?? createSettingsStore();
  const { seed } = mockApi;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();
  const nextId = (rows: Array<{ id: number }>) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  const settingsFor = (request: MockRequest) => store.settings.get(request.headers[TENANT_HEADER] ?? "");

  mockApi.on("GET", "/md/api/v1/tenant/settings", (request: MockRequest) => {
    const settings = settingsFor(request);
    return settings ? toSettingsBody(settings) : emptyNotFoundReply();
  });

  mockApi.on("PUT", "/md/api/v1/tenant/settings", (request: MockRequest) => {
    const settings = settingsFor(request);
    if (!settings) return emptyNotFoundReply();
    const input = request.body as Partial<StoredSettings>;
    const errors: Array<[string, string]> = [];
    if (input.timeZone != null && !isKnownTimeZone(input.timeZone)) errors.push(["TimeZone", "WKFLOMD1501"]);
    if (input.timeFormat != null && !["12h", "24h"].includes(input.timeFormat)) errors.push(["TimeFormat", "WKFLOMD1502"]);
    if (input.dateFormat != null && !DATE_FORMATS.includes(input.dateFormat)) errors.push(["DateFormat", "WKFLOMD1503"]);
    if (errors.length > 0) return errorReply(400, ...errors);
    if (input.timeZone != null) settings.timeZone = input.timeZone;
    if (input.timeFormat != null) settings.timeFormat = input.timeFormat;
    if (input.dateFormat != null) settings.dateFormat = input.dateFormat;
    settings.lastUpdatedOn = now();
    return toSettingsBody(settings);
  });

  mockApi.on("GET", "/md/api/v1/super-power-users", () =>
    [...store.superPowerUsers].sort((a, b) => a.email.localeCompare(b.email)),
  );

  mockApi.on("POST", "/md/api/v1/super-power-users", ({ body }: MockRequest) => {
    const raw = (body as { email?: string } | undefined)?.email;
    if (!raw) return errorReply(400, ["Email", "WKFLOMD0002"]);
    if (!looksLikeEmail(raw.trim())) return errorReply(400, ["Email", "WKFLOMD0011"]);
    const email = normalise(raw);
    const existing = store.superPowerUsers.find((row) => row.email === email);
    if (existing) return existing;
    const row = { id: nextId(store.superPowerUsers), email, createdBy: CALLER_EMAIL, createdOn: now() };
    store.superPowerUsers.push(row);
    return row;
  });

  mockApi.on("DELETE", "/md/api/v1/super-power-users/:id", ({ params }: MockRequest) => {
    const row = store.superPowerUsers.find((candidate) => String(candidate.id) === params.id);
    if (!row) return emptyNotFoundReply();
    if (row.email === CALLER_EMAIL) return errorReply(400, ["Id", "WKFLOMD1602"]);
    if (store.superPowerUsers.length <= 1) return errorReply(400, ["Id", "WKFLOMD1603"]);
    store.superPowerUsers.splice(store.superPowerUsers.indexOf(row), 1);
    return row;
  });

  mockApi.on("GET", "/md/api/v1/tenant-access", () =>
    [...store.tenantAccess].sort((a, b) => a.tenantName.localeCompare(b.tenantName) || a.email.localeCompare(b.email)),
  );

  mockApi.on("POST", "/md/api/v1/tenant-access", ({ body }: MockRequest) => {
    const input = body as { tenantGuid?: string; email?: string } | undefined;
    const errors: Array<[string, string]> = [];
    if (!input?.tenantGuid) errors.push(["TenantGuid", "WKFLOMD0002"]);
    if (!input?.email) errors.push(["Email", "WKFLOMD0002"]);
    else if (!looksLikeEmail(input.email.trim())) errors.push(["Email", "WKFLOMD0011"]);
    if (errors.length > 0) return errorReply(400, ...errors);
    const tenant = seed.tenants.find((candidate) => candidate.guid === input!.tenantGuid);
    if (!tenant) return errorReply(400, ["TenantGuid", "WKFLOMD1604"]);
    const email = normalise(input!.email!);
    const existing = store.tenantAccess.find((row) => row.tenantGuid === tenant.guid && row.email === email);
    if (existing) return existing;
    const row = { id: nextId(store.tenantAccess), tenantGuid: tenant.guid, tenantName: tenant.name, email, createdBy: CALLER_EMAIL, createdOn: now() };
    store.tenantAccess.push(row);
    return row;
  });

  mockApi.on("DELETE", "/md/api/v1/tenant-access/:id", ({ params }: MockRequest) => {
    const row = store.tenantAccess.find((candidate) => String(candidate.id) === params.id);
    if (!row) return emptyNotFoundReply();
    store.tenantAccess.splice(store.tenantAccess.indexOf(row), 1);
    return row;
  });

  return store;
}

/** The server accepts the IANA ids the runtime knows (TimeZoneIdNormaliser); Node's list stands in for it. */
function isKnownTimeZone(value: string): boolean {
  if (value === "UTC") return true;
  return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf("timeZone").includes(value);
}
