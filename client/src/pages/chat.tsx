import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { authenticatedFetch } from "@/lib/queryClient";
import type { ChatMessage, Section, WorkflowState, ReadinessStatus } from "@shared/schema";
import { SECTIONS, SECTION_LABELS } from "@shared/schema";
import {
  Send,
  Mic,
  MicOff,
  Sun,
  Moon,
  LogOut,
  UserCircle2,
  Loader2,
  MessageSquare,
  CheckCircle2,
  Circle,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";

interface ChatResponse {
  botResponse: string;
  currentSection: Section;
  mode: WorkflowState["mode"];
  workflowState: WorkflowState;
  readiness: ReadinessStatus;
  redirectIntent: "review" | null;
}

export default function ChatPage() {
  const { user, formSessionId, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState("");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isRedirectingToReview, setIsRedirectingToReview] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (workflowState?.pendingRedirect === "review" && !isRedirectingToReview) {
      setIsRedirectingToReview(true);
      const timer = window.setTimeout(() => navigate("/review"), 900);
      return () => window.clearTimeout(timer);
    }
  }, [workflowState?.pendingRedirect, isRedirectingToReview, navigate]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/chat", {
        formSessionId,
        message,
        conversationStep: currentSection,
      });
      return res.json() as Promise<ChatResponse>;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/form/load", formSessionId] });
      if (data.redirectIntent === "review" || data.workflowState?.pendingRedirect === "review") {
        setIsRedirectingToReview(true);
        toast({
          title: "Review is ready",
          description: "We collected the supported applicant details and are opening the review screen now.",
        });
        window.setTimeout(() => navigate("/review"), 900);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, sendMutation.isPending]);

  const handleSend = () => {
    const msg = inputValue.trim();
    if (!msg || sendMutation.isPending || isRedirectingToReview) return;
    setInputValue("");
    sendMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user || !formSessionId) return null;

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-label="CitizenFlow">
              <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
              <path d="M8 16C8 11.58 11.58 8 16 8C18.4 8 20.56 9.08 22 10.76" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M24 16C24 20.42 20.42 24 16 24C13.6 24 11.44 22.92 10 21.24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M14 15L16 17L20 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold hidden sm:inline">CitizenFlow</span>
          </Link>
          <Badge variant="outline" className="text-xs" data-testid="badge-section">
            {SECTION_LABELS[currentSection]}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {workflowState?.readyForReview ? (
            <Link href="/review">
              <Button size="sm" data-testid="button-go-review">
                Review <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          ) : null}
          <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-chat-theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Link href="/account">
            <Button variant="ghost" size="icon" data-testid="button-account">
              <UserCircle2 className="w-4 h-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={async () => { await logout(); navigate("/"); }} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">
            Section {currentSectionIndex + 1} of {SECTIONS.length}
          </span>
          <span className="text-xs text-muted-foreground">{Math.round(progressPercent)}% complete</span>
        </div>
        <Progress value={progressPercent} className="h-1.5" data-testid="progress-bar" />
        <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
          {SECTIONS.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0 ${
                i < currentSectionIndex
                  ? "bg-primary/10 text-primary"
                  : i === currentSectionIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentSectionIndex ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <Circle className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">{SECTION_LABELS[s]}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {inReviewContext ? (
        <div className="border-b border-border bg-primary/5 px-4 py-3 shrink-0">
          <div className="mx-auto max-w-3xl">
            <Alert>
              <ClipboardCheck className="h-4 w-4" />
              <AlertTitle>
                {workflowState?.mode === "post_payment_review" ? "Post-payment edit mode" : "Review edit mode"}
              </AlertTitle>
              <AlertDescription>
                The assistant knows you are editing from review. Ask for a correction or clarification, and we will keep the rest of your application intact.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      ) : null}

      <div className="border-b border-border bg-background/60 px-4 py-3 shrink-0">
        <div className="mx-auto max-w-3xl flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={readiness?.eligibleForReview ? "default" : "secondary"}>
            {readiness?.eligibleForReview ? "Ready for review" : "Collecting information"}
          </Badge>
          {(readiness?.missingFields.length || 0) > 0 ? (
            <span className="text-muted-foreground">
              Still needed: {readiness?.missingFields.slice(0, 4).join(", ")}
              {(readiness?.missingFields.length || 0) > 4 ? "..." : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">
              We have the core applicant details needed for the supported PDF scope.
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef as never}>
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {isLoadingSession ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-3/4" />
                <Skeleton className="h-10 w-1/2 ml-auto" />
                <Skeleton className="h-16 w-3/4" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Start your conversation to begin the application.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card border border-border rounded-bl-md"
                    }`}
                  >
                    {msg.content.split("\n").map((line, i) => (
                      <p key={i} className={i > 0 ? "mt-2" : ""}>{line}</p>
                    ))}
                  </div>
                </div>
              ))
            )}
            {sendMutation.isPending && (
              <div className="flex justify-start" data-testid="indicator-typing">
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            {isRedirectingToReview && (
              <div className="flex justify-center pt-6" data-testid="indicator-review-transition">
                <div className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-center">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
                  Preparing your review screen with the latest answers...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="border-t border-border bg-background shrink-0 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 mb-0.5"
              onClick={() => setIsVoiceActive(!isVoiceActive)}
              data-testid="button-voice"
              aria-label={isVoiceActive ? "Stop recording" : "Start recording"}
            >
              {isVoiceActive ? (
                <MicOff className="w-4 h-4 text-destructive" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inReviewContext ? "Describe what you want to correct or clarify..." : "Type your answer..."}
              className="min-h-[44px] max-h-[120px] resize-none"
              disabled={sendMutation.isPending || isRedirectingToReview}
              data-testid="input-chat"
              rows={1}
            />
            <Button
              size="icon"
              className="shrink-0 mb-0.5"
              onClick={handleSend}
              disabled={!inputValue.trim() || sendMutation.isPending || isRedirectingToReview}
              data-testid="button-send"
              aria-label="Send message"
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{inReviewContext ? "You are editing with review context preserved" : "Press Enter to send, Shift+Enter for new line"}</span>
            <span data-testid="text-autosave">Auto-saved</span>
          </div>
        </div>
      </div>
    </div>
  );
}
