import { PublicClientApplication, Configuration } from "@azure/msal-browser";
import { SecurityConfig } from "../components/agent-chat-interface";
import { DelegatedTokenService } from './delegated-token-service';


export interface AuthHeaders {
  [key: string]: string;
}

export class AuthService {
  private msalInstance: PublicClientApplication | null = null;
  private initializationPromise: Promise<void> | null = null;
  private msalReady = false;
  private tokenService = DelegatedTokenService.getInstance();

  constructor(private securityConfig?: SecurityConfig, private redirectUri?: string) {
    if (securityConfig?.type === 'azure-ad' && securityConfig.azureAd) {
      this.initializationPromise = this.initializeMsal(securityConfig.azureAd, redirectUri);
    }
  }

  private async initializeMsal(azureAdConfig: NonNullable<SecurityConfig['azureAd']>, redirectUri?: string) {
    
    const msalConfig: Configuration = {
      auth: {
        clientId: azureAdConfig.clientId,
        authority: `https://login.microsoftonline.com/${azureAdConfig.tenantId}`,
        redirectUri: redirectUri || window.location.href,
      },
      cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
      },
    };

    this.msalInstance = new PublicClientApplication(msalConfig);

    // Initialize the MSAL instance
    try {
      await this.msalInstance.initialize();
      this.msalReady = true;
    } catch (error) {
      console.error('Failed to initialize MSAL:', error);
      throw error;
    }
  }

  private async ensureMsalInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      this.initializationPromise = null; // Clear once initialized
    }
  }

  async getAuthHeaders(): Promise<AuthHeaders> {
    
    if (!this.securityConfig) {
      return {};
    }

    switch (this.securityConfig.type) {
      case 'none':
        return {};

      case 'api-key':
        if (!this.securityConfig.apiKey) {
          throw new Error('API Key configuration is missing');
        }
        
        return {
          'amais-wkflo-api-key': this.securityConfig.apiKey.value,
          'amais-wkflo-tenant-name': this.securityConfig.apiKey.tenantName,
          'amais-wkflo-domain': window.location.hostname,
        };

      case 'azure-ad':
        return await this.getAzureAdHeaders();

      case 'jwt-token-callback':
        return { 'Authorization': `Bearer ${await this.tokenService.getToken(this.securityConfig.jwt?.domains)}` };

      default:
        return {};
    }
  }

  private async getAzureAdHeaders(): Promise<AuthHeaders> {
    await this.ensureMsalInitialized();
    
    if (!this.msalInstance || !this.securityConfig?.azureAd) {
      throw new Error('Azure AD is not properly configured');
    }

    try {
      // Try to get token silently first
      const accounts = this.msalInstance.getAllAccounts();
      
      if (accounts.length === 0) {
        // No accounts found, need to login
        await this.login();
        return await this.getAzureAdHeaders(); // Retry after login
      }
      
      const silentRequest = {
        scopes: this.securityConfig.azureAd.scopes,
        account: this.msalInstance.getActiveAccount() ?? accounts[0]
      };

      const response = await this.msalInstance.acquireTokenSilent(silentRequest);
      
      return {
        'Authorization': `Bearer ${response.accessToken}`,
      };
    } catch (error) {
      // Silent token acquisition failed, try interactive
      console.warn('Silent token acquisition failed, trying interactive login:', error);
      await this.login();
      return await this.getAzureAdHeaders(); // Retry after login
    }
  }

  async login(): Promise<void> {
    await this.ensureMsalInitialized();
    
    if (!this.msalInstance || !this.securityConfig?.azureAd) {
      throw new Error('Azure AD is not properly configured');
    }

    try {
      const loginRequest = {
        scopes: this.securityConfig.azureAd.scopes,
        prompt: "select_account",
      };
      const response = await this.msalInstance.loginPopup(loginRequest);
      this.msalInstance.setActiveAccount(response.account);
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('Authentication failed');
    }
  }

  async logout(): Promise<void> {
    await this.ensureMsalInitialized();
    
    if (!this.msalInstance) {
      return;
    }

    try {
      await this.msalInstance.logoutRedirect({
        account: this.msalInstance.getActiveAccount() ?? this.msalInstance.getAllAccounts()[0],
        onRedirectNavigate: () => false,
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  isAuthenticated(): boolean {
    if (!this.securityConfig) {
      return true; // Public access
    }

    switch (this.securityConfig.type) {
      case 'none':
        return true;
      
      case 'api-key':
        return !!this.securityConfig.apiKey?.value;
      
      case 'azure-ad':
        if (!this.msalInstance || !this.msalReady) {
          return false; // Not initialized yet
        }
        try {
          return this.msalInstance.getAllAccounts().length > 0;
        } catch (error) {
          console.warn('MSAL not yet initialized:', error);
          return false;
        }
      
      default:
        return false;
    }
  }

  getCurrentUser(): any {
    if (!this.msalInstance || !this.msalReady) {
      return null; // Not initialized yet
    }

    try {
      const active = this.msalInstance.getActiveAccount();
      if (active) return active;
      const accounts = this.msalInstance.getAllAccounts();
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.warn('MSAL not yet initialized:', error);
      return null;
    }
  }
}