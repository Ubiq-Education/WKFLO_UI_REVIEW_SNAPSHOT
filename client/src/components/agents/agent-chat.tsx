import { useContext, useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useQuery } from "@tanstack/react-query";
import useAuth from '@/hooks/use-auth';
import { useChat } from '@shared/hooks/use-chat';
import { ChatMessage, ChatService, ToolApprovalDecision } from '@shared/services/chat-service';
import { queryClient } from '@/lib/queryClient';
import { config } from '@/lib/config';
import { useMsal } from '@azure/msal-react';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Brain } from 'lucide-react';
import { AgentChatMessages } from './agent-chat-messages';
import { AgentChatInput } from './agent-chat-input';
import { AgentsBar } from '@shared/components/agents-bar';
import { transformHistoryMessages } from './agent-chat-history-transform';
import { DataContext } from "@shared/models/chat-models";
import { ChatServiceFactory } from '../../services/chat-service.factory';
import { ContactFormData } from '@shared/components/contact-form-card';
import { isImageTooLarge, formatFileSize, MAX_IMAGE_SIZE_BYTES } from '@shared/utils/file-validation';
import { GENERIC_CHAT_SEND_ERROR } from '@shared/utils/chat-send-errors';
import type { SpinUpAgentTarget } from '@shared/schema';

interface AgentChatProps {
  agent: {
    id: number;
    name: string;
    enableSTM: boolean;
  };
  session: {sessionId: string, chatName: string | null, refreshMessages?: boolean};
  isProcessing?: boolean; // Optional since we'll manage this internally
  apiEndpoint?: string; // Optional API endpoint override
  security?: any; // Optional security config
  chainOfThought?: boolean; // Optional chain of thought setting
}

export interface AgentChatRef {
  clearMessages: () => void;
}

