import React, { useEffect, useState } from 'react';
import { TextSuggestionUpdate } from '../services/chat-service';
import { FeatureContextService } from '../services/feature-context-service';
import { isTextValidHtml, renderMessageContent } from '../utils/message-content';

// US 6930 (Revision 2): the card carries its own local lifecycle so any of the three actions
// gets a way back — this is a loop, not a one-shot flow:
//   proposed — the initial suggestion, offering Add to top / Add to bottom / Replace all.
//   applied  — shown right after any one of those three is clicked; offers Keep / Undo. Both
//              Keep and Undo loop back to `proposed`, re-showing the original three buttons, so
//              the admin can keep applying further actions to the same suggestion card.
// This mirrors ContactFormCard's pattern of owning its own post-action UI state locally (keyed
// by the message's React `key`, so it survives re-renders of the parent list) rather than
// threading a status field through the shared chat-message store.
type TextSuggestionStatus = 'proposed' | 'applied';

interface TextSuggestionCardProps {
  suggestion: TextSuggestionUpdate;
  // Each returns the featureId the action actually targeted (whatever was selected on the host
  // page at click time — see agent-chat-interface.tsx's handlers), so it can be remembered and
  // handed back to onUndo if the admin clicks Undo instead of Keep.
  onAddToTop: () => string | null;
  onAddToBottom: () => string | null;
  onReplaceAll: () => string | null;
  onKeep: () => void;
  onUndo: (featureId: string | null) => void;
  // Threaded through from chat-messages.tsx so HTML suggestions containing protected asset
  // images (e.g. /api/v1/asset/{guid}) can fetch them with a bearer token, same as any other
  // message content (Task 7087).
  getAuthHeaders?: () => Promise<Record<string, string>>;
  // Placeholder for broken/expired <img>s in the suggestion, resolved by chat-messages.tsx
  // against agent.baseUrl (Bug 7872).
  imageFallbackSrc?: string;
}

export const TextSuggestionCard: React.FC<TextSuggestionCardProps> = ({
  suggestion,
  onAddToTop,
  onAddToBottom,
  onReplaceAll,
  onKeep,
  onUndo,
  getAuthHeaders,
  imageFallbackSrc,
}) => {
  const [status, setStatus] = useState<TextSuggestionStatus>('proposed');
  // Which feature the most recent action actually targeted — captured at apply-time so Undo
  // still lands on it even if the admin's selection on the host page has since moved on.
  const [appliedFeatureId, setAppliedFeatureId] = useState<string | null>(null);

  // US 6930: the three "proposed" actions only make sense once the admin has a text feature
  // selected on the host page — apply targets "whatever's currently selected" (see
  // agent-chat-interface.tsx's handlers), so with nothing selected there'd be nothing to apply
  // to. Initialized synchronously from getCurrent() (no flash of "enabled" before the first
  // subscribe callback fires), then kept live via subscribe() so the buttons enable/disable as
  // the admin selects/deselects features while this card is on screen.
  const [hasSelection, setHasSelection] = useState<boolean>(
    () => FeatureContextService.getInstance().getCurrent() !== null
  );

  useEffect(() => {
    return FeatureContextService.getInstance().subscribe((feature) => {
      setHasSelection(feature !== null);
    });
  }, []);

  const handleAddToTop = () => {
    setAppliedFeatureId(onAddToTop());
    setStatus('applied');
  };

  const handleAddToBottom = () => {
    setAppliedFeatureId(onAddToBottom());
    setStatus('applied');
  };

  const handleReplaceAll = () => {
    setAppliedFeatureId(onReplaceAll());
    setStatus('applied');
  };

  const handleKeep = () => {
    onKeep();
    setStatus('proposed');
  };

  const handleUndo = () => {
    onUndo(appliedFeatureId);
    setStatus('proposed');
  };

  return (
    <div className="wkflo-text-suggestion-card">
      <p className="wkflo-text-suggestion-label">
        Suggested copy for the <strong>text</strong> feature:
      </p>

      <div
        className={`wkflo-text-suggestion-text ${isTextValidHtml(suggestion.suggestedText) ? 'bubble-content' : ''}`}
      >
        {renderMessageContent(suggestion.suggestedText, getAuthHeaders, imageFallbackSrc)}
      </div>

      {status === 'proposed' && (
        <>
          <div className="wkflo-text-suggestion-actions">
            <button
              type="button"
              className="wkflo-text-suggestion-btn"
              onClick={handleAddToTop}
              disabled={!hasSelection}
            >
              Add to top
            </button>
            <button
              type="button"
              className="wkflo-text-suggestion-btn"
              onClick={handleAddToBottom}
              disabled={!hasSelection}
            >
              Add to bottom
            </button>
            <button
              type="button"
              className="wkflo-text-suggestion-btn wkflo-text-suggestion-btn--danger"
              onClick={handleReplaceAll}
              disabled={!hasSelection}
            >
              Replace all
            </button>
          </div>

          {hasSelection ? (
            <p className="wkflo-text-suggestion-caption">
              Replace all overwrites the entire text block.
            </p>
          ) : (
            <p className="wkflo-text-suggestion-caption wkflo-text-suggestion-caption--warning">
              Select a text feature on the page to apply this suggestion.
            </p>
          )}
        </>
      )}

      {status === 'applied' && (
        <>
          <div className="wkflo-text-suggestion-actions">
            <button
              type="button"
              className="wkflo-text-suggestion-btn"
              onClick={handleKeep}
            >
              Keep
            </button>
            <button
              type="button"
              className="wkflo-text-suggestion-btn wkflo-text-suggestion-btn--danger"
              onClick={handleUndo}
            >
              Undo
            </button>
          </div>

          <p className="wkflo-text-suggestion-caption">
            Would you like to keep this change or undo it?
          </p>
        </>
      )}
    </div>
  );
};
