import React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import type { ConnectionPhase } from '../services/signalr-service';

// US 7550 (MAISY design, offline banner): shown above the MAISY composer while the chat is not
// connected. Reconnecting is amber and needs no action; Disconnected is red and offers Retry.
// Renders nothing while connecting for the first time or connected. Status colours are the design
// system's warning / danger tokens - they are not header colours, which stay with the chat settings.
interface ConnectionBannerProps {
  phase: ConnectionPhase;
  agentName: string;
  onRetry?: () => void;
}

const BANNER_STYLE = {
  reconnecting: { background: '#fdf1dc', color: '#9a5b00' },
  disconnected: { background: '#fdecea', color: '#c62828' },
} as const;

const RETRY_BUTTON_STYLE: React.CSSProperties = {
  flexShrink: 0,
  height: '30px',
  padding: '0 14px',
  borderRadius: '999px',
  border: '1px solid #d9d6d0',
  background: '#ffffff',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1f2523',
  cursor: 'pointer',
};

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({ phase, agentName, onRetry }) => {
  if (phase !== 'reconnecting' && phase !== 'disconnected') return null;

  const isReconnecting = phase === 'reconnecting';
  const { background, color } = BANNER_STYLE[phase];
  const Icon = isReconnecting ? RefreshCw : CloudOff;

  return (
    <div style={{ padding: '0 16px 10px' }}>
      <div
        role="status"
        data-testid="connection-banner"
        data-phase={phase}
        style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 10px 10px 12px', borderRadius: '8px', background, color }}
      >
        <Icon aria-hidden="true" style={{ width: '20px', height: '20px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>
            {isReconnecting ? `Reconnecting to ${agentName}` : `${agentName} can't connect`}
          </span>
          <span style={{ fontSize: '12px', color: '#3b3f3d' }}>
            {isReconnecting
              ? 'This usually takes a few seconds.'
              : 'Check your internet connection. Anything you type will be kept.'}
          </span>
        </div>
        {!isReconnecting && onRetry && (
          <button type="button" onClick={onRetry} style={RETRY_BUTTON_STYLE}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
};
