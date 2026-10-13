// Build-time configuration from VITE_* variables (see .env.example).
const e = import.meta.env;

export const config = {
  apiBase: String(e.VITE_API_URL || '').replace(/\/$/, ''),
  supabaseUrl: String(e.VITE_SUPABASE_URL || ''),
  supabaseAnonKey: String(e.VITE_SUPABASE_ANON_KEY || ''),
  google: {
    clientId: String(e.VITE_GOOGLE_CLIENT_ID || ''),
    apiKey: String(e.VITE_GOOGLE_API_KEY || ''),
    appId: String(e.VITE_GOOGLE_APP_ID || ''),
  },
  microsoft: {
    clientId: String(e.VITE_MS_CLIENT_ID || ''),
    authority: String(e.VITE_MS_AUTHORITY || 'https://login.microsoftonline.com/common'),
  },
  sso: {
    google: e.VITE_SSO_GOOGLE === 'true',
    microsoft: e.VITE_SSO_MICROSOFT === 'true',
  },
};

export const googleConfigured = Boolean(config.google.clientId && config.google.apiKey);
export const microsoftConfigured = Boolean(config.microsoft.clientId);
