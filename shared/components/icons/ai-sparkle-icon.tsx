import React from 'react';

// US 7551 (MAISY design): the AI sparkle - Google Material Symbols Outlined "auto_awesome", FILL 1 -
// the default agent icon in every chat (header, launcher, message avatars, typing, agent pickers),
// replacing the generic robot glyph. Inlined as an SVG so the chat needs no icon font or extra
// dependency.
//
// Path copied verbatim from google/material-design-icons (master):
//   symbols/web/auto_awesome/materialsymbolsoutlined/auto_awesome_fill1_24px.svg
// That file is the small 24-unit export (24x24 px, no viewBox attribute, so its user space is
// 0 0 24 24), not the 960-unit symbol grid; the viewBox below states that space explicitly. The
// shape is the same as the classic Material Icons glyph (src/image/auto_awesome/materialicons/24px.svg),
// which is written with a different path string. Both sets are licensed under the Apache License 2.0
// (https://www.apache.org/licenses/LICENSE-2.0).
const AUTO_AWESOME_FILLED_PATH =
  'm19 9-1.25-2.75L15 5l2.75-1.25L19 1l1.25 2.75L23 5l-2.75 1.25Zm0 14-1.25-2.75L15 19l2.75-1.25L19 15l1.25 2.75L23 19l-2.75 1.25ZM9 20l-2.5-5.5L1 12l5.5-2.5L9 4l2.5 5.5L17 12l-5.5 2.5Z';

export interface AiSparkleIconProps {
  // Width and height in px. A sizing className (e.g. Tailwind w-4 h-4) wins over it.
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Decorative: always aria-hidden. Drawn in currentColor, like the lucide icons it sits next to.
export const AiSparkleIcon: React.FC<AiSparkleIconProps> = ({ size = 24, className, style }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    data-testid="ai-sparkle-icon"
    className={className}
    style={{ flexShrink: 0, ...style }}
  >
    <path d={AUTO_AWESOME_FILLED_PATH} />
  </svg>
);
