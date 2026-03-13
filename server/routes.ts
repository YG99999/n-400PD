import type { Express } from "express";
import { type Server } from "http";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import { storage } from "./storage";
import { getInitialMessage } from "./conversation";
import { processAssistantTurn } from "./assistantRuntime";
import {
  accountPreferenceSchema,
  accountRequestCreateSchema,
  chatRequestSchema,
  createEmptyWorkflowState,
  formSaveRequestSchema,
  paymentRequestSchema,
  reviewListItemAddSchema,
  reviewListItemRemoveSchema,
  reviewListItemUpdateSchema,
  reviewScalarUpdateSchema,
  supportTicketCreateSchema,
} from "@shared/schema";
import type { ChatMessage, N400FormData, Section } from "@shared/schema";
import {
  appendListItem,
  cloneFormData,
  computeReadiness,
  createReviewEdit,
  refreshWorkflowState,
  removeListItem,
  setValueAtPath,
} from "./workflowState";
import { rateLimit } from "./security";
import { requireAdmin, requireAuth, type AuthenticatedRequest, resolveRequestUser } from "./auth";
import { verifyPassword, hashPassword } from "./password";
import { documentJobs } from "./documentJobs";
import { canUseLocalStorage, config, isProduction, isStripeConfigured, isSupabaseConfigured } from "./config";
import { getStripeClient, getSupabaseAdminClient } from "./providers";
import { readGeneratedDocument } from "./documentStorage";

const OUTPUT_DIR = path.resolve("generated_pdfs");
const PDF_DIR = path.resolve(import.meta.dirname, "pdf");
const ACROFORM_PATH = path.join(PDF_DIR, "n400_acroform.pdf");
const POPULATOR_PATH = path.join(PDF_DIR, "n400_populator.py");

type ReadinessCheck = {
  ok: boolean;
  detail?: string;
};

function checkPythonRuntime(): ReadinessCheck {
  const candidates = process.platform === "win32"
    ? [["python"], ["py", "-3"], ["py"]]
    : [["python3"], ["python"]];

  for (const [command, ...args] of candidates) {
    const result = spawnSync(command, [...args, "--version"], {
      stdio: "ignore",
      timeout: 3000,
    });
    if (result.status === 0) {
      return { ok: true, detail: [command, ...args].join(" ") };
    }
  }

  return { ok: false, detail: "No Python runtime with PyMuPDF-compatible execution path was found." };
}

