import {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  resolveDateFormat,
  resolveTimeFormat,
  type DateFormat,
  type TimeFormat,
} from '../utils/format-date-time';

// US 7974: how the chat shows message dates and times - the agent's tenant settings, sent with
// the chat configuration (backend TenantDisplaySettingsResult), never the viewer's browser.
export interface ChatDisplaySettings {
  timeZone: string; // IANA, e.g. "Europe/London"
  timeFormat: TimeFormat;
  dateFormat: DateFormat; // whitelisted .NET pattern, e.g. "dd/MM/yyyy"
}

/**
 * The display settings of a chat configuration, with the defaults (UTC, 24h, yyyy-MM-dd) for
 * anything missing or unknown - e.g. a backend that doesn't send them yet.
 */
export function normalizeChatDisplaySettings(raw: unknown): ChatDisplaySettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const timeZone = typeof value.timeZone === 'string' ? value.timeZone.trim() : '';
  if (timeZone && !isValidTimeZone(timeZone)) {
    console.warn(`Unknown time zone "${timeZone}"; using ${DEFAULT_TIME_ZONE}.`);
  }
  return {
    timeZone: timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
    timeFormat: resolveTimeFormat(typeof value.timeFormat === 'string' ? value.timeFormat : null),
    dateFormat: resolveDateFormat(typeof value.dateFormat === 'string' ? value.dateFormat : null),
  };
}

// Types that align with the backend AgentChatSetting class
export interface AgentChatSetting {
  //tenantGuid: string;
  agentName?: string;
  agentDescription?: string;
  headerTitle?: string;
  chatWidth?: 'compact' | 'standard' | 'wide';
  primaryColor: string;
  foregroundColor?: string;
  bubbleStyle: 'rounded' | 'square' | 'pill';
  floatingPosition: 'left' | 'right';
  launcherStyle: 'circle' | 'pill';
  launcherText?: string;
  showDescription: boolean;
  chainOfThought: boolean;
  apiEndpoint: string;
  agentId: number;
  isWidget: boolean;
  isShareable: boolean;
  shareId?: string;
  securityConfiguration: AgentSecurityConfiguration;
  isVoiceChatEnabled: boolean;
  chatBotVoiceApiUrl: string;
  chatBotVoiceApiAccessToken: string;
  // Derived server-side from whether the agent has the "Maisy" tenant tag — controls
  // whether the "Select feature" button is shown (see agent-chat-interface.tsx).
  canSelectFeature?: boolean;
  // Server-derived from the agent's "Maisy" tag: turns on the MAISY-only chat UI (top bar,
  // conversations, New chat). Read through shared/utils/maisy-agent.ts.
  isMaisyAgent?: boolean;
  bubbleIconPath?: string;
  chatbotIconPath?: string;
  cssUrl?: string;
  welcomeMessage?: string;
  footerMessage?: string;
  predefinedPrompts?: PredefinedPrompt[];
  // US 7974: always set once loaded through normalizeAgentSettings (defaults when not sent).
  displaySettings?: ChatDisplaySettings;
}

export interface PredefinedPrompt {
  title: string;
  prompt: string;
}

export interface AgentSecurityConfiguration {
  type: 'none' | 'azure-ad' | 'api-key' | 'jwt-token-callback';
  azureAd?: AzureAdConfiguration;
  apiKey?: ApiKeyConfiguration;
  jwt?: JwtConfiguration;
}

export interface AzureAdConfiguration {
  clientId: string;
  tenantId: string;
  scopes: string[];
}

export interface ApiKeyConfiguration {
  value: string;
  tenantName: string;
  tenantDomains?: string[];
}

export interface JwtConfiguration {
  domains?: string[];
}

// Frontend state types
export interface ChatSettingsState {
  // Basic settings
  isShareable: boolean;
  isWidget: boolean;

  // Identity
  headerTitle?: string;

  // Visual styling
  primaryColor: string;
  foregroundColor?: string;
  bubbleStyle: 'rounded' | 'square' | 'pill';
  floatingPosition: 'left' | 'right';
  launcherStyle: 'circle' | 'pill';
  launcherText?: string;
  showAgentDescription: boolean;
  chainOfThought: boolean;
  
  // Security configuration
  securityType: 'none' | 'azure-ad' | 'api-key' | 'jwt-token-callback';
  azureAdConfig?: Partial<AzureAdConfiguration>;
  apiKeyConfig?: Partial<ApiKeyConfiguration>;
  jwtConfig?: Partial<JwtConfiguration>;
  
  // Advanced settings
  apiEndpoint: string;
  shareId?: string;
  bubbleIconPath?: string;
  chatbotIconPath?: string;
  cssUrl?: string;
  welcomeMessage?: string;
  footerMessage?: string;
  predefinedPrompts?: PredefinedPrompt[];
}

// API request payload type
export interface AgentChatSettingRequest {
  headerTitle?: string;
  primaryColor: string;
  foregroundColor?: string;
  bubbleStyle: string;
  floatingPosition: string;
  launcherStyle: string;
  launcherText?: string;
  showDescription: boolean;
  chainOfThought: boolean;
  apiEndpoint: string;
  isWidget: boolean;
  securityConfiguration: string;
  bubbleIconPath?: string;
  chatbotIconPath?: string;
  cssUrl?: string;
  welcomeMessage?: string;
  footerMessage?: string;
  predefinedPrompts?: PredefinedPrompt[];
}

