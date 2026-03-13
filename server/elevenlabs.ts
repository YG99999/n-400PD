import { createHmac, timingSafeEqual } from "crypto";
import type { StoredUser } from "./storage";
import type { ChatMessage, FormSession } from "@shared/schema";
import { buildFieldCatalogPrompt, getSectionPrompt, summarizeScope } from "./assistantCatalog";
import { config, isElevenLabsConfigured } from "./config";
import { getInitialMessage } from "./conversation";

interface ElevenLabsConversationTokenResponse {
  token: string;
}

function formatMissingFields(session: FormSession) {
  const missingFields = session.workflowState.lastReadiness?.missingFields ?? [];
  return missingFields.length > 0 ? missingFields.slice(0, 8).join(", ") : "none";
}

function buildCurrentStateSummary(session: FormSession) {
  const scope = summarizeScope(session.formData);
  return [
    `Current section: ${session.currentSection}.`,
    `Workflow mode: ${session.workflowState.mode}.`,
    `Ready for review: ${session.workflowState.readyForReview ? "yes" : "no"}.`,
    `Missing fields: ${formatMissingFields(session)}.`,
    `Scope summary: ${JSON.stringify(scope)}.`,
  ].join(" ");
}

export function buildElevenLabsAgentPrompt(session: FormSession, user?: StoredUser) {
  const userName = user?.fullName?.trim() || "the applicant";
  return [
    "You are CitizenFlow's calm, voice-first N-400 intake guide.",
    "Speak in plain language. Ask exactly one focused question at a time.",
    "You help collect only the supported applicant-scope details needed for the current N-400 workflow.",
    "Never invent answers, never give legal advice beyond the supported app workflow, and never skip backend tool checks.",
    "Before deciding the next question, use get_form_state when context may be stale.",
    "Use update_form_fields as soon as information is clear enough.",
    "Confirm sensitive values before moving on: full names, birth dates, addresses, A-numbers, SSNs, and any spelled identifiers.",
    "If a user says they prefer typing, acknowledge it and call switch_to_text_mode.",
    "If the user is in review or post-payment review mode, only change the specific fields they ask to correct.",
    "Do not move to review until transition_to_review succeeds.",
    "When review is ready, explain that clearly and then use navigate_to_review.",
    `You are currently helping ${userName}.`,
    buildCurrentStateSummary(session),
    `Section guidance: ${getSectionPrompt(session.currentSection)}.`,
    "Field catalog:",
    buildFieldCatalogPrompt(),
  ].join("\n");
}

export function buildElevenLabsFirstMessage(session: FormSession) {
  if (session.messages.length === 0) {
    return getInitialMessage(session.currentSection);
  }

  if (session.workflowState.mode === "review" || session.workflowState.mode === "post_payment_review") {
    return "Welcome back. We are in review mode. Tell me what you want to correct, or switch to typing if that is easier.";
  }

  return `Welcome back. We are resuming at ${session.currentSection.replaceAll("_", " ").toLowerCase()}. I will ask one question at a time and keep your answers in sync.`;
}

export function buildElevenLabsDynamicVariables(session: FormSession, user?: StoredUser) {
  return {
    user_first_name: user?.fullName?.split(" ")[0] || "there",
    form_session_id: session.id,
    current_section: session.currentSection,
    workflow_mode: session.workflowState.mode,
    ready_for_review: session.workflowState.readyForReview,
    missing_fields_summary: formatMissingFields(session),
    supported_scope_summary: JSON.stringify(summarizeScope(session.formData)),
    review_context:
      session.workflowState.mode === "review" || session.workflowState.mode === "post_payment_review" ? "true" : "false",
  };
}

export async function createElevenLabsConversationToken() {
  if (!isElevenLabsConfigured()) {
    throw new Error("ElevenLabs is not configured");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(config.elevenLabsAgentId)}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": config.elevenLabsApiKey,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create ElevenLabs conversation token: ${await response.text()}`);
  }

  const body = await response.json() as ElevenLabsConversationTokenResponse;
  return body.token;
}

export function verifyElevenLabsWebhookSignature(rawBody: string, signatureHeader?: string | string[] | null) {
  if (!config.elevenLabsWebhookSecret) {
    return true;
  }

  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) {
    return false;
  }

  const expected = createHmac("sha256", config.elevenLabsWebhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature.trim());

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function mapTranscriptMessage(message: ChatMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    section: message.section,
    modality: message.modality ?? "voice",
    conversationId: message.conversationId,
  };
}
