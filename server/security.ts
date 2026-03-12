import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { randomUUID } from "crypto";
import { config } from "./config";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const MemoryStore = createMemoryStore(session);

const bucket = new Map<string, { count: number; resetAt: number }>();

export function setupSecurity(app: Express) {
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "microphone=(), camera=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.openai.com https://*.supabase.co https://api.stripe.com;",
    );
    next();
  });

  app.use(
    session({
      name: "citizenflow.sid",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new MemoryStore({
        checkPeriod: 24 * 60 * 60 * 1000,
      }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.useSecureCookies,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
      genid: () => randomUUID(),
    }),
  );
}

export function rateLimit(options: { key: string; windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = `${options.key}:${req.ip || "local"}:${req.session.userId || "anon"}`;
    const now = Date.now();
    const current = bucket.get(identity);
    if (!current || current.resetAt <= now) {
      bucket.set(identity, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    if (current.count >= options.max) {
      return res.status(429).json({ error: "Too many requests. Please try again shortly." });
    }
    current.count += 1;
    bucket.set(identity, current);
    return next();
  };
}
