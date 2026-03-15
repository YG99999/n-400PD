import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import type {
  AgentStatus,
  ChatMessage,
  ChatSessionSnapshot,
  ConversationMode,
  ElevenLabsSessionDebug,
  Section,
} from "@shared/schema";

interface BootstrapResponse {
  signedUrl: string;
  transport: "websocket";
  correlationId: string;
  serverLocation: string;
  agentId: string;
  formSessionId: string;
  currentSection: Section;
  workflowMode: string;
  readyForReview: boolean;
  missingFields: string[];
  supportedScopeSummary: string;
  existingTranscript: ChatMessage[];
  dynamicVariables: Record<string, string | number | boolean>;
  promptOverride: string;
  firstMessage: string;
  preferredMode: ConversationMode;
  debug?: ElevenLabsSessionDebug;
}

type TranscriptKind = NonNullable<ChatMessage["transcriptKind"]>;

type ChatUiState =
  | "entry"
  | "starting_voice"
  | "starting_text"
  | "switching_voice"
  | "switching_text"
  | "active_voice"
  | "active_text"
  | "stopped_resumable"
  | "resume_prompt"
  | "handoff_ready"
  | "error_recoverable";

interface NormalizedConversationError {
  phase: "bootstrap" | "transport_connect" | "mic_setup" | "message" | "runtime";
  transport: "websocket";
  code: string;
  message: string;
  rawPresent: boolean;
}

interface UseElevenLabsConversationOptions {
  formSessionId: string | null;
  initialMessages: ChatMessage[];
  initialChatState?: ChatSessionSnapshot | null;
  currentSection: Section;
  onSwitchToText?: () => void;
  onNavigate?: (target: "review" | "payment") => void;
  onSessionSync?: () => Promise<void>;
}

const WORKLET_PATHS = {
  rawAudioProcessor: "/elevenlabs/rawAudioProcessor.js",
  audioConcatProcessor: "/elevenlabs/audioConcatProcessor.js",
} as const;

function normalizeTranscriptContent(content: string) {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractTentativeUserTranscript(
  payload: unknown,
): { content: string; eventId?: number } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const debugEvent = payload as {
    type?: string;
    tentative_user_transcription_event?: {
      user_transcript?: string;
      event_id?: number;
    };
  };

  if (debugEvent.type !== "tentative_user_transcript") {
    return null;
  }

  const content = debugEvent.tentative_user_transcription_event?.user_transcript?.trim();
  if (!content) {
    return null;
  }

  return {
    content,
    eventId: debugEvent.tentative_user_transcription_event?.event_id,
  };
}

function createTranscriptKey(message: Pick<ChatMessage, "id" | "role" | "content" | "eventId" | "conversationId">) {
  if (typeof message.eventId === "number") {
    return `event:${message.conversationId ?? "conversation"}:${message.role}:${message.eventId}`;
  }
  return `message:${message.id}:${message.role}:${normalizeTranscriptContent(message.content)}`;
}

function sortTranscript(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => {
    const timestampDelta = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (timestampDelta !== 0) {
      return timestampDelta;
    }
    return a.id.localeCompare(b.id);
  });
}

function isDuplicateAssistantStarter(transcript: ChatMessage[], message: ChatMessage) {
  if (message.role !== "assistant") return false;

  const normalizedIncoming = normalizeTranscriptContent(message.content);
  if (!normalizedIncoming) return false;

  const recentAssistant = [...transcript]
    .reverse()
    .find((entry) => entry.role === "assistant" && normalizeTranscriptContent(entry.content).length > 0);

  if (!recentAssistant) return false;
  return normalizeTranscriptContent(recentAssistant.content) === normalizedIncoming;
}

function logConversationEvent(correlationId: string | undefined, event: string, payload?: unknown) {
  const prefix = correlationId ? `[ElevenLabs:${correlationId}]` : "[ElevenLabs]";
  if (payload === undefined) {
    console.info(prefix, event);
    return;
  }
  console.info(prefix, event, payload);
}

