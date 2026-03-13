import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { isSupabaseAuthEnabled, supabase } from "@/lib/supabase";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loginDemo, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/chat");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDemo = async () => {
    try {
      await loginDemo();
      navigate("/chat");
    } catch (err: any) {
      toast({ title: "Demo login failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="CitizenFlow">
              <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
              <path d="M8 16C8 11.58 11.58 8 16 8C18.4 8 20.56 9.08 22 10.76" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M24 16C24 20.42 20.42 24 16 24C13.6 24 11.44 22.92 10 21.24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M14 15L16 17L20 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold text-lg">CitizenFlow</span>
          </Link>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to continue your application</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                data-testid="input-email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                data-testid="input-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or</span></div>
          </div>
          {!isSupabaseAuthEnabled ? (
            <Button variant="outline" className="w-full" onClick={handleDemo} data-testid="button-demo-login">
              Try Demo Account
            </Button>
          ) : null}
          <p className="text-center text-sm text-muted-foreground mt-4">
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline" data-testid="link-to-signup">
              Sign up
            </Link>
          </p>
          {isSupabaseAuthEnabled ? (
            <p className="text-center text-sm text-muted-foreground mt-3">
              Forgot your password?{" "}
              <Link href="/reset-password" className="text-primary hover:underline">
                Reset it here
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const { signup, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signup(email, password, fullName);
      toast({
        title: "Account created",
        description: isSupabaseAuthEnabled
          ? "Check your inbox to verify your email before checkout."
          : "Your application is ready.",
      });
      navigate(isSupabaseAuthEnabled ? "/login" : "/chat");
    } catch (err: any) {
      toast({ title: "Signup failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="CitizenFlow">
              <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
              <path d="M8 16C8 11.58 11.58 8 16 8C18.4 8 20.56 9.08 22 10.76" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M24 16C24 20.42 20.42 24 16 24C13.6 24 11.44 22.92 10 21.24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M14 15L16 17L20 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold text-lg">CitizenFlow</span>
          </Link>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start your citizenship application today</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Rodriguez"
                required
                data-testid="input-fullname"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                data-testid="input-email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                required
                minLength={6}
                data-testid="input-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-signup">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Account
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline" data-testid="link-to-login">
              Sign in
            </Link>
          </p>
          <p className="text-xs text-muted-foreground text-center mt-3">
            By creating an account, you agree that CitizenFlow is a form-preparation tool, not legal advice. Email verification is required before payment.
          </p>
          {isSupabaseAuthEnabled ? (
            <p className="text-xs text-muted-foreground text-center mt-2">
              After sign up, verify your email before checkout. If the message does not arrive, you can request another link from the reset page.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"request" | "update">("request");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery") || hash.includes("access_token=")) {
      setMode("update");
    }
  }, []);

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      toast({ title: "Reset unavailable", description: "Password reset is only available with Supabase Auth.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/reset-password`,
      });
      if (error) throw error;
      toast({
        title: "Reset email sent",
        description: "Check your inbox for a password reset link.",
      });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      toast({ title: "Reset unavailable", description: "Password reset is only available with Supabase Auth.", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Enter the same password twice.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({
        title: "Password updated",
        description: "You can sign in with your new password now.",
      });
      navigate("/login");
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{mode === "update" ? "Set a new password" : "Reset your password"}</CardTitle>
          <CardDescription>
            {mode === "update"
              ? "Enter a new password for your CitizenFlow account."
              : "We will email you a secure reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={mode === "update" ? updatePassword : requestReset} className="space-y-4">
            {mode === "request" ? (
              <div>
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {mode === "update" ? "Save New Password" : "Send Reset Email"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href="/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
