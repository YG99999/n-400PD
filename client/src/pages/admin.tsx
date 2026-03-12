import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authenticatedFetch } from "@/lib/queryClient";

export default function AdminPage() {
  const { data } = useQuery({
    queryKey: ["/api/admin/queue"],
    queryFn: async () => {
      const response = await authenticatedFetch("/api/admin/queue");
      if (!response.ok) throw new Error("Failed to load admin queue");
      return response.json();
    },
  });

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/account">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to account
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Admin Queue</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Support tickets</CardTitle></CardHeader>
            <CardContent>{data?.supportTickets?.length ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Privacy requests</CardTitle></CardHeader>
            <CardContent>{data?.privacyRequests?.length ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Failed jobs</CardTitle></CardHeader>
            <CardContent>{data?.openJobFailures?.length ?? 0}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
