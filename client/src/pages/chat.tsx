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
import type {
  AgentStatus,
  ChatMessage,
  ConversationState,
  ReadinessStatus,
  Section,
  WorkflowState,
} from "@shared/schema";
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
  "moralCharacter.claimedUSCitizen": "Whether you have ever claimed to be a U.S. citizen",
  "moralCharacter.votedInElection": "Whether you have ever voted in a U.S. election",
  "moralCharacter.arrestedOrDetained": "Whether you have ever been arrested or detained",
  "moralCharacter.convictedOfCrime": "Whether you have ever been convicted of a crime",
  "moralCharacter.usedIllegalDrugs": "Whether you have ever used illegal drugs",
  "moralCharacter.militaryService": "Your military service history",
  "moralCharacter.registeredSelectiveService": "Your Selective Service registration status",
  "oath.supportConstitution": "Whether you support the Constitution",
  "oath.willingTakeOath": "Whether you are willing to take the oath",
  "oath.willingBearArms": "Whether you are willing to bear arms if required",
  "oath.willingNoncombatService": "Whether you are willing to do noncombat service if required",
  "oath.willingNationalService": "Whether you are willing to do work of national importance if required",
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

function getStatusLabel(status: AgentStatus, mode: "voice" | "text") {
  if (mode === "text" && (status === "ready" || status === "listening")) {
    return "Waiting for your message";
  }

  switch (status) {
    case "connecting":
      return "Getting ready";
    case "reconnecting":
      return "Reconnecting";
    case "listening":
      return "Listening to your answer";
    case "thinking":
      return "Thinking about what you said";
    case "speaking":
      return mode === "text" ? "Writing a reply" : "Asking your next question";
    case "error":
      return "Needs a quick retry";
    case "ready":
      return mode === "text" ? "Ready to chat" : "Your guide is ready";
    default:
      return "Ready";
  }
}

function getConnectionLabel(state: ConversationState, mode: "voice" | "text") {
  switch (state) {
    case "bootstrapping":
      return "Preparing your conversation";
    case "connecting_voice":
      return "Starting voice";
    case "connecting_text":
      return "Opening chat";
    case "connected_voice":
      return mode === "text" ? "Voice paused" : "Voice is on";
    case "connected_text":
      return "Text only";
    case "degraded":
      return "Using text for now";
    case "error":
      return "Connection issue";
    default:
      return "Not connected";
  }
}

function getConversationHint(state: ConversationState, mode: "voice" | "text") {
  if (state === "connected_text" || mode === "text") {
    return "Type your answer below. Replies will stay on screen and won't play out loud.";
  }
  if (state === "connected_voice") {
    return "Your guide will lead with the next question, and you can answer by voice or switch to typing anytime.";
  }
  if (state === "connecting_voice" || state === "connecting_text" || state === "bootstrapping") {
    return "Your guide is getting the conversation ready.";
  }
  if (state === "degraded" || state === "error") {
    return "If voice has trouble, you can keep going by typing right away.";
  }
  return "Your guide will ask one clear question at a time and keep the conversation easy to follow.";
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
    () => (conversation.transcript.length > 0 ? conversation.transcript : messages),
    [conversation.transcript, messages],
  );

  const missingFieldLabels = useMemo(
    () => (readiness?.missingFields ?? []).map(humanizeMissingField),
    [readiness?.missingFields],
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
                {readiness?.eligibleForReview ? "Ready for review" : "Still gathering details"}
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
                <p className="text-sm font-medium">Your guide</p>
                <p className="text-xs text-muted-foreground">
                  {getConversationHint(conversation.conversationState, conversation.preferredMode)}
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                {conversation.agentStatus === "speaking" ? <Volume2 className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                {getConnectionLabel(conversation.conversationState, conversation.preferredMode)} / {getStatusLabel(conversation.agentStatus, conversation.preferredMode)}
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
                      <p className="font-medium">Your guide is ready to begin</p>
                      <p className="text-sm text-muted-foreground">
                        Start with voice if you want a spoken walkthrough, or type if that feels easier right now.
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
                      {(conversation.conversationState === "degraded" || conversation.conversationState === "error") ? (
                        <Button variant="ghost" onClick={() => void conversation.startConversation("voice")}>
                          Retry voice
                        </Button>
                      ) : null}
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
                    Typing mode
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

            {conversation.error ? (
              <Alert className="mt-4" variant="destructive">
                <AlertTitle>Conversation issue</AlertTitle>
                <AlertDescription>{conversation.error}</AlertDescription>
              </Alert>
            ) : null}
          </section>

          <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">What we still need from you</p>
                <p className="text-xs text-muted-foreground">
                  We keep this short so you always know the next important details to finish.
                </p>
              </div>
              {missingFieldLabels.length > 3 ? (
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
              {missingFieldLabels.length > 0 ? (
                (conversation.isMissingFieldsExpanded ? missingFieldLabels : missingFieldLabels.slice(0, 4)).map((field) => (
                  <Badge key={field} variant="secondary">{field}</Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">You have already covered the main details we need right now.</p>
              )}
            </div>
          </section>
        </aside>

        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-[32px] border border-border/70 bg-background/90 shadow-xl">
          <div className="border-b border-border/70 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Conversation</p>
                <p className="text-xs text-muted-foreground">
                  Everything you say and everything your guide says will appear here.
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                {conversation.preferredMode === "voice" ? <Mic className="h-3 w-3" /> : <Keyboard className="h-3 w-3" />}
                {conversation.preferredMode === "voice" ? "Voice conversation" : "Typing only"}
              </Badge>
            </div>
          </div>

          {inReviewContext ? (
            <div className="border-b border-border bg-primary/5 px-5 py-4">
              <Alert>
                <ClipboardCheck className="h-4 w-4" />
                <AlertTitle>
                  {workflowState?.mode === "post_payment_review" ? "Post-payment edits" : "Review changes"}
                </AlertTitle>
                <AlertDescription>
                  Your guide will keep the rest of your application in place and only change what you ask to fix.
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
                    <p className="text-base">
                      {conversation.isConnected ? "Your guide is getting the first question ready." : "Your conversation will appear here as soon as you begin."}
                    </p>
                    <p className="mt-2 text-sm">
                      {conversation.isConnected ? "Stay on this page and your guide will lead the next step." : "You can start by voice or jump straight into typing."}
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
                        className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
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
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {conversation.preferredMode === "voice"
                    ? "Voice is on. You can still type anytime if that feels easier."
                    : "Typing mode is on. Replies will stay on screen until you switch back to voice."}
                </p>
                {conversation.conversationState === "bootstrapping" || conversation.conversationState === "connecting_voice" || conversation.conversationState === "connecting_text"
                  ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  : null}
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
                  placeholder={inReviewContext ? "Describe the change you want to make..." : "Type your answer here"}
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
