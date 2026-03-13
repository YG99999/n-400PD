import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import type {
  AgentStatus,
  ChatMessage,
  ConversationMode,
  ConversationState,
  ElevenLabsSessionDebug,
  Section,
} from "@shared/schema";

interface BootstrapResponse {
  signedUrl: string;
  conversationToken?: string;
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
  preferredMode: ConversationMode;
  debug?: ElevenLabsSessionDebug;
}

interface CountdownState {
  target: "review" | "payment";
  secondsLeft: number;
}

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
  currentSection: Section;
  onSwitchToText?: () => void;
  onNavigate?: (target: "review" | "payment") => void;
  onSessionSync?: () => Promise<void>;
}

const WORKLET_PATHS = {
  rawAudioProcessor: "/elevenlabs/rawAudioProcessor.js",
  audioConcatProcessor: "/elevenlabs/audioConcatProcessor.js",
} as const;

function createTranscriptKey(message: Pick<ChatMessage, "id" | "timestamp" | "role" | "content">) {
  return `${message.id}:${message.timestamp}:${message.role}:${message.content}`;
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

  const raw = typeof params.updatesJson === "string" ? params.updatesJson : "[]";
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

function isMicrophoneSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /microphone|permission|audioworklet|worklet|audio capture/i.test(message);
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
    workletPaths: mode === "voice" ? WORKLET_PATHS : undefined,
  };
}

