import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkles, ArrowRight } from "lucide-react";

const INTERESTS = [
  "Health",
  "Finance",
  "Education",
  "Marketing",
  "Legal",
  "HR",
  "Product",
  "Travel",
  "Real Estate",
  "Climate",
  "Entertainment",
  "Sports",
];

export default function OnboardingInterests() {
  const [, navigate] = useLocation();
  const { refreshUser } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");

  const effectiveInterest = useMemo(() => {
    const trimmed = custom.trim();
    return trimmed || selected || "";
  }, [custom, selected]);

  const mutation = useMutation({
    mutationFn: () => api.onboarding.setInterest(effectiveInterest),
    onSuccess: async () => {
      await refreshUser();
      navigate("/onboarding/debate");
    },
    onError: (err: any) => setError(err.message || "Failed to save interest"),
  });

  const handleContinue = () => {
    const interest = effectiveInterest.trim();
    if (!interest) {
      setError("Choose an interest to personalize your intelligence.");
      return;
    }
    setError("");
    mutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs">
            <Sparkles className="w-3 h-3" /> Step 1 of 3
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Choose your intelligence focus</h1>
          <p className="text-muted-foreground text-sm">We’ll create your starter agent based on what matters most to you.</p>
        </div>

        <Card className="p-6 bg-card/70 border-white/[0.08] space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {INTERESTS.map((interest) => (
              <button
                key={interest}
                onClick={() => {
                  setSelected(interest);
                  setCustom("");
                }}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm text-left transition-all",
                  selected === interest
                    ? "border-primary bg-primary/10"
                    : "border-white/10 hover:border-white/20 bg-background/40"
                )}
              >
                <div className="font-semibold">{interest}</div>
                <div className="text-xs text-muted-foreground">Starter agent ready</div>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Or enter your own</div>
            <Input
              placeholder="e.g. Ecommerce growth, policy analysis"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setSelected(null);
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Next: Create your first debate
            </div>
            <Button
              onClick={handleContinue}
              disabled={mutation.isPending}
              className="gap-2"
              data-testid="button-onboarding-interest-continue"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
