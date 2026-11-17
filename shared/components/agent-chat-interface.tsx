import React, { useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AiSparkleIcon } from './icons/ai-sparkle-icon';
import { getOrCreateSessionId, clearSessionId, storeSessionId, generateGuid, resolveSessionIdentity } from '../utils/session-manager';
import { isImageTooLarge, formatFileSize, MAX_IMAGE_SIZE_BYTES } from '../utils/file-validation';
import { GENERIC_CHAT_SEND_ERROR } from '../utils/chat-send-errors';
import { hydrateFormsMetadata } from '../utils/hydrate-forms-metadata';
import { useChat } from '../hooks/use-chat';
import { ChatMessage, ChatService, ToolApprovalDecision } from '../services/chat-service';
import { ChatHeader, MaisyView } from './chat-header';
import { ChatMessages } from './chat-messages';
import { ChatInput } from './chat-input';
import { AgentsBar } from './agents-bar';
import { ConnectionBanner } from './connection-banner';
import { ConversationList } from './conversation-list';
import { MaisyViewPane } from './maisy-view-pane';
import { isMaisyAgent } from '../utils/maisy-agent';
import { useConversations } from '../hooks/use-conversations';
import { useSessionConversationSummary } from '../hooks/use-session-conversation-summary';
import { getConversationTitle, NEW_CONVERSATION_TEXT } from '../utils/conversation-list-format';
import type { ConversationSummary } from '../models/conversation-summary';
import { ContactFormData } from './contact-form-card';
import { dispatchContactFormSubmitted } from '../services/widget-events';
import { DataContext } from "../models/chat-models";
import { AgentChatSetting, ChatDisplaySettings } from "../models/chat-settings";
import { DelegatedTokenService } from '../../shared/services/delegated-token-service';
import { ChatServiceFactory } from '../../shared/services/chat-service.factory';
import { FeatureContextService, SelectedFeature } from '../services/feature-context-service';
import { AmaisCapabilitiesContextService } from '../services/amais-capabilities-context-service';
import type { SpinUpAgentTarget } from '../schema';
import { toHistoryTimestamp } from '../utils/message-timestamp';

export interface AgentConfig {
  tenantGuid: string;
  agentName: string;
  agentId?: number;
  agentDescription?: string;
  headerTitle?: string;
  primaryColor: string;
  foregroundColor?: string;
  bubbleStyle: 'rounded' | 'square' | 'pill';
  showDescription: boolean;
  chainOfThought: boolean;
  apiEndpoint: string;
  bubbleIconPath?: string;
  chatbotIconPath?: string;
  cssUrl?: string;
  welcomeMessage?: string;
  footerMessage?: string;
  predefinedPrompts?: { title: string; prompt: string }[];
  shareId?: string;
  containerId?: string;
  targetElement?: string | HTMLElement;
  securityConfiguration?: SecurityConfig;
  isVoiceChatEnabled: boolean;
  // Derived server-side from whether the agent has the "Maisy" tenant tag — gates the
  // "Select feature" button below alongside the iframe-embed check.
  canSelectFeature?: boolean;
  // See AgentChatSetting.isMaisyAgent - read through shared/utils/maisy-agent.ts.
  isMaisyAgent?: boolean;
  width?: string;
  height?: string;
  // Named width preset (mirrors the backend AgentChatSetting.chatWidth enum); loses to an
  // explicit `width` CSS value when both are provided.
  chatWidth?: 'compact' | 'standard' | 'wide';
  floatingPosition?: 'left' | 'right';
  launcherStyle?: 'circle' | 'pill';
  launcherText?: string;
  // Origin (protocol + host, no trailing slash) of the wkflo_ui deployment that served the
  // loader script — used to resolve absolute-but-cross-origin-safe asset URLs (e.g. the
  // image-expired.svg fallback) instead of a root-relative path, which would otherwise
  // resolve against the embedding host page's own origin when this runs inside the widget.
  // Undefined/empty when not applicable (e.g. the standalone main app, served at its own
  // domain root, where a root-relative path already resolves correctly).
  baseUrl?: string;
  // True only for the CMS Test Agent tab embed (data-is-test-chat="true" on the widget's
  // loader script tag). Unlike previewMode, this is a real interactive chat that still hits
  // the backend — the flag is forwarded as the amais-wkflo-is-test-chat request header (see
  // PublicApiService.getRequestHeaders) so the backend can tag/exclude these conversations
  // from DXP analytics while still keeping them visible in Chat Logs. Never set for
  // production embeds.
  isTestChat?: boolean;
  // The school's timezone (IANA/Windows TZ ID), supplied by the host page at widget-init
  // time (data-timezone="..." on the embed script tag) — NOT read from the visitor's own
  // browser. Forwarded as the amais-wkflo-time-zone request header (see
  // PublicApiService.getRequestHeaders) so wkflo_services can correctly interpret
  // calendar-relative phrases ("last month", "this week") against the school's own
  // calendar, regardless of which timezone the site visitor's device is in.
  timeZone?: string;
  // US 7974: the tenant's time zone and date/time formats for the message timestamps, from the
  // chat configuration (getAgentSettings). Separate from `timeZone` above, which only gives the AI
  // the host page's calendar. Missing = UTC, 24h, yyyy-MM-dd.
  displaySettings?: ChatDisplaySettings;
}

export interface SecurityConfig {
  type: 'none' | 'azure-ad' | 'api-key' | 'jwt-token-callback' | '';
  apiKey?: {
    value: string;
    tenantName: string;
  };
  azureAd?: {
    clientId: string;
    tenantId: string;
    scopes: string[];
  };
  jwt?: {
    domains?: string[];
  };
}

// US 7506: what a MAISY conversation keeps in its composer while another one is open.
interface ConversationDraft {
  text: string;
  files: (File & { dataUrl?: string })[];
}

interface AgentChatInterfaceProps {
  agent: AgentConfig;
  isWidget?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  isMinimized?: boolean;
  className?: string;
  redirectUri?: string;
  requireRemoteConfig?: boolean;
  onConfigError?: (error: unknown) => void;
  // Read-only "how would this look" mode (e.g. CMS settings live preview). When true:
  // - never creates a ChatService or fetches persisted WKFlo settings/history (no backend calls)
  // - never reads/writes a session id (no localStorage/analytics)
  // - seeds a static, illustrative sample conversation instead of real history
  // - ignores send/predefined-prompt interactions (nothing to send to)
  previewMode?: boolean;
}