async function buildReadinessPayload() {
  const supabaseAdmin = getSupabaseAdminClient();

  const checks: Record<string, ReadinessCheck> = {
    sessionSecretConfigured: {
      ok: Boolean(config.sessionSecret && config.sessionSecret !== "dev-session-secret-change-me"),
    },
    secureCookies: {
      ok: !isProduction() || config.useSecureCookies,
      detail: isProduction() ? "Production requires SECURE_COOKIES=true." : "Not required outside production.",
    },
    pdfTemplatePresent: {
      ok: fs.existsSync(ACROFORM_PATH) && fs.existsSync(POPULATOR_PATH),
      detail: "Checks the bundled PDF template and Python populator assets.",
    },
    generatedPdfDirPresent: {
      ok: fs.existsSync(OUTPUT_DIR),
    },
    pythonRuntime: checkPythonRuntime(),
    stripeConfigured: {
      ok: isStripeConfigured(),
      detail: "Requires secret key, webhook secret, and live price id.",
    },
    supabaseConfigured: {
      ok: isSupabaseConfigured(),
      detail: "Requires URL, anon/publishable key, service role key, and storage bucket.",
    },
    documentProcessingMode: {
      ok: config.inlineDocumentProcessing || config.documentWorkerPollMs > 0,
      detail: config.inlineDocumentProcessing
        ? "Inline document processing is enabled."
        : `Background worker polling every ${config.documentWorkerPollMs}ms.`,
    },
    localStorageAllowed: {
      ok: canUseLocalStorage(),
      detail: canUseLocalStorage()
        ? "Local storage is permitted in this environment."
        : "Local storage is disabled; Supabase must be available.",
    },
  };

  if (isSupabaseConfigured() && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" });
      checks.supabaseDatabaseAccess = {
        ok: !error,
        detail: error?.message || "Profiles table is reachable.",
      };
    } catch (error) {
      checks.supabaseDatabaseAccess = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const { error } = await supabaseAdmin.storage.from(config.supabaseStorageBucket).list("", { limit: 1 });
      checks.supabaseStorageAccess = {
        ok: !error,
        detail: error?.message || `Bucket ${config.supabaseStorageBucket} is reachable.`,
      };
    } catch (error) {
      checks.supabaseStorageAccess = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    checks.supabaseDatabaseAccess = {
      ok: false,
      detail: "Supabase admin client is unavailable.",
    };
    checks.supabaseStorageAccess = {
      ok: false,
      detail: "Supabase storage checks are unavailable without the admin client.",
    };
  }

  if (!isSupabaseConfigured()) {
    try {
      const demoUser = await storage.getUserByUsername("demo@citizenflow.app");
      checks.demoSeedAvailable = {
        ok: Boolean(demoUser),
        detail: "Local-storage/demo mode requires the seeded demo account.",
      };
    } catch (error) {
      checks.demoSeedAvailable = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const criticalChecks = [
    "sessionSecretConfigured",
    "secureCookies",
    "pdfTemplatePresent",
    "generatedPdfDirPresent",
    "pythonRuntime",
    "documentProcessingMode",
  ];

  if (isProduction()) {
    criticalChecks.push("stripeConfigured");
  }

  if (isSupabaseConfigured()) {
    criticalChecks.push("supabaseConfigured", "supabaseDatabaseAccess", "supabaseStorageAccess");
  } else {
    criticalChecks.push("localStorageAllowed", "demoSeedAvailable");
  }

  const failedCriticalChecks = criticalChecks.filter((name) => !checks[name]?.ok);

  return {
    ok: failedCriticalChecks.length === 0,
    failedCriticalChecks,
    storageMode: isSupabaseConfigured() ? "supabase" : "local_json",
    paymentMode: isStripeConfigured() ? "stripe" : "unconfigured",
    documentProcessingMode: config.inlineDocumentProcessing ? "inline" : "background_worker",
    checks,
    time: new Date().toISOString(),
  };
}

function sanitizeUser(user: Awaited<ReturnType<typeof storage.getUser>>) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.username,
    fullName: user.fullName,
    emailVerified: user.emailVerified ?? false,
    marketingOptIn: user.marketingOptIn ?? false,
    role: user.role ?? "user",
  };
}

async function getAuthedUserSession(userId: string, sessionId?: string) {
  const session = sessionId ? await storage.getSession(sessionId) : await storage.getSessionByUser(userId);
  if (!session || session.userId !== userId) {
    throw new Error("Session not found");
  }
  return session;
}

