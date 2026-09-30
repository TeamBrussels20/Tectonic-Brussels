import { createClient } from '@supabase/supabase-js';

// Server-side database access with the secret key: bypasses the demo RLS
// policies, so it must never be sent to the browser.
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required. Run `supabase status` and copy them into .env.');
}

export const db = createClient(url, key, { auth: { persistSession: false } });

export async function must(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
