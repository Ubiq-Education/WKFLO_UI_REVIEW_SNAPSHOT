import { createRoot } from 'react-dom/client';
import { AgentChatInterface, AgentConfig } from '../../shared/components';
import { DataProvider } from "../../shared/provider/data-provider";
import './index.css';

type IsolationStrategy = 'shadow-dom' | 'css-prefix' | 'auto';

// Derives the wkflo_ui origin from the loader <script> tag's own src — used to resolve absolute
// (rather than root-relative) URLs for wkflo_ui-hosted static assets (e.g. image-expired.svg),
// since a root-relative path would otherwise resolve against the embedding host page's own
// origin when the widget is embedded cross-origin (Task 7030).
//
// `resolvedScriptSrc` should be the `.src` *property* (not `getAttribute('src')`) — the browser
// already resolves it to an absolute URL even when the tag's `src` attribute is relative.
//
// Guards against the empty-src case, where an empty attribute resolves `.src` to the current
// document's own URL instead of failing outright: only trusts the resolved origin if it actually
// points at the widget's own bundle file (wkflo-widget.umd.cjs and image-expired.svg are siblings
// under the same wkflo_ui `dist/public/assets/` output, so that file's origin IS wkflo_ui's real
// asset host). Confirmed real-world failure: a misconfigured `AMAIS_WKFLO_WIDGET_CJS_URL` in one
// of PetraCMS's local launch profiles left the embed `<script>` tag with an empty `src=""`,
// which silently resolved `.src` to the embedding page's own origin instead of wkflo_ui's —
// producing a plausible-looking but wrong `baseUrl` rather than an obviously-broken one. Falling
// back to `''` here just means asset URLs degrade to relative (the pre-Task-7030-fix behavior),
// which is safe; it doesn't fix a genuinely misconfigured embed — that's a PetraCMS-side config
// gap to fix separately.
export function deriveWidgetBaseUrl(scriptSrcAttr: string | null, resolvedScriptSrc: string): string {
  if (!scriptSrcAttr) return '';
  try {
    const resolved = new URL(resolvedScriptSrc);
    if (!resolved.pathname.includes('wkflo-widget.umd.cjs')) {
      console.warn('WkfloWidget: script src does not point at wkflo-widget.umd.cjs — asset URLs will fall back to relative. Check AMAIS_WKFLO_WIDGET_CJS_URL.');
      return '';
    }
    return resolved.origin;
  } catch {
    return '';
  }
}

class WkfloWidget {
  private root: any = null;
  private container: HTMLElement | null = null;
  private reactContainer: HTMLElement | null = null;
  private isOpen = false;
  private isMinimized = false;
  private isolationStrategy: IsolationStrategy;
  private widgetId: string;

  constructor(private config: AgentConfig & { isolation?: IsolationStrategy; startMinimized?: boolean; requireRemoteConfig?: boolean; errorUrl?: string; previewMode?: boolean }, private isWidget: boolean = true) {
    this.widgetId = this.generateUniqueId();
    this.isolationStrategy = this.determineIsolationStrategy();
    this.init();
  }

