import React from 'react';
import { config } from '@/lib/config';
import { AgentChatInterface, AgentConfig, SecurityConfig } from '../../../../shared/components';
import type { PredefinedPrompt } from '@shared/models/chat-settings';

interface ChatUIProps {
  tenantGuid: string;
  agentName: string;
  agentDescription?: string;
  headerTitle?: string;
  welcomeMessage?: string;
  primaryColor?: string;
  foregroundColor?: string;
  bubbleStyle?: 'rounded' | 'square' | 'pill';
  floatingPosition?: 'left' | 'right';
  launcherStyle?: 'circle' | 'pill';
  launcherText?: string;
  footerMessage?: string;
  predefinedPrompts?: PredefinedPrompt[];
  bubbleIconPath?: string;
  chatbotIconPath?: string;
  cssUrl?: string;
  // Raw CSS width (e.g. "26rem") takes precedence over chatWidth when both are set.
  width?: string;
  chatWidth?: 'compact' | 'standard' | 'wide';
  showAgentDescription?: boolean;
  chainOfThought?: boolean;
  placeholder?: string;
  apiEndpoint: string;
  className?: string;
  isWidget?: boolean;
  shareId?: string;
  isVoiceChatEnabled: boolean;
  securityConfiguration?: SecurityConfig;
  // Explicit static override for the "Select feature" button gate — see
  // AgentChatInterface's canEnterFeatureSelectionMode for why this bypasses the iframe
  // check. Only ever set by the MD app's own Share-page previews (computed from the
  // agent's own tags); real embeds never set this and rely on the backend-fetched flag.
  canSelectFeature?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  isMinimized?: boolean;
  // Read-only "how would this look" mode — see AgentChatInterface's previewMode doc.
  previewMode?: boolean;
}

export default function ChatUI({
  tenantGuid,
  agentName,
  agentDescription,
  headerTitle,
  welcomeMessage,
  primaryColor = '#3b82f6',
  foregroundColor = '#ffffff',
  bubbleStyle = 'rounded',
  floatingPosition = 'right',
  launcherStyle = 'circle',
  launcherText,
  footerMessage,
  predefinedPrompts,
  bubbleIconPath,
  chatbotIconPath,
  cssUrl,
  width,
  chatWidth,
  showAgentDescription = true,
  chainOfThought = false,
  placeholder = 'Type your message...',
  apiEndpoint,
  className = 'max-w-xl h-chat-xl',
  isWidget = false,
  shareId,
  isVoiceChatEnabled = false,
  securityConfiguration,
  canSelectFeature,
  onClose,
  onMinimize,
  onMaximize,
  isMinimized,
  previewMode = false
}: ChatUIProps) {
  // Convert ChatUI props to AgentConfig
  const agentConfig: AgentConfig = {
    agentName,
    tenantGuid,
    agentDescription,
    headerTitle,
    welcomeMessage,
    primaryColor,
    foregroundColor,
    bubbleStyle,
    floatingPosition,
    launcherStyle,
    launcherText,
    footerMessage,
    predefinedPrompts,
    bubbleIconPath,
    chatbotIconPath,
    cssUrl,
    width,
    chatWidth,
    showDescription: showAgentDescription,
    chainOfThought,
    apiEndpoint,
    shareId,
    isVoiceChatEnabled,
    securityConfiguration,
    canSelectFeature
  };

  return (
    <AgentChatInterface
      agent={agentConfig}
      isWidget={isWidget}
      className={className}
      onClose={onClose}
      onMinimize={onMinimize}
      onMaximize={onMaximize}
      isMinimized={isMinimized}
      redirectUri={config.MSAL_REDIRECT_URI}
      previewMode={previewMode}
    />
  );
}