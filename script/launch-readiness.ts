import fs from "fs";
import path from "path";
import "dotenv/config";

const requiredFiles = [
  "server/index.ts",
  "server/routes.ts",
  "server/pdf/n400_acroform.pdf",
  "server/pdf/n400_populator.py",
  "client/src/App.tsx",
  ".env.example",
];

const requiredEnv = [
  "SESSION_SECRET",
  "APP_URL",
  "PAYMENT_AMOUNT_CENTS",
  "SUPPORTED_USCIS_EDITION",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.resolve(file)));
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

const output = {
  timestamp: new Date().toISOString(),
  cwd: process.cwd(),
  nodeEnv: process.env.NODE_ENV || "development",
  fileChecks: {
    ok: missingFiles.length === 0,
    missingFiles,
  },
  envChecks: {
    ok: missingEnv.length === 0,
    missingEnv,
  },
  supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET),
  productionSafety: {
    secureCookies: process.env.NODE_ENV !== "production" || process.env.SECURE_COOKIES === "true",
    publicDemoDisabled: process.env.NODE_ENV !== "production" || process.env.PUBLIC_DEMO_ENABLED !== "true",
    productionFallbacksDisabled: process.env.ALLOW_PRODUCTION_FALLBACKS !== "true",
    localStorageOverrideDisabled: process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true",
  },
  generatedPdfDirExists: fs.existsSync(path.resolve("generated_pdfs")),
  dataDirExists: fs.existsSync(path.resolve(process.env.DATA_DIR || ".data")),
};

console.log(JSON.stringify(output, null, 2));

if (missingFiles.length > 0 || missingEnv.length > 0) {
  process.exit(1);
}
