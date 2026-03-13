import { createHmac, timingSafeEqual } from "crypto";
import type { StoredUser } from "./storage";
import type { ChatMessage, FormSession } from "@shared/schema";
import { buildFieldCatalogPrompt, getSectionPrompt, summarizeScope } from "./assistantCatalog";
import { config, getElevenLabsConfigStatus } from "./config";
import { getInitialMessage } from "./conversation";

interface ElevenLabsConversationTokenResponse {
  token: string;
}

interface ElevenLabsSignedUrlResponse {
  signed_url: string;
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

function buildRecentTranscriptSummary(session: FormSession) {
  const recentTurns = session.messages
    .filter((message) => message.role === "assistant" || message.role === "user")
    .slice(-6)
    .map((message) => `${message.role === "assistant" ? "Guide" : "User"}: ${message.content}`)
    .join("\n");

  return recentTurns || "No recent transcript is available yet.";
}

export function buildElevenLabsAgentPrompt(session: FormSession, user?: StoredUser) {
  const userName = user?.fullName?.trim() || "the applicant";
  const currentPrompt = session.workflowState.chatSession?.currentPrompt
    ?? session.workflowState.chatSession?.lastMeaningfulAssistantMessage
    ?? [...session.messages].reverse().find((message) => message.role === "assistant")?.content
    ?? getInitialMessage(session.currentSection);
  const awaitingUserResponse = session.workflowState.chatSession?.awaitingUserResponse ?? true;

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
    "Lead the conversation by asking the next concrete question. Do not start with a generic welcome unless recovery truly requires it.",
    "Do not move to review until transition_to_review succeeds.",
    "When review is ready, explain that clearly and then use navigate_to_review.",
    "Treat this as one ongoing conversation, even when the user reconnects or switches modes.",
    "If there is an active current prompt below, continue from that question instead of restarting the interview.",
    `You are currently helping ${userName}.`,
    buildCurrentStateSummary(session),
    `Awaiting user response: ${awaitingUserResponse ? "yes" : "no"}.`,
    `Current active question: ${currentPrompt}`,
    "Recent transcript context:",
    buildRecentTranscriptSummary(session),
    `Section guidance: ${getSectionPrompt(session.currentSection)}.`,
    "Field catalog:",
    buildFieldCatalogPrompt(),
  ].join("\n");
}

export function buildElevenLabsFirstMessage(session: FormSession) {
  const currentPrompt = session.workflowState.chatSession?.currentPrompt
    ?? session.workflowState.chatSession?.lastMeaningfulAssistantMessage
    ?? [...session.messages].reverse().find((message) => message.role === "assistant")?.content;

  if (currentPrompt) {
    return currentPrompt;
  }

  if (session.workflowState.mode === "review" || session.workflowState.mode === "post_payment_review") {
    return "Welcome back. We are in review mode. Tell me what you want to correct, or switch to typing if that is easier.";
  }

  if (session.messages.length === 0) {
    return getInitialMessage(session.currentSection);
  }

  return `We are continuing where we left off. ${getInitialMessage(session.currentSection)}`;
}

export function buildElevenLabsDynamicVariables(session: FormSession, user?: StoredUser) {
  const currentPrompt = session.workflowState.chatSession?.currentPrompt
    ?? session.workflowState.chatSession?.lastMeaningfulAssistantMessage
    ?? [...session.messages].reverse().find((message) => message.role === "assistant")?.content
    ?? getInitialMessage(session.currentSection);
  const recentUserReply = [...session.messages].reverse().find((message) => message.role === "user")?.content ?? "";

  return {
    user_first_name: user?.fullName?.split(" ")[0] || "there",
    form_session_id: session.id,
    current_section: session.currentSection,
    workflow_mode: session.workflowState.mode,
    ready_for_review: session.workflowState.readyForReview,
    missing_fields_summary: formatMissingFields(session),
    supported_scope_summary: JSON.stringify(summarizeScope(session.formData)),
    current_prompt: currentPrompt,
    awaiting_user_response: session.workflowState.chatSession?.awaitingUserResponse ? "true" : "false",
    last_user_reply: recentUserReply,
    review_context:
      session.workflowState.mode === "review" || session.workflowState.mode === "post_payment_review" ? "true" : "false",
  };
}

export async function createElevenLabsConversationToken() {
  const status = getElevenLabsConfigStatus();
  if (!status.configured) {
    throw new Error(`ElevenLabs is not configured on the web service. Missing: ${status.missing.join(", ")}`);
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

export async function createElevenLabsSignedUrl() {
  const status = getElevenLabsConfigStatus();
  if (!status.configured) {
    throw new Error(`ElevenLabs is not configured on the web service. Missing: ${status.missing.join(", ")}`);
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(config.elevenLabsAgentId)}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": config.elevenLabsApiKey,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create ElevenLabs signed URL: ${await response.text()}`);
  }

  const body = await response.json() as ElevenLabsSignedUrlResponse;
  return body.signed_url;
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
