# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start Vite dev server (dev mode: port 443 + HTTPS via gitignored .pem files; other modes: port 80)

# Build
npm run build            # Production build
npm run build:local      # Local environment build
npm run build:staging    # Staging environment build

# Tests
npm test                 # Vitest in watch mode
npm run test:run         # Run tests once (CI mode)
npm run test:coverage    # Generate coverage report
npm run test:ui          # Vitest with browser UI

# End-to-end tests (Playwright, mocked backend, see README)
npm run e2e             # Run the e2e suite headless (e2e build on :5174, widget dev server on :5175)
npm run e2e:build       # Build the e2e bundle to dist-e2e/ (the e2e web server does this itself)
npm run e2e:ui          # Playwright UI mode
npm run e2e:report      # Open the last HTML report
npm run e2e:typecheck    # Type-check e2e/
```

## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse,
/qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro,
/investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard,
/unfreeze, /gstack-upgrade.


## Architecture Overview

This is a **multi-tenant AI agent platform** — a React/TypeScript SPA where users create, configure, and chat with AI agents. It supports real-time streaming via SignalR, enterprise SSO via Azure MSAL, and embeds into external sites via a separate widget build.

### Key Frameworks
- **Routing**: Wouter (not React Router)
- **Server state**: TanStack React Query v5
- **Real-time**: Microsoft SignalR (WebSocket)
- **Auth**: Azure MSAL (Microsoft Entra ID)
- **UI**: Radix UI primitives + Tailwind CSS v4
- **Forms**: React Hook Form + Zod
- **Build**: Vite 5

### Directory Layout

```
client/src/          # Main React app (alias: @/*)
shared/              # Shared code between main app and widget (alias: @shared/*)
chat-widget/         # Separate embeddable widget with own Vite build
docs/                # Architecture/integration documentation
```

`shared/` is the most important directory — it contains the chat engine, SignalR integration, data providers, and reusable components consumed by both the main app and the widget.

### Path Aliases
- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

### Authentication & Tenant Flow
1. Azure MSAL wraps the app in `main.tsx` → `MsalProvider`
2. `ProtectedRoute` (in `client/src/components/security/`) checks `accounts.length`
3. On auth, `TenantConfig` singleton (`shared/lib/tenant-config.ts` or similar) is initialized
4. All API requests inject `amais-wkflo-tenant-guid` header via `getTenantHeaders()`
5. Bearer token from MSAL injected as `Authorization` header

### Real-Time Chat Architecture
1. User sends message → `POST /ai/api/v1/tenant/agent/{agentId}/run`
2. A `sessionId` (GUID) is created per conversation
3. `SignalRService` (singleton in `shared/services/signalr-service.ts`) listens on WebSocket hub
4. Events: `MessageUpdate`, `ToolExecutionUpdate`, `StreamingTokenUpdate`, `ConversationStateUpdate`, `TypingIndicatorUpdate`
5. `useChat()` hook (`shared/hooks/use-chat.ts`) wires SignalR events into React state; returns `isAgentTyping` (owned by the hook, not components)
6. SignalR reconnects with exponential backoff; forced reconnect check every 45 seconds
7. **Critical**: all callbacks passed to `useChat()` options (`onMessage`, `onConnectionChange`, etc.) must be wrapped in `useCallback` — they are in the subscription `useEffect` dep array, so inline lambdas cause the effect to re-subscribe on every render

### State Management
- **Global client state**: React Context via `DataProvider` (`shared/provider/data-provider.ts`) and `ChatMessagesProvider`
- **Server state**: TanStack React Query — queries use `getQueryFn()` factory and `apiRequest()` helper
- **Local state**: `useState` within components; workflows persist to `localStorage`

### API Call Patterns
- **URL prefixes**: all Management Domain endpoints use `/md/api/v1/...`; AI/runtime endpoints use `/ai/api/v1/...`. Using the wrong prefix causes CORS errors. Backend docs may omit the gateway prefix — always add it.
- **`getQueryFn` (default queryFn)**: uses `queryKey[0]` as the URL path (prepends `VITE_API_URL`), `queryKey[1]` as the Bearer token, and automatically unwraps `response.data` — type your query generics as the inner data type, not the full wrapper `{ data, resultType }`. Embed query params directly in the `queryKey[0]` URL string (e.g. `/md/api/v1/.../summary?dateRange=${range}`).
- **`apiRequest()`**: for mutations (POST/PUT/DELETE). Only injects `Authorization` header when a `data` argument is provided.

### Message Channel Types
Messages have a `channelMessageType` field: `1` = Normal, `2` = Thinking/reasoning, `3` = Metadata, `4` = Forms (generic card payloads — see `shared/utils/hydrate-forms-metadata.ts`)

### Chat Service Factory
`shared/services/chat-service.factory.ts` creates AI provider-specific services (OpenAI, Azure OpenAI, Anthropic, Google, Cohere) based on agent configuration.

### Shared Schema
`shared/schema.ts` contains the plain TypeScript types for API entities (Agent, Tool, Secret, Tag, ...). Form validation schemas (Zod) live in `client/src/lib/entity-form-schemas.ts` and next to the forms.

### Environment Variables (VITE_ prefix)
```
VITE_API_URL            # Backend API base URL
VITE_ENTRA_CLIENT_ID    # Azure AD application client ID
VITE_ENTRA_TENANT_ID    # Azure AD tenant ID
VITE_MSAL_REDIRECT_URI  # Post-login redirect URI
VITE_ENTRA_SCOPE        # API scope for token acquisition
```

### Testing
- Vitest with JSDOM environment; setup at `client/src/test-setup.ts`
- Uses Testing Library for component tests
- Playwright e2e in `e2e/` (specs in `e2e/tests`), run with `npm run e2e`. MSAL is faked by swapping `client/src/authConfig.ts` in `e2e/vite.e2e.config.ts`, and the API is mocked with `page.route()` (`e2e/support/mock-api.ts`). Unmocked API calls and console errors fail tests. Import `test` from `e2e/support/test`. Vitest excludes `e2e/**`.

### Deployment
- Docker multi-stage: Node.js builds → Nginx serves `dist/public/` on port 80
- Separate `chat-widget/` builds an embeddable widget library via `vite.widget.config.ts`

### Key Documentation in `/docs`
- `API_DOCUMENTATION.md` — REST API endpoint contracts
- `SIGNALR_INTEGRATION.md` — SignalR hub events and reconnection
- `THINKING_MESSAGES.md` — How AI reasoning/thinking messages are handled
- `CSS_ISOLATION_SOLUTIONS.md` — Style scoping for the embeddable widget
- `AGENT_SECURITY.md` — Security patterns

