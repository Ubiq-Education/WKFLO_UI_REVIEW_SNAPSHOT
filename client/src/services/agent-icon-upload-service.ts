import { getTenantHeaders } from '@/lib/tenant-config';
import { config } from '@/lib/config';

export interface AgentChatIconUploadResult {
  relativePath: string;
  absoluteUrl: string;
}

/**
 * Uploads a chatbot icon (bubble icon or chatbot icon) to WKFlo's blob storage via
 * the MD API. Mirrors client/src/pages/knowledge/document-uploader.tsx's raw fetch +
 * FormData + Authorization/getTenantHeaders() pattern — NOT apiRequest/getQueryFn in
 * queryClient.ts, which are JSON-only and don't support multipart/form-data.
 *
 * The endpoint only uploads and returns the saved path; it does NOT persist anything
 * onto the agent's chat settings. The caller is responsible for writing the returned
 * absoluteUrl into the appropriate form field and saving it via the normal chat
 * settings Save flow.
 */
export async function uploadAgentChatIcon(
  agentId: number,
  file: File,
  accessToken: string
): Promise<AgentChatIconUploadResult> {
  const apiUrl = config.API_URL;

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${apiUrl}/md/api/v1/tenant/agent/${agentId}/chat-setting/image`, {
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
