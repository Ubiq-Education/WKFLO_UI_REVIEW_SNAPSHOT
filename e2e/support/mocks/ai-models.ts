import { reply, type MockApi, type MockRequest } from "../mock-api";

/**
 * Mocks for the AI Models page, following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * Application/AIModels, Application/Secrets, Application/Tags and WebAPI/EndPoints):
 *
 * - Success is HTTP 200 `{ data }` (BaseEndPoint.AmaisWkfloResult returns Ok(result), even where the
 *   [ProducesResponseType] attribute says 201). Create returns AIModelCreateResult, update AIModelUpdateResult,
 *   delete `{ id }`; the UI only reads the list shape (AIModelGetResult, with `tags` taken from EntityTags).
 * - ValidatorBehavior runs the DataAnnotations first ([Required] -> `WKFLOMD0002`, [MaxLength] -> `WKFLOMD0004`;
 *   a failing [Required] hides the same property's MaxLength) and then the business validators; the two lists are
 *   joined, nothing short-circuits. Property names are the C# property names (`Name`, `Model`, `Type`, ...).
 * - Create / update with `authMode` managedIdentity on a provider other than azure fails `WKFLOMD0504`
 *   (property `AuthMode`). Update and delete of a missing or deleted model fail the validator: HTTP 400
 *   `WKFLOMD0502` (property `AIModel`). GET of a missing model is HTTP 404 with an empty `errors` list.
 * - AIModel has a global `!IsDeleted` query filter (MasterDataDbContext), so deleted models vanish from the list
 *   and from GET-by-id.
 * - Linked secret: `GET /secrets/available` returns the active secrets that no model uses yet
 *   (ListAvailableSecretsQueryHandler), `GET /secret/:id` returns SecretGetResult (no description / provider).
 * - Tags: `AssignTagToEntity` and `UnassignTagFromEntity` (WKFLOMD0901 unknown tag, 0903 already assigned,
 *   0904 not assigned, 0905 invalid entity type).
 */

export interface StoredModel {
  id: number;
  name: string;
  model: string;
  deploymentName: string | null;
  provider: string;
  endpoint: string | null;
  apiVersion: string | null;
  type: string;
  authMode: string;
  secretId: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
}

export interface StoredSecret {
  id: number;
  name: string;
  apiKey: string;
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
  lastUpdatedOn: string | null;
}

export interface StoredTag {
  id: number;
  name: string;
  color: string | null;
  createdOn: string;
  lastUpdatedOn: string | null;
}

export const MODEL_IDS = { openai: 1, azureKey: 2, azureIdentity: 3 } as const;
export const SECRET_IDS = { keyOne: 1, keyTwo: 2, keyThree: 3, keyFour: 4, inactive: 5 } as const;

const CREATED_ON = "2026-01-15T09:00:00Z";

export function createModelFixtures(): StoredModel[] {
  return [
    {
      id: 1,
      name: "E2E OpenAI Model",
      model: "e2e-gpt",
      deploymentName: null,
      provider: "openai",
      endpoint: null,
      apiVersion: null,
      type: "chat",
      authMode: "apiKey",
      secretId: SECRET_IDS.keyOne,
      isActive: true,
      isDeleted: false,
      createdOn: CREATED_ON,
      lastUpdatedOn: null,
    },
    {
      id: 2,
      name: "E2E Azure Key Model",
      model: "e2e-azure-gpt",
      deploymentName: "e2e-deployment",
      provider: "azure",
      endpoint: "https://e2e-endpoint.example.test/",
      apiVersion: "2024-01-01",
      type: "text",
      authMode: "apiKey",
      secretId: SECRET_IDS.keyTwo,
      isActive: true,
      isDeleted: false,
      createdOn: CREATED_ON,
      lastUpdatedOn: null,
    },
    {
      id: 3,
      name: "E2E Azure Identity Model",
      model: "e2e-azure-reasoner",
      deploymentName: "e2e-identity-deployment",
      provider: "azure",
      endpoint: "https://e2e-identity.example.test/",
      apiVersion: "2024-02-01",
      type: "reasoning",
      authMode: "managedIdentity",
      secretId: null,
      isActive: false,
      isDeleted: false,
      createdOn: CREATED_ON,
      lastUpdatedOn: null,
    },
  ];
}

export function createSecretFixtures(): StoredSecret[] {
  const secret = (id: number, name: string, isActive = true): StoredSecret => ({
    id,
    name,
    apiKey: `e2e-not-a-real-key-${id}`,
    isActive,
    isDeleted: false,
    createdOn: CREATED_ON,
    lastUpdatedOn: null,
  });
  return [
    secret(1, "E2E Key One"),
    secret(2, "E2E Key Two"),
    secret(3, "E2E Key Three"),
    secret(4, "E2E Key Four"),
    secret(5, "E2E Key Inactive", false),
  ];
}

export function createTagFixtures(): StoredTag[] {
  const tag = (id: number, name: string, color: string | null): StoredTag => ({
    id,
    name,
    color,
    createdOn: CREATED_ON,
    lastUpdatedOn: null,
  });
  return [tag(1, "E2E Tag", "#3b82f6"), tag(2, "E2E Priority", "#ef4444"), tag(3, "E2E Archive", null), tag(4, "E2E Review", "#10b981")];
}

