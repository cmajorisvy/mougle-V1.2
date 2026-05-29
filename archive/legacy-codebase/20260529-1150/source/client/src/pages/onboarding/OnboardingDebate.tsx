import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Lock, Sparkles } from "lucide-react";

export default function OnboardingDebate() {
  const [, navigate] = useLocation();
  const { refreshUser } = useAuth();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const { data: onboarding } = useQuery({
    queryKey: ["/api/onboarding/state"],
    queryFn: () => api.onboarding.state(),
  });

  const interest = onboarding?.interest || "";

  const defaults = useMemo(() => {
    if (!interest) return { title: "", topic: "" };
    return {
      title: `${interest} Debate`,
      topic: `What is the most important shift in ${interest.toLowerCase()} right now?`,
    };
  }, [interest]);

  const mutation = useMutation({
    mutationFn: () => api.debates.create({
      title: title || defaults.title || "First Debate",
      topic: topic || defaults.topic || "What should we debate first?",
      description,
      totalRounds: 3,
      turnDurationSeconds: 60,
    }),
    onSuccess: async () => {
      await api.onboarding.complete();
      await refreshUser();
      navigate("/dashboard");
    },
    onError: (err: any) => setError(err.message || "Failed to create debate"),
  });

  const handleSubmit = () => {
    if (!topic.trim()) {
      setError("Add a debate topic to continue.");
      return;
    }
    setError("");
    mutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs">
              <Sparkles className="w-3 h-3" /> Step 2 of 3
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold">Start your first debate</h1>
            <p className="text-muted-foreground text-sm">This seeds your intelligence pipeline and unlocks the dashboard.</p>
          </div>
          <div className="text-xs text-muted-foreground">Next: Intelligence Dashboard</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 bg-card/70 border-white/[0.08] space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Debate Title</div>
              <Input
                placeholder={defaults.title || "Your first debate"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Topic</div>
              <Input
                placeholder={defaults.topic || "What should we debate?"}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Context (optional)</div>
              <Textarea
                placeholder="Add a brief description to guide the debate."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">We’ll spin up a 3-round debate.</div>
              <Button
                onClick={handleSubmit}
                disabled={mutation.isPending}
                className="gap-2"
                data-testid="button-onboarding-debate-continue"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Launch Debate
              </Button>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5 bg-card/50 border-white/[0.08] space-y-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent" />
              <div className="relative flex items-center gap-2 text-sm font-semibold">
                <Lock className="w-4 h-4 text-muted-foreground" /> Labs Preview
              </div>
              <p className="relative text-xs text-muted-foreground">
                Labs projects unlock after onboarding. Preview how debates become validated apps.
              </p>
              <div className="relative space-y-2">
                <div className="h-10 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
                <div className="h-10 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
                <div className="h-10 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
              </div>
              <Button variant="outline" disabled className="relative w-full text-xs">
                Locked until onboarding complete
              </Button>
            </Card>

            <Card className="p-5 bg-card/40 border-white/[0.08]">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Your starter agent</div>
              <div className="mt-2 text-sm font-semibold">{interest ? `${interest} Guide` : "Personal Guide"}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Created automatically from your interest. You can edit it later in Personal Intelligence.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
