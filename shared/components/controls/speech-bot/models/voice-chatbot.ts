import { AgentChatSetting } from "@shared/models/chat-settings";

// Tipos para el WebSocket
export interface WebSocketMessage {
  type: 'connection' | 'authentication' | 'auth_success' | 'auth_failed' | 'token_expired' | 'user_message_received' | 'ai_response' | 'ai_audio' | 'ai_audio_streaming' | 'ai_response_complete' | 'error';
  message?: string;
  user_text?: string;
  source?: string;
  audio_data?: string;
  text?: string;
  is_final?: boolean;
}

// Tipos para mensajes enviados al servidor
export interface ServerMessage {
  type: string;
  text: string;
  source: string;
  timestamp: string;
  sessionId: string;
}

// Tipos para items de la cola de audio
export interface AudioQueueItem {
  audioData: string;
  text: string;
  isFinal: boolean;
}

// Tipos para el reconocimiento de voz
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

// Tipos para el status del chat
export interface ChatStatus {
  type: 'streaming' | 'ai-speaking' | 'listening' | 'inactive';
  text: string;
}

// Tipos para el hook useVoiceChatbot
export interface UseVoiceChatbotReturn {
  // Estados
  isListening: boolean;
  isAISpeaking: boolean;
  isVoiceChatConnected: boolean;
  streamingActive: boolean;
  isPlayingStream: boolean;
  bufferSize: number;
  consoleMessages: string[];
  audioQueueLength: number;
  //connectionError: boolean;
  agentChatSettings: AgentChatSetting | null;
  // Funcions
  startConversation: () => Promise<void>;
  stopConversation: () => void;
  setBufferSize: (size: number) => void;
  
  // Estado computado
  status: ChatStatus;
  micIconClass: 'streaming' | 'muted' | 'active' | 'inactive';
}

// Extender Window para SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}