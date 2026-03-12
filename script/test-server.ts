import fs from "fs";
import path from "path";

process.env.NODE_ENV = "development";
process.env.DATA_DIR = ".data-e2e";
process.env.SESSION_SECRET = "e2e-secret";
process.env.APP_URL = "http://127.0.0.1:5000";
process.env.PAYMENT_AMOUNT_CENTS = "14900";
process.env.SUPPORTED_USCIS_EDITION = "01/20/25";
process.env.INLINE_DOCUMENT_PROCESSING = "true";

const dataDir = path.resolve(process.env.DATA_DIR);
if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

await import("../server/index.ts");
