// True when no element holds keyboard focus that the user could have put there: nothing focused,
// the body, or an element that has since been removed (e.g. the button that switched the view).
// Used before moving focus on a view change, so focus the user moved elsewhere is left alone.
export function isFocusUnclaimed(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}
