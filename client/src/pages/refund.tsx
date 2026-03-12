import { Link } from "wouter";

export default function RefundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-primary hover:underline">Back to home</Link>
      <h1 className="mt-4 text-3xl font-bold">Refund Policy</h1>
      <div className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground">
        <p>Refund requests are reviewed case by case for duplicate payments, technical failures that block delivery, or situations where CitizenFlow clearly failed to provide the purchased document-preparation service.</p>
        <p>Refunds are not guaranteed for completed deliveries when the customer’s answers were inaccurate or when the case falls outside the tool’s disclosed scope.</p>
        <p>Contact support from your account page to open a billing ticket.</p>
      </div>
    </div>
  );
}
