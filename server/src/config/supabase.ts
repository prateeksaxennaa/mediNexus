import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import type { Database } from '../models/database.types.js';

/**
 * Supabase admin client — uses the service-role key.
 * Bypasses Row-Level Security (RLS). Use only for trusted
 * server-side operations (admin tasks, creating users, etc.)
 */
export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Supabase anon client — uses the public anon key.
 * Use this for user-facing auth operations (signIn, signUp)
 * where you want Supabase to return a user session.
 */
export const supabaseAnon: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Creates a Supabase client scoped to a specific user's JWT.
 * Use this when you need RLS to apply (e.g. user-facing queries).
 */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
