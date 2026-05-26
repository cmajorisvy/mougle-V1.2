import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Zap, Crown, Lock, Sparkles, Check, Swords, Bot, Video, Megaphone,
  CreditCard, Brain, Mic, GraduationCap, Store, ArrowRight
} from "lucide-react";
import { useState, createContext, useContext, useCallback } from "react";

type PaywallReason =
  | "low_credits" | "debate_create" | "premium_feature" | "trending_boost"
  | "ai_response" | "video_generation"
  | "memory_limit" | "advanced_reasoning" | "voice_access" | "agent_training" | "marketplace_publish";

interface PromptConfig {
  intensity: string;
  title: string;
  message: string;
  cta: string;
  benefit: string;
}

interface PaywallDetails {
  actionType?: string;
  cost?: number;
  promptConfig?: PromptConfig;
  requiredPlan?: string;
  psychologyStage?: string;
  triggerType?: string;
}

interface PaywallContextType {
  showPaywall: (reason: PaywallReason, details?: PaywallDetails) => void;
  hidePaywall: () => void;
  checkFeatureGate: (feature: string) => Promise<boolean>;
}

const PaywallContext = createContext<PaywallContextType>({
  showPaywall: () => {},
  hidePaywall: () => {},
  checkFeatureGate: async () => true,
});

export function usePaywall() {
  return useContext(PaywallContext);
}

const TRIGGER_ICONS: Record<string, any> = {
  memory_limit: Brain,
  advanced_reasoning: Sparkles,
  voice_access: Mic,
  agent_training: GraduationCap,
  marketplace_publish: Store,
  low_credits: CreditCard,
  debate_create: Swords,
  premium_feature: Lock,
  trending_boost: Megaphone,
  ai_response: Bot,
  video_generation: Video,
};

const LEGACY_CONFIG: Record<string, { title: string; description: string; ctaLabel: string }> = {
  low_credits: { title: "Running Low on Compute Credits", description: "Add compute credits to keep using AI features, debates, and more. These are separate from Gluon contribution credit.", ctaLabel: "Add Credits" },
  debate_create: { title: "Credits Required for Debates", description: "Creating debates requires credits. Upgrade your plan for discounts.", ctaLabel: "Get Credits" },
  premium_feature: { title: "Premium Feature", description: "This feature requires a paid plan.", ctaLabel: "View Plans" },
  trending_boost: { title: "Boost Your Content", description: "Spend credits to boost your content's visibility.", ctaLabel: "Boost Now" },
  ai_response: { title: "AI Response Credits", description: "AI-powered responses use credits.", ctaLabel: "Get Credits" },
  video_generation: { title: "Video Generation", description: "Video generation requires compute credits.", ctaLabel: "Add Credits" },
};

const INTENSITY_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  educate: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  soft: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  strong: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400", badge: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

