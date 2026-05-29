import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Calculator, Cpu, Server, Wifi, HeadphonesIcon, DollarSign,
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, Sparkles,
  BarChart3, Shield, ArrowRight, Loader2, Code, Receipt,
  Globe, Package, FileCheck, ExternalLink, Download,
  Megaphone, Users, Target, Percent, Plus, Trash2,
  ThumbsUp, ThumbsDown, Minus, Lightbulb
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface CostItem {
  monthly: number;
  perUser: number;
  details: string;
}

interface TaxCostItem extends CostItem {
  rate: number;
}

interface CostBreakdown {
  aiCompute: CostItem;
  hosting: CostItem;
  bandwidth: CostItem;
  support: CostItem;
  platformFee: CostItem;
  devAmortization: CostItem;
  tax: TaxCostItem;
  totalPerUser: number;
  totalMonthly: number;
}

interface DevCostEstimate {
  replitAiHours: number;
  replitPlanCost: number;
  totalDevCost: number;
  taxOnDev: number;
  effectiveDevCost: number;
  amortizationMonths: number;
  monthlyAmortized: number;
}

interface AnalysisResult {
  id: string;
  analysis: {
    aiUsage: string;
    hostingTier: string;
    bandwidthTier: string;
    supportLevel: string;
  };
  costs: CostBreakdown;
  minimumPrice: number;
  recommendedPrice: number;
  targetMargin: number;
  pricingModel: string;
  estimatedUsers: number;
  warnings: string[];
  sustainable: boolean;
  devCostEstimate: DevCostEstimate;
  distributionNote: string;
}

interface ExportConfirmResult {
  exportId: string;
  status: string;
  message: string;
}

interface ExportPackageResult {
  exportId: string;
  appName: string;
  status: string;
  package: {
    type: string;
    includes: string[];
    deploymentOptions: { platform: string; guide: string }[];
    note: string;
  };
  legalNotice: string;
}

interface ValidationResult {
  valid: boolean;
  creatorSetPrice: number;
  minimumPrice: number;
  recommendedPrice: number;
  effectiveMargin: number;
  sustainable: boolean;
  warnings: string[];
}

interface MarketingChannel {
  platform: string;
  followers: number;
  engagementRate?: number;
}

interface MarketingResult {
  channelBreakdown: { platform: string; followers: number; estimatedReach: number; conversionEstimate: number; score: number }[];
  totalReach: number;
  totalEstimatedConversions: number;
  adConversions: number;
  monthlyRevenueEstimate: number;
  successScore: number;
  verdict: "high_potential" | "moderate" | "needs_improvement" | "risky";
  verdictMessage: string;
  recommendations: string[];
}

const costIcons: Record<string, typeof Cpu> = {
  aiCompute: Cpu,
  hosting: Server,
  bandwidth: Wifi,
  support: HeadphonesIcon,
  platformFee: Shield,
  devAmortization: Code,
  tax: Receipt,
};

const costLabels: Record<string, string> = {
  aiCompute: "AI Compute",
  hosting: "Hosting",
  bandwidth: "Bandwidth",
  support: "Support",
  platformFee: "Platform Fee",
  devAmortization: "Dev Amortization",
  tax: "VAT / Tax",
};

const costColors: Record<string, string> = {
  aiCompute: "text-violet-400",
  hosting: "text-blue-400",
  bandwidth: "text-emerald-400",
  support: "text-amber-400",
  platformFee: "text-rose-400",
  devAmortization: "text-cyan-400",
  tax: "text-orange-400",
};

