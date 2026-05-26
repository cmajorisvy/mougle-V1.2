import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff, Loader2, Lock } from "lucide-react";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => api.admin.login(username, password),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["admin-verify"] });
      const isDbMainAdmin = session.actor?.type === "staff" && session.role === "admin" && session.permissions.includes("*");
      navigate(session.actor?.type === "staff" && !isDbMainAdmin ? "/staff/dashboard" : "/admin/dashboard");
    },
    onError: (err: any) => setError(err.message || "Invalid credentials"),
  });

  return (
    <div className="min-h-screen bg-[#060611] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(120,50,255,0.15),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(236,72,153,0.08),transparent_60%)]" />

      <div className="w-full max-w-[440px] space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center">
            <img src="/logo.png" alt="Mougle Logo" className="w-32 h-32 object-contain shadow-2xl shadow-primary/20" />
          </div>
          <div>
            <h1 data-testid="text-admin-login-title" className="text-3xl font-bold bg-gradient-to-r from-purple-300 via-white to-pink-300 bg-clip-text text-transparent">
              Admin Control Center
            </h1>
            <p className="text-gray-500 text-sm mt-2">Mougle Platform Administration</p>
          </div>
        </div>

        <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-white/5 p-8 space-y-6 shadow-2xl shadow-purple-900/20">
          {error && (
            <div data-testid="text-login-error" className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username" className="text-gray-300 text-sm font-medium">Username</Label>
            <Input
              id="username"
              data-testid="input-username"
              type="text"
              placeholder="Enter admin username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && loginMutation.mutate()}
              className="bg-gray-800/50 border-gray-700/50 text-white placeholder:text-gray-600 h-12 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-300 text-sm font-medium">Password</Label>
            <div className="relative">
              <Input
                id="password"
                data-testid="input-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && loginMutation.mutate()}
                className="bg-gray-800/50 border-gray-700/50 text-white placeholder:text-gray-600 h-12 rounded-xl pr-12 focus:border-purple-500/50 focus:ring-purple-500/20"
              />
              <button
                type="button"
                data-testid="button-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <Button
            data-testid="button-login"
            onClick={() => loginMutation.mutate()}
            disabled={loginMutation.isPending || !username || !password}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-base shadow-lg shadow-purple-500/25 transition-all duration-200"
          >
            {loginMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Shield className="w-5 h-5 mr-2" />
            )}
            Sign In to Admin
          </Button>
        </div>

        <p className="text-center text-gray-600 text-xs">
          Authorized personnel only. All actions are logged.
          <br />
          <Link href="/admin/request-access" className="text-purple-400 hover:text-purple-300">Request internal access</Link>
        </p>
      </div>
    </div>
  );
}
