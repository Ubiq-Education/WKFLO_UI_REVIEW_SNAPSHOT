import React from 'react';

// US 7503 (MAISY design): the Select feature icon - Google Material Symbols Outlined "ads_click",
// the design's featureIcon. Inlined as an SVG so the chat needs no icon font or extra dependency.
//
// Path from the official source, google/material-design-icons:
//   symbols/web/ads_click/materialsymbolsoutlined/ads_click_24px.svg (FILL 0)
//   symbols/web/ads_click/materialsymbolsoutlined/ads_click_fill1_24px.svg (FILL 1)
// Material Symbols are licensed under the Apache License 2.0
// (https://www.apache.org/licenses/LICENSE-2.0).
//
// For ads_click Google's FILL 0 and FILL 1 files have the same path (the glyph has no area to
// fill), so `filled` changes nothing visually; it records the design's state (FILL 1 while
// selecting) on data-filled.
const ADS_CLICK_PATH =
  'M468-240q-96-5-162-74t-66-166q0-100 70-170t170-70q97 0 166 66t74 162l-84-25q-13-54-56-88.5T480-640q-66 0-113 47t-47 113q0 57 34.5 100t88.5 56l25 84Zm48 158q-9 2-18 2h-18q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480v18q0 9-2 18l-78-24v-12q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93h12l24 78Zm305 22L650-231 600-80 480-480l400 120-151 50 171 171-79 79Z';

export interface AdsClickIconProps {
  // Width and height in px.
  size: number;
  // The design's FILL 1 state (see above).
  filled?: boolean;
  style?: React.CSSProperties;
}

// Decorative: always aria-hidden. Drawn in currentColor, like the lucide icons it sits next to.
export const AdsClickIcon: React.FC<AdsClickIconProps> = ({ size, filled = false, style }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 -960 960 960"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    data-testid="ads-click-icon"
    data-filled={filled ? 'true' : 'false'}
    style={{ flexShrink: 0, ...style }}
  >
    <path d={ADS_CLICK_PATH} />
  </svg>
);
