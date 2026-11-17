import React, { createContext, useContext, useCallback, useState, ReactNode } from 'react';
import { ChatMessage, ContactFormUpdate, TextSuggestionUpdate, SubAgentActivityUpdate, ToolApprovalState } from '../services/chat-service';
import type { ChatErrorState } from '../utils/chat-runtime-error';

export interface SharedChatMessage {
  id: string;
  messageId?: string; // GUID from the API, used for rating
  type: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp?: Date; // US 7974: missing for a history entry without one
  rawTimestamp?: string; // Original ISO string from server, used for display
  rating?: 'thumbsUp' | 'thumbsDown' | null;
  channelMessageType: 0 | 1 | 2 | 3 | 4; // 1 = Normal, 2 = Thinking, 3 = Metadata, 4 = Forms
  metadata?: Record<string, any>;
  agentId?: number;
  agentName?: string; // Name of the agent that produced this message, used to label replies when sub-agents are spun up
  chatbotIconUrl?: string; // Per-message bot avatar (the producing agent's configured WKFlo icon); falls back to the host agent's icon when absent
  source: 'text' | 'voice'; // Track the source of the message
  file?: {
    name: string;
    data: string;
    mimeType: string;
    size: number;
  } | null;
  fileUrl?: string; // URL for file attachments, if applicable
  contentItems?: {
    name: string;
    data?: string;
    status: 'started' | 'success' | 'completed' | 'failed';
    statusCode?: number;
  }[];
  // Present when this history entry is a contact-form prompt rather than a normal chat message
  contactForm?: ContactFormUpdate;
  // Present when this history entry is a text-suggestion prompt rather than a normal chat message
  textSuggestion?: TextSuggestionUpdate;
  // Present when this history entry is an MCP OAuth2 reconnect prompt rather than a normal chat message
  mcpOAuthReconnect?: {
    toolName: string;
    startPath: string;
    message: string;
  };
  // Present when this history entry reports a subagent's live activity rather than a normal chat
  // message (Task #7297) - see SubAgentActivityStatus for the statuses, including the tool
  // approval ones (Bug 7722)
  subAgentActivity?: SubAgentActivityUpdate;
  // Present when this history entry is a tool-function approval card (US 7575)
  toolApproval?: ToolApprovalState;
  // Present when this history entry is the "Stopped. All agents cancelled." divider (US 7502)
  stoppedMarker?: { stoppedAt: string };
  // Present when this history entry reports a failed chat turn or tool (US 7959)
  chatError?: ChatErrorState;
}

interface ChatMessagesContextType {
  messages: SharedChatMessage[];
  addMessage: (message: SharedChatMessage | ChatMessage, source?: 'text' | 'voice') => void;
  updateMessage: (message: SharedChatMessage | ChatMessage, source?: 'text' | 'voice') => void;
  updateMessageRating: (messageId: string, rating: 'thumbsUp' | 'thumbsDown' | null) => void;
  clearMessages: () => void;
  removeMessage: (messageId: string) => void;
  // Adds a message right after the one with id `afterMessageId` (at the start when null, at the end
  // when that id is gone). A message with the same id already present is merged in place instead.
  // moveExisting: an entry with the same id is merged AND moved to just after the anchor (US 7502,
  // the Stop response's divider). Otherwise it is merged in place.
  insertMessageAfter: (afterMessageId: string | null, message: SharedChatMessage | ChatMessage, source?: 'text' | 'voice', options?: { moveExisting?: boolean }) => void;
  // Shallow-merges the fields returned by `patch` into one message, if it exists (no-op otherwise).
  patchMessage: (messageId: string, patch: (message: SharedChatMessage) => Partial<SharedChatMessage>) => void;
  // Convert between different message formats
  convertFromChatMessage: (chatMessage: ChatMessage, source: 'text' | 'voice') => SharedChatMessage;
}

const ChatMessagesContext = createContext<ChatMessagesContextType | undefined>(undefined);

interface ChatMessagesProviderProps {
  children: ReactNode;
}

