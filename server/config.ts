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

const nodeEnv = process.env.NODE_ENV || "development";
const production = nodeEnv === "production";
const explicitPublicDemo = toBoolean(process.env.PUBLIC_DEMO_ENABLED, !production);

export const config = {
  appUrl: process.env.APP_URL || "http://localhost:5000",
  port: Number(process.env.PORT || "5000"),
  nodeEnv,
  sessionSecret: requireEnv("SESSION_SECRET", "dev-session-secret-change-me"),
  dataDir: process.env.DATA_DIR || ".data",
  publicDemoEnabled: explicitPublicDemo && !production,
  useSecureCookies: toBoolean(process.env.SECURE_COOKIES, production),
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
  inlineDocumentProcessing: toBoolean(process.env.INLINE_DOCUMENT_PROCESSING, !production),
  allowProductionFallbacks: toBoolean(process.env.ALLOW_PRODUCTION_FALLBACKS, false),
  allowLocalStorageInProduction: toBoolean(process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION, false),
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "",
  elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID || "",
  elevenLabsWebhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET || "",
  elevenLabsServerLocation: process.env.ELEVENLABS_SERVER_LOCATION || "us",
  elevenLabsDebugBootstrap: toBoolean(process.env.ELEVENLABS_DEBUG_BOOTSTRAP, !production),
  elevenLabsExperimentalWebrtc: toBoolean(process.env.ELEVENLABS_EXPERIMENTAL_WEBRTC, false),
};

export function assertProductionReadiness() {
  if (!production) {
    return;
  }

  if (config.sessionSecret === "dev-session-secret-change-me") {
    throw new Error("SESSION_SECRET must be set in production.");
  }

  if (!isSupabaseConfigured() && !config.allowProductionFallbacks && !config.allowLocalStorageInProduction) {
    throw new Error("Supabase must be configured in production or an explicit local-storage override must be enabled.");
  }

  if (!isStripeConfigured() && !config.allowProductionFallbacks) {
    throw new Error("Stripe must be configured in production unless explicit production fallbacks are enabled.");
  }

  if (!config.useSecureCookies) {
    throw new Error("SECURE_COOKIES must be enabled in production.");
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

export function isProduction() {
  return production;
}

export function canUseLocalStorage() {
  return !production || config.allowLocalStorageInProduction || config.allowProductionFallbacks;
}

export function isElevenLabsConfigured() {
  return Boolean(config.elevenLabsApiKey && config.elevenLabsAgentId);
}

export function getTextAssistantConfigStatus() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);

  return {
    configured: hasGemini || hasOpenAi,
    provider: hasGemini ? "gemini" : hasOpenAi ? "openai" : null,
    geminiConfigured: hasGemini,
    openAiConfigured: hasOpenAi,
  };
}

export function getElevenLabsConfigStatus() {
  const missing: string[] = [];
  if (!config.elevenLabsApiKey) missing.push("ELEVENLABS_API_KEY");
  if (!config.elevenLabsAgentId) missing.push("ELEVENLABS_AGENT_ID");

  return {
    configured: missing.length === 0,
    missing,
    agentIdConfigured: Boolean(config.elevenLabsAgentId),
    apiKeyConfigured: Boolean(config.elevenLabsApiKey),
    serverLocation: config.elevenLabsServerLocation,
  };
}
