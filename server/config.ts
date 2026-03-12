function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value === "true";
}

export const config = {
  appUrl: process.env.APP_URL || "http://localhost:5000",
  port: Number(process.env.PORT || "5000"),
  nodeEnv: process.env.NODE_ENV || "development",
  sessionSecret: requireEnv("SESSION_SECRET", "dev-session-secret-change-me"),
  dataDir: process.env.DATA_DIR || ".data",
  publicDemoEnabled: toBoolean(process.env.PUBLIC_DEMO_ENABLED, true),
  useSecureCookies: toBoolean(process.env.SECURE_COOKIES, process.env.NODE_ENV === "production"),
  supportedUscisEdition: process.env.SUPPORTED_USCIS_EDITION || "01/20/25",
  paymentAmountCents: Number(process.env.PAYMENT_AMOUNT_CENTS || "14900"),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePriceName: process.env.STRIPE_PRICE_NAME || "CitizenFlow N-400 preparation",
  stripePriceId: process.env.STRIPE_PRICE_ID || "",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "citizenflow-documents",
  documentWorkerPollMs: Number(process.env.DOCUMENT_WORKER_POLL_MS || "3000"),
  inlineDocumentProcessing: toBoolean(process.env.INLINE_DOCUMENT_PROCESSING, process.env.NODE_ENV !== "production"),
};

export function assertProductionReadiness() {
  if (config.nodeEnv === "production" && config.sessionSecret === "dev-session-secret-change-me") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
}

export function isStripeConfigured() {
  return Boolean(config.stripeSecretKey && config.stripeWebhookSecret && config.stripePriceId);
}

export function isSupabaseConfigured() {
  return Boolean(
    config.supabaseUrl &&
    config.supabaseAnonKey &&
    config.supabaseServiceRoleKey &&
    config.supabaseStorageBucket,
  );
}
