import { z } from "zod";

// ── Section definitions ──
export const SECTIONS = [
  "INTRO",
  "PERSONAL_INFO",
  "RESIDENCE_HISTORY",
  "FAMILY_INFO",
  "EMPLOYMENT",
  "TRAVEL",
  "MORAL_CHARACTER",
  "OATH",
  "REVIEW",
] as const;

export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  INTRO: "Getting Started",
  PERSONAL_INFO: "Personal Information",
  RESIDENCE_HISTORY: "Residence History",
  FAMILY_INFO: "Family Information",
  EMPLOYMENT: "Employment History",
  TRAVEL: "Travel History",
  MORAL_CHARACTER: "Good Moral Character",
  OATH: "Oath & Allegiance",
  REVIEW: "Review & Submit",
};

// ── Form data shape (structured fields extracted from conversation) ──
export interface PersonalInfo {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  otherNamesUsed?: Array<{
    firstName?: string;
    lastName?: string;
    middleName?: string;
  }>;
  dateOfBirth?: string;
  aNumber?: string;
  uscisElisNumber?: string;
  dateBecamePR?: string; // MM/DD/YYYY
  countryOfBirth?: string;
  nationality?: string;
  gender?: string;
  ssn?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  eligibilityBasis?: string;
  eligibilityOtherExplanation?: string;
  eligibilityUscisOffice?: string;
}

export interface ResidenceEntry {
  address?: string;
  inCareOfName?: string;
  city?: string;
  state?: string;
  zip?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  moveInDate?: string;
  moveOutDate?: string;
}

export interface SpouseInfo {
  fullName?: string;
  dateOfBirth?: string;
  dateOfMarriage?: string;
  isCitizen?: boolean;
  citizenshipBy?: string;
  aNumber?: string;
  dateBecameCitizen?: string;
  currentEmployer?: string;
}

export interface ChildInfo {
  fullName?: string;
  dateOfBirth?: string;
  countryOfBirth?: string;
  aNumber?: string;
  livesWithYou?: boolean;
  relationship?: string;
  residence?: string;
  receivingSupport?: boolean;
}

export interface FamilyInfo {
  maritalStatus?: string;
  timesMarried?: number;
  spouseTimesMarried?: number;
  spouse?: SpouseInfo;
  children?: ChildInfo[];
  totalChildren?: number;
  householdSize?: number;
  totalHouseholdIncome?: number;
  householdIncomeEarners?: number;
  feeReductionRequested?: boolean;
  headOfHousehold?: boolean;
  headOfHouseholdName?: string;
}

export interface EmploymentEntry {
  employerName?: string;
  occupation?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
}

export interface TravelEntry {
  destination?: string;
  departureDate?: string;
  returnDate?: string;
}

export interface BiographicInfo {
  ethnicity?: "Hispanic" | "NotHispanic";
  race?: string; // "White" | "Asian" | "Black" | "AmericanIndian" | "PacificIslander"
  heightFeet?: number;
  heightInches?: number;
  weightLbs?: number;
  eyeColor?: string; // BRO, BLU, GRN, HAZ, GRY, BLK, PNK, MAR, XXX
  hairColor?: string; // BAL, SDY, RED, WHI, GRY, BLN, BRO, BLK, XXX
}

export interface MoralCharacter {
  claimedUSCitizen?: boolean;
  votedInElection?: boolean;
  alwaysFiledTaxes?: boolean;
  owedUnpaidTaxes?: boolean;
  arrestedOrDetained?: boolean;
  convictedOfCrime?: boolean;
  usedIllegalDrugs?: boolean;
  habitualDrunkard?: boolean;
  helpedIllegalEntry?: boolean;
  liedToGovernment?: boolean;
  deported?: boolean;
  memberOfOrganizations?: boolean;
  communistPartyMember?: boolean;
  terroristAssociation?: boolean;
  committedViolence?: boolean;
  militaryService?: boolean;
  registeredSelectiveService?: boolean;
}

export interface OathInfo {
  supportConstitution?: boolean;
  willingTakeOath?: boolean;
  willingBearArms?: boolean;
  willingNoncombatService?: boolean;
  willingNationalService?: boolean;
}

export interface N400FormData {
  personalInfo: PersonalInfo;
  biographic: BiographicInfo;
  residenceHistory: ResidenceEntry[];
  mailingAddress?: ResidenceEntry;
  family: FamilyInfo;
  employment: EmploymentEntry[];
  travelHistory: TravelEntry[];
  moralCharacter: MoralCharacter;
  oath: OathInfo;
  additionalInfo?: Array<{
    pageNumber?: string;
    partNumber?: string;
    itemNumber?: string;
    response?: string;
  }>;
}