const barColors: Record<string, string> = {
  aiCompute: "bg-violet-500",
  hosting: "bg-blue-500",
  bandwidth: "bg-emerald-500",
  support: "bg-amber-500",
  platformFee: "bg-rose-500",
  devAmortization: "bg-cyan-500",
  tax: "bg-orange-500",
};

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook", placeholder: "Followers" },
  { value: "instagram", label: "Instagram", placeholder: "Followers" },
  { value: "youtube", label: "YouTube", placeholder: "Subscribers" },
  { value: "twitter", label: "X (Twitter)", placeholder: "Followers" },
  { value: "tiktok", label: "TikTok", placeholder: "Followers" },
  { value: "linkedin", label: "LinkedIn", placeholder: "Connections" },
  { value: "podcast", label: "Podcast", placeholder: "Subscribers" },
  { value: "newsletter", label: "Newsletter", placeholder: "Subscribers" },
  { value: "other", label: "Other", placeholder: "Audience size" },
];

const AD_TYPES = [
  { value: "banner", label: "Banner Ads" },
  { value: "retargeting", label: "Retargeting Ads" },
  { value: "social_ads", label: "Social Media Ads" },
  { value: "search_ads", label: "Search Ads (Google)" },
  { value: "influencer", label: "Influencer Marketing" },
  { value: "content", label: "Content Marketing" },
];

const verdictConfig: Record<string, { color: string; bg: string; border: string; icon: typeof ThumbsUp }> = {
  high_potential: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: ThumbsUp },
  moderate: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Minus },
  needs_improvement: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertTriangle },
  risky: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: ThumbsDown },
};