export const ChatMessagesProvider: React.FC<ChatMessagesProviderProps> = ({ children }) => {
  const [messages, setMessages] = useState<SharedChatMessage[]>([]);

  const convertFromChatMessage = useCallback((chatMessage: ChatMessage, source: 'text' | 'voice' = 'text'): SharedChatMessage => {
    return {
      id: chatMessage.id,
      messageId: chatMessage.messageId,
      type: chatMessage.type,
      content: chatMessage.content,
      timestamp: chatMessage.timestamp,
      rawTimestamp: chatMessage.rawTimestamp,
      rating: chatMessage.rating,
      channelMessageType: chatMessage.channelMessageType,
      metadata: chatMessage.metadata,
      agentId: chatMessage.agentId,
      agentName: chatMessage.agentName,
      chatbotIconUrl: chatMessage.chatbotIconUrl,
      source,
      file: chatMessage.file,
      fileUrl: chatMessage.fileUrl,
      contentItems: chatMessage.contentItems,
      contactForm: chatMessage.contactForm,
      textSuggestion: chatMessage.textSuggestion,
      mcpOAuthReconnect: chatMessage.mcpOAuthReconnect,
      subAgentActivity: chatMessage.subAgentActivity,
      toolApproval: chatMessage.toolApproval,
      stoppedMarker: chatMessage.stoppedMarker,
      chatError: chatMessage.chatError
    };
  }, []);

  const addMessage = useCallback((message: SharedChatMessage | ChatMessage, source: 'text' | 'voice' = 'text') => {
    setMessages(prev => {
      let newMessage: SharedChatMessage;
      
      // Check if it's already a SharedChatMessage or needs conversion
      if ('source' in message) {
        newMessage = message as SharedChatMessage;
      } else {
        newMessage = convertFromChatMessage(message as ChatMessage, source);
      }
      
      // Check if message already exists
      const existingIndex = prev.findIndex(msg => msg.id === newMessage.id);
      
      if (existingIndex !== -1) {
        // Update existing message
        const updatedMessages = [...prev];
        const existing = updatedMessages[existingIndex];
        const merged = { ...existing, ...newMessage };
        // US 7575: the same approval can arrive more than once (live ToolApprovalRequest, its
        // persisted Forms-channel copy). A later "Pending" copy must not undo what this client
        // already knows: an answer (non-Pending) or a 409 "already answered" (alreadyAnswered,
        // still Pending until ToolApprovalResolved lands).
        if (existing.toolApproval && newMessage.toolApproval && newMessage.toolApproval.status === 'Pending'
          && (existing.toolApproval.alreadyAnswered || existing.toolApproval.status !== 'Pending')) {
          merged.toolApproval = existing.toolApproval;
        }
        // US 7502: a Stop divider stays a system entry when the backend's marker (an assistant
        // message) merges into it; as an assistant entry, later system messages would be inserted
        // above it.
        if (existing.stoppedMarker || newMessage.stoppedMarker) {
          merged.type = 'system';
          merged.stoppedMarker = existing.stoppedMarker ?? newMessage.stoppedMarker;
        }
        updatedMessages[existingIndex] = merged;
        return updatedMessages;
      } else {
        // Add new message
        // when adding a new message if the type is distinct than user and assistant
        // then it should go just before the last message if the last message is type assistant.
        // Contact-form, text-suggestion, MCP OAuth reconnect prompts, tool-approval cards (US 7575), and subagent-activity cards are
        // excluded: they must always appear after the assistant's text has fully rendered, never
        // inserted above it. Subagent activity in particular can complete well after the root turn's
        // own assistant response has already landed (the hand-off is fire-and-forget), so splicing it
        // before that trailing message would show it out of chronological order.
        // The Stop divider (US 7502) is excluded too: it marks where the run was cut, so it always
        // goes below the partial text the stopped agent left behind.
        if (newMessage.type !== 'user' && newMessage.type !== 'assistant' && !newMessage.contactForm && !newMessage.textSuggestion && !newMessage.mcpOAuthReconnect && !newMessage.subAgentActivity && !newMessage.toolApproval && !newMessage.stoppedMarker &&
          prev.length > 0 && prev[prev.length - 1].type === 'assistant') {
          // Insert tool message before the last assistant message
          const updatedMessages = [...prev];
          updatedMessages.splice(prev.length - 1, 0, newMessage);
          return updatedMessages;
        } else {
          // Add message at the end normally
          return [...prev, newMessage];
        }
      }
    });
  }, [convertFromChatMessage]);

  const updateMessage = useCallback((message: SharedChatMessage | ChatMessage, source: 'text' | 'voice' = 'text') => {
    setMessages(prev => {
      let newMessage: SharedChatMessage;
      
      // Check if it's already a SharedChatMessage or needs conversion
      if ('source' in message) {
        newMessage = message as SharedChatMessage;
      } else {
        newMessage = convertFromChatMessage(message as ChatMessage, source);
      }

      // Check if message already exists
      const existingIndex = prev.findIndex(msg => msg.id === newMessage.id);
      
      if (existingIndex !== -1) {
        // Update existing message
        const updatedMessages = [...prev];
        updatedMessages[existingIndex].content = updatedMessages[existingIndex].content + newMessage.content;
        // Backfill agent info in case it wasn't present on the first streamed chunk
        if (!updatedMessages[existingIndex].agentName && newMessage.agentName) {
          updatedMessages[existingIndex].agentId = newMessage.agentId;
          updatedMessages[existingIndex].agentName = newMessage.agentName;
        }
        // Backfill the per-message icon the same way, in case it wasn't present on the first streamed chunk
        if (!updatedMessages[existingIndex].chatbotIconUrl && newMessage.chatbotIconUrl) {
          updatedMessages[existingIndex].chatbotIconUrl = newMessage.chatbotIconUrl;
        }

        return updatedMessages;
      } else {
        // Add new message
        return [...prev, newMessage];
      }
    });
  }, [convertFromChatMessage]);

  const updateMessageRating = useCallback((messageId: string, rating: 'thumbsUp' | 'thumbsDown' | null) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, rating } : msg
    ));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  }, []);

  const insertMessageAfter = useCallback((afterMessageId: string | null, message: SharedChatMessage | ChatMessage, source: 'text' | 'voice' = 'text', options?: { moveExisting?: boolean }) => {
    setMessages(prev => {
      const newMessage: SharedChatMessage = 'source' in message
        ? message as SharedChatMessage
        : convertFromChatMessage(message as ChatMessage, source);

      const existingIndex = prev.findIndex(msg => msg.id === newMessage.id);
      if (existingIndex !== -1) {
        const merged = { ...prev[existingIndex], ...newMessage };
        const anchorGone = afterMessageId !== null && !prev.some(msg => msg.id === afterMessageId);
        if (!options?.moveExisting || anchorGone || afterMessageId === newMessage.id) {
          const updated = [...prev];
          updated[existingIndex] = merged;
          return updated;
        }
        // Merge and move it to just after the anchor (e.g. the Stop divider whose marker arrived
        // before the Stop response, after a message sent since).
        const without = prev.filter((_, index) => index !== existingIndex);
        const anchorIndex = afterMessageId === null ? -1 : without.findIndex(msg => msg.id === afterMessageId);
        without.splice(anchorIndex + 1, 0, merged);
        return without;
      }

      const anchorIndex = afterMessageId === null ? -1 : prev.findIndex(msg => msg.id === afterMessageId);
      if (afterMessageId !== null && anchorIndex === -1) {
        return [...prev, newMessage];
      }
      const updated = [...prev];
      updated.splice(anchorIndex + 1, 0, newMessage);
      return updated;
    });
  }, [convertFromChatMessage]);

  const patchMessage = useCallback((messageId: string, patch: (message: SharedChatMessage) => Partial<SharedChatMessage>) => {
    setMessages(prev => {
      const index = prev.findIndex(msg => msg.id === messageId);
      if (index === -1) return prev;
      const updated = [...prev];
      updated[index] = { ...prev[index], ...patch(prev[index]) };
      return updated;
    });
  }, []);

  const value: ChatMessagesContextType = {
    messages,
    addMessage,
    updateMessage,
    updateMessageRating,
    clearMessages,
    removeMessage,
    insertMessageAfter,
    patchMessage,
    convertFromChatMessage
  };

  return (
    React.createElement(ChatMessagesContext.Provider, { value }, children)
  );
};

export const useChatMessages = (): ChatMessagesContextType => {
  const context = useContext(ChatMessagesContext);
  if (context === undefined) {
    throw new Error('useChatMessages must be used within a ChatMessagesProvider');
  }
  return context;
};