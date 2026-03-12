import { Link } from "wouter";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-primary hover:underline">Back to home</Link>
      <h1 className="mt-4 text-3xl font-bold">Terms of Service</h1>
      <div className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground">
        <p>CitizenFlow provides software to help users organize information and prepare an N-400 PDF. It does not provide legal advice, attorney representation, or USCIS affiliation.</p>
        <p>You are responsible for reviewing your answers, confirming filing eligibility, and signing all submitted documents before filing.</p>
        <p>Paid access covers PDF generation and reasonable regenerate access after edits within the supported product scope.</p>
      </div>
    </div>
  );
}
