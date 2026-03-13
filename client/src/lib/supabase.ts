import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const explicitAppUrl = import.meta.env.VITE_APP_URL as string | undefined;

export const isSupabaseAuthEnabled = Boolean(supabaseUrl && supabasePublishableKey);

function normalizeAppUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getAppUrl() {
  if (explicitAppUrl) {
    return normalizeAppUrl(explicitAppUrl);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeAppUrl(window.location.origin);
  }

  return "";
}

export const supabase = isSupabaseAuthEnabled
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;
