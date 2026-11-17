export { AgentChatInterface } from './agent-chat-interface';
export { ChatHeader } from './chat-header';
export { ChatMessages } from './chat-messages';
export { ChatInput } from './chat-input';
export type { AgentConfig, SecurityConfig } from './agent-chat-interface';
export type { ChatMessage } from '../services/chat-service';

// Export shared message context
export { ChatMessagesProvider, useChatMessages } from '../provider/chat-messages-provider';
export type { SharedChatMessage } from '../provider/chat-messages-provider';