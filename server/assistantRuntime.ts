import { randomUUID } from "crypto";
import type {
  ChatMessage,
  FormSession,
  N400FormData,
  ReadinessStatus,
  Section,
  ToolEvent,
  WorkflowState,
} from "@shared/schema";
import { SECTIONS } from "@shared/schema";
import { getInitialMessage, processMessage } from "./conversation";
import { buildFieldCatalogPrompt, determineSectionForPath, getSectionPrompt, summarizeScope } from "./assistantCatalog";
import {
  cloneFormData,
  computeReadiness,
  createToolEvent,
  refreshWorkflowState,
  setValueAtPath,
} from "./workflowState";

interface AssistantTurnResult {
  botMessage: string;
  updatedFormData: N400FormData;
  workflowState: WorkflowState;
  currentSection: Section;
  redirectIntent: "review" | null;
  readiness: ReadinessStatus;
  toolEvents: ToolEvent[];
  redFlags: FormSession["redFlags"];
  extractedFields: Record<string, unknown>;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const BACKEND_ONLY_TOOLS = new Set(["transition_to_payment"]);

export interface AssistantToolExecutionResult {
  output: Record<string, unknown> | ReadinessStatus;
  workflowState: WorkflowState;
  currentSection: Section;
  event: ToolEvent;
  updatedFormData: N400FormData;
}

export async function processAssistantTurn(
  session: FormSession,
  userMessage: string,
): Promise<AssistantTurnResult> {
  if (!process.env.OPENAI_API_KEY) {
    return runFallbackAssistantTurn(session, userMessage);
  }

  try {
    return await runOpenAiAssistantTurn(session, userMessage);
  } catch (error) {
    console.error("Assistant runtime failed, falling back to local engine:", error);
    return runFallbackAssistantTurn(session, userMessage);
  }
}

async function runOpenAiAssistantTurn(
  session: FormSession,
  userMessage: string,
): Promise<AssistantTurnResult> {
  const workingForm = cloneFormData(session.formData);
  let workingWorkflow = refreshWorkflowState(session);
  let currentSection = session.currentSection;
  const toolEvents: ToolEvent[] = [];
  const extractedFields: Record<string, unknown> = {};

  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(session, workingWorkflow),
    },
    ...session.messages.slice(-18).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: userMessage },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "get_form_state",
        description: "Read the current form state, workflow status, and outstanding gaps before asking the next question.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_form_fields",
        description: "Update one or more form fields after the user gives information or confirms a correction.",
        parameters: {
          type: "object",
          properties: {
            updates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  value: {},
                },
                required: ["path", "value"],
                additionalProperties: false,
              },
            },
            note: { type: "string" },
          },
          required: ["updates"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "mark_section_complete",
        description: "Mark a section complete only when all required in-scope fields for that section have been collected confidently.",
        parameters: {
          type: "object",
          properties: {
            section: { type: "string", enum: SECTIONS },
            summary: { type: "string" },
          },
          required: ["section", "summary"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reopen_section",
        description: "Reopen a section when the user changes information or when the assistant detects missing or contradictory data.",
        parameters: {
          type: "object",
          properties: {
            section: { type: "string", enum: SECTIONS },
            reason: { type: "string" },
          },
          required: ["section", "reason"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_readiness_check",
        description: "Check whether the application is ready for review and later PDF generation.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "transition_to_review",
        description: "Transition to review only after readiness confirms the application is complete for the current supported scope.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
          },
          required: ["summary"],
          additionalProperties: false,
        },
      },
    },
  ];

  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new Error("OpenAI returned no assistant message.");
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: message.content || "",
        tool_calls: message.tool_calls,
      } as never);

      for (const toolCall of message.tool_calls) {
        const args = safeJsonParse(toolCall.function.arguments);
        const result = executeAssistantToolCall(
          toolCall.function.name,
          args,
          {
            formData: workingForm,
            workflowState: workingWorkflow,
            currentSection,
            paymentStatus: session.paymentStatus,
            pdfUrl: session.pdfUrl,
          },
          extractedFields,
        );
        workingWorkflow = result.workflowState;
        currentSection = result.currentSection;
        toolEvents.push(result.event);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.output),
        } as never);
      }
      continue;
    }

    const combinedToolEvents = appendToolEvents(workingWorkflow.toolEvents, toolEvents);
    workingWorkflow = refreshWorkflowState({
      formData: workingForm,
      paymentStatus: session.paymentStatus,
      pdfUrl: session.pdfUrl,
      workflowState: {
        ...workingWorkflow,
        toolEvents: combinedToolEvents,
        pendingRedirect: workingWorkflow.readyForReview ? "review" : workingWorkflow.pendingRedirect,
      },
      currentSection,
    });

    return {
      botMessage: message.content || getInitialMessage(currentSection),
      updatedFormData: workingForm,
      workflowState: {
        ...workingWorkflow,
        toolEvents: combinedToolEvents,
      },
      currentSection,
      redirectIntent: workingWorkflow.pendingRedirect ?? null,
      readiness: workingWorkflow.lastReadiness || computeReadiness(workingForm, workingWorkflow),
      toolEvents,
      redFlags: session.redFlags,
      extractedFields,
    };
  }

  throw new Error("Assistant exceeded tool loop limit.");
}