function normalizeToolArguments(toolName: string, params: Record<string, unknown>) {
  if (toolName !== "update_form_fields") {
    return params;
  }

  const directUpdates = Array.isArray(params.updates) ? params.updates : null;
  if (directUpdates) {
    return {
      updates: directUpdates,
      note: typeof params.note === "string" ? params.note : undefined,
    };
  }

  const raw = typeof params.updatesJson === "string"
    ? params.updatesJson
    : typeof params.updates === "string"
      ? params.updates
      : "[]";
  try {
    const updates = JSON.parse(raw);
    return {
      updates: Array.isArray(updates) ? updates : [],
      note: typeof params.note === "string" ? params.note : undefined,
    };
  } catch {
    return {
      updates: [],
      note: typeof params.note === "string" ? params.note : undefined,
    };
  }
}

function normalizeError(
  error: unknown,
  phase: NormalizedConversationError["phase"],
): NormalizedConversationError {
  if (typeof error === "string") {
    return {
      phase,
      transport: "websocket",
      code: "sdk_error",
      message: error,
      rawPresent: false,
    };
  }

  if (error instanceof Error) {
    return {
      phase,
      transport: "websocket",
      code: error.name || "error",
      message: error.message,
      rawPresent: true,
    };
  }

  return {
    phase,
    transport: "websocket",
    code: "unknown_error",
    message: String(error),
    rawPresent: true,
  };
}

function buildSessionOptions(bootstrap: BootstrapResponse, mode: ConversationMode) {
  return {
    signedUrl: bootstrap.signedUrl,
    connectionType: "websocket" as const,
    textOnly: mode === "text",
    userId: bootstrap.formSessionId,
    dynamicVariables: bootstrap.dynamicVariables,
    overrides: {
      agent: {
        prompt: {
          prompt: bootstrap.promptOverride,
        },
        firstMessage: bootstrap.firstMessage,
      },
      conversation: {
        textOnly: mode === "text",
      },
    },
    workletPaths: mode === "voice" ? WORKLET_PATHS : undefined,
  };
}

function getInitialUiState(chatState: ChatSessionSnapshot | null | undefined, hasMessages: boolean): ChatUiState {
  if (chatState?.flowState === "handoff_ready") return "handoff_ready";
  if (chatState?.flowState === "resume_prompt") return "resume_prompt";
  if (chatState?.flowState === "entry") return "entry";
  return hasMessages ? "resume_prompt" : "entry";
}

function mapIncomingRole(role: string) {
  if (role === "agent" || role === "assistant" || role === "system") {
    return "assistant" as const;
  }
  return "user" as const;
}

