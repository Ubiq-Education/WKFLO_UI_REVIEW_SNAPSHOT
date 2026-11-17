import { generateGuid } from './session-manager';

const COOKIE_NAME = 'amais-dxp-subject';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string): void {
  const maxAge = 365 * 24 * 60 * 60; // 1 year
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${maxAge};path=/;SameSite=Lax`;
}

export function getOrCreateSubjectId(): string {
  let subjectId = getCookie(COOKIE_NAME);
  if (!subjectId) {
    subjectId = generateGuid();
    setCookie(COOKIE_NAME, subjectId);
  }
  return subjectId;
}
