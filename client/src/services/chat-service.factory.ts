import { ChatService } from '@shared/services/chat-service';
import { SecurityConfig } from '@shared/components/agent-chat-interface';
import { TenantApiService } from './tenant-api-service';


export interface TenantChatServiceConfig {
  apiEndpoint: string;
  id: number;
  tenantGuid: string;
  securityConfiguration?: SecurityConfig;
  redirectUri?: string;
}

/**
 * Factory class for creating ChatService instances with appropriate API service implementations
 */
export class ChatServiceFactory {
  /**
   * Create a ChatService instance for tenant-specific agent access
   */
  static createTenantChatService(config: TenantChatServiceConfig): ChatService {
    const apiService = new TenantApiService(
      config.apiEndpoint,
      config.id,
      config.tenantGuid,
      config.securityConfiguration,
      config.redirectUri
    );
    return new ChatService(apiService, config.apiEndpoint);
  }
}
