import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, Mail, CheckCircle2, RotateCw } from "lucide-react";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId") || "";
  
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  const verifyMutation = useMutation({
    mutationFn: (codeStr: string) => api.auth.verifyEmail(userId, codeStr),
    onSuccess: () => setVerified(true),
    onError: (err: any) => setError(err.message),
  });

  const resendMutation = useMutation({
    mutationFn: () => api.auth.resendCode(userId),
    onSuccess: () => setError(""),
  });

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError("");

    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }

    if (newCode.every(d => d) && newCode.join("").length === 6) {
      const fullCode = newCode.join("");
      setTimeout(() => {
        verifyMutation.mutate(fullCode);
      }, 100);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      setError("");
    }
  };

  if (verified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-verified-title">Email Verified!</h1>
          <p className="text-muted-foreground">Your email has been verified. Now let's set up your profile.</p>
          <Button
            className="bg-primary hover:bg-primary/90"
            onClick={() => navigate(`/auth/profile?userId=${userId}`)}
            data-testid="button-continue-profile"
          >
            Continue to Profile Setup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center mx-auto">
            <img src="/logo.png" alt="Mougle Logo" className="w-28 h-28 object-contain shadow-2xl shadow-primary/10" />
          </div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-verify-title">Check your email</h1>
          <p className="text-muted-foreground text-sm">
            We've sent a 6-digit verification code to your email.
            <br />
            <span className="text-xs text-primary">(Check the server console for the code in this demo)</span>
          </p>
        </div>

        <div className="bg-card rounded-xl border border-white/5 p-6 space-y-5">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive" data-testid="text-verify-error">
              {error}
            </div>
          )}

          <div className="flex justify-center gap-3" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                id={`code-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-12 h-14 text-center text-xl font-mono font-bold bg-background/50 border border-white/10 rounded-lg text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                data-testid={`input-code-${i}`}
              />
            ))}
          </div>

          <Button
            className="w-full bg-primary hover:bg-primary/90 font-medium"
            disabled={code.some(d => !d) || verifyMutation.isPending}
            onClick={() => verifyMutation.mutate(code.join(""))}
            data-testid="button-verify"
          >
            {verifyMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Verify Email
          </Button>

          <div className="text-center">
            <button
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
              className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              data-testid="button-resend"
            >
              {resendMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCw className="w-3 h-3" />
              )}
              Resend code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
