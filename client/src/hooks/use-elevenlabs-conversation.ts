import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import type { AgentStatus, ChatMessage, ConversationMode, Section } from "@shared/schema";

interface BootstrapResponse {
  conversationToken: string;
  signedUrl?: string;
  serverLocation: string;
  agentId: string;
  formSessionId: string;
  currentSection: Section;
  workflowMode: string;
  readyForReview: boolean;
  missingFields: string[];
  supportedScopeSummary: string;
  existingTranscript: ChatMessage[];
  prompt: string;
  firstMessage: string;
  dynamicVariables: Record<string, string | number | boolean>;
  preferredMode: ConversationMode;
}

interface CountdownState {
  target: "review" | "payment";
  secondsLeft: number;
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

function createSessionOptions(bootstrap: BootstrapResponse, mode: ConversationMode) {
  const sessionDynamicVariables = {
    user_first_name: bootstrap.dynamicVariables.user_first_name,
    form_session_id: bootstrap.dynamicVariables.form_session_id,
    current_section: bootstrap.dynamicVariables.current_section,
    workflow_mode: bootstrap.dynamicVariables.workflow_mode,
    ready_for_review: bootstrap.dynamicVariables.ready_for_review,
  };

  const commonOptions = {
    workletPaths: WORKLET_PATHS,
    dynamicVariables: sessionDynamicVariables,
    userId: String(bootstrap.formSessionId),
    overrides: {
      conversation: {
        textOnly: mode === "text",
      },
      client: {
        source: "citizenflow-web",
        version: "1",
      },
    },
  };

  if (bootstrap.signedUrl) {
    return {
      signedUrl: bootstrap.signedUrl,
      connectionType: "websocket" as const,
      textOnly: mode === "text",
      ...commonOptions,
    };
  }

  return {
    conversationToken: bootstrap.conversationToken,
    connectionType: "webrtc" as const,
    textOnly: mode === "text",
    serverLocation: bootstrap.serverLocation,
    ...commonOptions,
  };
}

function createWebRtcSessionOptions(bootstrap: BootstrapResponse, mode: ConversationMode) {
  const sessionDynamicVariables = {
    user_first_name: bootstrap.dynamicVariables.user_first_name,
    form_session_id: bootstrap.dynamicVariables.form_session_id,
    current_section: bootstrap.dynamicVariables.current_section,
    workflow_mode: bootstrap.dynamicVariables.workflow_mode,
    ready_for_review: bootstrap.dynamicVariables.ready_for_review,
  };

  return {
    conversationToken: bootstrap.conversationToken,
    connectionType: "webrtc" as const,
    textOnly: mode === "text",
    serverLocation: bootstrap.serverLocation,
    workletPaths: WORKLET_PATHS,
    dynamicVariables: sessionDynamicVariables,
    userId: String(bootstrap.formSessionId),
    overrides: {
      conversation: {
        textOnly: mode === "text",
      },
      client: {
        source: "citizenflow-web",
        version: "1",
      },
    },
  };
}

function isRecoverableTransportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /socket error|websocket|connection closed|failed to fetch|networkerror/i.test(message);
}

function isRecoverableVoiceSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /worklet|audioworklet|audio capture|microphone|rawaudioprocessor|audioconcatprocessor|cannot set microp/i.test(
    message,
  );
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