export function useElevenLabsConversation({
  formSessionId,
  initialMessages,
  currentSection,
  onSwitchToText,
  onNavigate,
  onSessionSync,
}: UseElevenLabsConversationOptions) {
  const [preferredMode, setPreferredMode] = useState<ConversationMode>("voice");
  const [conversationState, setConversationState] = useState<ConversationState>("idle");
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [composerValue, setComposerValue] = useState("");
  const [transcript, setTranscript] = useState<ChatMessage[]>(initialMessages);
  const [countdown, setCountdown] = useState<CountdownState | null>(null);
  const [isMissingFieldsExpanded, setIsMissingFieldsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [normalizedError, setNormalizedError] = useState<NormalizedConversationError | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [sessionDebug, setSessionDebug] = useState<ElevenLabsSessionDebug | null>(null);
  const conversationIdRef = useRef<string>();
  const correlationIdRef = useRef<string>();
  const conversationStateRef = useRef<ConversationState>("idle");
  const bootstrapModeRef = useRef<ConversationMode>("voice");
  const connectModeRef = useRef<ConversationMode>("voice");
  const isStartingRef = useRef(false);
  const seenTranscriptKeysRef = useRef(new Set<string>());
  const countdownTimerRef = useRef<number | null>(null);
  const formSessionIdRef = useRef(formSessionId);
  const currentSectionRef = useRef(currentSection);
  const onSwitchToTextRef = useRef(onSwitchToText);
  const onSessionSyncRef = useRef(onSessionSync);

  useEffect(() => {
    formSessionIdRef.current = formSessionId;
    currentSectionRef.current = currentSection;
    onSwitchToTextRef.current = onSwitchToText;
    onSessionSyncRef.current = onSessionSync;
  }, [currentSection, formSessionId, onSessionSync, onSwitchToText]);

  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  useEffect(() => {
    setTranscript((existing) => {
      const merged = [...existing];
      for (const message of initialMessages) {
        const key = createTranscriptKey(message);
        if (seenTranscriptKeysRef.current.has(key)) continue;
        seenTranscriptKeysRef.current.add(key);
        merged.push(message);
      }
      return merged.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    });
  }, [initialMessages]);

  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startCountdown = useCallback((target: "review" | "payment") => {
    cancelCountdown();
    setCountdown({ target, secondsLeft: 3 });
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (!current || current.target !== target) {
          return current;
        }
        if (current.secondsLeft <= 1) {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          onNavigate?.(target);
          return null;
        }
        return { ...current, secondsLeft: current.secondsLeft - 1 };
      });
    }, 1000);
  }, [cancelCountdown, onNavigate]);

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
    seenTranscriptKeysRef.current.add(key);
    setTranscript((existing) => [...existing, message].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)));
    await persistMessage(message);
  }, [persistMessage]);

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

  const safelyEndConversation = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (cleanupError) {
      logConversationEvent(correlationIdRef.current, "cleanup_failed", cleanupError);
    } finally {
      conversationIdRef.current = undefined;
      setMicMuted(false);
      setAgentStatus("idle");
    }
  }, []);

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
    switch_to_text_mode() {
      cancelCountdown();
      setPreferredMode("text");
      setMicMuted(true);
      setAgentStatus("ready");
      onSwitchToTextRef.current?.();
      return "Switched the interface to text mode.";
    },
    navigate_to_review() {
      startCountdown("review");
      return "Review countdown started.";
    },
    navigate_to_payment() {
      startCountdown("payment");
      return "Payment countdown started.";
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
      const mode = connectModeRef.current;
      setConversationState(mode === "voice" ? "connected_voice" : "connected_text");
      setAgentStatus(mode === "voice" ? "listening" : "ready");
      setError(null);
      setNormalizedError(null);
      logConversationEvent(correlationIdRef.current, "connected", {
        conversationId,
        mode,
      });
    },
    onDisconnect: (details) => {
      logConversationEvent(correlationIdRef.current, "disconnected", details);
      conversationIdRef.current = undefined;
      setAgentStatus("idle");
      setMicMuted(false);
      setConversationState((current) => (current === "error" || current === "degraded" ? current : "idle"));
      isStartingRef.current = false;
    },
    onError: (message, details) => {
      const normalized = normalizeError(
        message ?? details ?? "Unknown ElevenLabs error",
        conversationState === "bootstrapping" ? "bootstrap" : "runtime",
      );
      logConversationEvent(correlationIdRef.current, "sdk_error", { message, details, normalized });
      setNormalizedError(normalized);
      setError(normalized.message);
      setAgentStatus("error");
      setConversationState(conversationState === "connecting_voice" ? "degraded" : "error");
    },
    onDebug: (info) => {
      logConversationEvent(correlationIdRef.current, "debug", info);
    },
    onModeChange: ({ mode }) => {
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
        setConversationState(connectModeRef.current === "voice" ? "connecting_voice" : "connecting_text");
      }
      if (status === "disconnected" && conversationState !== "error" && conversationState !== "degraded") {
        setConversationState("idle");
      }
    },
    onInterruption: () => {
      cancelCountdown();
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
    onMessage: ({ message, role, event_id }) => {
      cancelCountdown();
      const modality: ConversationMode =
        connectModeRef.current === "voice" && preferredMode === "voice" ? "voice" : "text";
      const chatMessage: ChatMessage = {
        id: `${conversationIdRef.current || "conversation"}:${role}:${event_id ?? Date.now()}`,
        role: role === "agent" ? "assistant" : "user",
        content: message,
        timestamp: new Date().toISOString(),
        section: currentSectionRef.current,
        modality,
        conversationId: conversationIdRef.current,
      };
      void appendTranscriptMessage(chatMessage);
    },
  });

  const startConversation = useCallback(async (mode: ConversationMode) => {
    if (!formSessionIdRef.current || isStartingRef.current) {
      return;
    }

    const isConnectedVoice = conversationState === "connected_voice";
    const isConnectedText = conversationState === "connected_text";

    if ((isConnectedVoice && mode === "voice") || (isConnectedText && mode === "text")) {
      return;
    }

    if (isConnectedVoice && mode === "text") {
      cancelCountdown();
      setPreferredMode("text");
      setMicMuted(true);
      setAgentStatus("ready");
      onSwitchToTextRef.current?.();
      return;
    }

    if (isConnectedText && mode === "voice") {
      await safelyEndConversation();
    }

    isStartingRef.current = true;
    bootstrapModeRef.current = mode;
    connectModeRef.current = mode;
    setPreferredMode(mode);
    setError(null);
    setNormalizedError(null);
    cancelCountdown();

    try {
      setConversationState("bootstrapping");
      const bootstrap = await fetchBootstrap(mode);
      correlationIdRef.current = bootstrap.correlationId;
      setSessionDebug(bootstrap.debug ?? null);
      logConversationEvent(bootstrap.correlationId, "bootstrap_received", {
        mode,
        transport: bootstrap.transport,
        debug: bootstrap.debug,
      });

      if (mode === "voice") {
        setConversationState("connecting_voice");
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch (micError) {
          const normalized = normalizeError(micError, "mic_setup");
          setNormalizedError(normalized);
          setError(normalized.message);
          setConversationState("degraded");
          setAgentStatus("error");
          return;
        }
      } else {
        setConversationState("connecting_text");
      }

      setMicMuted(mode === "text");
      await conversation.startSession(buildSessionOptions(bootstrap, mode));
      if (mode === "text") {
        onSwitchToTextRef.current?.();
      }
    } catch (startError) {
      await safelyEndConversation();
      const normalized = normalizeError(
        startError,
        conversationState === "bootstrapping" ? "bootstrap" : "transport_connect",
      );
      logConversationEvent(correlationIdRef.current, "start_failed", normalized);
      setNormalizedError(normalized);
      setError(normalized.message);
      setAgentStatus("error");
      setConversationState(mode === "voice" ? "degraded" : "error");
    } finally {
      isStartingRef.current = false;
    }
  }, [cancelCountdown, conversation, conversationState, fetchBootstrap, safelyEndConversation]);

  const sendMessage = useCallback(async () => {
    const value = composerValue.trim();
    if (!value) return;

    cancelCountdown();

    if (conversationState !== "connected_voice" && conversationState !== "connected_text") {
      await startConversation("text");
      if (conversationStateRef.current !== "connected_text" && conversation.status !== "connected") {
        return;
      }
    }

    if (preferredMode !== "text") {
      setPreferredMode("text");
      setMicMuted(true);
      onSwitchToTextRef.current?.();
    }

    try {
      conversation.sendUserMessage(value);
      setComposerValue("");
      setAgentStatus("thinking");
    } catch (sendError) {
      const normalized = normalizeError(sendError, "message");
      setNormalizedError(normalized);
      setError(normalized.message);
      setAgentStatus("error");
      setConversationState("error");
    }
  }, [cancelCountdown, composerValue, conversation, conversationState, preferredMode, startConversation]);

  const endConversation = useCallback(async () => {
    cancelCountdown();
    await safelyEndConversation();
    setConversationState("idle");
    setNormalizedError(null);
    setError(null);
  }, [cancelCountdown, safelyEndConversation]);

  const switchMode = useCallback(async (mode: ConversationMode) => {
    cancelCountdown();

    if (mode === preferredMode && (conversationState === "connected_voice" || conversationState === "connected_text")) {
      return;
    }

    if (conversationState === "connected_voice" && mode === "text") {
      setPreferredMode("text");
      setMicMuted(true);
      setAgentStatus("ready");
      onSwitchToTextRef.current?.();
      return;
    }

    if (conversationState === "connected_text" && mode === "voice") {
      await safelyEndConversation();
    }

    await startConversation(mode);
  }, [cancelCountdown, conversationState, preferredMode, safelyEndConversation, startConversation]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  return {
    transcript,
    composerValue,
    setComposerValue,
    sendTypingActivity: () => {
      if (conversationState === "connected_voice" || conversationState === "connected_text") {
        try {
          conversation.sendUserActivity();
        } catch (activityError) {
          logConversationEvent(correlationIdRef.current, "typing_activity_failed", activityError);
        }
      }
    },
    sendMessage,
    startConversation,
    endConversation,
    switchMode,
    startRedirectCountdown: startCountdown,
    cancelCountdown,
    countdown,
    preferredMode,
    conversationState,
    status: conversation.status,
    agentStatus,
    isConnected: conversationState === "connected_voice" || conversationState === "connected_text",
    isSpeaking: conversation.isSpeaking,
    error,
    normalizedError,
    sessionDebug,
    isMissingFieldsExpanded,
    setIsMissingFieldsExpanded,
  };
}
