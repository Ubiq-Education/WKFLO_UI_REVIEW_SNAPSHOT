import { getTenantHeaders } from '@/lib/tenant-config';
import { config } from '@/lib/config';

export interface MarketplaceAgentIconUploadResult {
  relativePath: string;
  absoluteUrl: string;
}

/**
 * Uploads a Marketplace agent's icon to WKFlo's blob storage via the MD API. Mirrors
 * agent-icon-upload-service.ts's raw fetch + FormData + Authorization/getTenantHeaders()
 * pattern (itself modeled on document-uploader.tsx) — NOT apiRequest/getQueryFn in
 * queryClient.ts, which are JSON-only and don't support multipart/form-data.
 *
 * The endpoint only uploads and returns the saved path; it does NOT persist anything onto
 * MarketplaceAgent.IconUrl. The caller is responsible for including the returned absoluteUrl
 * in its own PUT /md/api/v1/marketplace/agent/{id} Save call.
 */
export async function uploadMarketplaceAgentIcon(
  marketplaceAgentId: number,
  file: File,
  accessToken: string
): Promise<MarketplaceAgentIconUploadResult> {
  const apiUrl = config.API_URL;

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${apiUrl}/md/api/v1/marketplace/agent/${marketplaceAgentId}/icon`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...getTenantHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    let message = 'Failed to upload image';
    try {
      const errorData = await response.json();
      message = errorData?.message || errorData?.title || message;
    } catch {
      // response body wasn't JSON; fall back to the default message
    }
    throw new Error(message);
  }

  const data = await response.json();
  // Unwrap a possible { data: {...} } envelope, matching this app's other MD API responses.
  const result = data?.data ?? data;

  return {
    relativePath: result.relativePath ?? result.RelativePath,
    absoluteUrl: result.absoluteUrl ?? result.AbsoluteUrl
  };
}
