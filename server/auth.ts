import type { NextFunction, Request, Response } from "express";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "./providers";
import { config } from "./config";

export interface AuthenticatedRequest extends Request {
  authUser?: SupabaseUser | null;
  authToken?: string | null;
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export async function resolveRequestUser(req: AuthenticatedRequest) {
  const token = getBearerToken(req);
  if (token) {
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      const { data, error } = await adminClient.auth.getUser(token);
      if (error || !data.user) {
        return { user: null, token };
      }
      return { user: data.user, token };
    }
  }

  if (req.session?.userId) {
    return {
      user: {
        id: req.session.userId,
        aud: "authenticated",
        app_metadata: { provider: "legacy-session" },
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      } as SupabaseUser,
      token: null,
    };
  }

  return { user: null, token: null };
}

export async function attachAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const { user, token } = await resolveRequestUser(req);
  req.authUser = user;
  req.authToken = token;
  next();
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { user, token } = await resolveRequestUser(req);
  req.authUser = user;
  req.authToken = token;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  return next();
}

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { user, token } = await resolveRequestUser(req);
  req.authUser = user;
  req.authToken = token;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient || !config.supabaseUrl) {
    return res.status(503).json({ error: "Supabase admin client unavailable" });
  }

  const { data, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (data as { role?: string } | null)?.role;
  if (error || role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  return next();
}
