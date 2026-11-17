#!/bin/sh
cat <<EOF > /usr/share/nginx/html/config.js
window.__APP_CONFIG__ = {
  "VITE_API_URL": "${VITE_API_URL}",
  "VITE_ENTRA_CLIENT_ID": "${VITE_ENTRA_CLIENT_ID}",
  "VITE_ENTRA_TENANT_ID": "${VITE_ENTRA_TENANT_ID}",
  "VITE_MSAL_REDIRECT_URI": "${VITE_MSAL_REDIRECT_URI}",
  "VITE_ENTRA_SCOPE": "${VITE_ENTRA_SCOPE}"
};
EOF
exec nginx -g 'daemon off;'
