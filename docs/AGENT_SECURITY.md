# Agent Chat Interface Security Configuration

The `AgentChatInterface` component now supports four different security configurations for API endpoints:

## 1. Public Access (No Authentication)

For publicly accessible agents that don't require authentication:

```typescript
import { AgentConfig } from '../shared/components';

const publicAgent: AgentConfig = {
  id: 'public-agent',
  name: 'Public Assistant',
  description: 'A publicly accessible AI assistant',
  primaryColor: '#3b82f6',
  bubbleStyle: 'rounded',
  showDescription: true,
  apiEndpoint: 'https://your-api.com/public/agent',
  security: {
    type: 'none'
  }
};
```

## 2. API Key Authentication

For secure endpoints that require API key authentication with tenant information:

```typescript
const apiKeyAgent: AgentConfig = {
  id: 'secure-agent',
  name: 'Enterprise Agent',
  description: 'A secure enterprise AI assistant',
  primaryColor: '#10b981',
  bubbleStyle: 'rounded',
  showDescription: true,
  apiEndpoint: 'https://your-api.com/secure/agent',
  security: {
    type: 'api-key',
    apiKey: {
      value: 'your-api-key-here',
      tenantName: 'your-tenant-name'
    }
  }
};
```

### API Key Headers

When using API key authentication, the following headers will be sent with requests:

- `amais-wkflo-api-key: <api-key-value>`
- `amais-wkflo-tenant-name: <tenant-name>`
- `amais-wkflo-domain: <tenant-domain>`

## 3. Azure AD Authentication

For endpoints that require Azure Active Directory authentication:

```typescript
const azureAdAgent: AgentConfig = {
  id: 'azure-agent',
  name: 'Azure AD Agent',
  description: 'An Azure AD authenticated AI assistant',
  primaryColor: '#f59e0b',
  bubbleStyle: 'rounded',
  showDescription: true,
  apiEndpoint: 'https://your-api.com/azure/agent',
  security: {
    type: 'azure-ad',
    azureAd: {
      clientId: 'your-azure-client-id',
      tenantId: 'your-azure-tenant-id',
      scopes: ['openid', 'profile', 'api://your-api/access']
    }
  }
};
```

### Azure AD Features

- **Interactive Login**: Users can click the login button to authenticate
- **Silent Token Renewal**: Automatically renews tokens when possible
- **User Display**: Shows authenticated user's name in the header
- **Logout**: Users can logout using the logout button
- **Error Handling**: Displays authentication errors with retry options

### Azure AD Headers

When using Azure AD authentication, the following header will be sent:

- `Authorization: Bearer <access-token>`

## 4. JWT Token Callback Authentication

For endpoints that use JWT token callback authentication with domain validation:

```typescript
const jwtCallbackAgent: AgentConfig = {
  id: 'jwt-agent',
  name: 'JWT Callback Agent',
  description: 'An agent using JWT token callback authentication',
  primaryColor: '#8b5cf6',
  bubbleStyle: 'rounded',
  showDescription: true,
  apiEndpoint: 'https://your-api.com/jwt/agent',
  security: {
    type: 'jwt-token-callback',
    jwt: {
      domains: ['example.com', 'app.example.com', 'secure.example.com']
    }
  }
};
```

### JWT Token Callback Features

- **Domain Validation**: Restricts authentication to specified domains
- **Token Callback**: Handles JWT tokens via callback mechanisms
- **Secure Headers**: Sends domain validation headers with requests
- **Flexible Configuration**: Supports multiple allowed domains

### JWT Token Callback Headers

When using JWT token callback authentication, the following headers will be sent:

- `amais-wkflo-jwt-domains: <comma-separated-domains>`
- `amais-wkflo-domain: <current-domain>`

## Environment Variable Configuration

You can also create agent configurations from environment variables:

```typescript
import { createAgentConfigFromEnv } from '../shared/config/agent-configs';

// Create different security configurations
const publicAgent = createAgentConfigFromEnv('agent-1', 'none');
const apiKeyAgent = createAgentConfigFromEnv('agent-2', 'api-key');
const azureAdAgent = createAgentConfigFromEnv('agent-3', 'azure-ad');
const jwtCallbackAgent = createAgentConfigFromEnv('agent-4', 'jwt-token-callback');
```

### Required Environment Variables

