import React from 'react';
import type { MaisyView } from './chat-header';

// US 7506 (MAISY design): the part of a MAISY chat below the header - the conversation or the
// conversations list. After a switch the new view slides in from its side: the list from the left,
// a conversation from the right (see .wkflo-maisy-view-enter-* in chat-components.css). Other
// agents get their children as they are, with no extra element.
interface MaisyViewPaneProps {
  isMaisy: boolean;
  view: MaisyView;
  // False until the first switch, so the chat doesn't slide in when it first opens.
  animate: boolean;
  children: React.ReactNode;
}

export const MaisyViewPane: React.FC<MaisyViewPaneProps> = ({ isMaisy, view, animate, children }) => {
  if (!isMaisy) return <>{children}</>;

  const enterClass = animate
    ? (view === 'list' ? 'wkflo-maisy-view-enter-from-left' : 'wkflo-maisy-view-enter-from-right')
    : undefined;

  return (
    // Clips the slide, so the entering view never shows outside the chat.
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div
        // A new element per view, so its slide-in runs on every switch.
        key={view}
        className={enterClass}
        data-testid="maisy-view-pane"
        data-view={view}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </div>
    </div>
  );
};