function getAuthenticatedUserId(req: AuthenticatedRequest) {
  return req.authUser?.id ?? req.session.userId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.get("/healthz", async (_req, res) => {
    return res.json({
      ok: true,
      service: "citizenflow",
      time: new Date().toISOString(),
      supportedUscisEdition: config.supportedUscisEdition,
    });
  });

  app.get("/readyz", async (_req, res) => {
    const payload = await buildReadinessPayload();
    return res.status(payload.ok ? 200 : 503).json(payload);
  });

  app.post("/api/payment/webhook", async (req, res) => {
    const stripe = getStripeClient();
    const supabaseAdmin = getSupabaseAdminClient();
    if (!stripe || !config.stripeWebhookSecret) {
      return res.status(404).json({ error: "Stripe webhook not configured" });
    }

    try {
      const signature = req.headers["stripe-signature"];
      if (!signature || Array.isArray(signature)) {
        return res.status(400).json({ error: "Missing stripe signature" });
      }
      const event = stripe.webhooks.constructEvent(
        Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody as any),
        signature,
        config.stripeWebhookSecret,
      );

      if (supabaseAdmin) {
        await (supabaseAdmin.from("stripe_events") as any).upsert({
          id: event.id,
          type: event.type,
          payload: event,
          processed_at: new Date().toISOString(),
        });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const payment = session.id ? await storage.getPaymentByProviderReference(session.id) : undefined;
        if (payment) {
          await storage.updatePayment(payment.id, {
            status: "completed",
            receiptEmail: session.customer_details?.email || payment.receiptEmail,
          });
          await storage.updateSession(payment.sessionId, {
            paymentStatus: "completed",
            status: "payment_pending",
          });
          const queued = await documentJobs.enqueue(payment.sessionId, "payment");
          await storage.createAuditEvent({
            userId: payment.userId,
            action: "payment.webhook.completed",
            targetType: "payment",
            targetId: payment.id,
            metadata: { checkoutSessionId: session.id, jobId: queued.jobId },
          });
        }
      }

      return res.json({ received: true });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/signup", rateLimit({ key: "auth-signup", windowMs: 60_000, max: 10 }), async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        return res.status(400).json({ error: "Use Supabase Auth from the client for sign up." });
      }
      const { email, password, fullName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      const existing = await storage.getUserByUsername(String(email).toLowerCase());
      if (existing) {
        return res.status(400).json({ error: "User already exists" });
      }
      const user = await storage.createUser({
        username: String(email).toLowerCase(),
        password: hashPassword(String(password)),
        fullName: String(fullName || "").trim() || undefined,
      });
      const formSession = await storage.createSession(user.id);
      const greeting: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: getInitialMessage("INTRO"),
        timestamp: new Date().toISOString(),
        section: "INTRO",
      };
      await storage.addMessage(formSession.id, greeting);
      await storage.createAuditEvent({
        userId: user.id,
        action: "auth.signup",
        targetType: "user",
        targetId: user.id,
      });
      req.session.userId = user.id;
      return res.status(201).json({
        user: sanitizeUser(user),
        formSessionId: formSession.id,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", rateLimit({ key: "auth-login", windowMs: 60_000, max: 20 }), async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        return res.status(400).json({ error: "Use Supabase Auth from the client for login." });
      }
      const { email, password } = req.body;
      const user = await storage.getUserByUsername(String(email).toLowerCase());
      if (!user?.passwordHash || !verifyPassword(String(password), user.passwordHash)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      req.session.userId = user.id;
      const formSession = await storage.getSessionByUser(user.id) ?? await storage.createSession(user.id);
      await storage.createAuditEvent({
        userId: user.id,
        action: "auth.login",
        targetType: "user",
        targetId: user.id,
      });
      return res.json({
        user: sanitizeUser(user),
        formSessionId: formSession.id,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    await storage.createAuditEvent({
      userId,
      action: "auth.logout",
      targetType: "user",
      targetId: userId,
    });
    if (req.session) {
      req.session.destroy(() => {
        res.clearCookie("citizenflow.sid");
        res.json({ success: true });
      });
      return;
    }
    return res.json({ success: true });
  });

  app.get("/api/auth/me", async (req: AuthenticatedRequest, res) => {
    const { user: requestUser } = await resolveRequestUser(req);
    const userId = requestUser?.id ?? req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    let formSession = await storage.getSessionByUser(user.id);
    if (!formSession) {
      formSession = await storage.createSession(user.id);
      const greeting: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: getInitialMessage("INTRO"),
        timestamp: new Date().toISOString(),
        section: "INTRO",
      };
      await storage.addMessage(formSession.id, greeting);
    }
    return res.json({
      user: sanitizeUser(user),
      formSessionId: formSession?.id ?? null,
    });
  });

  app.post("/api/auth/demo", async (req, res) => {
    if (!config.publicDemoEnabled) {
      return res.status(404).json({ error: "Demo mode disabled" });
    }
    const user = await storage.getUserByUsername("demo@citizenflow.app");
    if (!user) {
      return res.status(404).json({ error: "Demo user not found" });
    }
    req.session.userId = user.id;
    const formSession = await storage.getSessionByUser(user.id);
    return res.json({
      user: sanitizeUser(user),
      formSessionId: formSession?.id ?? null,
    });
  });

  app.get("/api/account", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const sessions = await storage.listSessionsByUser(user.id);
    const payments = await storage.listPaymentsByUser(user.id);
    const documents = await storage.listDocumentsByUser(user.id);
    const jobs = await storage.listJobsByUser(user.id);
    const supportTickets = await storage.listSupportTicketsByUser(user.id);
    const auditEvents = await storage.listAuditEventsByUser(user.id);
    const accountRequests = await storage.listAccountRequestsByUser(user.id);
    return res.json({
      user: sanitizeUser(user),
      sessions,
      payments,
      documents,
      jobs,
      supportTickets,
      auditEvents,
      accountRequests,
      supportedUscisEdition: config.supportedUscisEdition,
    });
  });

  app.post("/api/account/preferences", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const body = accountPreferenceSchema.parse(req.body);
    const updated = await storage.updateUser(userId, body);
    await storage.createAuditEvent({
      userId,
      action: "account.preferences.updated",
      targetType: "user",
      targetId: userId,
      metadata: body,
    });
    return res.json({ user: sanitizeUser(updated) });
  });

  app.post("/api/account/request", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const body = accountRequestCreateSchema.parse(req.body);
    const request = await storage.createAccountRequest({
      userId,
      type: body.type,
    });
    await storage.createAuditEvent({
      userId,
      action: `account.${body.type}.requested`,
      targetType: "account_request",
      targetId: request.id,
    });
    return res.status(201).json({ request });
  });

  app.post("/api/support/tickets", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const body = supportTicketCreateSchema.parse(req.body);
    const ticket = await storage.createSupportTicket({
      userId,
      sessionId: body.sessionId,
      category: body.category,
      subject: body.subject,
      message: body.message,
    });
    await storage.createAuditEvent({
      userId,
      action: "support.ticket.created",
      targetType: "support_ticket",
      targetId: ticket.id,
      metadata: { category: body.category, sessionId: body.sessionId },
    });
    return res.status(201).json({ ticket });
  });

  app.post("/api/chat", requireAuth, rateLimit({ key: "chat", windowMs: 60_000, max: 120 }), async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const body = chatRequestSchema.parse(req.body);
      const session = await getAuthedUserSession(userId, body.formSessionId);

      const userMsg: ChatMessage = {
        id: randomUUID(),
        role: "user",
        content: body.message,
        timestamp: new Date().toISOString(),
        section: session.currentSection,
      };
      await storage.addMessage(session.id, userMsg);

      const hydratedSession = (await storage.getSession(session.id)) || session;
      const result = await processAssistantTurn(hydratedSession, body.message);

      const botMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        content: result.botMessage,
        timestamp: new Date().toISOString(),
        section: result.currentSection,
        extractedFields: result.extractedFields,
        toolEvents: result.toolEvents,
      };
      await storage.addMessage(session.id, botMsg);
      await storage.updateFormData(session.id, result.updatedFormData);
      await storage.updateSession(session.id, {
        currentSection: result.currentSection,
        status: result.redirectIntent === "review" ? "review" : hydratedSession.status,
        workflowState: result.workflowState,
      });
      await storage.setRedFlags(session.id, result.redFlags);

      return res.json({
        botResponse: result.botMessage,
        extractedFields: result.extractedFields,
        currentSection: result.currentSection,
        mode: result.workflowState.mode,
        workflowState: result.workflowState,
        readiness: result.readiness,
        redirectIntent: result.redirectIntent,
        redFlags: result.redFlags,
        toolEvents: result.toolEvents,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/form/save", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const body = formSaveRequestSchema.parse(req.body);
      const session = await getAuthedUserSession(userId, body.formSessionId);
      await storage.updateFormData(session.id, body.formData as N400FormData);
      if (body.currentSection) {
        await storage.updateSection(session.id, body.currentSection as Section);
      }
      const updated = await storage.getSession(session.id);
      if (updated) {
        await storage.updateSession(session.id, {
          workflowState: refreshWorkflowState(updated),
        });
      }
      return res.json({
        success: true,
        lastSavedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/form/load", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const session = await getAuthedUserSession(userId, req.query.sessionId as string);
      const latestDocument = await storage.getLatestDocumentBySession(session.id);
      return res.json({
        formSession: {
          id: session.id,
          status: session.status,
          currentSection: session.currentSection,
          formData: session.formData,
          redFlags: session.redFlags,
          workflowState: session.workflowState,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          pdfUrl: session.pdfUrl,
          paymentStatus: session.paymentStatus,
          latestDocument,
        },
        conversations: session.messages,
      });
    } catch (err: any) {
      return res.status(404).json({ error: err.message });
    }
  });

  app.get("/api/form/readiness", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const session = await getAuthedUserSession(userId, req.query.sessionId as string);
      const workflowState = refreshWorkflowState(session);
      await storage.updateSession(session.id, { workflowState });
      return res.json({
        readiness: workflowState.lastReadiness ?? computeReadiness(session.formData, workflowState),
        workflowState,
      });
    } catch (err: any) {
      return res.status(404).json({ error: err.message });
    }
  });

  app.post("/api/review/update-field", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const body = reviewScalarUpdateSchema.parse(req.body);
      const session = await getAuthedUserSession(userId, body.formSessionId);
      const formData = cloneFormData(session.formData);
      setValueAtPath(formData as unknown as Record<string, unknown>, body.path, body.value);
      const workflowState = refreshWorkflowState({
        ...session,
        formData,
        workflowState: {
          ...session.workflowState,
          mode: session.paymentStatus === "completed" ? "post_payment_review" : "review",
          currentContext: session.paymentStatus === "completed" ? "post_payment_edits" : "review_edits",
          pendingRedirect: null,
          pdfNeedsRegeneration: Boolean(session.paymentStatus === "completed"),
          editHistory: [
            ...session.workflowState.editHistory,
            createReviewEdit(body.path, "set_scalar", "review"),
          ],
        },
      });
      await storage.updateSession(session.id, { formData, workflowState });
      await storage.updateFormData(session.id, formData);
      return res.json({ success: true, formData, workflowState, readiness: workflowState.lastReadiness });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/review/update-item", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const body = reviewListItemUpdateSchema.parse(req.body);
      const session = await getAuthedUserSession(userId, body.formSessionId);
      const formData = cloneFormData(session.formData);
      setValueAtPath(formData as unknown as Record<string, unknown>, `${body.path}[${body.index}]`, body.value);
      const workflowState = refreshWorkflowState({
        ...session,
        formData,
        workflowState: {
          ...session.workflowState,
          mode: session.paymentStatus === "completed" ? "post_payment_review" : "review",
          currentContext: session.paymentStatus === "completed" ? "post_payment_edits" : "review_edits",
          pendingRedirect: null,
          pdfNeedsRegeneration: Boolean(session.paymentStatus === "completed"),
          editHistory: [...session.workflowState.editHistory, createReviewEdit(body.path, "update_item", "review")],
        },
      });
      await storage.updateSession(session.id, { formData, workflowState });
      await storage.updateFormData(session.id, formData);
      return res.json({ success: true, formData, workflowState, readiness: workflowState.lastReadiness });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/review/add-item", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const body = reviewListItemAddSchema.parse(req.body);
      const session = await getAuthedUserSession(userId, body.formSessionId);
      const formData = cloneFormData(session.formData);
      appendListItem(formData as unknown as Record<string, unknown>, body.path, body.value);
      const workflowState = refreshWorkflowState({
        ...session,
        formData,
        workflowState: {
          ...session.workflowState,
          mode: session.paymentStatus === "completed" ? "post_payment_review" : "review",
          currentContext: session.paymentStatus === "completed" ? "post_payment_edits" : "review_edits",
          pendingRedirect: null,
          pdfNeedsRegeneration: Boolean(session.paymentStatus === "completed"),
          editHistory: [...session.workflowState.editHistory, createReviewEdit(body.path, "add_item", "review")],
        },
      });
      await storage.updateSession(session.id, { formData, workflowState });
      await storage.updateFormData(session.id, formData);
      return res.json({ success: true, formData, workflowState, readiness: workflowState.lastReadiness });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/review/remove-item", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const body = reviewListItemRemoveSchema.parse(req.body);
      const session = await getAuthedUserSession(userId, body.formSessionId);
      const formData = cloneFormData(session.formData);
      removeListItem(formData as unknown as Record<string, unknown>, body.path, body.index);
      const workflowState = refreshWorkflowState({
        ...session,
        formData,
        workflowState: {
          ...session.workflowState,
          mode: session.paymentStatus === "completed" ? "post_payment_review" : "review",
          currentContext: session.paymentStatus === "completed" ? "post_payment_edits" : "review_edits",
          pendingRedirect: null,
          pdfNeedsRegeneration: Boolean(session.paymentStatus === "completed"),
          editHistory: [...session.workflowState.editHistory, createReviewEdit(body.path, "remove_item", "review")],
        },
      });
      await storage.updateSession(session.id, { formData, workflowState });
      await storage.updateFormData(session.id, formData);
      return res.json({ success: true, formData, workflowState, readiness: workflowState.lastReadiness });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/pdf/generate", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { formSessionId } = req.body as { formSessionId: string };
      const session = await getAuthedUserSession(userId, formSessionId);
      const queued = await documentJobs.enqueue(session.id, "regenerate");
      await storage.createAuditEvent({
        userId,
        action: "document.regenerate.queued",
        targetType: "document_job",
        targetId: queued.jobId,
        metadata: { sessionId: session.id },
      });
      return res.status(202).json({
        success: true,
        queued: true,
        ...queued,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/jobs/:jobId", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const job = await storage.getJob(jobId);
    if (!job || job.userId !== userId) {
      return res.status(404).json({ error: "Job not found" });
    }
    return res.json({ job });
  });

  app.get("/api/documents", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const documents = await storage.listDocumentsByUser(userId);
    return res.json({ documents });
  });

  app.get("/api/pdf/download/:sessionId", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
      const session = await getAuthedUserSession(userId, sessionId);
      const document = await storage.getLatestDocumentBySession(session.id);
      if (!document) {
        return res.status(404).json({ error: "PDF not found. Generate it first." });
      }
      const fileBuffer = await readGeneratedDocument(document);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="N-400_Application.pdf"`);
      return res.end(fileBuffer);
    } catch (err: any) {
      return res.status(404).json({ error: err.message });
    }
  });

  app.post("/api/payment/checkout", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const body = paymentRequestSchema.parse(req.body);
      const session = await getAuthedUserSession(userId, body.formSessionId);
      const accountUser = await storage.getUser(userId);
      if (!accountUser?.emailVerified && isSupabaseConfigured()) {
        return res.status(400).json({ error: "Verify your email before checkout." });
      }
      const workflowState = refreshWorkflowState(session);
      if (!workflowState.lastReadiness?.eligibleForPayment) {
        return res.status(400).json({
          error: "Application is not ready for payment",
          readiness: workflowState.lastReadiness,
        });
      }

      const stripe = getStripeClient();
      if (stripe) {
        const checkoutSession = await stripe.checkout.sessions.create({
          mode: "payment",
          success_url: `${config.appUrl}/#/payment`,
          cancel_url: `${config.appUrl}/#/payment`,
          payment_method_types: ["card"],
          line_items: [
            {
              price: config.stripePriceId,
              quantity: 1,
            },
          ],
          metadata: {
            userId: session.userId,
            formSessionId: session.id,
          },
          customer_email: session.formData.personalInfo.email || accountUser?.username,
        });

        const payment = await storage.createPayment({
          userId: session.userId,
          sessionId: session.id,
          amountCents: config.paymentAmountCents,
          status: "pending",
          provider: "stripe",
          providerReference: checkoutSession.id,
          receiptEmail: session.formData.personalInfo.email,
        });

        await storage.createAuditEvent({
          userId,
          action: "payment.checkout.created",
          targetType: "payment",
          targetId: payment.id,
          metadata: { checkoutSessionId: checkoutSession.id, sessionId: session.id },
        });

        return res.status(202).json({
          success: true,
          paymentId: payment.id,
          status: payment.status,
          provider: "stripe",
          checkoutUrl: checkoutSession.url,
          message: "Redirecting to Stripe Checkout.",
        });
      }

      if (isProduction()) {
        return res.status(503).json({
          error: "Stripe checkout is not configured for production. Mock payments are disabled.",
        });
      }

      const payment = await storage.createPayment({
        userId: session.userId,
        sessionId: session.id,
        amountCents: config.paymentAmountCents,
        status: "completed",
        provider: "mock",
        providerReference: `pay_demo_${randomUUID().slice(0, 8)}`,
        receiptEmail: session.formData.personalInfo.email,
      });

      await storage.updateSession(session.id, {
        paymentStatus: "completed",
        status: "payment_pending",
        workflowState: {
          ...workflowState,
          mode: "post_payment_review",
          currentContext: "post_payment_edits",
          pendingRedirect: null,
        },
      });

      const queued = await documentJobs.enqueue(session.id, "payment");
      await storage.createAuditEvent({
        userId,
        action: "payment.completed",
        targetType: "payment",
        targetId: payment.id,
        metadata: { amountCents: payment.amountCents, sessionId: session.id, jobId: queued.jobId },
      });

      return res.status(202).json({
        success: true,
        paymentId: payment.id,
        amount: payment.amountCents,
        status: payment.status,
        provider: "mock",
        queued,
        message: "Payment recorded and document generation queued.",
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/payment/status/:sessionId", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
      const session = await getAuthedUserSession(userId, sessionId);
      const payments = await storage.listPaymentsByUser(userId);
      const latest = payments.find((payment) => payment.sessionId === session.id);
      return res.json({
        paymentStatus: session.paymentStatus || "none",
        latestPayment: latest ?? null,
      });
    } catch (err: any) {
      return res.status(404).json({ error: err.message });
    }
  });

  app.post("/api/tts", requireAuth, async (_req, res) => {
    return res.json({
      audioUrl: null,
      message: "TTS not configured. Connect ElevenLabs API for voice playback.",
    });
  });

  app.get("/api/admin/queue", requireAdmin, async (_req, res) => {
    const [tickets, requests, jobs] = await Promise.all([
      storage.listSupportTickets(),
      storage.listAccountRequests(),
      storage.listJobs(),
    ]);

    return res.json({
      supportTickets: tickets,
      privacyRequests: requests,
      openJobFailures: jobs.filter((job) => job.status === "failed"),
    });
  });

  app.get("/api/demo/session", async (_req, res) => {
    const session = await storage.getSession("demo-session-id");
    if (!session) return res.status(404).json({ error: "Demo session not found" });
    return res.json({
      formSessionId: session.id,
      userId: session.userId,
    });
  });

  return httpServer;
}
