import { ChatService } from './chat-service';
import { PublicApiService } from './public-api-service';
import { SecurityConfig } from '../components/agent-chat-interface';

export interface PublicChatServiceConfig {
  apiEndpoint: string;
  tenantGuid: string;
  shareId?: string;
  securityConfiguration?: SecurityConfig;
  redirectUri?: string;
  // See AgentConfig.isTestChat — forwarded down to PublicApiService so it can send the
  // amais-wkflo-is-test-chat request header.
  isTestChat?: boolean;
  // See AgentConfig.timeZone — forwarded down to PublicApiService so it can send the
  // amais-wkflo-time-zone request header.
  timeZone?: string;
}

/**
 * Factory class for creating ChatService instances with appropriate API service implementations
 */
export class ChatServiceFactory {
  /**
   * Create a ChatService instance for public/shared agent access
   */
  static createPublicChatService(config: PublicChatServiceConfig): ChatService {
    const apiService = new PublicApiService(
      config.apiEndpoint,
      config.tenantGuid,
      config.shareId,
      config.securityConfiguration,
      config.redirectUri,
      config.isTestChat,
      config.timeZone
    );
    
    return new ChatService(apiService, config.apiEndpoint);
  }
}
