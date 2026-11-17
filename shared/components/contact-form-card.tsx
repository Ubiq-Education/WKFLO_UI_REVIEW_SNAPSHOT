import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import { ContactFormUpdate } from '../services/chat-service';
import { getOrCreateSubjectId } from '../utils/subject-id';

interface ContactFormCardProps {
  form: ContactFormUpdate;
  primaryColor: string;
  onSubmit: (data: ContactFormData) => Promise<void>;
  onSkip?: () => void; // Only provided when !mandatory
}

export interface ContactFormData {
  subjectId: string;
  firstName: string;
  lastName: string;
  email: string;
  originalMessage: string;
}

export const ContactFormCard: React.FC<ContactFormCardProps> = ({
  form,
  primaryColor,
  onSubmit,
  onSkip,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fieldId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    const data: ContactFormData = {
      subjectId: getOrCreateSubjectId(),
      firstName: form.firstNameRequired ? firstName : '',
      lastName: form.lastNameRequired ? lastName : '',
      email: form.emailRequired ? email : '',
      originalMessage: form.message,
    };

    try {
      await onSubmit(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="wkflo-contact-form-card">
      {onSkip && (
        <button
          type="button"
          className="wkflo-contact-form-close"
          onClick={onSkip}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <form onSubmit={handleSubmit} className="wkflo-contact-form">
        {form.firstNameRequired && (
          <div className="wkflo-contact-form-field">
            <label className="wkflo-contact-form-label" htmlFor={`${fieldId}-first-name`}>
              First name <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${fieldId}-first-name`}
              type="text"
              required
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="wkflo-contact-form-input"
            />
          </div>
        )}

        {form.lastNameRequired && (
          <div className="wkflo-contact-form-field">
            <label className="wkflo-contact-form-label" htmlFor={`${fieldId}-last-name`}>
              Last name <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${fieldId}-last-name`}
              type="text"
              required
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="wkflo-contact-form-input"
            />
          </div>
        )}

        {form.emailRequired && (
          <div className="wkflo-contact-form-field">
            <label className="wkflo-contact-form-label" htmlFor={`${fieldId}-email`}>
              Email <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${fieldId}-email`}
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="wkflo-contact-form-input"
            />
          </div>
        )}

        {submitError && (
          <p className="wkflo-contact-form-error">{submitError}</p>
        )}

        <button
          type="submit"
          className="wkflo-contact-form-submit"
          style={{ backgroundColor: primaryColor }}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : (form.submitButtonText || 'Submit')}
        </button>
      </form>
    </div>
  );
};