function createTranscriptKey(message: Pick<ChatMessage, "id" | "timestamp" | "role" | "content">) {
  return `${message.id}:${message.timestamp}:${message.role}:${message.content}`;
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
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [composerValue, setComposerValue] = useState("");
  const [transcript, setTranscript] = useState<ChatMessage[]>(initialMessages);
  const [countdown, setCountdown] = useState<CountdownState | null>(null);
  const [isMissingFieldsExpanded, setIsMissingFieldsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const conversationIdRef = useRef<string>();
  const seenTranscriptKeysRef = useRef(new Set<string>());
  const countdownTimerRef = useRef<number | null>(null);
  const startedSessionModeRef = useRef<ConversationMode | null>(null);
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
    if (!formSessionId) return;
    await apiRequest("POST", "/api/elevenlabs/messages", {
      formSessionId,
      message: {
        ...message,
        section: message.section ?? currentSection,
      },
    });
  }, [currentSection, formSessionId]);

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
    if (!formSessionId) {
      throw new Error("No active form session");
    }
    const res = await apiRequest("POST", "/api/elevenlabs/session", {
      formSessionId,
      mode,
    });
    return res.json() as Promise<BootstrapResponse>;
  }, [formSessionId]);

  const clientTools = useRef({
    async get_form_state(_params: Record<string, unknown>) {
      const res = await apiRequest("POST", "/api/elevenlabs/tool", {
        formSessionId: formSessionIdRef.current,
        toolName: "get_form_state",
        arguments: {},
        conversationId: conversationIdRef.current,
      });
      onSessionSyncRef.current?.();
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
      setAgentStatus(preferredMode === "text" ? "ready" : "listening");
      setError(null);
    },
    onDisconnect: () => {
      setAgentStatus("idle");
      conversationIdRef.current = undefined;
      startedSessionModeRef.current = null;
    },
    onError: (message) => {
      setError(message);
      setAgentStatus("error");
    },
    onModeChange: ({ mode }) => {
      setAgentStatus(mode === "speaking" ? "speaking" : preferredMode === "text" ? "ready" : "listening");
    },
    onStatusChange: ({ status }) => {
      if (status === "connecting") {
        setAgentStatus(startedSessionModeRef.current ? "reconnecting" : "connecting");
        return;
      }
      if (status === "connected" && preferredMode === "text") {
        setAgentStatus("ready");
      }
      if (status === "disconnecting" || status === "disconnected") {
        setAgentStatus("idle");
      }
    },
    onInterruption: () => {
      cancelCountdown();
      setAgentStatus(preferredMode === "text" ? "ready" : "listening");
    },
    onAgentToolRequest: () => {
      setAgentStatus("thinking");
    },
    onAgentToolResponse: () => {
      setAgentStatus(preferredMode === "text" ? "ready" : "listening");
    },
    onMessage: ({ message, role, event_id }) => {
      cancelCountdown();
      const chatMessage: ChatMessage = {
        id: `${conversationIdRef.current || "conversation"}:${role}:${event_id ?? Date.now()}`,
        role: role === "agent" ? "assistant" : "user",
        content: message,
        timestamp: new Date().toISOString(),
        section: currentSectionRef.current,
        modality: startedSessionModeRef.current === "text" || preferredMode === "text" ? "text" : "voice",
        conversationId: conversationIdRef.current,
      };
      void appendTranscriptMessage(chatMessage);
    },
  });

  const startConversation = useCallback(async (mode: ConversationMode) => {
    if (!formSessionId) return;
    setPreferredMode(mode);
    setError(null);
    cancelCountdown();

    try {
      if (conversation.status === "connected") {
        if (mode === "text") {
          setMicMuted(true);
          setAgentStatus("ready");
          onSwitchToText?.();
        } else {
          setMicMuted(false);
          setAgentStatus("listening");
        }
        startedSessionModeRef.current = mode;
        return;
      }

      const bootstrap = await fetchBootstrap(mode);
      startedSessionModeRef.current = mode;

      if (mode === "voice") {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          const textBootstrap = await fetchBootstrap("text");
          setPreferredMode("text");
          startedSessionModeRef.current = "text";
          onSwitchToText?.();
          await conversation.startSession(createSessionOptions(textBootstrap, "text"));
          setMicMuted(true);
          setAgentStatus("ready");
          setError("Microphone access was unavailable, so the conversation switched to text mode.");
          return;
        }
      }

      setMicMuted(mode === "text");

      try {
        await conversation.startSession(createSessionOptions(bootstrap, mode));
      } catch (transportError) {
        if (
          mode === "voice" &&
          bootstrap.signedUrl &&
          isRecoverableTransportError(transportError)
        ) {
          await conversation.startSession(createWebRtcSessionOptions(bootstrap, mode));
        } else {
          throw transportError;
        }
      }
    } catch (error) {
      if (mode === "voice" && isRecoverableVoiceSetupError(error)) {
        try {
          await conversation.endSession();
        } catch {
          // Ignore cleanup errors and continue to text fallback.
        }

        try {
          const textBootstrap = await fetchBootstrap("text");
          setPreferredMode("text");
          startedSessionModeRef.current = "text";
          onSwitchToText?.();
          setMicMuted(true);
          await conversation.startSession(createSessionOptions(textBootstrap, "text"));
          setAgentStatus("ready");
          setError("Voice setup hit a browser audio issue, so the conversation switched to text mode.");
          return;
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          setError(`Voice and text fallback both failed: ${fallbackMessage}`);
          setAgentStatus("error");
          return;
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      setAgentStatus("error");
    }
  }, [cancelCountdown, conversation, fetchBootstrap, formSessionId, onSwitchToText]);

  const sendMessage = useCallback(async () => {
    const value = composerValue.trim();
    if (!value) return;

    cancelCountdown();
    if (conversation.status !== "connected") {
      await startConversation("text");
    } else if (preferredMode !== "text") {
      setPreferredMode("text");
      setMicMuted(true);
      onSwitchToText?.();
    }

    try {
      conversation.sendUserMessage(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(`Unable to send the message yet: ${message}`);
      setAgentStatus("error");
      return;
    }
    setComposerValue("");
    setAgentStatus("thinking");
  }, [cancelCountdown, composerValue, conversation, onSwitchToText, preferredMode, startConversation]);

  const endConversation = useCallback(async () => {
    cancelCountdown();
    await conversation.endSession();
    setMicMuted(false);
    setAgentStatus("idle");
    startedSessionModeRef.current = null;
  }, [cancelCountdown, conversation]);

  const switchMode = useCallback(async (mode: ConversationMode) => {
    cancelCountdown();
    if (mode === preferredMode && conversation.status === "connected") {
      return;
    }

    if (conversation.status === "connected") {
      setPreferredMode(mode);
      if (mode === "text") {
        setMicMuted(true);
        setAgentStatus("ready");
        onSwitchToText?.();
      } else {
        setMicMuted(false);
        setAgentStatus("listening");
      }
      startedSessionModeRef.current = mode;
      return;
    }

    await startConversation(mode);
  }, [cancelCountdown, conversation.status, onSwitchToText, preferredMode, startConversation]);

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
      if (conversation.status === "connected") {
        conversation.sendUserActivity();
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
    status: conversation.status,
    agentStatus,
    isConnected: conversation.status === "connected",
    isSpeaking: conversation.isSpeaking,
    error,
    isMissingFieldsExpanded,
    setIsMissingFieldsExpanded,
  };
}
