import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { isSupabaseAuthEnabled } from "@/lib/supabase";
import {
  MessageSquare,
  FileCheck,
  Shield,
  Clock,
  CheckCircle,
  ChevronRight,
  Sun,
  Moon,
  Mic,
  AlertTriangle,
} from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function LandingPage() {
  const { loginDemo, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();

  const handleDemo = async () => {
    await loginDemo();
    navigate("/chat");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="CitizenFlow logo">
              <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
              <path d="M8 16C8 11.58 11.58 8 16 8C18.4 8 20.56 9.08 22 10.76" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M24 16C24 20.42 20.42 24 16 24C13.6 24 11.44 22.92 10 21.24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M14 15L16 17L20 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-lg font-semibold" data-testid="text-brand-name">CitizenFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-theme-toggle" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? <Link href="/account"><Button variant="ghost">Account</Button></Link> : null}
            <Link href="/login"><Button variant="ghost" data-testid="link-login">Sign In</Button></Link>
            <Link href="/signup"><Button data-testid="link-signup">Get Started</Button></Link>
          </div>
        </div>
      </nav>

      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
            Production-ready intake, review, and document delivery
          </Badge>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Complete Your N-400 with a guided
            <span className="text-primary"> secure workflow</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            CitizenFlow helps you collect answers, review your application, pay once,
            and generate a downloadable N-400 PDF with clear scope boundaries and
            account-level support.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="h-12 px-8 text-base" data-testid="button-get-started">
                Start Your Application
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            {!isSupabaseAuthEnabled ? (
              <Button size="lg" variant="outline" className="h-12 px-8 text-base" onClick={handleDemo} data-testid="button-try-demo">
                Try Demo
              </Button>
            ) : null}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required to begin. Pay only when you are ready to generate your PDF.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-card px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold sm:text-3xl">Why CitizenFlow?</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                icon: MessageSquare,
                title: "Structured conversation",
                description: "Answer questions naturally while CitizenFlow tracks readiness and review state behind the scenes.",
              },
              {
                icon: FileCheck,
                title: "Review before payment",
                description: "Confirm fields directly in review and regenerate after edits without losing application context.",
              },
              {
                icon: Shield,
                title: "Session security",
                description: "Server-side sessions, audit-aware account activity, and protected document access replace prototype-style local auth.",
              },
              {
                icon: Clock,
                title: "Save and resume",
                description: "Your application state persists across refreshes so you can continue on another device or later session.",
              },
              {
                icon: Mic,
                title: "Voice-ready workflow",
                description: "Voice hooks remain available for future provider integration without changing the intake journey.",
              },
              {
                icon: AlertTriangle,
                title: "Scope and red flags",
                description: "CitizenFlow highlights unsupported or risky facts early and reminds users when attorney review may be appropriate.",
              },
            ].map(({ icon: Icon, title, description }) => (
              <Card key={title} className="bg-background">
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-2xl font-bold sm:text-3xl">How It Works</h2>
          <div className="space-y-8">
            {[
              { step: "1", title: "Complete intake", desc: "Move through guided personal, residence, family, employment, travel, and character questions." },
              { step: "2", title: "Review and confirm", desc: "Edit fields directly, see readiness warnings, and confirm the scope before payment." },
              { step: "3", title: "Pay and receive documents", desc: "Payment queues your PDF generation and your account keeps the latest document history." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="mb-8 text-2xl font-bold sm:text-3xl">Simple Pricing</h2>
          <Card className="bg-background">
            <CardContent className="pb-8 pt-8">
              <div className="mb-2 text-5xl font-bold">$149</div>
              <p className="mb-6 text-muted-foreground">One-time payment, no subscription</p>
              <ul className="mx-auto mb-8 max-w-xs space-y-3 text-left">
                {[
                  "Guided N-400 workflow",
                  "Editable review screen",
                  "Queued PDF generation",
                  "Download and regenerate access",
                  "Account support and privacy controls",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button size="lg" className="w-full" data-testid="button-pricing-cta">
                  Start Now - Free Until Download
                </Button>
              </Link>
              <p className="mt-3 text-xs text-muted-foreground">
                USCIS filing fees are separate and paid directly to USCIS.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-2xl font-bold sm:text-3xl">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {[
              {
                q: "Is CitizenFlow a law firm?",
                a: "No. CitizenFlow is a form-preparation tool. It does not provide legal advice, legal representation, or government affiliation.",
              },
              {
                q: "Can I come back later?",
                a: "Yes. Your account now uses server-side sessions and persistent application storage so you can resume after refresh or on another device.",
              },
              {
                q: "What happens after payment?",
                a: "Payment records your purchase and queues PDF generation. You can track the result in the product and from your account history.",
              },
              {
                q: "Can I request help or a data export?",
                a: "Yes. The account page supports support requests plus export and deletion workflows.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-border pb-5">
                <h3 className="mb-2 font-semibold">{q}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong>Disclaimer:</strong> CitizenFlow is not affiliated with USCIS or the U.S. government.
            This is a form-preparation service only. We do not provide legal advice or representation.
            For questions about your eligibility, immigration status, or legal concerns, please consult
            a licensed immigration attorney. USCIS forms are available free of charge at{" "}
            <a href="https://www.uscis.gov" className="underline" target="_blank" rel="noopener noreferrer">
              uscis.gov
            </a>.
          </p>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <span>&copy; 2026 CitizenFlow. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
            <Link href="/legal/terms" className="hover:underline">Terms</Link>
            <Link href="/legal/refund" className="hover:underline">Refunds</Link>
          </div>
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
