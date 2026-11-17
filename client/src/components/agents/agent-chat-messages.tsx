import React from 'react';
import { User, Wrench, FileText, FileIcon, ThumbsUp, ThumbsDown, Hand, Ban, Clock, AlertCircle, AlertTriangle } from "lucide-react";
import { DownloadableImage, renderHtmlWithImages } from '@shared/components/downloadable-image';
import { Badge } from "@/components/ui/badge";
import { ChatMessage } from '@shared/services/chat-service';
import { ContactFormCard, ContactFormData } from '@shared/components/contact-form-card';
import { ToolApprovalCard } from '@shared/components/tool-approval-card';
import { StoppedDivider } from '@shared/components/stopped-divider';
import { MessageTimestamp } from '@shared/components/message-timestamp';
import type { DateTimeFormatSettings } from '@shared/utils/format-date-time';
import { AiSparkleIcon } from '@shared/components/icons/ai-sparkle-icon';
import type { ToolApprovalDecision } from '@shared/services/chat-service';
import { isExpiredImageSentinel, findExpiredImageContentItem } from '@shared/utils/expired-image-sentinel';
import { isImageOnly } from '@shared/utils/image-label';
import { isTextValidHtml, renderTextWithLineBreaks } from '@shared/utils/message-content';
import { getSubAgentActivityDisplay, SubAgentActivityIcon, SUB_AGENT_STATUSES_IN_AGENTS_BAR } from '@shared/utils/subagent-activity-status';
import { describeChatRuntimeError } from '@shared/utils/chat-send-errors';

const SUB_AGENT_ACTIVITY_ICONS: Record<SubAgentActivityIcon, typeof Wrench> = { wrench: Wrench, hand: Hand, ban: Ban, clock: Clock };

interface AgentChatMessagesProps {
  messages: ChatMessage[];
  // One entry per agent currently typing (Task #7373) — rendered as one independent bubble each,
  // keyed by agentId (falling back to agentName for an older backend during rollout).
  typingIndicators: Array<{ agentId?: number; agentName?: string; chatbotIconUrl?: string }>;
  expandedTools: Set<string>;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  agentName: string;
  agentId: number;
  onToggleToolDescription: (messageId: string, toolIndex: number) => void;
  onRateMessage?: (id: string, messageId: string, isThumbsUp: boolean) => void;
  onSubmitContactForm: (message: ChatMessage, data: ContactFormData) => Promise<void>;
  onSkipContactForm: (message: ChatMessage) => void;
  primaryColor?: string;
  getAuthHeaders?: () => Promise<Record<string, string>>;
  // Origin (protocol + host, no trailing slash) to resolve the image-expired.svg fallback
  // against, mirroring shared/components/chat-messages.tsx's baseUrl handling (Task 7030).
  // Not strictly required here — this component is only used by the standalone main app,
  // served at its own domain root, so a root-relative path already resolves correctly — but
  // kept consistent with the widget-facing component in case that ever changes.
  baseUrl?: string;
  // US 7575: answers a tool-approval ("Ask for permission") card in the test chat.
  onToolApprovalDecision?: (message: ChatMessage, decision: ToolApprovalDecision) => Promise<{ success: boolean; error?: string }>;
  // US 7974: the tenant's time zone and date/time formats for the message timestamps (from the
  // agent's chat configuration). Missing = UTC, 24h, yyyy-MM-dd.
  displaySettings?: DateTimeFormatSettings | null;
  // US 8159: the Agents bar shows what the agents are doing, so the thread leaves out the "typing"
  // bubbles and the in-progress / completed / awaiting-approval sub-agent cards. Failed, denied,
  // expired and cancelled runs stay as one card each.
  statusInAgentsBar?: boolean;
}