export function executeAssistantToolCall(
  name: string,
  args: Record<string, unknown>,
  session: Pick<FormSession, "formData" | "workflowState" | "currentSection" | "paymentStatus" | "pdfUrl">,
  extractedFields: Record<string, unknown>,
): AssistantToolExecutionResult {
  const formData = session.formData;
  const workflowState = session.workflowState;
  const currentSection = session.currentSection;
  const updatedWorkflow = { ...workflowState, toolEvents: [...workflowState.toolEvents] };
  switch (name) {
    case "get_form_state": {
      const output = {
        currentSection,
        mode: updatedWorkflow.mode,
        readiness: updatedWorkflow.lastReadiness,
        outstandingQuestions: updatedWorkflow.outstandingQuestions,
        scopeSummary: summarizeScope(formData),
      };
      return {
        output,
        workflowState: updatedWorkflow,
        currentSection,
        event: createToolEvent("get_form_state", "completed", output),
        updatedFormData: formData,
      };
    }
    case "update_form_fields": {
      const updates = Array.isArray(args.updates) ? args.updates : [];
      for (const update of updates) {
        const path = typeof update === "object" && update && "path" in update ? String(update.path) : "";
        if (!path) continue;
        const value = typeof update === "object" && update ? (update as Record<string, unknown>).value : undefined;
        setValueAtPath(formData as unknown as Record<string, unknown>, path, value);
        extractedFields[path] = value;
      }
      const refreshed = refreshWorkflowState({
        formData,
        paymentStatus: session.paymentStatus,
        pdfUrl: session.pdfUrl,
        workflowState: updatedWorkflow,
        currentSection,
      });
      return {
        output: { updated: updates.length },
        workflowState: refreshed,
        currentSection,
        event: createToolEvent("update_form_fields", "completed", { updates }),
        updatedFormData: formData,
      };
    }
    case "mark_section_complete": {
      const section = (args.section as Section) || currentSection;
      const refreshed = refreshWorkflowState({
        formData,
        paymentStatus: session.paymentStatus,
        pdfUrl: session.pdfUrl,
        workflowState: updatedWorkflow,
        currentSection: section,
      });
      if (refreshed.sectionStates[section].missingFields.length > 0) {
        return {
          output: {
            rejected: true,
            section,
            missingFields: refreshed.sectionStates[section].missingFields,
          },
          workflowState: refreshed,
          currentSection,
          event: createToolEvent("mark_section_complete", "rejected", {
            section,
            missingFields: refreshed.sectionStates[section].missingFields,
          }),
          updatedFormData: formData,
        };
      }
      refreshed.sectionStates[section] = {
        ...refreshed.sectionStates[section],
        status: "completed",
        summary: String(args.summary || ""),
        updatedAt: new Date().toISOString(),
      };
      const nextSection = SECTIONS[Math.min(SECTIONS.indexOf(section) + 1, SECTIONS.length - 1)] as Section;
      return {
        output: { section, nextSection },
        workflowState: refreshed,
        currentSection: nextSection,
        event: createToolEvent("mark_section_complete", "completed", { section, nextSection }),
        updatedFormData: formData,
      };
    }
    case "reopen_section": {
      const section = (args.section as Section) || determineSectionForPath(String(args.reason || currentSection));
      const refreshed = refreshWorkflowState({
        formData,
        paymentStatus: session.paymentStatus,
        pdfUrl: session.pdfUrl,
        workflowState: {
          ...updatedWorkflow,
          mode: "chat",
          currentContext: updatedWorkflow.mode === "post_payment_review" ? "post_payment_edits" : "review_edits",
          pendingRedirect: null,
        },
        currentSection: section,
      });
      refreshed.sectionStates[section] = {
        ...refreshed.sectionStates[section],
        status: "in_progress",
        summary: String(args.reason || ""),
        updatedAt: new Date().toISOString(),
      };
      return {
        output: { section },
        workflowState: refreshed,
        currentSection: section,
        event: createToolEvent("reopen_section", "completed", { section, reason: args.reason }),
        updatedFormData: formData,
      };
    }
    case "run_readiness_check": {
      const refreshed = refreshWorkflowState({
        formData,
        paymentStatus: session.paymentStatus,
        pdfUrl: session.pdfUrl,
        workflowState: updatedWorkflow,
        currentSection,
      });
      return {
        output: refreshed.lastReadiness ?? {},
        workflowState: refreshed,
        currentSection,
        event: createToolEvent("run_readiness_check", "completed", (refreshed.lastReadiness || {}) as Record<string, unknown>),
        updatedFormData: formData,
      };
    }
    case "transition_to_review": {
      const readinessChecked = refreshWorkflowState({
        formData,
        paymentStatus: session.paymentStatus,
        pdfUrl: session.pdfUrl,
        workflowState: updatedWorkflow,
        currentSection,
      });
      if (!readinessChecked.lastReadiness?.eligibleForReview) {
        return {
          output: {
            rejected: true,
            reason: "readiness_failed",
            readiness: readinessChecked.lastReadiness,
          },
          workflowState: readinessChecked,
          currentSection,
          event: createToolEvent("transition_to_review", "rejected", {
            reason: "readiness_failed",
            missingFields: readinessChecked.lastReadiness?.missingFields ?? [],
            errors: readinessChecked.lastReadiness?.errors ?? [],
          }),
          updatedFormData: formData,
        };
      }
      const refreshed = refreshWorkflowState({
        formData,
        paymentStatus: session.paymentStatus,
        pdfUrl: session.pdfUrl,
        workflowState: {
          ...readinessChecked,
          mode: "review",
          currentContext: "review_edits",
          pendingRedirect: "review",
          lastAssistantSummary: String(args.summary || ""),
        },
        currentSection: "REVIEW",
      });
      return {
        output: { redirect: "review" },
        workflowState: refreshed,
        currentSection: "REVIEW",
        event: createToolEvent("transition_to_review", "completed", { summary: args.summary }),
        updatedFormData: formData,
      };
    }
    case "transition_to_payment": {
      const readinessChecked = refreshWorkflowState({
        formData,
        paymentStatus: session.paymentStatus,
        pdfUrl: session.pdfUrl,
        workflowState: updatedWorkflow,
        currentSection,
      });
      if (!readinessChecked.lastReadiness?.eligibleForPayment) {
        return {
          output: {
            rejected: true,
            reason: "payment_not_ready",
            readiness: readinessChecked.lastReadiness,
          },
          workflowState: readinessChecked,
          currentSection,
          event: createToolEvent("transition_to_payment", "rejected", {
            reason: "payment_not_ready",
            missingFields: readinessChecked.lastReadiness?.missingFields ?? [],
            errors: readinessChecked.lastReadiness?.errors ?? [],
          }),
          updatedFormData: formData,
        };
      }
      return {
        output: {
          redirect: "payment",
          eligibleForPayment: true,
        },
        workflowState: readinessChecked,
        currentSection: "REVIEW",
        event: createToolEvent("transition_to_payment", "completed", {
          eligibleForPayment: true,
        }),
        updatedFormData: formData,
      };
    }
    default:
      return {
        output: { rejected: true },
        workflowState: updatedWorkflow,
        currentSection,
        event: createToolEvent("get_form_state", "rejected", { name }),
        updatedFormData: formData,
      };
  }
}

