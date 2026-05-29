import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Shield, CheckCircle2, AlertCircle, ArrowRight, Star,
  Megaphone, Eye, Lock, UserCheck, ScrollText, Info,
  ChevronDown, ChevronUp, Mail, MapPin, Briefcase
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TRUST_LEVEL_CONFIG: Record<string, { icon: typeof Shield; color: string; bg: string; border: string }> = {
  explorer: { icon: Shield, color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20" },
  verified_creator: { icon: UserCheck, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  trusted_publisher: { icon: Star, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
};

function TrustLevelProgress({ status }: { status: any }) {
  const levels = ["explorer", "verified_creator", "trusted_publisher"];
  const currentIndex = levels.indexOf(status.trustLevel);

  return (
    <Card className="glass-card rounded-xl" data-testid="section-trust-progress">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="w-5 h-5 text-primary" />
          Your Trust Level
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-3">
          {levels.map((level, i) => {
            const config = TRUST_LEVEL_CONFIG[level];
            const isActive = i <= currentIndex;
            const isCurrent = i === currentIndex;
            return (
              <div key={level} className="flex items-center gap-3 flex-1">
                {i > 0 && (
                  <div className={cn("h-0.5 flex-1 rounded", isActive ? "bg-primary/40" : "bg-white/[0.06]")} />
                )}
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                  isCurrent ? cn(config.bg, config.border, "ring-1 ring-primary/20") :
                  isActive ? cn(config.bg, config.border) :
                  "bg-white/[0.03] border-white/[0.06] opacity-50"
                )} data-testid={`badge-level-${level}`}>
                  <config.icon className={cn("w-4 h-4", isActive ? config.color : "text-muted-foreground")} />
                  <span className={cn("text-xs font-medium", isActive ? "text-white" : "text-muted-foreground")}>
                    {level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Profile Complete", done: status.checks.profileComplete },
            { label: "Agreement Signed", done: status.checks.agreementSigned },
            { label: "Promotion Declared", done: status.checks.promotionDeclared },
            { label: "Account Active", done: status.checks.accountActive },
          ].map(check => (
            <div key={check.label} className={cn(
              "flex items-center gap-2 p-2.5 rounded-lg border text-xs",
              check.done ? "bg-emerald-500/5 border-emerald-500/15 text-emerald-400" : "bg-white/[0.03] border-white/[0.06] text-muted-foreground"
            )} data-testid={`check-${check.label.toLowerCase().replace(/\s/g, "-")}`}>
              {check.done ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              {check.label}
            </div>
          ))}
        </div>

        {status.canUpgrade.eligible && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-sm" data-testid="section-upgrade-ready">
            <div className="flex items-center gap-2 text-primary font-medium mb-1">
              <ArrowRight className="w-4 h-4" />
              Ready to upgrade to {status.canUpgrade.nextLabel}
            </div>
          </div>
        )}

        {status.canUpgrade.missing.length > 0 && !status.canUpgrade.eligible && (
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 text-xs text-muted-foreground">
            <span className="text-amber-400 font-medium">To reach {status.canUpgrade.nextLabel}:</span>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              {status.canUpgrade.missing.map((m: string) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PromotionDeclarationForm({ userId, existingDeclaration, onComplete }: {
  userId: string;
  existingDeclaration?: any;
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: methods } = useQuery({
    queryKey: ["marketing-methods"],
    queryFn: () => api.creatorVerification.getMarketingMethods(),
  });

  const { data: channels } = useQuery({
    queryKey: ["promotion-channels"],
    queryFn: () => api.creatorVerification.getPromotionChannels(),
  });

  const { data: agreement } = useQuery({
    queryKey: ["promotion-agreement"],
    queryFn: () => api.creatorVerification.getPromotionAgreement(),
  });

  const [selectedMethods, setSelectedMethods] = useState<string[]>(existingDeclaration?.marketingMethods || []);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(existingDeclaration?.promotionChannels || []);
  const [targetAudience, setTargetAudience] = useState(existingDeclaration?.targetAudience || "");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(!!existingDeclaration);
  const [showAgreement, setShowAgreement] = useState(false);

  const submit = useMutation({
    mutationFn: () => api.creatorVerification.submitDeclaration({
      userId, marketingMethods: selectedMethods, targetAudience, promotionChannels: selectedChannels, additionalNotes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-verification-status"] });
      queryClient.invalidateQueries({ queryKey: ["creator-declaration"] });
      toast({ title: "Declaration submitted", description: "Your responsible promotion declaration has been recorded." });
      onComplete();
    },
  });

  const toggleMethod = (id: string) => setSelectedMethods(prev =>
    prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
  );

  const toggleChannel = (id: string) => setSelectedChannels(prev =>
    prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
  );

  return (
    <Card className="glass-card rounded-xl" data-testid="section-promotion-form">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          Responsible Promotion Declaration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Tell us how you plan to describe your applications. This helps maintain safe-clone sandbox quality before any future marketplace step.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium mb-2 block">How will you market your apps? *</label>
          <p className="text-xs text-muted-foreground mb-3">Select all methods you intend to use.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(methods || []).map((m: any) => (
              <button
                key={m.id}
                onClick={() => toggleMethod(m.id)}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border text-left text-xs transition-all",
                  selectedMethods.includes(m.id)
                    ? "bg-primary/10 border-primary/30 text-white"
                    : "bg-white/[0.03] border-white/[0.06] text-muted-foreground hover:border-white/[0.12]"
                )}
                data-testid={`method-${m.id}`}
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                  selectedMethods.includes(m.id) ? "bg-primary border-primary" : "border-white/20"
                )}>
                  {selectedMethods.includes(m.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Promotion Channels</label>
          <p className="text-xs text-muted-foreground mb-3">Where will you share your apps?</p>
          <div className="flex flex-wrap gap-2">
            {(channels || []).map((c: any) => (
              <button
                key={c.id}
                onClick={() => toggleChannel(c.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs transition-all",
                  selectedChannels.includes(c.id)
                    ? "bg-primary/10 border-primary/30 text-white"
                    : "bg-white/[0.03] border-white/[0.06] text-muted-foreground hover:border-white/[0.12]"
                )}
                data-testid={`channel-${c.id}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Target Audience</label>
          <Input
            data-testid="input-target-audience"
            placeholder="e.g., Small business owners, students, developers..."
            value={targetAudience}
            onChange={e => setTargetAudience(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Additional Notes</label>
          <Textarea
            data-testid="input-additional-notes"
            placeholder="Any additional details about your promotion strategy..."
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
            rows={2}
            className="bg-white/[0.04] border-white/[0.08]"
          />
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setShowAgreement(!showAgreement)}
            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            data-testid="button-toggle-agreement"
          >
            <ScrollText className="w-4 h-4" />
            {showAgreement ? "Hide" : "Read"} Responsible Promotion Agreement
            {showAgreement ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAgreement && (
            <div className="max-h-48 overflow-y-auto p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-promotion-agreement">
              {agreement?.text || "Loading..."}
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 rounded"
              data-testid="checkbox-agree-terms"
            />
            <span className="text-xs text-muted-foreground">
              I agree to promote my applications responsibly. I will not engage in spam, misleading advertising, or any illegal promotional activities. I understand that violations may result in trust level downgrade or account suspension.
            </span>
          </label>
        </div>

        <Button
          data-testid="button-submit-declaration"
          className="w-full"
          onClick={() => submit.mutate()}
          disabled={submit.isPending || selectedMethods.length === 0 || !agreedToTerms}
        >
          {submit.isPending ? "Submitting..." : existingDeclaration ? "Update Declaration" : "Submit Promotion Declaration"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PrivacyNoticeSection() {
  const { data } = useQuery({
    queryKey: ["privacy-notice"],
    queryFn: () => api.creatorVerification.getPrivacyNotice(),
  });

  return (
    <Card className="glass-card rounded-xl" data-testid="section-privacy-notice">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Eye className="w-4 h-4 text-primary" />
          Why We Collect This Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {data?.notice || "Loading..."}
        </div>
      </CardContent>
    </Card>
  );
}

function TrustLevelsInfo() {
  const { data: levels } = useQuery({
    queryKey: ["trust-levels"],
    queryFn: () => api.creatorVerification.getTrustLevels(),
  });

  if (!levels) return null;

  return (
    <Card className="glass-card rounded-xl" data-testid="section-trust-levels-info">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 text-primary" />
          Trust Level Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Object.entries(levels).map(([key, config]: [string, any]) => {
            const visual = TRUST_LEVEL_CONFIG[key] || TRUST_LEVEL_CONFIG.explorer;
            return (
              <div key={key} className={cn("p-4 rounded-xl border", visual.bg, visual.border)} data-testid={`info-level-${key}`}>
                <div className="flex items-center gap-2 mb-2">
                  <visual.icon className={cn("w-4 h-4", visual.color)} />
                  <span className="font-medium text-sm">{config.label}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{config.maxAppsPerDay} apps/day</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{config.description}</p>
                {config.requirements.length > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    <span className="font-medium">Requirements:</span>{" "}
                    {config.requirements.join(" · ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CreatorVerification() {
  const userId = "current-user";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["creator-verification-status", userId],
    queryFn: () => api.creatorVerification.getStatus(userId),
  });

  const upgrade = useMutation({
    mutationFn: () => api.creatorVerification.upgrade(userId),
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["creator-verification-status"] });
        toast({ title: "Trust level upgraded!", description: `You are now a ${data.newLevel?.replace(/_/g, " ")}` });
      } else {
        toast({ title: "Cannot upgrade yet", description: data.reason, variant: "destructive" });
      }
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <UserCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-verification-title">Creator Verification</h1>
              <p className="text-sm text-muted-foreground">Build trust for admin-reviewed safe-clone sandbox capabilities</p>
            </div>
          </div>

          {status?.canUpgrade?.eligible && (
            <Button
              data-testid="button-upgrade-level"
              onClick={() => upgrade.mutate()}
              disabled={upgrade.isPending}
              className="bg-primary"
            >
              {upgrade.isPending ? "Upgrading..." : `Upgrade to ${status.canUpgrade.nextLabel}`}
            </Button>
          )}
        </div>

        <TrustLevelProgress status={status} />

        {status?.profile && (
          <Card className="glass-card rounded-xl" data-testid="section-creator-identity">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserCheck className="w-4 h-4 text-primary" />
                Your Creator Identity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <UserCheck className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-[10px] text-muted-foreground">Name</div>
                    <div className="text-sm font-medium">{status.profile.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-[10px] text-muted-foreground">Contact</div>
                    <div className="text-sm font-medium">{status.profile.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-[10px] text-muted-foreground">Location</div>
                    <div className="text-sm font-medium">{status.profile.location || "Not set"}</div>
                  </div>
                </div>
              </div>
              {!status.checks.profileComplete && (
                <div className="mt-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs text-amber-400 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Profile incomplete — <a href="/publisher" className="underline">complete your publisher profile</a>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!status?.profile && (
          <Card className="glass-card rounded-xl border-amber-500/15" data-testid="section-no-profile">
            <CardContent className="p-6 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="font-bold">Publisher Profile Required</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                You need to create a publisher profile with your name, location, business type, and contact email before you can proceed.
              </p>
              <Button asChild>
                <a href="/publisher" data-testid="link-create-profile">Create Publisher Profile</a>
              </Button>
            </CardContent>
          </Card>
        )}

        <PromotionDeclarationForm
          userId={userId}
          existingDeclaration={status?.declaration}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ["creator-verification-status"] })}
        />

        <TrustLevelsInfo />

        <PrivacyNoticeSection />
      </div>
    </Layout>
  );
}
