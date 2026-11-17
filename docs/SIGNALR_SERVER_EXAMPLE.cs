// Example C# SignalR Hub implementation for reference
// This file is for documentation purposes only

using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;

namespace WkfloServer.Hubs
{
    [Authorize] // Ensure only authenticated users can connect
    public class ChatHub : Hub
    {
        public async Task JoinChat(string chatId)
        {
            // Add the connection to the chat room
            await Groups.AddToGroupAsync(Context.ConnectionId, chatId);
            
            // Optional: Log the join event
            Console.WriteLine($"User {Context.UserIdentifier} joined chat {chatId}");
        }

        public async Task LeaveChat(string chatId)
        {
            // Remove the connection from the chat room
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, chatId);
            
            // Optional: Log the leave event
            Console.WriteLine($"User {Context.UserIdentifier} left chat {chatId}");
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Handle cleanup when user disconnects
            Console.WriteLine($"User {Context.UserIdentifier} disconnected: {exception?.Message}");
            await base.OnDisconnectedAsync(exception);
        }
    }

    // Example service for sending messages to chat rooms
    public class ChatNotificationService
    {
        private readonly IHubContext<ChatHub> _hubContext;

        public ChatNotificationService(IHubContext<ChatHub> hubContext)
        {
            _hubContext = hubContext;
        }

        public async Task SendMessageToChat(string chatId, object message)
        {
            await _hubContext.Clients.Group(chatId).SendAsync("ReceiveMessage", new
            {
                chatId = chatId,
                message = message
            });
        }

        public async Task SendToolExecutionUpdate(string chatId, string toolName, string status, string? description = null, int? statusCode = null, string? error = null)
        {
            await _hubContext.Clients.Group(chatId).SendAsync("ToolExecutionUpdate", new
            {
                chatId = chatId,
                toolName = toolName,
                status = status,
                description = description,
                statusCode = statusCode,
                error = error
            });
        }
    }
}

/* 
To register the hub in Program.cs or Startup.cs:

app.MapHub<ChatHub>("/chathub");

And inject the ChatNotificationService where you need to send real-time updates:

public class AgentService
{
    private readonly ChatNotificationService _chatNotificationService;

    public AgentService(ChatNotificationService chatNotificationService)
    {
        _chatNotificationService = chatNotificationService;
    }

    public async Task ProcessAgentMessage(string chatId, string userMessage)
    {
        // When a tool starts executing
        await _chatNotificationService.SendToolExecutionUpdate(
            chatId, 
            "ProfileSearch", 
            "started", 
            "Searching for user profile information..."
        );

        // Process the tool...

        // When tool completes
        await _chatNotificationService.SendToolExecutionUpdate(
            chatId, 
            "ProfileSearch", 
            "completed", 
            "Successfully retrieved profile information",
            200
        );

        // Send the final message
        await _chatNotificationService.SendMessageToChat(chatId, new
        {
            id = Guid.NewGuid().ToString(),
            type = "assistant",
            content = "Here's the information I found...",
            timestamp = DateTime.UtcNow,
            contentItems = new[]
            {
                new
                {
                    name = "ProfileSearch",
                    status = "success",
                    statusCode = 200
                }
            }
        });
    }
}
*/