import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  type User,
  type InsertUser,
  type FormSession,
  type N400FormData,
  type ChatMessage,
  type RedFlag,
  type Section,
  emptyFormData,
  createEmptyWorkflowState,
} from "@shared/schema";
import { canUseLocalStorage, config, isSupabaseConfigured, isProduction } from "./config";
import { hashPassword } from "./password";
import { getSupabaseAdminClient } from "./providers";

export interface PaymentRecord {
  id: string;
  userId: string;
  sessionId: string;
  amountCents: number;
  status: "pending" | "completed" | "failed" | "refunded";
  provider: "mock" | "stripe";
  providerReference?: string;
  receiptEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocument {
  id: string;
  userId: string;
  sessionId: string;
  jobId: string;
  kind: "n400_pdf";
  status: "queued" | "processing" | "available" | "failed";
  storagePath?: string;
  remotePath?: string;
  storageProvider?: "local" | "supabase";
  downloadUrl?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentJob {
  id: string;
  userId: string;
  sessionId: string;
  trigger: "payment" | "regenerate";
  status: "queued" | "processing" | "completed" | "failed";
  error?: string;
  documentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  sessionId?: string;
  category: "billing" | "technical" | "legal_scope" | "general";
  subject: string;
  message: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  userId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AccountRequest {
  id: string;
  userId: string;
  type: "export" | "delete";
  status: "requested" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface StoredUser extends User {
  passwordHash?: string;
  emailVerified?: boolean;
  marketingOptIn?: boolean;
  role?: "user" | "admin";
}

interface StoreShape {
  users: Record<string, StoredUser>;
  sessions: Record<string, FormSession>;
  payments: Record<string, PaymentRecord>;
  documents: Record<string, GeneratedDocument>;
  jobs: Record<string, DocumentJob>;
  supportTickets: Record<string, SupportTicket>;
  auditEvents: Record<string, AuditEvent>;
  accountRequests: Record<string, AccountRequest>;
}

export interface IStorage {
  getUser(id: string): Promise<StoredUser | undefined>;
  getUserByUsername(username: string): Promise<StoredUser | undefined>;
  createUser(user: InsertUser): Promise<StoredUser>;
  updateUser(id: string, updates: Partial<StoredUser>): Promise<StoredUser>;

  createSession(userId: string): Promise<FormSession>;
  getSession(id: string): Promise<FormSession | undefined>;
  getSessionByUser(userId: string): Promise<FormSession | undefined>;
  listSessionsByUser(userId: string): Promise<FormSession[]>;
  updateSession(id: string, updates: Partial<FormSession>): Promise<FormSession>;
  addMessage(sessionId: string, message: ChatMessage): Promise<void>;
  updateFormData(sessionId: string, data: N400FormData): Promise<void>;
  updateSection(sessionId: string, section: Section): Promise<void>;
  addRedFlag(sessionId: string, flag: RedFlag): Promise<void>;
  setRedFlags(sessionId: string, flags: RedFlag[]): Promise<void>;
  setPdfUrl(sessionId: string, url: string): Promise<void>;

  createPayment(input: Omit<PaymentRecord, "id" | "createdAt" | "updatedAt">): Promise<PaymentRecord>;
  updatePayment(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord>;
  listPaymentsByUser(userId: string): Promise<PaymentRecord[]>;
  getPaymentByProviderReference(providerReference: string): Promise<PaymentRecord | undefined>;

  createDocument(input: Omit<GeneratedDocument, "id" | "createdAt" | "updatedAt">): Promise<GeneratedDocument>;
  updateDocument(id: string, updates: Partial<GeneratedDocument>): Promise<GeneratedDocument>;
  listDocumentsByUser(userId: string): Promise<GeneratedDocument[]>;
  getLatestDocumentBySession(sessionId: string): Promise<GeneratedDocument | undefined>;

  createJob(input: Omit<DocumentJob, "id" | "createdAt" | "updatedAt">): Promise<DocumentJob>;
  updateJob(id: string, updates: Partial<DocumentJob>): Promise<DocumentJob>;
  getJob(id: string): Promise<DocumentJob | undefined>;
  listJobsByUser(userId: string): Promise<DocumentJob[]>;
  listJobs(): Promise<DocumentJob[]>;
  claimNextQueuedJob(workerId: string): Promise<DocumentJob | undefined>;

  createSupportTicket(input: Omit<SupportTicket, "id" | "createdAt" | "updatedAt" | "status">): Promise<SupportTicket>;
  listSupportTicketsByUser(userId: string): Promise<SupportTicket[]>;
  listSupportTickets(): Promise<SupportTicket[]>;

  createAccountRequest(input: Omit<AccountRequest, "id" | "createdAt" | "updatedAt" | "status">): Promise<AccountRequest>;
  listAccountRequestsByUser(userId: string): Promise<AccountRequest[]>;
  listAccountRequests(): Promise<AccountRequest[]>;

  createAuditEvent(input: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent>;
  listAuditEventsByUser(userId: string): Promise<AuditEvent[]>;
}

function now() {
  return new Date().toISOString();
}

function mapUserRow(row: any): StoredUser {
  return {
    id: row.id,
    username: row.email,
    password: "",
    fullName: row.full_name ?? undefined,
    emailVerified: row.email_verified ?? false,
    marketingOptIn: row.marketing_opt_in ?? false,
    role: row.role ?? "user",
  };
}

function mapSessionRow(row: any, messages: ChatMessage[] = []): FormSession {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    currentSection: row.current_section,
    formData: row.form_data ?? emptyFormData(),
    messages,
    redFlags: row.red_flags ?? [],
    workflowState: row.workflow_state ?? createEmptyWorkflowState(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pdfUrl: row.pdf_url ?? undefined,
    paymentStatus: row.payment_status ?? "none",
  };
}

function mapPaymentRow(row: any): PaymentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    amountCents: row.amount_cents,
    status: row.status,
    provider: row.provider,
    providerReference: row.provider_reference ?? undefined,
    receiptEmail: row.receipt_email ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocumentRow(row: any): GeneratedDocument {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    jobId: row.job_id,
    kind: row.kind,
    status: row.status,
    storagePath: row.storage_path ?? undefined,
    remotePath: row.remote_path ?? undefined,
    storageProvider: row.storage_provider ?? undefined,
    downloadUrl: row.download_url ?? undefined,
    fileSize: row.file_size ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJobRow(row: any): DocumentJob {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    trigger: row.trigger,
    status: row.status,
    error: row.error ?? undefined,
    documentId: row.document_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSupportRow(row: any): SupportTicket {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id ?? undefined,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAccountRequestRow(row: any): AccountRequest {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditRow(row: any): AuditEvent {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
  };
}

class SupabaseStorage implements IStorage {
  private client = getSupabaseAdminClient();

  private getDb(): any {
    if (!this.client) {
      throw new Error("Supabase storage requested without configuration");
    }
    return this.client;
  }

  async getUser(id: string) {
    const { data, error } = await this.getDb().from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapUserRow(data) : undefined;
  }

  async getUserByUsername(username: string) {
    const { data, error } = await this.getDb().from("profiles").select("*").eq("email", username).maybeSingle();
    if (error) throw error;
    return data ? mapUserRow(data) : undefined;
  }

  async createUser(insert: InsertUser) {
    const { data, error } = await this.getDb().auth.admin.createUser({
      email: insert.username,
      password: insert.password,
      email_confirm: false,
      user_metadata: { full_name: insert.fullName ?? null },
    });
    if (error || !data.user) throw error || new Error("Unable to create user");
    return {
      id: data.user.id,
      username: insert.username,
      password: "",
      fullName: insert.fullName,
      emailVerified: false,
      marketingOptIn: false,
      role: "user" as const,
    };
  }

  async updateUser(id: string, updates: Partial<StoredUser>) {
    const { data, error } = await this.getDb()
      .from("profiles")
      .update({
        full_name: updates.fullName,
        marketing_opt_in: updates.marketingOptIn,
        role: updates.role,
        email_verified: updates.emailVerified,
        updated_at: now(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapUserRow(data);
  }

  async createSession(userId: string) {
    const { data, error } = await this.getDb()
      .from("application_sessions")
      .insert({
        user_id: userId,
        status: "new",
        current_section: "INTRO",
        form_data: emptyFormData(),
        red_flags: [],
        workflow_state: createEmptyWorkflowState(),
        payment_status: "none",
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapSessionRow(data, []);
  }

  async getSession(id: string) {
    const { data, error } = await this.getDb().from("application_sessions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const { data: messageRows, error: messageError } = await this.getDb()
      .from("chat_messages")
      .select("*")
      .eq("session_id", id)
      .order("timestamp", { ascending: true });
    if (messageError) throw messageError;
    return mapSessionRow(
      data,
      (messageRows ?? []).map((row: any) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        section: row.section ?? undefined,
        extractedFields: row.extracted_fields ?? undefined,
        toolEvents: row.tool_events ?? undefined,
      })),
    );
  }

  async getSessionByUser(userId: string) {
    const { data, error } = await this.getDb()
      .from("application_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? this.getSession(data.id) : undefined;
  }

  async listSessionsByUser(userId: string) {
    const { data, error } = await this.getDb()
      .from("application_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => mapSessionRow(row, []));
  }

  async updateSession(id: string, updates: Partial<FormSession>) {
    const payload: Record<string, unknown> = { updated_at: now() };
    if (updates.status) payload.status = updates.status;
    if (updates.currentSection) payload.current_section = updates.currentSection;
    if (updates.formData) payload.form_data = updates.formData;
    if (updates.redFlags) payload.red_flags = updates.redFlags;
    if (updates.workflowState) payload.workflow_state = updates.workflowState;
    if (updates.pdfUrl !== undefined) payload.pdf_url = updates.pdfUrl;
    if (updates.paymentStatus) payload.payment_status = updates.paymentStatus;
    const { data, error } = await this.getDb().from("application_sessions").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    const session = await this.getSession(data.id);
    if (!session) throw new Error("Session not found after update");
    return session;
  }

  async addMessage(sessionId: string, message: ChatMessage) {
    const { data: session, error: sessionError } = await this.getDb()
      .from("application_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();
    if (sessionError) throw sessionError;
    const { error } = await this.getDb().from("chat_messages").insert({
      id: message.id,
      session_id: sessionId,
      user_id: session.user_id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      section: message.section ?? null,
      extracted_fields: message.extractedFields ?? null,
      tool_events: message.toolEvents ?? null,
    });
    if (error) throw error;
    await this.getDb().from("application_sessions").update({ updated_at: now() }).eq("id", sessionId);
  }

  async updateFormData(sessionId: string, data: N400FormData) {
    await this.updateSession(sessionId, { formData: data });
  }

  async updateSection(sessionId: string, section: Section) {
    await this.updateSession(sessionId, { currentSection: section, status: "in_progress" });
  }

  async addRedFlag(sessionId: string, flag: RedFlag) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");
    await this.setRedFlags(sessionId, [...session.redFlags, flag]);
  }

  async setRedFlags(sessionId: string, flags: RedFlag[]) {
    await this.updateSession(sessionId, { redFlags: flags });
  }

  async setPdfUrl(sessionId: string, url: string) {
    await this.updateSession(sessionId, { pdfUrl: url });
  }

  async createPayment(input: Omit<PaymentRecord, "id" | "createdAt" | "updatedAt">) {
    const { data, error } = await this.getDb()
      .from("payments")
      .insert({
        user_id: input.userId,
        session_id: input.sessionId,
        amount_cents: input.amountCents,
        status: input.status,
        provider: input.provider,
        provider_reference: input.providerReference ?? null,
        receipt_email: input.receiptEmail ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapPaymentRow(data);
  }

  async updatePayment(id: string, updates: Partial<PaymentRecord>) {
    const { data, error } = await this.getDb()
      .from("payments")
      .update({
        status: updates.status,
        provider_reference: updates.providerReference,
        receipt_email: updates.receiptEmail,
        updated_at: now(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapPaymentRow(data);
  }

  async listPaymentsByUser(userId: string) {
    const { data, error } = await this.getDb().from("payments").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPaymentRow);
  }

  async getPaymentByProviderReference(providerReference: string) {
    const { data, error } = await this.getDb().from("payments").select("*").eq("provider_reference", providerReference).maybeSingle();
    if (error) throw error;
    return data ? mapPaymentRow(data) : undefined;
  }

  async createDocument(input: Omit<GeneratedDocument, "id" | "createdAt" | "updatedAt">) {
    const { data, error } = await this.getDb()
      .from("generated_documents")
      .insert({
        user_id: input.userId,
        session_id: input.sessionId,
        job_id: input.jobId,
        kind: input.kind,
        status: input.status,
        storage_path: input.storagePath ?? null,
        remote_path: input.remotePath ?? null,
        storage_provider: input.storageProvider ?? null,
        download_url: input.downloadUrl ?? null,
        file_size: input.fileSize ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapDocumentRow(data);
  }

  async updateDocument(id: string, updates: Partial<GeneratedDocument>) {
    const { data, error } = await this.getDb()
      .from("generated_documents")
      .update({
        job_id: updates.jobId,
        status: updates.status,
        storage_path: updates.storagePath,
        remote_path: updates.remotePath,
        storage_provider: updates.storageProvider,
        download_url: updates.downloadUrl,
        file_size: updates.fileSize,
        updated_at: now(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDocumentRow(data);
  }

  async listDocumentsByUser(userId: string) {
    const { data, error } = await this.getDb()
      .from("generated_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDocumentRow);
  }

  async getLatestDocumentBySession(sessionId: string) {
    const { data, error } = await this.getDb()
      .from("generated_documents")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapDocumentRow(data) : undefined;
  }

  async createJob(input: Omit<DocumentJob, "id" | "createdAt" | "updatedAt">) {
    const { data, error } = await this.getDb()
      .from("document_jobs")
      .insert({
        user_id: input.userId,
        session_id: input.sessionId,
        trigger: input.trigger,
        status: input.status,
        error: input.error ?? null,
        document_id: input.documentId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapJobRow(data);
  }

  async updateJob(id: string, updates: Partial<DocumentJob>) {
    const { data, error } = await this.getDb()
      .from("document_jobs")
      .update({
        status: updates.status,
        error: updates.error,
        document_id: updates.documentId,
        updated_at: now(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapJobRow(data);
  }

  async getJob(id: string) {
    const { data, error } = await this.getDb().from("document_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapJobRow(data) : undefined;
  }

  async listJobsByUser(userId: string) {
    const { data, error } = await this.getDb().from("document_jobs").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapJobRow);
  }

  async listJobs() {
    const { data, error } = await this.getDb().from("document_jobs").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapJobRow);
  }

  async claimNextQueuedJob(_workerId: string) {
    const { data, error } = await this.getDb()
      .from("document_jobs")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return this.updateJob(data.id, { status: "processing", error: undefined });
  }

  async createSupportTicket(input: Omit<SupportTicket, "id" | "createdAt" | "updatedAt" | "status">) {
    const { data, error } = await this.getDb()
      .from("support_tickets")
      .insert({
        user_id: input.userId,
        session_id: input.sessionId ?? null,
        category: input.category,
        subject: input.subject,
        message: input.message,
        status: "open",
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapSupportRow(data);
  }

  async listSupportTicketsByUser(userId: string) {
    const { data, error } = await this.getDb().from("support_tickets").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapSupportRow);
  }

  async listSupportTickets() {
    const { data, error } = await this.getDb().from("support_tickets").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapSupportRow);
  }

  async createAccountRequest(input: Omit<AccountRequest, "id" | "createdAt" | "updatedAt" | "status">) {
    const { data, error } = await this.getDb()
      .from("privacy_requests")
      .insert({
        user_id: input.userId,
        type: input.type,
        status: "requested",
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAccountRequestRow(data);
  }

  async listAccountRequestsByUser(userId: string) {
    const { data, error } = await this.getDb().from("privacy_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAccountRequestRow);
  }

  async listAccountRequests() {
    const { data, error } = await this.getDb().from("privacy_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAccountRequestRow);
  }

  async createAuditEvent(input: Omit<AuditEvent, "id" | "createdAt">) {
    const { data, error } = await this.getDb()
      .from("audit_events")
      .insert({
        user_id: input.userId ?? null,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        metadata: input.metadata ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAuditRow(data);
  }

  async listAuditEventsByUser(userId: string) {
    const { data, error } = await this.getDb()
      .from("audit_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map(mapAuditRow);
  }
}

class JsonStorage implements IStorage {
  private filePath: string;
  private state: StoreShape;

  constructor() {
    const dataDir = path.resolve(config.dataDir);
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, "store.json");
    this.state = this.loadState();
    this.seedDemoData();
  }

  private loadState(): StoreShape {
    if (!fs.existsSync(this.filePath)) {
      return {
        users: {},
        sessions: {},
        payments: {},
        documents: {},
        jobs: {},
        supportTickets: {},
        auditEvents: {},
        accountRequests: {},
      };
    }
    return JSON.parse(fs.readFileSync(this.filePath, "utf8")) as StoreShape;
  }

  private saveState() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  private seedDemoData() {
    const existing = Object.values(this.state.users).find((user) => user.username === "demo@citizenflow.app");
    if (existing) return;

    const demoUser: StoredUser = {
      id: "demo-user-id",
      username: "demo@citizenflow.app",
      password: "",
      passwordHash: hashPassword("demo123"),
      fullName: "Demo User",
      emailVerified: true,
      marketingOptIn: false,
      role: "admin",
    };

    const demoSession: FormSession = {
      id: "demo-session-id",
      userId: demoUser.id,
      status: "in_progress",
      currentSection: "PERSONAL_INFO",
      formData: {
        personalInfo: {
          fullName: "CARLOS EDUARDO MARTINEZ",
          firstName: "CARLOS",
          lastName: "MARTINEZ",
          middleName: "EDUARDO",
          dateOfBirth: "04/15/1985",
          aNumber: "A987654321",
          uscisElisNumber: "1234567890",
          dateBecamePR: "06/01/2019",
          countryOfBirth: "Mexico",
          nationality: "Mexico",
          gender: "Male",
          ssn: "123-45-6789",
          email: "carlos.martinez@email.com",
          phone: "217-555-0100",
          mobilePhone: "217-555-0199",
          eligibilityBasis: "5-year LPR",
        },
        biographic: {
          ethnicity: "Hispanic",
          race: "White",
          heightFeet: 5,
          heightInches: 10,
          weightLbs: 175,
          eyeColor: "BRO",
          hairColor: "BLK",
        },
        residenceHistory: [
          {
            address: "123 Main Street, Apt 4B",
            city: "Springfield",
            state: "IL",
            zip: "62701",
            country: "United States",
            moveInDate: "08/2022",
          },
        ],
        family: {
          maritalStatus: "Married",
          timesMarried: 1,
          spouseTimesMarried: 1,
          spouse: {
            fullName: "MARIA ISABEL MARTINEZ",
            dateOfBirth: "09/22/1987",
            dateOfMarriage: "06/15/2013",
          },
          totalChildren: 2,
          householdSize: 4,
        },
        employment: [
          {
            employerName: "ABC Technology Corp",
            occupation: "Software Engineer",
            city: "Springfield",
            state: "IL",
            zip: "62701",
            country: "United States",
            startDate: "03/2020",
            endDate: "Present",
          },
        ],
        travelHistory: [
          {
            destination: "Mexico",
            departureDate: "12/20/2023",
            returnDate: "01/05/2024",
          },
        ],
        moralCharacter: {
          claimedUSCitizen: false,
          votedInElection: false,
          arrestedOrDetained: false,
          convictedOfCrime: false,
          usedIllegalDrugs: false,
          militaryService: false,
          registeredSelectiveService: true,
        },
        oath: {
          supportConstitution: true,
          willingTakeOath: true,
          willingBearArms: true,
          willingNoncombatService: true,
          willingNationalService: true,
        },
        mailingAddress: undefined,
        additionalInfo: [],
      },
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Welcome to CitizenFlow! I'm here to help you complete your N-400 Application for Naturalization.",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          section: "INTRO",
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Let's start with your personal information. What is your full legal name as it appears on your Green Card? (Please give me your first name, middle name, and last name.)",
          timestamp: new Date(Date.now() - 3500000).toISOString(),
          section: "PERSONAL_INFO",
        },
      ],
      redFlags: [],
      workflowState: createEmptyWorkflowState(),
      createdAt: now(),
      updatedAt: now(),
      paymentStatus: "none",
    };

    this.state.users[demoUser.id] = demoUser;
    this.state.sessions[demoSession.id] = demoSession;
    this.saveState();
  }

  async getUser(id: string) { return this.state.users[id]; }
  async getUserByUsername(username: string) { return Object.values(this.state.users).find((user) => user.username === username); }
  async createUser(insert: InsertUser) {
    const id = randomUUID();
    const user: StoredUser = {
      id,
      username: insert.username,
      password: "",
      passwordHash: insert.password,
      fullName: insert.fullName,
      emailVerified: false,
      marketingOptIn: false,
      role: "user",
    };
    this.state.users[id] = user;
    this.saveState();
    return user;
  }
  async updateUser(id: string, updates: Partial<StoredUser>) {
    const updated = { ...this.state.users[id], ...updates };
    this.state.users[id] = updated;
    this.saveState();
    return updated;
  }
  async createSession(userId: string) {
    const session: FormSession = {
      id: randomUUID(),
      userId,
      status: "new",
      currentSection: "INTRO",
      formData: emptyFormData(),
      messages: [],
      redFlags: [],
      workflowState: createEmptyWorkflowState(),
      createdAt: now(),
      updatedAt: now(),
      paymentStatus: "none",
    };
    this.state.sessions[session.id] = session;
    this.saveState();
    return session;
  }
  async getSession(id: string) { return this.state.sessions[id]; }
  async getSessionByUser(userId: string) {
    return Object.values(this.state.sessions).filter((session) => session.userId === userId).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  }
  async listSessionsByUser(userId: string) {
    return Object.values(this.state.sessions).filter((session) => session.userId === userId).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  async updateSession(id: string, updates: Partial<FormSession>) {
    const updated = { ...this.state.sessions[id], ...updates, updatedAt: now() };
    this.state.sessions[id] = updated;
    this.saveState();
    return updated;
  }
  async addMessage(sessionId: string, message: ChatMessage) {
    this.state.sessions[sessionId].messages.push(message);
    this.state.sessions[sessionId].updatedAt = now();
    this.saveState();
  }
  async updateFormData(sessionId: string, data: N400FormData) { await this.updateSession(sessionId, { formData: data }); }
  async updateSection(sessionId: string, section: Section) { await this.updateSession(sessionId, { currentSection: section, status: "in_progress" }); }
  async addRedFlag(sessionId: string, flag: RedFlag) { await this.setRedFlags(sessionId, [...this.state.sessions[sessionId].redFlags, flag]); }
  async setRedFlags(sessionId: string, flags: RedFlag[]) { await this.updateSession(sessionId, { redFlags: flags }); }
  async setPdfUrl(sessionId: string, url: string) { await this.updateSession(sessionId, { pdfUrl: url }); }
  async createPayment(input: Omit<PaymentRecord, "id" | "createdAt" | "updatedAt">) {
    const payment = { id: randomUUID(), ...input, createdAt: now(), updatedAt: now() };
    this.state.payments[payment.id] = payment;
    this.saveState();
    return payment;
  }
  async updatePayment(id: string, updates: Partial<PaymentRecord>) {
    const payment = { ...this.state.payments[id], ...updates, updatedAt: now() };
    this.state.payments[id] = payment;
    this.saveState();
    return payment;
  }
  async listPaymentsByUser(userId: string) { return Object.values(this.state.payments).filter((payment) => payment.userId === userId); }
  async getPaymentByProviderReference(providerReference: string) { return Object.values(this.state.payments).find((payment) => payment.providerReference === providerReference); }
  async createDocument(input: Omit<GeneratedDocument, "id" | "createdAt" | "updatedAt">) {
    const document = { id: randomUUID(), ...input, createdAt: now(), updatedAt: now() };
    this.state.documents[document.id] = document;
    this.saveState();
    return document;
  }
  async updateDocument(id: string, updates: Partial<GeneratedDocument>) {
    const document = { ...this.state.documents[id], ...updates, updatedAt: now() };
    this.state.documents[id] = document;
    this.saveState();
    return document;
  }
  async listDocumentsByUser(userId: string) { return Object.values(this.state.documents).filter((document) => document.userId === userId); }
  async getLatestDocumentBySession(sessionId: string) { return Object.values(this.state.documents).filter((document) => document.sessionId === sessionId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]; }
  async createJob(input: Omit<DocumentJob, "id" | "createdAt" | "updatedAt">) {
    const job = { id: randomUUID(), ...input, createdAt: now(), updatedAt: now() };
    this.state.jobs[job.id] = job;
    this.saveState();
    return job;
  }
  async updateJob(id: string, updates: Partial<DocumentJob>) {
    const job = { ...this.state.jobs[id], ...updates, updatedAt: now() };
    this.state.jobs[id] = job;
    this.saveState();
    return job;
  }
  async getJob(id: string) { return this.state.jobs[id]; }
  async listJobsByUser(userId: string) { return Object.values(this.state.jobs).filter((job) => job.userId === userId); }
  async listJobs() { return Object.values(this.state.jobs); }
  async claimNextQueuedJob(_workerId: string) {
    const next = Object.values(this.state.jobs).find((job) => job.status === "queued");
    if (!next) return undefined;
    return this.updateJob(next.id, { status: "processing" });
  }
  async createSupportTicket(input: Omit<SupportTicket, "id" | "createdAt" | "updatedAt" | "status">) {
    const ticket = { id: randomUUID(), ...input, status: "open" as const, createdAt: now(), updatedAt: now() };
    this.state.supportTickets[ticket.id] = ticket;
    this.saveState();
    return ticket;
  }
  async listSupportTicketsByUser(userId: string) { return Object.values(this.state.supportTickets).filter((ticket) => ticket.userId === userId); }
  async listSupportTickets() { return Object.values(this.state.supportTickets); }
  async createAccountRequest(input: Omit<AccountRequest, "id" | "createdAt" | "updatedAt" | "status">) {
    const request = { id: randomUUID(), ...input, status: "requested" as const, createdAt: now(), updatedAt: now() };
    this.state.accountRequests[request.id] = request;
    this.saveState();
    return request;
  }
  async listAccountRequestsByUser(userId: string) { return Object.values(this.state.accountRequests).filter((request) => request.userId === userId); }
  async listAccountRequests() { return Object.values(this.state.accountRequests); }
  async createAuditEvent(input: Omit<AuditEvent, "id" | "createdAt">) {
    const event = { id: randomUUID(), ...input, createdAt: now() };
    this.state.auditEvents[event.id] = event;
    this.saveState();
    return event;
  }
  async listAuditEventsByUser(userId: string) { return Object.values(this.state.auditEvents).filter((event) => event.userId === userId).slice(0, 100); }
}

function createStorage(): IStorage {
  if (isSupabaseConfigured()) {
    return new SupabaseStorage();
  }

  if (!canUseLocalStorage()) {
    throw new Error("Local JSON storage is disabled in production. Configure Supabase or enable an explicit override.");
  }

  if (isProduction()) {
    console.warn("Using local JSON storage in production because an explicit override is enabled.");
  }

  return new JsonStorage();
}

export const storage: IStorage = createStorage();
