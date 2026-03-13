import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch, queryClient } from "@/lib/queryClient";
import { useElevenLabsConversation } from "@/hooks/use-elevenlabs-conversation";
import type { AgentStatus, ChatMessage, ReadinessStatus, Section, WorkflowState } from "@shared/schema";
import { SECTIONS, SECTION_LABELS } from "@shared/schema";
import {
  ArrowRight,
  AudioLines,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Keyboard,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  Radio,
  Sun,
  UserCircle2,
  Volume2,
} from "lucide-react";

function getStatusLabel(status: AgentStatus, mode: "voice" | "text") {
  if (mode === "text" && (status === "ready" || status === "listening")) {
    return "Text mode";
  }

  switch (status) {
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "error":
      return "Needs attention";
    case "ready":
      return "Ready";
    default:
      return "Idle";
  }
}

export default function ChatPage() {
  const { user, formSessionId, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
  const currentSection: Section = sessionData?.formSession?.currentSection || "INTRO";
  const currentSectionIndex = Math.max(SECTIONS.indexOf(currentSection), 0);
  const progressPercent = ((currentSectionIndex + 1) / SECTIONS.length) * 100;
  const inReviewContext = workflowState?.mode === "review" || workflowState?.mode === "post_payment_review";

  const syncSession = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/form/load", formSessionId] });
  };

  const conversation = useElevenLabsConversation({
    formSessionId,
    initialMessages: messages,
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

  useEffect(() => {
    if (workflowState?.pendingRedirect === "review" && !conversation.countdown) {
      conversation.startRedirectCountdown("review");
    }
  }, [conversation, workflowState?.pendingRedirect]);

  const transcript = useMemo(
    () => conversation.transcript.length > 0 ? conversation.transcript : messages,
    [conversation.transcript, messages],
  );

  if (!user || !formSessionId) return null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.16),_transparent_45%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.35))]">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
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
                <p className="text-xs text-muted-foreground">Voice-first N-400 intake</p>
              </div>
            </Link>
            <Badge variant="outline" className="hidden text-xs sm:inline-flex" data-testid="badge-section">
              {SECTION_LABELS[currentSection]}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {workflowState?.readyForReview ? (
              <Link href="/review">
                <Button size="sm" data-testid="button-go-review">
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

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Progress</p>
                <p className="text-xs text-muted-foreground">
                  Section {currentSectionIndex + 1} of {SECTIONS.length}
                </p>
              </div>
              <Badge variant={readiness?.eligibleForReview ? "default" : "secondary"}>
                {readiness?.eligibleForReview ? "Ready for review" : "Collecting info"}
              </Badge>
            </div>
            <Progress value={progressPercent} className="mt-4 h-2" data-testid="progress-bar" />
            <div className="mt-4 flex flex-wrap gap-2">
              {SECTIONS.map((section, index) => (
                <div
                  key={section}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                    index < currentSectionIndex
                      ? "bg-primary/10 text-primary"
                      : index === currentSectionIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {index < currentSectionIndex ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  <span>{SECTION_LABELS[section]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Conversation</p>
                <p className="text-xs text-muted-foreground">
                  {conversation.preferredMode === "voice" ? "Talk naturally or switch to typing" : "Text-only mode is active"}
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                {conversation.agentStatus === "speaking" ? <Volume2 className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                {getStatusLabel(conversation.agentStatus, conversation.preferredMode)}
              </Badge>
            </div>

            {!conversation.isConnected ? (
              <div className="mt-5 rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <AudioLines className="h-6 w-6" />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium">Start by voice</p>
                      <p className="text-sm text-muted-foreground">
                        We will ask one question at a time and keep a live transcript on screen.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void conversation.startConversation("voice")} data-testid="button-start-voice">
                        <Mic className="mr-2 h-4 w-4" />
                        Start voice conversation
                      </Button>
                      <Button variant="outline" onClick={() => void conversation.startConversation("text")}>
                        <Keyboard className="mr-2 h-4 w-4" />
                        Start in text mode
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant={conversation.preferredMode === "voice" ? "default" : "outline"}
                    onClick={() => void conversation.switchMode("voice")}
                    data-testid="button-mode-voice"
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    Voice mode
                  </Button>
                  <Button
                    variant={conversation.preferredMode === "text" ? "default" : "outline"}
                    onClick={() => void conversation.switchMode("text")}
                    data-testid="button-mode-text"
                  >
                    <Keyboard className="mr-2 h-4 w-4" />
                    Switch to typing
                  </Button>
                </div>
                <Button variant="ghost" className="w-full justify-start" onClick={() => void conversation.endConversation()}>
                  {conversation.preferredMode === "voice" ? <MicOff className="mr-2 h-4 w-4" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                  End current session
                </Button>
              </div>
            )}

            {conversation.countdown ? (
              <Alert className="mt-4">
                <ArrowRight className="h-4 w-4" />
                <AlertTitle>
                  Opening {conversation.countdown.target} in {conversation.countdown.secondsLeft}s
                </AlertTitle>
                <AlertDescription>
                  Speak or type anything to stay here and cancel the automatic handoff.
                </AlertDescription>
              </Alert>
            ) : null}
          </section>

          <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">What still needs to be collected</p>
                <p className="text-xs text-muted-foreground">We keep this visible so the agent and the user stay aligned.</p>
              </div>
              {(readiness?.missingFields.length || 0) > 3 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => conversation.setIsMissingFieldsExpanded(!conversation.isMissingFieldsExpanded)}
                >
                  {conversation.isMissingFieldsExpanded ? "Collapse" : "Expand"}
                </Button>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(readiness?.missingFields.length || 0) > 0 ? (
                (conversation.isMissingFieldsExpanded ? readiness?.missingFields : readiness?.missingFields.slice(0, 4))?.map((field) => (
                  <Badge key={field} variant="secondary">{field}</Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Core supported applicant details are currently covered.</p>
              )}
            </div>
          </section>
        </aside>

        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-[32px] border border-border/70 bg-background/90 shadow-xl">
          <div className="border-b border-border/70 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Live transcript</p>
                <p className="text-xs text-muted-foreground">Voice stays primary, but the keyboard is always available.</p>
              </div>
              <Badge variant="outline" className="gap-1">
                {conversation.preferredMode === "voice" ? <Mic className="h-3 w-3" /> : <Keyboard className="h-3 w-3" />}
                {conversation.preferredMode === "voice" ? "Voice-first" : "Typing"}
              </Badge>
            </div>
          </div>

          {inReviewContext ? (
            <div className="border-b border-border bg-primary/5 px-5 py-4">
              <Alert>
                <ClipboardCheck className="h-4 w-4" />
                <AlertTitle>
                  {workflowState?.mode === "post_payment_review" ? "Post-payment edit mode" : "Review edit mode"}
                </AlertTitle>
                <AlertDescription>
                  The assistant keeps your current application intact and only updates the corrections you ask for.
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
                {isLoadingSession ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-3/4" />
                    <Skeleton className="ml-auto h-10 w-1/2" />
                    <Skeleton className="h-16 w-3/4" />
                  </div>
                ) : transcript.length === 0 ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-muted-foreground">
                    <MessageSquare className="mb-4 h-12 w-12 opacity-30" />
                    <p className="text-base">Your transcript will appear here as soon as the conversation starts.</p>
                    <p className="mt-2 text-sm">You can talk first or start directly in text mode.</p>
                  </div>
                ) : (
                  transcript.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${message.role}-${message.id}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          message.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border bg-card"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] opacity-70">
                          <span>{message.role === "user" ? "You" : "CitizenFlow"}</span>
                          {message.modality ? <span>{message.modality}</span> : null}
                        </div>
                        {message.content.split("\n").map((line, index) => (
                          <p key={`${message.id}-${index}`} className={index > 0 ? "mt-2" : ""}>{line}</p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="border-t border-border/70 bg-card/60 px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {conversation.preferredMode === "voice"
                    ? "Voice is active. You can interrupt the handoff countdown by speaking or typing."
                    : "Typing uses the same ElevenLabs conversation so context stays intact."}
                </p>
                {conversation.status === "connecting" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
              </div>

              <div className="flex items-end gap-2">
                <Button
                  variant={conversation.preferredMode === "voice" ? "default" : "outline"}
                  size="icon"
                  className="mb-0.5 shrink-0"
                  onClick={() => void conversation.switchMode(conversation.preferredMode === "voice" ? "text" : "voice")}
                  data-testid="button-voice-toggle"
                  aria-label={conversation.preferredMode === "voice" ? "Switch to typing" : "Switch to voice"}
                >
                  {conversation.preferredMode === "voice" ? <Mic className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
                </Button>
                <Textarea
                  ref={inputRef}
                  value={conversation.composerValue}
                  onChange={(event) => {
                    conversation.setComposerValue(event.target.value);
                    conversation.sendTypingActivity();
                    if (conversation.countdown) {
                      conversation.cancelCountdown();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void conversation.sendMessage();
                    }
                  }}
                  placeholder={inReviewContext ? "Describe the correction you want to make..." : "Type here if you prefer the keyboard"}
                  className="min-h-[50px] max-h-[140px] resize-none"
                  data-testid="input-chat"
                  rows={1}
                />
                <Button
                  className="mb-0.5 shrink-0"
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
        </section>
      </main>
    </div>
  );
}
