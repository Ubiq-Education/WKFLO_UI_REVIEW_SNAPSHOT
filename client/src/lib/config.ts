declare global {
  interface Window {
    __APP_CONFIG__?: Record<string, string>;
  }
}

function get(key: string): string {
  return window.__APP_CONFIG__?.[key] ?? (import.meta.env[key] as string) ?? '';
}

export const config = {
  get API_URL() { return get('VITE_API_URL'); },
  get ENTRA_CLIENT_ID() { return get('VITE_ENTRA_CLIENT_ID'); },
  get ENTRA_TENANT_ID() { return get('VITE_ENTRA_TENANT_ID'); },
  get MSAL_REDIRECT_URI() { return get('VITE_MSAL_REDIRECT_URI'); },
  get ENTRA_SCOPE() { return get('VITE_ENTRA_SCOPE'); },
};
