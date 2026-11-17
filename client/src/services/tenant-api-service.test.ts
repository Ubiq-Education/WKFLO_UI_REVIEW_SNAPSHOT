import { describe, it, expect, afterEach, vi } from 'vitest';
import { TenantApiService } from './tenant-api-service';
import { GENERIC_CHAT_SEND_ERROR } from '@shared/utils/chat-send-errors';

describe('TenantApiService.sendMessage errors (US 7948)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const send = () =>
    new TenantApiService('https://api.example.com', 7, 'tenant-guid').sendMessage({ text: 'Hello' }, 'session-1', false);

  it('posts to the tenant chat endpoint and returns the data on success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ resultType: 0, data: true }),
      { status: 200 }
    ));

    const result = await send();

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/ai/api/v1/tenant/agent/7/chat/message');
    expect(result).toEqual({ success: true, data: { resultType: 0, data: true } });
  });

  it('returns friendly text for an error code in the 400 body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ resultType: 2, errors: [{ code: 'WKFLOAI0016', property: 'Files' }] }),
      { status: 400 }
    ));

    const result = await send();

    expect(result.success).toBe(false);
    expect(result.error).toContain('HEIC');
    expect(result.error).not.toContain('WKFLOAI');
  });

  it('returns friendly text for a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

    const result = await send();

    expect(result).toEqual({ success: false, error: 'Your session has expired. Please sign in again and resend your message.' });
  });

  it('returns the generic text for a 500 with an unknown code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ resultType: 3, errors: [{ code: 'WKFLOAI9999' }] }),
      { status: 500 }
    ));

    const result = await send();

    expect(result).toEqual({ success: false, error: GENERIC_CHAT_SEND_ERROR });
  });

  it('returns the generic text when the request itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await send();

    expect(result).toEqual({ success: false, error: GENERIC_CHAT_SEND_ERROR });
  });
});

// US 7974: the test chat's configuration carries the tenant's date/time display settings.
describe('TenantApiService.getAgentSettings display settings (US 7974)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const load = (data: Record<string, unknown>) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ resultType: 0, data }), { status: 200 }));
    return new TenantApiService('https://api.example.com', 7, 'tenant-guid').getAgentSettings();
  };

  it("keeps the tenant's display settings", async () => {
    const result = await load({
      agentName: 'Helper',
      displaySettings: { timeZone: 'America/New_York', timeFormat: '12h', dateFormat: 'MM/dd/yyyy' },
    });

    expect(result.agentChatSettings.displaySettings).toEqual({ timeZone: 'America/New_York', timeFormat: '12h', dateFormat: 'MM/dd/yyyy' });
  });

  it('uses UTC, 24h and yyyy-MM-dd when the backend sends none', async () => {
    const result = await load({ agentName: 'Helper' });

    expect(result.agentChatSettings.displaySettings).toEqual({ timeZone: 'UTC', timeFormat: '24h', dateFormat: 'yyyy-MM-dd' });
  });
});
