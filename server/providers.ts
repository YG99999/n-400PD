import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { config, isStripeConfigured, isSupabaseConfigured } from "./config";

let stripeClient: Stripe | null = null;
let supabaseClient: ReturnType<typeof createClient> | null = null;
let supabaseBrowserClient: ReturnType<typeof createClient> | null = null;

export function getStripeClient() {
  if (!isStripeConfigured()) return null;
  stripeClient ??= new Stripe(config.stripeSecretKey, {
    apiVersion: "2026-02-25.clover",
  });
  return stripeClient;
}

export function getSupabaseAdminClient() {
  if (!isSupabaseConfigured()) return null;
  supabaseClient ??= createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabaseClient;
}

export function getSupabaseBrowserClient() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) return null;
  supabaseBrowserClient ??= createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabaseBrowserClient;
}
