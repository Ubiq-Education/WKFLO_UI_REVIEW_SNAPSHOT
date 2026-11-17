import React, { useId, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import type { ToolApprovalDecision } from '../services/signalr-service';
import {
  ToolApprovalState,
  effectiveToolApprovalStatus,
  formatToolApprovalArguments,
} from '../utils/tool-approval';
import { toolDisplayDescription, toolDisplayName } from '../utils/tool-display';

// US 7575 "Ask for permission": shown when an agent wants to call a tool function that needs
// approval. Modelled on Claude Desktop's tool-permission prompt — whoever is chatting answers it
// (visitor in the widget, admin in a test chat). Styled only through `wkflo-tool-approval-*`
// classes (shared/styles/chat-components.css, with `.wkflo-widget-root`-scoped copies) so it
// stays isolated when the widget is embedded in a host page.
interface ToolApprovalCardProps {
  approval: ToolApprovalState;
  // Used when the request itself carries no agent name.
  fallbackAgentName?: string;
  primaryColor?: string;
  foregroundColor?: string;
  onDecide?: (decision: ToolApprovalDecision) => Promise<{ success: boolean; error?: string }>;
}

function formatTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({
  approval,
  fallbackAgentName,
  primaryColor,
  foregroundColor = '#ffffff',
  onDecide,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState<ToolApprovalDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailsId = useId();

  const status = effectiveToolApprovalStatus(approval);
  const isPending = status === 'Pending' && !approval.alreadyAnswered;
  const agentName = approval.agentName || fallbackAgentName || 'The assistant';
  // WI 7726: the friendly name/description when set; the original ones are only fallbacks.
  const functionDisplay = {
    name: approval.functionName,
    description: approval.functionDescription,
    displayName: approval.functionDisplayName,
    displayDescription: approval.functionDisplayDescription,
  };
  const functionName = toolDisplayName(functionDisplay) || 'a function';
  const functionDescription = toolDisplayDescription(functionDisplay);
  const toolName = approval.toolName || 'a tool';
  const formattedArguments = formatToolApprovalArguments(approval.argumentsJson);
  const expiresAt = formatTime(approval.expiresAtUtc);

  const decide = async (decision: ToolApprovalDecision) => {
    if (!onDecide || submitting) return;
    setError(null);
    setSubmitting(decision);
    try {
      const result = await onDecide(decision);
      if (!result.success) setError(result.error || "Couldn't send your answer. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your answer. Please try again.");
    } finally {
      setSubmitting(null);
    }
  };

  const outcome = (() => {
    if (approval.alreadyAnswered && status === 'Pending') {
      return { icon: <ShieldCheck className="wkflo-tool-approval-outcome-icon" />, text: 'This request was already answered.' };
    }
    switch (status) {
      case 'Approved':
        return {
          icon: <ShieldCheck className="wkflo-tool-approval-outcome-icon" />,
          text: approval.decision === 'AllowForConversation' ? 'Allowed for this conversation' : 'Allowed once',
        };
      case 'Denied':
        return { icon: <ShieldX className="wkflo-tool-approval-outcome-icon" />, text: 'Denied' };
      case 'Expired':
        return { icon: <Clock className="wkflo-tool-approval-outcome-icon" />, text: "Expired. Nobody answered in time, so it wasn't used." };
      default:
        return null;
    }
  })();

  return (
    <div
      className={`wkflo-tool-approval-card wkflo-tool-approval-card--${isPending ? 'pending' : status.toLowerCase()}`}
      data-testid="tool-approval-card"
      data-status={isPending ? 'Pending' : approval.alreadyAnswered && status === 'Pending' ? 'Answered' : status}
      role="group"
      aria-label={`Permission request: ${functionName} from ${toolName}`}
    >
      {/* Announced once when the card appears (and while it waits), so screen-reader users
          know the chat is paused on them. */}
      <p className="wkflo-tool-approval-sr-only" aria-live="polite" aria-atomic="true" data-testid="tool-approval-announcement">
        {isPending ? `Approval needed: ${agentName} wants to use ${functionName} from ${toolName}.` : ''}
      </p>

      <div className="wkflo-tool-approval-header">
        <ShieldAlert className="wkflo-tool-approval-icon" aria-hidden="true" />
        <p className="wkflo-tool-approval-title">
          {agentName} wants to use <strong>{functionName}</strong> from <strong>{toolName}</strong>
        </p>
      </div>

      {functionDescription && (
        <p className="wkflo-tool-approval-description">{functionDescription}</p>
      )}

      <button
        type="button"
        className="wkflo-tool-approval-details-toggle"
        aria-expanded={showDetails}
        aria-controls={showDetails ? detailsId : undefined}
        onClick={() => setShowDetails(v => !v)}
      >
        {showDetails
          ? <ChevronDown className="wkflo-tool-approval-chevron" aria-hidden="true" />
          : <ChevronRight className="wkflo-tool-approval-chevron" aria-hidden="true" />}
        Details
      </button>
      {showDetails && (
        <div id={detailsId} className="wkflo-tool-approval-details">
          {formattedArguments
            ? <pre className="wkflo-tool-approval-arguments">{formattedArguments}</pre>
            : <p className="wkflo-tool-approval-no-arguments">No details were sent with this request.</p>}
        </div>
      )}

      {isPending ? (
        <>
          <div className="wkflo-tool-approval-actions">
            <button
              type="button"
              className="wkflo-tool-approval-btn wkflo-tool-approval-btn--primary"
              style={primaryColor ? { backgroundColor: primaryColor, borderColor: primaryColor, color: foregroundColor } : undefined}
              onClick={() => decide('AllowOnce')}
              disabled={!!submitting || !onDecide}
            >
              {submitting === 'AllowOnce' ? 'Allowing…' : 'Allow once'}
            </button>
            <button
              type="button"
              className="wkflo-tool-approval-btn"
              onClick={() => decide('AllowForConversation')}
              disabled={!!submitting || !onDecide}
            >
              {submitting === 'AllowForConversation' ? 'Allowing…' : 'Allow for this conversation'}
            </button>
            <button
              type="button"
              className="wkflo-tool-approval-btn wkflo-tool-approval-btn--danger"
              onClick={() => decide('Deny')}
              disabled={!!submitting || !onDecide}
            >
              {submitting === 'Deny' ? 'Denying…' : 'Deny'}
            </button>
          </div>
          {expiresAt && (
            <p className="wkflo-tool-approval-caption">If nobody answers by {expiresAt}, this request is denied.</p>
          )}
        </>
      ) : outcome && (
        <p className="wkflo-tool-approval-outcome" role="status">
          {outcome.icon}
          {outcome.text}
        </p>
      )}

      {error && <p className="wkflo-tool-approval-error" role="alert">{error}</p>}
    </div>
  );
};
