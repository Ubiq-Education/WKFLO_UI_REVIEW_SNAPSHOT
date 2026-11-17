import { reply, type MockApi, type MockRequest } from "../mock-api";
import { errorReply } from "./tools";

/**
 * Mocks for the Tags area, following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * Endpoints/Tenant/Tags and Application/Tags):
 *
 * - Success is HTTP 200 `{ data }`. Create returns TagCreateResult (adds `tenantId`), update returns
 *   TagUpdateResult, delete returns `{ id }`; the UI only reads the list and detail shapes.
 * - Update and delete of an unknown tag fail the command validator: HTTP 400, `WKFLOMD0901` (TagMustExist).
 *   GET of an unknown tag is HTTP 404 with an empty `errors` list (GetTagByIdQueryHandler).
 * - Unassigning with an unknown tag fails the validator the same way (`WKFLOMD0901`).
 * - Assigning a tag that is already on the entity is HTTP 400 `WKFLOMD0903` (AssignTagToEntityCommandHandler);
 *   assigning an unknown tag is `WKFLOMD0901`. Unassigning a missing assignment is HTTP 404 `WKFLOMD0904`.
 * - Deleting a tag also drops its assignments (the real list queries filter deleted tags out).
 *
 * The tag list and the per-entity assignments live in `mockApi.seed.tags` and `mockApi.entityTags`.
 */
interface MockTag {
  id: number;
  name: string;
  color: string | null;
  createdOn: string;
  lastUpdatedOn: string | null;
}

export const TAG_IDS = { plain: 1, colored: 2, uncolored: 3 } as const;

export function installTagsMocks(mockApi: MockApi): void {
  const { entityTags } = mockApi;
  // The shared seed types a tag's `lastUpdatedOn` as null only; the real API returns a date once edited.
  const tags = mockApi.seed.tags as unknown as MockTag[];
  const created = "2026-01-15T09:00:00Z";
  tags.splice(
    0,
    tags.length,
    { id: 1, name: "E2E Tag", color: "#3b82f6", createdOn: created, lastUpdatedOn: null },
    { id: 2, name: "E2E Priority", color: "#ef4444", createdOn: created, lastUpdatedOn: "2026-01-16T09:00:00Z" },
    { id: 3, name: "E2E Archive", color: null, createdOn: created, lastUpdatedOn: null },
  );
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 2, 1, 10, tick++, 0)).toISOString();
  const find = (id: string) => tags.find((tag) => String(tag.id) === id);
  const tagMustExist = () => errorReply(400, ["Tag", "WKFLOMD0901"]);

  mockApi.on("GET", "/md/api/v1/tenant/tags", () => tags);
  mockApi.on("GET", "/md/api/v1/tenant/tag/:id", ({ params }) => find(params.id) ?? reply({ resultType: 4, errors: [] }, 404));

  mockApi.on("POST", "/md/api/v1/tenant/tag", ({ body }: MockRequest) => {
    const input = body as { name: string; color: string | null };
    const tag = {
      id: tags.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      name: input.name,
      color: input.color,
      createdOn: now(),
      lastUpdatedOn: null,
    };
    tags.push(tag);
    return { ...tag, tenantId: 1 };
  });

  mockApi.on("PUT", "/md/api/v1/tenant/tag/:id", ({ params, body }: MockRequest) => {
    const tag = find(params.id);
    if (!tag) return tagMustExist();
    const input = body as { name: string; color: string | null };
    tag.name = input.name;
    tag.color = input.color;
    tag.lastUpdatedOn = now();
    return { id: tag.id, name: tag.name, color: tag.color, lastUpdatedOn: tag.lastUpdatedOn };
  });

  mockApi.on("DELETE", "/md/api/v1/tenant/tag/:id", ({ params }) => {
    const tag = find(params.id);
    if (!tag) return tagMustExist();
    tags.splice(tags.indexOf(tag), 1);
    for (const [key, ids] of Array.from(entityTags.entries())) entityTags.set(key, ids.filter((id) => id !== tag.id));
    return { id: tag.id };
  });

  mockApi.on("POST", "/md/api/v1/tenant/tag/:tagId/entity", ({ params, body }: MockRequest) => {
    const { entityType, entityId } = body as { entityType: string; entityId: number };
    const tag = find(params.tagId);
    if (!tag) return tagMustExist();
    const key = `${entityType}:${entityId}`;
    const ids = entityTags.get(key) ?? [];
    if (ids.includes(tag.id)) return errorReply(400, ["EntityTag", "WKFLOMD0903"]);
    entityTags.set(key, [...ids, tag.id]);
    return { tagId: tag.id, entityType, entityId };
  });

  mockApi.on("DELETE", "/md/api/v1/tenant/tag/:tagId/entity/:entityType/:entityId", ({ params }) => {
    const key = `${params.entityType}:${params.entityId}`;
    if (!find(params.tagId)) return tagMustExist();
    const ids = entityTags.get(key) ?? [];
    if (!ids.includes(Number(params.tagId))) return errorReply(404, ["EntityTag", "WKFLOMD0904"]);
    entityTags.set(key, ids.filter((id) => id !== Number(params.tagId)));
    return { tagId: Number(params.tagId), entityType: params.entityType, entityId: Number(params.entityId) };
  });
}
