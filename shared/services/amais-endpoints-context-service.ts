export class AmaisEndpointsContextService {
  private static instance: AmaisEndpointsContextService | null = null;
  private availableEndpoints: string[] | null = null;
  private handleMessage = (event: MessageEvent) => {
    const { type, endpoints } = event.data as { type?: string; endpoints?: unknown };
    if (
      type !== 'AMAIS_ENDPOINTS' ||
      !Array.isArray(endpoints) ||
      !endpoints.every((endpoint) => typeof endpoint === 'string')
    ) return;

    this.availableEndpoints = endpoints;
  };

  private constructor() {
    window.addEventListener('message', this.handleMessage);
  }

  public static getInstance(): AmaisEndpointsContextService {
    if (!AmaisEndpointsContextService.instance) {
      AmaisEndpointsContextService.instance = new AmaisEndpointsContextService();
    }
    return AmaisEndpointsContextService.instance;
  }

  public getCurrent(): string[] | null {
    return this.availableEndpoints;
  }

  public static resetInstance(): void {
    if (AmaisEndpointsContextService.instance) {
      window.removeEventListener('message', AmaisEndpointsContextService.instance.handleMessage);
    }
    AmaisEndpointsContextService.instance = null;
  }
}

// Attach the listener as soon as this module loads, rather than waiting for the first
// getInstance() caller (a component mount, or the first outgoing chat request) — the CMS
// host page pushes AMAIS_ENDPOINTS once the Maisy iframe finishes loading, which can happen
// before React has rendered anything, so the listener needs to be live as early as the
// widget's JS bundle can make it.
AmaisEndpointsContextService.getInstance();