const AgentChat = forwardRef<AgentChatRef, AgentChatProps>(function AgentChat({
  agent,
  session,
  isProcessing: externalIsProcessing = false,
  apiEndpoint,
  security,
  chainOfThought: initialChainOfThought = false
}: AgentChatProps, ref) {
  const [input, setInput] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<'active' | 'processing' | 'idle' | 'error'>('idle');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<(File & { dataUrl?: string })[]>([]);
  const [chainOfThought, setChainOfThought] = useState(initialChainOfThought);
  const [chatService, setChatService] = useState<ChatService | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { accounts } = useMsal();
  const userName = accounts.length > 0 ? accounts[0].name ?? 'Unknown User': 'Unknown User';

  const apiUrl = config.API_URL;

  const context = useContext(DataContext);

  // Sync agentConfig state when agent prop changes
  useEffect(() => {
    setChatService(ChatServiceFactory.createTenantChatService({
      apiEndpoint: apiEndpoint || `${apiUrl}`,
      id: agent.id,
      tenantGuid:  context.selectedTenantGuid,
      securityConfiguration: security || { type: 'none' }
    }));
  }, [agent.id, apiEndpoint, context.selectedTenantGuid]);
  
  // Update agent settings when agentId changes
  useEffect(() => {
    const loadAgentSettings = async () => {
      
      try {
        if (!chatService) return;

        const agentSettings = await chatService.getAgentSettings();
        
        // Only update configuration, preserve runtime state
        context.updateState({
          agentChatSettings: agentSettings.agentChatSettings,
          // Keep existing: chatOpened, isThinking, messages, etc.
        });
      } catch (error) {
        console.error('Failed to load agent settings:', error);
      }
    };

    loadAgentSettings();
  }, [agent.id, chatService]);

  // Chat service message handlers
  const handleNewMessage = useCallback((message: ChatMessage) => {
    toast({
      title: "New Message Received",
      description: message.type === 'assistant' ? "Agent has sent a new message." : "You have sent a new message.",
    });
  }, []);

  const handleNewToolExecution = useCallback((toolName: string, status: string, statusCode?: number, description?: string) => {
    toast({
      title: "New Tool Message Received",
      description: status !== 'failed' ? `✓ Successfully executed ${toolName}` : `❌ Failed to execute ${toolName}`,
    });
  }, []);
  
  const handleConnectionChange = useCallback((connected: boolean) => {
    console.log('Chat connection changed:', connected);
  }, []);

  // US 7501: a phrase spoken while agents work is kept as the draft (appended), not sent.
  const handleVoiceTranscriptWhileWorking = useCallback((transcript: string) => {
    setInput(previous => previous.trim() ? `${previous.trimEnd()} ${transcript}` : transcript);
  }, []);

  const handleReconnect = useCallback(() => {
    // Refresh messages after reconnecting
    if (agent.id && session.sessionId && agent.enableSTM) {
      queryClient.invalidateQueries({ queryKey: [`/ai/api/v1/tenant/agent/${agent.id}/chat/${session.sessionId}/session-messages`] });
    }
  }, [agent.id, session.sessionId, agent.enableSTM]);

  // Initialize chat service with new endpoints
  const {
    messages: messages,
    isConnected,
    isLoading: isChatLoading,
    connectionState,
    isAgentTyping,
    typingAgents,
    sessionAgents,
    activeAgent,
    activeStatus,
    isWorking,
    stopAllAgents,
    sendMessage: sendChatMessage,
    sendTypingIndicator,
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
    hasPendingToolApproval
  } = useChat(
    chatService,
    {
      chatId: session.sessionId,
      chainOfThought: chainOfThought,
      mergeSubAgentCards: true,
      autoConnect: true,
      onMessage: handleNewMessage,
      onToolExecution: handleNewToolExecution,
      onConnectionChange: handleConnectionChange,
      onReconnect: handleReconnect,
      onVoiceTranscriptWhileWorking: handleVoiceTranscriptWhileWorking
    }
  );

  // Check if voice chat is enabled from settings
  const isVoiceChatEnabled = context.agentChatSettings?.isVoiceChatEnabled ?? false;

  // Use internal loading state or external one
  const isProcessing = isChatLoading || externalIsProcessing;

  // Auto-scroll to bottom on new messages or typing indicator change
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isAgentTyping, typingAgents, messages]);
  
  // Expose clearMessages function to parent component
  useImperativeHandle(ref, () => ({
    clearMessages
  }), [clearMessages]);
  
  const token = useAuth();

  // Agents this agent can spin up, used to populate the @mention picker in the chat input
  const { data: spinUpAgents } = useQuery<SpinUpAgentTarget[]>({
    queryKey: [`/ai/api/v1/tenant/agent/${agent.id}/spin-up/agents`, token, context.selectedTenantGuid],
    queryFn: async () => {
      if (!chatService) return [] as SpinUpAgentTarget[];
      const response = await chatService.getSpinUpAgents();
      return response.success ? response.data?.data ?? [] : [];
    },
    enabled: !!chatService && !!agent.id && !!token && !!context.selectedTenantGuid,
  });

  // Fetch chat messages from backend using ChatService
  const { data: fetchedMessages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/ai/api/v1/tenant/agent/${agent.id}/chat/${session.sessionId}/messages`, token, context.selectedTenantGuid],
    queryFn: async () => {
      if (!agent.id || !session.sessionId || !agent.enableSTM || !token || !chatService) {
        return [] as ChatMessage[];
      }
      const response = await chatService.readMessages(session.sessionId);
      return response.success ? response.data?.data || [] as ChatMessage[] : [] as ChatMessage[];
    },
    enabled: !!chatService && !!agent.id && !!session.sessionId && agent.enableSTM && !!token && !!context.selectedTenantGuid,
  });

  useEffect(() => {
    clearMessages();

    // Force scroll to bottom when switching sessions
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [session.sessionId]);

  //Set messages when fetched
  useEffect(() => {
    if (fetchedMessages.length > 0) {
      const formattedMessages = transformHistoryMessages(fetchedMessages);

      formattedMessages.forEach((msg: ChatMessage) => {
        addMessage(msg);
      });

      // Force scroll to bottom after historical messages are loaded
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [fetchedMessages]);
  
  const handleInputChange = (value: string) => {
    setInput(value);

    // Send typing indicator
    if (session.sessionId && sendTypingIndicator) {
      sendTypingIndicator(session.sessionId, value.length > 0, userName);
    }
  };
  
  const handleSendMessage = async () => {
    // US 7575: nothing new can be sent while the agent waits for a tool-approval answer.
    // US 7500: nor while agents are working - Stop comes first.
    if ((!input.trim() && selectedFiles.length === 0) || isProcessing || hasPendingToolApproval || isWorking) return;

    // One message per file
    selectedFiles.forEach((f, i) => {
      addMessage({
        id: `user-${Date.now()}-file-${i}`,
        content: '',
        type: 'user',
        timestamp: new Date(),
        channelMessageType: 1,
        file: { name: f.name, data: f.dataUrl || '', mimeType: f.type, size: f.size }
      });
    });
    // Text message (if any)
    if (input.trim()) {
      addMessage({
        id: `user-${Date.now()}`,
        content: input,
        type: 'user',
        timestamp: new Date(),
        channelMessageType: 1
      });
    }

    const currentInput = input;
    const currentFiles = selectedFiles.map(f => ({ fileName: f.name, fileData: f.dataUrl ?? '', fileSize: f.size }));
    setInput('');
    setSelectedFiles([]);
    
    try {
      const result = await sendChatMessage(currentInput, session.sessionId, currentFiles);
      // US 7948: the send was rejected (e.g. image too large) - say why in the chat.
      if (!result.success) {
        addMessage({
          id: `error-${Date.now()}`,
          type: 'assistant',
          content: result.error || GENERIC_CHAT_SEND_ERROR,
          timestamp: new Date(),
          channelMessageType: 1 // Normal
        });
      }

      if (session.chatName == null || session.chatName.trim() === '') {
        queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agent.id}/chats`] });
      }
    } catch (error) {
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to run agent'}`,
        timestamp: new Date(),
        channelMessageType: 1 // Normal
      };
      addMessage(errorMessage);
    }
  };
  
  // US 7501: the UI is already idle when this returns; a failed request is only logged by useChat.
  const handleStopAllAgents = useCallback(() => {
    void stopAllAgents();
  }, [stopAllAgents]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

    Promise.all(
      filesToRead.map(file =>
        readFile(file).catch(() => null)
      )
    ).then(results => {
      const valid = results.filter((f): f is File & { dataUrl?: string } => f !== null);
      const invalidCount = results.length - valid.length;
      if (valid.length > 0) {
        setSelectedFiles(prev => {
          const remaining = Math.max(0, 5 - prev.length);
          return [...prev, ...valid.slice(0, remaining)];
        });
        toast({
          title: "Files Selected",
          description: `Added ${valid.length} file(s).`,
        });
      }
      if (invalidCount > 0) {
        toast({
          title: "Invalid File Type",
          description: "Please select image files (jpg, png, gif) or documents (pdf, doc, docx, txt, rtf, odt, csv, xls, xlsx).",
          variant: "destructive"
        });
      }
      if (oversizedImages.length > 0) {
        toast({
          title: "Image Too Large",
          description: `${oversizedImages.map(f => f.name).join(', ')} exceed${oversizedImages.length === 1 ? 's' : ''} the ${formatFileSize(MAX_IMAGE_SIZE_BYTES)} limit.`,
          variant: "destructive"
        });
      }

      // Reset the input value to allow selecting the same file again
      e.target.value = '';
    });
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleToolDescription = (messageId: string, toolIndex: number) => {
    const toolKey = `${messageId}-${toolIndex}`;
    setExpandedTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolKey)) {
        newSet.delete(toolKey);
      } else {
        newSet.add(toolKey);
      }
      return newSet;
    });
  };

  const handleInputBlur = () => {
    // Stop typing indicator when input loses focus
    if (session.sessionId && sendTypingIndicator) {
      sendTypingIndicator(session.sessionId, false, userName);
    }
  };

  const handleRateMessage = useCallback(async (id: string, messageId: string, isThumbsUp: boolean) => {
    if (!chatService) return;
    updateMessageRating(id, isThumbsUp ? 'thumbsUp' : 'thumbsDown');
    await chatService.rateMessage(session.sessionId, messageId, isThumbsUp);
  }, [chatService, session.sessionId, updateMessageRating]);

  const handleContactFormSubmit = useCallback(async (message: ChatMessage, data: ContactFormData) => {
    const result = await submitContactForm(session.sessionId, message, data);
    if (!result.success) {
      throw new Error(result.error || 'Submission failed. Please try again.');
    }
    // No thank-you message here — ContactFormCompleted (handled in useChat) replays the
    // original question and the agent's real answer replaces it.
  }, [submitContactForm, session.sessionId]);

  const handleToolApprovalDecision = useCallback(
    (message: ChatMessage, decision: ToolApprovalDecision) =>
      message.toolApproval
        ? respondToToolApproval(message.toolApproval, decision)
        : Promise.resolve({ success: false, error: 'This request is no longer available.' }),
    [respondToToolApproval]
  );

  return (
    <div className="flex flex-col min-h-[500px] max-h-[500px] h-auto">
      {/* Chain of Thought Toggle */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50">
        <Brain className="h-4 w-4 text-gray-600" />
        <Label htmlFor="chain-of-thought" className="text-sm font-medium text-gray-700">
          Chain of Thought
        </Label>
        <Switch
          id="chain-of-thought"
          checked={chainOfThought}
          onCheckedChange={setChainOfThought}
        />
        <span className="text-xs text-gray-500">
          {chainOfThought ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      
      <AgentChatMessages
        messages={messages}
        typingIndicators={typingAgents}
        statusInAgentsBar
        expandedTools={expandedTools}
        messagesContainerRef={messagesContainerRef}
        agentName={agent.name}
        agentId={agent.id}
        getAuthHeaders={getAuthHeaders}
        onToggleToolDescription={toggleToolDescription}
        onRateMessage={handleRateMessage}
        onSubmitContactForm={handleContactFormSubmit}
        onSkipContactForm={skipContactForm}
        onToolApprovalDecision={handleToolApprovalDecision}
        primaryColor={context.agentChatSettings?.primaryColor || '#3b82f6'}
        displaySettings={context.agentChatSettings?.displaySettings}
      />

      {/* Agents bar (Task #7922): who has taken part in this session and who is working now. */}
      <AgentsBar
        agents={sessionAgents}
        activeAgent={activeAgent}
        status={activeStatus}
        hostAgent={{
          agentId: agent.id,
          name: agent.name,
          iconUrl: context.agentChatSettings?.chatbotIconPath || undefined,
        }}
        knownAgents={spinUpAgents}
        accentColor={context.agentChatSettings?.primaryColor || '#3b82f6'}
      />

      {/* Input — hidden when a mandatory form is pending */}
      {!hasMandatoryPendingContactForm && <AgentChatInput
        input={input}
        isProcessing={isProcessing}
        isLoading={isLoading}
        conversationState={conversationState}
        selectedFiles={selectedFiles}
        isConnected={isConnected}
        connectionState={connectionState}
        agents={spinUpAgents}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onSendMessage={handleSendMessage}
        onFileSelect={handleFileSelect}
        onRemoveFile={removeSelectedFile}
        onBlur={handleInputBlur}
        onReconnect={reconnect}
        blockedMessage={hasPendingToolApproval ? 'Answer the permission request above to continue' : undefined}
        // Voice Chat Props - only pass when enabled
        isVoiceChatEnabled={isVoiceChatEnabled}
        isListening={isVoiceChatEnabled ? isListening : false}
        isAISpeaking={isVoiceChatEnabled ? isAISpeaking : false}
        isVoiceChatConnected={isVoiceChatEnabled ? isVoiceChatConnected : false}
        streamingActive={isVoiceChatEnabled ? streamingActive : false}
        onStartListening={isVoiceChatEnabled ? startConversation : undefined}
        onStopListening={isVoiceChatEnabled ? stopConversation : undefined}
        // US 7500/7501: Send becomes Stop while agents work
        isWorking={isWorking}
        onStop={handleStopAllAgents}
      />}
    </div>
  );
});

export default AgentChat;