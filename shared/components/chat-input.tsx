import React, { useRef, useState, useMemo, useEffect, useId } from 'react';
import { Send, ArrowUp, Paperclip, Plus, BookOpen, Mic, MicOff, CircleStop, X } from 'lucide-react';
import { useAutosizeTextarea } from '../hooks/use-autosize-textarea';
import { isFocusUnclaimed } from '../utils/focus';
import { AdsClickIcon } from './icons/ads-click-icon';
import { AiSparkleIcon } from './icons/ai-sparkle-icon';
import type { SpinUpAgentTarget } from '../schema';

// Finds an in-progress "@mention" ending at the cursor, e.g. "hey @sup" -> { start: 4, query: "sup" }.
// The "@" must be at the start of the input or preceded by whitespace - otherwise "foo@bar.com" (an
// email address, not a mention) would trigger the picker on every "@" typed anywhere in the text.
function getMentionQuery(value: string, cursor: number): { start: number; query: string } | null {
  const uptoCursor = value.slice(0, cursor);
  const match = /(?<=^|\s)@([^\s@]*)$/.exec(uptoCursor);
  if (!match) return null;
  return { start: match.index, query: match[1] };
}

// The Chat Widget's (isWidget = true) textarea: its own border, sitting above the toolbar.
const WIDGET_TEXTAREA_STYLE: React.CSSProperties = {
  display: 'block', // textarea defaults to inline-block, which leaves ~6px of baseline
                     // whitespace beneath it inside this wrapper — block removes that gap
  width: '100%',
  height: '40px',
  minHeight: '40px',
  maxHeight: '155px',
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '14px',
  lineHeight: '1.5',
  resize: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  outline: 'none'
};

// US 7500 (MAISY design): the Chat UI's (isWidget = false) textarea has no border of its own -
// the composer box around it carries the border.
const CHAT_UI_TEXTAREA_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '40px',
  minHeight: '40px',
  maxHeight: '155px',
  padding: '8px 0',
  border: 'none',
  backgroundColor: 'transparent',
  fontSize: '14px',
  lineHeight: '1.5',
  resize: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  outline: 'none'
};

// 34px round toolbar buttons ("+", mic) in the Chat UI composer.
const CHAT_UI_ICON_BUTTON_SIZE: React.CSSProperties = { width: '34px', height: '34px', padding: '0' };

// CMS brand green, copied from the AMAIS design system tokens (tokens/colors.css) used by the
// MAISY prototype: --cms-soft (tinted background), --cms-ink (icon colour), --cms-strong (border).
const CMS_SOFT = '#e0f5f0';
const CMS_INK = '#00806a';
const CMS_STRONG = '#45b19a';
// The prototype's --ink-900, used for the tooltip.
const TOOLTIP_BACKGROUND = '#14181a';
// Space between the Select feature button and its tooltip, and how long the tooltip stays after
// the pointer leaves both (so it can cross that space, WCAG 1.4.13).
const TOOLTIP_GAP_PX = 8;
const TOOLTIP_CLOSE_DELAY_MS = 120;

const COMPOSER_BORDER = '#d1d5db';
// US 7503: the Chat UI composer border takes the brand green while a feature is being picked or one is attached.
const COMPOSER_BORDER_ACTIVE = CMS_STRONG;
const SEND_DISABLED_BACKGROUND = '#e5e7eb';
const SEND_DISABLED_COLOR = '#9ca3af';

interface FeatureSelectIconButtonProps {
  isActive: boolean;
  disabled: boolean;
  onToggle: () => void;
}

