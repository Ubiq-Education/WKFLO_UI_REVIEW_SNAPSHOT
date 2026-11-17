import { AuthService } from './auth-service';
import { PageContextService } from './page-context-service';
import { FeatureContextService } from './feature-context-service';
import { AmaisEndpointsContextService } from './amais-endpoints-context-service';
import { getOrCreateSubjectId } from '../utils/subject-id';
import { GENERIC_CHAT_SEND_ERROR, readChatSendError } from '../utils/chat-send-errors';
import { SecurityConfig } from '../components/agent-chat-interface';
import { ChatMessage, FileAttachment, ToolApprovalDecision } from './chat-service';
import { IChatApiService, ApiResponse, StopAllAgentsResult } from './chat-api.interface';
import { IInitialState, initialState } from '../../shared/models/chat-models';
import { AgentChatSetting, normalizeChatDisplaySettings } from '../../shared/models/chat-settings';
import type { SpinUpAgentTarget } from '../schema';
import type { ConversationSummary, SessionWorkingState } from '../models/conversation-summary';

export class PublicApiService implements IChatApiService {
  private authService: AuthService;
  private tenantGuid: string;

  constructor(private apiEndpoint: string, tenantGuid: string, private shareId?: string, private securityConfig?: SecurityConfig, private redirectUri?: string, private isTestChat?: boolean, private timeZone?: string) {
    this.authService = new AuthService(securityConfig, redirectUri);
    this.tenantGuid = tenantGuid;
  }

