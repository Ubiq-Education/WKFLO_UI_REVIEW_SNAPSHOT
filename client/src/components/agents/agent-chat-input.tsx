import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Send, Loader2, Wifi, WifiOff, Paperclip, Plus, BookOpen, Image, FileIcon, FileText, Mic, MicOff, CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SpinUpAgentTarget } from "@shared/schema";
import { AiSparkleIcon } from "@shared/components/icons/ai-sparkle-icon";

// Finds an in-progress "@mention" ending at the cursor, e.g. "hey @sup" -> { start: 4, query: "sup" }.
// The "@" must be at the start of the input or preceded by whitespace - otherwise "foo@bar.com" (an
// email address, not a mention) would trigger the picker on every "@" typed anywhere in the text.
function getMentionQuery(value: string, cursor: number): { start: number; query: string } | null {
  const uptoCursor = value.slice(0, cursor);
  const match = /(?<=^|\s)@([^\s@]*)$/.exec(uptoCursor);
  if (!match) return null;
  return { start: match.index, query: match[1] };
}

interface AgentChatInputProps {
  input: string;
  isProcessing: boolean;
  isLoading: boolean;
  conversationState: 'active' | 'processing' | 'idle' | 'error';
  selectedFiles: (File & { dataUrl?: string })[];
  isConnected: boolean;
  connectionState: string;
  agents?: SpinUpAgentTarget[];
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSendMessage: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onBlur: () => void;
  onReconnect: () => void;
  // US 7575: when set, typing and sending are blocked and this text replaces the placeholder
  // (e.g. while an agent waits for a tool-approval answer).
  blockedMessage?: string;
  // Voice chatbot integration
  isListening?: boolean;
  isVoiceChatConnected?: boolean;
  isAISpeaking?: boolean;
  streamingActive?: boolean;
  connectionError?: boolean;
  isVoiceChatEnabled?: boolean;
  onStartListening?: () => void;
  onStopListening?: () => void;
  // US 7500: true while agents are working on the conversation. Send becomes Stop (when onStop is
  // passed) and Enter doesn't send; typing keeps working. Separate from isProcessing.
  isWorking?: boolean;
  // US 7501: stops every agent working on the conversation.
  onStop?: () => void;
}

