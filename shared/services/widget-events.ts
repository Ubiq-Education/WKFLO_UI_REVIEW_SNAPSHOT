/**
 * Public browser events the chat emits on `window` so the page hosting the widget can react
 * (the widget renders inline, not in an iframe, so host scripts see them).
 *
 * These names and payloads are a contract with host pages (e.g. the CMS subscribes to
 * `wkflo:contact-form-submitted` to send admin notification emails) - never rename them or
 * change the detail shape without coordinating with every host.
 */

/** Fired once per successful contact form submission. */
export const CONTACT_FORM_SUBMITTED_EVENT = 'wkflo:contact-form-submitted';

/** `CustomEvent.detail` of {@link CONTACT_FORM_SUBMITTED_EVENT}. Missing values are empty strings. */
export interface ContactFormSubmittedDetail {
  firstName: string;
  lastName: string;
  email: string;
  sessionId: string;
  shareId: string;
}

/**
 * Dispatches {@link CONTACT_FORM_SUBMITTED_EVENT} on `window`. Call it only after the submit
 * API call succeeded. Never throws: a host listener or an environment without `window` /
 * `CustomEvent` must not break the chat.
 */
export function dispatchContactFormSubmitted(detail: Partial<ContactFormSubmittedDetail>): void {
  if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') {
    return;
  }

  try {
    const payload: ContactFormSubmittedDetail = {
      firstName: detail.firstName ?? '',
      lastName: detail.lastName ?? '',
      email: detail.email ?? '',
      sessionId: detail.sessionId ?? '',
      shareId: detail.shareId ?? '',
    };
    window.dispatchEvent(new window.CustomEvent(CONTACT_FORM_SUBMITTED_EVENT, { detail: payload }));
  } catch (error) {
    console.warn(`Failed to dispatch ${CONTACT_FORM_SUBMITTED_EVENT}:`, error);
  }
}
