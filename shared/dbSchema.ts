import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  emailVerified: boolean("email_verified").notNull().default(false),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const applicationSessions = pgTable("application_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  status: text("status").notNull(),
  currentSection: text("current_section").notNull(),
  formData: jsonb("form_data").notNull(),
  redFlags: jsonb("red_flags").notNull(),
  workflowState: jsonb("workflow_state").notNull(),
  paymentStatus: text("payment_status").notNull(),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  section: text("section"),
  extractedFields: jsonb("extracted_fields"),
  toolEvents: jsonb("tool_events"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  providerReference: text("provider_reference"),
  receiptEmail: text("receipt_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
});

export const documentJobs = pgTable("document_jobs", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  documentId: uuid("document_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const generatedDocuments = pgTable("generated_documents", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  jobId: uuid("job_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  storagePath: text("storage_path"),
  remotePath: text("remote_path"),
  storageProvider: text("storage_provider"),
  downloadUrl: text("download_url"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  sessionId: uuid("session_id"),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const privacyRequests = pgTable("privacy_requests", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
