// Shared Supabase configuration for the FreeSurf ecosystem.
// All FreeSurf tools use the same Supabase project for centralized auth.
// Values sourced from the shared brand config.
import config from "./freesurf.config.js";

export const supabaseConfig = {
  url: config.AUTH.SUPABASE_URL,
  anonKey: config.AUTH.SUPABASE_ANON_KEY,
};