#### For all configurations:
- `VITE_AGENT_NAME` - Agent display name
- `VITE_AGENT_DESCRIPTION` - Agent description (optional)
- `VITE_AGENT_COLOR` - Primary color (default: #3b82f6)
- `VITE_AGENT_BUBBLE_STYLE` - Bubble style: rounded, square, pill
- `VITE_AGENT_API_ENDPOINT` - API endpoint URL

#### For API Key authentication:
- `VITE_API_KEY` - API key value
- `VITE_TENANT_NAME` - Tenant name (optional, can be injected via WAF headers)

#### For Azure AD authentication:
- `VITE_ENTRA_CLIENT_ID` - Azure AD application client ID
- `VITE_ENTRA_TENANT_ID` - Azure AD tenant ID
- `VITE_ENTRA_SCOPE` - Comma-separated scopes

#### For JWT Token Callback authentication:
- `VITE_JWT_DOMAINS` - Comma-separated list of allowed domains

## WAF (Web Application Firewall) Integration

The application is designed to work with WAF header injection for tenant identification. The tenant name can be injected by the WAF using any of these header names:

- `x-tenant-name`
- `X-Tenant-Name` 
- `amais-wkflo-tenant-name`
- `AMAIS-WKFLO-TENANT-NAME`

### Tenant Initialization Priority

The application follows this priority order for tenant initialization:

1. **Page Meta Tags**: `<meta name="tenant-name" content="YourTenant">`
2. **Window Global**: `window.TENANT_NAME = "YourTenant"`
3. **WAF Headers**: Via `/api/tenant-info` endpoint that returns WAF headers
4. **Environment Variable**: `VITE_TENANT_NAME` (for development)
5. **Default Fallback**: "Ubiq"

### Server-Side Tenant Injection

If your server renders the tenant name into the HTML page, you can add it as a meta tag:

```html
<head>
  <meta name="tenant-name" content="YourTenant">
  <!-- other meta tags -->
</head>
```

Or inject it as a global variable:

```html
<script>
  window.TENANT_NAME = "YourTenant";
</script>
```

## Usage Examples

### Widget Implementation

```typescript
import { AgentChatInterface } from '../shared/components';

function ChatWidget() {
  return (
    <AgentChatInterface
      agent={azureAdAgent}
      isWidget={true}
      onClose={() => console.log('Widget closed')}
      onMinimize={() => console.log('Widget minimized')}
    />
  );
}
```

### Full Page Implementation

```typescript
function ChatPage() {
  return (
    <div className="container mx-auto p-4">
      <AgentChatInterface agent={publicAgent} />
    </div>
  );
}
```

## API Endpoint Requirements

Your API endpoints should handle the authentication headers appropriately:

### Public Endpoints
No special handling required.

### API Key Endpoints
Validate the `amais-wkflo-api-key` header and tenant information:

```javascript
app.post('/secure/agent', (req, res) => {
  const apiKey = req.headers['amais-wkflo-api-key'];
  const tenantName = req.headers['amais-wkflo-tenant-name'];
  const tenantDomain = req.headers['amais-wkflo-domain'];
  
  // Validate API key and tenant information
  // Process request
});
```

### Azure AD Endpoints
Validate the JWT token:

```javascript
app.post('/azure/agent', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  // Validate JWT token with Microsoft Graph
  // Process request
});
```

### JWT Token Callback Endpoints
Validate domain permissions and handle JWT callback:

```javascript
app.post('/jwt/agent', (req, res) => {
  const allowedDomains = req.headers['amais-wkflo-jwt-domains']?.split(',') || [];
  const currentDomain = req.headers['amais-wkflo-domain'];
  
  // Validate domain is in allowed list
  if (!allowedDomains.includes(currentDomain)) {
    return res.status(403).json({ error: 'Domain not authorized' });
  }
  
  // Handle JWT token callback logic
  // Process request
});
```

## Error Handling

The component automatically handles authentication errors:

- **Login Required**: Shows login button for Azure AD
- **Invalid Credentials**: Displays error message with retry option
- **Network Errors**: Shows generic error message
- **Token Expiry**: Automatically attempts token renewal

## Dependencies

Make sure to install the required dependency:

```bash
npm install @azure/msal-browser
```

This is only required if you plan to use Azure AD authentication.