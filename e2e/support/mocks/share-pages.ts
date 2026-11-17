import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { reply, type MockApi } from "../mock-api";

/** Paths the share pages and the advanced chat settings panel call. */
export const SHARE_PATHS = {
  get: "/md/api/v1/tenant/agent/:id/chat-setting/:kind",
  sharable: "/md/api/v1/tenant/agent/:id/chat-setting/sharable",
  save: "/md/api/v1/tenant/agent/:id/chat-setting",
  image: "/md/api/v1/tenant/agent/:id/chat-setting/image",
} as const;

/** The fake CDN that serves icon images in these tests. Anything under it is routed by `installIconAssets`. */
export const ASSET_ORIGIN = "https://assets.e2e.test";
export const UPLOADED_ICON_URL = `${ASSET_ORIGIN}/uploaded-icon.png`;
export const BROKEN_ICON_URL = `${ASSET_ORIGIN}/broken-icon.png`;
export const VALID_ICON_URL = `${ASSET_ORIGIN}/valid-icon.png`;

/** A fake, audience-neutral, obviously-not-a-secret key for the API key auth tests. */
export const FAKE_API_KEY = "e2e-fake-chat-key";

type Dict = Record<string, unknown>;

export interface ShareMocksOptions {
  /** Start with sharing on (default false). */
  isShareable?: boolean;
  /** A share id makes the page's chat live (it opens the fake hub), so leave it out unless the test needs the URL. */
  shareId?: string;
  /** Anything else to override on the stored chat setting. */
  setting?: Dict;
}

export interface ShareMocks {
  /** The stored chat setting, as the GET endpoint serves it. The save and toggle handlers write into it. */
  setting: Dict;
}

/**
 * Makes the chat-setting endpoints stateful: GET serves the stored setting, the sharable toggle and
 * the save PUT write into it (the save PUT maps the request shape back to the stored shape), and the
 * icon upload answers with a fixed fake CDN URL. The share page then behaves the way it would
 * against the real API: after a toggle or a save the page refetches and sees the new state.
 */
export function installSharePagesMocks(mockApi: MockApi, options: ShareMocksOptions = {}): ShareMocks {
  const setting: Dict = {
    ...mockApi.seed.chatSetting,
    isShareable: options.isShareable ?? false,
    ...(options.shareId ? { shareId: options.shareId } : {}),
    ...options.setting,
  };

  mockApi.on("GET", SHARE_PATHS.get, ({ params }) => ({
    ...setting,
    agentId: Number(params.id),
    isWidget: params.kind === "widget",
  }));

  mockApi.on("PUT", SHARE_PATHS.sharable, ({ body }) => {
    const { isShareable } = body as { isShareable: boolean };
    setting.isShareable = isShareable;
    if (isShareable && !setting.shareId) setting.shareId = "e2e-generated-share-id";
    return { isShareable, shareId: setting.shareId };
  });

  mockApi.on("PUT", SHARE_PATHS.save, ({ body }) => {
    const { securityConfiguration, ...rest } = body as Dict;
    Object.assign(setting, rest, {
      securityConfiguration: typeof securityConfiguration === "string" ? JSON.parse(securityConfiguration) : securityConfiguration,
    });
    return setting;
  });

  mockApi.on("POST", SHARE_PATHS.image, () => ({
    relativePath: "agents/1/chat/uploaded-icon.png",
    absoluteUrl: UPLOADED_ICON_URL,
  }));

  return { setting };
}

/**
 * Overrides the sharable PUT, the save PUT or the image POST to fail the way the MD API does:
 * an `ErrorResult` body, `{ errors: [{ property, code }] }`, with a WKFLO error code.
 */
export function failShareRequest(mockApi: MockApi, endpoint: "sharable" | "save" | "image", code: string, status = 400) {
  const body = { errors: [{ property: "", code }] };
  mockApi.on("PUT", SHARE_PATHS[endpoint], () => reply(body, status));
  if (endpoint === "image") mockApi.on("POST", SHARE_PATHS.image, () => reply(body, status));
}

/** A 1x1 transparent PNG. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Serves the fake CDN: `broken-icon.png` answers 404, a `.css` file is an empty stylesheet, every
 * other file is a 1x1 PNG. Install it in any test whose settings point at ASSET_ORIGIN: otherwise
 * the preview's requests hit real DNS and log ERR_NAME_NOT_RESOLVED (fast on Linux CI agents).
 */
export async function installIconAssets(page: Page): Promise<void> {
  await page.route(`${ASSET_ORIGIN}/**`, (route) => {
    const url = route.request().url();
    if (url === BROKEN_ICON_URL) return route.fulfill({ status: 404, body: "not found" });
    if (new URL(url).pathname.endsWith(".css")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });
}

/** Console errors the icon tests expect: the broken image and the failed upload each log a failed resource load. */
export const FAILED_RESOURCE_ERROR = /Failed to load resource/;

/** The JSON body of the most recent save PUT, parsed, with `securityConfiguration` decoded. */
export function lastSaveBody(mockApi: MockApi): Dict & { securityConfiguration: Dict } {
  const saves = mockApi.requestsTo("PUT", SHARE_PATHS.save);
  const body = saves[saves.length - 1].body as Dict;
  return { ...body, securityConfiguration: JSON.parse(String(body.securityConfiguration)) };
}

/** Waits until a new save PUT arrived (there were `before` of them) and returns its decoded body. */
export async function waitForSave(mockApi: MockApi, before: number) {
  await expect.poll(() => mockApi.requestsTo("PUT", SHARE_PATHS.save).length).toBe(before + 1);
  return lastSaveBody(mockApi);
}
