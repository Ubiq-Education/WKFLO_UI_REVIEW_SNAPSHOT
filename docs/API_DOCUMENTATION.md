# Agent Chat API Documentation

This document describes the API endpoints used by the Agent Chat Interface.

## Endpoints

### 1. Send Message

**Endpoint:** `POST /ai/api/v1/tenant/agent/{agentId}/run`

**Request Body:**
```json
{
  "input": "User message content",
  "sessionId": "12345678-1234-4567-8901-123456789abc"
}
```

**Response:** Agent response (format may vary based on implementation)

### 2. Read Messages (Get Chat History)

**Endpoint:** `GET /md/api/v1/tenant/agent/{agentId}/chat/{sessionId}/messages`

**URL Parameters:**
- `agentId` (required): The agent identifier
- `sessionId` (required): The session GUID to retrieve messages for

**Expected Response Format:**
```json
{
  "resultType": 0,
  "data": [
    {
      "id": "user-91852a42-5151-4479-a847-a5b28320b4f2",
      "type": "user",
      "content": "Hi test",
      "timestamp": "2025-11-03T17:11:16.5478028+00:00",
      "contentItems": [
        {
          "name": "Text Content",
          "description": "Hi test",
          "status": "success",
          "statusCode": "200"
        }
      ]
    },
    {
      "id": "assistant-aa4c1bff-abb5-4527-ba19-13d956e41320",
      "type": "assistant",
      "content": "Hey there! 👋\n\nTest received loud and clear! Everything's running smoothly on my end. \n\nI'm all set up and ready to help you with:\n- **Elasticsearch queries** - searching and analyzing your data\n- **Web scraping** - fetching content from websites\n- **Knowledge base access** - including school calendars and other stored information\n\nJust checking in, or is there something specific you'd like to test or explore? I'm here to help! 🚀",
      "timestamp": "2025-11-03T17:11:21.481578+00:00",
      "contentItems": [
        {
          "name": "Text Content",
          "description": "Response description...",
          "status": "success",
          "statusCode": "200"
        }
      ]
    }
  ]
}
```

**Response Field Descriptions:**

- `resultType`: Integer indicating the result type (0 = success)
- `data`: Array of message objects
  - `id`: Unique identifier for the message
  - `type`: Message type - either `"user"` or `"assistant"`
  - `content`: The actual message content
  - `timestamp`: ISO 8601 timestamp with timezone
  - `contentItems`: Array of tool execution information (optional)
    - `name`: Name of the tool/function used
    - `description`: Description or content processed
    - `status`: Execution status (e.g., "success")
    - `statusCode`: HTTP-style status code

## Authentication Headers

All API requests include authentication headers based on the security configuration:

### API Key Authentication
```
amais-wkflo-api-key: your-api-key-value
amais-wkflo-tenant-name: your-tenant-name
amais-wkflo-domain: your-tenant.domain.com
```

### Azure AD Authentication
```
Authorization: Bearer {azure-ad-access-token}
```

### Public Access
No additional authentication headers required.

## Message Type Mapping

The chat interface internally maps the API response types to its own format:

| API Response Type | Chat Interface Type |
|------------------|-------------------|
| `"user"`         | `"user"`         |
| `"assistant"`    | `"assistant"`        |

## Error Handling

If the API returns an error or the request fails:
- HTTP 401: Authentication required or invalid credentials
- HTTP 4xx/5xx: API request failed with the corresponding status
- Network errors: Connection or request failures

The chat interface will gracefully handle errors and fall back to showing the default greeting message if message history cannot be loaded.

## Session Management

- Session IDs are generated as UUIDs (GUID format)
- Sessions are stored in browser localStorage with key format: `wkflo-chat-session-{agentId}`
- Sessions persist across page reloads and widget recreations
- Users can reset sessions using the reset button (↻) in the chat header