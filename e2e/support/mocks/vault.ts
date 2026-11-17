import { reply, type MockApi, type MockRequest } from "../mock-api";

/**
 * Mocks for the Vault (secrets), following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * WebAPI/EndPoints/Secrets and Application/Secrets). Successes are HTTP 200 `{ resultType: 0, data }`.
 *
 * - Every secret DTO (SecretGetResult / Create / Update) is `{ id, name, apiKey, isActive, isDeleted, createdOn, lastUpdatedOn }`.
 *   The list returns `apiKey` in clear text for every row, not only on reveal; the UI masks it client-side.
 * - Delete is a soft delete (DeleteSecretCommandHandler sets IsDeleted) and the list hides deleted rows through the
 *   global query filter (MasterDataDbContext: `HasQueryFilter(m => !m.IsDeleted)`).
 * - Create validators run in the ValidatorBehavior order: DataAnnotations first ([Required] = WKFLOMD0002,
 *   [MaxLength(500)] = WKFLOMD0004 on `Name` and `ApiKey`; a whitespace-only string fails [Required]), then the business validators.
 * - Update and delete of a missing or deleted secret fail BeExistingSecret: HTTP 400 `Secret` / `WKFLOMD0602`.
 * - Update (SecretUpdate endpoint) starts from the stored secret and then maps the request over it. UpdateSecretCommand's
 *   mapping has no IgnoreNullValues, so a body without `apiKey` ends up with a null ApiKey and fails [Required] (WKFLOMD0002).
 *   Verified by code reading (UpdateSecretCommand mapping has no IgnoreNullValues); not run against a live API.
 * - Error bodies: `{ resultType: 2, errors: [{ code, property }] }` (property names are PascalCase member names).
 */
export interface StoredSecret {
  id: number;
  name: string;
  apiKey: string;
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
}

export const SECRET_IDS = { long: 1, short: 2, inactive: 3 } as const;

const CREATED_ON = "2026-01-15T09:00:00Z";

/** Obviously fake values. The long one is masked as first4 + dots + last4, the short one (8 chars or fewer) fully. */
export const FAKE_KEYS = { long: "e2e-fake-key-0001-wxyz", short: "e2e-key", inactive: "e2e-fake-key-0003-abcd" } as const;

export function createSecretFixtures(): StoredSecret[] {
  return [
    { id: SECRET_IDS.long, name: "e2e_primary", apiKey: FAKE_KEYS.long, isActive: true, isDeleted: false, createdOn: CREATED_ON, lastUpdatedOn: null },
    { id: SECRET_IDS.short, name: "e2e_short", apiKey: FAKE_KEYS.short, isActive: true, isDeleted: false, createdOn: CREATED_ON, lastUpdatedOn: null },
    { id: SECRET_IDS.inactive, name: "e2e_dormant", apiKey: FAKE_KEYS.inactive, isActive: false, isDeleted: false, createdOn: CREATED_ON, lastUpdatedOn: null },
  ];
}

/** The body the API sends for HTTP 400 / 404 / 500: `{ resultType, errors: [{ code, property }] }`. */
export function errorReply(status: 400 | 404 | 500, ...errors: Array<[property: string, code: string]>) {
  const resultType = status === 400 ? 2 : status === 404 ? 4 : 5;
  return reply({ resultType, errors: errors.map(([property, code]) => ({ code, property })) }, status);
}

/** DataAnnotations errors for Name and ApiKey, in property order. */
function annotationErrors(name: unknown, apiKey: unknown): Array<[string, string]> {
  const errors: Array<[string, string]> = [];
  for (const [property, value] of [["Name", name], ["ApiKey", apiKey]] as const) {
    if (typeof value !== "string" || value.trim() === "") errors.push([property, "WKFLOMD0002"]);
    else if (value.length > 500) errors.push([property, "WKFLOMD0004"]);
  }
  return errors;
}

export interface VaultStore {
  /** Includes soft-deleted rows, like the table; the list handler filters them. */
  secrets: StoredSecret[];
}

/** Registers the Vault handlers on `mockApi` and returns the store behind them. */
export function installVaultMocks(mockApi: MockApi, options: { secrets?: StoredSecret[] } = {}): VaultStore {
  const store: VaultStore = { secrets: options.secrets ?? createSecretFixtures() };
  const { secrets } = store;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();
  const live = (id: string) => secrets.find((secret) => String(secret.id) === id && !secret.isDeleted);
  const secretMustExist = (): [string, string] => ["Secret", "WKFLOMD0602"];

  mockApi.on("GET", "/md/api/v1/secrets", () => secrets.filter((secret) => !secret.isDeleted));

  mockApi.on("POST", "/md/api/v1/secret", ({ body }: MockRequest) => {
    const input = body as { name?: unknown; apiKey?: unknown; isActive?: unknown };
    const errors = annotationErrors(input.name, input.apiKey);
    if (errors.length > 0) return errorReply(400, ...errors);
    const secret: StoredSecret = {
      id: secrets.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      name: input.name as string,
      apiKey: input.apiKey as string,
      isActive: input.isActive === true,
      isDeleted: false,
      createdOn: now(),
      lastUpdatedOn: null,
    };
    secrets.push(secret);
    return { ...secret };
  });

  mockApi.on("PUT", "/md/api/v1/secret/:id", ({ params, body }: MockRequest) => {
    const input = body as { name?: unknown; apiKey?: unknown; isActive?: unknown };
    const secret = live(params.id);
    // The merged command: the stored name is overwritten by the body's (null when absent), same for apiKey.
    const errors = annotationErrors(input.name, input.apiKey);
    if (!secret) return errorReply(400, ...errors, secretMustExist());
    if (errors.length > 0) return errorReply(400, ...errors);
    secret.name = input.name as string;
    secret.apiKey = input.apiKey as string;
    if (typeof input.isActive === "boolean") secret.isActive = input.isActive;
    secret.lastUpdatedOn = now();
    return { ...secret };
  });

  mockApi.on("DELETE", "/md/api/v1/secret/:id", ({ params }: MockRequest) => {
    const secret = live(params.id);
    if (!secret) return errorReply(400, secretMustExist());
    secret.isDeleted = true;
    return { id: secret.id };
  });

  return store;
}
