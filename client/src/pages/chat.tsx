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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Keyboard,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  Sun,
  UserCircle2,
  Volume2,
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

function humanizeMissingField(field: string) {
  if (MISSING_FIELD_LABELS[field]) {
    return MISSING_FIELD_LABELS[field];
  }

  const withoutIndex = field.replace(/\[\d+\]/g, "");
  if (MISSING_FIELD_LABELS[withoutIndex]) {
    return MISSING_FIELD_LABELS[withoutIndex];
  }

  const label = withoutIndex
    .split(".")
    .slice(-1)[0]
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());

  return `Your ${label.toLowerCase()}`;
}

function getSimpleStatusLabel(agentStatus: AgentStatus, uiState: string) {
  if (uiState === "starting_voice") return "Starting voice";
  if (uiState === "starting_text") return "Starting typing";
  if (uiState === "stopped_resumable") return "Stopped";
  if (uiState === "error_recoverable") return "Connection problem";
  if (uiState === "active_text") return agentStatus === "thinking" ? "Thinking" : "Typing";
  if (uiState === "active_voice") {
    if (agentStatus === "speaking") return "Speaking";
    if (agentStatus === "thinking") return "Thinking";
    return "Listening";
  }
  return "Ready";
}

function getPrimaryCardCopy(
  uiState: string,
  chatState: ChatSessionSnapshot | null | undefined,
  preferredMode: "voice" | "text",
) {
  if (uiState === "handoff_ready") {
    return {
      title: chatState?.pendingHandoffTarget === "payment" ? "You are ready for payment" : "You are ready for review",
      body: chatState?.pendingHandoffTarget === "payment"
        ? "Your answers are saved. Continue when you are ready to complete payment."
        : "Your answers are saved. Continue when you are ready to review your application.",
    };
  }
  if (uiState === "error_recoverable") {
    return {
      title: "We hit a connection problem",
      body: "Your progress is still saved. You can retry voice or keep going by typing.",
    };
  }
  if (uiState === "stopped_resumable") {
    return {
      title: "You can continue later",
      body: "We stopped the live chat and saved your progress. Pick up again whenever you are ready.",
    };
  }
  if (uiState === "resume_prompt") {
    return {
      title: "Welcome back",
      body: chatState?.summary ?? `You left off in ${preferredMode === "voice" ? "voice" : "typing"} mode. Resume however feels easiest.`,
    };
  }
  return {
    title: "Choose how you want to talk with your guide",
    body: "Start with voice if you want a spoken walkthrough, or choose typing to keep everything on screen.",
  };
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

  const missingFieldLabels = useMemo(
    () => (readiness?.missingFields ?? []).map(humanizeMissingField),
    [readiness?.missingFields],
  );

  const primaryCopy = getPrimaryCardCopy(conversation.uiState, chatState, conversation.preferredMode);
  const nextRequiredLabel = chatState?.nextRequiredItem ? humanizeMissingField(chatState.nextRequiredItem) : missingFieldLabels[0];

  if (!user || !formSessionId) return null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.45))]">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
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
            <Badge variant="outline" className="hidden text-xs sm:inline-flex" data-testid="badge-section">
              {SECTION_LABELS[currentSection]}
            </Badge>
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

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl">{primaryCopy.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{primaryCopy.body}</p>
              </div>
              <Badge variant="outline" className="gap-2 self-start">
                {conversation.agentStatus === "speaking" ? <Volume2 className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                {getSimpleStatusLabel(conversation.agentStatus, conversation.uiState)}
              </Badge>
            </div>
            {nextRequiredLabel ? (
              <div className="rounded-2xl bg-muted/70 px-4 py-3 text-sm">
                <span className="font-medium">Next thing we need:</span> {nextRequiredLabel}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {(conversation.uiState === "entry" || conversation.uiState === "resume_prompt" || conversation.uiState === "stopped_resumable") ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void conversation.startConversation("voice")} data-testid={conversation.uiState === "entry" ? "button-start-voice" : "button-resume-voice"}>
                  <Mic className="mr-2 h-4 w-4" />
                  {conversation.uiState === "entry" ? "Talk with guide" : "Resume by voice"}
                </Button>
                <Button variant="outline" onClick={() => void conversation.startConversation("text")} data-testid={conversation.uiState === "entry" ? "button-start-text" : "button-resume-text"}>
                  <Keyboard className="mr-2 h-4 w-4" />
                  {conversation.uiState === "entry" ? "Type instead" : "Resume by typing"}
                </Button>
                {conversation.uiState === "resume_prompt" ? (
                  <Button variant="ghost" onClick={() => void conversation.endCurrentChat()} data-testid="button-end-current-chat">
                    End current chat
                  </Button>
                ) : null}
              </div>
            ) : null}

            {conversation.uiState === "handoff_ready" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void conversation.continueToTarget(chatState?.pendingHandoffTarget ?? "review")}
                  data-testid="button-continue-handoff"
                >
                  Continue
                </Button>
                <Button variant="outline" onClick={() => void conversation.stayInChat()} data-testid="button-stay-chat">
                  Stay here
                </Button>
              </div>
            ) : null}

            {conversation.uiState === "error_recoverable" ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void conversation.startConversation("voice")} data-testid="button-retry-voice">
                  <Mic className="mr-2 h-4 w-4" />
                  Retry voice
                </Button>
                <Button variant="outline" onClick={() => void conversation.startConversation("text")} data-testid="button-retry-text">
                  <Keyboard className="mr-2 h-4 w-4" />
                  Keep going by typing
                </Button>
              </div>
            ) : null}

            {(conversation.uiState === "active_voice" || conversation.uiState === "active_text" || conversation.uiState === "starting_voice" || conversation.uiState === "starting_text") ? (
              <div className="flex flex-wrap gap-2">
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
                  Typing mode
                </Button>
                <Button variant="ghost" onClick={() => void conversation.stopConversation()} data-testid="button-stop-chat">
                  <MicOff className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              </div>
            ) : null}

            {conversation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Conversation issue</AlertTitle>
                <AlertDescription>{conversation.error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex min-h-[60vh] flex-col overflow-hidden border-border/70 bg-background/95 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Conversation</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Everything stays here so it is easy to pick up where you left off.
                </p>
              </div>
              <Badge variant="secondary">
                {conversation.preferredMode === "voice" ? "Voice" : "Typing"}
              </Badge>
            </div>
          </CardHeader>

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
                  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-3xl border border-dashed border-border text-center text-muted-foreground">
                    <MessageSquare className="mb-4 h-12 w-12 opacity-30" />
                    <p className="text-base">Your conversation will appear here after you begin.</p>
                    <p className="mt-2 max-w-md text-sm">
                      Pick voice or typing above. We will save the conversation either way.
                    </p>
                  </div>
                ) : (
                  transcript.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${message.role}-${message.id}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[80%] ${
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
            </ScrollArea>
          </div>

          <div className="border-t border-border/70 bg-card/60 px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <p>
                  {conversation.preferredMode === "voice"
                    ? "Voice is on. You can still type anytime if that feels easier."
                    : "Typing mode is on. Replies stay on screen until you switch back to voice."}
                </p>
                {(conversation.uiState === "starting_voice" || conversation.uiState === "starting_text") ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : null}
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
                  className="min-h-[52px] max-h-[140px] resize-none"
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
        </Card>

        <Collapsible className="rounded-3xl border border-border/70 bg-card/95 shadow-sm">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full items-center justify-between rounded-3xl px-5 py-4">
              <span className="text-sm font-medium">Application details</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border/70 px-5 py-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Progress</p>
                    <p className="text-xs text-muted-foreground">
                      Section {currentSectionIndex + 1} of {SECTIONS.length}
                    </p>
                  </div>
                  <Badge variant={readiness?.eligibleForReview ? "default" : "secondary"}>
                    {readiness?.eligibleForReview ? "Ready for review" : "Still gathering details"}
                  </Badge>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="flex flex-wrap gap-2">
                  {SECTIONS.map((section, index) => (
                    <div
                      key={section}
                      className={`rounded-full px-3 py-1 text-xs ${
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
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">What we still need</p>
                    <p className="text-xs text-muted-foreground">
                      We keep this short so the next step is always clear.
                    </p>
                  </div>
                  {missingFieldLabels.length > 4 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => conversation.setIsMissingFieldsExpanded(!conversation.isMissingFieldsExpanded)}
                    >
                      {conversation.isMissingFieldsExpanded ? "Less" : "More"}
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {missingFieldLabels.length > 0 ? (
                    (conversation.isMissingFieldsExpanded ? missingFieldLabels : missingFieldLabels.slice(0, 4)).map((field) => (
                      <Badge key={field} variant="secondary">{field}</Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">You have already covered the main details we need right now.</p>
                  )}
                </div>
              </section>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </main>
    </div>
  );
}