export const AgentChatMessages: React.FC<AgentChatMessagesProps> = ({
  messages,
  typingIndicators,
  expandedTools,
  messagesContainerRef,
  agentName,
  agentId,
  onToggleToolDescription,
  onRateMessage,
  onSubmitContactForm,
  onSkipContactForm,
  primaryColor = '#3b82f6',
  getAuthHeaders,
  baseUrl,
  onToolApprovalDecision,
  displaySettings,
  statusInAgentsBar = false,
}) => {

  // Some messages sent with role 'assistant' (Anthropic rejects a mid-conversation 'system' role
  // message unless it's the first entry or immediately follows a user/assistant turn - see
  // BaseAmaisPlugin.cs / SemanticKernelAgentServiceRun.cs on the backend) still need the
  // System-style treatment below (thinking bubble, metadata icon, URL/image display). The backend
  // flags these via metadata.renderAsSystem. channelMessageType 2 (Thinking) is always reasoning/
  // thinking content regardless of role (see SemanticKernelAgentServiceRunReasoning.cs's live-
  // streaming path, which carries no metadata at all - StreamingTokenUpdate has no field for it).
  // Extracted as a standalone helper (rather than computed only inside renderMessage) because the
  // outer alignment wrapper also needs it to decide justify-end vs justify-start.
  const isMessageSystemStyled = (message: ChatMessage) =>
    message.type === 'system' || message.channelMessageType === 2 || !!message.metadata?.renderAsSystem;

  const renderMessage = (message: ChatMessage) => {
    // US 7974: in the tenant's time zone and formats, not the browser's; nothing without a timestamp.
    const renderTimestamp = (className = 'text-xs text-gray-400 block mt-1') => (
      <MessageTimestamp value={message.timestamp} settings={displaySettings} className={className} />
    );
    const isSystemStyled = isMessageSystemStyled(message);
    // A `User`-role message flagged renderAsSystem (e.g. a spun-up agent's generated image, moved
    // to AuthorRole.User for API-compatibility reasons — see PLAN.md) must still render like an
    // agent/system message: gray icon/bubble, not the blue user styling. Only a "real" user
    // message should get the user-styled treatment below.
    const isUserStyled = message.type === 'user' && !isSystemStyled;

    if (message.contactForm) {
      return (
        <div className="flex flex-col max-w-full">
          <ContactFormCard
            form={message.contactForm}
            primaryColor={primaryColor}
            onSubmit={(data) => onSubmitContactForm(message, data)}
            onSkip={!message.contactForm.mandatory ? () => onSkipContactForm(message) : undefined}
          />
          {renderTimestamp()}
        </div>
      );
    }

    // Sub-agent activity (Task #7297; approval statuses Bug 7722). It is a 'tool'-typed entry
    // without contentItems, which the generic tool branch below would render as an empty box.
    if (message.subAgentActivity) {
      const { agentName: subAgentName, action, status } = message.subAgentActivity;
      const display = getSubAgentActivityDisplay(status);
      const StatusIcon = SUB_AGENT_ACTIVITY_ICONS[display.icon];
      return (
        <div
          className="bg-gray-100 rounded-lg p-3 max-w-[75%] border border-gray-200"
          data-testid="agent-chat-subagent-activity"
          data-status={status}
        >
          <div className="text-xs font-medium text-gray-500 mb-1">{subAgentName}</div>
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 flex-shrink-0 ${display.iconClasses}`} data-icon={display.icon} aria-hidden="true" />
            <span className="text-sm text-gray-700">{action}</span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${display.badgeClasses}`}>
              {display.label}
            </span>
          </div>
          {/* US 7959: why it failed, in friendly words (never the backend's text). */}
          {status === 'failed' && message.subAgentActivity.errorCode && (
            <p className="text-xs text-red-700 mt-1" data-testid="agent-chat-subagent-activity-error">
              {describeChatRuntimeError(message.subAgentActivity.errorCode)}
            </p>
          )}
          {renderTimestamp()}
        </div>
      );
    }

    // US 7959: the assistant failed while answering (error), or a tool it uses isn't available
    // (warning). Content is already the friendly text of the code. No rating.
    if (message.chatError) {
      const isWarning = message.chatError.severity === 'warning';
      const ErrorIcon = isWarning ? AlertTriangle : AlertCircle;
      // The failing agent's own icon, as in the shared renderer; the AI sparkle when it has none.
      const iconUrl = message.chatbotIconUrl?.trim();
      return (
        <div className="flex items-start gap-2 max-w-[75%] min-w-0">
          {iconUrl ? (
            <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200 flex-shrink-0" data-testid="agent-chat-error-avatar">
              <img src={iconUrl} alt="Chatbot icon" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="p-1 rounded-full bg-gray-200">
              <AiSparkleIcon className="h-4 w-4 text-gray-700" />
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-gray-500 mb-1">
              {message.agentName || agentName}
            </span>
            <div
              className={`p-3 rounded-lg min-w-0 max-w-full wrap-anywhere border ${
                isWarning ? 'bg-amber-50 border-amber-400 text-amber-900' : 'bg-red-50 border-red-500 text-red-900'
              }`}
              role={isWarning ? 'status' : 'alert'}
              data-testid="agent-chat-error"
              data-severity={message.chatError.severity}
            >
              <div className="flex items-start gap-2">
                <ErrorIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isWarning ? 'text-amber-600' : 'text-red-600'}`} aria-hidden="true" />
                <span className="text-sm">{message.content}</span>
              </div>
              {renderTimestamp(`text-xs block mt-1 ${isWarning ? 'text-amber-800' : 'text-red-800'}`)}
            </div>
          </div>
        </div>
      );
    }

    if (message.toolApproval) {
      return (
        <div className="flex flex-col max-w-full">
          <ToolApprovalCard
            approval={message.toolApproval}
            fallbackAgentName={message.agentName || agentName}
            primaryColor={primaryColor}
            onDecide={onToolApprovalDecision ? (decision) => onToolApprovalDecision(message, decision) : undefined}
          />
          {renderTimestamp()}
        </div>
      );
    }

    if (message.type === 'tool') {
      return (
        // min-w-0 + wrap-anywhere: tool names/results (long JSON, URLs, IDs with no spaces)
        // wrap inside the bubble instead of overflowing the chat panel.
        <div className="bg-gray-100 rounded-lg p-3 max-w-[75%] min-w-0 wrap-anywhere border border-gray-200" data-testid="agent-chat-tool-message">
          {Array.isArray(message.contentItems) && message.contentItems.length > 0 ? (
            message.contentItems.map((tool, idx) => {
              const toolKey = `${message.id}-${idx}`;
              if (tool.name !=='Text Content' && tool.name !=='Function Result Content'){
                expandedTools.add(toolKey);
              }
              const isExpanded = expandedTools.has(toolKey);
              
              return (
                <div key={idx} className="flex flex-col mb-1">
                  <div className="flex items-start gap-2">
                    <Wrench className="h-4 w-4 mt-0.5 text-gray-700 flex-shrink-0" />
                    <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                      <span 
                        className="font-medium text-sm cursor-pointer hover:text-gray-900 transition-colors flex-1 min-w-0 wrap-anywhere whitespace-pre-wrap"
                        onClick={() => onToggleToolDescription(message.id, idx)}
                        title="Click to toggle description"
                      >
                        {tool.name}
                      </span>
                      <Badge
                        className={`flex-shrink-0 ${
                          tool.status !== 'failed'
                            ? 'bg-green-100 text-green-800 hover:bg-green-100'
                            : 'bg-red-100 text-red-800 hover:bg-red-100'
                        }`}
                      >
                        {tool.status?.toUpperCase()}
                        {tool.statusCode && ` (${tool.statusCode})`}
                      </Badge>
                    </div>
                  </div>
                  {tool.data  && isExpanded && (
                    <span className="ml-6 block min-w-0 text-xs text-gray-500 wrap-anywhere">{renderTextWithLineBreaks(tool.data, getAuthHeaders)}</span>
                  )}
                </div>
              );
            })
          ) : null}
          <p className="text-sm max-w-full wrap-anywhere" style={{ maxWidth: '800px' }}>{renderTextWithLineBreaks(message.content, getAuthHeaders)}</p>
          {renderTimestamp()}
        </div>
      );
    } else {

      return (
        <div className={`flex items-start gap-2 max-w-[75%] min-w-0`}>
          <div className={`p-1 rounded-full ${
            isUserStyled ? 'bg-blue-600' : 'bg-gray-200'
          }`}>
            {isUserStyled ? (
              <User className="h-4 w-4 text-white" />
            ) : (
              <AiSparkleIcon className="h-4 w-4 text-gray-700" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            {(message.type === 'assistant' || (message.type === 'system' && message.channelMessageType === 3)) && (
              <span className="text-xs font-medium text-gray-500 mb-1">
                {message.agentName || agentName}
              </span>
            )}
            <div className={`p-3 rounded-lg min-w-0 max-w-full wrap-anywhere ${
              isUserStyled
                ? 'bg-blue-600 text-white'
                : message.channelMessageType === 2
                ? 'bg-gray-50 border border-gray-300 text-gray-700'
                : message.channelMessageType === 3
                ? 'bg-blue-300 border border-blue-500 text-gray-800'
                : 'bg-white border border-gray-200 text-gray-800'
            }`}>
              <div className="flex flex-col gap-2">
                {message.fileUrl && (() => {
                  const isImageUrl = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico)(\?.*)?$/i.test(message.fileUrl);
                  return (
                        <div>
                          {isImageUrl ? (
                            <DownloadableImage
                              src={message.fileUrl}
                              alt="Image"
                              style={{ maxHeight: '200px', objectFit: 'contain' }}
                              className="rounded-lg"
                              getAuthHeaders={getAuthHeaders}
                            />
                          ) : (
                            <>
                              <strong>URL:</strong>{' '}
                              <a href={message.fileUrl} target='_blank' className="text-xs text-gray-500 mr-2">{message.fileUrl}</a>
                            </>
                          )}
                        </div>
                      );
                })()}
                {message.file && (() => {
                  const file = message.file!;
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
                            target.src = `${baseUrl ?? ''}/assets/image-expired.svg`;
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
                    present since those already render their own image. */}
                {!message.fileUrl && !message.file
                  && (isExpiredImageSentinel(message.content) || findExpiredImageContentItem(message.contentItems)) && (
                  <img
                    src={`${baseUrl ?? ''}/assets/image-expired.svg`}
                    alt="Image no longer available"
                    className="w-full h-auto rounded-lg"
                    style={{ maxHeight: '200px', objectFit: 'contain' }}
                  />
                )}
                {/* Task 8215: an image (returned or uploaded) has no text of its own, so no text row under it. */}
                {!isImageOnly(message) && (
                <div className="flex items-start gap-2">
                  {isSystemStyled && message.channelMessageType === 2 && (
                    <span className="text-xs opacity-70 mt-0.5" title="Assistant is thinking...">💭</span>
                  )}
                  <div className={`${isTextValidHtml(message.content) ? 'test-message-content' : 'whitespace-pre-wrap'} min-w-0 wrap-anywhere text-sm ${
                    isSystemStyled && message.channelMessageType === 2
                      ? 'italic opacity-80'
                      : ''
                  }`}>
                    {message.channelMessageType === 2 && isSystemStyled && (
                      <div className="text-xs text-gray-500 mr-2 font-normal">[Thinking]</div>
                    )}
                    {!message.file && !isExpiredImageSentinel(message.content) && (() => {
                      // Bug 7872: <img>s inside the message fall back to image-expired.svg,
                      // resolved the same way as the message.file fallback above.
                      const imageFallbackSrc = `${baseUrl ?? ''}/assets/image-expired.svg`;
                      if(isTextValidHtml(message.content)) {
                        return renderHtmlWithImages(message.content, undefined, imageFallbackSrc);
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
              {renderTimestamp(`text-xs block mt-1 ${isUserStyled ? 'text-blue-100' : 'text-gray-400'}`)}
            </div>
            {message.type === 'assistant' && onRateMessage && message.messageId && (
              <div className="flex items-center gap-1 mt-1">
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
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <AiSparkleIcon size={40} className="mx-auto mb-2" />
            <p>Send a message to start chatting with {agentName}</p>
          </div>
        </div>
      ) : (
        <>
          {messages.filter(m => m.channelMessageType !== 0
            && !(statusInAgentsBar && m.subAgentActivity && SUB_AGENT_STATUSES_IN_AGENTS_BAR.has(m.subAgentActivity.status))).map((message) => {
            // US 7502: where the user pressed Stop - a full-width divider, never an agent bubble.
            if (message.stoppedMarker) {
              return (
                <StoppedDivider
                  key={message.id}
                  timestamp={<MessageTimestamp value={message.timestamp} settings={displaySettings} className="flex-shrink-0" />}
                />
              );
            }
            return (
              <div key={message.id}>
                <div className={`flex ${message.type === 'user' && !isMessageSystemStyled(message) ? 'justify-end' : 'justify-start'}`}>
                  {renderMessage(message)}
                </div>
              </div>
            );
          })}
        </>
      )}
      
      {/* Typing Indicators — one bubble per agent currently typing (Task #7373) */}
      {!statusInAgentsBar && typingIndicators.map((indicator) => (
        <div key={indicator.agentId ?? indicator.agentName ?? 'typing'} className="flex justify-start">
          <div className="flex items-start gap-2 max-w-[75%]">
            <div className="p-1 rounded-full bg-gray-200">
              <AiSparkleIcon className="h-4 w-4 text-gray-700" />
            </div>
            <div className="p-3 rounded-lg bg-white border border-gray-200 text-gray-800">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};