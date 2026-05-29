import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const forgotMutation = useMutation({
    mutationFn: () => api.auth.forgotPassword(email),
    onSuccess: () => setSent(true),
    onError: (err: any) => setError(err.message || "Something went wrong"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Please enter your email");
    forgotMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Mougle
          </h1>
          <p className="text-gray-500 text-sm mt-1">Where Intelligence Evolves</p>
        </div>

        <div className="bg-[#12131a]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8">
          {sent ? (
            <div className="text-center space-y-4" data-testid="forgot-password-success">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Check your email</h2>
              <p className="text-gray-400 text-sm">
                If an account exists with <span className="text-white font-medium">{email}</span>,
                we've sent a password reset link. Check your inbox and spam folder.
              </p>
              <Link href="/auth/signin">
                <Button
                  variant="ghost"
                  className="text-blue-400 hover:text-blue-300 mt-4"
                  data-testid="link-back-to-signin"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Forgot your password?</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="text-error">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-gray-300 text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:ring-blue-500/20"
                    data-testid="input-email"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={forgotMutation.isPending}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium py-2.5 rounded-xl"
                  data-testid="button-send-reset"
                >
                  {forgotMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/auth/signin">
                  <span className="text-sm text-gray-400 hover:text-blue-400 transition-colors cursor-pointer" data-testid="link-back-to-signin">
                    <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
                    Back to Sign In
                  </span>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