// ── Red flags ──
export interface RedFlag {
  type: string;
  severity: "info" | "warning" | "error";
  field?: string;
  description: string;
  recommendation?: string;
}

export interface CatalogFieldRequirement {
  path: string;
  equals: string | number | boolean;
}

export type WorkflowMode = "chat" | "review" | "post_payment_review";
export type SectionCollectionStatus =
  | "not_started"
  | "in_progress"
  | "ready_for_review"
  | "completed";

export interface FieldCollectionState {
  path: string;
  section: Section;
  status: "missing" | "partial" | "complete";
  confidence: "low" | "medium" | "high";
  required: boolean;
  source: "assistant" | "review" | "system";
  note?: string;
  updatedAt?: string;
}

export interface SectionProgressState {
  section: Section;
  status: SectionCollectionStatus;
  missingFields: string[];
  completedFields: string[];
  summary?: string;
  updatedAt?: string;
}

export interface ReadinessStatus {
  eligibleForReview: boolean;
  eligibleForPayment: boolean;
  eligibleForPdf: boolean;
  missingFields: string[];
  unresolvedFields: string[];
  warnings: string[];
  errors: string[];
  unsupportedFields: string[];
  stalePdf: boolean;
}

export interface ToolEvent {
  id: string;
  type:
    | "get_form_state"
    | "update_form_fields"
    | "mark_section_complete"
    | "reopen_section"
    | "run_readiness_check"
    | "transition_to_review"
    | "transition_to_payment";
  status: "completed" | "rejected";
  payload: Record<string, unknown>;
  createdAt: string;
}

export type ConversationMode = "voice" | "text";
export type ConversationState =
  | "idle"
  | "bootstrapping"
  | "connecting_voice"
  | "connecting_text"
  | "connected_voice"
  | "connected_text"
  | "degraded"
  | "error";
export type AgentStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "error";

export interface ReviewEdit {
  id: string;
  path: string;
  action: "set_scalar" | "update_item" | "add_item" | "remove_item";
  source: "review" | "chat";
  timestamp: string;
}

export interface WorkflowState {
  mode: WorkflowMode;
  currentContext: "intake" | "review_edits" | "post_payment_edits";
  sectionStates: Record<Section, SectionProgressState>;
  fieldStates: Record<string, FieldCollectionState>;
  outstandingQuestions: string[];
  lastAssistantSummary?: string;
  lastReadiness?: ReadinessStatus;
  pendingRedirect?: "review" | null;
  readyForReview: boolean;
  pdfNeedsRegeneration: boolean;
  reviewConfirmedAt?: string;
  toolEvents: ToolEvent[];
  editHistory: ReviewEdit[];
}

// ── Chat message ──
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  section?: Section;
  extractedFields?: Record<string, unknown>;
  toolEvents?: ToolEvent[];
  modality?: ConversationMode;
  conversationId?: string;
  eventId?: number;
  transcriptKind?: "voice_user" | "text_user" | "assistant";
}

export interface ElevenLabsSessionDebug {
  transport: "websocket" | "webrtc";
  serverLocation: string;
  agentId: string;
  signedUrlPresent: boolean;
  conversationTokenPresent: boolean;
  dynamicVariableKeys: string[];
}

// ── Form session ──
export type SessionStatus =
  | "new"
  | "in_progress"
  | "review"
  | "payment_pending"
  | "completed";

export interface FormSession {
  id: string;
  userId: string;
  status: SessionStatus;
  currentSection: Section;
  formData: N400FormData;
  messages: ChatMessage[];
  redFlags: RedFlag[];
  workflowState: WorkflowState;
  createdAt: string;
  updatedAt: string;
  pdfUrl?: string;
  paymentStatus?: "none" | "pending" | "completed";
}

// ── User ──
export interface User {
  id: string;
  username: string;
  password: string;
  fullName?: string;
  emailVerified?: boolean;
  marketingOptIn?: boolean;
}

export type InsertUser = Omit<User, "id">;