  private generateUniqueId(): string {
    // Generate a unique ID combining timestamp and random number
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${timestamp}-${random}`;
  }

  private determineIsolationStrategy(): IsolationStrategy {
    // If explicitly specified, use that
    if (this.config.isolation && this.config.isolation !== 'auto') {
      return this.config.isolation;
    }
    
    // Auto-detect based on browser support
    try {
      if (typeof document !== 'undefined') {
        const testDiv = document.createElement('div');
        testDiv.attachShadow({ mode: 'open' });
        return 'shadow-dom';
      }
    } catch (e) {
      // Shadow DOM not supported
    }
    
    return 'css-prefix';
  }

  private init() {
    // Create widget container
    this.container = document.createElement('div');
    this.container.id = this.config.containerId || `wkflo-widget-container-${this.widgetId}`;
    
    if (this.isolationStrategy === 'shadow-dom') {
      

      // Use Shadow DOM for complete CSS isolation
      const shadowRoot = this.container.attachShadow({ mode: 'closed' });
      
      // Create the actual React container inside the shadow DOM
      const reactContainer = document.createElement('div');
      reactContainer.id = `wkflo-react-root-${this.widgetId}`;
      reactContainer.className = 'wkflo-widget-root';
      shadowRoot.appendChild(reactContainer);
      
      // Inject our CSS into the shadow DOM
      this.injectShadowStyles(shadowRoot);
      
      // Store reference to the React container
      this.reactContainer = reactContainer;
    } else {
      // Use CSS prefix strategy
      this.container.className = 'wkflo-widget-root';
      this.reactContainer = this.container;
      
      // Inject CSS into main document for css-prefix strategy
      this.injectMainDocumentStyles();
    }
    
    // Determine target element for appending the container
    let targetElement: HTMLElement = document.body;
    
    if (this.config.targetElement) {
      if (typeof this.config.targetElement === 'string') {
        // If it's a string, treat it as a CSS selector
        const element = document.querySelector(this.config.targetElement);
        if (element instanceof HTMLElement) {
          targetElement = element;
        } else {
          console.warn(`WkfloWidget: Target element "${this.config.targetElement}" not found. Falling back to document.body.`);
        }
      } else if (this.config.targetElement instanceof HTMLElement) {
        // If it's already an HTMLElement, use it directly
        targetElement = this.config.targetElement;
      }
    }
    
    targetElement.appendChild(this.container);
  }

  private injectShadowStyles(shadowRoot: ShadowRoot) {
    // Get CSS content from global variable set by build process
    const cssContent = (window as any).__WKFLO_WIDGET_CSS__ || '';
    
    const style = document.createElement('style');
    // Ensure custom properties are set on the shadow root
    const customPropsCSS = `
      :host, * {
        --tw-space-y-reverse: 0;
        --tw-space-x-reverse: 0;
        --tw-border-style: solid;
        --tw-font-weight: initial;
        --tw-shadow: 0 0 #0000;
        --tw-shadow-color: initial;
        --tw-shadow-alpha: 100%;
        --tw-inset-shadow: 0 0 #0000;
        --tw-inset-shadow-color: initial;
        --tw-inset-shadow-alpha: 100%;
        --tw-ring-color: initial;
        --tw-ring-shadow: 0 0 #0000;
        --tw-inset-ring-color: initial;
        --tw-inset-ring-shadow: 0 0 #0000;
        --tw-ring-inset: initial;
        --tw-ring-offset-width: 0px;
        --tw-ring-offset-color: #fff;
        --tw-ring-offset-shadow: 0 0 #0000;
        --tw-leading: 1.5;
      }
    `;
    style.textContent = customPropsCSS + cssContent;
    shadowRoot.appendChild(style);
  }

  private injectMainDocumentStyles() {
    // Check if styles are already injected
    if (document.getElementById('wkflo-widget-styles')) {
      return;
    }

    // Get CSS content from global variable set by build process
    const cssContent = (window as any).__WKFLO_WIDGET_CSS__ || '';
    
    if (cssContent) {
      const style = document.createElement('style');
      style.id = 'wkflo-widget-styles';
      style.textContent = cssContent;
      document.head.appendChild(style);
    }
  }

  private open() {
    this.isOpen = true;
    this.isMinimized = this.config.startMinimized ?? false;
    this.render();
  }

  private close() {
    this.isOpen = false;
    if (this.root && this.container) {
      this.root.unmount();
      this.root = null;
    }
  }

  private minimize() {
    this.isMinimized = true;
    this.render();
  }

  private handleConfigError(error: unknown) {
    if (!this.config.errorUrl) return;

    const message = error instanceof Error ? error.message : String(error);

    fetch(this.config.errorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).catch(() => {
      // Best-effort error reporting; nothing to do if this itself fails.
    });
  }

  private render() {
    if (!this.reactContainer) return;

    if (!this.root) {
      this.root = createRoot(this.reactContainer);
    }

    const widgetClassName = this.isWidget
      ? [
          !this.config.width  ? 'w-350'    : '',
          !this.config.height ? 'h-chat-lg' : '',
        ].filter(Boolean).join(' ')
      : '';

    // Read-only preview embeds (e.g. the CMS settings live preview) never toggle
    // open/minimized themselves — each instance is pinned to whatever isMinimized/
    // startMinimized it was given. Omitting these callbacks (rather than passing no-ops)
    // matches how AgentChatInterface is already used directly in previewMode elsewhere:
    // undefined onClick handlers make the minimized bubble's click inert.
    const interactionCallbacks = this.config.previewMode
      ? {}
      : {
          onClose: () => this.minimize(),
          onMinimize: () => this.minimize(),
          onMaximize: () => this.maximizeWidget(),
        };

    this.root.render(
      <DataProvider>
        <AgentChatInterface
          agent={this.config}
          isWidget={this.isWidget}
          {...interactionCallbacks}
          isMinimized={this.isMinimized}
          className={widgetClassName}
          requireRemoteConfig={this.config.requireRemoteConfig}
          onConfigError={(error) => this.handleConfigError(error)}
          previewMode={this.config.previewMode}
          // MSAL's loginPopup defaults redirectUri to window.location.href when unset (AuthService).
          // For a third-party-embedded widget that's the customer's own host page — cross-origin
          // from wkflo_ui — which breaks the popup's hash monitoring (COOP + cross-origin
          // window.closed/hash read), producing BrowserAuthError: hash_empty_error (Bug 7147).
          // baseUrl is already derived per-embed from the loader <script> tag's own src (see
          // deriveWidgetBaseUrl above, Task 7030) and is always same-origin with wkflo_ui, so reuse
          // it here instead. If derivation failed (baseUrl === ''), this degrades to the existing
          // window.location.href fallback inside AuthService — an accepted pre-existing behavior,
          // not a regression.
          redirectUri={this.config.baseUrl || undefined}
        />
      </DataProvider>
    );
  }

  // Pushes live (unsaved) config changes into an already-mounted widget instance without
  // recreating it — used by the CMS settings live preview to reflect in-progress edits.
  // A no-op React re-render (createRoot().render() diffs like any other prop update) rather
  // than a remount, so scroll position/local state in the chat window is preserved.
  //
  // Must replace this.config with a NEW object, not mutate it in place: AgentChatInterface
  // derives its own agentConfig via useMemo(() => ({...agent, ...}), [agent, ...]), keyed on
  // the `agent` prop's *reference*. Mutating in place keeps the same reference every render, so
  // that memo would never recompute and every field except ones read directly off `this.config`
  // outside React (nothing does) would appear frozen at whatever it was on first render.
  public updateConfig(partial: Partial<AgentConfig>) {
    this.config = { ...this.config, ...partial };
    this.render();
  }

  // Public methods for testing
  public show() {
    this.open();
  }

  public hide() {
    this.close();
  }

  public minimizeWidget() {
    this.minimize();
  }

  public maximizeWidget() {
    this.isMinimized = false;
    this.render();
  }

  public destroy() {
    this.close();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
      this.reactContainer = null;
    }
  }
}

// Auto-initialization from script tag attributes
// Ensure this only runs once even if script is loaded multiple times
if (typeof window !== 'undefined' && !(window as any).wkfloWidgetInitialized) {
  (window as any).wkfloWidgetInitialized = true;
  
  document.addEventListener('DOMContentLoaded', () => {
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[data-share-id]');

    scripts.forEach((script) => {
      // See deriveWidgetBaseUrl's doc comment above for why `.src` (the property, not
      // getAttribute) is used, and for the empty-src guard (Task 7030).
      const baseUrl = deriveWidgetBaseUrl(script.getAttribute('src'), script.src);
      const shareId = script.getAttribute('data-share-id');
      const tenantGuid = script.getAttribute('data-tenant-guid') || 'DefaultTenant';
      // No hardcoded fallback here: an empty string signals "not explicitly provided",
      // letting AgentChatInterface fall back to the live-fetched WKFlo value first.
      const agentName = script.getAttribute('data-agent-name') || '';
      const agentDescription = script.getAttribute('data-agent-description') || '';
      const headerTitle = script.getAttribute('data-header-title') || '';
      const primaryColor = script.getAttribute('data-primary-color') || '#3b82f6';
      const foregroundColor = script.getAttribute('data-foreground-color') || '#ffffff';
      const bubbleStyle = (script.getAttribute('data-bubble-style') as 'rounded' | 'square' | 'pill') || 'rounded';
      const showDescription = script.getAttribute('data-show-description') !== 'false';
      const chainOfThought = script.getAttribute('data-chain-of-thought') === 'true';
      const isVoiceChatEnabled = script.getAttribute('data-voice-chat-enabled') === 'true';
      const apiEndpoint = script.getAttribute('data-api-endpoint') || '';
      // undefined (not '') when the attribute is absent — lets AgentChatInterface fall back
      // to the live-fetched WKFlo icon. Unlike agentName/headerTitle above, an empty string
      // here is a meaningful, distinct value ("no icon, show the default"), so it must not be
      // used as the "not provided" sentinel — see agent-chat-interface.tsx's agentConfig useMemo.
      const bubbleIconPath = script.getAttribute('data-bubble-icon-path') || undefined;
      const chatbotIconPath = script.getAttribute('data-chatbot-icon-path') || undefined;
      const cssUrl = script.getAttribute('data-css-url') || '';
      const welcomeMessage = script.getAttribute('data-welcome-message') || '';
      const footerMessage = script.getAttribute('data-footer-message') || '';
      // JSON array of { title, prompt }, e.g. data-predefined-prompts='[{"title":"Hours","prompt":"What are your hours?"}]'
      let predefinedPrompts: AgentConfig["predefinedPrompts"] = [];
      const predefinedPromptsAttr = script.getAttribute('data-predefined-prompts');
      if (predefinedPromptsAttr) {
        try {
          const parsed = JSON.parse(predefinedPromptsAttr);
          if (Array.isArray(parsed)) {
            predefinedPrompts = parsed;
          }
        } catch (e) {
          console.warn('WkfloWidget: invalid data-predefined-prompts JSON, ignoring.', e);
        }
      }
      const chatWidth = (script.getAttribute('data-chat-width') as AgentConfig["chatWidth"]) || undefined;
      const containerId = script.getAttribute('data-container-id') || undefined;
      const targetElement = script.getAttribute('data-target-element') || undefined;
      const isolation = script.getAttribute('data-isolation') as IsolationStrategy || 'auto';
      const startMinimized = script.getAttribute('data-start-minimized') !== 'false';
      const width = script.getAttribute('data-width') || undefined;
      const height = script.getAttribute('data-height') || undefined;
      const floatingPosition = (script.getAttribute('data-floating-position') as 'left' | 'right') || 'right';
      const launcherStyle = (script.getAttribute('data-launcher-style') as 'circle' | 'pill') || 'circle';
      const launcherText = script.getAttribute('data-launcher-text') || '';
      const requireRemoteConfig = script.getAttribute('data-require-remote-config') === 'true';
      const errorUrl = script.getAttribute('data-error-url') || '/CHAT/Widget/error';
      // Internal test/preview embeds (e.g. CMS's "Test Agent" page) render inline and
      // static instead of as a floating, minimizable widget.
      const isWidgetAttr = script.getAttribute('data-is-widget');
      const isWidget = isWidgetAttr !== 'false';
      // CMS's Test Agent tab embed: a real, interactive chat (unlike previewMode, which is
      // read-only) whose backend calls should be tagged so the backend can exclude them from
      // DXP analytics while still showing them in Chat Logs. See AgentConfig.isTestChat.
      const isTestChat = script.getAttribute('data-is-test-chat') === 'true';
      // The school's IANA/Windows timezone ID, resolved host-side (CMS's branch Settings)
      // and rendered onto the embed script tag — deliberately NOT read from the visitor's
      // own browser (Intl.DateTimeFormat), which would give the site visitor's device
      // timezone instead of the school's, producing wrong "this week"/"last month" bounds
      // for out-of-town/prospective families. See AgentConfig.timeZone.
      const timeZone = script.getAttribute('data-timezone') || undefined;

      // Extract security configuration
      const securityType = script.getAttribute('data-security-type') as 'none' | 'azure-ad' | 'api-key' | 'jwt-token-callback' | null;
      let security = { type: '', azureAd: undefined, apiKey: undefined, jwt: undefined } as any;
      
      if (securityType === 'azure-ad') {
        const clientId = script.getAttribute('data-azure-client-id') || '';
        const tenantId = script.getAttribute('data-azure-tenant-id') || '';
        const scopes = script.getAttribute('data-azure-scopes')?.split(',').map(s => s.trim()).filter(Boolean) || [];
        
        security = {
          type: 'azure-ad' as const,
          azureAd: {
            clientId,
            tenantId,
            scopes
          }
        };
      } else if (securityType === 'api-key') {
        const value = script.getAttribute('data-api-key-value') || '';
        const tenantName = script.getAttribute('data-api-key-tenant-name') || '';
        
        security = {
          type: 'api-key' as const,
          apiKey: {
            value,
            tenantName
          }
        };
      } else if (securityType === 'jwt-token-callback') {
        const domain = script.getAttribute('data-jwt-token-callback-domain') || '';
        
        security = {
          type: 'jwt-token-callback' as const,
          jwt: {
            domains: [domain]
          }
        };
      } else if (securityType === 'none'){
        security = { type: 'none' as const };
      }
      
      if (shareId) {
        const widget = new WkfloWidget({
          tenantGuid,
          shareId,
          agentName,
          agentDescription,
          headerTitle,
          primaryColor,
          foregroundColor,
          bubbleStyle,
          showDescription,
          chainOfThought,
          isVoiceChatEnabled,
          apiEndpoint,
          bubbleIconPath,
          chatbotIconPath,
          cssUrl,
          welcomeMessage,
          footerMessage,
          predefinedPrompts,
          chatWidth,
          containerId,
          targetElement,
          securityConfiguration: security,
          isolation,
          startMinimized,
          width,
          height,
          floatingPosition,
          launcherStyle,
          launcherText,
          requireRemoteConfig,
          errorUrl,
          baseUrl,
          isTestChat,
          timeZone,
        }, isWidget);
        widget.show();
      }
    });
  });
}

export { WkfloWidget };

// Make WkfloWidget available globally for UMD builds
if (typeof window !== 'undefined') {
  (window as any).WkfloWidget = WkfloWidget;
}