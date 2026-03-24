import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const hasEnv = Boolean(supabaseUrl && supabaseKey);

if (!hasEnv) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
    'Running in mock mode so the UI can still render.'
  );
}

export const supabase: SupabaseClient = createClient(
  hasEnv ? supabaseUrl! : 'http://localhost:54321',
  hasEnv ? supabaseKey! : 'public-anon-key',
  {
    auth: {
      autoRefreshToken: hasEnv,
      persistSession: hasEnv,
    },
  },
);

// Edge Function base URL
export const FUNCTIONS_URL = hasEnv ? `${supabaseUrl}/functions/v1` : '';
