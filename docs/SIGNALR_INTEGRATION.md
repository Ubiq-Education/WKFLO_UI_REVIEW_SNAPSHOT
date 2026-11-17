# SignalR Integration for Real-Time Chat

This implementation adds SignalR support to the agent chat interface for real-time message updates and tool execution notifications.

## Features

### Real-Time Message Updates
- Messages are received instantly from the server without polling
- Supports user, agent, and tool message types
- Automatic duplicate message handling
- Maintains message order and timestamp accuracy

### Tool Execution Tracking
- Real-time notifications when tools start executing
- Progress updates during tool execution
- Success/failure status updates
- Integration with the workflow visualization

### Connection Management
- Automatic reconnection with exponential backoff
- Visual connection status indicator
- Token-based authentication
- Graceful handling of network interruptions

## Components

### SignalR Service (`shared/services/signalr-service.ts`)
- Singleton service for managing SignalR connections
- Event-driven architecture with type-safe message handling
- Automatic reconnection and error recovery
- Support for joining/leaving specific chat rooms

### React Hook (`shared/hooks/use-chat.ts`)
- React integration for SignalR service
- Automatic connection lifecycle management
- Token-based authentication integration
- Event subscription cleanup

### Updated Chat Component (`shared/components/agent-chat-interface.tsx`)
- Real-time message reception
- Tool execution workflow updates
- Connection status indicator
- Fallback to existing polling when needed

## Usage

The SignalR integration is automatically enabled when:
1. The user is authenticated (has a valid token)
2. A chat session is active
3. The SignalR hub is available on the server

## Server Requirements

The server should implement a SignalR hub with the following methods:

```csharp
public class ChatHub : Hub
{
    public async Task JoinChat(string chatId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, chatId);
    }
    
    public async Task LeaveChat(string chatId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, chatId);
    }
}
```

And should send the following events:

- `ReceiveMessage`: When new messages are available
- `ToolExecutionUpdate`: When tools start/complete/fail
- `ToolApprovalRequest`: When an agent needs approval ("Ask for permission") before calling a tool
  function. The chat renders `shared/components/tool-approval-card.tsx` (Allow once / Allow for
  this conversation / Deny), stops the typing indicator and blocks input until it is answered
  through `POST agent/{shareId}/tool-approval/{approvalId}` (widget) or
  `POST tenant/agent/{agentId}/tool-approval/{approvalId}` (admin test chat), or until it expires
  (`expiresAtUtc`). The request is also persisted as a Forms-channel message
  (`formType: "ToolApproval"`), so history reloads re-render the card.
- `ToolApprovalResolved`: When a pending approval was answered or expired (`decision`:
  `AllowOnce` | `AllowForConversation` | `Deny` | `Expired`)

## Benefits

1. **Improved User Experience**: Instant message delivery without delays
2. **Reduced Server Load**: No more polling requests
3. **Real-Time Tool Feedback**: Users see tool execution progress immediately
4. **Better Performance**: More efficient use of network resources
5. **Scalability**: Better handling of multiple concurrent chat sessions