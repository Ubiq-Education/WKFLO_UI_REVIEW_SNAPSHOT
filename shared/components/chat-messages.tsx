import React, { useState } from 'react';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { FileIcon, FileText, Info, ThumbsUp, ThumbsDown, Copy, Check, Wrench, Hand, Ban, Clock, AlertCircle, AlertTriangle } from 'lucide-react';
import { DownloadableImage, renderHtmlWithImages } from './downloadable-image';
import { ChatMessage } from '../services/chat-service';
import { AgentConfig } from './agent-chat-interface';
import { ContactFormCard, ContactFormData } from './contact-form-card';
import { TextSuggestionCard } from './text-suggestion-card';
import { McpOAuthReconnectCard } from './mcp-oauth-reconnect-card';
import { ToolApprovalCard } from './tool-approval-card';
import { StoppedDivider } from './stopped-divider';
import { MessageTimestamp } from './message-timestamp';
import { AiSparkleIcon } from './icons/ai-sparkle-icon';
import type { ToolApprovalDecision } from '../services/signalr-service';
import { isExpiredImageSentinel, findExpiredImageContentItem } from '../utils/expired-image-sentinel';
import { isImageOnly } from '../utils/image-label';
import { isTextValidHtml, renderTextWithLineBreaks } from '../utils/message-content';
import { getSubAgentActivityDisplay, SubAgentActivityIcon, SUB_AGENT_STATUSES_IN_AGENTS_BAR } from '../utils/subagent-activity-status';
import { describeChatRuntimeError } from '../utils/chat-send-errors';

const SUB_AGENT_ACTIVITY_ICONS: Record<SubAgentActivityIcon, typeof Wrench> = { wrench: Wrench, hand: Hand, ban: Ban, clock: Clock };

interface ChatMessagesProps {
  messages: ChatMessage[];
  agent: AgentConfig;
  isLoading: boolean;
  // One entry per agent currently typing (Task #7373) — rendered as one independent bubble each,
  // keyed by agentId (falling back to agentName for an older backend during rollout).
  typingIndicators: Array<{ agentId?: number; agentName?: string; chatbotIconUrl?: string }>;
  authError: string | null;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  isAuthenticated: boolean;
  onLogin?: () => void;
  predefinedPrompts?: Array<{ title: string; prompt: string }>;
  onPromptClick?: (prompt: string) => void;
  onRateMessage?: (id: string, messageId: string, isThumbsUp: boolean) => void;
  onSubmitContactForm: (message: ChatMessage, data: ContactFormData) => Promise<void>;
  onSkipContactForm: (message: ChatMessage) => void;
  onAddTextSuggestionToTop: (message: ChatMessage) => string | null;
  onAddTextSuggestionToBottom: (message: ChatMessage) => string | null;
  onReplaceAllWithTextSuggestion: (message: ChatMessage) => string | null;
  onKeepTextSuggestion: (message: ChatMessage) => void;
  onUndoTextSuggestion: (message: ChatMessage, featureId: string | null) => void;
  getAuthHeaders?: () => Promise<Record<string, string>>;
  // US 7575: answers a tool-approval card. Omitted = the card renders without working buttons.
  onToolApprovalDecision?: (message: ChatMessage, decision: ToolApprovalDecision) => Promise<{ success: boolean; error?: string }>;
  // US 7502: the Chat Widget shows the short Stop divider ("Stopped.").
  isWidget?: boolean;
  // US 8159: the Agents bar shows what the agents are doing, so the thread leaves out the "Thinking"
  // bubbles and the in-progress / completed / awaiting-approval sub-agent cards. Failed, denied,
  // expired and cancelled runs stay as one card each. Set wherever the Agents bar is shown.
  statusInAgentsBar?: boolean;
}


