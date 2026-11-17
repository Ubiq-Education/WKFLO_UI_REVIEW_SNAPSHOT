import { describe, it, expect, afterEach } from 'vitest';
import { AmaisEndpointsContextService } from './amais-endpoints-context-service';

function postAmaisEndpoints(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

describe('AmaisEndpointsContextService', () => {
  afterEach(() => {
    AmaisEndpointsContextService.resetInstance();
  });

  it('starts with no endpoints', () => {
    expect(AmaisEndpointsContextService.getInstance().getCurrent()).toBeNull();
  });

  it('stores the endpoint list from an AMAIS_ENDPOINTS message', () => {
    const service = AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints({ type: 'AMAIS_ENDPOINTS', endpoints: ['WelcomeMessage', 'CreatePost'] });
    expect(service.getCurrent()).toEqual(['WelcomeMessage', 'CreatePost']);
  });

  it('stores an empty endpoint list as-is', () => {
    const service = AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints({ type: 'AMAIS_ENDPOINTS', endpoints: [] });
    expect(service.getCurrent()).toEqual([]);
  });

  it('ignores messages of a different type', () => {
    const service = AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints({ type: 'PAGE_PATH', path: '/foo' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_ENDPOINTS messages with a non-array endpoints', () => {
    const service = AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints({ type: 'AMAIS_ENDPOINTS', endpoints: 'WelcomeMessage' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_ENDPOINTS messages with a non-string entry in the array', () => {
    const service = AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints({ type: 'AMAIS_ENDPOINTS', endpoints: ['CreatePost', 4] });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_ENDPOINTS messages missing endpoints', () => {
    const service = AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints({ type: 'AMAIS_ENDPOINTS' });
    expect(service.getCurrent()).toBeNull();
  });

  it('overwrites the previous list when a second message arrives', () => {
    const service = AmaisEndpointsContextService.getInstance();
    postAmaisEndpoints({ type: 'AMAIS_ENDPOINTS', endpoints: ['WelcomeMessage'] });
    postAmaisEndpoints({ type: 'AMAIS_ENDPOINTS', endpoints: ['CreatePost', 'ClonePost'] });
    expect(service.getCurrent()).toEqual(['CreatePost', 'ClonePost']);
  });

  it('returns the same instance across getInstance calls', () => {
    expect(AmaisEndpointsContextService.getInstance()).toBe(AmaisEndpointsContextService.getInstance());
  });
});