// US 7503 (MAISY design): the Chat UI's (isWidget = false) "Select feature" control - a 34px round
// icon button with a tooltip on hover and keyboard focus: "Select a feature" when idle, "Cancel
// selecting" while selection mode is on; Escape dismisses it (WCAG 1.4.13). While on it also gets a
// brand-green tinted circle, a filled icon and a pulsing green ring (.wkflo-feature-pick-pulse, off
// under reduced motion). Its own component so hover/focus only re-render it.
const FeatureSelectIconButton: React.FC<FeatureSelectIconButtonProps> = ({ isActive, disabled, onToggle }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipId = useId();

  // The tooltip is hoverable (WCAG 1.4.13): it stays open while the pointer is over the button or
  // the tooltip. Leaving either closes it after a short delay, cancelled on re-entering either one.
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };
  const openTooltip = () => {
    cancelClose();
    setShowTooltip(true);
  };
  const closeTooltip = () => {
    cancelClose();
    setShowTooltip(false);
  };
  const closeTooltipSoon = () => {
    cancelClose();
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      setShowTooltip(false);
    }, TOOLTIP_CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);

  // Escape dismisses the tooltip without moving the pointer or focus. It shows again on the next
  // hover or focus. The key is not swallowed: the page may use Escape too.
  useEffect(() => {
    if (!showTooltip) return;
    const hideOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTooltip();
    };
    document.addEventListener('keydown', hideOnEscape);
    return () => document.removeEventListener('keydown', hideOnEscape);
  }, [showTooltip]);

  const backgroundColor = isActive ? CMS_SOFT : (isHovered && !disabled ? '#f3f4f6' : 'transparent');
  // The icon is the control's only visual identifier, so while enabled it keeps at least 3:1 against
  // white (WCAG 1.4.11): #6b7280 idle, #4b5563 hovered. Only the disabled state uses the light grey.
  const color = isActive
    ? CMS_INK
    : disabled
      ? '#9ca3af'
      : isHovered ? '#4b5563' : '#6b7280';

  return (
    <span style={{ position: 'relative', display: 'flex' }}>
      <button
        type="button"
        onClick={onToggle}
        onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from input
        onMouseEnter={() => { setIsHovered(true); openTooltip(); }}
        onMouseLeave={() => { setIsHovered(false); closeTooltipSoon(); }}
        onFocus={openTooltip}
        onBlur={closeTooltip}
        disabled={disabled}
        aria-label="Select feature"
        aria-pressed={isActive}
        aria-describedby={tooltipId}
        data-testid="chat-feature-select-button"
        className={isActive ? 'wkflo-feature-pick-pulse' : undefined}
        style={{
          ...CHAT_UI_ICON_BUTTON_SIZE,
          color,
          backgroundColor,
          borderRadius: '50%',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* The design's icon at 21px, FILL 1 while selecting. */}
        <AdsClickIcon size={21} filled={isActive} />
      </button>
      {/* Always in the DOM so aria-describedby resolves; hidden until hover or focus. */}
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!showTooltip}
        onMouseEnter={openTooltip}
        onMouseLeave={closeTooltipSoon}
        style={{
          position: 'absolute',
          bottom: `calc(100% + ${TOOLTIP_GAP_PX}px)`,
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          backgroundColor: TOOLTIP_BACKGROUND,
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 600,
          padding: '6px 10px',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(20,24,26,.18)',
          zIndex: 6
        }}
      >
        {/* Invisible bridge over the gap down to the button, so the pointer can move onto the
            tooltip without leaving both. */}
        <span
          aria-hidden="true"
          data-testid="chat-feature-select-tooltip-bridge"
          style={{ position: 'absolute', left: 0, right: 0, top: '100%', height: `${TOOLTIP_GAP_PX}px` }}
        />
        {isActive ? 'Cancel selecting' : 'Select a feature'}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `5px solid ${TOOLTIP_BACKGROUND}`
          }}
        />
      </span>
    </span>
  );
};

const FEATURE_SELECTION_MODE_TEXT = 'Click a feature on the page';

// Visually hidden but read by screen readers. Absolutely positioned, so it takes no room (nor a
// gap) in the composer column.
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0
};

interface FeatureSelectionModeBannerProps {
  onCancel: () => void;
  // Where keyboard focus goes after Cancel, since the banner (and Cancel with it) unmounts.
  returnFocusRef: React.RefObject<HTMLTextAreaElement>;
}

