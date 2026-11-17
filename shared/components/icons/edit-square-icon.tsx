import React from 'react';

// US 7505 (MAISY design): the New chat icon - Google Material Symbols Outlined "edit_square",
// FILL 0. Inlined as an SVG so the chat needs no icon font or extra dependency.
//
// Path from the official source, google/material-design-icons:
//   symbols/web/edit_square/materialsymbolsoutlined/edit_square_24px.svg
// Material Symbols are licensed under the Apache License 2.0
// (https://www.apache.org/licenses/LICENSE-2.0).
const EDIT_SQUARE_PATH =
  'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z';

export interface EditSquareIconProps {
  // Width and height in px.
  size: number;
  style?: React.CSSProperties;
}

// Decorative: always aria-hidden. Drawn in currentColor, like the lucide icons it sits next to.
export const EditSquareIcon: React.FC<EditSquareIconProps> = ({ size, style }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 -960 960 960"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    data-testid="edit-square-icon"
    style={{ flexShrink: 0, ...style }}
  >
    <path d={EDIT_SQUARE_PATH} />
  </svg>
);
