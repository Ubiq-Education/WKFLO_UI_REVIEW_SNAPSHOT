import { describe, it, expect, afterEach, vi } from 'vitest';
import { PublicApiService } from './public-api-service';
import { PageContextService } from './page-context-service';
import { FeatureContextService } from './feature-context-service';
import { AmaisEndpointsContextService } from './amais-endpoints-context-service';
import { describeChatSendError, GENERIC_CHAT_SEND_ERROR } from '../utils/chat-send-errors';

function postSelectedFeature(featureId: string, featureType: string, featureName: string) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'SELECTED_FEATURE', featureId, featureType, featureName } }));
}

function postAmaisEndpoints(endpoints: string[]) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'AMAIS_ENDPOINTS', endpoints } }));
}

describe('PublicApiService request headers', () => {
  afterEach(() => {
    PageContextService.resetInstance();
    FeatureContextService.resetInstance();
    AmaisEndpointsContextService.resetInstance();
    vi.restoreAllMocks();
  });

  it('omits the page-id header when the host has not supplied a pageId', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-page-path']).toBe(window.location.pathname);
    expect(headers['amais-wkflo-page-id']).toBeUndefined();
  });

  it('includes the page-id header next to the page-path header once the host has supplied a pageId', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    vi.spyOn(PageContextService.getInstance(), 'getPageContext').mockResolvedValue({ path: '/about', pageId: '1234' });

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-page-path']).toBe('/about');
    expect(headers['amais-wkflo-page-id']).toBe('1234');
  });

  it('omits feature headers when no feature has been selected', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-feature-id']).toBeUndefined();
    expect(headers['amais-wkflo-feature-type']).toBeUndefined();
    expect(headers['amais-wkflo-feature-name']).toBeUndefined();
  });

  it('includes feature headers once a feature has been selected', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    // The listener only attaches once the singleton exists — mirrors the real app, where
    // the widget mounting (or importing this module) instantiates it before the host page
    // can post a SELECTED_FEATURE message.
    FeatureContextService.getInstance();
    postSelectedFeature('42', 'Text', 'Homepage Hero');

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-feature-id']).toBe('42');
    expect(headers['amais-wkflo-feature-type']).toBe('Text');
    expect(headers['amais-wkflo-feature-name']).toBe('Homepage Hero');
  });

  it('includes the feature-id header for an empty-string featureId (falsy but valid)', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    FeatureContextService.getInstance();
    postSelectedFeature('', 'Text', 'Homepage Hero');

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-feature-id']).toBe('');
    expect(headers['amais-wkflo-feature-type']).toBe('Text');
  });

  it('omits feature headers again once the selection is cleared', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    const featureService = FeatureContextService.getInstance();
    postSelectedFeature('42', 'Text', 'Homepage Hero');
    featureService.clearSelection();

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-feature-id']).toBeUndefined();
    expect(headers['amais-wkflo-feature-type']).toBeUndefined();
    expect(headers['amais-wkflo-feature-name']).toBeUndefined();
  });

  it('omits the amais-endpoints header when no endpoint list has been pushed by the host', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-amais-endpoints']).toBeUndefined();
  });

  it('includes the amais-endpoints header once the host has pushed an AMAIS_ENDPOINTS message', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    // The listener only attaches once the singleton exists — mirrors the real app, where
    // the widget mounting (or importing this module) instantiates it before the CMS host
    // page can post an AMAIS_ENDPOINTS message once the Maisy iframe finishes loading.
    AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints(['WelcomeMessage', 'CreatePost']);

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-amais-endpoints']).toBe('WelcomeMessage,CreatePost');
  });

  it('omits the amais-endpoints header again when the host pushes an empty list', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');
    AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints([]);

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-amais-endpoints']).toBeUndefined();
  });

  it('omits the is-test-chat header when the service is constructed without the flag (production embeds)', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-is-test-chat']).toBeUndefined();
  });

  it('omits the is-test-chat header when the flag is explicitly false', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', undefined, undefined, undefined, false);

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-is-test-chat']).toBeUndefined();
  });

  it('includes the is-test-chat header when the service is constructed with the flag (CMS Test Agent tab embed)', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', undefined, undefined, undefined, true);

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-is-test-chat']).toBe('true');
  });

  it('omits the time-zone header when the service is constructed without a timeZone', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid');

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-time-zone']).toBeUndefined();
  });

  it('omits the time-zone header when timeZone is an empty string', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', undefined, undefined, undefined, undefined, '');

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-time-zone']).toBeUndefined();
  });

  it('includes the time-zone header when the service is constructed with a host-supplied timeZone', async () => {
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', undefined, undefined, undefined, undefined, 'America/New_York');

    const headers = await service.getAuthHeaders();

    expect(headers['amais-wkflo-time-zone']).toBe('America/New_York');
  });
});

