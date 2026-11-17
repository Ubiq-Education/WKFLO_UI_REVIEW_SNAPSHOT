import { AgentConfig } from '../components/agent-chat-interface';

// Example configurations for different security types

// 1. Public access - no authentication required
export const publicAgentConfig: AgentConfig = {
  tenantGuid: 'PublicTenant',
  agentName: 'Public Demo Agent',
  agentDescription: 'A publicly accessible AI assistant',
  primaryColor: '#3b82f6',
  bubbleStyle: 'rounded',
  showDescription: true,
  chainOfThought: false,
  isVoiceChatEnabled: false,
  apiEndpoint: 'https://your-api.com/public/agent',
  predefinedPrompts: [],
  securityConfiguration: {
    type: 'none'
  }
};

// 2. API Key authentication
export const apiKeyAgentConfig: AgentConfig = {
  tenantGuid: 'YourTenant',
  agentName: 'Enterprise Agent',
  agentDescription: 'A secure enterprise AI assistant',
  primaryColor: '#10b981',
  bubbleStyle: 'rounded',
  showDescription: true,
  chainOfThought: false,
  isVoiceChatEnabled: false,
  apiEndpoint: 'https://your-api.com/secure/agent',
  predefinedPrompts: [],
  securityConfiguration: {
    type: 'api-key',
    apiKey: {
      value: 'your-api-key-here',
      tenantName: 'your-tenant-name',
    }
  }
};

// 3. Azure AD authentication
export const azureAdAgentConfig: AgentConfig = {
  tenantGuid: 'YourTenant',
  agentName: 'Azure AD Agent',
  agentDescription: 'An Azure AD authenticated AI assistant',
  primaryColor: '#f59e0b',
  bubbleStyle: 'rounded',
  showDescription: true,
  chainOfThought: false,
  isVoiceChatEnabled: false,
  apiEndpoint: 'https://your-api.com/azure/agent',
  predefinedPrompts: [],
  securityConfiguration: {
    type: 'azure-ad',
    azureAd: {
      clientId: 'your-azure-client-id',
      tenantId: 'your-azure-tenant-id',
      scopes: ['openid', 'profile', 'api://your-api/access']
    }
  }
};

// 4. JWT Token Callback authentication
export const jwtCallbackAgentConfig: AgentConfig = {
  tenantGuid: 'YourTenant',
  agentName: 'JWT Callback Agent',
  agentDescription: 'An agent using JWT token callback authentication',
  primaryColor: '#8b5cf6',
  bubbleStyle: 'rounded',
  showDescription: true,
  chainOfThought: false,
  isVoiceChatEnabled: false,
  apiEndpoint: 'https://your-api.com/jwt/agent',
  predefinedPrompts: [],
  securityConfiguration: {
    type: 'jwt-token-callback',
    jwt: {
      domains: ['example.com', 'app.example.com', 'secure.example.com']
    }
  }
};

// Helper function to create agent config from environment variables
export const createAgentConfigFromEnv = (
  agentId: string,
  securityType: 'none' | 'api-key' | 'azure-ad' | 'jwt-token-callback' = 'none'
): AgentConfig => {
  const baseConfig: AgentConfig = {
    tenantGuid: 'DefaultTenant',
    agentName: process.env.VITE_AGENT_NAME || 'AI Assistant',
    agentDescription: process.env.VITE_AGENT_DESCRIPTION,
    primaryColor: process.env.VITE_AGENT_COLOR || '#3b82f6',
    bubbleStyle: (process.env.VITE_AGENT_BUBBLE_STYLE as any) || 'rounded',
    showDescription: true,
    chainOfThought: false,
    isVoiceChatEnabled: false,
    apiEndpoint: process.env.VITE_AGENT_API_ENDPOINT || 'https://your-api.com/agent/' + agentId,
    predefinedPrompts: [],
  };

  switch (securityType) {
    case 'none':
      baseConfig.securityConfiguration = { type: 'none' };
      break;
      
    case 'api-key':
      baseConfig.securityConfiguration = {
        type: 'api-key',
        apiKey: {
          value: process.env.VITE_API_KEY || '',
          tenantName: 'TenantName'
        }
      };
      break;
      
    case 'azure-ad':
      baseConfig.securityConfiguration = {
        type: 'azure-ad',
        azureAd: {
          clientId: process.env.VITE_ENTRA_CLIENT_ID || '',
          tenantId: process.env.VITE_ENTRA_TENANT_ID || '',
          scopes: (process.env.VITE_ENTRA_SCOPE || 'openid,profile').split(',')
        }
      };
      break;
      
    case 'jwt-token-callback':
      baseConfig.securityConfiguration = {
        type: 'jwt-token-callback',
        jwt: {
          domains: (process.env.VITE_JWT_DOMAINS || '').split(',').filter(d => d.trim())
        }
      };
      break;
  }

  return baseConfig;
};