// US 7503 (MAISY design): the Chat UI's (isWidget = false) "picking" banner, shown above the
// composer box while selection mode is on. Cancel exits selection mode like clicking the icon again.
// Screen readers get the text from the always-present live region next to it (see ChatInput), so
// the visible text is hidden from them to avoid reading it twice.
const FeatureSelectionModeBanner: React.FC<FeatureSelectionModeBannerProps> = ({ onCancel, returnFocusRef }) => {
  const [isCancelHovered, setIsCancelHovered] = useState(false);

  const handleCancel = (e: React.MouseEvent<HTMLButtonElement>) => {
    const cancelHadFocus = document.activeElement === e.currentTarget;
    onCancel();
    if (cancelHadFocus) returnFocusRef.current?.focus();
  };

  return (
    <div
      data-testid="chat-feature-selection-mode-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 8px 8px 12px',
        borderRadius: '8px',
        backgroundColor: CMS_SOFT,
        color: CMS_INK,
        fontSize: '13px',
        fontWeight: 600
      }}
    >
      <AdsClickIcon size={18} filled />
      <span aria-hidden="true" style={{ flex: 1 }}>{FEATURE_SELECTION_MODE_TEXT}</span>
      <button
        type="button"
        onClick={handleCancel}
        onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from input
        onMouseEnter={() => setIsCancelHovered(true)}
        onMouseLeave={() => setIsCancelHovered(false)}
        style={{
          border: 'none',
          backgroundColor: isCancelHovered ? '#ffffff' : 'transparent',
          fontFamily: 'inherit',
          fontSize: '13px',
          fontWeight: 600,
          color: CMS_INK,
          padding: '4px 10px',
          borderRadius: '999px',
          cursor: 'pointer'
        }}
      >
        Cancel
      </button>
    </div>
  );
};

interface SelectedFeaturePillProps {
  featureName: string;
  featureType: string;
  onRemove: () => void;
  // Where keyboard focus goes after Remove, since the pill (and Remove with it) unmounts.
  returnFocusRef: React.RefObject<HTMLTextAreaElement>;
  // Extra outer spacing for the layout it sits in.
  marginBottom?: string;
}

// Task 7941 (MAISY design): the attached-feature pill. The Chat UI (isWidget = false) shows it at
// the top of the composer box; the Chat Widget directly above its textarea (Task 7943). Shows the
// feature name only; the feature type is in the tooltip and in the Remove button's accessible
// name. Remove dismisses the attached feature.
const SelectedFeaturePill: React.FC<SelectedFeaturePillProps> = ({ featureName, featureType, onRemove, returnFocusRef, marginBottom }) => {
  const [isRemoveHovered, setIsRemoveHovered] = useState(false);

  const handleRemove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const removeHadFocus = document.activeElement === e.currentTarget;
    onRemove();
    if (removeHadFocus) returnFocusRef.current?.focus();
  };

  return (
    <span
      data-testid="chat-selected-feature-pill"
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        padding: '3px 4px 3px 6px',
        borderRadius: '999px',
        backgroundColor: CMS_SOFT,
        color: CMS_INK,
        fontSize: '12px',
        fontWeight: 600,
        marginBottom
      }}
    >
      <AdsClickIcon size={16} />
      <span
        data-testid="chat-selected-feature-pill-name"
        title={`${featureType}: ${featureName}`}
        style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {featureName}
      </span>
      <button
        type="button"
        title="Remove"
        aria-label={`Remove feature ${featureType}: ${featureName}`}
        onClick={handleRemove}
        onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from input
        onMouseEnter={() => setIsRemoveHovered(true)}
        onMouseLeave={() => setIsRemoveHovered(false)}
        style={{
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          width: '18px',
          height: '18px',
          padding: 0,
          border: 'none',
          borderRadius: '999px',
          backgroundColor: isRemoveHovered ? '#ffffff' : 'transparent',
          color: CMS_INK,
          cursor: 'pointer'
        }}
      >
        <X aria-hidden="true" style={{ width: '14px', height: '14px' }} />
      </button>
    </span>
  );
};

