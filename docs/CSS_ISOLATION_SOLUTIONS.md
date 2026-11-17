# CSS Isolation Solutions for Widget Embedding

When embedding our chat widget as a UMD bundle in third-party websites, CSS conflicts can occur where:
1. The host site's CSS affects our widget's appearance
2. Our widget's CSS affects the host site's styling

This document outlines the unified solution that automatically handles CSS isolation.

## Unified Widget Implementation

**File**: `chat-widget/src/widget.tsx`

The widget now supports multiple isolation strategies in a single class, automatically detecting the best approach based on browser capabilities and user configuration.

### Supported Isolation Strategies:

#### 1. Shadow DOM (Default for modern browsers)
- Complete CSS isolation using Web Components standard
- Automatically selected when browser supports Shadow DOM
- No style interference in either direction

#### 2. CSS Prefix Strategy (Fallback)
- Uses scoped CSS classes under `.wkflo-widget-root`
- Automatically selected for older browsers
- Manual scoping prevents most style conflicts

#### 3. Auto-detection (Recommended)
- Automatically chooses the best strategy based on browser support
- Falls back gracefully for older browsers
- No configuration required

## Configuration Options

### Via Script Attributes:
```html
<!-- Auto-detect (recommended) -->
<script src="wkflo-widget.umd.cjs" 
        data-share-id="abc123" 
        data-agent-name="Support Bot"
        data-isolation="auto"></script>

<!-- Force Shadow DOM -->
<script src="wkflo-widget.umd.cjs" 
        data-share-id="abc123" 
        data-agent-name="Support Bot"
        data-isolation="shadow-dom"></script>

<!-- Force CSS prefix -->
<script src="wkflo-widget.umd.cjs" 
        data-share-id="abc123" 
        data-agent-name="Support Bot"
        data-isolation="css-prefix"></script>
```

### Via JavaScript API:
```javascript
const widget = new WkfloWidget({
  shareId: 'abc123',
  name: 'Support Bot',
  isolation: 'auto' // or 'shadow-dom' or 'css-prefix'
});
```

## Browser Support Matrix

| Strategy | Chrome | Firefox | Safari | Edge | IE |
|----------|--------|---------|--------|------|----| 
| Shadow DOM | 53+ | 63+ | 10.1+ | 79+ | ❌ |
| CSS Prefix | ✅ | ✅ | ✅ | ✅ | 11+ |
| Auto-detect | ✅ | ✅ | ✅ | ✅ | 11+ |

## Implementation Details

### Isolation Strategy Detection:
```typescript
private determineIsolationStrategy(): IsolationStrategy {
  // User preference takes priority
  if (this.config.isolation && this.config.isolation !== 'auto') {
    return this.config.isolation;
  }
  
  // Test Shadow DOM support
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
```

### Conditional Rendering:
```typescript
private init() {
  this.container = document.createElement('div');
  
  if (this.isolationStrategy === 'shadow-dom') {
    // Create Shadow DOM and inject styles
    const shadowRoot = this.container.attachShadow({ mode: 'closed' });
    this.reactContainer = document.createElement('div');
    shadowRoot.appendChild(this.reactContainer);
    this.injectShadowStyles(shadowRoot);
  } else {
    // Use CSS prefix strategy
    this.container.className = 'wkflo-widget-root';
    this.reactContainer = this.container;
  }
}
```

## Advantages of Unified Approach

1. **Single Code Path**: One widget class handles all scenarios
2. **Automatic Optimization**: Always uses the best available isolation method
3. **Graceful Degradation**: Works across all browser versions
4. **Simple Configuration**: Minimal setup required
5. **Future Proof**: Easy to add new isolation strategies

## Testing Considerations

1. Test auto-detection in various browsers
2. Verify fallback behavior in older browsers  
3. Validate style isolation in both strategies
4. Check performance impact of detection logic
5. Ensure no style leakage in either direction

This unified approach eliminates the need for multiple widget classes while providing robust CSS isolation across all supported environments.