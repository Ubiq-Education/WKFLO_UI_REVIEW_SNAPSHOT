import type { Tag } from "@shared/schema";
import type { DateFormat, TimeFormat } from "@shared/utils/format-date-time";

// Type definitions for AI models
export interface AIModel {
  id: number;
  name: string;
  provider: string;
  endpoint: string;
  deploymentName: string;
  model: string;
  apiVersion: string;
  type: string;
  secretId: number | null;
  authMode?: 'apiKey' | 'managedIdentity';
  createdOn: string;
  lastUpdatedOn: string | null;
  isActive?: boolean;
  tags?: Tag[];
}


// Type definitions for AI Credit (per-AIModel token pricing/multiplier config, WI 7384)
export interface AICredit {
  id: number;
  aiModelId: number;
  tokensIn: number;
  costInMTok: number;
  tokensOut: number;
  costOutMTok: number;
  totalCost: number; // read-only, server-computed = costInMTok + costOutMTok
  multiplierIn: number;
  multiplierOut: number;
  credits: number; // read-only, server-computed = (tokensIn * multiplierIn / 1000) + (tokensOut * multiplierOut / 1000)
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
}


// Type definitions for tenant-wide settings (US 7740) - GET/PUT /md/api/v1/tenant/settings.
// The server always returns a value for every setting, filling in defaults (UTC / 24h / yyyy-MM-dd).
// DateFormat/TimeFormat live in the shared formatter so the chat widget can use them too.
export type { DateFormat, TimeFormat };

export interface TenantSettings {
  timeZone: string; // IANA id, e.g. "Europe/London"
  timeFormat: TimeFormat;
  dateFormat?: DateFormat; // .NET pattern from DATE_FORMATS; older servers omit it, so resolve with resolveDateFormat
  lastUpdatedOn?: string | null;
}

// PUT body: omitted (undefined) settings are left unchanged server-side.
export interface UpdateTenantSettingsRequest {
  timeZone?: string;
  timeFormat?: TimeFormat;
  dateFormat?: DateFormat;
}

// Type definitions for secrets
export interface Secret {
  id: number;
  name: string;
  apiKey: string;
  createdOn: string;
  lastUpdatedOn: string | null;
  isActive?: boolean; // Add isActive flag for toggling
}

 
// GET /md/api/v1/me/permissions - accessibleTenantGuids is empty for super power users (they see every tenant).
export interface MyPermissions {
  isSuperPowerUser: boolean;
  accessibleTenantGuids: string[];
}

// Super Power Users admin (Settings): GET/POST /md/api/v1/super-power-users, DELETE .../{id}
export interface SuperPowerUserEntry {
  id: number;
  email: string;
  createdBy: string | null;
  createdOn: string;
}

// Tenant access admin (Settings): GET/POST /md/api/v1/tenant-access, DELETE .../{id}
export interface TenantAccessEntry {
  id: number;
  tenantGuid: string;
  tenantName: string;
  email: string;
  createdBy: string | null;
  createdOn: string;
}

// Web origins (Settings, super power users): GET /md/api/v1/tenant/web-origins. Read-only; includes soft-deleted rows.
export interface TenantWebOrigin {
  id: number;
  webOriginType: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
}

export interface AddTenantAccessRequest {
  tenantGuid: string;
  email: string;
}

// GET /md/api/v1/tenants
export interface TenantSummary {
  id: string;
  name: string;
  guid: string;
}