export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  agent,
  isLoading,
  typingIndicators,
  authError,
  messagesContainerRef,
  isAuthenticated,
  onLogin,
  predefinedPrompts = [],
  onPromptClick,
  onRateMessage,
  onSubmitContactForm,
  onSkipContactForm,
  onAddTextSuggestionToTop,
  onAddTextSuggestionToBottom,
  onReplaceAllWithTextSuggestion,
  onKeepTextSuggestion,
  onUndoTextSuggestion,
  getAuthHeaders,
  onToolApprovalDecision,
  isWidget = false,
  statusInAgentsBar = false,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, content: string) => {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    td.use(gfm);
    const markdown = td.turndown(content);

    const tryExecCommand = () => {
      const ta = document.createElement('textarea');
      ta.value = markdown;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    };

    const writeWithFormats = () =>
      navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([content], { type: 'text/html' }),
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
        })
      ]);

    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      // Must be called immediately inside the click handler — any async operation before this loses the user gesture context
      writeWithFormats()
        .catch(() => navigator.clipboard.writeText(markdown))
        .catch(tryExecCommand);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(markdown).catch(tryExecCommand);
    } else {
      tryExecCommand();
    }

    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Resolves per message: a message-specific icon (e.g. a subagent's own configured WKFlo
  // icon, stamped on the message by the backend) takes precedence over the host agent's
  // icon, which in turn falls back to the AI sparkle glyph — same fallback chain as before,
  // just resolved per message instead of once for the whole conversation.
  const renderBotAvatar = (messageIconUrl?: string) => {
    const iconUrl = messageIconUrl?.trim() || agent.chatbotIconPath?.trim();

    return (
      <div
        className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 mt-1"
        data-testid="chat-message-bot-avatar"
      >
        {iconUrl ? (
          // w-full h-full + object-cover: fills the round parent completely, crops to the
          // circle instead of leaving an inset gap, and preserves the source image's aspect
          // ratio (centered) instead of stretching a non-square icon.
          <img src={iconUrl} alt="Chatbot icon" className="w-full h-full object-cover" />
        ) : (
          // Smaller than the image case on purpose: the sparkle is a generic glyph with its own
          // baked-in padding, so blowing it up to the near-fill image size looks chunky.
          <AiSparkleIcon className="w-6 h-6 text-gray-500" />
        )}
      </div>
    );
  };

  // US 7974: every bubble and card shows when it was sent, in the tenant's time zone and formats
  // (agent.displaySettings, from the chat configuration). Typing indicators and the welcome
  // message's prompt chips don't.
  const renderTimestamp = (message: ChatMessage, className = 'text-xs text-gray-400') => (
    <MessageTimestamp value={message.timestamp} settings={agent.displaySettings} className={className} />
  );

  const getBubbleClasses = () => {
    const baseClasses = 'wkflo-chat-bubble';
    switch (agent.bubbleStyle) {
      case 'square': return `${baseClasses} rounded-none`;
      case 'pill': return `${baseClasses} wkflo-chat-bubble--pill px-6`;
      default: return `${baseClasses} rounded-lg`;
    }
  };

  return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4">
      <div className="space-y-4">
        {messages.filter(m => (m.type !== 'tool' || !!m.subAgentActivity) && m.channelMessageType !== 0
          && !(statusInAgentsBar && m.subAgentActivity && SUB_AGENT_STATUSES_IN_AGENTS_BAR.has(m.subAgentActivity.status))
          && ((m.channelMessageType === 2 && agent.chainOfThought) || m.channelMessageType !== 2)
          // Task 7030: a history entry for a since-expired/deleted uploaded image may carry no
          // content and no file/fileUrl at all — the backend instead signals it purely via a
          // contentItems entry (see findExpiredImageContentItem) — so it must still pass this
          // filter, or nothing (not even the fallback SVG below) would ever render for it.
          // Task #7297: a subagent-activity card also carries no content/file of its own — its
          // presence in `subAgentActivity` is what should let it through.
          // US 7502: the Stop divider is let through on its own flag, whatever its content.
          // US 7959: so is a chat error entry.
          // Task 8215: so is an image (returned or uploaded), which comes with empty content.
          && (!!m.contactForm || !!m.textSuggestion || !!m.mcpOAuthReconnect || !!m.subAgentActivity || !!m.toolApproval || !!m.stoppedMarker || !!m.chatError || ((m.content !== '' && m.content !== null) || m.file || !!m.fileUrl || !!findExpiredImageContentItem(m.contentItems))) ).map((message) => {
          // Some messages sent with role 'assistant' (Anthropic rejects a mid-conversation 'system'
          // role message unless it's the first entry or immediately follows a user/assistant turn -
          // see BaseAmaisPlugin.cs / SemanticKernelAgentServiceRun.cs on the backend) still need the
          // System-style treatment below (thinking bubble, metadata icon, URL/image display). The
          // backend flags these via metadata.renderAsSystem. channelMessageType 2 (Thinking) is always
          // reasoning/thinking content regardless of role (see SemanticKernelAgentServiceRunReasoning.cs's
          // live-streaming path, which carries no metadata at all - StreamingTokenUpdate has no field for it).
          const isSystemStyled = message.type === 'system' || message.channelMessageType === 2 || !!message.metadata?.renderAsSystem;
          // A `User`-role message flagged renderAsSystem (e.g. a spun-up agent's generated image,
          // moved to AuthorRole.User for API-compatibility reasons — see PLAN.md) must still render
          // like an agent/system message: left-aligned, bot avatar, agent-style bubble. Only a
          // "real" user message should get the user-styled layout below.
          const isUserStyled = message.type === 'user' && !isSystemStyled;

          // US 7502: where the user pressed Stop - a full-width divider, never an agent bubble.
          if (message.stoppedMarker) {
            return (
              <StoppedDivider
                key={message.id}
                variant={isWidget ? 'short' : 'full'}
                timestamp={renderTimestamp(message, 'flex-shrink-0')}
              />
            );
          }

          // US 7959: the assistant failed while answering (error), or a tool it uses isn't
          // available (warning). Shown with the failing agent's avatar; content is already the
          // friendly text of the code. No rating or copy.
          if (message.chatError) {
            const isWarning = message.chatError.severity === 'warning';
            const ErrorIcon = isWarning ? AlertTriangle : AlertCircle;
            return (
              <div key={message.id} className="flex gap-2 justify-start">
                {renderBotAvatar(message.chatbotIconUrl)}
                <div className="flex flex-col items-start gap-2 wkflo-chat-bubble-size min-w-0">
                  <span className="text-xs font-medium text-gray-500">{message.agentName || agent.agentName}</span>
                  <div
                    className={`${getBubbleClasses()} wkflo-chat-bubble--agent min-w-0 max-w-full wrap-anywhere`}
                    style={{
                      maxWidth: '100%',
                      backgroundColor: isWarning ? '#fffbeb' : '#fef2f2',
                      border: `1px solid ${isWarning ? '#f59e0b' : '#dc2626'}`,
                      color: isWarning ? '#78350f' : '#7f1d1d',
                    }}
                    role={isWarning ? 'status' : 'alert'}
                    data-testid="chat-message-error"
                    data-severity={message.chatError.severity}
                  >
                    <div className="flex items-start gap-2">
                      <ErrorIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isWarning ? 'text-amber-600' : 'text-red-600'}`} aria-hidden="true" />
                      <span className="text-sm">{message.content}</span>
                    </div>
                  </div>
                  {renderTimestamp(message)}
                </div>
              </div>
            );
          }

          if (message.contactForm) {
            return (
              <div key={message.id} className="flex justify-start">
                <div className="flex flex-col items-start gap-2 wkflo-chat-bubble-size">
                  <ContactFormCard
                    form={message.contactForm}
                    primaryColor={agent.primaryColor}
                    onSubmit={(data) => onSubmitContactForm(message, data)}
                    onSkip={!message.contactForm.mandatory ? () => onSkipContactForm(message) : undefined}
                  />
                  {renderTimestamp(message)}
                </div>
              </div>
            );
          }

          if (message.textSuggestion) {
            return (
              <div key={message.id} className="flex justify-start">
                <div className="flex flex-col items-start gap-2 wkflo-chat-bubble-size">
                  <TextSuggestionCard
                    suggestion={message.textSuggestion}
                    onAddToTop={() => onAddTextSuggestionToTop(message)}
                    onAddToBottom={() => onAddTextSuggestionToBottom(message)}
                    onReplaceAll={() => onReplaceAllWithTextSuggestion(message)}
                    onKeep={() => onKeepTextSuggestion(message)}
                    onUndo={(featureId) => onUndoTextSuggestion(message, featureId)}
                    getAuthHeaders={getAuthHeaders}
                    imageFallbackSrc={`${agent.baseUrl ?? ''}/assets/image-expired.svg`}
                  />
                  {renderTimestamp(message)}
                </div>
              </div>
            );
          }

          if (message.mcpOAuthReconnect) {
            return (
              <div key={message.id} className="flex justify-start">
                <div className="flex flex-col items-start gap-2 wkflo-chat-bubble-size">
                  <McpOAuthReconnectCard
                    reconnect={message.mcpOAuthReconnect}
                    getAuthHeaders={getAuthHeaders}
                    apiEndpoint={agent.apiEndpoint}
                  />
                  {renderTimestamp(message)}
                </div>
              </div>
            );
          }

          // US 7575: an agent asking for permission to use a tool function. Shown with the
          // requesting agent's avatar; answered by whoever is chatting.
          if (message.toolApproval) {
            return (
              <div key={message.id} className="flex gap-2 justify-start">
                {renderBotAvatar(message.toolApproval.chatbotIconUrl || message.chatbotIconUrl)}
                <div className="flex flex-col items-start gap-2 wkflo-chat-bubble-size">
                  <ToolApprovalCard
                    approval={message.toolApproval}
                    fallbackAgentName={message.agentName || agent.agentName}
                    primaryColor={agent.primaryColor}
                    foregroundColor={agent.foregroundColor}
                    onDecide={onToolApprovalDecision ? (decision) => onToolApprovalDecision(message, decision) : undefined}
                  />
                  {renderTimestamp(message)}
                </div>
              </div>
            );
          }

          // Task #7297: live subagent activity (see SubAgentActivityStatus; Bug 7722 added the
          // tool approval statuses), pushed via
          // SubagentActivityUpdate over SignalR. Uses the same avatar/name plumbing as any other
          // agent message (message.chatbotIconUrl/agentName) instead of a generic tool icon, so
          // the user sees which subagent is doing the work.
          if (message.subAgentActivity) {
            const { agentName: subAgentName, action, status, chatbotIconUrl: subAgentIconUrl } = message.subAgentActivity;
            // Unknown statuses get a neutral look, never "Done".
            const display = getSubAgentActivityDisplay(status);
            const StatusIcon = SUB_AGENT_ACTIVITY_ICONS[display.icon];

            return (
              <div key={message.id} className="flex gap-2 justify-start">
                {renderBotAvatar(subAgentIconUrl)}
                <div className="flex flex-col items-start gap-2 wkflo-chat-bubble-size">
                  <span className="text-xs font-medium text-gray-500">{subAgentName}</span>
                  <div
                    className={`${getBubbleClasses()} wkflo-chat-bubble--agent`}
                    style={{ maxWidth: '100%', backgroundColor: '#f9fafb' }}
                    data-testid="chat-message-subagent-activity"
                    data-status={status}
                  >
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 flex-shrink-0 ${display.iconClasses}`} data-icon={display.icon} aria-hidden="true" />
                      <span className="text-sm text-gray-700">{action}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${display.badgeClasses}`} data-testid="subagent-activity-status">
                        {display.label}
                      </span>
                    </div>
                    {/* US 7959: why it failed, in friendly words (never the backend's text). */}
                    {status === 'failed' && message.subAgentActivity.errorCode && (
                      <p className="text-xs text-red-700 mt-1" data-testid="subagent-activity-error">
                        {describeChatRuntimeError(message.subAgentActivity.errorCode)}
                      </p>
                    )}
                  </div>
                  {renderTimestamp(message)}
                </div>
              </div>
            );
          }

          return (
          <div
            key={message.id}
            className={`flex gap-2 ${isUserStyled ? 'justify-end' : 'justify-start'}`}
          >
            {!isUserStyled && renderBotAvatar(message.chatbotIconUrl)}
            <div className="flex flex-col items-start gap-2 wkflo-chat-bubble-size min-w-0">
              {(message.type === 'assistant' || (message.type === 'system' && message.channelMessageType === 3)) && (
                <span className="text-xs font-medium text-gray-500">
                  {message.agentName || agent.agentName}
                </span>
              )}
              <div
                className={`${getBubbleClasses()} min-w-0 max-w-full wrap-anywhere ${
                  isUserStyled
                    ? 'wkflo-chat-bubble--user'
                    : message.channelMessageType === 2
                    ? 'wkflo-chat-bubble--agent wkflo-chat-bubble--thinking'
                    : message.channelMessageType === 3
                    ? 'wkflo-chat-bubble--agent wkflo-chat-bubble--metadata'
                    : 'wkflo-chat-bubble--agent'
                }`}
                style={{
                  // 100% (not fit-content): the bubble still shrinks to its content (inline-block
                  // in an items-start column) but can never grow past the column, so long
                  // unbroken tool output (JSON, URLs, IDs) wraps instead of widening the chat.
                  maxWidth: '100%',
                  backgroundColor: isUserStyled ? agent.primaryColor :
                                 message.channelMessageType === 2 ? '#f9fafb' :
                                 message.channelMessageType === 3 ? '#dbeafe' : undefined,
                  color: isUserStyled ? (agent.foregroundColor || '#ffffff') : undefined,
                  border: message.channelMessageType === 3 ? '1px solid #2563eb' : undefined
                }}
              >
                {/* Main message content */}
                {((message.type === 'user' || message.type === 'assistant' || (message.type === 'system' && (agent.chainOfThought || message.channelMessageType == 1 || message.channelMessageType == 3) ))) && (
                  <div className="flex flex-col gap-2">
                    {/* Display file if present */}
                    {message.fileUrl && (() => {
                      return (
                        <DownloadableImage
                            src={message.fileUrl}
                            alt="Uploaded image"
                            className="w-full h-auto rounded-lg"
                            onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            // Root-relative would resolve against the embedding host page's own
                            // origin when running inside the widget cross-origin — prefix with
                            // agent.baseUrl (the wkflo_ui deployment's own origin) so it always
                            // resolves against wkflo_ui itself. Empty/undefined baseUrl (e.g. the
                            // standalone main app, served at its own domain root) keeps the same
                            // root-relative behavior as before.
                            target.src = `${agent.baseUrl ?? ''}/assets/image-expired.svg`;
                            target.alt = 'Image no longer available';
                          }}
                            style={{ maxHeight: '200px', objectFit: 'contain' }}
                            getAuthHeaders={getAuthHeaders}
                          />
                      );
                    })()}
                    {message.file && (() => {
                      const file = (message as ChatMessage).file!;
                      const isImage = file.mimeType.startsWith('image/');
                      return (
                        <div className="max-w-xs">
                          {isImage ? (
                            <DownloadableImage
                              src={file.data}
                              alt="Uploaded image"
                              className="w-full h-auto rounded-lg"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.onerror = null;
                                // See the message.fileUrl block's onError above for why this is
                                // prefixed with agent.baseUrl rather than root-relative.
                                target.src = `${agent.baseUrl ?? ''}/assets/image-expired.svg`;
                                target.alt = 'Image no longer available';
                              }}
                              style={{ maxHeight: '200px', objectFit: 'contain' }}
                              fileName={file.name}
                            />
                          ) : (
                            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                              {file.mimeType === 'application/pdf' ? (
                                <FileIcon className="h-6 w-6 text-red-600" />
                              ) : (
                                <FileText className="h-6 w-6 text-blue-600" />
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                                <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* Task 7030: the backend signals a deleted/expired uploaded image as a
                        successful message carrying a plain-text sentinel (in `content` and/or a
                        `contentItems` entry) rather than a failing `fileUrl` — show the fallback
                        SVG instead of that literal bracketed text. Skipped when fileUrl/file are
                        present since those already render their own image (with their own
                        onError fallback to the same SVG for a genuinely broken/expired link). */}
                    {!message.fileUrl && !message.file
                      && (isExpiredImageSentinel(message.content) || findExpiredImageContentItem(message.contentItems)) && (
                      <img
                        src={`${agent.baseUrl ?? ''}/assets/image-expired.svg`}
                        alt="Image no longer available"
                        className="w-full h-auto rounded-lg"
                        style={{ maxHeight: '200px', objectFit: 'contain' }}
                      />
                    )}
                    {/* Task 8215: an image (returned or uploaded) has no text of its own, so no text row or Info icon under it. */}
                    {!isImageOnly(message) && (
                    <div className="flex items-start gap-2">
                      {isSystemStyled && message.channelMessageType === 2 && (
                        <span className="text-xs opacity-70 mr-1" title="Assistant is thinking...">💭</span>
                      )}
                      {isSystemStyled && message.channelMessageType === 3 && (
                        <Info className="h-4 w-4 opacity-70 mr-1 text-blue-600" />
                      )}
                      <div className={`text-sm bubble-content min-w-0 wrap-anywhere ${
                        isSystemStyled && message.channelMessageType === 2
                          ? 'italic opacity-80 text-gray-600'
                          : ''
                      }`}>
                        {message.channelMessageType === 2 && isSystemStyled && (
                          <div className="text-xs text-gray-500 mr-2">[Thinking]</div>
                        )}
                        
                        {!message.file && !isExpiredImageSentinel(message.content) && (() => {
                          // Bug 7872: <img>s inside the message (e.g. expired Canva thumbnails)
                          // fall back to the same baseUrl-aware image-expired.svg as fileUrl above.
                          const imageFallbackSrc = `${agent.baseUrl ?? ''}/assets/image-expired.svg`;
                          if(isTextValidHtml(message.content)) {
                            return renderHtmlWithImages(message.content, getAuthHeaders, imageFallbackSrc);
                          }
                          else {
                            return renderTextWithLineBreaks(message.content, getAuthHeaders, imageFallbackSrc);
                          }
                        })()}

                        {message.channelMessageType === 3 && isSystemStyled && message.metadata && "url" in message.metadata && (() => {
                          const url = message.metadata["url"] as string;
                          const isImageUrl = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico)(\?.*)?$/i.test(url) || url.startsWith('data:image/');
                          return (
                            <div>
                              {isImageUrl ? (
                                <DownloadableImage
                                  src={url}
                                  alt="Image"
                                  style={{ maxHeight: '200px', objectFit: 'contain' }}
                                  className="rounded-lg"
                                  getAuthHeaders={getAuthHeaders}
                                />
                              ) : (
                                <>
                                  <strong>URL:</strong>{' '}
                                  <a href={url} target='_blank' className="text-xs text-gray-500 mr-2">{url}</a>
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    )}
                  </div>
                )}
                
              </div>

              {renderTimestamp(message, `text-xs text-gray-400${isUserStyled ? ' self-end' : ''}`)}

              {message.type === 'assistant' && message.id !== '1' && onRateMessage && message.messageId && (() => {
                return (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Copy message"
                      onClick={() => handleCopy(message.id, message.content)}
                      className="p-1 rounded transition-colors text-gray-400 hover:text-gray-600"
                    >
                      {copiedId === message.id
                        ? <Check className="h-3.5 w-3.5 text-green-600" />
                        : <Copy className="h-3.5 w-3.5" />
                      }
                    </button>
                    <button
                      type="button"
                      title="Thumbs up"
                      onClick={() => onRateMessage(message.id, message.messageId!, true)}
                      className={`p-1 rounded transition-colors ${
                        message.rating === 'thumbsUp'
                          ? 'text-green-600'
                          : 'text-gray-400 hover:text-green-600'
                      }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" fill={message.rating === 'thumbsUp' ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      title="Thumbs down"
                      onClick={() => onRateMessage(message.id, message.messageId!, false)}
                      className={`p-1 rounded transition-colors ${
                        message.rating === 'thumbsDown'
                          ? 'text-red-500'
                          : 'text-gray-400 hover:text-red-500'
                      }`}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" fill={message.rating === 'thumbsDown' ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              })()}

              {message.id === '1' && message.type === 'assistant' && predefinedPrompts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {predefinedPrompts.map((prompt, index) => (
                    <button
                      key={`${prompt.title}-${index}`}
                      type="button"
                      className="px-3 py-1 text-xs rounded-full border transition-colors hover:bg-gray-50 hover:shadow-sm"
                      style={{
                        borderColor: agent.primaryColor,
                        color: agent.primaryColor
                      }}
                      onClick={() => onPromptClick?.(prompt.prompt)}
                    >
                      {prompt.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          );
        })}
        
        {!statusInAgentsBar && typingIndicators.map((indicator) => (
          <div key={indicator.agentId ?? indicator.agentName ?? 'typing'} className="flex gap-2 justify-start">
            {renderBotAvatar(indicator.chatbotIconUrl)}
            <div className="wkflo-chat-bubble wkflo-chat-bubble--agent rounded-lg">
              <div className="flex items-center space-x-2 h-full">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs text-gray-600">
                  Thinking
                </span>
              </div>
            </div>
          </div>
        ))}
        
        {authError && (
          <div className="flex justify-center">
            <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm">
              <p className="font-medium">Error</p>
              <p>{authError}</p>
              {agent.securityConfiguration?.type === 'azure-ad' && !isAuthenticated && (
                <button
                  onClick={onLogin}
                  className="mt-2 text-xs underline hover:no-underline transition-colors"
                  style={{
                    color: agent.primaryColor
                  }}
                  disabled={isLoading}
                >
                  Try Login Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};