interface ChatInputProps {
  inputValue: string;
  isLoading: boolean;
  selectedFiles: (File & { dataUrl?: string })[];
  primaryColor: string;
  foregroundColor?: string;
  // Optional @mention agent picker — only enabled when this is passed (undefined = feature off, matches prior behavior)
  agents?: SpinUpAgentTarget[];
  // Feature-selection mode: lets the user pick an element on the host page to target
  isFeatureSelectionActive?: boolean;
  onToggleFeatureSelection?: () => void;
  // A picked feature is attached to the next message. The Chat UI composer border stays brand
  // green while it is (US 7503). Not used by the Chat Widget.
  hasSelectedFeature?: boolean;
  // Task 7941: the attached feature, shown as a pill at the top of the Chat UI composer box, or
  // directly above the Chat Widget's textarea (Task 7943). The pill renders when all three are passed.
  selectedFeatureName?: string;
  selectedFeatureType?: string;
  onRemoveSelectedFeature?: () => void;
  onInputChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onSendMessage: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  // Voice chatbot integration
  isListening?: boolean;
  isVoiceChatConnected?: boolean;
  isAISpeaking?: boolean;
  streamingActive?: boolean;
  connectionError?: boolean;
  isVoiceChatEnabled?: boolean;
  onStartListening?: () => void;
  onStopListening?: () => void;
  // US 7575: true while a tool-approval card waits for an answer - voice input can't be started
  // (stopping an ongoing one still works). Separate from isLoading, which deliberately doesn't
  // disable the mic.
  isVoiceBlocked?: boolean;
  // US 7500: true while agents are working on the conversation. Send becomes Stop (when onStop is
  // passed), and neither Enter nor the mic starts a new message; typing, "+" and Select feature keep
  // working. Separate from isLoading, which disables the textarea.
  isWorking?: boolean;
  // US 7501: stops every agent working on the conversation.
  onStop?: () => void;
  // US 7500: true for the Chat Widget, which keeps the classic composer (bordered textarea above
  // the toolbar, square Send). false (the Chat UI, e.g. MAISY) renders the MAISY design: one
  // bordered box holding the files, the borderless textarea and the toolbar, with a round Send.
  isWidget?: boolean;
  // The chat's agent display name. The Chat UI (isWidget = false) uses it in its idle placeholder.
  agentName?: string;
  // US 7550 (MAISY): the textarea stays typeable while connectionError is set, so a draft can be
  // written and is kept; sending stays blocked until the connection is back.
  keepDraftWhileOffline?: boolean;
  // US 7550 (MAISY): replaces the placeholder, e.g. the offline text while disconnected.
  placeholderOverride?: string;
  // US 7506 (MAISY): put keyboard focus in the textarea once it mounts (a conversation opened from
  // the list) - as soon as it can take it, unless the user has put focus elsewhere first.
  focusOnMount?: boolean;
}

