import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ChatInlineEditor } from "@/components/chat-inline-editor";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch, queryClient } from "@/lib/queryClient";
import { useElevenLabsConversation } from "@/hooks/use-elevenlabs-conversation";
import type {
  AgentStatus,
  ChatMessage,
  ChatSessionSnapshot,
  ReadinessStatus,
  Section,
  WorkflowState,
} from "@shared/schema";
import { SECTIONS, SECTION_LABELS } from "@shared/schema";
import {
  ArrowDown,
  ArrowRight,
  ChevronDown,
  Keyboard,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  Moon,
  PauseCircle,
  Sun,
  UserCircle2,
  Volume2,
  Waves,
} from "lucide-react";

const MISSING_FIELD_LABELS: Record<string, string> = {
  "personalInfo.fullName": "Your full legal name",
  "personalInfo.firstName": "Your first name",
  "personalInfo.lastName": "Your last name",
  "personalInfo.dateOfBirth": "Your date of birth",
  "personalInfo.aNumber": "Your A-Number",
  "personalInfo.dateBecamePR": "The date you became a permanent resident",
  "personalInfo.countryOfBirth": "Your country of birth",
  "personalInfo.nationality": "Your current nationality",
  "personalInfo.gender": "The gender listed on your application",
  "personalInfo.email": "Your email address",
  "personalInfo.phone": "Your daytime phone number",
  "personalInfo.eligibilityBasis": "How you qualify to apply for citizenship",
  "biographic.ethnicity": "Your ethnicity",
  "biographic.race": "Your race",
  "biographic.heightFeet": "Your height",
  "biographic.heightInches": "Your height",
  "biographic.weightLbs": "Your weight",
  "biographic.eyeColor": "Your eye color",
  "biographic.hairColor": "Your hair color",
  "residenceHistory[0].address": "Your current street address",
  "residenceHistory[0].city": "Your current city",
  "residenceHistory[0].state": "Your current state",
  "residenceHistory[0].zip": "Your current ZIP code",
  "residenceHistory[0].country": "Your current country",
  "residenceHistory[0].moveInDate": "When you moved to your current address",
  "family.maritalStatus": "Your current marital status",
  "family.timesMarried": "How many times you have been married",
  "family.spouse.fullName": "Your spouse's full name",
  "family.spouse.dateOfBirth": "Your spouse's date of birth",
  "family.spouse.dateOfMarriage": "The date of your current marriage",
  "family.totalChildren": "How many children you have",
  employment: "Your work or school history",
  travelHistory: "Your trips outside the United States",
};

function humanizeField(field: string) {
  if (MISSING_FIELD_LABELS[field]) return MISSING_FIELD_LABELS[field];

  return field
    .replace(/\[(\d+)\]/g, (_match, index) => ` ${Number(index) + 1} `)
    .split(".")
    .map((part) =>
      part
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (value) => value.toUpperCase())
        .trim(),
    )
    .join(" ");
}

function getStatusLabel(agentStatus: AgentStatus, uiState: string, preferredMode: "voice" | "text") {
  if (uiState === "entry") return "Ready";
  if (uiState === "resume_prompt") return "Saved";
  if (uiState === "stopped_resumable") return "Saved";
  if (uiState === "starting_voice") return "Connecting voice";
  if (uiState === "starting_text") return "Preparing typing";
  if (uiState === "switching_voice") return "Switching to voice";
  if (uiState === "switching_text") return "Switching to typing";
  if (uiState === "error_recoverable") return "Recovering";
  if (uiState === "handoff_ready") return "Ready to continue";
  if (preferredMode === "text") {
    if (agentStatus === "thinking") return "Thinking";
    return "Typing";
  }
  if (agentStatus === "speaking") return "Speaking";
  if (agentStatus === "thinking") return "Thinking";
  if (agentStatus === "listening") return "Listening";
  return "Ready";
}

function getStatusIcon(uiState: string, agentStatus: AgentStatus, preferredMode: "voice" | "text") {
  if (uiState === "starting_voice" || uiState === "starting_text" || uiState === "switching_voice" || uiState === "switching_text") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  }
  if (preferredMode === "voice") {
    return agentStatus === "speaking" ? <Volume2 className="h-3.5 w-3.5" /> : <Waves className="h-3.5 w-3.5" />;
  }
  return <MessageSquare className="h-3.5 w-3.5" />;
}