export function isBackendAssistantTool(name: string) {
  return !BACKEND_ONLY_TOOLS.has(name) || name === "transition_to_payment";
}

function buildSystemPrompt(session: FormSession, workflowState: WorkflowState) {
  return [
    "You are CitizenFlow's production N-400 filing assistant.",
    "Your job is to collect only the supported applicant-scope information needed to prepare the N-400 PDF confidently.",
    "Use tool calls to read and update state. Never invent facts. If a user is ambiguous, restate what you understood and ask a focused follow-up.",
    "Do not move to review until the readiness check says the application is complete for the supported scope.",
    "When in review or post-payment review mode, only change the specific fields the user wants to correct and preserve all other data.",
    `Current workflow mode: ${workflowState.mode}.`,
    `Current section: ${session.currentSection}.`,
    `Section guidance: ${getSectionPrompt(session.currentSection)}.`,
    "Field catalog:",
    buildFieldCatalogPrompt(),
  ].join("\n");
}

function runFallbackAssistantTurn(session: FormSession, userMessage: string): AssistantTurnResult {
  const fallback = processMessage(
    userMessage,
    session.currentSection,
    session.formData,
    session.messages,
  );

  const workflowState = refreshWorkflowState({
    formData: fallback.updatedFormData,
    paymentStatus: session.paymentStatus,
    pdfUrl: session.pdfUrl,
    workflowState: session.workflowState,
    currentSection: fallback.nextSection || session.currentSection,
  });

  if (fallback.shouldMoveToNextSection && fallback.nextSection) {
    workflowState.sectionStates[session.currentSection].status = "completed";
  }

  if (fallback.nextSection === "REVIEW") {
    workflowState.mode = "review";
    workflowState.currentContext = "review_edits";
    workflowState.pendingRedirect = "review";
  }

  return {
    botMessage: fallback.botMessage,
    updatedFormData: fallback.updatedFormData,
    workflowState,
    currentSection: fallback.nextSection || session.currentSection,
    redirectIntent: workflowState.pendingRedirect ?? null,
    readiness: workflowState.lastReadiness || computeReadiness(fallback.updatedFormData, workflowState),
    toolEvents: [],
    redFlags: fallback.redFlags,
    extractedFields: fallback.extractedFields,
  };
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function appendToolEvents(existing: ToolEvent[], incoming: ToolEvent[]) {
  const merged = [...existing, ...incoming];
  const seen = new Set<string>();
  return merged.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).slice(-50);
}
