import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, LifeBuoy, Mail, Shield, Trash2, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, authenticatedFetch, queryClient } from "@/lib/queryClient";

export default function AccountPage() {
  const { toast } = useToast();
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSubject, setSupportSubject] = useState("");

  const { data } = useQuery({
    queryKey: ["/api/account"],
    queryFn: async () => {
      const response = await authenticatedFetch("/api/account");
      if (!response.ok) throw new Error("Failed to load account");
      return response.json();
    },
  });

  const preferenceMutation = useMutation({
    mutationFn: async (payload: { fullName?: string; marketingOptIn?: boolean }) => {
      const response = await apiRequest("POST", "/api/account/preferences", payload);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      toast({ title: "Preferences updated" });
    },
  });

  const supportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/support/tickets", {
        category: "general",
        subject: supportSubject,
        message: supportMessage,
      });
      return response.json();
    },
    onSuccess: async () => {
      setSupportSubject("");
      setSupportMessage("");
      await queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      toast({ title: "Support request submitted" });
    },
  });

  const requestMutation = useMutation({
    mutationFn: async (type: "export" | "delete") => {
      const response = await apiRequest("POST", "/api/account/request", { type });
      return response.json();
    },
    onSuccess: async (_, type) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      toast({ title: `${type === "export" ? "Data export" : "Deletion"} requested` });
    },
  });

  const user = data?.user;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/chat">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to application
            </Button>
          </Link>
          <h1 className="font-semibold">Account and Support</h1>
          <div className="w-24" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Account profile</CardTitle>
            <CardDescription>Manage your contact preferences and visibility settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                defaultValue={user?.fullName || ""}
                onBlur={(event) => preferenceMutation.mutate({ fullName: event.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-3">
              <div>
                <p className="text-sm font-medium">Product updates</p>
                <p className="text-xs text-muted-foreground">Receive release and filing guidance updates.</p>
              </div>
              <Switch
                checked={Boolean(user?.marketingOptIn)}
                onCheckedChange={(checked) => preferenceMutation.mutate({ marketingOptIn: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-3">
              <div>
                <p className="text-sm font-medium">Email verification</p>
                <p className="text-xs text-muted-foreground">Current verification status for your account email.</p>
              </div>
              <Badge variant={user?.emailVerified ? "default" : "secondary"}>
                {user?.emailVerified ? "Verified" : "Pending"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Application history</CardTitle>
            <CardDescription>Track your documents, payments, and background processing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">Payments</p>
              <p className="mt-2 text-2xl font-semibold">{data?.payments?.length || 0}</p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">Generated PDFs</p>
              <p className="mt-2 text-2xl font-semibold">{data?.documents?.length || 0}</p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">Open jobs</p>
              <p className="mt-2 text-2xl font-semibold">
                {(data?.jobs || []).filter((job: any) => job.status === "queued" || job.status === "processing").length}
              </p>
            </div>
            {(data?.documents || []).slice(0, 3).map((document: any) => (
              <div key={document.id} className="rounded-md border border-border p-4 md:col-span-1">
                <p className="font-medium">N-400 PDF</p>
                <p className="text-xs text-muted-foreground">{document.status}</p>
                {document.downloadUrl ? (
                  <a href={document.downloadUrl}>
                    <Button variant="outline" size="sm" className="mt-3">
                      <Download className="mr-1 h-3 w-3" /> Download
                    </Button>
                  </a>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Support</CardTitle>
            <CardDescription>Contact the CitizenFlow team for billing or technical help.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border px-4">
                <LifeBuoy className="h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">Responses are tracked inside your account history.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} rows={5} />
            </div>
            <Button
              onClick={() => supportMutation.mutate()}
              disabled={supportMutation.isPending || supportSubject.length < 3 || supportMessage.length < 10}
            >
              <Mail className="mr-2 h-4 w-4" /> Send support request
            </Button>
            <div className="space-y-2">
              {(data?.supportTickets || []).slice(0, 5).map((ticket: any) => (
                <div key={ticket.id} className="rounded-md border border-border px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{ticket.subject}</p>
                    <Badge variant="secondary">{ticket.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{ticket.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy controls</CardTitle>
            <CardDescription>Request an export or deletion workflow for your account data.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {data?.user?.role === "admin" ? (
              <Link href="/admin">
                <Button variant="secondary">
                  <LayoutDashboard className="mr-2 h-4 w-4" /> Open admin queue
                </Button>
              </Link>
            ) : null}
            <Button variant="outline" onClick={() => requestMutation.mutate("export")} disabled={requestMutation.isPending}>
              <Shield className="mr-2 h-4 w-4" /> Request data export
            </Button>
            <Button variant="destructive" onClick={() => requestMutation.mutate("delete")} disabled={requestMutation.isPending}>
              <Trash2 className="mr-2 h-4 w-4" /> Request account deletion
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