export default function PricingEngine() {
  const [appPrompt, setAppPrompt] = useState("");
  const [appName, setAppName] = useState("");
  const [estimatedUsers, setEstimatedUsers] = useState(100);
  const [pricingModel, setPricingModel] = useState("subscription");
  const [devHours, setDevHours] = useState(40);
  const [vatRate, setVatRate] = useState(0);
  const [amortizationMonths, setAmortizationMonths] = useState(12);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [customPrice, setCustomPrice] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [exportConfirmed, setExportConfirmed] = useState(false);
  const [exportResult, setExportResult] = useState<ExportPackageResult | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);

  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [monthlyAdBudget, setMonthlyAdBudget] = useState(0);
  const [selectedAdTypes, setSelectedAdTypes] = useState<string[]>([]);
  const [marketingResult, setMarketingResult] = useState<MarketingResult | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pricing-engine/analyze", {
        appPrompt,
        appName: appName || undefined,
        estimatedUsers,
        pricingModel,
        devHours,
        vatRate: vatRate / 100,
        amortizationMonths,
      });
      return res.json();
    },
    onSuccess: (data: AnalysisResult) => {
      setResult(data);
      setCustomPrice("");
      setValidation(null);
      setExportConfirmed(false);
      setExportResult(null);
      setShowDisclaimer(false);
      setDisclaimerChecked(false);
      setMarketingResult(null);
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pricing-engine/validate-price", {
        analysisId: result!.id,
        creatorSetPrice: Number(customPrice),
      });
      return res.json();
    },
    onSuccess: (data: ValidationResult) => {
      setValidation(data);
    },
  });

  const exportConfirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/app-export/confirm", {
        appName: appName || "Untitled App",
        analysisId: result?.id,
        distributionAcknowledged: true,
        legalDisclaimerAccepted: true,
      });
      return res.json();
    },
    onSuccess: async (data: ExportConfirmResult) => {
      setExportConfirmed(true);
      const res = await apiRequest("POST", "/api/app-export/generate", { exportId: data.exportId });
      const pkg = await res.json();
      setExportResult(pkg);
      setShowDisclaimer(false);
    },
  });

  const marketingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pricing-engine/evaluate-marketing", {
        channels,
        monthlyAdBudget,
        adTypes: selectedAdTypes,
        estimatedUsers: result?.estimatedUsers || estimatedUsers,
        recommendedPrice: result?.recommendedPrice || 5,
      });
      return res.json();
    },
    onSuccess: (data: MarketingResult) => {
      setMarketingResult(data);
    },
  });

  const addChannel = () => {
    setChannels([...channels, { platform: "facebook", followers: 0 }]);
  };

  const removeChannel = (index: number) => {
    setChannels(channels.filter((_, i) => i !== index));
    setMarketingResult(null);
  };

  const updateChannel = (index: number, field: keyof MarketingChannel, value: any) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], [field]: value };
    setChannels(updated);
    setMarketingResult(null);
  };

  const toggleAdType = (type: string) => {
    setSelectedAdTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
    setMarketingResult(null);
  };

  const allCostKeys = ["aiCompute", "hosting", "bandwidth", "support", "platformFee", "devAmortization", "tax"] as const;
  const maxCost = result ? Math.max(
    ...allCostKeys.map(k => (result.costs[k] as CostItem)?.perUser || 0),
    0.01
  ) : 1;

  return (
    <Layout>
      <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Intelligent Pricing Engine</h1>
            <p className="text-zinc-400 text-sm">Global pricing analysis for apps, tools, and products</p>
          </div>
        </div>

        <Card className="glass-card rounded-xl p-6 space-y-5" data-testid="section-prompt-input">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-300">App Name</label>
              <Input
                placeholder="My Awesome App"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="bg-zinc-900/60 border-zinc-700"
                data-testid="input-app-name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-300">Pricing Model</label>
              <Select value={pricingModel} onValueChange={setPricingModel}>
                <SelectTrigger className="bg-zinc-900/60 border-zinc-700" data-testid="select-pricing-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription">Monthly Subscription</SelectItem>
                  <SelectItem value="one_time">One-time Purchase</SelectItem>
                  <SelectItem value="usage">Usage-based</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-300">Describe your app</label>
            <Textarea
              placeholder="Describe what your app does, its features, and tech requirements. Example: An AI-powered SaaS dashboard that analyzes customer feedback using GPT, stores data in a database, and generates weekly reports with charts..."
              value={appPrompt}
              onChange={(e) => setAppPrompt(e.target.value)}
              rows={4}
              className="bg-zinc-900/60 border-zinc-700 resize-none"
              data-testid="input-app-prompt"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Estimated Users</label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[estimatedUsers]}
                  onValueChange={([v]) => setEstimatedUsers(v)}
                  min={10}
                  max={10000}
                  step={10}
                  className="flex-1"
                  data-testid="slider-estimated-users"
                />
                <span className="text-sm font-mono text-zinc-300 w-16 text-right" data-testid="text-user-count">{estimatedUsers.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Dev Hours</label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[devHours]}
                  onValueChange={([v]) => setDevHours(v)}
                  min={5}
                  max={500}
                  step={5}
                  className="flex-1"
                  data-testid="slider-dev-hours"
                />
                <span className="text-sm font-mono text-zinc-300 w-16 text-right" data-testid="text-dev-hours">{devHours}h</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Amortization Period</label>
              <Select value={String(amortizationMonths)} onValueChange={(v) => setAmortizationMonths(Number(v))}>
                <SelectTrigger className="bg-zinc-900/60 border-zinc-700" data-testid="select-amortization">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                  <SelectItem value="18">18 months</SelectItem>
                  <SelectItem value="24">24 months</SelectItem>
                  <SelectItem value="36">36 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-zinc-500" />
                VAT / Tax Rate
                <span className="text-[10px] text-zinc-500 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[vatRate]}
                  onValueChange={([v]) => setVatRate(v)}
                  min={0}
                  max={30}
                  step={0.5}
                  className="flex-1"
                  data-testid="slider-vat-rate"
                />
                <span className="text-sm font-mono text-zinc-300 w-12 text-right" data-testid="text-vat-rate">{vatRate}%</span>
              </div>
            </div>
          </div>

          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={!appPrompt.trim() || analyzeMutation.isPending}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
            data-testid="button-analyze"
          >
            {analyzeMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Analyze & Calculate Price</>
            )}
          </Button>
        </Card>

        {result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="section-price-summary">
              <Card className="glass-card rounded-xl p-5 border-zinc-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs text-zinc-400 uppercase tracking-wider">Cost / User</span>
                </div>
                <p className="text-2xl font-bold text-zinc-200" data-testid="text-cost-per-user">
                  ${result.costs.totalPerUser.toFixed(2)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">per user per month{vatRate > 0 ? ` (incl. ${vatRate}% tax)` : ""}</p>
              </Card>

              <Card className="glass-card rounded-xl p-5 border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-emerald-400 uppercase tracking-wider">Minimum Price</span>
                </div>
                <p className="text-2xl font-bold text-emerald-300" data-testid="text-minimum-price">
                  ${result.minimumPrice}
                </p>
                <p className="text-xs text-zinc-500 mt-1">ensures 50% margin</p>
              </Card>

              <Card className="glass-card rounded-xl p-5 border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs text-primary uppercase tracking-wider">Recommended</span>
                </div>
                <p className="text-2xl font-bold text-primary" data-testid="text-recommended-price">
                  ${result.recommendedPrice}
                </p>
                <p className="text-xs text-zinc-500 mt-1">optimal for growth</p>
              </Card>
            </div>

            <Card className="glass-card rounded-xl p-6" data-testid="section-dev-cost">
              <div className="flex items-center gap-2 mb-4">
                <Code className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">Development Cost</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-zinc-900/60 rounded-lg p-3" data-testid="dev-ai-hours">
                  <p className="text-[11px] text-zinc-500 uppercase">Dev Hours</p>
                  <p className="text-lg font-bold font-mono">{result.devCostEstimate.replitAiHours}h</p>
                  <p className="text-[10px] text-zinc-600">@ $0.30/hr</p>
                </div>
                <div className="bg-zinc-900/60 rounded-lg p-3" data-testid="dev-total-cost">
                  <p className="text-[11px] text-zinc-500 uppercase">Dev Cost</p>
                  <p className="text-lg font-bold font-mono">${result.devCostEstimate.totalDevCost.toFixed(2)}</p>
                  <p className="text-[10px] text-zinc-600">Development + plan</p>
                </div>
                <div className="bg-zinc-900/60 rounded-lg p-3" data-testid="dev-tax">
                  <p className="text-[11px] text-zinc-500 uppercase">Tax ({vatRate}%)</p>
                  <p className={cn("text-lg font-bold font-mono", vatRate > 0 ? "text-orange-400" : "text-zinc-500")}>
                    ${result.devCostEstimate.taxOnDev.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-zinc-600">{vatRate > 0 ? "Added to cost" : "No tax applied"}</p>
                </div>
                <div className="bg-zinc-900/60 rounded-lg p-3" data-testid="dev-amortized">
                  <p className="text-[11px] text-zinc-500 uppercase">Monthly Amortized</p>
                  <p className="text-lg font-bold font-mono text-cyan-400">${result.devCostEstimate.monthlyAmortized.toFixed(2)}</p>
                  <p className="text-[10px] text-zinc-600">over {result.devCostEstimate.amortizationMonths} months</p>
                </div>
              </div>
            </Card>

            <Card className="glass-card rounded-xl p-6" data-testid="section-cost-breakdown">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="w-5 h-5 text-zinc-400" />
                <h2 className="text-lg font-semibold">Full Cost Breakdown</h2>
                <Badge variant="outline" className="ml-auto text-[10px] px-2 py-0.5">
                  {result.estimatedUsers.toLocaleString()} users
                </Badge>
              </div>

              <div className="space-y-4">
                {allCostKeys.map((key) => {
                  const item = result.costs[key] as CostItem;
                  if (!item) return null;
                  const Icon = costIcons[key];
                  const pct = maxCost > 0 ? (item.perUser / maxCost) * 100 : 0;
                  const isTaxZero = key === "tax" && vatRate === 0;
                  return (
                    <div key={key} className={cn("space-y-1.5", isTaxZero && "opacity-40")} data-testid={`cost-item-${key}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("w-4 h-4", costColors[key])} />
                          <span className="text-sm font-medium">{costLabels[key]}{key === "tax" && vatRate > 0 ? ` (${vatRate}%)` : ""}</span>
                          {isTaxZero && <Badge className="text-[9px] bg-zinc-700/50 text-zinc-400">N/A</Badge>}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-mono font-semibold" data-testid={`cost-per-user-${key}`}>
                            ${item.perUser.toFixed(2)}
                          </span>
                          <span className="text-xs text-zinc-500 ml-1">/user</span>
                          <span className="text-xs text-zinc-600 ml-3">
                            ${item.monthly.toFixed(0)}/mo
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", barColors[key])}
                          style={{ width: `${Math.max(isTaxZero ? 0 : pct, 2)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-zinc-500">{item.details}</p>
                    </div>
                  );
                })}

                <div className="border-t border-zinc-700/50 pt-3 mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-300">Total Cost / User / Month</span>
                  <span className="text-lg font-bold font-mono" data-testid="text-total-cost">
                    ${result.costs.totalPerUser.toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>

            {/* Marketing Capability Evaluator */}
            <Card className="glass-card rounded-xl p-6 space-y-5" data-testid="section-marketing-evaluator">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Marketing Capability Evaluator</h2>
                  <p className="text-xs text-zinc-500">Evaluate whether your marketing reach can sustain this product</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-zinc-500" />
                    Your Marketing Channels
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addChannel}
                    className="h-7 text-xs border-zinc-700 gap-1"
                    data-testid="button-add-channel"
                  >
                    <Plus className="w-3 h-3" /> Add Channel
                  </Button>
                </div>

                {channels.length === 0 && (
                  <div className="text-center py-6 bg-zinc-900/40 rounded-xl border border-dashed border-zinc-700/50">
                    <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">No channels added yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Add your social media, podcast, or newsletter channels</p>
                  </div>
                )}

                {channels.map((ch, i) => {
                  const platformInfo = PLATFORM_OPTIONS.find(p => p.value === ch.platform);
                  return (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end bg-zinc-900/40 rounded-lg p-3 border border-zinc-800" data-testid={`channel-row-${i}`}>
                      <div className="space-y-1">
                        <label className="text-[11px] text-zinc-500">Platform</label>
                        <Select value={ch.platform} onValueChange={(v) => updateChannel(i, "platform", v)}>
                          <SelectTrigger className="bg-zinc-900/60 border-zinc-700 h-9 text-xs" data-testid={`channel-platform-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLATFORM_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-zinc-500">{platformInfo?.placeholder || "Followers"}</label>
                        <Input
                          type="number"
                          min={0}
                          value={ch.followers || ""}
                          onChange={(e) => updateChannel(i, "followers", Number(e.target.value))}
                          placeholder="e.g. 5000"
                          className="bg-zinc-900/60 border-zinc-700 h-9 text-xs"
                          data-testid={`channel-followers-${i}`}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeChannel(i)}
                        className="h-9 w-9 p-0 text-zinc-500 hover:text-red-400"
                        data-testid={`channel-remove-${i}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-zinc-500" />
                  Digital Marketing (Paid Ads)
                </label>
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-500">Monthly Ad Budget ($)</label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[monthlyAdBudget]}
                      onValueChange={([v]) => { setMonthlyAdBudget(v); setMarketingResult(null); }}
                      min={0}
                      max={5000}
                      step={50}
                      className="flex-1"
                      data-testid="slider-ad-budget"
                    />
                    <span className="text-sm font-mono text-zinc-300 w-16 text-right" data-testid="text-ad-budget">${monthlyAdBudget}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {AD_TYPES.map(ad => (
                    <button
                      key={ad.value}
                      onClick={() => toggleAdType(ad.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        selectedAdTypes.includes(ad.value)
                          ? "bg-pink-500/20 border-pink-500/40 text-pink-300"
                          : "bg-zinc-900/40 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      )}
                      data-testid={`ad-type-${ad.value}`}
                    >
                      {ad.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => marketingMutation.mutate()}
                disabled={channels.length === 0 || marketingMutation.isPending}
                className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500"
                data-testid="button-evaluate-marketing"
              >
                {marketingMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Evaluating...</>
                ) : (
                  <><Target className="w-4 h-4 mr-2" /> Evaluate Marketing Success</>
                )}
              </Button>

              {marketingResult && (
                <div className="space-y-4 pt-2" data-testid="section-marketing-result">
                  {/* Verdict */}
                  {(() => {
                    const vc = verdictConfig[marketingResult.verdict];
                    const VerdictIcon = vc.icon;
                    return (
                      <div className={cn("rounded-xl p-5 border", vc.bg, vc.border)} data-testid="marketing-verdict">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", vc.bg)}>
                            <VerdictIcon className={cn("w-5 h-5", vc.color)} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-lg font-bold", vc.color)} data-testid="text-success-score">
                                {marketingResult.successScore}/100
                              </span>
                              <Badge className={cn("text-[10px]", vc.bg, vc.color)}>
                                {marketingResult.verdict.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                              </Badge>
                            </div>
                            <p className="text-sm text-zinc-400 mt-1" data-testid="text-verdict-message">{marketingResult.verdictMessage}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Channel Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800" data-testid="marketing-overview">
                      <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-zinc-500" /> Overview
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">Total Reach</span>
                          <span className="font-mono font-semibold text-zinc-300">{marketingResult.totalReach.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">Est. Conversions (Organic)</span>
                          <span className="font-mono font-semibold text-emerald-400">{(marketingResult.totalEstimatedConversions - marketingResult.adConversions).toLocaleString()}</span>
                        </div>
                        {marketingResult.adConversions > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Est. Conversions (Paid)</span>
                            <span className="font-mono font-semibold text-pink-400">{marketingResult.adConversions.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="border-t border-zinc-700/50 pt-2 flex justify-between text-xs">
                          <span className="text-zinc-400 font-medium">Est. Monthly Revenue</span>
                          <span className="font-mono font-bold text-emerald-400">${marketingResult.monthlyRevenueEstimate.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800" data-testid="marketing-channels-breakdown">
                      <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-zinc-500" /> Channel Performance
                      </h3>
                      <div className="space-y-2">
                        {marketingResult.channelBreakdown.map((ch, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 w-20 truncate">{ch.platform}</span>
                            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500"
                                style={{ width: `${ch.score}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 w-8 text-right">{ch.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {marketingResult.recommendations.length > 0 && (
                    <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800" data-testid="marketing-recommendations">
                      <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Recommendations
                      </h3>
                      <ul className="space-y-2">
                        {marketingResult.recommendations.map((rec, i) => (
                          <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                            <ArrowRight className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card className="glass-card rounded-xl p-6" data-testid="section-distribution">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold">External Distribution Responsibility</h2>
                <Badge className="bg-blue-500/20 text-blue-400 text-[10px] ml-auto">Infrastructure Only</Badge>
              </div>
              <div className="bg-zinc-900/60 rounded-lg p-4 border border-zinc-700/50 mb-4">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {result.distributionNote || "Mougle provides web app infrastructure only. External distribution (mobile stores, third-party platforms) is the creator's responsibility."}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-zinc-900/40 rounded-lg p-3 border border-zinc-800" data-testid="dist-platform-provided">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-300">What Mougle Provides</span>
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-400">
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /> Web app hosting and infrastructure</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /> Pricing analysis and sustainability checks</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /> Exportable web app packages</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /> Admin-reviewed Mougle sandbox listing, if approved</li>
                  </ul>
                </div>
                <div className="bg-zinc-900/40 rounded-lg p-3 border border-zinc-800" data-testid="dist-creator-responsible">
                  <div className="flex items-center gap-2 mb-2">
                    <FileCheck className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-300">Creator Responsibility</span>
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-400">
                    <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /> Publishing to external platforms (Play Store, App Store, etc.)</li>
                    <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /> Store commissions and developer account fees</li>
                    <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /> Compliance with platform policies and regulations</li>
                    <li className="flex items-start gap-1.5"><ArrowRight className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /> End-user support and data privacy compliance</li>
                  </ul>
                </div>
              </div>
            </Card>

            <Card className="glass-card rounded-xl p-6" data-testid="section-export">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">Export Web App Package</h2>
              </div>

              {!exportConfirmed && !showDisclaimer && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-400">
                    Export prepares a package for external review or independent use outside Mougle. It does not create a Mougle checkout, production marketplace listing, or platform-managed deployment.
                  </p>
                  <Button
                    onClick={() => { setShowDisclaimer(true); setDisclaimerChecked(false); }}
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500"
                    data-testid="button-start-export"
                  >
                    <Package className="w-4 h-4 mr-2" /> Begin Export Process
                  </Button>
                </div>
              )}

              {showDisclaimer && !exportConfirmed && (
                <div className="space-y-4">
                  <div className="bg-zinc-900/80 rounded-lg p-4 border border-amber-500/30 max-h-48 overflow-y-auto text-xs text-zinc-400 leading-relaxed whitespace-pre-line" data-testid="text-disclaimer">
                    {`EXTERNAL DISTRIBUTION RESPONSIBILITY ACKNOWLEDGMENT

By exporting this application from Mougle, I ("Creator") acknowledge and agree:

1. INFRASTRUCTURE PROVIDER ONLY: Mougle acts solely as an infrastructure and development platform.

2. CREATOR RESPONSIBILITY: I am solely responsible for publishing, distributing, and operating the exported app on any external platform.

3. NO LIABILITY: Mougle shall not be liable for any issues arising from external distribution.

4. INDEMNIFICATION: I agree to indemnify and hold Mougle harmless from any claims arising from my distribution of the exported application.

5. NO GUARANTEES: Mougle makes no guarantees about the exported app's compatibility or acceptance on any external platform.`}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={disclaimerChecked}
                      onCheckedChange={setDisclaimerChecked}
                      data-testid="switch-disclaimer-accept"
                    />
                    <label className="text-sm text-zinc-300">
                      I acknowledge and accept the External Distribution Responsibility terms
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => exportConfirmMutation.mutate()}
                      disabled={!disclaimerChecked || exportConfirmMutation.isPending}
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
                      data-testid="button-confirm-export"
                    >
                      {exportConfirmMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        <><FileCheck className="w-4 h-4 mr-2" /> Confirm & Export</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowDisclaimer(false)}
                      className="border-zinc-700"
                      data-testid="button-cancel-export"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {exportResult && (
                <div className="space-y-4" data-testid="section-export-result">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-semibold">Export Package Ready</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {exportResult.package.includes.map((item) => (
                      <div key={item} className="bg-zinc-900/60 rounded-lg p-2 text-xs text-zinc-300 flex items-center gap-2" data-testid={`export-include-${item}`}>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        {item.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500 uppercase font-medium">External Options</p>
                    {exportResult.package.deploymentOptions.map((opt) => (
                      <div key={opt.platform} className="flex items-center justify-between bg-zinc-900/40 rounded-lg p-2 border border-zinc-800" data-testid={`deploy-option-${opt.platform.toLowerCase()}`}>
                        <div className="flex items-center gap-2">
                          <ExternalLink className="w-3 h-3 text-cyan-400" />
                          <span className="text-sm font-medium">{opt.platform}</span>
                        </div>
                        <span className="text-xs text-zinc-500">{opt.guide}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-600 bg-zinc-900/40 rounded p-2">
                    {exportResult.package.note}
                  </p>
                </div>
              )}
            </Card>

            <Card className="glass-card rounded-xl p-6 space-y-4" data-testid="section-detected-profile">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cpu className="w-5 h-5 text-zinc-400" />
                Detected App Profile
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "AI Usage", value: result.analysis.aiUsage, color: "text-violet-400" },
                  { label: "Hosting", value: result.analysis.hostingTier, color: "text-blue-400" },
                  { label: "Bandwidth", value: result.analysis.bandwidthTier, color: "text-emerald-400" },
                  { label: "Support", value: result.analysis.supportLevel.replace("_", " "), color: "text-amber-400" },
                ].map((p) => (
                  <div key={p.label} className="bg-zinc-900/60 rounded-lg p-3 text-center" data-testid={`profile-${p.label.toLowerCase().replace(" ", "-")}`}>
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{p.label}</p>
                    <p className={cn("text-sm font-semibold capitalize", p.color)}>{p.value}</p>
                  </div>
                ))}
              </div>
            </Card>

            {result.warnings.length > 0 && (
              <Card className="glass-card rounded-xl p-5 border-amber-500/30 bg-amber-500/5" data-testid="section-warnings">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <h3 className="font-semibold text-amber-300">Warnings</h3>
                </div>
                <ul className="space-y-2">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-amber-200/80 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card className="glass-card rounded-xl p-6 space-y-4" data-testid="section-set-price">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-zinc-400" />
                Set Your Price
              </h2>
              <p className="text-sm text-zinc-400">
                You can set any price at or above the minimum (${result.minimumPrice}).
                Prices below minimum will be blocked to ensure sustainability.
              </p>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                  <Input
                    type="number"
                    min={1}
                    value={customPrice}
                    onChange={(e) => { setCustomPrice(e.target.value); setValidation(null); }}
                    placeholder={String(result.recommendedPrice)}
                    className="bg-zinc-900/60 border-zinc-700 pl-7"
                    data-testid="input-custom-price"
                  />
                </div>
                <Button
                  onClick={() => validateMutation.mutate()}
                  disabled={!customPrice || validateMutation.isPending}
                  variant="outline"
                  className="border-zinc-700"
                  data-testid="button-validate-price"
                >
                  {validateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Validate <ArrowRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
              </div>

              {validation && (
                <div className={cn(
                  "rounded-lg p-4 border",
                  validation.valid
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-red-500/30 bg-red-500/5"
                )} data-testid="section-validation-result">
                  <div className="flex items-center gap-2 mb-2">
                    {validation.valid ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <span className={cn("font-semibold", validation.valid ? "text-emerald-300" : "text-red-300")}>
                      {validation.valid ? "Price Approved" : "Price Below Minimum"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="text-center">
                      <p className="text-[11px] text-zinc-500 uppercase">Your Price</p>
                      <p className="text-lg font-bold" data-testid="text-validated-price">${validation.creatorSetPrice}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-zinc-500 uppercase">Margin</p>
                      <p className={cn("text-lg font-bold", validation.effectiveMargin >= 50 ? "text-emerald-400" : validation.effectiveMargin >= 30 ? "text-amber-400" : "text-red-400")} data-testid="text-margin">
                        {validation.effectiveMargin}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-zinc-500 uppercase">Status</p>
                      <Badge className={cn("mt-1", validation.sustainable ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")} data-testid="badge-sustainability">
                        {validation.sustainable ? "Sustainable" : "Unsustainable"}
                      </Badge>
                    </div>
                  </div>
                  {validation.warnings.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {validation.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-300/80 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

            <div className="text-center text-xs text-zinc-600 pb-4" data-testid="section-footer">
              All prices in USD. {vatRate > 0 ? `Includes ${vatRate}% VAT/Tax. ` : ""}
              Mougle is an infrastructure provider only. External distribution responsibility lies with the creator.
              Creators keep 70% of revenue.
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
