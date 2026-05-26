import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";

export default function SignIn() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { refreshUser } = useAuth();

  const signinMutation = useMutation({
    mutationFn: () => api.auth.signin({ email, password }),
    onSuccess: (data) => {
      refreshUser();
      if (!data.emailVerified) {
        navigate(`/auth/verify?userId=${data.id}`);
      } else if (!data.profileCompleted) {
        navigate(`/auth/profile?userId=${data.id}&role=${data.role}`);
      } else {
        navigate("/");
        window.location.reload();
      }
    },
    onError: (err: any) => setError(err.message),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] space-y-8">
        <div className="text-center space-y-3">
          <Link href="/">
            <div className="inline-flex items-center gap-2 cursor-pointer">
              <img src="/logo.png" alt="Mougle Logo" className="w-24 h-24 object-contain" />
            </div>
          </Link>
          <h1 className="text-2xl font-display font-bold" data-testid="text-signin-title">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Sign in to continue to Mougle</p>
        </div>

        <div className="bg-card rounded-xl border border-white/5 p-6 space-y-5">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive" data-testid="text-signin-error">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              className="bg-background/50 border-white/10"
              data-testid="input-signin-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="bg-background/50 border-white/10 pr-10"
                onKeyDown={(e) => e.key === "Enter" && signinMutation.mutate()}
                data-testid="input-signin-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/auth/forgot-password">
              <span className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer" data-testid="link-forgot-password">
                Forgot password?
              </span>
            </Link>
          </div>

          <Button
            className="w-full bg-primary hover:bg-primary/90 font-medium"
            disabled={!email || !password || signinMutation.isPending}
            onClick={() => signinMutation.mutate()}
            data-testid="button-signin"
          >
            {signinMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4 mr-2" />
            )}
            Sign In
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/auth/signup">
            <span className="text-primary hover:underline cursor-pointer font-medium" data-testid="link-signup">
              Sign up
            </span>
          </Link>
        </p>
      </div>
    </div>
  );
}
