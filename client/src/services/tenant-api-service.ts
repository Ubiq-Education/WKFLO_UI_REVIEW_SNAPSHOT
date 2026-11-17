import { AuthService } from '@shared/services/auth-service';
import { SecurityConfig } from '@shared/components/agent-chat-interface';
import { ChatMessage, FileAttachment, ToolApprovalDecision } from '@shared/services/chat-service';
import { IChatApiService, ApiResponse, StopAllAgentsResult } from '@shared/services/chat-api.interface';
import { IInitialState, initialState } from '@shared/models/chat-models';
import { AgentChatSetting, normalizeChatDisplaySettings } from '@shared/models/chat-settings';
import { getOrCreateSubjectId } from '@shared/utils/subject-id';
import { GENERIC_CHAT_SEND_ERROR, readChatSendError } from '@shared/utils/chat-send-errors';
import type { SpinUpAgentTarget } from '@shared/schema';

export class TenantApiService implements IChatApiService {
  private authService: AuthService;
  private id: number;
  private tenantGuid: string;

  constructor(private apiEndpoint: string, id: number, tenantGuid: string, securityConfig?: SecurityConfig, private redirectUri?: string) {
    this.id = id;
    this.tenantGuid = tenantGuid;
    this.authService = new AuthService(securityConfig, redirectUri);
  }
  
  async storeMessage(input: { text: string; type: string }, sessionId: string): Promise<ApiResponse<{ data: { message: string } }>> {
    try {
      if (!this.id) {
        throw new Error('ID is required to send messages. Please enable sharing.');
      }
      
      const headers = await this.getRequestHeaders();
      
      // Use the new ChatController endpoint
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/store/chat/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          'input': input,
          'sessionId': sessionId,
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
      if (!this.id) {
        throw new Error('ID is required to send messages. Please enable sharing.');
      }

      const headers = await this.getRequestHeaders();

      // Use the new ChatController endpoint
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/chat/message`, {
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
      if (!this.id) {
        throw new Error('ID is required to send messages. Please enable sharing.');
      }
      
      const headers = await this.getRequestHeaders();
      
      // Use the new ChatController endpoint
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/chat/voice/message`, {
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
      const headers = await this.getRequestHeaders();
      
      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/chat/${sessionId}/session-messages`, {
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
        const headers = await this.getRequestHeaders();
        const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/chat/configuration`, {
            method: "GET",
            mode: "cors",
            headers
        });
        const agentSettings = await response.json();
        const normalizedSettings = this.normalizeAgentSettings(agentSettings.data);
        return {
            ...initialState,
            agentChatSettings: { ...(normalizedSettings || {} as AgentChatSetting) }
        };
    } catch (error) {
        console.error(`Failed to load settings for agent ${this.id}:`, error);
        throw error;
    }
  }

  async getSpinUpAgents(): Promise<ApiResponse<{
    resultType: number;
    data: Array<SpinUpAgentTarget>;
  }>> {
    try {
      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/spin-up/agents`, {
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

  private async getRequestHeaders(): Promise<HeadersInit> {
    const authHeaders = await this.authService.getAuthHeaders();

    return {
      'Content-Type': 'application/json',
      ...authHeaders,
      'amais-wkflo-tenant-guid': this.tenantGuid,
      'amais-wkflo-subject-id': getOrCreateSubjectId(),
    };
  }

  async submitContactForm(
    sessionId: string,
    data: { subjectId: string; firstName: string; lastName: string; email: string; originalMessage?: string }
  ): Promise<ApiResponse<void>> {
    try {
      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/contact-form/submit`, {
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

  async checkContactFormExists(_subjectId: string): Promise<ApiResponse<boolean>> {
    return { success: true, data: false };
  }

  async rateMessage(sessionId: string, messageId: string, isThumbsUp: boolean): Promise<ApiResponse<boolean>> {
    try {
      if (!this.id) {
        throw new Error('ID is required to rate messages.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/chat/message/rate`, {
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
      if (!this.id) {
        throw new Error('ID is required to answer a tool approval.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/tool-approval/${encodeURIComponent(approvalId)}`, {
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
      if (!this.id) {
        throw new Error('ID is required to stop the agents.');
      }

      const headers = await this.getRequestHeaders();

      const response = await fetch(`${this.apiEndpoint}/ai/api/v1/tenant/agent/${this.id}/chat/stop`, {
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

  async getAuthHeaders(): Promise<Record<string, string>> {
    return this.getRequestHeaders() as Promise<Record<string, string>>;
  }
}