// Default values
export const defaultChatSettings: ChatSettingsState = {
  isShareable: false,
  isWidget: false,
  headerTitle: '',
  primaryColor: '#3b82f6',
  foregroundColor: '#ffffff',
  bubbleStyle: 'rounded',
  floatingPosition: 'right',
  launcherStyle: 'circle',
  launcherText: '',
  showAgentDescription: true,
  chainOfThought: false,
  securityType: 'none',
  apiEndpoint: '',
  bubbleIconPath: '',
  chatbotIconPath: '',
  cssUrl: '',
  welcomeMessage: '',
  footerMessage: '',
  predefinedPrompts: []
};

// Utility function to convert frontend state to backend request
export const chatSettingsToRequest = (
  settings: ChatSettingsState
): AgentChatSettingRequest => {
  const security: AgentSecurityConfiguration = {
    type: settings.securityType,
  };

  if (settings.securityType === 'azure-ad' && settings.azureAdConfig) {
    security.azureAd = {
      clientId: settings.azureAdConfig.clientId || '',
      tenantId: settings.azureAdConfig.tenantId || '',
      scopes: settings.azureAdConfig.scopes || [],
    };
  }

  if (settings.securityType === 'api-key' && settings.apiKeyConfig) {
    security.apiKey = {
      value: settings.apiKeyConfig.value || '',
      tenantName: settings.apiKeyConfig.tenantName || '',
      tenantDomains: settings.apiKeyConfig.tenantDomains || []
    };
  }

  if (settings.securityType === 'jwt-token-callback' && settings.jwtConfig) {
    security.jwt = {
      domains: settings.jwtConfig.domains || []
    };
  }

  return {
    headerTitle: settings.headerTitle,
    primaryColor: settings.primaryColor,
    foregroundColor: settings.foregroundColor,
    bubbleStyle: settings.bubbleStyle,
    floatingPosition: settings.floatingPosition,
    launcherStyle: settings.launcherStyle,
    launcherText: settings.launcherText,
    showDescription: settings.showAgentDescription,
    chainOfThought: settings.chainOfThought,
    apiEndpoint: settings.apiEndpoint,
    isWidget: settings.isWidget,
    securityConfiguration: JSON.stringify(security),
    bubbleIconPath: settings.bubbleIconPath,
    chatbotIconPath: settings.chatbotIconPath,
    cssUrl: settings.cssUrl,
    welcomeMessage: settings.welcomeMessage,
    footerMessage: settings.footerMessage,
    predefinedPrompts: settings.predefinedPrompts
  };
};

// Backend data can carry inconsistent casing/whitespace for these legacy string-enum
// fields (e.g. "Rounded" instead of "rounded"), which fails the Select's strict
// equality check and renders as unselected. Normalize against the known set instead
// of a simple `|| fallback`, which only catches empty/null/undefined values.
const normalizeEnum = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T => {
  const normalized = value?.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized ?? '') ? (normalized as T) : fallback;
};

// Utility function to convert backend response to frontend state
export const chatSettingsFromResult = (result: AgentChatSetting): ChatSettingsState => {
  const predefinedPrompts = result.predefinedPrompts || (result as any).PredefinedPrompts || [];
  let securityType: 'none' | 'azure-ad' | 'api-key' | 'jwt-token-callback' = 'none';
  let azureAdConfig: Partial<AzureAdConfiguration> | undefined;
  let apiKeyConfig: Partial<ApiKeyConfiguration> | undefined;
  let jwtConfig: Partial<JwtConfiguration> | undefined;

  if (result.securityConfiguration?.type === 'azure-ad') {
    securityType = 'azure-ad';
    azureAdConfig = result.securityConfiguration.azureAd;
  } else if (result.securityConfiguration?.type === 'api-key') {
    securityType = 'api-key';
    apiKeyConfig = result.securityConfiguration.apiKey;
  } else if (result.securityConfiguration?.type === 'jwt-token-callback') {
    securityType = 'jwt-token-callback';
    jwtConfig = result.securityConfiguration.jwt;
  }

  return {
    isShareable: result.isShareable,
    isWidget: result.isWidget,
    headerTitle: result.headerTitle,
    primaryColor: result.primaryColor,
    foregroundColor: result.foregroundColor || '#ffffff',
    bubbleStyle: normalizeEnum(result.bubbleStyle, ['rounded', 'square', 'pill'], 'rounded'),
    floatingPosition: normalizeEnum(result.floatingPosition, ['left', 'right'], 'right'),
    launcherStyle: normalizeEnum(result.launcherStyle, ['circle', 'pill'], 'circle'),
    launcherText: result.launcherText || '',
    showAgentDescription: result.showDescription,
    chainOfThought: result.chainOfThought ?? false, // Use backend value or default to false
    securityType,
    azureAdConfig,
    apiKeyConfig,
    jwtConfig,
    apiEndpoint: result.apiEndpoint || '',
    shareId: result.shareId,
    bubbleIconPath: result.bubbleIconPath,
    chatbotIconPath: result.chatbotIconPath,
    cssUrl: result.cssUrl,
    welcomeMessage: result.welcomeMessage,
    footerMessage: result.footerMessage,
    predefinedPrompts
  };
};