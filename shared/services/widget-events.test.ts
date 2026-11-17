import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CONTACT_FORM_SUBMITTED_EVENT,
  ContactFormSubmittedDetail,
  dispatchContactFormSubmitted,
} from './widget-events';

// US 8021: public contract with host pages (the CMS listens for it to email its admins).

describe('dispatchContactFormSubmitted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the agreed event name', () => {
    expect(CONTACT_FORM_SUBMITTED_EVENT).toBe('wkflo:contact-form-submitted');
  });

  it('dispatches a CustomEvent on window with the full detail', () => {
    const listener = vi.fn();
    window.addEventListener(CONTACT_FORM_SUBMITTED_EVENT, listener);

    dispatchContactFormSubmitted({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.test',
      sessionId: 'session-1',
      shareId: 'share-1',
    });

    window.removeEventListener(CONTACT_FORM_SUBMITTED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<ContactFormSubmittedDetail>;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.detail).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.test',
      sessionId: 'session-1',
      shareId: 'share-1',
    });
  });

  it('fills missing fields with empty strings', () => {
    const listener = vi.fn();
    window.addEventListener(CONTACT_FORM_SUBMITTED_EVENT, listener);

    dispatchContactFormSubmitted({ sessionId: 'session-2', shareId: undefined });

    window.removeEventListener(CONTACT_FORM_SUBMITTED_EVENT, listener);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      firstName: '',
      lastName: '',
      email: '',
      sessionId: 'session-2',
      shareId: '',
    });
  });

  it('never throws when dispatching fails', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('host listener exploded');
    });

    expect(() => dispatchContactFormSubmitted({ sessionId: 'session-3' })).not.toThrow();
  });
});