/**
 * The reply of a failed command: HTTP 400 is an InvalidResult (`resultType` 2), 404 a NotFoundResult (4) and
 * 500 an UnexpectedResult (5); see AMAIS.WKFLO.Common/Models/Results/ResultType.cs. Errors are `{ code, property }`
 * pairs, passed here as `[property, code]`.
 */
export function errorReply(status: 400 | 404 | 500, ...errors: Array<[property: string, code: string]>) {
  const resultType = status === 400 ? 2 : status === 404 ? 4 : 5;
  return reply({ resultType, errors: errors.map(([property, code]) => ({ code, property })) }, status);
}

/** An unhandled server error: HTTP 500 with the generic `WKFLO0001` code and no property. */
export const serverError = () => errorReply(500, ["", "WKFLO0001"]);

/** The recorded body of the last `method` call to `pattern`, or undefined when there was none. */
export function lastBody<T = Record<string, unknown>>(mockApi: MockApi, method: "POST" | "PUT" | "DELETE", pattern: string): T | undefined {
  return mockApi.requestsTo(method, pattern).at(-1)?.body as T | undefined;
}

export interface AiModelsStore {
  models: StoredModel[];
  secrets: StoredSecret[];
  tags: StoredTag[];
}

/** The [Required] / [MaxLength] limits of CreateAIModelCommand and UpdateAIModelCommand, in declaration order. */
const FIELD_RULES = [
  { property: "Name", key: "name", required: true, max: 300 },
  { property: "Model", key: "model", required: true, max: 100 },
  { property: "DeploymentName", key: "deploymentName", required: false, max: 100 },
  { property: "Provider", key: "provider", required: true, max: 100 },
  { property: "Endpoint", key: "endpoint", required: false, max: 500 },
  { property: "ApiVersion", key: "apiVersion", required: false, max: 100 },
  { property: "AuthMode", key: "authMode", required: false, max: 50 },
  { property: "Type", key: "type", required: true, max: 100 },
] as const;

/** Technical validation (DataAnnotations), then the AuthMode business rule shared by create and update. */
function validateModelBody(input: Record<string, unknown>): Array<[string, string]> {
  const errors: Array<[string, string]> = [];
  for (const rule of FIELD_RULES) {
    const value = input[rule.key];
    const text = typeof value === "string" ? value : "";
    // [Required] also rejects whitespace-only strings (AllowEmptyStrings is false).
    if (rule.required && text.trim() === "") errors.push([rule.property, "WKFLOMD0002"]);
    else if (text.length > rule.max) errors.push([rule.property, "WKFLOMD0004"]);
  }
  return errors;
}

function authModeInvalidForProvider(input: Record<string, unknown>): boolean {
  const authMode = String(input.authMode ?? "").toLowerCase();
  const provider = String(input.provider ?? "").toLowerCase();
  return authMode === "managedidentity" && provider !== "azure";
}

/**
 * Registers the AI model, linked-secret and tag handlers on `mockApi` and returns the stores behind them.
 * `models`, `secrets` and `tags` replace the default fixtures. Models 1 to 3 start with the tags
 * `AIModel:1` -> E2E Tag, `AIModel:3` -> every tag (a card shows at most three and a "+N" counter).
 */