function StatusMotion({ uiState, agentStatus, preferredMode }: {
  uiState: string;
  agentStatus: AgentStatus;
  preferredMode: "voice" | "text";
}) {
  const isConnecting = uiState === "starting_voice"
    || uiState === "starting_text"
    || uiState === "switching_voice"
    || uiState === "switching_text"
    || uiState === "error_recoverable";
  const isThinking = agentStatus === "thinking";
  const isListening = preferredMode === "voice" && agentStatus === "listening";
  const isSpeaking = preferredMode === "voice" && agentStatus === "speaking";

  if (!isConnecting && !isThinking && !isListening && !isSpeaking) {
    return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" aria-hidden="true" />;
  }

  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      <span className={`h-2 w-2 rounded-full ${isSpeaking ? "animate-pulse bg-primary" : "animate-bounce bg-primary/80"}`} />
      <span className={`h-2 w-2 rounded-full ${isConnecting || isThinking ? "animate-bounce bg-primary/70 [animation-delay:120ms]" : "animate-pulse bg-primary/70"}`} />
      <span className={`h-2 w-2 rounded-full ${isListening ? "animate-bounce bg-primary/60 [animation-delay:240ms]" : "animate-pulse bg-primary/60"}`} />
    </span>
  );
}

export default function ChatPage() {
  const { user, formSessionId, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showInlineEditor, setShowInlineEditor] = useState(false);

  useEffect(() => {
    if (!user || !formSessionId) {
      navigate("/login");
    }
  }, [user, formSessionId, navigate]);

  const { data: sessionData, isLoading: isLoadingSession } = useQuery({
    queryKey: ["/api/form/load", formSessionId],
    queryFn: async () => {
      if (!formSessionId) return null;
      const res = await authenticatedFetch(`/api/form/load?sessionId=${formSessionId}`);
      if (!res.ok) throw new Error("Failed to load session");
      return res.json();
    },
    enabled: !!formSessionId,
  });

  const messages: ChatMessage[] = sessionData?.conversations || [];
  const workflowState: WorkflowState | undefined = sessionData?.formSession?.workflowState;
  const readiness: ReadinessStatus | undefined = workflowState?.lastReadiness;
  const chatState: ChatSessionSnapshot | undefined = sessionData?.chatState;
  const currentSection: Section = sessionData?.formSession?.currentSection || "INTRO";
  const currentSectionIndex = Math.max(SECTIONS.indexOf(currentSection), 0);
  const progressPercent = ((currentSectionIndex + 1) / SECTIONS.length) * 100;

  const syncSession = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/form/load", formSessionId] });
  };

  const conversation = useElevenLabsConversation({
    formSessionId,
    initialMessages: messages,
    initialChatState: chatState,
    currentSection,
    onSwitchToText: () => inputRef.current?.focus(),
    onNavigate: (target) => navigate(`/${target}`),
    onSessionSync: syncSession,
  });

  useEffect(() => {
    if (conversation.error) {
      toast({
        title: "Conversation issue",
        description: conversation.error,
        variant: "destructive",
      });
    }
  }, [conversation.error, toast]);

  const transcript = useMemo(
    () => (conversation.transcript.length > 0 ? conversation.transcript : messages),
    [conversation.transcript, messages],
  );

  const collectedFieldCount = useMemo(() => {
    if (!sessionData?.formSession?.formData) {
      return 0;
    }

    const countScalars = (value: unknown): number => {
      if (Array.isArray(value)) {
        return value.reduce((total, entry) => total + countScalars(entry), 0);
      }
      if (value && typeof value === "object") {
        return Object.values(value as Record<string, unknown>).reduce<number>(
          (total, entry) => total + countScalars(entry),
          0,
        );
      }
      if (typeof value === "boolean") return 1;
      if (typeof value === "number") return 1;
      if (typeof value === "string" && value.trim().length > 0) return 1;
      return 0;
    };

    return countScalars(sessionData.formSession.formData);
  }, [sessionData?.formSession?.formData]);

  const missingFieldLabels = useMemo(
    () => (readiness?.missingFields ?? []).map(humanizeField),
    [readiness?.missingFields],
  );

  const currentPrompt = chatState?.currentPrompt
    ?? [...transcript].reverse().find((message) => message.role === "assistant")?.content
    ?? "Your guide is getting your first question ready.";
  const nextRequiredLabel = chatState?.nextRequiredItem
    ? humanizeField(chatState.nextRequiredItem)
    : missingFieldLabels[0];

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const element = transcriptRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  };

  useEffect(() => {
    if (stickToBottom) {
      scrollToBottom(transcript.length > 1 ? "smooth" : "auto");
    }
  }, [stickToBottom, transcript.length]);

  useEffect(() => {
    if (conversation.uiState === "active_voice" || conversation.uiState === "active_text" || conversation.uiState === "resume_prompt") {
      scrollToBottom("auto");
    }
  }, [conversation.uiState]);

  const handleTranscriptScroll = () => {
    const element = transcriptRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const hasOverflow = element.scrollHeight > element.clientHeight + 120;
    const atBottom = distanceFromBottom < 80;
    setStickToBottom(atBottom);
    setShowJumpToLatest(hasOverflow && distanceFromBottom > 320);
  };

  if (!user || !formSessionId) return null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.45))]">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="CitizenFlow">
                <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
                <path d="M8 16C8 11.58 11.58 8 16 8C18.4 8 20.56 9.08 22 10.76" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M24 16C24 20.42 20.42 24 16 24C13.6 24 11.44 22.92 10 21.24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M14 15L16 17L20 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p className="text-sm font-semibold leading-none">CitizenFlow</p>
                <p className="text-xs text-muted-foreground">N-400 application guide</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {workflowState?.readyForReview ? (
              <Link href="/review">
                <Button size="sm" variant="outline" data-testid="button-go-review">
                  Review <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            ) : null}
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-chat-theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Link href="/account">
              <Button variant="ghost" size="icon" data-testid="button-account">
                <UserCircle2 className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await logout();
                navigate("/");
              }}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
        <Card className="flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col overflow-hidden border-border/70 bg-background/95 shadow-sm">
          <div className="sticky top-0 z-20 border-b border-border/70 bg-card/95 backdrop-blur">
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-2">
                      <StatusMotion
                        uiState={conversation.uiState}
                        agentStatus={conversation.agentStatus}
                        preferredMode={conversation.preferredMode}
                      />
                      {getStatusIcon(conversation.uiState, conversation.agentStatus, conversation.preferredMode)}
                      {getStatusLabel(conversation.agentStatus, conversation.uiState, conversation.preferredMode)}
                    </Badge>
                    <Badge variant="secondary" data-testid="badge-section">
                      {SECTION_LABELS[currentSection]}
                    </Badge>
                  </div>
                  <h1 className="text-base font-semibold">Current question</h1>
                  <p className="max-w-3xl text-sm text-muted-foreground">
                    {currentPrompt}
                  </p>
                  {nextRequiredLabel ? (
                    <p className="text-xs text-muted-foreground">
                      Next thing we still need: <span className="font-medium text-foreground">{nextRequiredLabel}</span>
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {(conversation.uiState === "entry" || conversation.uiState === "resume_prompt" || conversation.uiState === "stopped_resumable") ? (
                    <>
                      <Button size="sm" onClick={() => void conversation.startConversation("voice")} data-testid={conversation.uiState === "entry" ? "button-start-voice" : "button-resume-voice"}>
                        <Mic className="mr-2 h-4 w-4" />
                        {conversation.uiState === "entry" ? "Talk with guide" : "Resume by voice"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void conversation.startConversation("text")} data-testid={conversation.uiState === "entry" ? "button-start-text" : "button-resume-text"}>
                        <Keyboard className="mr-2 h-4 w-4" />
                        {conversation.uiState === "entry" ? "Type instead" : "Resume by typing"}
                      </Button>
                    </>
                  ) : null}

                  {conversation.uiState === "error_recoverable" ? (
                    <>
                      <Button size="sm" onClick={() => void conversation.startConversation("voice")} data-testid="button-retry-voice">
                        <Mic className="mr-2 h-4 w-4" />
                        Retry voice
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void conversation.startConversation("text")} data-testid="button-retry-text">
                        <Keyboard className="mr-2 h-4 w-4" />
                        Keep typing
                      </Button>
                    </>
                  ) : null}

                  {conversation.uiState === "handoff_ready" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void conversation.continueToTarget(chatState?.pendingHandoffTarget ?? "review")}
                        data-testid="button-continue-handoff"
                      >
                        Continue
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void conversation.stayInChat()} data-testid="button-stay-chat">
                        Stay here
                      </Button>
                    </>
                  ) : null}

                  {(conversation.uiState === "active_voice"
                    || conversation.uiState === "active_text"
                    || conversation.uiState === "starting_voice"
                    || conversation.uiState === "starting_text"
                    || conversation.uiState === "switching_voice"
                    || conversation.uiState === "switching_text") ? (
                    <>
                      <Button
                        size="sm"
                        variant={conversation.preferredMode === "voice" ? "default" : "outline"}
                        onClick={() => void conversation.switchMode("voice")}
                        data-testid="button-mode-voice"
                      >
                        <Mic className="mr-2 h-4 w-4" />
                        Voice
                      </Button>
                      <Button
                        size="sm"
                        variant={conversation.preferredMode === "text" ? "default" : "outline"}
                        onClick={() => void conversation.switchMode("text")}
                        data-testid="button-mode-text"
                      >
                        <Keyboard className="mr-2 h-4 w-4" />
                        Typing
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void conversation.pauseConversation()} data-testid="button-pause-chat">
                        <PauseCircle className="mr-2 h-4 w-4" />
                        Pause chat
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Section {currentSectionIndex + 1} of {SECTIONS.length}</span>
                  <span>{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {SECTIONS.map((section, index) => (
                    <div
                      key={section}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] ${
                        index < currentSectionIndex
                          ? "bg-primary/10 text-primary"
                          : index === currentSectionIndex
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {SECTION_LABELS[section]}
                    </div>
                  ))}
                </div>
              </div>

              {conversation.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Conversation issue</AlertTitle>
                  <AlertDescription>{conversation.error}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <div
              ref={transcriptRef}
              onScroll={handleTranscriptScroll}
              className="h-full overflow-y-auto px-4 py-4"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-4">
                {isLoadingSession ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-3/4" />
                    <Skeleton className="ml-auto h-10 w-1/2" />
                    <Skeleton className="h-16 w-3/4" />
                  </div>
                ) : transcript.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-3xl border border-dashed border-border text-center text-muted-foreground">
                    <MessageSquare className="mb-4 h-12 w-12 opacity-30" />
                    <p className="text-base">Your conversation will appear here after you begin.</p>
                    <p className="mt-2 max-w-md text-sm">Pick voice or typing above. We will save the conversation either way.</p>
                  </div>
                ) : (
                  transcript.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${message.role}-${message.id}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[82%] ${
                          message.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border bg-card"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] opacity-70">
                          <span>{message.role === "user" ? "You" : "Your guide"}</span>
                        </div>
                        {message.content.split("\n").map((line, index) => (
                          <p key={`${message.id}-${index}`} className={index > 0 ? "mt-2" : ""}>{line}</p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {showJumpToLatest ? (
              <Button
                size="sm"
                variant="secondary"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-lg"
                onClick={() => {
                  setStickToBottom(true);
                  scrollToBottom();
                }}
                data-testid="button-jump-latest"
              >
                <ArrowDown className="mr-1 h-4 w-4" />
                Latest
              </Button>
            ) : null}
          </div>

          <div className="border-t border-border/70 bg-card/60 px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <p className="line-clamp-2">
                  {conversation.preferredMode === "voice"
                    ? "Voice is on. You can type at any time and we will keep the same question."
                    : "Typing mode is on. You can switch to voice without losing your place."}
                </p>
                <Badge variant="outline" className="gap-2">
                  <StatusMotion
                    uiState={conversation.uiState}
                    agentStatus={conversation.agentStatus}
                    preferredMode={conversation.preferredMode}
                  />
                  {getStatusIcon(conversation.uiState, conversation.agentStatus, conversation.preferredMode)}
                  {getStatusLabel(conversation.agentStatus, conversation.uiState, conversation.preferredMode)}
                </Badge>
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={conversation.composerValue}
                  onChange={(event) => {
                    conversation.setComposerValue(event.target.value);
                    conversation.sendTypingActivity();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void conversation.sendMessage();
                    }
                  }}
                  placeholder="Type your answer here"
                  className="min-h-[44px] max-h-[112px] resize-none"
                  data-testid="input-chat"
                  rows={1}
                />
                <Button
                  className="shrink-0"
                  onClick={() => void conversation.sendMessage()}
                  disabled={!conversation.composerValue.trim()}
                  data-testid="button-send"
                  aria-label="Send message"
                >
                  {conversation.agentStatus === "thinking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {sessionData?.formSession?.formData ? (
            <Collapsible open={showInlineEditor} onOpenChange={setShowInlineEditor}>
              <div className="border-t border-border/70 bg-card/70">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    data-testid="button-toggle-inline-editor"
                  >
                    <div>
                      <p className="text-sm font-semibold">Expand to edit collected info</p>
                      <p className="text-xs text-muted-foreground">
                        {collectedFieldCount > 0
                          ? `${collectedFieldCount} saved answer${collectedFieldCount === 1 ? "" : "s"} ready to edit`
                          : "Your saved answers will appear here as we collect them."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{collectedFieldCount}</Badge>
                      <ChevronDown className={`h-4 w-4 transition-transform ${showInlineEditor ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-border/70 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="max-h-[28vh] overflow-y-auto">
                    <ChatInlineEditor
                      embedded
                      formSessionId={formSessionId}
                      formData={sessionData.formSession.formData}
                      onUpdated={syncSession}
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ) : null}
        </Card>
      </main>
    </div>
  );
}
