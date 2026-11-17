import { reply, replyRaw, type MockApi, type MockRequest } from "../mock-api";

/**
 * Mocks for the Knowledge area, following the real MD API (wkflo_services/AMAIS_WKFLO_MD_API,
 * WebAPI/EndPoints/Tenant/knowledge and Application/Knowledge). Successes are HTTP 200 `{ resultType: 0, data }`.
 *
 * - List (TenantknowledgeList): TenantKnowledgeGetResult `{ id, fileName, contentType, tags, blobUrl, description, timestamp }`.
 * - Upload (TenantknowledgeUploader): multipart form with the form fields `file` and `tags` (a JSON string, as the UI sends it).
 *   A request without a file part is HTTP 400 `Uploader` / "No files were uploaded." (the code is a free-text message there).
 *   Files with a length of 0 are skipped, so an empty upload still answers 200 with an empty list. Success data is the
 *   list of "Indexed: {fileName}" strings. The handler has no content-type or extension check of its own.
 * - Tags (UpdateTenantKnowledgeTagsCommandHandler): unknown document is HTTP 404 with an empty `errors` list
 *   (`new NotFoundResult()`); a failed update is HTTP 500 `Tags` / "Failed to update document tags". Success data is `true`.
 * - Delete (DeleteTenantKnowledgeCommandValidator): unknown document fails the validator, HTTP 400 `Knowledge` / `WKFLOMD0702`
 *   (ErrorConst.KnowledgeMustExist). Success data is `{ id }`.
 * - Download (TenantknowledgeDownloader): the file bytes with the stored content type; an unknown document is HTTP 404
 *   `Document` / a free-text message. The UI never shows that body, it shows its own "Download failed" text.
 * - Search (SearchTenantKnowledgeQueryHandler): POST `{ query, tags, limit }` answers `[{ similarity, source, text }]`.
 *   The tags filter is applied by Elasticsearch (SearchAllKnowledgeAsync). `text` is a highlight fragment wrapped in
 *   `<strong>` tags (same method), so the UI renders it as HTML. Similarity is the hit score divided by the best
 *   score (maxScore), so the top hit of every response is 1.0, also after the tags filter, and hits come best first.
 */
export interface StoredDocument {
  id: string;
  fileName: string;
  contentType: string;
  /** The real index can hold documents without a tags field, which the API maps to null. */
  tags: string[] | null;
  blobUrl: string | null;
  description: string | null;
  timestamp: string;
}

export interface SearchHit {
  /** File name of the indexed document the fragment comes from. */
  source: string;
  similarity: number;
  /** Highlight fragment (HTML). */
  text: string;
}

export interface MultipartPart {
  name: string;
  filename: string | null;
  contentType: string | null;
  value: string;
}

export interface UploadRequest {
  contentType: string;
  authorization: string | undefined;
  tenantGuid: string | undefined;
  parts: MultipartPart[];
}

export interface KnowledgeStore {
  documents: StoredDocument[];
  /** Fragments the search endpoint can return, with raw scores (the handler normalises them). With tags in the request only hits of documents carrying one of them stay. */
  searchHits: SearchHit[];
  /** Document text served by the download endpoint, keyed by document id. */
  contents: Map<string, string>;
  uploads: UploadRequest[];
  searches: Array<{ query: string; tags: string[]; limit: number }>;
  tagUpdates: Array<{ id: string; tags: string[] }>;
  downloads: Array<{ id: string; authorization: string | undefined; tenantGuid: string | undefined }>;
}

const TIMESTAMP = "2026-01-15T09:00:00Z";

export const DOC_IDS = { handbook: "e2e-doc-1", faq: "e2e-doc-2", budget: "e2e-doc-3" } as const;

export function createKnowledgeFixtures(): StoredDocument[] {
  return [
    {
      id: DOC_IDS.handbook,
      fileName: "e2e-handbook.pdf",
      contentType: "application/pdf",
      tags: ["policy"],
      blobUrl: "https://files.e2e.test/e2e-handbook.pdf",
      description: null,
      timestamp: TIMESTAMP,
    },
    // No blobUrl (the UI hides Download) and no tags field at all.
    { id: DOC_IDS.faq, fileName: "e2e-faq.txt", contentType: "text/plain", tags: null, blobUrl: null, description: null, timestamp: TIMESTAMP },
    {
      id: DOC_IDS.budget,
      fileName: "e2e-budget.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      tags: ["finance", "2026"],
      blobUrl: "https://files.e2e.test/e2e-budget.xlsx",
      description: null,
      timestamp: TIMESTAMP,
    },
  ];
}

/** The body the API sends for HTTP 400 / 404 / 500: `{ resultType, errors: [{ code, property }] }`. */
export function errorReply(status: 400 | 404 | 500, ...errors: Array<[property: string, code: string]>) {
  const resultType = status === 400 ? 2 : status === 404 ? 4 : 5;
  return reply({ resultType, errors: errors.map(([property, code]) => ({ code, property })) }, status);
}

