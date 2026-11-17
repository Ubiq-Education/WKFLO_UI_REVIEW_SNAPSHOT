import React from 'react';
import { ArrowLeft, X, Minimize2, LogIn, LogOut, User, RotateCcw, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { AgentConfig } from './agent-chat-interface';
import { AiSparkleIcon } from './icons/ai-sparkle-icon';
import type { ConnectionPhase } from '../services/signalr-service';
import { EditSquareIcon } from './icons/edit-square-icon';

// US 7507: which MAISY view the header belongs to - a conversation, or the conversations list.
export type MaisyView = 'chat' | 'list';

interface ChatHeaderProps {
  agent: AgentConfig;
  isWidget?: boolean;
  isConnected?: boolean;
  connectionState?: string;
  isAuthenticated?: boolean;
  currentUser?: any;
  isLoading?: boolean;
  sessionId?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  onLogin?: () => void;
  onLogout?: () => void;
  onResetSession?: () => void;
  onLoadHistory?: () => void;
  onReconnect?: () => void;
  // US 7550: MAISY agents (see shared/utils/maisy-agent.ts) get the MAISY top bar - one row with
  // the avatar, the title and the connection status under it. Every other agent keeps the classic
  // two-row header.
  isMaisy?: boolean;
  connectionPhase?: ConnectionPhase;
  // US 7507: the conversations list shows "Conversations" in place of the agent and its status.
  maisyView?: MaisyView;
  // US 7506: the chat view's back arrow to the conversations list. No arrow when not passed.
  onShowConversations?: () => void;
  // US 7505: the MAISY header's New chat button, in both views. It replaces Reset Session and
  // Load Message History, which MAISY doesn't show.
  onNewChat?: () => void;
  // Task 8225: the open conversation's title, centered in the MAISY chat view header. Nothing is
  // shown when not passed (e.g. preview).
  conversationTitle?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  agent,
  isWidget = false,
  isConnected,
  connectionState,
  isAuthenticated,
  currentUser,
  isLoading,
  onClose,
  onMinimize,
  onLogin,
  onLogout,
  onResetSession,
  onLoadHistory,
  onReconnect,
  isMaisy = false,
  connectionPhase = 'connecting',
  maisyView = 'chat',
  onShowConversations,
  onNewChat,
  conversationTitle
}) => {
  const foregroundColor = agent.foregroundColor || '#ffffff';

  const authControls = (
    <AuthControls
      agent={agent}
      foregroundColor={foregroundColor}
      isAuthenticated={isAuthenticated}
      currentUser={currentUser}
      isLoading={isLoading}
      onLogin={onLogin}
      onLogout={onLogout}
    />
  );

  const widgetControls = isWidget && (
    <WidgetControls foregroundColor={foregroundColor} onMinimize={onMinimize} onClose={onClose} />
  );

  if (isMaisy) {
    return (
      <MaisyHeader
        agent={agent}
        isWidget={isWidget}
        foregroundColor={foregroundColor}
        connectionPhase={connectionPhase}
        view={maisyView}
        onBack={onShowConversations}
        onNewChat={onNewChat}
        conversationTitle={conversationTitle}
        authControls={authControls}
        widgetControls={widgetControls}
      />
    );
  }

  return (
    <div 
      className={`p-4 border-b  ${isWidget ? 'rounded-t-lg' : ''}`}
      style={{ backgroundColor: agent.primaryColor }}
    >
      {/* First line: Agent info and Widget Controls */}
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div
            className="w-8 h-8 bg-white bg-opacity-20 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            data-testid="chatbot-icon-container"
          >
            <ChatbotIcon agent={agent} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm" style={{ color: foregroundColor }}>{agent.headerTitle || agent.agentName}</h3>
            {agent.showDescription && agent.agentDescription && (
              <p
                className="text-xs truncate overflow-hidden whitespace-nowrap"
                style={{ color: foregroundColor, opacity: 0.8 }}
                title={agent.agentDescription}
                data-testid="chatbot-description"
              >
                {agent.agentDescription}
              </p>
            )}
          </div>
        </div>

        {/* Widget Controls - only minimize/close buttons */}
        {widgetControls}
      </div>
      
      {/* Second line: Connection status, authentication and functional controls */}
      <div className="flex items-center justify-between">
        {/* Connection Status */}
        {agent.apiEndpoint && (
          <div className="flex items-center space-x-1" title={`Connected via ${connectionState}`}>
            <div className="flex items-center space-x-1">
              {isConnected ? (
                <Wifi className="w-3 h-3 text-green-300" />
              ) : (
                <div 
                  className="cursor-pointer hover:opacity-70" 
                  onClick={onReconnect}
                  title="Click to reconnect"
                >
                  <WifiOff className="w-3 h-3 text-red-300" />
                </div>
              )}
              <span className="text-xs" style={{ color: foregroundColor, opacity: 0.6 }}>
                {connectionState}
              </span>
            </div>
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          {/* Authentication Controls */}
          {authControls}

          <SessionControls
            agent={agent}
            foregroundColor={foregroundColor}
            isLoading={isLoading}
            onResetSession={onResetSession}
            onLoadHistory={onLoadHistory}
          />
        </div>
      </div>
    </div>
  );
};

// The agent's configured icon, or the default glyph when none is set.
const ChatbotIcon: React.FC<{ agent: AgentConfig }> = ({ agent }) => (
  (agent.bubbleIconPath?.trim() || agent.chatbotIconPath?.trim()) ? (
    // w-full h-full + object-cover: fills the round parent completely, crops to the
    // circle instead of leaving an inset gap, and preserves the source image's aspect
    // ratio (centered) instead of stretching a non-square icon.
    <img
      src={agent.bubbleIconPath?.trim() || agent.chatbotIconPath}
      alt="Chatbot icon"
      className="w-full h-full object-cover"
    />
  ) : (
    // Smaller than the image case on purpose: the sparkle is a generic glyph with its own
    // baked-in padding, so blowing it up to the near-fill image size looks chunky.
    <AiSparkleIcon className="w-4 h-4" style={{ color: agent.primaryColor }} />
  )
);

const WidgetControls: React.FC<{
  foregroundColor: string;
  onMinimize?: () => void;
  onClose?: () => void;
}> = ({ foregroundColor, onMinimize, onClose }) => (
  <div className="flex items-center space-x-2 flex-shrink-0">
    {onMinimize && (
      <button
        onClick={onMinimize}
        className="wkflo-header-button"
        style={{ color: foregroundColor }}
      >
        <Minimize2 className="w-4 h-4" />
      </button>
    )}
    {onClose && (
      <button
        onClick={onClose}
        className="wkflo-header-button"
        style={{ color: foregroundColor }}
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

const AuthControls: React.FC<{
  agent: AgentConfig;
  foregroundColor: string;
  isAuthenticated?: boolean;
  currentUser?: any;
  isLoading?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
}> = ({ agent, foregroundColor, isAuthenticated, currentUser, isLoading, onLogin, onLogout }) => {
  if (agent.securityConfiguration?.type !== 'azure-ad') return null;

  return (
    <div className="flex items-center space-x-2">
      {isAuthenticated && currentUser ? (
        <>
          <div className="flex items-center space-x-1">
            <User className="w-3 h-3" style={{ color: foregroundColor }} />
            <span className="text-xs" style={{ color: foregroundColor, opacity: 0.8 }}>
              {currentUser.name || currentUser.username || 'User'}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="wkflo-header-button"
            style={{ color: foregroundColor }}
            title="Logout"
          >
            <LogOut className="w-3 h-3" />
          </button>
        </>
      ) : (
        <button
          onClick={onLogin}
          className="wkflo-header-button"
          style={{ color: foregroundColor }}
          title="Login"
          disabled={isLoading}
        >
          <LogIn className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

// Reset Session and Load Message History.
const SessionControls: React.FC<{
  agent: AgentConfig;
  foregroundColor: string;
  isLoading?: boolean;
  onResetSession?: () => void;
  onLoadHistory?: () => void;
}> = ({ agent, foregroundColor, isLoading, onResetSession, onLoadHistory }) => (
  <>
    {/* Reset Session Button */}
    <button
      onClick={onResetSession}
      className="wkflo-header-button"
      style={{ color: foregroundColor }}
      title="Reset Session"
    >
      <RotateCcw className="w-3 h-3" />
    </button>

    {/* Load Message History Button */}
    {agent.apiEndpoint && (
      <button
        onClick={onLoadHistory}
        className="wkflo-header-button"
        style={{ color: foregroundColor }}
        title="Load Message History"
        disabled={isLoading}
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    )}
  </>
);

// US 7550: the connection status under the MAISY title. Only the dot takes a status colour; the
// label uses the header's configured text colour, so it reads on any configured background.
const CONNECTION_STATUS: Record<ConnectionPhase, { label: string; dotColor: string; animated: boolean }> = {
  connecting: { label: 'Connecting…', dotColor: '#c27c00', animated: true },
  connected: { label: 'Connected', dotColor: '#2e9e5b', animated: false },
  reconnecting: { label: 'Reconnecting…', dotColor: '#c27c00', animated: true },
  disconnected: { label: 'Disconnected', dotColor: '#c62828', animated: false },
};

const MaisyConnectionStatus: React.FC<{ phase: ConnectionPhase; color: string }> = ({ phase, color }) => {
  const status = CONNECTION_STATUS[phase];
  return (
    // aria-live without role="status": the composer's banners own that role.
    <div
      aria-live="polite"
      data-testid="maisy-connection-status"
      data-phase={phase}
      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', lineHeight: '16px', color }}
    >
      <span
        aria-hidden="true"
        data-testid="maisy-connection-dot"
        className={status.animated ? 'wkflo-connection-dot-pulse' : undefined}
        style={{ width: '6px', height: '6px', borderRadius: '999px', flexShrink: 0, backgroundColor: status.dotColor }}
      />
      {status.label}
    </div>
  );
};

// US 7550 (MAISY design): the MAISY top bar. Layout and outlines follow the design; every colour
// comes from the agent's chat settings - the background is primaryColor, the text foregroundColor,
// and the top accent / bottom divider are darker shades of primaryColor (the design's cms /
// cms-strong over cms-soft). US 7507: the conversations list shows its "Conversations" title instead.
const MaisyHeader: React.FC<{
  agent: AgentConfig;
  isWidget: boolean;
  foregroundColor: string;
  connectionPhase: ConnectionPhase;
  view: MaisyView;
  onBack?: () => void;
  onNewChat?: () => void;
  conversationTitle?: string;
  authControls: React.ReactNode;
  widgetControls: React.ReactNode;
}> = ({ agent, isWidget, foregroundColor, connectionPhase, view, onBack, onNewChat, conversationTitle, authControls, widgetControls }) => (
  <div
    data-testid="maisy-chat-header"
    data-view={view}
    className={isWidget ? 'rounded-t-lg' : undefined}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      // The design's 8px left padding goes with the back arrow, which brings its own space.
      padding: view === 'chat' && onBack ? '12px 12px 12px 8px' : '12px',
      minHeight: '44px',
      backgroundColor: agent.primaryColor,
      borderTop: `3px solid color-mix(in srgb, ${agent.primaryColor} 70%, black)`,
      borderBottom: `1px solid color-mix(in srgb, ${agent.primaryColor} 85%, black)`,
    }}
  >
    {view === 'list' ? (
      <h2
        style={{ flex: 1, minWidth: 0, margin: 0, paddingLeft: '8px', fontWeight: 700, fontSize: '17px', lineHeight: '24px', color: foregroundColor }}
      >
        Conversations
      </h2>
    ) : (
      <MaisyChatTitle
        agent={agent}
        foregroundColor={foregroundColor}
        connectionPhase={connectionPhase}
        onBack={onBack}
        hasConversationTitle={!!conversationTitle}
      />
    )}
    {view === 'chat' && conversationTitle && (
      <MaisyConversationTitle title={conversationTitle} color={foregroundColor} />
    )}
    {authControls}
    <NewChatButton foregroundColor={foregroundColor} onClick={onNewChat} />
    {widgetControls}
  </div>
);

// US 7505 (MAISY design): New chat - the edit_square icon and its label in a pill. Text and outline
// take the header's configured text colour.
const NewChatButton: React.FC<{ foregroundColor: string; onClick?: () => void }> = ({ foregroundColor, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="wkflo-maisy-new-chat"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      height: '34px',
      flexShrink: 0,
      whiteSpace: 'nowrap',
      padding: '0 14px 0 10px',
      borderRadius: '999px',
      border: `1px solid color-mix(in srgb, ${foregroundColor} 35%, transparent)`,
      fontFamily: 'inherit',
      fontSize: '14px',
      fontWeight: 600,
      color: foregroundColor,
      cursor: onClick ? 'pointer' : 'default',
    }}
  >
    <EditSquareIcon size={18} />
    New chat
  </button>
);

// Task 8225: the open conversation's title. It takes all the width the agent block on its left
// doesn't need (see AGENT_BLOCK_BESIDE_TITLE), centered in that space, one line with an ellipsis;
// the full text is in the title attribute.
const MaisyConversationTitle: React.FC<{ title: string; color: string }> = ({ title, color }) => (
  <div
    data-testid="maisy-conversation-title"
    title={title}
    style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', fontWeight: 600, fontSize: '15px', lineHeight: '20px', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
  >
    {title}
  </div>
);

// Task 8225: beside a conversation title, the agent block is only as wide as its name, description
// and status need (it doesn't grow), and the title takes the rest. A long name or description is
// capped at 40% of the header and ellipsized, so the title keeps priority at widget width.
// Without a conversation title the block fills the free width as before.
const AGENT_BLOCK_BESIDE_TITLE: React.CSSProperties = { flex: '0 1 auto', maxWidth: '40%' };
const AGENT_BLOCK_ALONE: React.CSSProperties = { flex: '1 1 0' };

// The chat view's part of the MAISY top bar: back arrow, avatar, title and connection status.
const MaisyChatTitle: React.FC<{
  agent: AgentConfig;
  foregroundColor: string;
  connectionPhase: ConnectionPhase;
  onBack?: () => void;
  hasConversationTitle?: boolean;
}> = ({ agent, foregroundColor, connectionPhase, onBack, hasConversationTitle = false }) => (
  <>
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        className="wkflo-header-button"
        aria-label="Back to conversations"
        title="Back to conversations"
        data-testid="maisy-back-button"
        style={{ width: '36px', height: '36px', borderRadius: '999px', display: 'grid', placeItems: 'center', flexShrink: 0, color: foregroundColor }}
      >
        <ArrowLeft aria-hidden="true" style={{ width: '22px', height: '22px' }} />
      </button>
    )}
    <div
      className="bg-white bg-opacity-20"
      style={{ width: '32px', height: '32px', borderRadius: '999px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      data-testid="chatbot-icon-container"
    >
      <ChatbotIcon agent={agent} />
    </div>
    <div
      data-testid="maisy-agent-block"
      style={{ ...(hasConversationTitle ? AGENT_BLOCK_BESIDE_TITLE : AGENT_BLOCK_ALONE), minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <h3
        style={{ margin: 0, fontWeight: 700, fontSize: '15px', lineHeight: '20px', color: foregroundColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={agent.headerTitle || agent.agentName}
      >
        {agent.headerTitle || agent.agentName}
      </h3>
      {agent.showDescription && agent.agentDescription && (
        <p
          style={{ margin: 0, fontSize: '12px', color: foregroundColor, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={agent.agentDescription}
          data-testid="chatbot-description"
        >
          {agent.agentDescription}
        </p>
      )}
      {agent.apiEndpoint && <MaisyConnectionStatus phase={connectionPhase} color={foregroundColor} />}
    </div>
  </>
);
