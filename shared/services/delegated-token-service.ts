// DelegatedTokenService.ts

export class DelegatedTokenService {
  private static instance: DelegatedTokenService | null = null;
  private token: string | null = null;
  private error: string | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor() {
  }

  public static getInstance(): DelegatedTokenService {
    if (!DelegatedTokenService.instance) {
      DelegatedTokenService.instance = new DelegatedTokenService();
    }
    return DelegatedTokenService.instance;
  }

  // Request a new delegated token from parent
  public requestToken(domains?: string[]): Promise<string> {
    return new Promise((resolve, reject) => {

      const handleMessage = (event: MessageEvent) => {
        
        const { type, token, error } = event.data as {
          type: string;
          token?: string;
          error?: string;
        };

        if (type === 'DELEGATED_TOKEN') {
            // Validate origin against allowed domains
            if (domains && domains.length > 0) {
                const eventOrigin = new URL(event.origin).hostname;
                const isAllowedDomain = domains.some(domain => {
                    // Support both exact matches and subdomains
                    return eventOrigin === domain || eventOrigin.endsWith('.' + domain);
                });
          
                if (!isAllowedDomain) {
                    console.warn(`Rejecting message from unauthorized origin: ${event.origin}`);
                    return;
                }
            }
          window.removeEventListener('message', handleMessage);
          this.token = token!;
          this.error = null;
          resolve(token!);
        } else if (type === 'DELEGATED_TOKEN_ERROR') {
          window.removeEventListener('message', handleMessage);
          this.token = null;
          this.error = error || 'Unknown error';
          reject(new Error(this.error));
        }
      };

      window.addEventListener('message', handleMessage);

      // Determine which domain matches the current origin
      let matchingDomain: string | undefined;
      if (domains && domains.length > 0) {
        const currentHostname = window.location.hostname;
        matchingDomain = domains.find(domain => 
          currentHostname === domain || currentHostname.endsWith('.' + domain)
        );
      }
      
      // Send request to parent - use '*' as target origin since we validate incoming messages
      window.parent.postMessage({ 
        type: 'REQUEST_DELEGATED_TOKEN',
        domain: matchingDomain 
      }, '*');
    });
  }

  // Get current token if it exists, otherwise request a new one
  public async getToken(domains?: string[]): Promise<string> {
    
    // Return cached token if available
    if (this.token) return this.token;
    
    // Return ongoing promise if request is already in flight
    if (this.tokenPromise) return this.tokenPromise;
    
    // Start new token request
    this.tokenPromise = this.requestToken(domains);
    
    try {
      const token = await this.tokenPromise;
      return token;
    } finally {
      // Clear the promise so future calls can make new requests
      this.tokenPromise = null;
    }
  }

  // Optional: clear cached token
  public clearToken() {
    this.token = null;
    this.error = null;
    this.tokenPromise = null;
  }

  // Check if token request is currently in progress
  public isTokenLoading(): boolean {
    return this.tokenPromise !== null;
  }

  // Check if token is already cached
  public hasToken(): boolean {
    return this.token !== null;
  }

  // Reset singleton instance (useful for testing or cleanup)
  public static resetInstance(): void {
    DelegatedTokenService.instance = null;
  }
}