export const AgentChatInterface: React.FC<AgentChatInterfaceProps> = ({
  agent,
  isWidget = false,
  onClose,
  onMinimize,
  onMaximize,
  isMinimized = false,
  className = '',
  redirectUri,
  requireRemoteConfig = false,
  onConfigError,
  previewMode = false
}) => {

  const [inputValue, setInputValue] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<(File & { dataUrl?: string })[]>([]);
  const [chatService, setChatService] = useState<ChatService | null>(null);
  const [spinUpAgents, setSpinUpAgents] = useState<SpinUpAgentTarget[]>([]);
  const [remoteConfigStatus, setRemoteConfigStatus] = useState<'pending' | 'ready' | 'error'>(
    requireRemoteConfig ? 'pending' : 'ready'
  );
  // Whether a jwt-token-callback token has actually resolved. DelegatedTokenService.getToken()
  // posts a single message to window.parent and waits indefinitely for a reply — on a hard
  // reload, if the host page's own listener isn't set up yet the instant that request goes out,
  // the reply is lost and the token promise just hangs forever, silently starving every
  // authenticated call (message history, spin-up agents) without ever reaching fetch(). Effects
  // that need auth explicitly wait on this instead of firing (and hanging) while it's unresolved.
  // Non-jwt security types are trivially "ready" — there's no token round-trip to wait on.
  const [jwtTokenResolved, setJwtTokenResolved] = useState(false);
  // Overrides fetched from the backend (loadAgentSettings below) — kept separate from
  // `agent` so a prop change never wipes them out; agentConfig re-derives the merge below.
  const [remoteAgentSettings, setRemoteAgentSettings] = useState<AgentChatSetting | null>(null);
  // US 7974: the tenant's date/time display settings, when the chat configuration isn't otherwise
  // loaded (no requireRemoteConfig) - see the effect that loads them below.
  const [fetchedDisplaySettings, setFetchedDisplaySettings] = useState<ChatDisplaySettings | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeature | null>(
    () => FeatureContextService.getInstance().getCurrent()
  );
  const [isFeatureSelectionActive, setIsFeatureSelectionActive] = useState<boolean>(
    () => FeatureContextService.getInstance().isSelectionModeActive()
  );
  const [amaisCapabilities, setAmaisCapabilities] = useState(
    () => AmaisCapabilitiesContextService.getInstance().getCurrent()
  );

  useEffect(() => {
    return AmaisCapabilitiesContextService.getInstance().subscribe(setAmaisCapabilities);
  }, []);

  useEffect(() => {
    return FeatureContextService.getInstance().subscribe(setSelectedFeature);
  }, []);

  useEffect(() => {
    return FeatureContextService.getInstance().subscribeSelectionMode(setIsFeatureSelectionActive);
  }, []);

  const handleDismissSelectedFeature = useCallback(() => {
    FeatureContextService.getInstance().clearSelection();
  }, []);

  const handleToggleFeatureSelection = useCallback(() => {
    const service = FeatureContextService.getInstance();
    if (service.isSelectionModeActive()) {
      service.exitSelectionMode();
    } else {
      service.enterSelectionMode();
    }
  }, []);

  const tokenService = DelegatedTokenService.getInstance();

  // agentName/agentDescription/headerTitle: an explicitly-provided value (e.g. a script
  // tag's data-agent-name/data-header-title) takes precedence over the live-fetched one,
  // so a bare embed without saved WKFlo settings still shows what was passed in instead
  // of being wiped out by a null live value; only fall back to WKFlo's value, then a
  // hardcoded default, when nothing was provided upfront.
  //
  // bubbleIconPath/chatbotIconPath use a different (nullish-vs-empty) rule than the fields
  // above: an empty string is a meaningful, intentional value here ("no icon, show the
  // default Bot glyph") — e.g. wkflo_ui's settings-page live preview always provides a real
  // string (possibly '' after the user clears the field, or `null` straight off a backend
  // record that was never configured — AgentChatSetting.BubbleIconPath is a plain nullable
  // C# string) and that must never be clobbered by a stale one-time-fetched remote value.
  // Only fall back to the live-fetched value when the caller didn't provide the field at all
  // (null/undefined) — e.g. a widget script tag embed that omits
  // data-bubble-icon-path/data-chatbot-icon-path entirely, or a not-yet-configured agent.
  const agentConfig = useMemo<AgentConfig>(() => ({
    ...agent,
    ...remoteAgentSettings,
    agentName: agent.agentName || remoteAgentSettings?.agentName || 'Assistant',
    agentDescription: agent.agentDescription || remoteAgentSettings?.agentDescription || '',
    headerTitle: agent.headerTitle || remoteAgentSettings?.headerTitle || '',
    welcomeMessage: agent.welcomeMessage || remoteAgentSettings?.welcomeMessage || '',
    bubbleIconPath: agent.bubbleIconPath != null ? agent.bubbleIconPath : remoteAgentSettings?.bubbleIconPath,
    chatbotIconPath: agent.chatbotIconPath != null ? agent.chatbotIconPath : remoteAgentSettings?.chatbotIconPath,
    isVoiceChatEnabled: agent.isVoiceChatEnabled || remoteAgentSettings?.isVoiceChatEnabled || false,
    // US 7974: the tenant's settings from the chat configuration win; a value passed in (e.g. a
    // preview) is only the fallback.
    displaySettings: remoteAgentSettings?.displaySettings ?? fetchedDisplaySettings ?? agent.displaySettings,
  }), [agent, remoteAgentSettings, fetchedDisplaySettings]);

  // The configured name without the 'Assistant' fallback above: the Chat UI's placeholder
  // (US 7500) falls back to its own neutral text instead of "Ask Assistant".
  const configuredAgentName = agent.agentName || remoteAgentSettings?.agentName || '';

  const isJwtCallbackSecurity = agentConfig.securityConfiguration?.type === 'jwt-token-callback';
  const isAuthReady = !isJwtCallbackSecurity || jwtTokenResolved;

  // Show the feature-selection icon only for agents opted into it (server-derived
  // `canSelectFeature`, e.g. the agent has the "Maisy" tag). Reads the merged `agentConfig`,
  // not the raw `agent` prop, on purpose: agentConfig's `{...agent, ...remoteAgentSettings}`
  // spread already gives priority to whatever `chatService.getAgentSettings()` resolves with
  // over any initial static value (e.g. from the MD app's own Share-page preview, or from MD
  // API's ChatController Razor view) — once the live backend fetch resolves, it should win,
  // not the other way around.
  //
  // Additionally always require the host to have confirmed (via the AMAIS_CAPABILITIES
  // postMessage handshake, see shared/services/amais-capabilities-context-service.ts) that it
  // has the JS wired up to handle the resulting SELECTED_FEATURE/ENTER_FEATURE_SELECTION_MODE
  // messages — regardless of iframe-embed status. `amaisCapabilities` defaults to `null`
  // (fail-closed) until that message arrives, so both an older host build that predates this
  // handshake and never sends it, and any non-embedded context (dev/preview/direct-link —
  // there's no host page that could ever send it), now always leave the button hidden.
  const canEnterFeatureSelectionMode =
    !!agentConfig.canSelectFeature && amaisCapabilities?.selectFeature === true;

  // US 7550: the MAISY top bar, connection banner and offline composer - MAISY agents only.
  const isMaisy = isMaisyAgent(agentConfig);

  // US 7506 / 7507: a MAISY chat shows a conversation or the conversations list (loaded each time
  // it is shown). Each conversation keeps its own composer draft while another one is open.
  const [maisyView, setMaisyView] = useState<MaisyView>('chat');
  const [hasSwitchedMaisyView, setHasSwitchedMaisyView] = useState(false);
  const draftsRef = useRef<Map<string, ConversationDraft>>(new Map());
  const {
    conversations,
    status: conversationsStatus,
    refresh: refreshConversations,
  } = useConversations(chatService, isMaisy && !previewMode && isAuthReady && maisyView === 'list');

  // Initialize chat service when API endpoint becomes available.
  // securityConfiguration is an object — depend on its serialized content, not the
  // reference, so an upstream caller rebuilding it each render (without memoizing)
  // doesn't recreate the ChatService/SignalR connection on every unrelated re-render.
  const securityConfigurationKey = JSON.stringify(agentConfig.securityConfiguration);
  useEffect(() => {
    if (previewMode) return;

    if (agentConfig.apiEndpoint && agentConfig.tenantGuid && agentConfig.shareId && agentConfig.securityConfiguration) {
      setChatService(ChatServiceFactory.createPublicChatService({
        apiEndpoint: agentConfig.apiEndpoint,
        tenantGuid: agentConfig.tenantGuid,
        shareId: agentConfig.shareId,
        securityConfiguration: agentConfig.securityConfiguration,
        redirectUri,
        isTestChat: agentConfig.isTestChat,
        timeZone: agentConfig.timeZone
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, agentConfig.apiEndpoint, agentConfig.tenantGuid, agentConfig.shareId, securityConfigurationKey, redirectUri, agentConfig.isTestChat, agentConfig.timeZone]);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadHistoryTokenRef = useRef<object | null>(null);
  // Task 8225: the session whose history load has finished (or that is a new chat with none), so
  // the MAISY header doesn't guess a title for a restored conversation before it is known.
  const [historyLoadedFor, setHistoryLoadedFor] = useState<string | null>(null);
  
  const context = useContext(DataContext);
  const cssUrl = agentConfig.cssUrl?.trim();
  const welcomeMessage = agentConfig.welcomeMessage?.trim();
  const defaultWelcomeMessage = `Hi! I'm ${agentConfig.agentName}. How can I assist you today?`;
  const resolvedWelcomeMessage = welcomeMessage ? welcomeMessage : defaultWelcomeMessage;
  // Only fall back to the one-time-fetched context value when agentConfig didn't provide the
  // field at all (null/undefined) — an explicit '' (e.g. the settings-page live preview after
  // the user clears the icon field) must win outright and show the default AI sparkle icon
  // immediately, not be masked by a stale previously-fetched icon. See the agentConfig useMemo
  // above for why this checks nullish rather than falsy.
  const resolvedChatbotIconPath = (
    agentConfig.chatbotIconPath != null ? agentConfig.chatbotIconPath : (context.agentChatSettings?.chatbotIconPath || '')
  ).trim();
  const resolvedBubbleIconPath = (
    agentConfig.bubbleIconPath != null ? agentConfig.bubbleIconPath : (context.agentChatSettings?.bubbleIconPath || '')
  ).trim();
  const resolvedFooterMessage = (agentConfig.footerMessage || context.agentChatSettings?.footerMessage || '').trim();
  const predefinedPrompts = agentConfig.predefinedPrompts || context.agentChatSettings?.predefinedPrompts || [];
  const floatingPosition = agentConfig.floatingPosition || 'right';
  const launcherStyle = agentConfig.launcherStyle || 'circle';
  const positionClasses = floatingPosition === 'left' ? 'bottom-4 left-4' : 'bottom-4 right-4';
  const chatWidthPresets: Record<string, string> = { compact: '20rem', standard: '24rem', wide: '28rem' };
  // Precedence: explicit raw CSS width > explicit named preset on this config > preset from a
  // live-fetched remote config (never present in previewMode) > standard default.
  const resolvedChatWidth = agentConfig.width
    || chatWidthPresets[agentConfig.chatWidth || context.agentChatSettings?.chatWidth || 'standard'];
  const foregroundColor = agentConfig.foregroundColor || '#ffffff';

  useEffect(() => {
    if (previewMode || !agentConfig.shareId) return;

    const loadAgentSettings = async () => {

      if (!chatService || remoteConfigStatus === 'ready') return;

      try {
        const agentSettings = await chatService.getAgentSettings();

        setRemoteAgentSettings(agentSettings.agentChatSettings);

        // Only update configuration, preserve runtime state
        context.updateState({
          agentChatSettings: agentSettings.agentChatSettings,
        });

        setRemoteConfigStatus('ready');

        if (sessionId && agentSettings.agentChatSettings?.welcomeMessage?.trim()) {
          await loadMessageHistory(sessionId, agentSettings.agentChatSettings.welcomeMessage);
        }
      } catch (error) {
        setRemoteConfigStatus('error');
        onConfigError?.(error);
      }
    };

    loadAgentSettings();
  }, [previewMode, agentConfig.shareId, chatService, sessionId]);

  // US 7974: message timestamps use the tenant's time zone and formats from the chat configuration.
  // With requireRemoteConfig the effect above loads (and applies) that configuration; otherwise
  // only its display settings are taken from it, so the embed's own attributes keep their say.
  useEffect(() => {
    if (previewMode || requireRemoteConfig || !chatService || !agentConfig.shareId || agent.displaySettings) return;

    let cancelled = false;
    Promise.resolve()
      .then(() => chatService.getAgentSettings())
      .then(settings => {
        const displaySettings = settings.agentChatSettings?.displaySettings;
        if (!cancelled && displaySettings) setFetchedDisplaySettings(displaySettings);
      })
      .catch(error => console.warn('Failed to load the chat display settings:', error));
    return () => { cancelled = true; };
  }, [previewMode, requireRemoteConfig, chatService, agentConfig.shareId, agent.displaySettings]);

  // Agents this agent can spin up, used to populate the @mention picker in the chat input.
  // Depends on remoteConfigStatus (not just chatService): this effect must re-run once
  // loadAgentSettings() above flips status to 'ready', not just on mount when chatService
  // first becomes available (status is still its initial value at that point). Also waits on
  // isAuthReady: for jwt-token-callback agents, firing before the token resolves doesn't fail
  // outright (getRequestHeaders awaits the token internally) but can hang indefinitely if that
  // token request is ever lost — see isAuthReady's own comment. Waiting here means a hard reload
  // that loses the token request just leaves the picker empty instead of a stuck fetch.
  useEffect(() => {
    if (previewMode || !chatService || remoteConfigStatus !== 'ready' || !isAuthReady) return;

    const loadSpinUpAgents = async () => {
      const response = await chatService.getSpinUpAgents();
      setSpinUpAgents(response.success ? response.data?.data ?? [] : []);
    };

    loadSpinUpAgents();
  }, [previewMode, chatService, remoteConfigStatus, isAuthReady]);

  const handleNewMessage = useCallback((message: any) => {
      
  }, []);

  const handleNewToolExecution = useCallback((toolName: string, status: string, statusCode?: number, description?: string) => {
   
  }, []);

  const handleConnectionChange = useCallback((connected: boolean) => {
    console.log('Chat connection changed:', connected);
  }, []);

  // US 7501: a phrase spoken while agents work is kept as the draft (appended), not sent.
  const handleVoiceTranscriptWhileWorking = useCallback((transcript: string) => {
    setInputValue(previous => previous.trim() ? `${previous.trimEnd()} ${transcript}` : transcript);
  }, []);

  const handleReconnect = useCallback(() => {
    // Reload message history after reconnecting
    if (sessionId) {
      loadMessageHistory(sessionId);
    }
  }, [sessionId]);

  // Initialize chat service using useChat hook
  const {
    messages: messages,
    isConnected,
    isLoading: chatLoading,
    connectionState,
    connectionPhase,
    restoreWorkingAgents,
    getLiveEventToken,
    isAgentTyping,
    typingAgents,
    sessionAgents,
    activeAgent,
    activeStatus,
    isWorking,
    stopAllAgents,
    sendMessage: sendChatMessage,
    error: chatError,
    reconnect,
    getAuthHeaders,
    addMessage,
    updateMessageRating,
    clearMessages,
    isListening,
    isAISpeaking,
    isVoiceChatConnected,
    streamingActive,
    startConversation,
    stopConversation,
    submitContactForm,
    skipContactForm,
    hasMandatoryPendingContactForm,
    respondToToolApproval,
    hasPendingToolApproval,
  } = useChat(
    chatService,
    {
      chatId: sessionId,
      autoConnect: true,
      chainOfThought: agentConfig.chainOfThought,
      mergeSubAgentCards: !isWidget,
      onMessage: handleNewMessage,
      onToolExecution: handleNewToolExecution,
      onConnectionChange: handleConnectionChange,
      onReconnect: handleReconnect,
      onVoiceTranscriptWhileWorking: handleVoiceTranscriptWhileWorking
    }
  );
  
  // Check if voice chat is enabled: explicit config value takes precedence over live settings
  const isVoiceChatEnabled = agentConfig.isVoiceChatEnabled;

  // previewMode's loadToken effect below isn't gated on previewMode (pre-existing, unrelated to
  // this fix) and has no real host to answer it, so isAuthReady would never flip true there —
  // excluded here so preview mode doesn't show a permanent loading state over a pre-existing gap.
  const isLoading = chatLoading || (!previewMode && !isAuthReady);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isAgentTyping, typingAgents, messages]);

  const handleContactFormSubmit = useCallback(async (message: ChatMessage, data: ContactFormData) => {
    const result = await submitContactForm(sessionId, message, data);
    if (!result.success) {
      throw new Error(result.error || 'Submission failed. Please try again.');
    }
    // US 8021: public event so the host page can act on the submission (the CMS emails its
    // admins). Only after a successful submit; never throws.
    dispatchContactFormSubmitted({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      sessionId,
      shareId: agentConfig.shareId,
    });
    // No thank-you message here — ContactFormCompleted (handled in useChat) replays the
    // original question and the agent's real answer replaces it.
  }, [submitContactForm, sessionId, agentConfig.shareId]);

  // US 7575: answer an "Ask for permission" card. On Allow the backend runs the stored call and
  // resumes the turn, streaming the reply over SignalR as usual.
  const handleToolApprovalDecision = useCallback(
    (message: ChatMessage, decision: ToolApprovalDecision) =>
      message.toolApproval
        ? respondToToolApproval(message.toolApproval, decision)
        : Promise.resolve({ success: false, error: 'This request is no longer available.' }),
    [respondToToolApproval]
  );

  // Text-suggestion card actions — post the insert instruction to the host page (PetraCMS),
  // which applies it to whichever feature is currently selected on the page at click time (see
  // insertTextIntoFeature's doc comment). Bug fix (post-Revision-2): these must NOT send the
  // suggestion's original featureId anymore — that regressed apply-time targeting to always hit
  // the feature the suggestion was generated for, ignoring whatever the admin has since actually
  // selected. Instead, each handler captures `FeatureContextService.getInstance().getCurrent()`
  // — the feature *currently* selected on the host page, live-tracked via the existing
  // SELECTED_FEATURE relay — at the moment of the click, and returns that featureId (not
  // `void`) so the card can remember which feature this specific action actually targeted, for
  // Undo to reference later even if the selection moves on afterward. The card itself
  // (text-suggestion-card.tsx) owns the proposed <-> applied loop as local state; these handlers
  // only need to fire the side effect and hand back what was targeted.
  const handleAddTextSuggestionToTop = useCallback((message: ChatMessage): string | null => {
    const featureId = FeatureContextService.getInstance().getCurrent()?.featureId ?? null;
    if (!message.textSuggestion) return featureId;
    FeatureContextService.getInstance().insertTextIntoFeature('top', message.textSuggestion.suggestedText);
    return featureId;
  }, []);

  const handleAddTextSuggestionToBottom = useCallback((message: ChatMessage): string | null => {
    const featureId = FeatureContextService.getInstance().getCurrent()?.featureId ?? null;
    if (!message.textSuggestion) return featureId;
    FeatureContextService.getInstance().insertTextIntoFeature('bottom', message.textSuggestion.suggestedText);
    return featureId;
  }, []);

  const handleReplaceAllWithTextSuggestion = useCallback((message: ChatMessage): string | null => {
    const featureId = FeatureContextService.getInstance().getCurrent()?.featureId ?? null;
    if (!message.textSuggestion) return featureId;
    FeatureContextService.getInstance().insertTextIntoFeature('replace', message.textSuggestion.suggestedText);
    return featureId;
  }, []);

  // US 6930 (Revision 2): the "Keep / Undo" prompt shown after any of the three actions above.
  // Keep is a pure no-op on the host side — whatever was just applied already stands in the
  // editor, so there's nothing to tell PetraCMS; this handler exists purely for symmetry with
  // Undo and as an extension point (e.g. telemetry) rather than because it needs to send
  // anything today. Undo asks the host to restore the content captured immediately before that
  // specific action, for the specific feature that action actually targeted — the `featureId`
  // captured by whichever of the three handlers above ran, not whatever's selected now (see
  // FeatureContextService.undoTextFeature). Either way, the card loops back to its three-button
  // `proposed` state on its own — these handlers don't drive that transition, just the side
  // effect.
  const handleKeepTextSuggestion = useCallback((_message: ChatMessage) => {
    // No host message needed — the edit already stands.
  }, []);

  const handleUndoTextSuggestion = useCallback((_message: ChatMessage, featureId: string | null) => {
    FeatureContextService.getInstance().undoTextFeature(featureId);
  }, []);

  useEffect(() => {
    if (!isMinimized) {
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [isMinimized]);

  useEffect(() => {

    if (chatService) {
     
      // Check initial authentication state
      const checkAuth = () => {
        if (chatService) {
          const authStatus = chatService.isAuthenticated();
          setIsAuthenticated(authStatus);
          
          if (authStatus) {
            const user = chatService.getCurrentUser();
            setCurrentUser(user);
          }
        }
      };
      
      checkAuth();
    }
  }, [chatService]);

  // Single source of truth for the identity a session is stored under, shared by the mount path
  // and resetSession so reset always clears the exact key that was stored.
  const resolveCurrentSessionIdentity = () => resolveSessionIdentity({
    securityType: agentConfig.securityConfiguration?.type,
    shareId: agentConfig.shareId,
    tenantGuid: agentConfig.tenantGuid,
    jwtCallbackTokenSiteId: context.jwtCallbackTokenSiteId,
    jwtCallbackTokenSub: context.jwtCallbackTokenSub,
    userName: context.userName,
    isTestChat: agentConfig.isTestChat,
  });

  useEffect(() => {
    // isAuthReady: for jwt-token-callback agents, don't attempt this until the token has
    // actually resolved (see isAuthReady's own comment) — explicit rather than relying solely on
    // context.jwtCallbackTokenSiteId below staying empty, which only holds as long as every
    // valid JWT payload always carries a site_id claim.
    if (previewMode || !isAuthReady) return;

    // Initialize session ID (see resolveSessionIdentity for how site/user identity is chosen).
    // Test chats get a fresh, in-memory-only session per page load (see session-manager.ts).
    const identity = resolveCurrentSessionIdentity();
    if (!identity) return;

    const currentSessionId = getOrCreateSessionId(identity.shareId, identity.siteId, identity.userId, identity.isTestChat);

    setSessionId(currentSessionId);

    // Load message history if available
    loadMessageHistory(currentSessionId);
  }, [
    previewMode,
    isAuthReady,
    chatService,
    agentConfig.securityConfiguration?.type,
    agentConfig.shareId,
    agentConfig.tenantGuid,
    context.userName,
    context.jwtCallbackTokenSiteId,
    context.jwtCallbackTokenSub,
    agentConfig.isTestChat,
  ]);

  // Keep the greeting bubble (id '1') in sync when the welcome message setting changes
  // after it's already been rendered — e.g. the settings panel preview, where the user
  // edits the field once the session/greeting has already loaded. addMessage merges by
  // id in place, so this only ever touches the local placeholder greeting, never real
  // backend history.
  useEffect(() => {
    if (!context.displayWelcomeMessage) return;
    if (!messages.some(m => m.id === '1')) return;

    addMessage({
      id: '1',
      content: resolvedWelcomeMessage,
      type: 'assistant',
      timestamp: new Date(),
      channelMessageType: 1
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedWelcomeMessage, context.displayWelcomeMessage]);

  // Preview-only: seed a static, illustrative sample conversation (never persisted — this is
  // local React state only, same as any other addMessage call) instead of fetching real history.
  useEffect(() => {
    if (!previewMode) return;

    clearMessages();

    if (context.displayWelcomeMessage) {
      addMessage({
        // Must be '1' — chat-messages.tsx only renders quick-reply buttons under the message with
        // this exact id (mirrors the real, non-preview welcome message at loadMessageHistory below).
        id: '1',
        content: resolvedWelcomeMessage,
        type: 'assistant',
        timestamp: new Date(),
        channelMessageType: 1
      });
    }

    addMessage({
      id: 'preview-sample-user',
      content: 'Hi! Can you tell me more about your services?',
      type: 'user',
      timestamp: new Date(),
      channelMessageType: 1
    });

    addMessage({
      id: 'preview-sample-reply',
      content: 'Of course! This is a sample reply so you can see how a real answer would look here.',
      type: 'assistant',
      timestamp: new Date(),
      channelMessageType: 1
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, resolvedWelcomeMessage, context.displayWelcomeMessage]);

  useEffect(() => {
    const decodeJWT = (token: string) => {
      try {
        // JWT tokens have three parts: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
          throw new Error('Invalid JWT token format');
        }
        
        // Decode the payload (second part)
        const payload = parts[1];
        // Add padding if necessary for base64 decoding
        const paddedPayload = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, '=');
        const decodedPayload = atob(paddedPayload);
        const claims = JSON.parse(decodedPayload);
        
        return claims;
      } catch (error) {
        console.error('Failed to decode JWT token:', error);
        return null;
      }
    };

    const loadToken = async () => {
      if (agentConfig.securityConfiguration?.type === 'jwt-token-callback' && agentConfig.securityConfiguration.jwt?.domains) {
        
        let token = await tokenService.getToken(agentConfig.securityConfiguration.jwt?.domains);

        if (token) {
          setJwtTokenResolved(true);
          const claims = decodeJWT(token);

          // Example: Set user information from claims
          if (claims) {
            context.updateState({
              jwtCallbackTokenSub: claims.sub || '',
              jwtCallbackTokenSiteId: claims.site_id || '',
            });
          }
        }
      }
    };
    
    loadToken();
  }, [agentConfig.securityConfiguration?.type]);

  const loadMessageHistory = useCallback(async (currentSessionId: string, welcomeOverride?: string) => {
    if (!currentSessionId) return;

    // Each call gets a unique token; if a newer call starts, the older one is discarded
    const token = {};
    loadHistoryTokenRef.current = token;
    let historyAnswered = false;

    try {
      clearMessages();

      // Greeting with history
      const resolvedGreeting = welcomeOverride?.trim()
        ? welcomeOverride.trim()
        : resolvedWelcomeMessage;

      if (context.displayWelcomeMessage) {
        addMessage({
          id: '1',
          content: resolvedGreeting,
          type: 'assistant',
          timestamp: new Date(),
          channelMessageType: 1 // Normal
        });
      }

      if (!chatService) return;

      const response = await chatService.readMessages(currentSessionId);
      historyAnswered = true;

      // If a newer loadMessageHistory call has started, discard this result
      if (loadHistoryTokenRef.current !== token) return;

      if (response.success && response.data?.data && Array.isArray(response.data.data) && response.data.data.length > 0) {

        // hydrateFormsMetadata turns a Forms-channel message's generic metadata envelope
        // (e.g. { formType: 'TextSuggestion', data: '...' }) into the typed field a card
        // reads (e.g. textSuggestion) — same helper the live SignalR path uses in use-chat.ts,
        // applied here too so these cards survive a page refresh instead of only ever
        // rendering once, live, when they first arrive.
        // US 7974: history timestamps are UTC ISO strings, or null when the server has none.
        response.data.data.forEach(msg => addMessage(hydrateFormsMetadata({
          ...msg,
          timestamp: toHistoryTimestamp(msg.timestamp),
          rawTimestamp: typeof msg.timestamp === 'string' ? msg.timestamp : undefined,
          rating: msg.rating ?? null,
        })));

        // Scroll to bottom after history messages are rendered
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 50);

        console.log(`Loaded ${response.data.data.length} messages from history`);
      } else {
        console.log('No message history found or empty response');
      }
    } catch (error) {
      console.warn('Failed to load message history:', error);
      historyAnswered = true;
    } finally {
      if (historyAnswered && loadHistoryTokenRef.current === token) setHistoryLoadedFor(currentSessionId);
    }
  }, [chatService, clearMessages, addMessage, context.displayWelcomeMessage, resolvedWelcomeMessage]);

  const handleLoadHistory = useCallback(() => {
    if (sessionId) {
      loadMessageHistory(sessionId);
    }
  }, [sessionId, loadMessageHistory]);

  // US 7506: makes `id` the agent's current session, with the identity resetSession uses, so a
  // reload reopens it.
  // Bug 7958: stored under the same identity (and test-chat store) as the mount path, so a reload
  // reopens it and a test chat never writes its session to localStorage.
  const storeCurrentSession = useCallback((id: string) => {
    const identity = resolveSessionIdentity({
      securityType: agentConfig.securityConfiguration?.type,
      shareId: agentConfig.shareId,
      tenantGuid: agentConfig.tenantGuid,
      jwtCallbackTokenSiteId: context.jwtCallbackTokenSiteId,
      jwtCallbackTokenSub: context.jwtCallbackTokenSub,
      userName: context.userName,
      isTestChat: agentConfig.isTestChat,
    });
    if (identity) storeSessionId(identity.shareId, identity.siteId, identity.userId, id, identity.isTestChat);
  }, [agentConfig.securityConfiguration?.type, agentConfig.shareId, agentConfig.tenantGuid, agentConfig.isTestChat,
    context.jwtCallbackTokenSiteId, context.jwtCallbackTokenSub, context.userName]);

  // US 7506: agents keep working server-side after the user leaves a conversation; on return,
  // show the work still going on (typing, Agents bar, Stop) - as the host agent's, since the state
  // doesn't say which agent works. The live events (typing, idle, the result) take over from there.
  // A live event (e.g. typing off, idle) that arrives while /state is in flight is newer than its
  // answer, so a late isWorking: true is dropped rather than turning typing and Stop back on.
  const restoreSessionWorkingState = useCallback(async (id: string) => {
    if (!chatService) return;
    const liveEventToken = getLiveEventToken(id);
    const workingState = await chatService.getSessionWorkingState(id);
    if (!workingState.isWorking) return;
    restoreWorkingAgents(id, [{ agentId: agentConfig.agentId, agentName: agentConfig.agentName }], liveEventToken);
  }, [chatService, getLiveEventToken, restoreWorkingAgents, agentConfig.agentId, agentConfig.agentName]);

  // US 7506: the back arrow. The conversation keeps its draft; its history and Agents bar stay as
  // they are, and its session stays joined, so its agents' work keeps arriving.
  const handleShowConversations = useCallback(() => {
    if (sessionId) draftsRef.current.set(sessionId, { text: inputValue, files: selectedFiles });
    setHasSwitchedMaisyView(true);
    setMaisyView('list');
  }, [sessionId, inputValue, selectedFiles]);

  // Task 8225: the title in the MAISY chat header. The row the conversation was opened from, else
  // a one-off lookup of the current session; "New conversation" when it has neither title nor
  // preview. Nothing in preview (no real conversation there) or while the lookup is in flight.
  const [openedRow, setOpenedRow] = useState<ConversationSummary | null>(null);
  const openedRowForSession = openedRow?.sessionId === sessionId ? openedRow : null;
  // The server lists a session once its first turn is done: an agent reply, with the agents idle.
  const hasCompletedTurn = !isWorking && messages.some(message => message.id !== '1' && message.type === 'assistant');
  const { summary: lookedUpSummary, isSettled: isSummarySettled } = useSessionConversationSummary(
    chatService,
    sessionId,
    isMaisy && !previewMode && isAuthReady,
    hasCompletedTurn,
    !!openedRowForSession,
  );
  const currentSummary = openedRowForSession ?? lookedUpSummary;
  // No title while it is still unknown: a restored session until its history is in, and a
  // conversation with a completed turn until its lookup has answered. "New conversation" only for a
  // new, empty chat or when the lookup found nothing.
  const isTitleKnown = !!openedRowForSession
    || (historyLoadedFor === sessionId && (!hasCompletedTurn || isSummarySettled));
  const maisyConversationTitle = !isMaisy || previewMode || !isTitleKnown
    ? undefined
    : currentSummary ? getConversationTitle(currentSummary) : NEW_CONVERSATION_TEXT;

  // US 7506: a row of the conversations list. The conversation open before is still on screen as
  // it was; any other one gets its own draft back, its history and whether its agents still work.
  // useChat leaves the previous session's SignalR group and joins this one.
  const handleOpenConversation = useCallback((id: string) => {
    setHasSwitchedMaisyView(true);
    setMaisyView('chat');
    // Task 8225: the header shows the title of the row that was opened (a fresh one when coming back
    // to the open conversation, as the list reloads on every visit).
    const row = conversations.find(conversation => conversation.sessionId === id);
    if (row) setOpenedRow(row);
    if (id === sessionId) return;

    const draft = draftsRef.current.get(id);
    setInputValue(draft?.text ?? '');
    setSelectedFiles(draft?.files ?? []);
    setAuthError(null);
    storeCurrentSession(id);
    setSessionId(id);
    void loadMessageHistory(id).then(() => restoreSessionWorkingState(id));
  }, [sessionId, conversations, storeCurrentSession, loadMessageHistory, restoreSessionWorkingState]);

  // US 7505: New chat - an empty conversation with the greeting, in a new session. The one that was
  // open is kept: server-side, and its draft here. Only shown in the list after its first message
  // (the server lists a session once it has a turn). When the open conversation is already a new,
  // empty one, New chat only brings it back from the list - there is nothing to start.
  const isOpenConversationEmpty = !messages.some(message => message.id !== '1');
  const handleNewChat = useCallback(() => {
    if (previewMode) return;
    if (maisyView === 'list') setHasSwitchedMaisyView(true);
    setMaisyView('chat');
    if (isOpenConversationEmpty) return;

    if (sessionId) draftsRef.current.set(sessionId, { text: inputValue, files: selectedFiles });
    // Bug 7958: same identity resolution as the mount path and resetSession.
    const identity = resolveSessionIdentity({
      securityType: agentConfig.securityConfiguration?.type,
      shareId: agentConfig.shareId,
      tenantGuid: agentConfig.tenantGuid,
      jwtCallbackTokenSiteId: context.jwtCallbackTokenSiteId,
      jwtCallbackTokenSub: context.jwtCallbackTokenSub,
      userName: context.userName,
      isTestChat: agentConfig.isTestChat,
    });
    // Task 8225: a new chat has no history to wait for.
    let newSessionId: string;
    if (identity) {
      clearSessionId(identity.shareId, identity.siteId, identity.userId, identity.isTestChat);
      newSessionId = getOrCreateSessionId(identity.shareId, identity.siteId, identity.userId, identity.isTestChat);
    } else {
      newSessionId = generateGuid();
    }
    setSessionId(newSessionId);
    setHistoryLoadedFor(newSessionId);

    clearMessages();
    if (context.displayWelcomeMessage) {
      addMessage({
        id: '1',
        content: resolvedWelcomeMessage,
        type: 'assistant',
        timestamp: new Date(),
        channelMessageType: 1 // Normal
      });
    }
    setInputValue('');
    setSelectedFiles([]);
    setAuthError(null);
  }, [
    previewMode, maisyView, isOpenConversationEmpty, sessionId, inputValue, selectedFiles,
    agentConfig.securityConfiguration?.type, agentConfig.shareId, agentConfig.tenantGuid, agentConfig.isTestChat,
    context.jwtCallbackTokenSiteId, context.jwtCallbackTokenSub, context.userName, context.displayWelcomeMessage,
    clearMessages, addMessage, resolvedWelcomeMessage,
  ]);

  // US 7506: back in a conversation, it shows its latest message.
  useEffect(() => {
    if (!isMaisy || maisyView !== 'chat') return;
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isMaisy, maisyView]);

  // US 7506: once the connection is back (useChat re-joins the session), the open MAISY
  // conversation catches up on what it missed and on whether its agents are still working.
  const previousConnectionPhaseRef = useRef(connectionPhase);
  useEffect(() => {
    const previous = previousConnectionPhaseRef.current;
    previousConnectionPhaseRef.current = connectionPhase;
    if (!isMaisy || previewMode || !sessionId || connectionPhase !== 'connected') return;
    if (previous !== 'reconnecting' && previous !== 'disconnected') return;
    void loadMessageHistory(sessionId).then(() => restoreSessionWorkingState(sessionId));
    // Only a change of connection phase starts this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionPhase]);

  const handleLogin = async () => {
    if (!chatService) return;
    
    try {
      setAuthError(null);
      await chatService.login();
      
      // Update authentication state
      setIsAuthenticated(chatService.isAuthenticated());
      setCurrentUser(chatService.getCurrentUser());
    } catch (error) {
      console.error('Login failed:', error);
      setAuthError(error instanceof Error ? error.message : 'Login failed');
    } finally {

    }
  };

  const handleLogout = async () => {
    if (!chatService) return;
    
    try {
      await chatService.logout();
      setIsAuthenticated(false);
      setCurrentUser(null);
      setAuthError(null);
    } catch (error) {
      console.error('Logout failed:', error);
      setAuthError(error instanceof Error ? error.message : 'Logout failed');
    }
  };

  const resetSession = () => {
    // Clear the stored session and create a new one, using the same identity (and therefore the
    // same storage key) the mount path stored it under.
    const identity = resolveCurrentSessionIdentity();
    let newSessionId: string;
    if (identity) {
      clearSessionId(identity.shareId, identity.siteId, identity.userId, identity.isTestChat);
      newSessionId = getOrCreateSessionId(identity.shareId, identity.siteId, identity.userId, identity.isTestChat);
    } else {
      // Not enough identity to key a stored session yet: still start a fresh conversation.
      newSessionId = generateGuid();
    }

    setSessionId(newSessionId);
    clearMessages();
    // Clear current messages and start fresh
    if (context.displayWelcomeMessage) {
      addMessage(
        {
          id: '1',
          content: resolvedWelcomeMessage,
          type: 'assistant',
          timestamp: new Date(),
          channelMessageType: 1 // Normal
        }
      );
    }
    
    setAuthError(null);
  };

  const sendMessage = async (overrideInput?: string) => {
    // Preview is read-only/non-interactive — there is no real conversation to send into.
    if (previewMode) return;

    const activeInput = overrideInput !== undefined ? overrideInput : inputValue;
    const activeFiles = overrideInput !== undefined ? [] : selectedFiles;

    // US 7575: nothing new can be sent while an agent waits for a tool-approval answer.
    // US 7500: nor while agents are working (Enter, prompts and chips alike) - Stop comes first.
    if ((!activeInput.trim() && activeFiles.length === 0) || isLoading || hasPendingToolApproval || isWorking) return;
    // US 7550: MAISY keeps the draft while it isn't connected; it can be sent once it's back.
    if (isMaisy && agentConfig.apiEndpoint && connectionPhase !== 'connected') return;
    
    // One message per file
    activeFiles.forEach((f, i) => {
      addMessage({
        id: `${Date.now()}-file-${i}`,
        content: '',
        type: 'user',
        timestamp: new Date(),
        channelMessageType: 1,
        file: { name: f.name, data: f.dataUrl || '', mimeType: f.type, size: f.size }
      });
    });
    // Text message (if any)
    if (activeInput.trim()) {
      addMessage({
        id: Date.now().toString(),
        content: activeInput,
        type: 'user',
        timestamp: new Date(),
        channelMessageType: 1
      });
    }

    const currentInput = activeInput;
    setInputValue('');
    setSelectedFiles([]);
    setAuthError(null);

    try {
      // If API endpoint is provided, make actual API call
      if (agentConfig.apiEndpoint && sendChatMessage) {
        // Check if authentication is required but not authenticated
        if (agentConfig.securityConfiguration?.type === 'azure-ad' && !isAuthenticated) {
          await handleLogin();
        }

        const result = await sendChatMessage(currentInput, sessionId, activeFiles.map(f => ({ fileName: f.name, fileData: f.dataUrl ?? '', fileSize: f.size })));
        // US 7948: the send was rejected (e.g. image too large) - say why in the chat.
        if (!result.success) {
          addMessage({
            id: `error-${Date.now()}`,
            content: result.error || GENERIC_CHAT_SEND_ERROR,
            type: 'assistant',
            timestamp: new Date(),
            channelMessageType: 1 // Normal
          });
        }
      } else {
        // No API endpoint, simulate agent response
        const simulatedResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          content: `No API endpoint configured. You said: "${currentInput}"`,
          type: 'assistant',
          timestamp: new Date(),
          channelMessageType: 1 // Normal
        };
        addMessage(simulatedResponse);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setAuthError(error instanceof Error ? error.message : chatError || 'Unknown error occurred');
      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: 'I apologize, but I encountered an error. Please try again.',
        type: 'assistant',
        timestamp: new Date(),
        channelMessageType: 1 // Normal
      };
      addMessage(errorResponse);
    }
  };

  const handlePredefinedPromptClick = (prompt: string) => {
    // US 7500: checked here too, so a blocked click doesn't overwrite the user's draft.
    if (previewMode || !prompt.trim() || isWorking) return;
    setInputValue(prompt);
    sendMessage(prompt);
  };

  // US 7501: the UI is already idle when this returns; a failed request is only logged by useChat.
  const handleStopAllAgents = useCallback(() => {
    void stopAllAgents();
  }, [stopAllAgents]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    // Future: Send typing indicator to server when SignalR is integrated
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const allowedDocTypes = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.csv', '.xls', '.xlsx'];

    const oversizedImages = files.filter(isImageTooLarge);
    const filesToRead = files.filter(file => !isImageTooLarge(file));

    const readFile = (file: File): Promise<File & { dataUrl?: string }> =>
      new Promise((resolve, reject) => {
        if (file.type.startsWith('image/') || allowedDocTypes.some(ext => file.name.toLowerCase().endsWith(ext))) {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve(Object.assign(file, { dataUrl: event.target?.result as string }));
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        } else {
          reject(new Error('invalid'));
        }
      });

    const invalidFiles: string[] = [];
    Promise.all(
      filesToRead.map(file =>
        readFile(file).catch(() => {
          invalidFiles.push(file.name);
          return null;
        })
      )
    ).then(results => {
      const valid = results.filter((f): f is File & { dataUrl?: string } => f !== null);
      if (valid.length > 0) {
        setSelectedFiles(prev => {
          const remaining = Math.max(0, 5 - prev.length);
          return [...prev, ...valid.slice(0, remaining)];
        });
        console.log('Files selected:', valid.map(f => f.name));
      }
      if (invalidFiles.length > 0) {
        console.warn('Invalid file types:', invalidFiles);
        const message: ChatMessage = {
          id: (Date.now() + 1).toString(),
          content: `Please select an image file (jpg, png, gif) or document (pdf, doc, docx, txt, rtf, odt, csv, xls, xlsx).`,
          type: 'assistant',
          timestamp: new Date(),
          channelMessageType: 1
        };
        addMessage(message);
      }
      if (oversizedImages.length > 0) {
        console.warn('Oversized images:', oversizedImages.map(f => f.name));
        const message: ChatMessage = {
          id: (Date.now() + 2).toString(),
          content: `${oversizedImages.map(f => f.name).join(', ')} exceed${oversizedImages.length === 1 ? 's' : ''} the ${formatFileSize(MAX_IMAGE_SIZE_BYTES)} image size limit.`,
          type: 'assistant',
          timestamp: new Date(),
          channelMessageType: 1
        };
        addMessage(message);
      }

      // Reset the input value to allow selecting the same file again
      e.target.value = '';
    });
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleRateMessage = useCallback(async (id: string, messageId: string, isThumbsUp: boolean) => {
    if (!chatService) return;
    updateMessageRating(id, isThumbsUp ? 'thumbsUp' : 'thumbsDown');
    await chatService.rateMessage(sessionId, messageId, isThumbsUp);
  }, [chatService, sessionId, updateMessageRating]);

  if (requireRemoteConfig && remoteConfigStatus !== 'ready') {
    return null;
  }

  if (isMinimized) {
    const bubbleIconPath = resolvedBubbleIconPath;
    const isPillLauncher = launcherStyle === 'pill';

    return (
      <div
        className={`wkflo-widget-minimized ${isPillLauncher ? 'wkflo-widget-minimized--pill' : ''} wkflo-shadow-lg ${
          // previewMode leaves alignment to the caller's own flex justify-content (the settings
          // live preview uses this to actually show the Left/Right position setting) — mx-auto
          // would silently re-center it regardless of that.
          isWidget ? `fixed ${positionClasses}` : (previewMode ? '' : 'mx-auto')
        }`}
        style={{
          backgroundColor: agentConfig.primaryColor,
          zIndex: isWidget ? 9999 : 'auto'
        } as React.CSSProperties}
        onClick={onMaximize || onMinimize} // Expand back when clicked
        title={`Open ${agentConfig.agentName} chat`}
      >
        {cssUrl ? <link rel="stylesheet" href={cssUrl} /> : null}
        {isPillLauncher ? (
          <>
            <div className="wkflo-widget-launcher-icon">
              {bubbleIconPath ? (
                // w-full h-full + object-cover: fills the round badge (now overflow-hidden in
                // chat-components.css) completely, crops to the circle, and preserves the
                // source image's aspect ratio instead of stretching a non-square icon.
                <img
                  src={bubbleIconPath}
                  alt="Chat bubble icon"
                  className="w-full h-full object-cover"
                />
              ) : (
                // Smaller than the image case on purpose: the sparkle is a generic glyph with its own
                // baked-in padding, so blowing it up to the near-fill image size looks chunky.
                <AiSparkleIcon className="w-7 h-7" style={{ color: foregroundColor }} />
              )}
            </div>
            <span className="wkflo-widget-launcher-text" style={{ color: foregroundColor }}>
              {agentConfig.launcherText || agentConfig.agentName}
            </span>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            {/* Clips the icon to a circle that exactly fills the 64px launcher button,
                deliberately scoped to just this inner wrapper (not the outer
                .wkflo-widget-minimized button) so the "expandable" indicator dot below —
                a sibling positioned near the button's edge — never gets clipped by the
                same overflow boundary. */}
            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
              {bubbleIconPath ? (
                // w-full h-full + object-cover: fills the round wrapper completely, crops to
                // the circle, and preserves the source image's aspect ratio instead of
                // stretching a non-square icon.
                <img
                  src={bubbleIconPath}
                  alt="Chat bubble icon"
                  className="w-full h-full object-cover"
                />
              ) : (
                // Smaller than the image case on purpose: the sparkle is a generic glyph with its own
                // baked-in padding, so blowing it up to the near-fill image size looks chunky.
                <AiSparkleIcon className="w-7 h-7" style={{ color: foregroundColor }} />
              )}
            </div>
            {/* Optional: Add a small indicator that it can be expanded */}
            <div
              className="absolute w-4 h-4 bg-green-500 rounded-full border-2 border-white"
              style={{
                top: 'calc(var(--spacing))',
                right: 'calc(var(--spacing) * 12)'
              }}
            ></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`wkflo-chat-container wkflo-shadow-lg ${
        // previewMode: same reasoning as the minimized branch above — no w-full/mx-auto, so the
        // caller's flex justify-content can actually move it left/right. Width still comes from
        // the inline chatWidth/width style below, so dropping w-full doesn't leave it unsized.
        isWidget ? `fixed ${positionClasses} rounded-lg` : (previewMode ? '' : 'w-full mx-auto')
      } ${className}`}
      style={{
        '--wkflo-primary-color': agentConfig.primaryColor,
        zIndex: isWidget ? 9999 : 'auto',
        // Widget mode always sizes off resolvedChatWidth (unchanged). Non-widget mode only
        // applies an inline width when one was explicitly requested (raw width or a named
        // chatWidth preset, e.g. the settings live preview) — otherwise leave sizing to the
        // caller's `className` (existing chat-ui/chat-widget share pages rely on this).
        ...(isWidget
          ? { width: resolvedChatWidth }
          : (agentConfig.width
              ? { width: agentConfig.width }
              : (agentConfig.chatWidth ? { width: chatWidthPresets[agentConfig.chatWidth] } : {}))),
        ...(agentConfig.height ? { height: agentConfig.height } : {}),
      } as React.CSSProperties}
    >
      {cssUrl ? <link rel="stylesheet" href={cssUrl} /> : null}
      {/* Header */}
      <ChatHeader
        agent={{ ...agentConfig, chatbotIconPath: resolvedChatbotIconPath || undefined, bubbleIconPath: resolvedBubbleIconPath || undefined }}
        isWidget={isWidget}
        isConnected={isConnected}
        connectionState={connectionState}
        isAuthenticated={isAuthenticated}
        currentUser={currentUser}
        isLoading={isLoading}
        onClose={onClose}
        onMinimize={onMinimize}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onResetSession={resetSession}
        onLoadHistory={handleLoadHistory}
        onReconnect={reconnect}
        isMaisy={isMaisy}
        connectionPhase={connectionPhase}
        maisyView={maisyView}
        conversationTitle={maisyConversationTitle}
        onShowConversations={isMaisy && !previewMode ? handleShowConversations : undefined}
        onNewChat={isMaisy && !previewMode ? handleNewChat : undefined}
      />

      {/* US 7506 / 7507: a MAISY chat switches between the conversation and the conversations
          list, sliding in from the side it comes from. Other agents only have the conversation. */}
      <MaisyViewPane isMaisy={isMaisy} view={maisyView} animate={hasSwitchedMaisyView}>
        {isMaisy && maisyView === 'list' ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <ConversationList
              conversations={conversations}
              status={conversationsStatus}
              activeSessionId={sessionId}
              onOpenConversation={handleOpenConversation}
              onRetry={refreshConversations}
              displaySettings={agentConfig.displaySettings}
              // US 7506: focus goes to the conversation that was open (or the first row / empty state).
              focusOnShow
            />
          </div>
        ) : (
          <>
            {/* Messages */}
            <ChatMessages
              messages={messages}
              isWidget={isWidget}
              statusInAgentsBar={!isWidget}
              agent={{ ...agentConfig, chatbotIconPath: resolvedChatbotIconPath || undefined }}
              isLoading={isLoading}
              typingIndicators={typingAgents}
              authError={authError}
              messagesContainerRef={messagesContainerRef}
              isAuthenticated={isAuthenticated}
              getAuthHeaders={getAuthHeaders}
              onLogin={handleLogin}
              predefinedPrompts={predefinedPrompts}
              onPromptClick={handlePredefinedPromptClick}
              onRateMessage={handleRateMessage}
              onSubmitContactForm={handleContactFormSubmit}
              onSkipContactForm={skipContactForm}
              onAddTextSuggestionToTop={handleAddTextSuggestionToTop}
              onAddTextSuggestionToBottom={handleAddTextSuggestionToBottom}
              onReplaceAllWithTextSuggestion={handleReplaceAllWithTextSuggestion}
              onKeepTextSuggestion={handleKeepTextSuggestion}
              onUndoTextSuggestion={handleUndoTextSuggestion}
              onToolApprovalDecision={previewMode ? undefined : handleToolApprovalDecision}
            />

            {/* Agents bar (Task #7920): who has taken part in this session and who is working now.
                By design, the Agents bar is not shown in the Chat Widget (isWidget = true). */}
            {!isWidget && <AgentsBar
              agents={sessionAgents}
              activeAgent={activeAgent}
              status={activeStatus}
              hostAgent={{
                agentId: agentConfig.agentId,
                name: agentConfig.agentName,
                iconUrl: resolvedChatbotIconPath || undefined,
              }}
              knownAgents={spinUpAgents}
              accentColor={agentConfig.primaryColor}
            />}

            {/* US 7550: MAISY's Reconnecting / can't connect banner, above the composer. */}
            {isMaisy && !previewMode && agentConfig.apiEndpoint && (
              <ConnectionBanner phase={connectionPhase} agentName={agentConfig.agentName} onRetry={reconnect} />
            )}

            {/* Input — hidden when a mandatory form is pending. In previewMode it's still rendered
                for visual fidelity but made non-interactive (pointer-events-none) — read-only preview,
                real conversation testing happens in the separate Test Agent tab. */}
            {!hasMandatoryPendingContactForm && <div style={previewMode ? { pointerEvents: 'none' } : undefined}>
            <ChatInput
              inputValue={inputValue}
              // US 7575: blocked (not hidden) while a tool-approval card waits for an answer.
              isLoading={isLoading || hasPendingToolApproval}
              selectedFiles={selectedFiles}
              primaryColor={agentConfig.primaryColor}
              foregroundColor={foregroundColor}
              agents={spinUpAgents}
              agentName={configuredAgentName}
              isFeatureSelectionActive={isFeatureSelectionActive}
              onToggleFeatureSelection={canEnterFeatureSelectionMode ? handleToggleFeatureSelection : undefined}
              hasSelectedFeature={!!selectedFeature}
              // Task 7941 / 7943: the attached feature shows as a pill in the composer, in both the
              // Chat UI and the Chat Widget.
              selectedFeatureName={selectedFeature?.featureName}
              selectedFeatureType={selectedFeature?.featureType}
              onRemoveSelectedFeature={handleDismissSelectedFeature}
              onInputChange={handleInputChange}
              onKeyPress={handleKeyPress}
              onSendMessage={sendMessage}
              onFileSelect={handleFileSelect}
              onRemoveFile={removeSelectedFile}
              // Voice Chat Props - only pass when enabled
              isVoiceChatEnabled={isVoiceChatEnabled}
              isListening={isVoiceChatEnabled ? isListening : false}
              isAISpeaking={isVoiceChatEnabled ? isAISpeaking : false}
              isVoiceChatConnected={isVoiceChatEnabled ? isVoiceChatConnected : false}
              streamingActive={isVoiceChatEnabled ? streamingActive : false}
              onStartListening={isVoiceChatEnabled ? startConversation : undefined}
              onStopListening={isVoiceChatEnabled ? stopConversation : undefined}
              isVoiceBlocked={hasPendingToolApproval}
              connectionError={!isConnected}
              // US 7500/7501: Send becomes Stop while agents work
              isWorking={isWorking}
              onStop={handleStopAllAgents}
              // US 7500: the Chat UI gets the MAISY composer design; the Chat Widget keeps its own
              isWidget={isWidget}
              // US 7550: MAISY stays typeable while offline and says the message will be kept
              keepDraftWhileOffline={isMaisy}
              placeholderOverride={isMaisy && connectionPhase === 'disconnected'
                ? `${agentConfig.agentName} is offline. Your message will be kept.`
                : undefined}
              // US 7506: a conversation opened from the list puts focus in its composer.
              focusOnMount={isMaisy && hasSwitchedMaisyView}
            />
            </div>}

            {/* Footer disclaimer/contact message, shown below the input. It belongs to the
                conversation, so MAISY's conversations list (no composer) doesn't show it. */}
            {resolvedFooterMessage && (
              <p className="wkflo-chat-footer">
                {resolvedFooterMessage}
              </p>
            )}
          </>
        )}
      </MaisyViewPane>
    </div>
  );
};