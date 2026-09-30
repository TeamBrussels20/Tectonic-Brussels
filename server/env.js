import dotenv from 'dotenv';

// Imported first by server/index.js so every module sees the variables.
// .env holds server secrets; .env.local the browser settings (Supabase URL).
dotenv.config({ path: ['.env', '.env.local'], quiet: true });