describe('PublicApiService.stopAllAgents (US 7501)', () => {
  afterEach(() => {
    PageContextService.resetInstance();
    FeatureContextService.resetInstance();
    AmaisEndpointsContextService.resetInstance();
    vi.restoreAllMocks();
  });

  it('posts the session id to the public stop endpoint and returns the stop time', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ resultType: 0, data: { sessionId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' } }),
      { status: 200 }
    ));
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1');

    const result = await service.stopAllAgents('session-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/ai/api/v1/agent/share-1/chat/stop');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ sessionId: 'session-1' });
    expect(result).toEqual({ success: true, data: { sessionId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' } });
  });

  it('reports the status code when the server rejects the stop', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 400 }));
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1');

    const result = await service.stopAllAgents('session-1');

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
  });
});

describe('PublicApiService.sendMessage errors (US 7948)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const send = (service: PublicApiService) =>
    service.sendMessage({ text: 'Hello' }, 'session-1', false);

  it('returns friendly text for an error code in the 400 body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ resultType: 2, errors: [{ code: 'WKFLOAI0015', property: 'Files' }] }),
      { status: 400 }
    ));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await send(new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1'));

    expect(result.success).toBe(false);
    expect(result.error).toBe('One of your images is larger than 5.0 MB. Please use a smaller image and try again.');
    expect(result.error).not.toContain('WKFLOAI');
  });

  it('falls back to the status when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

    const result = await send(new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1'));

    expect(result).toEqual({ success: false, error: GENERIC_CHAT_SEND_ERROR });
  });

  it('returns friendly text for a 401 without a body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

    const result = await send(new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1'));

    expect(result).toEqual({ success: false, error: describeChatSendError(401, null) });
  });

  it('returns the generic text when the request itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await send(new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1'));

    expect(result).toEqual({ success: false, error: GENERIC_CHAT_SEND_ERROR });
  });
});

// US 7974: the chat configuration carries the tenant's date/time display settings.
describe('PublicApiService.getAgentSettings display settings (US 7974)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const load = (data: Record<string, unknown>) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ resultType: 0, data }), { status: 200 }));
    return new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1').getAgentSettings();
  };

  it("keeps the tenant's display settings", async () => {
    const result = await load({
      agentName: 'Helper',
      displaySettings: { timeZone: 'Australia/Sydney', timeFormat: '12h', dateFormat: 'dd MMM, yyyy' },
    });

    expect(result.agentChatSettings.displaySettings).toEqual({ timeZone: 'Australia/Sydney', timeFormat: '12h', dateFormat: 'dd MMM, yyyy' });
  });

  it('uses UTC, 24h and yyyy-MM-dd when the backend sends none', async () => {
    const result = await load({ agentName: 'Helper' });

    expect(result.agentChatSettings.displaySettings).toEqual({ timeZone: 'UTC', timeFormat: '24h', dateFormat: 'yyyy-MM-dd' });
  });
});

describe('PublicApiService.listConversations (US 7507)', () => {
  afterEach(() => {
    PageContextService.resetInstance();
    FeatureContextService.resetInstance();
    AmaisEndpointsContextService.resetInstance();
    vi.restoreAllMocks();
  });

  it('gets the conversations of the share id', async () => {
    const conversation = {
      sessionId: 'session-1',
      title: 'Plan the open evening',
      previewLine: 'Can you help me plan the open evening?',
      lastActivityAt: '2026-09-27T16:10:00+00:00',
      agents: [{ agentId: 12, name: 'MAISY', role: 'Your AI assistant', avatarUrl: null }],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ resultType: 0, data: [conversation] }),
      { status: 200 }
    ));
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1');

    const result = await service.listConversations();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/ai/api/v1/agent/share-1/chat/conversations');
    expect(init?.method).toBe('GET');
    expect(result).toEqual({ success: true, data: { resultType: 0, data: [conversation] } });
  });

  it('fails when the server rejects the request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 400 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1');

    const result = await service.listConversations();

    expect(result.success).toBe(false);
  });
});

describe('PublicApiService.getSessionWorkingState (US 7506)', () => {
  afterEach(() => {
    PageContextService.resetInstance();
    FeatureContextService.resetInstance();
    AmaisEndpointsContextService.resetInstance();
    vi.restoreAllMocks();
  });

  it('gets the working state of the session', async () => {
    const workingState = { isWorking: true };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ resultType: 0, data: workingState }),
      { status: 200 }
    ));
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1');

    const result = await service.getSessionWorkingState('session-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/ai/api/v1/agent/share-1/chat/session-1/state');
    expect(init?.method).toBe('GET');
    expect(result).toEqual({ success: true, data: { resultType: 0, data: workingState } });
  });

  it('fails when the server rejects the request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new PublicApiService('https://api.example.com', 'tenant-guid', 'share-1');

    const result = await service.getSessionWorkingState('session-1');

    expect(result.success).toBe(false);
  });
});