function PsychologyPaywallContent({ reason, details, onClose }: { reason: PaywallReason; details?: PaywallDetails; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const userId = user?.id || null;
  const { toast } = useToast();
  const promptConfig = details?.promptConfig;
  const intensity = promptConfig?.intensity || "soft";
  const colors = INTENSITY_COLORS[intensity] || INTENSITY_COLORS.soft;
  const Icon = TRIGGER_ICONS[reason] || Lock;

  const { data: packages = [] } = useQuery({
    queryKey: ["/api/billing/credit-packages"],
    queryFn: () => api.billing.creditPackages(),
  });

  const { data: summary } = useQuery({
    queryKey: ["/api/billing/summary", userId],
    queryFn: () => userId ? api.billing.summary(userId) : null,
    enabled: !!userId,
  });

  const purchaseMutation = useMutation({
    mutationFn: (packageId: string) => api.billing.purchaseCredits(userId!, packageId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Credits purchased!", description: `${data.purchase.creditsBought} credits added.` });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Purchase failed", description: err.message, variant: "destructive" }),
  });

  const logClickMutation = useMutation({
    mutationFn: () => fetch("/api/monetization/log-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId, eventType: "prompt_clicked", triggerType: details?.triggerType || reason,
        psychologyStage: details?.psychologyStage || "curious",
        currentPlan: summary?.subscription?.plan?.name || "free",
        suggestedPlan: details?.requiredPlan,
      }),
    }),
  });

  const quickPack = packages.find((p: any) => p.popular) || packages[0];
  const requiredPlan = details?.requiredPlan || "pro";
  const showCreditsSection = details?.cost && details.cost > 0;

  return (
    <div className="space-y-5" data-testid="paywall-psychology-content">
      <div className="flex items-center gap-3">
        <div className={cn("p-3 rounded-2xl", colors.bg)}>
          <Icon className={cn("w-6 h-6", colors.text)} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-display font-bold" data-testid="text-paywall-title">
              {promptConfig?.title || "Upgrade Required"}
            </h3>
            {intensity === "educate" && (
              <Badge variant="outline" className={cn("text-[9px]", colors.badge)}>Learn More</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-paywall-message">
            {promptConfig?.message || "This feature requires an upgrade."}
          </p>
        </div>
      </div>

      {promptConfig?.benefit && (
        <div className={cn("flex items-center gap-2 p-3 rounded-xl border", colors.bg, colors.border)}>
          <Check className={cn("w-4 h-4", colors.text)} />
          <span className={cn("text-sm font-medium", colors.text)} data-testid="text-paywall-benefit">
            {promptConfig.benefit}
          </span>
        </div>
      )}

      {summary && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <CreditCard className="w-4 h-4 text-primary" />
          <span className="text-sm">Balance:</span>
          <span className="font-bold font-mono text-primary">{summary.balance} credits</span>
          {showCreditsSection && (
            <>
              <span className="text-muted-foreground mx-1">·</span>
              <span className="text-sm text-muted-foreground">Cost: {details.cost} credits</span>
              {summary.balance < (details.cost || 0) && (
                <Badge variant="outline" className="text-[9px] border-red-500/20 text-red-400 bg-red-500/5 ml-auto">
                  Insufficient
                </Badge>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          className="flex-1 h-10 text-sm gap-1.5"
          onClick={() => {
            logClickMutation.mutate();
            navigate("/billing");
            onClose();
          }}
          data-testid="button-paywall-upgrade"
        >
          <Crown className="w-4 h-4" /> {promptConfig?.cta || "Upgrade"}
        </Button>
        {showCreditsSection && quickPack && (
          <Button
            variant="outline"
            className="h-10 text-sm gap-1.5 border-white/[0.08]"
            onClick={() => purchaseMutation.mutate(quickPack.id)}
            disabled={purchaseMutation.isPending}
            data-testid="button-paywall-buy-credits"
          >
            <Zap className="w-3 h-3" /> Add Credits
          </Button>
        )}
      </div>

      {intensity !== "educate" && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Check, label: "No expiry on credits" },
            { icon: Crown, label: `${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} perks` },
            { icon: Sparkles, label: "Personalized AI" },
          ].map(({ icon: I, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <I className="w-3 h-3 text-emerald-400" /> {label}
            </div>
          ))}
        </div>
      )}

      {intensity === "educate" && (
        <button
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          onClick={onClose}
          data-testid="button-paywall-dismiss"
        >
          Maybe later
        </button>
      )}
    </div>
  );
}

function LegacyPaywallContent({ reason, details, onClose }: { reason: PaywallReason; details?: PaywallDetails; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const userId = user?.id || null;
  const { toast } = useToast();
  const config = LEGACY_CONFIG[reason] || LEGACY_CONFIG.premium_feature;
  const Icon = TRIGGER_ICONS[reason] || Lock;

  const { data: packages = [] } = useQuery({
    queryKey: ["/api/billing/credit-packages"],
    queryFn: () => api.billing.creditPackages(),
  });

  const { data: summary } = useQuery({
    queryKey: ["/api/billing/summary", userId],
    queryFn: () => userId ? api.billing.summary(userId) : null,
    enabled: !!userId,
  });

  const purchaseMutation = useMutation({
    mutationFn: (packageId: string) => api.billing.purchaseCredits(userId!, packageId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Credits purchased!", description: `${data.purchase.creditsBought} credits added.` });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Purchase failed", description: err.message, variant: "destructive" }),
  });

  const quickPack = packages.find((p: any) => p.popular) || packages[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className={cn("p-3 rounded-2xl", reason === "low_credits" ? "bg-amber-500/10" : "bg-primary/10")}>
          <Icon className={cn("w-6 h-6", reason === "low_credits" ? "text-amber-400" : "text-primary")} />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold">{config.title}</h3>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
      </div>

      {summary && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <CreditCard className="w-4 h-4 text-primary" />
          <span className="text-sm">Current Credit Balance:</span>
          <span className="font-bold font-mono text-primary">{summary.balance} credits</span>
        </div>
      )}

      {quickPack && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">{quickPack.name}</p>
                <p className="text-xs text-muted-foreground">
                  {quickPack.credits} credits {quickPack.bonusCredits > 0 ? `+ ${quickPack.bonusCredits} bonus` : ""} for ${(quickPack.priceUsd / 100).toFixed(0)}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => purchaseMutation.mutate(quickPack.id)}
              disabled={purchaseMutation.isPending}
              data-testid="button-quick-buy"
            >
              <Zap className="w-3 h-3" /> Add Credits
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button
          className="flex-1 h-9 text-sm gap-1.5"
          onClick={() => { navigate("/billing"); onClose(); }}
          data-testid="button-view-billing"
        >
          <CreditCard className="w-4 h-4" /> {config.ctaLabel}
        </Button>
        <Button
          variant="outline"
          className="flex-1 h-9 text-sm gap-1.5 border-purple-500/20 text-purple-400 hover:bg-purple-500/10"
          onClick={() => { navigate("/billing"); onClose(); }}
          data-testid="button-view-plans"
        >
          <Crown className="w-4 h-4" /> View Plans
        </Button>
      </div>
    </div>
  );
}

const PSYCHOLOGY_TRIGGERS: PaywallReason[] = ["memory_limit", "advanced_reasoning", "voice_access", "agent_training", "marketplace_publish"];

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<PaywallReason>("low_credits");
  const [details, setDetails] = useState<PaywallDetails | undefined>();
  const { user } = useAuth();

  const showPaywall = useCallback((r: PaywallReason, d?: PaywallDetails) => {
    setReason(r);
    setDetails(d);
    setIsOpen(true);
  }, []);

  const hidePaywall = useCallback(() => setIsOpen(false), []);

  const checkFeatureGate = useCallback(async (feature: string): Promise<boolean> => {
    const userId = user?.id || null;
    if (!userId) return true;
    try {
      const res = await fetch("/api/monetization/gate-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, feature }),
      });
      const data = await res.json();
      if (!data.allowed && data.promptConfig) {
        const triggerType = data.promptConfig ? feature.replace(/_/g, "_") : "premium_feature";
        const gateToReason: Record<string, PaywallReason> = {
          expanded_memory: "memory_limit",
          voice_interaction: "voice_access",
          advanced_reasoning: "advanced_reasoning",
          agent_training: "agent_training",
          marketplace_publish: "marketplace_publish",
        };
        showPaywall(gateToReason[feature] || "premium_feature", {
          promptConfig: data.promptConfig,
          requiredPlan: data.requiredPlan,
          psychologyStage: data.psychologyStage,
          triggerType: feature,
          cost: data.creditsCost,
        });
        return false;
      }
      return data.allowed;
    } catch {
      return true;
    }
  }, [showPaywall]);

  const isPsychologyPrompt = PSYCHOLOGY_TRIGGERS.includes(reason);

  return (
    <PaywallContext.Provider value={{ showPaywall, hidePaywall, checkFeatureGate }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-card border-white/[0.08] max-w-md" data-testid="dialog-paywall">
          {isPsychologyPrompt ? (
            <PsychologyPaywallContent reason={reason} details={details} onClose={hidePaywall} />
          ) : (
            <LegacyPaywallContent reason={reason} details={details} onClose={hidePaywall} />
          )}
        </DialogContent>
      </Dialog>
    </PaywallContext.Provider>
  );
}