// ── API request / response schemas (Zod) ──
export const chatRequestSchema = z.object({
  formSessionId: z.string(),
  message: z.string().min(1).max(5000),
  conversationStep: z.string().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const elevenLabsSessionRequestSchema = z.object({
  formSessionId: z.string(),
  mode: z.enum(["voice", "text"]).optional(),
});
export type ElevenLabsSessionRequest = z.infer<typeof elevenLabsSessionRequestSchema>;

export const elevenLabsToolRequestSchema = z.object({
  formSessionId: z.string(),
  toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
  conversationId: z.string().optional(),
});
export type ElevenLabsToolRequest = z.infer<typeof elevenLabsToolRequestSchema>;

export const elevenLabsTranscriptMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(5000),
  timestamp: z.string(),
  section: z.enum(SECTIONS).optional(),
  modality: z.enum(["voice", "text"]).default("voice"),
  conversationId: z.string().optional(),
  eventId: z.number().int().optional(),
  transcriptKind: z.enum(["voice_user", "text_user", "assistant"]).optional(),
});

export const elevenLabsTranscriptPersistRequestSchema = z.object({
  formSessionId: z.string(),
  message: elevenLabsTranscriptMessageSchema,
});
export type ElevenLabsTranscriptPersistRequest = z.infer<typeof elevenLabsTranscriptPersistRequestSchema>;

export const reviewScalarUpdateSchema = z.object({
  formSessionId: z.string(),
  path: z.string().min(1),
  value: z.any(),
});
export type ReviewScalarUpdateRequest = z.infer<typeof reviewScalarUpdateSchema>;

export const reviewListItemUpdateSchema = z.object({
  formSessionId: z.string(),
  path: z.string().min(1),
  index: z.number().int().min(0),
  value: z.any(),
});
export type ReviewListItemUpdateRequest = z.infer<typeof reviewListItemUpdateSchema>;

export const reviewListItemAddSchema = z.object({
  formSessionId: z.string(),
  path: z.string().min(1),
  value: z.any(),
});
export type ReviewListItemAddRequest = z.infer<typeof reviewListItemAddSchema>;

export const reviewListItemRemoveSchema = z.object({
  formSessionId: z.string(),
  path: z.string().min(1),
  index: z.number().int().min(0),
});
export type ReviewListItemRemoveRequest = z.infer<typeof reviewListItemRemoveSchema>;

export const formSaveRequestSchema = z.object({
  formSessionId: z.string(),
  formData: z.any(),
  currentSection: z.string(),
});
export type FormSaveRequest = z.infer<typeof formSaveRequestSchema>;

export const pdfGenerateRequestSchema = z.object({
  formSessionId: z.string(),
  overrideValidation: z.boolean().optional(),
});

export const paymentRequestSchema = z.object({
  formSessionId: z.string(),
});

export const supportTicketCreateSchema = z.object({
  sessionId: z.string().optional(),
  category: z.enum(["billing", "technical", "legal_scope", "general"]),
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(5000),
});

export const accountPreferenceSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  marketingOptIn: z.boolean().optional(),
});

export const accountRequestCreateSchema = z.object({
  type: z.enum(["export", "delete"]),
});

export type SupportTicketCreateRequest = z.infer<typeof supportTicketCreateSchema>;
export type AccountPreferenceRequest = z.infer<typeof accountPreferenceSchema>;
export type AccountRequestCreate = z.infer<typeof accountRequestCreateSchema>;

// ── Helper to create empty form data ──
export function emptyFormData(): N400FormData {
  return {
    personalInfo: {},
    biographic: {},
    residenceHistory: [],
    mailingAddress: undefined,
    family: {},
    employment: [],
    travelHistory: [],
    moralCharacter: {},
    oath: {},
    additionalInfo: [],
  };
}

export function createEmptyWorkflowState(): WorkflowState {
  const updatedAt = new Date().toISOString();
  const sectionStates = Object.fromEntries(
    SECTIONS.map((section) => [
      section,
      {
        section,
        status: section === "INTRO" ? "in_progress" : "not_started",
        missingFields: [],
        completedFields: [],
        updatedAt,
      } satisfies SectionProgressState,
    ]),
  ) as unknown as Record<Section, SectionProgressState>;

  return {
    mode: "chat",
    currentContext: "intake",
    sectionStates,
    fieldStates: {},
    outstandingQuestions: [],
    lastReadiness: {
      eligibleForReview: false,
      eligibleForPayment: false,
      eligibleForPdf: false,
      missingFields: [],
      unresolvedFields: [],
      warnings: [],
      errors: [],
      unsupportedFields: [],
      stalePdf: false,
    },
    pendingRedirect: null,
    readyForReview: false,
    pdfNeedsRegeneration: false,
    toolEvents: [],
    editHistory: [],
  };
}