export const AgentChatInput = React.memo<AgentChatInputProps>(({ 
  input,
  isProcessing,
  isLoading,
  conversationState,
  selectedFiles,
  isConnected,
  connectionState,
  agents,
  onInputChange,
  onKeyDown,
  onSendMessage,
  onFileSelect,
  onRemoveFile,
  onBlur,
  onReconnect,
  blockedMessage,
  isListening = false,
  isVoiceChatConnected = false,
  isAISpeaking = false,
  streamingActive = false,
  connectionError = false,
  isVoiceChatEnabled = true,
  onStartListening,
  onStopListening,
  isWorking = false,
  onStop
}) => {
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);

  // US 7501: Send and Stop swap places, so the button just pressed goes away. Keep keyboard focus in
  // the message input instead of letting it fall to <body>: move it there once the input can take
  // it (it is disabled while a send is in flight), unless the user has moved focus somewhere else.
  const focusInputAfterRef = useRef<HTMLElement | null>(null);
  const keepFocusInInput = (pressedButton: HTMLElement) => {
    if (document.activeElement === pressedButton) {
      focusInputAfterRef.current = pressedButton;
    }
  };
  useEffect(() => {
    const pressedButton = focusInputAfterRef.current;
    const messageInput = inputRef.current;
    if (!pressedButton || !messageInput || messageInput.disabled) return;
    focusInputAfterRef.current = null;
    const active = document.activeElement;
    if (!active || active === document.body || active === pressedButton || !active.isConnected) {
      messageInput.focus();
    }
  });

  const filteredMentionAgents = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return (agents ?? []).filter(agent => agent.name.toLowerCase().includes(q)).slice(0, 8);
  }, [agents, mentionQuery]);

  const selectMentionAgent = (agentName: string) => {
    if (mentionStart === null) return;
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const newValue = `${input.slice(0, mentionStart)}@${agentName} ${input.slice(cursor)}`;
    onInputChange(newValue);
    setMentionQuery(null);
    setMentionStart(null);
    const newCursor = mentionStart + agentName.length + 2; // '@' + name + trailing space
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCursor, newCursor);
    });
  };

  const getStatusText = () => {    
    if (blockedMessage) return blockedMessage;
    if (!isVoiceChatEnabled || !isConnected) return 'Type your message...';
    if (connectionError) return 'Connection Error';
    if (streamingActive) return 'AI Streaming...';
    if (isAISpeaking) return 'AI Speaking...';
    if (isListening) return 'Listening...';
    if (isVoiceChatConnected) return 'Ready to Chat';
    if (!isVoiceChatConnected && !isListening) return 'Connecting...';
    if (conversationState === 'processing') return 'Agent is processing...';
    return 'Type a message...';
  };

  const getMicrophoneState = () => {
    if (connectionError) return 'error';
    if (streamingActive) return 'streaming';
    if (isAISpeaking) return 'ai-speaking';
    if (isListening) return 'listening';
    if (isVoiceChatConnected) return 'ready';
    return 'connecting';
  };

  const getMicrophoneColor = () => {
    const state = getMicrophoneState();
    switch (state) {
      case 'error': return '#ef4444';
      case 'streaming': return '#8b5cf6';
      case 'ai-speaking': return '#06b6d4';
      case 'listening': return '#10b981';
      case 'ready': return '#9ca3af';
      case 'connecting': return '#d1d5db';
      default: return '#9ca3af';
    }
  };

  const getMicrophoneBackground = () => {
    const state = getMicrophoneState();
    switch (state) {
      case 'error': return '#fef2f2';
      case 'streaming': return '#f3e8ff';
      case 'ai-speaking': return '#ecfeff';
      case 'listening': return '#d1fae5';
      case 'ready': return 'transparent';
      case 'connecting': return 'transparent';
      default: return 'transparent';
    }
  };

  // No new voice input while an approval is pending (US 7575) or agents work (US 7501); stopping an
  // ongoing one is still allowed.
  const isVoiceStartBlocked = (!!blockedMessage || isWorking) && !(isListening || streamingActive || isAISpeaking);

  const handleMicrophoneClick = () => {
    if (isVoiceStartBlocked) {
      return;
    }
    if (!isVoiceChatConnected || connectionError) {
      console.warn('Voice chat not connected');
      return;
    }
    
    if (isListening || streamingActive || isAISpeaking) {
      onStopListening?.();
    } else {
      onStartListening?.();
    }
  };

  const handleFileUploadClick = () => {
    if (selectedFiles.length >= 5) return;
    fileInputRef.current?.click();
  };

  const toggleOptionsMenu = () => {
    setShowOptionsMenu(!showOptionsMenu);
    // Keep input focus when opening options menu
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleOptionSelect = (option: string) => {
    if (option === 'files') {
      handleFileUploadClick();
    }
  };

  const isVoiceDisabled = !!blockedMessage || !isVoiceChatEnabled || isProcessing || conversationState === 'processing' || !isVoiceChatConnected || connectionError || isAISpeaking || streamingActive;

  return (
    <div className="p-4 border-t">
      {/* File previews */}
      {selectedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedFiles.map((file, index) => (
            <div key={index} className="p-2 bg-gray-50 rounded-lg border flex items-center gap-2">
              {file.type.startsWith('image/') && file.dataUrl ? (
                <img
                  src={file.dataUrl}
                  alt={file.name}
                  className="w-8 h-8 rounded object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm text-gray-600 flex items-center gap-2">
                  {file.type.startsWith('image/') ? (
                    <Image className="w-4 h-4 text-green-600" />
                  ) : file.type === 'application/pdf' ? (
                    <FileIcon className="w-4 h-4 text-red-600" />
                  ) : (
                    <FileText className="w-4 h-4 text-blue-600" />
                  )}
                  {file.name}
                </span>
                <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  onRemoveFile(index);
                  if (selectedFiles.length === 1 && fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {/* Input with plus button inside */}
          <div className="relative">
            <button
              ref={plusButtonRef}
              onClick={toggleOptionsMenu}
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from input
              disabled={isProcessing}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
              title="More options"
            >
              <Plus className="h-4 w-4" />
            </button>
            
            <Input
              ref={inputRef}
              type="text"
              aria-label="Message"
              placeholder={getStatusText()}
              value={input}
              onChange={(e) => {
                const value = e.target.value;
                onInputChange(value);
                const cursor = e.target.selectionStart ?? value.length;
                const mention = getMentionQuery(value, cursor);
                if (mention) {
                  setMentionStart(mention.start);
                  setMentionQuery(mention.query);
                  setHighlightedMentionIndex(0);
                } else {
                  setMentionStart(null);
                  setMentionQuery(null);
                }
              }}
              onKeyDown={(e) => {
                if (mentionQuery !== null) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedMentionIndex((i) => filteredMentionAgents.length ? (i + 1) % filteredMentionAgents.length : 0);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedMentionIndex((i) => filteredMentionAgents.length ? (i - 1 + filteredMentionAgents.length) % filteredMentionAgents.length : 0);
                    return;
                  }
                  if ((e.key === 'Enter' || e.key === 'Tab') && filteredMentionAgents.length > 0) {
                    e.preventDefault();
                    selectMentionAgent(filteredMentionAgents[highlightedMentionIndex].name);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setMentionQuery(null);
                    setMentionStart(null);
                    return;
                  }
                }
                // US 7500: while agents work, Enter doesn't send.
                if (isWorking && e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  return;
                }
                onKeyDown(e);
              }}
              onBlur={() => {
                setMentionQuery(null);
                setMentionStart(null);
                onBlur();
              }}
              disabled={isProcessing || conversationState === 'processing' || !isConnected || !!blockedMessage}
              className="pl-10 pr-12"
            />

            {/* @mention agent picker */}
            {mentionQuery !== null && (
              <div
                className="absolute bottom-full left-0 mb-2 min-w-64 max-w-80 bg-white rounded-2xl shadow-lg border border-gray-200 py-1.5 z-50 max-h-56 overflow-y-auto"
              >
                {filteredMentionAgents.length > 0 ? (
                  filteredMentionAgents.map((agent, index) => (
                    <div
                      key={agent.name}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input blur before click registers
                        selectMentionAgent(agent.name);
                      }}
                      onMouseEnter={() => setHighlightedMentionIndex(index)}
                      className={cn(
                        "px-4 py-2 cursor-pointer flex items-center gap-3",
                        index === highlightedMentionIndex ? "bg-gray-100" : "hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 overflow-hidden">
                        {agent.iconUrl ? (
                          <img src={agent.iconUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <AiSparkleIcon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="truncate text-sm text-gray-900">{agent.name}</div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-2 text-sm text-gray-400">
                    {agents === undefined ? "Loading agents..." : "No agents found"}
                  </div>
                )}
              </div>
            )}

            {/* Microphone button - only render when voice chat is enabled */}
            {isVoiceChatEnabled && (
              <button
                onClick={handleMicrophoneClick}
                //disabled={isVoiceDisabled}
                disabled={isVoiceStartBlocked}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 transition-all p-1 rounded-full"
                style={{
                  color: getMicrophoneColor(),
                  backgroundColor: getMicrophoneBackground(),
                  opacity: connectionError ? 0.5 : 1,
                  cursor: isVoiceDisabled ? 'not-allowed' : 'pointer'
                }}
                title={getStatusText()}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
          
          {/* Options Menu Popup */}
          {showOptionsMenu && (
            <div 
              ref={optionsMenuRef}
              className="absolute bottom-full left-0 mb-2 min-w-64 bg-white rounded-2xl shadow-lg border border-gray-200 py-1.5 z-50"
              style={{ maxWidth: '320px' }}
            >
              {/* Add photos & documents */}
              <div 
                className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3 group"
                onClick={() => handleOptionSelect('files')}
              >
                <div className="flex items-center justify-center w-4 h-4 text-gray-600">
                  <Paperclip className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm text-gray-900">Add photos & documents</div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Attach files"
          accept="image/*,.pdf,.doc,.docx,.txt,.rtf,.odt"
          multiple
          onChange={(e) => { setShowOptionsMenu(false); onFileSelect(e); }}
          className="hidden"
        />
        
        {isWorking && onStop ? (
          // US 7500: the only stop control, shown instead of Send (and its spinner) while agents
          // work. Never disabled: Stop has to work even while the send request is still in flight.
          <Button
            type="button"
            onClick={(e) => { keepFocusInInput(e.currentTarget); onStop(); }}
            aria-label="Stop all agents"
            title="Stop"
            data-testid="agent-chat-stop-button"
            className="cursor-pointer rounded-full bg-gray-800 hover:bg-gray-700 text-white text-[13px] font-semibold gap-1.5 pl-2.5 pr-3.5"
          >
            <CircleStop aria-hidden="true" className="h-[18px] w-[18px]" />
            Stop
          </Button>
        ) : (
          /* Send button */
          <Button
            className='cursor-pointer'
            aria-label="Send message"
            onClick={(e) => { keepFocusInInput(e.currentTarget); onSendMessage(); }}
            disabled={isProcessing || isLoading || !isConnected || !!blockedMessage || (!input.trim() && selectedFiles.length === 0)}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
        
        {/* SignalR Connection Status Indicator */}
        <div className="flex items-center gap-1 text-xs text-gray-500" title={`Real-time connection: ${connectionState}`}>
          {isConnected ? (
            <Wifi className="h-3 w-3 text-green-500" />
          ) : (
            <div 
              className="cursor-pointer hover:opacity-70" 
              onClick={onReconnect}
              title="Click to reconnect"
            >
              <WifiOff className="h-3 w-3 text-red-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});