  async storeMessage(input: { text: string; type: string }, sessionId: string): Promise<ApiResponse<{ data: { message: string } }>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to send messages. Please enable sharing.');
      }
      
      const headers = await this.getRequestHeaders();
      
      // Use the new ChatController endpoint
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/store/chat/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          'input': input,
          'sessionId': sessionId
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required or invalid credentials');
        }
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
  
  async sendMessage(input: { text: string; files?: FileAttachment[] }, sessionId: string, chainOfThought: boolean, isContactFormReplay: boolean = false): Promise<ApiResponse<{ data: { message: string } }>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to send messages. Please enable sharing.');
      }

      const headers = await this.getRequestHeaders();

      // Use the new ChatController endpoint
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          'input': input,
          'sessionId': sessionId,
          'chainOfThought': chainOfThought,
          'isContactFormReplay': isContactFormReplay
        }),
      });

      // US 7948: the error codes in the body become friendly text for the chat.
      if (!response.ok) {
        return {
          success: false,
          error: await readChatSendError(response),
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: GENERIC_CHAT_SEND_ERROR,
      };
    }
  }

  async sendVoiceMessage(text: string, sessionId: string, branchId: string | null, chainOfThought: boolean): Promise<ApiResponse<{ data: { message: string } }>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to send messages. Please enable sharing.');
      }
      
      const headers = await this.getRequestHeaders();
      
      // Use the new ChatController endpoint
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/voice/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          'text': text,
          'sessionId': sessionId,
          'branchId': branchId,
          'chainOfThought': chainOfThought
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required or invalid credentials');
        }
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async readMessages(sessionId: string): Promise<ApiResponse<{ 
    resultType: number; 
    data: Array<ChatMessage>;
  }>> {
    try {

      if(this.securityConfig?.type === ''){
        return {
          success: true,
          data: [] as any,
        }
      }

      const headers = await this.getRequestHeaders();
      
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/${sessionId}/session-messages`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required or invalid credentials');
        }
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Read messages API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  getAgentSettings = async (): Promise<IInitialState> => {
    try {
        const headers = await this.getRequestHeaders({ includeAuth: false });

        const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/configuration`, {
            method: "GET",
            mode: "cors",
            headers
        });

        if (!response.ok) {
            throw new Error(`Failed to load agent settings: request returned status ${response.status}`);
        }

        const agentSettings = await response.json();
        const normalizedSettings = this.normalizeAgentSettings(agentSettings.data);
        return {
            ...initialState,
            agentChatSettings: { ...(normalizedSettings || {} as AgentChatSetting) }
        };
    } catch (error) {
        console.error(`Failed to load settings for agent ${this.shareId}:`, error);
        throw error;
    }
  }

  // US 7507: the caller's MAISY conversations. The server sorts, limits and scopes them, and
  // answers an empty list for an anonymous caller or an agent that isn't MAISY.
  async listConversations(): Promise<ApiResponse<{
    resultType: number;
    data: Array<ConversationSummary>;
  }>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to list conversations.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/conversations`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required or invalid credentials');
        }
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('List conversations API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // US 7506: whether agents are still working on the session (see SessionWorkingState).
  async getSessionWorkingState(sessionId: string): Promise<ApiResponse<{
    resultType: number;
    data: SessionWorkingState;
  }>> {
    try {
      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/${sessionId}/state`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Session working state API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async getSpinUpAgents(): Promise<ApiResponse<{
    resultType: number;
    data: Array<SpinUpAgentTarget>;
  }>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to fetch spin-up agents.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/spin-up/agents`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required or invalid credentials');
        }
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Get spin-up agents API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private normalizeAgentSettings(settings: any): AgentChatSetting | null {
    if (!settings) return null;

    if (typeof settings.securityConfiguration === 'string') {
      try {
        settings.securityConfiguration = JSON.parse(settings.securityConfiguration);
      } catch (error) {
        console.warn('Failed to parse securityConfiguration JSON:', error);
        settings.securityConfiguration = { type: 'none' };
      }
    }

    // US 7974: the tenant's date/time display settings; defaults when the backend doesn't send them.
    settings.displaySettings = normalizeChatDisplaySettings(settings.displaySettings);

    return settings as AgentChatSetting;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    return this.getRequestHeaders() as Promise<Record<string, string>>;
  }

  private async getRequestHeaders(options: { includeAuth?: boolean } = {}): Promise<HeadersInit> {
    const { includeAuth = true } = options;
    const [authHeaders, pageContext] = await Promise.all([
      includeAuth ? this.authService.getAuthHeaders() : Promise.resolve({}),
      PageContextService.getInstance().getPageContext(),
    ]);
    const selectedFeature = FeatureContextService.getInstance().getCurrent();
    const amaisAvailableEndpoints = AmaisEndpointsContextService.getInstance().getCurrent();
    return {
      'Content-Type': 'application/json',
      ...authHeaders,
      'amais-wkflo-tenant-guid': this.tenantGuid,
      'amais-wkflo-page-path': pageContext.path,
      // The host CMS's page ID, supplied in its PAGE_PATH reply — omitted entirely when the host
      // doesn't send one, so the backend falls back to identifying the page by path.
      ...(pageContext.pageId ? {
        'amais-wkflo-page-id': pageContext.pageId,
      } : {}),
      'amais-wkflo-subject-id': getOrCreateSubjectId(),
      ...(selectedFeature ? {
        'amais-wkflo-feature-id': selectedFeature.featureId,
        'amais-wkflo-feature-type': selectedFeature.featureType,
        'amais-wkflo-feature-name': selectedFeature.featureName,
      } : {}),
      ...(amaisAvailableEndpoints && amaisAvailableEndpoints.length > 0 ? {
        'amais-wkflo-amais-endpoints': amaisAvailableEndpoints.join(','),
      } : {}),
      // Only sent when this instance was constructed for the CMS Test Agent tab
      // (data-is-test-chat="true"); omitted entirely for production embeds so the backend's
      // default (real conversation) behavior is unaffected.
      ...(this.isTestChat ? {
        'amais-wkflo-is-test-chat': 'true',
      } : {}),
      // The school's timezone, host-supplied at widget-init time (see AgentConfig.timeZone) —
      // omitted entirely when not provided so wkflo_services' fail-open default (UTC-only
      // behavior) is unaffected.
      ...(this.timeZone ? {
        'amais-wkflo-time-zone': this.timeZone,
      } : {}),
    };
  }

  async submitContactForm(
    sessionId: string,
    data: { subjectId: string; firstName: string; lastName: string; email: string; originalMessage?: string }
  ): Promise<ApiResponse<void>> {
    try {
      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/contact-form/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, ...data }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Contact form submit failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async checkContactFormExists(subjectId: string): Promise<ApiResponse<boolean>> {
    try {
      const headers = await this.getRequestHeaders();

      const response = await fetch(
        `${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/contact-form/check/${encodeURIComponent(subjectId)}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data: !!data };
    } catch (error) {
      console.error('Contact form check failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  async rateMessage(sessionId: string, messageId: string, isThumbsUp: boolean): Promise<ApiResponse<boolean>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to rate messages.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/message/rate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId,
          input: {
            messageId,
            isThumbsUp
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data: data.data };
    } catch (error) {
      console.error('Rate message API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async respondToToolApproval(sessionId: string, approvalId: string, decision: ToolApprovalDecision): Promise<ApiResponse<void>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to answer a tool approval.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/tool-approval/${encodeURIComponent(approvalId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, decision }),
      });

      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          error: `Request failed with status ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Tool approval decision failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async stopAllAgents(sessionId: string): Promise<ApiResponse<StopAllAgentsResult>> {
    try {
      if (!this.shareId) {
        throw new Error('Share ID is required to stop the agents.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/agent/${this.shareId}/chat/stop`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          error: `Request failed with status ${response.status}`,
        };
      }

      const body = await response.json();
      return { success: true, data: body?.data };
    } catch (error) {
      console.error('Stop all agents request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async login(): Promise<void> {
    return this.authService.login();
  }

  async logout(): Promise<void> {
    return this.authService.logout();
  }

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  getCurrentUser(): any {
    return this.authService.getCurrentUser();
  }
}