import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { registerRoutes } from "../server/routes";

type MockMessage = {
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type CheckResult = {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
};

const PORT = 5067;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPORT_PATH = path.resolve("generated_pdfs", "mock_assistant_e2e_report.json");

const originalFetch = globalThis.fetch.bind(globalThis);
const mockResponses: MockMessage[] = [];
let mockedOpenAiCallsConsumed = 0;

function queueMockResponses(...responses: MockMessage[]) {
  mockResponses.push(...responses);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  if (url === "https://api.openai.com/v1/chat/completions") {
    const next = mockResponses.shift();
    if (!next) {
      throw new Error("No mocked OpenAI response was queued for this assistant turn.");
    }
    mockedOpenAiCallsConsumed += 1;
    return jsonResponse({
      choices: [
        {
          message: next,
        },
      ],
    });
  }

  return originalFetch(input as RequestInfo, init);
}) as typeof globalThis.fetch;

function toolCall(id: string, name: string, args: Record<string, unknown>) {
  return {
    id,
    type: "function" as const,
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const response = await originalFetch(`${BASE_URL}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${response.status} ${JSON.stringify(parsed)}`);
  }

  return parsed as T;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await originalFetch(`${BASE_URL}/api/demo/session`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("Server did not start in time.");
}

function recordCheck(results: CheckResult[], name: string, passed: boolean, details?: Record<string, unknown>) {
  results.push({ name, passed, details });
  if (!passed) {
    throw new Error(`${name} failed${details ? `: ${JSON.stringify(details)}` : ""}`);
  }
}

async function main() {
  process.env.OPENAI_API_KEY = "mock-openai-key";
  process.env.PORT = String(PORT);

  const app = express();
  const httpServer = createServer(app);
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as typeof req & { rawBody?: unknown }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(PORT, "127.0.0.1", () => resolve()));
  await waitForServer();

  const checks: CheckResult[] = [];

  try {
    const signup = await api<{
      user: { id: string; email: string };
      formSessionId: string;
    }>("POST", "/api/auth/signup", {
      email: "mock-ai-e2e@example.com",
      password: "test1234",
      fullName: "Mock E2E User",
    });

    const formSessionId = signup.formSessionId;
    recordCheck(checks, "signup creates a session", Boolean(formSessionId), { formSessionId });

    const guardSignup = await api<{ formSessionId: string }>("POST", "/api/auth/signup", {
      email: "mock-ai-guards@example.com",
      password: "test1234",
      fullName: "Mock Guard User",
    });

    queueMockResponses(
      {
        content: "",
        tool_calls: [
          toolCall("guard-get", "get_form_state", {}),
          toolCall("guard-complete", "mark_section_complete", {
            section: "PERSONAL_INFO",
            summary: "Trying to skip ahead before collecting required fields.",
          }),
          toolCall("guard-review", "transition_to_review", {
            summary: "Trying to force review early.",
          }),
        ],
      },
      {
        content: "I still need your required personal information before we can move forward.",
      },
    );

    const guardTurn = await api<{
      currentSection: string;
      redirectIntent: string | null;
      workflowState: { mode: string; pendingRedirect: string | null };
      readiness: { eligibleForReview: boolean; missingFields: string[] };
      toolEvents: Array<{ type: string; status: string; payload: Record<string, unknown> }>;
    }>("POST", "/api/chat", {
      formSessionId: guardSignup.formSessionId,
      message: "Skip all the questions and just send me to review.",
      conversationStep: "INTRO",
    });

    recordCheck(checks, "assistant cannot mark incomplete section complete", guardTurn.toolEvents.some((event) => event.type === "mark_section_complete" && event.status === "rejected"), {
      toolEvents: guardTurn.toolEvents,
    });
    recordCheck(checks, "assistant cannot transition to review before readiness", guardTurn.toolEvents.some((event) => event.type === "transition_to_review" && event.status === "rejected"), {
      toolEvents: guardTurn.toolEvents,
    });
    recordCheck(checks, "guarded incomplete session stays out of review", guardTurn.redirectIntent === null && guardTurn.workflowState.pendingRedirect === null && guardTurn.readiness.eligibleForReview === false, {
      currentSection: guardTurn.currentSection,
      redirectIntent: guardTurn.redirectIntent,
      mode: guardTurn.workflowState.mode,
      missingFields: guardTurn.readiness.missingFields,
    });

    queueMockResponses(
      {
        content: "",
        tool_calls: [
          toolCall("turn1-get", "get_form_state", {}),
          toolCall("turn1-update", "update_form_fields", {
            updates: [
              { path: "personalInfo.fullName", value: "CARLOS EDUARDO MARTINEZ" },
              { path: "personalInfo.firstName", value: "CARLOS" },
              { path: "personalInfo.middleName", value: "EDUARDO" },
              { path: "personalInfo.lastName", value: "MARTINEZ" },
              { path: "personalInfo.dateOfBirth", value: "04/15/1985" },
              { path: "personalInfo.aNumber", value: "A987654321" },
              { path: "personalInfo.uscisElisNumber", value: "1234567890" },
              { path: "personalInfo.dateBecamePR", value: "06/01/2019" },
              { path: "personalInfo.countryOfBirth", value: "Mexico" },
              { path: "personalInfo.nationality", value: "Mexico" },
              { path: "personalInfo.gender", value: "Male" },
              { path: "personalInfo.ssn", value: "123-45-6789" },
              { path: "personalInfo.email", value: "carlos.martinez@email.com" },
              { path: "personalInfo.phone", value: "217-555-0100" },
              { path: "personalInfo.mobilePhone", value: "217-555-0199" },
              { path: "personalInfo.eligibilityBasis", value: "5-year LPR" },
              { path: "biographic.ethnicity", value: "Hispanic" },
              { path: "biographic.race", value: "White" },
              { path: "biographic.heightFeet", value: 5 },
              { path: "biographic.heightInches", value: 10 },
              { path: "biographic.weightLbs", value: 175 },
              { path: "biographic.eyeColor", value: "BRO" },
              { path: "biographic.hairColor", value: "BLK" },
            ],
            note: "Collected eligibility, identity, contact, and biographic data.",
          }),
          toolCall("turn1-mark-intro", "mark_section_complete", {
            section: "INTRO",
            summary: "Eligibility prerequisites confirmed and intake started.",
          }),
          toolCall("turn1-mark-personal", "mark_section_complete", {
            section: "PERSONAL_INFO",
            summary: "Personal and biographic information collected.",
          }),
        ],
      },
      {
        content: "I have your eligibility, identity, and biographic details. Next I need your address, family, work, and travel history.",
      },
    );

    const turn1 = await api<{
      currentSection: string;
      toolEvents: Array<{ type: string; status: string }>;
      workflowState: { mode: string };
    }>("POST", "/api/chat", {
      formSessionId,
      message: "I have my green card, I have been a permanent resident over five years, and my personal details are Carlos Eduardo Martinez, born 04/15/1985.",
      conversationStep: "INTRO",
    });

    recordCheck(checks, "assistant tool loop updates personal section", turn1.currentSection === "RESIDENCE_HISTORY", {
      currentSection: turn1.currentSection,
      toolEvents: turn1.toolEvents.map((event) => event.type),
    });

    queueMockResponses(
      {
        content: "",
        tool_calls: [
          toolCall("turn2-get", "get_form_state", {}),
          toolCall("turn2-update", "update_form_fields", {
            updates: [
              {
                path: "residenceHistory",
                value: [
                  {
                    address: "123 Main Street, Apt 4B",
                    city: "Springfield",
                    state: "IL",
                    zip: "62701",
                    country: "United States",
                    moveInDate: "08/2022",
                  },
                  {
                    address: "456 Oak Avenue",
                    city: "Chicago",
                    state: "IL",
                    zip: "60601",
                    country: "United States",
                    moveInDate: "01/2017",
                    moveOutDate: "08/2022",
                  },
                ],
              },
              {
                path: "mailingAddress",
                value: {
                  address: "PO Box 123",
                  city: "Springfield",
                  state: "IL",
                  zip: "62702",
                  country: "United States",
                },
              },
              { path: "family.maritalStatus", value: "Married" },
              { path: "family.timesMarried", value: 1 },
              { path: "family.spouseTimesMarried", value: 1 },
              { path: "family.spouse.fullName", value: "MARIA ISABEL MARTINEZ" },
              { path: "family.spouse.dateOfBirth", value: "09/22/1987" },
              { path: "family.spouse.dateOfMarriage", value: "06/15/2013" },
              { path: "family.spouse.isCitizen", value: true },
              { path: "family.spouse.citizenshipBy", value: "Birth" },
              { path: "family.totalChildren", value: 2 },
              { path: "family.householdSize", value: 4 },
              {
                path: "family.children",
                value: [
                  {
                    fullName: "SOFIA MARTINEZ",
                    dateOfBirth: "01/10/2012",
                    aNumber: "A111222333",
                    relationship: "biological daughter",
                    residence: "resides with me",
                    livesWithYou: true,
                    receivingSupport: true,
                  },
                  {
                    fullName: "DIEGO MARTINEZ",
                    dateOfBirth: "03/18/2015",
                    aNumber: "A444555666",
                    relationship: "biological son",
                    residence: "resides with me",
                    livesWithYou: true,
                    receivingSupport: true,
                  },
                ],
              },
              {
                path: "employment",
                value: [
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
                  {
                    employerName: "XYZ Solutions LLC",
                    occupation: "Software Developer",
                    city: "Chicago",
                    state: "IL",
                    zip: "60601",
                    country: "United States",
                    startDate: "01/2017",
                    endDate: "02/2020",
                  },
                ],
              },
              {
                path: "travelHistory",
                value: [
                  {
                    destination: "Mexico",
                    departureDate: "12/20/2023",
                    returnDate: "01/05/2024",
                  },
                  {
                    destination: "Canada",
                    departureDate: "09/01/2021",
                    returnDate: "09/05/2021",
                  },
                ],
              },
            ],
            note: "Collected residence, family, work, and travel sections.",
          }),
          toolCall("turn2-mark-residence", "mark_section_complete", {
            section: "RESIDENCE_HISTORY",
            summary: "Residence history and mailing address collected.",
          }),
          toolCall("turn2-mark-family", "mark_section_complete", {
            section: "FAMILY_INFO",
            summary: "Family and children details collected.",
          }),
          toolCall("turn2-mark-employment", "mark_section_complete", {
            section: "EMPLOYMENT",
            summary: "Employment history collected.",
          }),
          toolCall("turn2-mark-travel", "mark_section_complete", {
            section: "TRAVEL",
            summary: "Travel history collected.",
          }),
        ],
      },
      {
        content: "Thanks. I now need the moral character answers and the oath section so I can confirm readiness.",
      },
    );

    const turn2 = await api<{
      currentSection: string;
      toolEvents: Array<{ type: string; status: string }>;
    }>("POST", "/api/chat", {
      formSessionId,
      message: "My current address is 123 Main Street Apt 4B in Springfield, Illinois, I am married with two children, I work at ABC Technology Corp, and I took trips to Mexico and Canada.",
      conversationStep: "RESIDENCE_HISTORY",
    });

    recordCheck(checks, "assistant advances through residence family employment travel", turn2.currentSection === "MORAL_CHARACTER", {
      currentSection: turn2.currentSection,
      toolEvents: turn2.toolEvents.map((event) => event.type),
    });

    queueMockResponses(
      {
        content: "",
        tool_calls: [
          toolCall("turn3-get", "get_form_state", {}),
          toolCall("turn3-update", "update_form_fields", {
            updates: [
              { path: "moralCharacter.claimedUSCitizen", value: false },
              { path: "moralCharacter.votedInElection", value: false },
              { path: "moralCharacter.arrestedOrDetained", value: false },
              { path: "moralCharacter.convictedOfCrime", value: false },
              { path: "moralCharacter.usedIllegalDrugs", value: false },
              { path: "moralCharacter.helpedIllegalEntry", value: false },
              { path: "moralCharacter.liedToGovernment", value: false },
              { path: "moralCharacter.deported", value: false },
              { path: "moralCharacter.memberOfOrganizations", value: false },
              { path: "moralCharacter.communistPartyMember", value: false },
              { path: "moralCharacter.terroristAssociation", value: false },
              { path: "moralCharacter.committedViolence", value: false },
              { path: "moralCharacter.militaryService", value: false },
              { path: "moralCharacter.registeredSelectiveService", value: true },
              { path: "oath.supportConstitution", value: true },
              { path: "oath.willingTakeOath", value: true },
              { path: "oath.willingBearArms", value: true },
              { path: "oath.willingNoncombatService", value: true },
              { path: "oath.willingNationalService", value: true },
            ],
            note: "Collected moral character and oath answers.",
          }),
          toolCall("turn3-mark-moral", "mark_section_complete", {
            section: "MORAL_CHARACTER",
            summary: "Moral character answers collected and confirmed.",
          }),
          toolCall("turn3-mark-oath", "mark_section_complete", {
            section: "OATH",
            summary: "Oath answers collected and confirmed.",
          }),
          toolCall("turn3-readiness", "run_readiness_check", {}),
          toolCall("turn3-review", "transition_to_review", {
            summary: "All supported applicant data has been collected and is ready for review.",
          }),
        ],
      },
      {
        content: "Everything in the supported applicant scope is collected. I am sending you to review so you can confirm and edit anything before payment.",
      },
    );

    const turn3 = await api<{
      currentSection: string;
      redirectIntent: string | null;
      readiness: { eligibleForReview: boolean; eligibleForPayment: boolean };
      workflowState: { pendingRedirect: string | null; mode: string };
      toolEvents: Array<{ type: string; status: string }>;
    }>("POST", "/api/chat", {
      formSessionId,
      message: "All the moral character answers are no except I always filed taxes yes, and all oath answers are yes.",
      conversationStep: "MORAL_CHARACTER",
    });

    recordCheck(checks, "assistant transitions session to review", turn3.currentSection === "REVIEW" && turn3.redirectIntent === "review", {
      currentSection: turn3.currentSection,
      redirectIntent: turn3.redirectIntent,
      mode: turn3.workflowState.mode,
      toolEvents: turn3.toolEvents.map((event) => event.type),
    });

    recordCheck(checks, "readiness is green after mocked AI collection", turn3.readiness.eligibleForReview && turn3.readiness.eligibleForPayment, turn3.readiness as Record<string, unknown>);
    recordCheck(checks, "supported-scope collection does not emit scope-mismatch warnings", (turn3.readiness.warnings?.length || 0) === 0, {
      warnings: turn3.readiness.warnings,
    });

    queueMockResponses(
      {
        content: "",
        tool_calls: [
          toolCall("turn4-get", "get_form_state", {}),
          toolCall("turn4-reopen", "reopen_section", {
            section: "PERSONAL_INFO",
            reason: "User is correcting the daytime phone number from review mode.",
          }),
          toolCall("turn4-update", "update_form_fields", {
            updates: [
              { path: "personalInfo.phone", value: "217-555-0111" },
            ],
            note: "Updated corrected phone number while preserving review context.",
          }),
          toolCall("turn4-mark", "mark_section_complete", {
            section: "PERSONAL_INFO",
            summary: "Personal information was corrected and re-confirmed.",
          }),
          toolCall("turn4-readiness", "run_readiness_check", {}),
          toolCall("turn4-review", "transition_to_review", {
            summary: "Correction applied and review remains ready.",
          }),
        ],
      },
      {
        content: "I updated your daytime phone number and kept everything else intact. You can stay in review.",
      },
    );

    const turn4 = await api<{
      workflowState: { mode: string; pendingRedirect: string | null };
      currentSection: string;
      toolEvents: Array<{ type: string }>;
    }>("POST", "/api/chat", {
      formSessionId,
      message: "Actually, change my daytime phone number to 217-555-0111.",
      conversationStep: "REVIEW",
    });

    recordCheck(checks, "review-context chat edit uses reopen and returns to review", turn4.currentSection === "REVIEW", {
      currentSection: turn4.currentSection,
      toolEvents: turn4.toolEvents.map((event) => event.type),
    });

    const scalarEdit = await api<{ success: boolean }>("POST", "/api/review/update-field", {
      formSessionId,
      path: "personalInfo.email",
      value: "updated.email@example.com",
    });
    recordCheck(checks, "review scalar edit endpoint works", scalarEdit.success === true);

    const itemEdit = await api<{ success: boolean }>("POST", "/api/review/update-item", {
      formSessionId,
      path: "travelHistory",
      index: 0,
      value: {
        destination: "Mexico - family visit",
        departureDate: "12/20/2023",
        returnDate: "01/05/2024",
      },
    });
    recordCheck(checks, "review repeated-item update endpoint works", itemEdit.success === true);

    const addAdditional = await api<{ success: boolean }>("POST", "/api/review/add-item", {
      formSessionId,
      path: "additionalInfo",
      value: {
        pageNumber: "14",
        partNumber: "9",
        itemNumber: "1",
        response: "Short clarification added during review.",
      },
    });
    recordCheck(checks, "review add-item endpoint works", addAdditional.success === true);

    const sessionAfterAdd = await api<{
      formSession: {
        formData: {
          additionalInfo?: unknown[];
        };
      };
    }>("GET", `/api/form/load?sessionId=${formSessionId}`);

    const addedIndex = Math.max((sessionAfterAdd.formSession.formData.additionalInfo?.length || 1) - 1, 0);
    const removeAdditional = await api<{ success: boolean }>("POST", "/api/review/remove-item", {
      formSessionId,
      path: "additionalInfo",
      index: addedIndex,
    });
    recordCheck(checks, "review remove-item endpoint works", removeAdditional.success === true);

    const readinessBeforePayment = await api<{
      readiness: {
        eligibleForPayment: boolean;
        missingFields: string[];
        stalePdf: boolean;
      };
    }>("GET", `/api/form/readiness?sessionId=${formSessionId}`);

    recordCheck(checks, "session remains payment-ready after review edits", readinessBeforePayment.readiness.eligibleForPayment, readinessBeforePayment.readiness as Record<string, unknown>);
    recordCheck(checks, "review edits stay inside supported scope without warnings", (readinessBeforePayment.readiness.warnings?.length || 0) === 0, {
      warnings: readinessBeforePayment.readiness.warnings,
    });

    const payment = await api<{
      status: string;
      pdfUrl?: string;
      validationResult?: { valid: boolean };
    }>("POST", "/api/payment/checkout", {
      formSessionId,
    });

    recordCheck(checks, "payment generates a PDF", payment.status === "completed" && Boolean(payment.pdfUrl), payment as Record<string, unknown>);
    recordCheck(checks, "payment path returns PDF validation result", payment.validationResult?.valid === true, payment.validationResult as Record<string, unknown> | undefined);

    const postPaymentEdit = await api<{ success: boolean }>("POST", "/api/review/update-field", {
      formSessionId,
      path: "personalInfo.mobilePhone",
      value: "217-555-0222",
    });
    recordCheck(checks, "post-payment review edit succeeds", postPaymentEdit.success === true);

    const readinessAfterPaymentEdit = await api<{
      readiness: {
        stalePdf: boolean;
        eligibleForPdf: boolean;
      };
    }>("GET", `/api/form/readiness?sessionId=${formSessionId}`);

    recordCheck(checks, "post-payment edit marks pdf stale", readinessAfterPaymentEdit.readiness.stalePdf === true, readinessAfterPaymentEdit.readiness as Record<string, unknown>);

    const regenerate = await api<{
      pdfGenerated: boolean;
      pdfUrl: string;
      validationResult: { valid: boolean };
    }>("POST", "/api/pdf/generate", {
      formSessionId,
      overrideValidation: false,
    });

    recordCheck(checks, "manual regeneration succeeds after post-payment edit", regenerate.pdfGenerated === true && regenerate.validationResult.valid === true, regenerate as Record<string, unknown>);

    const download = await originalFetch(`${BASE_URL}${regenerate.pdfUrl}`);
    recordCheck(checks, "download endpoint returns a pdf", download.ok && download.headers.get("content-type")?.includes("application/pdf") === true, {
      status: download.status,
      contentType: download.headers.get("content-type"),
    });

    const finalSession = await api<{
      formSession: {
        currentSection: string;
        paymentStatus: string;
        pdfUrl?: string;
        workflowState: {
          mode: string;
          pdfNeedsRegeneration: boolean;
        };
      };
      conversations: Array<{
        role: string;
        content: string;
        toolEvents?: Array<{ type: string; status: string }>;
      }>;
    }>("GET", `/api/form/load?sessionId=${formSessionId}`);

    const assistantMessagesWithTools = finalSession.conversations.filter((message) => message.role === "assistant" && (message.toolEvents?.length || 0) > 0);
    recordCheck(checks, "assistant messages captured tool events in session history", assistantMessagesWithTools.length >= 4, {
      assistantMessagesWithTools: assistantMessagesWithTools.length,
    });
    const uniqueToolEventIds = new Set(finalSession.conversations.flatMap((message) => message.toolEvents?.map((event) => event.id) || []));
    const totalToolEventRecords = finalSession.conversations.reduce((count, message) => count + (message.toolEvents?.length || 0), 0);
    recordCheck(checks, "tool events are not duplicated across saved assistant messages", uniqueToolEventIds.size === totalToolEventRecords, {
      uniqueToolEventIds: uniqueToolEventIds.size,
      totalToolEventRecords,
    });

    const report = {
      summary: {
        passed: checks.every((check) => check.passed),
        totalChecks: checks.length,
        mockedOpenAiCallsConsumed,
      },
      checks,
      finalState: {
        currentSection: finalSession.formSession.currentSection,
        paymentStatus: finalSession.formSession.paymentStatus,
        workflowMode: finalSession.formSession.workflowState.mode,
        pdfNeedsRegeneration: finalSession.formSession.workflowState.pdfNeedsRegeneration,
        pdfUrl: finalSession.formSession.pdfUrl,
      },
      note: "This harness mocks OpenAI chat-completion responses but exercises the real assistant runtime tool loop, readiness logic, review endpoints, payment flow, PDF generation, and regeneration path.",
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(JSON.stringify(report, null, 2));
  } finally {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