export function useElevenLabsConversation({
  formSessionId,
  initialMessages,
  initialChatState,
  currentSection,
  onSwitchToText,
  onNavigate,
  onSessionSync,
}: UseElevenLabsConversationOptions) {
  const [preferredMode, setPreferredMode] = useState<ConversationMode>(initialChatState?.lastUsedMode ?? "voice");
  const [uiState, setUiState] = useState<ChatUiState>(() => getInitialUiState(initialChatState, initialMessages.length > 0));
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [composerValue, setComposerValue] = useState("");
  const [transcript, setTranscript] = useState<ChatMessage[]>(() => sortTranscript(initialMessages));
  const [isMissingFieldsExpanded, setIsMissingFieldsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [normalizedError, setNormalizedError] = useState<NormalizedConversationError | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [sessionDebug, setSessionDebug] = useState<ElevenLabsSessionDebug | null>(null);
  const conversationIdRef = useRef<string>();
  const correlationIdRef = useRef<string>();
  const uiStateRef = useRef<ChatUiState>(getInitialUiState(initialChatState, initialMessages.length > 0));
  const connectModeRef = useRef<ConversationMode>(initialChatState?.lastUsedMode ?? "voice");
  const isStartingRef = useRef(false);
  const suppressDisconnectRef = useRef(false);
  const seenTranscriptKeysRef = useRef(new Set<string>(initialMessages.map((message) => createTranscriptKey(message))));
  const pendingTypedMessageRef = useRef<{ id: string; content: string } | null>(null);
  const pendingVoiceTranscriptRef = useRef<{ content: string; eventId?: number } | null>(null);
  const sessionMessageCountsRef = useRef({ assistant: 0, user: 0 });
  const sessionCapabilityRef = useRef<"voice" | "text_only" | null>(null);
  const formSessionIdRef = useRef(formSessionId);
  const currentSectionRef = useRef(currentSection);
  const onSwitchToTextRef = useRef(onSwitchToText);
  const onSessionSyncRef = useRef(onSessionSync);
  const requestModeSwitchRef = useRef<(mode: ConversationMode) => Promise<void> | void>();
  const initialChatStateRef = useRef(initialChatState);

  useEffect(() => {
    formSessionIdRef.current = formSessionId;
    currentSectionRef.current = currentSection;
    onSwitchToTextRef.current = onSwitchToText;
    onSessionSyncRef.current = onSessionSync;
    initialChatStateRef.current = initialChatState;
  }, [currentSection, formSessionId, initialChatState, onSessionSync, onSwitchToText]);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    setTranscript((existing) => {
      const merged = [...existing];
      for (const message of initialMessages) {
        const key = createTranscriptKey(message);
        if (seenTranscriptKeysRef.current.has(key)) continue;
        seenTranscriptKeysRef.current.add(key);
        merged.push(message);
      }
      return sortTranscript(merged);
    });
  }, [initialMessages]);

  useEffect(() => {
    if (uiStateRef.current === "active_voice" || uiStateRef.current === "active_text") {
      return;
    }
    setPreferredMode(initialChatState?.lastUsedMode ?? "voice");
    setUiState(getInitialUiState(initialChatState, initialMessages.length > 0));
  }, [initialChatState, initialMessages.length]);

  const persistChatState = useCallback(async (updates: Record<string, unknown>) => {
    if (!formSessionIdRef.current) return;
    await apiRequest("POST", "/api/chat/state", {
      formSessionId: formSessionIdRef.current,
      chatSession: updates,
    });
    await onSessionSyncRef.current?.();
  }, []);

  const safelyEndConversation = useCallback(async () => {
    suppressDisconnectRef.current = true;
    try {
      await conversation.endSession();
    } catch (cleanupError) {
      logConversationEvent(correlationIdRef.current, "cleanup_failed", cleanupError);
    } finally {
      conversationIdRef.current = undefined;
      pendingTypedMessageRef.current = null;
      pendingVoiceTranscriptRef.current = null;
      sessionMessageCountsRef.current = { assistant: 0, user: 0 };
      setMicMuted(false);
      setAgentStatus("idle");
      sessionCapabilityRef.current = null;
      window.setTimeout(() => {
        suppressDisconnectRef.current = false;
      }, 0);
    }
  }, []);

  const persistMessage = useCallback(async (message: ChatMessage) => {
    if (!formSessionIdRef.current) return;
    await apiRequest("POST", "/api/elevenlabs/messages", {
      formSessionId: formSessionIdRef.current,
      message: {
        ...message,
        section: message.section ?? currentSectionRef.current,
      },
    });
  }, []);

  const appendTranscriptMessage = useCallback(async (message: ChatMessage) => {
    const key = createTranscriptKey(message);
    if (seenTranscriptKeysRef.current.has(key)) {
      return;
    }
    if (
      message.transcriptKind === "assistant" &&
      sessionMessageCountsRef.current.assistant === 0 &&
      isDuplicateAssistantStarter(transcript, message)
    ) {
      seenTranscriptKeysRef.current.add(key);
      return;
    }
    seenTranscriptKeysRef.current.add(key);
    if (message.role === "assistant") {
      sessionMessageCountsRef.current.assistant += 1;
    } else {
      sessionMessageCountsRef.current.user += 1;
    }
    setTranscript((existing) => sortTranscript([...existing, message]));
    await persistMessage(message);
  }, [persistMessage, transcript]);

  const appendOptimisticTypedMessage = useCallback(async (content: string) => {
    const messageId = `typed:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    pendingTypedMessageRef.current = { id: messageId, content };
    const message: ChatMessage = {
      id: messageId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      section: currentSectionRef.current,
      modality: "text",
      conversationId: conversationIdRef.current,
      transcriptKind: "text_user",
    };
    await appendTranscriptMessage(message);
  }, [appendTranscriptMessage]);

  const commitPendingVoiceTranscript = useCallback(async (reason: "assistant_reply" | "disconnect" | "switch_mode") => {
    const pending = pendingVoiceTranscriptRef.current;
    if (!pending?.content.trim()) {
      return;
    }

    pendingVoiceTranscriptRef.current = null;

    const chatMessage: ChatMessage = {
      id: typeof pending.eventId === "number"
        ? `${conversationIdRef.current || "conversation"}:user:${pending.eventId}`
        : `voice:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      role: "user",
      content: pending.content.trim(),
      timestamp: new Date().toISOString(),
      section: currentSectionRef.current,
      modality: "voice",
      conversationId: conversationIdRef.current,
      eventId: pending.eventId,
      transcriptKind: "voice_user",
    };

    logConversationEvent(correlationIdRef.current, "voice_transcript_committed", {
      reason,
      eventId: pending.eventId,
    });

    await appendTranscriptMessage(chatMessage);
  }, [appendTranscriptMessage]);

  const fetchBootstrap = useCallback(async (mode: ConversationMode) => {
    if (!formSessionIdRef.current) {
      throw new Error("No active form session");
    }
    const res = await apiRequest("POST", "/api/elevenlabs/session", {
      formSessionId: formSessionIdRef.current,
      mode,
    });
    return res.json() as Promise<BootstrapResponse>;
  }, []);

  const applyUiState = useCallback((next: ChatUiState) => {
    uiStateRef.current = next;
    setUiState(next);
  }, []);

  const setRecoverableErrorState = useCallback(async (
    normalized: NormalizedConversationError,
    nextMode?: ConversationMode,
  ) => {
    setNormalizedError(normalized);
    setError(normalized.message);
    setAgentStatus("error");
    applyUiState("error_recoverable");
    await persistChatState({
      flowState: "error_recoverable",
      resumable: transcript.length > 0 || Boolean(initialChatStateRef.current?.resumable),
      lastUsedMode: nextMode ?? preferredMode,
      lastTransportError: normalized.message,
      liveConnectionState: "recovering",
    });
  }, [applyUiState, persistChatState, preferredMode, transcript.length]);

  const clientTools = useRef({
    async get_form_state(_params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "get_form_state",
        arguments: {},
        conversationId: conversationIdRef.current,
      });
      await onSessionSyncRef.current?.();
      return JSON.stringify(await res.json());
    },
    async update_form_fields(params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "update_form_fields",
        arguments: normalizeToolArguments("update_form_fields", params),
        conversationId: conversationIdRef.current,
      });
      await onSessionSyncRef.current?.();
      return JSON.stringify(await res.json());
    },
    async mark_section_complete(params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "mark_section_complete",
        arguments: params,
        conversationId: conversationIdRef.current,
      });
      await onSessionSyncRef.current?.();
      return JSON.stringify(await res.json());
    },
    async reopen_section(params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "reopen_section",
        arguments: params,
        conversationId: conversationIdRef.current,
      });
      await onSessionSyncRef.current?.();
      return JSON.stringify(await res.json());
    },
    async run_readiness_check(_params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "run_readiness_check",
        arguments: {},
        conversationId: conversationIdRef.current,
      });
      await onSessionSyncRef.current?.();
      return JSON.stringify(await res.json());
    },
    async transition_to_review(params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "transition_to_review",
        arguments: params,
        conversationId: conversationIdRef.current,
      });
      await onSessionSyncRef.current?.();
      return JSON.stringify(await res.json());
    },
    async transition_to_payment(params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "transition_to_payment",
        arguments: params,
        conversationId: conversationIdRef.current,
      });
      await onSessionSyncRef.current?.();
      return JSON.stringify(await res.json());
    },
    async switch_to_text_mode() {
      await requestModeSwitchRef.current?.("text");
      return "Switched the interface to text mode.";
    },
    async navigate_to_review() {
      setUiState("handoff_ready");
      await persistChatState({
        flowState: "handoff_ready",
        resumable: true,
        pendingHandoffTarget: "review",
      });
      return "Review confirmation is ready.";
    },
    async navigate_to_payment() {
      setUiState("handoff_ready");
      await persistChatState({
        flowState: "handoff_ready",
        resumable: true,
        pendingHandoffTarget: "payment",
      });
      return "Payment confirmation is ready.";
    },
    show_missing_fields() {
      setIsMissingFieldsExpanded(true);
      return "Missing fields were expanded.";
    },
  }).current;

  const conversation = useConversation({
    micMuted,
    clientTools,
    onConnect: ({ conversationId }) => {
      conversationIdRef.current = conversationId;
      sessionMessageCountsRef.current = { assistant: 0, user: 0 };
      const mode = connectModeRef.current;
      sessionCapabilityRef.current = mode === "voice" ? "voice" : "text_only";
      applyUiState(mode === "voice" ? "active_voice" : "active_text");
      setAgentStatus(mode === "voice" ? "listening" : "ready");
      setError(null);
      setNormalizedError(null);
      void persistChatState({
        flowState: "active",
        resumable: true,
        lastUsedMode: mode,
        liveConnectionState: mode === "voice" ? "listening" : "saved",
      });
      logConversationEvent(correlationIdRef.current, "connected", {
        conversationId,
        mode,
      });
    },
    onDisconnect: (details) => {
      logConversationEvent(correlationIdRef.current, "disconnected", details);
      if (pendingVoiceTranscriptRef.current) {
        void commitPendingVoiceTranscript("disconnect");
      }
      conversationIdRef.current = undefined;
      setAgentStatus("idle");
      setMicMuted(false);
      if (suppressDisconnectRef.current) {
        isStartingRef.current = false;
        return;
      }
      if (uiStateRef.current === "active_voice" || uiStateRef.current === "active_text") {
        applyUiState("resume_prompt");
        void persistChatState({
          flowState: "resume_prompt",
          resumable: true,
          lastUsedMode: connectModeRef.current,
          liveConnectionState: "saved",
        });
      }
      isStartingRef.current = false;
    },
    onError: (message, details) => {
      const normalized = normalizeError(
        message ?? details ?? "Unknown ElevenLabs error",
        uiStateRef.current === "starting_voice" || uiStateRef.current === "starting_text" ? "bootstrap" : "runtime",
      );
      logConversationEvent(correlationIdRef.current, "sdk_error", { message, details, normalized });
      void setRecoverableErrorState(normalized, connectModeRef.current);
    },
    onDebug: (info) => {
      logConversationEvent(correlationIdRef.current, "debug", info);
      const tentativeTranscript = extractTentativeUserTranscript(info);
      if (tentativeTranscript && connectModeRef.current === "voice") {
        pendingVoiceTranscriptRef.current = tentativeTranscript;
      }
    },
    onModeChange: ({ mode }) => {
      if (connectModeRef.current === "text" || preferredMode === "text") {
        setAgentStatus(mode === "speaking" ? "thinking" : "ready");
        return;
      }
      if (mode === "speaking") {
        setAgentStatus("speaking");
        return;
      }
      setAgentStatus(connectModeRef.current === "voice" && preferredMode === "voice" ? "listening" : "ready");
    },
    onStatusChange: ({ status }) => {
      logConversationEvent(correlationIdRef.current, "status_change", { status });
      if (status === "connecting") {
        setAgentStatus("connecting");
        const nextState = uiStateRef.current === "switching_voice" || uiStateRef.current === "switching_text"
          ? uiStateRef.current
          : connectModeRef.current === "voice" ? "starting_voice" : "starting_text";
        applyUiState(nextState);
        return;
      }

      if (status === "connected") {
        setAgentStatus(connectModeRef.current === "voice" ? "listening" : "ready");
        return;
      }

      if (status === "disconnecting") {
        setAgentStatus("idle");
      }
    },
    onInterruption: () => {
      setAgentStatus(connectModeRef.current === "voice" && preferredMode === "voice" ? "listening" : "ready");
    },
    onAgentToolRequest: () => {
      setAgentStatus("thinking");
    },
    onAgentToolResponse: () => {
      setAgentStatus(connectModeRef.current === "voice" && preferredMode === "voice" ? "listening" : "ready");
    },
    onConversationMetadata: (metadata) => {
      logConversationEvent(correlationIdRef.current, "conversation_metadata", metadata);
    },
    onMessage: async ({ message, role, event_id }) => {
      const currentMode = connectModeRef.current;
      const displayMode: ConversationMode = uiStateRef.current === "active_text" ? "text" : currentMode;
      const mappedRole = mapIncomingRole(role);
      const transcriptKind: TranscriptKind =
        mappedRole === "assistant"
          ? "assistant"
          : currentMode === "voice"
            ? "voice_user"
            : "text_user";

      if (
        transcriptKind === "text_user" &&
        pendingTypedMessageRef.current &&
        normalizeTranscriptContent(pendingTypedMessageRef.current.content) === normalizeTranscriptContent(message)
      ) {
        pendingTypedMessageRef.current = null;
        return;
      }

      if (mappedRole === "user") {
        pendingVoiceTranscriptRef.current = null;
        if (currentMode === "voice" && preferredMode === "voice") {
          setAgentStatus("thinking");
        }
      }

      if (mappedRole === "assistant" && currentMode === "voice" && pendingVoiceTranscriptRef.current) {
        await commitPendingVoiceTranscript("assistant_reply");
      }

      const chatMessage: ChatMessage = {
        id: typeof event_id === "number"
          ? `${conversationIdRef.current || "conversation"}:${role}:${event_id}`
          : `${conversationIdRef.current || "conversation"}:${role}:${Date.now()}`,
        role: mappedRole,
        content: message,
        timestamp: new Date().toISOString(),
        section: currentSectionRef.current,
        modality: displayMode,
        conversationId: conversationIdRef.current,
        eventId: event_id,
        transcriptKind,
      };
      await appendTranscriptMessage(chatMessage);
    },
  });

  const startConversation = useCallback(async (mode: ConversationMode) => {
    if (!formSessionIdRef.current || isStartingRef.current) {
      return;
    }

    const isConnectedVoice = uiStateRef.current === "active_voice";
    const isConnectedText = uiStateRef.current === "active_text";

    if ((isConnectedVoice && mode === "voice") || (isConnectedText && mode === "text")) {
      return;
    }

    if (mode === "text" && isConnectedVoice && sessionCapabilityRef.current === "voice") {
      connectModeRef.current = "voice";
      setPreferredMode("text");
      setMicMuted(true);
      conversation.setVolume({ volume: 0 });
      setAgentStatus("ready");
      applyUiState("active_text");
      await persistChatState({
        flowState: "active",
        resumable: true,
        lastUsedMode: "text",
        lastTransportError: null,
        liveConnectionState: "saved",
      });
      onSwitchToTextRef.current?.();
      return;
    }

    if (mode === "voice" && isConnectedText && sessionCapabilityRef.current === "voice") {
      connectModeRef.current = "voice";
      setPreferredMode("voice");
      setMicMuted(false);
      conversation.setVolume({ volume: 1 });
      setAgentStatus("listening");
      applyUiState("active_voice");
      await persistChatState({
        flowState: "active",
        resumable: true,
        lastUsedMode: "voice",
        lastTransportError: null,
        liveConnectionState: "listening",
      });
      return;
    }

    if ((isConnectedVoice && mode === "text") || (isConnectedText && mode === "voice")) {
      if (mode === "text" && pendingVoiceTranscriptRef.current) {
        await commitPendingVoiceTranscript("switch_mode");
      }
      applyUiState(mode === "voice" ? "switching_voice" : "switching_text");
      await persistChatState({
        flowState: "active",
        resumable: true,
        lastUsedMode: mode,
        liveConnectionState: "switching",
      });
      await safelyEndConversation();
    }

    isStartingRef.current = true;
    connectModeRef.current = mode;
    setPreferredMode(mode);
    setError(null);
    setNormalizedError(null);

    try {
      applyUiState(mode === "voice" ? "starting_voice" : "starting_text");
      await persistChatState({
        flowState: "active",
        resumable: true,
        lastUsedMode: mode,
        liveConnectionState: "connecting",
      });
      const bootstrap = await fetchBootstrap(mode);
      correlationIdRef.current = bootstrap.correlationId;
      setSessionDebug(bootstrap.debug ?? null);
      logConversationEvent(bootstrap.correlationId, "bootstrap_received", {
        mode,
        transport: bootstrap.transport,
        debug: bootstrap.debug,
      });

      if (mode === "voice") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch (micError) {
          const normalized = normalizeError(micError, "mic_setup");
          await setRecoverableErrorState(normalized, "voice");
          return;
        }
      }

      setMicMuted(mode === "text");
      await conversation.startSession(buildSessionOptions(bootstrap, mode));
      if (mode === "text") {
        onSwitchToTextRef.current?.();
      }
    } catch (startError) {
      await safelyEndConversation();
      const normalized = normalizeError(startError, "transport_connect");
      logConversationEvent(correlationIdRef.current, "start_failed", normalized);
      await setRecoverableErrorState(normalized, mode);
    } finally {
      isStartingRef.current = false;
    }
  }, [applyUiState, commitPendingVoiceTranscript, conversation, fetchBootstrap, persistChatState, safelyEndConversation, setRecoverableErrorState]);

  const sendMessage = useCallback(async () => {
    const value = composerValue.trim();
    if (!value) return;

    const isActiveText = () => uiStateRef.current === "active_text";
    const isActiveVoice = () => uiStateRef.current === "active_voice";

    if (!isActiveVoice() && !isActiveText()) {
      await startConversation("text");
      if (!isActiveText() && conversation.status !== "connected") {
        return;
      }
    }

    if (preferredMode !== "text" || isActiveVoice()) {
      await startConversation("text");
      if (!isActiveText() && conversation.status !== "connected") {
        return;
      }
    }

    try {
      await appendOptimisticTypedMessage(value);
      conversation.sendUserMessage(value);
      setComposerValue("");
      setAgentStatus("thinking");
      onSwitchToTextRef.current?.();
    } catch (sendError) {
      const normalized = normalizeError(sendError, "message");
      await setRecoverableErrorState(normalized, "text");
    }
  }, [appendOptimisticTypedMessage, composerValue, conversation, onSessionSync, persistChatState, preferredMode, setRecoverableErrorState, startConversation]);

  const stopConversation = useCallback(async () => {
    await safelyEndConversation();
    setError(null);
    setNormalizedError(null);
    applyUiState("stopped_resumable");
    await persistChatState({
      flowState: "stopped",
      resumable: true,
      lastUsedMode: preferredMode,
      stoppedAt: new Date().toISOString(),
      lastTransportError: null,
      liveConnectionState: "saved",
    });
  }, [applyUiState, persistChatState, preferredMode, safelyEndConversation]);

  const switchMode = useCallback(async (mode: ConversationMode) => {
    if (mode === preferredMode && (uiState === "active_voice" || uiState === "active_text")) {
      return;
    }
    await startConversation(mode);
  }, [preferredMode, startConversation, uiState]);

  const stayInChat = useCallback(async () => {
    applyUiState(transcript.length > 0 ? "resume_prompt" : "entry");
    await persistChatState({
      flowState: transcript.length > 0 ? "resume_prompt" : "entry",
      resumable: transcript.length > 0,
      pendingHandoffTarget: null,
      liveConnectionState: transcript.length > 0 ? "saved" : "idle",
    });
  }, [applyUiState, persistChatState, transcript.length]);

  const continueToTarget = useCallback(async (target: "review" | "payment") => {
    await persistChatState({
      flowState: "resume_prompt",
      resumable: true,
      pendingHandoffTarget: null,
      liveConnectionState: "saved",
    });
    onNavigate?.(target);
  }, [onNavigate, persistChatState]);

  useEffect(() => {
    requestModeSwitchRef.current = switchMode;
  }, [switchMode]);

  return {
    transcript,
    composerValue,
    setComposerValue,
    sendTypingActivity: () => {
      if (uiStateRef.current === "active_text") {
        try {
          conversation.sendUserActivity();
        } catch (activityError) {
          logConversationEvent(correlationIdRef.current, "typing_activity_failed", activityError);
        }
      }
    },
    sendMessage,
    startConversation,
    pauseConversation: stopConversation,
    switchMode,
    continueToTarget,
    stayInChat,
    preferredMode,
    uiState,
    status: conversation.status,
    agentStatus,
    isConnected: uiState === "active_voice" || uiState === "active_text",
    isSpeaking: conversation.isSpeaking,
    error,
    normalizedError,
    sessionDebug,
    isMissingFieldsExpanded,
    setIsMissingFieldsExpanded,
  };
}
