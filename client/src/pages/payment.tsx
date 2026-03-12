import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, authenticatedFetch, queryClient } from "@/lib/queryClient";
import {
  CreditCard,
  Shield,
  CheckCircle2,
  Download,
  ArrowLeft,
  Loader2,
  Lock,
  Printer,
  ExternalLink,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function PaymentPage() {
  const { formSessionId } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: sessionData, isLoading } = useQuery({
    queryKey: ["/api/form/load", formSessionId],
    queryFn: async () => {
      if (!formSessionId) return null;
      const res = await authenticatedFetch(`/api/form/load?sessionId=${formSessionId}`);
      if (!res.ok) throw new Error("Failed to load session");
      return res.json();
    },
    enabled: !!formSessionId,
  });

  const { data: readinessData } = useQuery({
    queryKey: ["/api/form/readiness", formSessionId],
    queryFn: async () => {
      if (!formSessionId) return null;
      const response = await authenticatedFetch(`/api/form/readiness?sessionId=${formSessionId}`);
      if (!response.ok) throw new Error("Failed to load readiness");
      return response.json();
    },
    enabled: !!formSessionId,
  });

  const paymentStatus = sessionData?.formSession?.paymentStatus || "none";
  const pdfUrl = sessionData?.formSession?.pdfUrl;
  const workflowState = sessionData?.formSession?.workflowState;
  const readiness = readinessData?.readiness || workflowState?.lastReadiness;
  const stalePdf = Boolean(readiness?.stalePdf || workflowState?.pdfNeedsRegeneration);
  const isPaid = paymentStatus === "completed";
  const canPay = Boolean(readiness?.eligibleForPayment);

  const { data: jobData } = useQuery({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      const response = await authenticatedFetch(`/api/jobs/${jobId}`);
      if (!response.ok) throw new Error("Failed to load job");
      return response.json();
    },
    enabled: !!jobId,
    refetchInterval: 1500,
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payment/checkout", { formSessionId });
      return res.json();
    },
    onSuccess: async (data) => {
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setJobId(data?.queued?.jobId || null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/form/load", formSessionId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/form/readiness", formSessionId] }),
      ]);
      toast({
        title: "Payment started",
        description: data?.provider === "stripe"
          ? "Redirecting to Stripe Checkout."
          : "Payment completed and PDF generation was queued.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    },
  });

  if (!formSessionId) {
    navigate("/login");
    return null;
  }

  useEffect(() => {
    if (jobData?.job?.status === "completed" && jobId) {
      setJobId(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/form/load", formSessionId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/form/readiness", formSessionId] }),
      ]);
      toast({ title: "PDF ready", description: "Your document finished generating." });
    }
    if (jobData?.job?.status === "failed" && jobId) {
      setJobId(null);
      toast({ title: "Generation failed", description: jobData.job.error || "Document generation failed.", variant: "destructive" });
    }
  }, [jobData, jobId, formSessionId, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-lg">
          <Card><CardContent className="h-48" /></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border flex items-center justify-between px-4 sticky top-0 bg-background z-10">
        <Link href="/review">
          <Button variant="ghost" size="sm" data-testid="button-back-review">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Review
          </Button>
        </Link>
        <h1 className="font-semibold">{isPaid ? "Download and Regenerate" : "Complete Payment"}</h1>
        <div className="w-24" />
      </header>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {isPaid ? (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                {stalePdf ? <RefreshCcw className="w-8 h-8 text-primary" /> : <CheckCircle2 className="w-8 h-8 text-primary" />}
              </div>
              <h2 className="text-2xl font-bold mb-2">{stalePdf ? "Updates need regeneration" : "Your N-400 is ready"}</h2>
              <p className="text-muted-foreground">
                {stalePdf
                  ? "You already paid. Make changes in review and regenerate the PDF without paying again."
                  : "Download your completed form or go back to review to make changes and regenerate later."}
              </p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                {stalePdf || jobId ? (
                  <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertTitle>{jobId ? "Generation in progress" : "Regeneration required"}</AlertTitle>
                    <AlertDescription>
                      {jobId
                        ? "Your payment is complete and the document worker is generating the latest PDF now."
                        : "A reviewed field changed after payment, so your next download should come from the refreshed PDF on the review screen."}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <a href={pdfUrl || `/api/pdf/download/${formSessionId}`} download>
                    <Button size="lg" className="w-full" data-testid="button-download-pdf">
                      <Download className="w-5 h-5 mr-2" /> Download N-400 PDF
                    </Button>
                  </a>
                )}
                <Link href="/review">
                  <Button variant="outline" className="w-full" data-testid="button-return-review">
                    {stalePdf || jobId ? "Open review" : "Open review and edit"}
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Printer className="w-4 h-4" /> Filing Checklist
                </CardTitle>
                <CardDescription>Follow these steps to submit your application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  "Print the PDF on letter-size (8.5\" x 11\") white paper, single-sided.",
                  "Sign and date Part 13 in black ink before filing.",
                  "Include the supporting items required for your case, such as Green Card copies and any name-change or marital documents.",
                  "Check the current USCIS filing fee and mailing instructions before sending.",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
                <Separator className="my-2" />
                <a
                  href="https://www.uscis.gov/n-400"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm hover:underline flex items-center gap-1"
                >
                  USCIS N-400 filing instructions <ExternalLink className="w-3 h-3" />
                </a>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">Final step before download</h2>
              <p className="text-muted-foreground">
                Payment generates your production PDF from the reviewed application data.
              </p>
            </div>

            {!canPay ? (
              <Alert>
                <AlertTitle>Review is still incomplete</AlertTitle>
                <AlertDescription>
                  Finish the remaining required fields in review before payment can continue.
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>What happens after payment</CardTitle>
                <CardDescription>The app will immediately generate your downloadable N-400 PDF.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Review-confirmed application data</span>
                  <Badge variant="outline">Included</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Initial PDF generation</span>
                  <Badge variant="outline">Included</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Future regenerate and re-download</span>
                  <Badge variant="outline">Included</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span>N-400 preparation</span>
                    <span className="font-medium">$149.00</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Generation and download access</span>
                    <span>Included</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Regenerate after edits</span>
                    <span>Included</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>$149.00</span>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => payMutation.mutate()}
                  disabled={payMutation.isPending || !canPay || Boolean(jobId)}
                  data-testid="button-pay"
                >
                  {payMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Recording payment...
                    </>
                  ) : jobId ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating PDF...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" /> Pay $149.00
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Secure
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Encrypted
                  </span>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  Checkout is processed through Stripe. After payment, CitizenFlow queues PDF generation and keeps regenerate access available after later review edits.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <div className="pt-4">
          <PerplexityAttribution />
        </div>
      </div>
    </div>
  );
}
