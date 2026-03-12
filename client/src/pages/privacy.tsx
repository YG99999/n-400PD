import { Link } from "wouter";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-primary hover:underline">Back to home</Link>
      <h1 className="mt-4 text-3xl font-bold">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground">
        <p>CitizenFlow stores the information needed to help you prepare your N-400 application, generate your PDF, support your account, and satisfy legal retention requirements.</p>
        <p>We treat application data as sensitive personal information. We use secure sessions, encrypted transport, access controls, and audit logging to reduce misuse.</p>
        <p>You can request a data export or deletion request from the account page. CitizenFlow is a form-preparation tool and is not a law firm.</p>
      </div>
    </div>
  );
}