/** Splits a multipart/form-data body (text only) into its parts. */
export function parseMultipart(contentType: string, body: string): MultipartPart[] {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundary) return [];
  const delimiter = `--${boundary[1] ?? boundary[2]}`;
  return body
    .split(delimiter)
    .map((chunk) => chunk.replace(/^\r\n/, "").replace(/\r\n$/, ""))
    .filter((chunk) => chunk.includes("\r\n\r\n"))
    .map((chunk) => {
      const split = chunk.indexOf("\r\n\r\n");
      const head = chunk.slice(0, split);
      const disposition = /content-disposition:[^\r\n]*/i.exec(head)?.[0] ?? "";
      return {
        name: /\bname="([^"]*)"/i.exec(disposition)?.[1] ?? "",
        filename: /\bfilename="([^"]*)"/i.exec(disposition)?.[1] ?? null,
        contentType: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? null,
        value: chunk.slice(split + 4),
      };
    });
}

/** Registers the Knowledge handlers on `mockApi` and returns the store behind them. */
export function installKnowledgeMocks(mockApi: MockApi, options: { documents?: StoredDocument[] } = {}): KnowledgeStore {
  const store: KnowledgeStore = {
    documents: options.documents ?? createKnowledgeFixtures(),
    searchHits: [
      { source: "e2e-handbook.pdf", similarity: 0.8, text: "Visitors must <strong>sign in</strong> at the front desk." },
      { source: "e2e-faq.txt", similarity: 0.4, text: "Opening hours are listed on the <strong>help</strong> page." },
    ],
    contents: new Map([
      [DOC_IDS.handbook, "E2E handbook fake content"],
      [DOC_IDS.budget, "E2E budget fake content"],
    ]),
    uploads: [],
    searches: [],
    tagUpdates: [],
    downloads: [],
  };
  const { documents } = store;
  let uploadCount = 0;
  const find = (id: string) => documents.find((doc) => doc.id === id);

  mockApi.on("GET", "/md/api/v1/tenant/knowledge", () => documents);

  mockApi.on("PUT", "/md/api/v1/tenant/knowledge/:id/tags", ({ params, body }: MockRequest) => {
    const doc = find(params.id);
    if (!doc) return reply({ resultType: 4, errors: [] }, 404);
    const tags = (body as { tags: string[] }).tags;
    store.tagUpdates.push({ id: params.id, tags });
    doc.tags = tags;
    return true;
  });

  mockApi.on("DELETE", "/md/api/v1/tenant/knowledge/:id", ({ params }: MockRequest) => {
    const doc = find(params.id);
    if (!doc) return errorReply(400, ["Knowledge", "WKFLOMD0702"]);
    documents.splice(documents.indexOf(doc), 1);
    return { id: doc.id };
  });

  mockApi.on("GET", "/md/api/v1/tenant/knowledge/download/:id", ({ params, headers }: MockRequest) => {
    store.downloads.push({ id: params.id, authorization: headers["authorization"], tenantGuid: headers["amais-wkflo-tenant-guid"] });
    const doc = find(params.id);
    if (!doc) {
      return errorReply(404, ["Document", `Document with ID ${params.id} not found or you don't have permission to access it`]);
    }
    return replyRaw(store.contents.get(doc.id) ?? "", {
      contentType: doc.contentType,
      headers: { "content-disposition": `attachment; filename="${doc.fileName}"` },
    });
  });

  mockApi.on("POST", "/md/api/v1/tenant/knowledge/uploader", ({ headers, body }: MockRequest) => {
    const contentType = headers["content-type"] ?? "";
    const parts = typeof body === "string" ? parseMultipart(contentType, body) : [];
    store.uploads.push({ contentType, authorization: headers["authorization"], tenantGuid: headers["amais-wkflo-tenant-guid"], parts });
    const files = parts.filter((part) => part.filename !== null);
    if (files.length === 0) return errorReply(400, ["Uploader", "No files were uploaded."]);

    // The endpoint reads `tags` as a JSON list and falls back to a comma-separated string.
    const rawTags = parts.find((part) => part.name === "tags")?.value ?? "";
    let tags: string[] = [];
    try {
      tags = rawTags ? (JSON.parse(rawTags) as string[]) : [];
    } catch {
      tags = rawTags.split(",").map((tag) => tag.trim()).filter(Boolean);
    }

    const indexed: string[] = [];
    for (const file of files) {
      // `if (file.Length == 0) continue;`: an empty file is skipped but the request still succeeds.
      if (file.value.length === 0) continue;
      uploadCount += 1;
      const id = `e2e-upload-${uploadCount}`;
      documents.push({
        id,
        fileName: file.filename as string,
        contentType: file.contentType ?? "application/octet-stream",
        tags,
        blobUrl: `https://files.e2e.test/${file.filename}`,
        description: null,
        timestamp: new Date(Date.UTC(2026, 2, 1, 10, uploadCount, 0)).toISOString(),
      });
      store.contents.set(id, file.value);
      indexed.push(`Indexed: ${file.filename}`);
    }
    return indexed;
  });

  mockApi.on("POST", "/md/api/v1/tenant/knowledge/query", ({ body }: MockRequest) => {
    const input = body as { query: string; tags: string[]; limit: number };
    store.searches.push(input);
    const hits = store.searchHits.filter((hit) => {
      if (input.tags.length === 0) return true;
      const tags = documents.find((doc) => doc.fileName === hit.source)?.tags ?? [];
      return input.tags.some((tag) => tags.includes(tag));
    });
    // Same normalisation as the provider: score / maxScore, best hit first.
    const sorted = [...hits].sort((a, b) => b.similarity - a.similarity).slice(0, input.limit);
    const max = Math.max(0, ...hits.map((hit) => hit.similarity));
    return sorted.map((hit) => ({ ...hit, similarity: max > 0 ? hit.similarity / max : 0 }));
  });

  return store;
}