export const ChatInput = React.memo<ChatInputProps>(({
  inputValue,
  isLoading,
  selectedFiles,
  primaryColor,
  foregroundColor = '#ffffff',
  agents,
  isFeatureSelectionActive = false,
  onToggleFeatureSelection,
  hasSelectedFeature = false,
  selectedFeatureName,
  selectedFeatureType,
  onRemoveSelectedFeature,
  onInputChange,
  onKeyPress,
  onSendMessage,
  onFileSelect,
  onRemoveFile,
  isListening = false,
  isVoiceChatConnected = false,
  isAISpeaking = false,
  streamingActive = false,
  connectionError = false,
  isVoiceChatEnabled = true,
  onStartListening,
  onStopListening,
  isVoiceBlocked = false,
  isWorking = false,
  onStop,
  isWidget = false,
  agentName,
  keepDraftWhileOffline = false,
  placeholderOverride,
  focusOnMount = false
}) => {
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);

  useAutosizeTextarea(inputRef, inputValue, { minHeight: 40, maxHeight: 155 });

  // US 7501: Send and Stop swap places, so the button just pressed goes away. Keep keyboard focus in
  // the textarea instead of letting it fall to <body>: move it there once the textarea can take it
  // (it is disabled while a send is in flight), unless the user has moved focus somewhere else.
  const focusInputAfterRef = useRef<HTMLElement | null>(null);
  const keepFocusInInput = (pressedButton: HTMLElement) => {
    if (document.activeElement === pressedButton) {
      focusInputAfterRef.current = pressedButton;
    }
  };
  useEffect(() => {
    const pressedButton = focusInputAfterRef.current;
    const input = inputRef.current;
    if (!pressedButton || !input || input.disabled) return;
    focusInputAfterRef.current = null;
    const active = document.activeElement;
    if (!active || active === document.body || active === pressedButton || !active.isConnected) {
      input.focus();
    }
  });

  // US 7506: see focusOnMount. The textarea is disabled while the conversation's history loads,
  // so this waits until it is enabled.
  const pendingMountFocusRef = useRef(focusOnMount);
  useEffect(() => {
    const input = inputRef.current;
    if (!pendingMountFocusRef.current || !input || input.disabled) return;
    pendingMountFocusRef.current = false;
    if (isFocusUnclaimed()) input.focus({ preventScroll: true });
  });

  const mentionsEnabled = agents !== undefined;

  const filteredMentionAgents = useMemo(() => {
    if (mentionQuery === null || !agents) return [];
    const q = mentionQuery.toLowerCase();
    return agents.filter(agent => agent.name.toLowerCase().includes(q)).slice(0, 8);
  }, [agents, mentionQuery]);

  const selectMentionAgent = (agentName: string) => {
    if (mentionStart === null) return;
    const cursor = inputRef.current?.selectionStart ?? inputValue.length;
    const newValue = `${inputValue.slice(0, mentionStart)}@${agentName} ${inputValue.slice(cursor)}`;
    onInputChange(newValue);
    setMentionQuery(null);
    setMentionStart(null);
    const newCursor = mentionStart + agentName.length + 2; // '@' + name + trailing space
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCursor, newCursor);
    });
  };

  // US 7500 (MAISY design): the Chat UI's idle text names the agent, and mentions @ only when there
  // are agents to call. The Chat Widget keeps 'Ready to Chat' / 'Type your message...'.
  const trimmedAgentName = agentName?.trim();
  const chatUiIdleText = !trimmedAgentName
    ? 'Type your message...'
    : (agents?.length ?? 0) > 0
      ? `Ask ${trimmedAgentName}, or type @ to call an agent`
      : `Ask ${trimmedAgentName}`;
  const typeMessageText = isWidget ? 'Type your message...' : chatUiIdleText;
  const readyText = isWidget ? 'Ready to Chat' : chatUiIdleText;

  const getStatusText = () => {
    if (placeholderOverride) return placeholderOverride;
    if (isVoiceBlocked && !(isListening || streamingActive || isAISpeaking)) return 'Answer the permission request above to continue';
    if (!isVoiceChatEnabled || !isVoiceChatConnected) return typeMessageText;
    if (connectionError) return 'Connection Error';
    if (streamingActive) return 'AI Streaming...';
    if (isAISpeaking) return 'AI Speaking...';
    if (isListening) return 'Listening...';
    if (isVoiceChatConnected) return readyText;
    if (!isVoiceChatConnected && !isListening) return 'Connecting...';
    return typeMessageText;
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
      case 'ready': return '#fafafa';
      case 'connecting': return '#fafafa';
      default: return '#fafafa';
    }
  };

  // A new voice message can't be started while an approval waits (US 7575) or agents work (US 7501);
  // stopping an ongoing one still works.
  const isVoiceStartBlocked = (isVoiceBlocked || isWorking) && !(isListening || streamingActive || isAISpeaking);

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
  
  const isVoiceDisabled = isVoiceStartBlocked || !isVoiceChatEnabled || isLoading || !isVoiceChatConnected || connectionError || isAISpeaking || streamingActive;

  // Send needs a connection, no request in flight, and something to send.
  const canSend = !isLoading && !connectionError && (inputValue.trim() !== '' || selectedFiles.length > 0);

  const filePreviews = selectedFiles.length > 0 && (
        <div className={isWidget ? 'mb-2 flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
          {selectedFiles.map((file, index) => (
            <div key={index} className="p-2 rounded-lg border flex items-center gap-2" style={{ backgroundColor: '#f3f4f6' }}>
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
                <span className="text-sm" style={{ color: '#374151' }}>
                  {file.type.startsWith('image/') ? '🖼️' : '📄'} {file.name}
                </span>
                <span className="text-xs" style={{ color: '#9ca3af' }}>({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                onClick={() => {
                  onRemoveFile(index);
                  if (selectedFiles.length === 1 && fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="text-sm hover:opacity-70"
                style={{ color: '#ef4444' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      );

  // Message textarea - auto-grows via useAutosizeTextarea, min 40px / max 155px
  const textareaWithMentions = (
      <div className="relative">
        <textarea
          ref={inputRef}
          value={inputValue}
          rows={1}
          style={isWidget ? WIDGET_TEXTAREA_STYLE : CHAT_UI_TEXTAREA_STYLE}
          onChange={(e) => {
            const value = e.target.value;
            onInputChange(value);
            if (!mentionsEnabled) return;
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
            if (mentionsEnabled && mentionQuery !== null) {
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
          }}
          onKeyPress={(e) => {
            // US 7500: while agents work, Enter doesn't send (Shift+Enter still adds a new line).
            if (isWorking && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              return;
            }
            onKeyPress(e);
          }}
          onBlur={() => {
            setMentionQuery(null);
            setMentionStart(null);
          }}
          placeholder={getStatusText()}
          disabled={isLoading || (connectionError && !keepDraftWhileOffline)}
        />

        {/* @mention agent picker */}
        {mentionsEnabled && mentionQuery !== null && (
          <div
            className="absolute bottom-full left-0 mb-2 min-w-64 max-w-80 bg-white rounded-2xl shadow-lg border border-gray-200 py-1.5 z-50 overflow-y-auto"
            style={{ maxHeight: '224px' }}
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
                  className="px-4 py-2 cursor-pointer flex items-center gap-3"
                  style={{ backgroundColor: index === highlightedMentionIndex ? '#f3f4f6' : 'transparent' }}
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
              <div className="px-4 py-2 text-sm text-gray-400">No agents found</div>
            )}
          </div>
        )}
      </div>
  );

  // Toolbar row: left group (plus + feature control), right group (mic + send, pinned right)
  const toolbar = (
      <div style={{ display: 'flex', alignItems: 'center', gap: isWidget ? '10px' : '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isWidget ? '10px' : '4px' }}>
          <div className="relative">
            <button
              ref={plusButtonRef}
              onClick={toggleOptionsMenu}
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from input
              disabled={isLoading}
              title="More options"
              style={{
                color: '#9ca3af',
                padding: '4px',
                borderRadius: '50%',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...(isWidget ? undefined : CHAT_UI_ICON_BUTTON_SIZE)
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.color = '#4b5563';
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#9ca3af';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Plus className={isWidget ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>

            {/* Options Menu Popup */}
            {showOptionsMenu && (
              <div
                ref={optionsMenuRef}
                className="absolute bottom-full left-0 mb-2 min-w-64 bg-white rounded-2xl shadow-lg border border-gray-200 py-1.5 z-50"
                style={{
                  maxWidth: '320px',
                  position: 'absolute',
                  bottom: '100%',
                  left: '0',
                  marginBottom: '8px',
                  minWidth: '256px',
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  border: '1px solid #e5e7eb',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  zIndex: 50
                }}
              >
                {/* Add photos & documents */}
                <div
                  className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3 group"
                  onClick={() => handleOptionSelect('files')}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div
                    className="flex items-center justify-center w-4 h-4 text-gray-600"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      color: '#4b5563'
                    }}
                  >
                    <Paperclip className="w-3 h-3" style={{ width: '12px', height: '12px' }} />
                  </div>
                  <div
                    className="flex-1 min-w-0"
                    style={{ flex: '1', minWidth: '0' }}
                  >
                    <div
                      className="truncate text-sm text-gray-900"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '14px',
                        color: '#111827'
                      }}
                    >
                      Add photos & documents
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>

          {onToggleFeatureSelection && !isWidget && (
            <FeatureSelectIconButton
              isActive={isFeatureSelectionActive}
              disabled={isLoading}
              onToggle={onToggleFeatureSelection}
            />
          )}

          {/* The Chat Widget keeps the text pill. */}
          {onToggleFeatureSelection && isWidget && (
            <button
              onClick={onToggleFeatureSelection}
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from input
              disabled={isLoading}
              title={isFeatureSelectionActive ? 'Stop selecting' : 'Select a feature on the page'}
              style={{
                height: '32px',
                padding: '0 13px',
                borderRadius: '9px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                border: isFeatureSelectionActive ? '1px solid rgb(62,124,246)' : '1px solid rgb(201,219,251)',
                backgroundColor: isFeatureSelectionActive ? 'rgb(62,124,246)' : 'rgb(234,241,255)',
                color: isFeatureSelectionActive ? 'rgb(255,255,255)' : 'rgb(30,79,191)',
                transition: 'all 0.2s ease'
              }}
            >
              {isFeatureSelectionActive ? 'Click a feature…' : 'Select feature'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isWidget ? '10px' : '4px', marginLeft: 'auto' }}>
          {/* Microphone button - only render when voice chat is enabled */}
          {isVoiceChatEnabled && (
            <button
              onClick={handleMicrophoneClick}
              //disabled={isVoiceDisabled}
              disabled={isVoiceStartBlocked}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              title={getStatusText()}
              style={{
                color: getMicrophoneColor(),
                padding: '4px',
                borderRadius: '50%',
                backgroundColor: getMicrophoneBackground(),
                border: 'none',
                cursor: isVoiceDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: connectionError ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...(isWidget ? undefined : CHAT_UI_ICON_BUTTON_SIZE)
              }}
              onMouseEnter={(e) => {
                if (!isVoiceDisabled) {
                  const currentColor = getMicrophoneColor();
                  const darkerColor = currentColor === '#ef4444' ? '#dc2626' : '#4b5563';
                  e.currentTarget.style.color = darkerColor;
                  e.currentTarget.style.backgroundColor = isListening ? '#fee2e2' : '#f3f4f6';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = getMicrophoneColor();
                e.currentTarget.style.backgroundColor = getMicrophoneBackground();
              }}
            >
              {isListening ? (
                <MicOff className={isWidget ? 'w-4 h-4' : 'w-5 h-5'} />
              ) : (
                <Mic className={isWidget ? 'w-4 h-4' : 'w-5 h-5'} />
              )}
            </button>
          )}

          {isWorking && onStop ? (
            // US 7500: the only stop control, shown instead of Send while agents work. Never
            // disabled: Stop has to work even while the send request is still in flight.
            <button
              type="button"
              onClick={(e) => { keepFocusInInput(e.currentTarget); onStop(); }}
              aria-label="Stop all agents"
              title="Stop"
              data-testid="chat-stop-button"
              style={{
                height: isWidget ? '32px' : '34px',
                padding: '0 14px 0 10px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: '#1f2937',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                cursor: 'pointer'
              }}
            >
              <CircleStop aria-hidden="true" style={{ width: '18px', height: '18px' }} />
              Stop
            </button>
          ) : isWidget ? (
            <button
              onClick={(e) => { keepFocusInInput(e.currentTarget); onSendMessage(); }}
              disabled={!canSend}
              className="px-3 disabled:opacity-50"
              style={{ height: '32px', borderRadius: '9px', border: 'none', backgroundColor: primaryColor, color: foregroundColor, cursor: 'pointer' }}
            >
              <Send className="w-3 h-3" />
            </button>
          ) : (
            // US 7500 (MAISY design): round arrow Send, in the chat's colour only when it can send.
            <button
              type="button"
              onClick={(e) => { keepFocusInInput(e.currentTarget); onSendMessage(); }}
              disabled={!canSend}
              aria-label="Send message"
              title="Send"
              data-testid="chat-send-button"
              style={{
                width: '34px',
                height: '34px',
                flexShrink: 0,
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: canSend ? primaryColor : SEND_DISABLED_BACKGROUND,
                color: canSend ? foregroundColor : SEND_DISABLED_COLOR,
                cursor: canSend ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease'
              }}
            >
              <ArrowUp aria-hidden="true" style={{ width: '18px', height: '18px' }} />
            </button>
          )}
        </div>
      </div>
  );

  return (
    <div className="border-t" style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '14px 18px' }}>
      {isWidget ? (
        <>
          {filePreviews}
          {/* Task 7943: the attached-feature pill, directly above the textarea. The extra 3px on
              top of the 5px column gap matches the 8px the files row leaves above the textarea. */}
          {selectedFeatureName !== undefined && selectedFeatureType !== undefined && onRemoveSelectedFeature && (
            <SelectedFeaturePill
              featureName={selectedFeatureName}
              featureType={selectedFeatureType}
              onRemove={onRemoveSelectedFeature}
              returnFocusRef={inputRef}
              marginBottom="3px"
            />
          )}
          {textareaWithMentions}
          {toolbar}
        </>
      ) : (
        <>
        {/* US 7503: a live region that is always present, so screen readers announce the text when
            selection mode starts (a region added together with its text is often not announced). */}
        {onToggleFeatureSelection && (
          <div role="status" data-testid="chat-feature-selection-mode-status" style={VISUALLY_HIDDEN}>
            {isFeatureSelectionActive ? FEATURE_SELECTION_MODE_TEXT : ''}
          </div>
        )}
        {/* US 7503: the "Click a feature on the page" banner, directly above the composer box. */}
        {isFeatureSelectionActive && onToggleFeatureSelection && (
          <FeatureSelectionModeBanner onCancel={onToggleFeatureSelection} returnFocusRef={inputRef} />
        )}
        {/* US 7500 (MAISY design): one bordered box holding the files, the textarea and the toolbar.
            The border takes the brand green while a feature is being picked or one is attached (US 7503). */}
        <div
          data-testid="chat-composer-box"
          style={{
            border: `1px solid ${isFeatureSelectionActive || hasSelectedFeature ? COMPOSER_BORDER_ACTIVE : COMPOSER_BORDER}`,
            borderRadius: '14px',
            padding: '8px 8px 8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            transition: 'border-color 0.2s ease'
          }}
        >
          {selectedFeatureName !== undefined && selectedFeatureType !== undefined && onRemoveSelectedFeature && (
            <SelectedFeaturePill
              featureName={selectedFeatureName}
              featureType={selectedFeatureType}
              onRemove={onRemoveSelectedFeature}
              returnFocusRef={inputRef}
            />
          )}
          {filePreviews}
          {textareaWithMentions}
          {toolbar}
        </div>
        </>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt,.rtf,.odt"
        multiple
        onChange={(e) => { setShowOptionsMenu(false); onFileSelect(e); }}
        style={{ display: 'none' }}
      />
    </div>
  );
});