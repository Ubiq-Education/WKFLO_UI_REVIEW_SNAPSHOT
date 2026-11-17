import React from 'react';
import { CircleStop } from 'lucide-react';
import { STOPPED_MARKER_SHORT_TEXT, STOPPED_MARKER_TEXT } from '../utils/stopped-marker';

// US 7502: full-width "line, stop icon, text, line" row marking where the user pressed Stop.
// Used by both thread renderers (widget/CMS and the main app's agent test chat). The text is plain,
// readable text; the lines and the icon are decorative. (Not role="separator": its children are
// presentational, so screen readers could skip the text.)
//
// The text always comes from here, never from the marker message's content: 'full' ("Stopped. All
// agents cancelled.") for the Chat UI and the agent test chat, 'short' ("Stopped.") for the Chat
// Widget, which talks to a single chatbot - for live and history dividers alike.
export interface StoppedDividerProps {
  variant?: 'full' | 'short';
  // US 7974: when the user pressed Stop (a MessageTimestamp), shown after the text.
  timestamp?: React.ReactNode;
}

export const StoppedDivider: React.FC<StoppedDividerProps> = ({ variant = 'full', timestamp }) => (
  <div
    data-testid="stopped-divider"
    data-variant={variant}
    className="flex items-center w-full text-gray-500"
    style={{ gap: 8, fontSize: 12, lineHeight: '16px' }}
  >
    <span aria-hidden="true" className="flex-1 bg-gray-200" style={{ height: 1 }} />
    <CircleStop aria-hidden="true" className="flex-shrink-0" style={{ width: 16, height: 16 }} />
    <span className="flex-shrink-0">{variant === 'short' ? STOPPED_MARKER_SHORT_TEXT : STOPPED_MARKER_TEXT}</span>
    {timestamp}
    <span aria-hidden="true" className="flex-1 bg-gray-200" style={{ height: 1 }} />
  </div>
);