export function installAiModelsMocks(
  mockApi: MockApi,
  options: { models?: StoredModel[]; secrets?: StoredSecret[]; tags?: StoredTag[] } = {},
): AiModelsStore {
  const models = options.models ?? createModelFixtures();
  const secrets = options.secrets ?? createSecretFixtures();
  const tags = options.tags ?? createTagFixtures();
  const { entityTags } = mockApi;
  // The shared seed's tags and assignments belong to other areas: start from this area's own.
  mockApi.seed.tags.splice(0, mockApi.seed.tags.length, ...(tags as unknown as typeof mockApi.seed.tags));
  entityTags.clear();
  entityTags.set("AIModel:1", [1]);
  entityTags.set("AIModel:3", tags.map((tag) => tag.id));

  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();
  const live = (id: string) => models.find((model) => String(model.id) === id && !model.isDeleted);
  const tagsOf = (modelId: number) => tags.filter((tag) => (entityTags.get(`AIModel:${modelId}`) ?? []).includes(tag.id));
  const toGetResult = (model: StoredModel) => ({ ...model, tags: tagsOf(model.id) });
  const toWriteResult = ({ secretId: _secretId, ...model }: StoredModel) => model;
  const modelMustExist = () => errorReply(400, ["AIModel", "WKFLOMD0502"]);

  mockApi.on("GET", "/md/api/v1/ai-models", () => models.filter((model) => !model.isDeleted).map(toGetResult));

  mockApi.on("GET", "/md/api/v1/ai-model/:id", ({ params }) => {
    const model = live(params.id);
    // GetAIModelByIdQueryHandler returns a bare NotFoundResult(): no error entries.
    return model ? toGetResult(model) : errorReply(404);
  });

  mockApi.on("POST", "/md/api/v1/ai-model", ({ body }: MockRequest) => {
    const input = body as Record<string, unknown>;
    const errors = validateModelBody(input);
    // The business validator runs even when the annotations failed, and its error is appended after theirs.
    if (authModeInvalidForProvider(input)) errors.push(["AuthMode", "WKFLOMD0504"]);
    if (errors.length > 0) return errorReply(400, ...errors);
    const model: StoredModel = {
      id: models.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      name: String(input.name),
      model: String(input.model),
      deploymentName: (input.deploymentName as string | null | undefined) ?? null,
      provider: String(input.provider),
      endpoint: (input.endpoint as string | null | undefined) ?? null,
      apiVersion: (input.apiVersion as string | null | undefined) ?? null,
      type: String(input.type),
      authMode: String(input.authMode ?? "apiKey"),
      secretId: (input.secretId as number | null | undefined) ?? null,
      isActive: input.isActive === true,
      isDeleted: false,
      createdOn: now(),
      lastUpdatedOn: null,
    };
    models.push(model);
    return toWriteResult(model);
  });

  mockApi.on("PUT", "/md/api/v1/ai-model/:id", ({ params, body }: MockRequest) => {
    const input = body as Record<string, unknown>;
    const model = live(params.id);
    const errors = validateModelBody(input);
    // UpdateAIModelCommandValidator: the existence rule comes before the AuthMode rule.
    if (!model) errors.push(["AIModel", "WKFLOMD0502"]);
    if (authModeInvalidForProvider(input)) errors.push(["AuthMode", "WKFLOMD0504"]);
    if (errors.length > 0 || !model) return errorReply(400, ...errors);
    model.name = String(input.name);
    model.model = String(input.model);
    model.deploymentName = (input.deploymentName as string | null | undefined) ?? null;
    model.provider = String(input.provider);
    model.endpoint = (input.endpoint as string | null | undefined) ?? null;
    model.apiVersion = (input.apiVersion as string | null | undefined) ?? null;
    model.type = String(input.type);
    model.authMode = String(input.authMode ?? model.authMode);
    model.secretId = (input.secretId as number | null | undefined) ?? null;
    if (typeof input.isActive === "boolean") model.isActive = input.isActive;
    model.lastUpdatedOn = now();
    return toWriteResult(model);
  });

  mockApi.on("DELETE", "/md/api/v1/ai-model/:id", ({ params }) => {
    const model = live(params.id);
    if (!model) return modelMustExist();
    model.isDeleted = true;
    return { id: model.id };
  });

  // Linked secrets. "Available" = active and not used by any live model (the real query: !s.AIModels.Any()).
  mockApi.on("GET", "/md/api/v1/secrets/available", () =>
    secrets.filter((secret) => secret.isActive && !secret.isDeleted && !models.some((model) => !model.isDeleted && model.secretId === secret.id)),
  );
  mockApi.on("GET", "/md/api/v1/secret/:id", ({ params }) => {
    const secret = secrets.find((item) => String(item.id) === params.id && !item.isDeleted);
    return secret ?? errorReply(404);
  });

  // Tags (Manage Tags dialog and the tag chips on the cards).
  const findTag = (id: string) => tags.find((tag) => String(tag.id) === id);
  mockApi.on("GET", "/md/api/v1/tenant/tags", () => tags);
  mockApi.on("GET", "/md/api/v1/tenant/entity/:entityType/:entityId/tags", ({ params }) => tagsOfEntity(params.entityType, params.entityId));
  const tagsOfEntity = (entityType: string, entityId: string) => {
    const ids = entityTags.get(`${entityType}:${entityId}`) ?? [];
    return tags.filter((tag) => ids.includes(tag.id));
  };
  mockApi.on("POST", "/md/api/v1/tenant/tag/:tagId/entity", ({ params, body }: MockRequest) => {
    const { entityType, entityId } = body as { entityType: string; entityId: number };
    const tag = findTag(params.tagId);
    if (!tag) return errorReply(400, ["Tag", "WKFLOMD0901"]);
    const key = `${entityType}:${entityId}`;
    const ids = entityTags.get(key) ?? [];
    // AssignTagToEntityCommandHandler returns InvalidResult(EntityTag, TagAlreadyAssigned).
    if (ids.includes(tag.id)) return errorReply(400, ["EntityTag", "WKFLOMD0903"]);
    entityTags.set(key, [...ids, tag.id]);
    return { tagId: tag.id, entityType, entityId };
  });
  mockApi.on("DELETE", "/md/api/v1/tenant/tag/:tagId/entity/:entityType/:entityId", ({ params }) => {
    const tag = findTag(params.tagId);
    if (!tag) return errorReply(400, ["Tag", "WKFLOMD0901"]);
    const key = `${params.entityType}:${params.entityId}`;
    const ids = entityTags.get(key) ?? [];
    if (!ids.includes(tag.id)) return errorReply(404, ["EntityTag", "WKFLOMD0904"]);
    entityTags.set(key, ids.filter((id) => id !== tag.id));
    return { tagId: tag.id, entityType: params.entityType, entityId: Number(params.entityId) };
  });

  return { models, secrets, tags };
}
