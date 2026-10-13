import { createClient } from '@supabase/supabase-js';
import { config } from './config.ts';

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in UI/.env');
}

/**
 * Browser Supabase client, used for authentication (password, SSO, reset) and direct storage uploads.
 * Sessions live in sessionStorage: each tab has its own session and closing the tab signs out.
 * All data access goes through the Lease IQ API.
 */
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
