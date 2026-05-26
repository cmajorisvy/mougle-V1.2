import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle,
  Database,
  FlaskConical,
  Link as LinkIcon,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VaultType = "personal" | "business" | "public" | "behavioral" | "verified";
type SourceType = "text" | "link";
type PresetKey = "research_analyst" | "builder_planner" | "tutor_coach" | "creative_strategist" | "operations_assistant";

type SourceClassification = {
  vaultType: VaultType;
  sensitivity: "public" | "internal" | "restricted" | "private";
  reason: string;
  allowedContexts: string[];
  blockedContexts: string[];
  requiresBusinessPermission: boolean;
  warnings: string[];
};

type KnowledgeSource = {
  id: string;
  sourceType: SourceType;
  title: string;
  content?: string;
  uri?: string;
  requestedVaultType: VaultType;
  businessUseApproved: boolean;
};

const PERSONALITY_PRESETS: Array<{
  key: PresetKey;
  label: string;
  detail: string;
  skills: string[];
}> = [
  { key: "research_analyst", label: "Research Analyst", detail: "Evidence-first, careful, source-aware.", skills: ["research", "analysis", "summarization"] },
  { key: "builder_planner", label: "Builder / Planner", detail: "Structured plans, tradeoffs, implementation steps.", skills: ["planning", "analysis", "writing"] },
  { key: "tutor_coach", label: "Tutor / Coach", detail: "Patient explanations and guided learning.", skills: ["teaching", "summarization", "writing"] },
  { key: "creative_strategist", label: "Creative Strategist", detail: "Ideas, positioning, pattern finding.", skills: ["ideation", "writing", "analysis"] },
  { key: "operations_assistant", label: "Operations Assistant", detail: "Procedures, tracking, low-risk support.", skills: ["operations", "summarization", "moderation"] },
];

const INDUSTRIES = ["Personal", "Business", "Research", "Creator", "Education", "Operations", "Technology"];
const STEPS = [
  { label: "Profile", icon: Bot },
  { label: "Training", icon: Database },
  { label: "Vaults", icon: Shield },
  { label: "Preview", icon: FlaskConical },
  { label: "Ready", icon: CheckCircle },
];

const PERSONAL_PATTERN = /\b(my|family|home address|personal|private|medical|diagnosis|salary|income|tax|ssn|social security|bank|card|password|secret|token|api key)\b/i;
const BUSINESS_PATTERN = /\b(client|customer|lead|deal|revenue|strategy|roadmap|contract|proposal|pricing|sales|business|project|company|internal)\b/i;
const BEHAVIORAL_PATTERN = /\b(style|tone|preference|prefer|voice|writing style|be concise|be detailed|friendly|formal|coach|explain)\b/i;
const VERIFIED_PATTERN = /\b(evidence|source|citation|study|paper|report|verified|fact check|data)\b/i;
const PUBLIC_URL_PATTERN = /^https?:\/\//i;

const vaultStyles: Record<VaultType, string> = {
  personal: "border-red-500/30 bg-red-500/10 text-red-300",
  business: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  public: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  behavioral: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  verified: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

function classifySource(source: KnowledgeSource): SourceClassification {
  const combined = `${source.title}\n${source.content || ""}\n${source.uri || ""}`;
  const hasPublicUri = source.sourceType === "link" && PUBLIC_URL_PATTERN.test(source.uri || "");
  const hasSensitiveMarker = PERSONAL_PATTERN.test(combined);
  let vaultType: VaultType = "business";
  let sensitivity: SourceClassification["sensitivity"] = "restricted";
  let reason = "No trusted public signal was found, so this source stays restricted by default.";

  if (hasSensitiveMarker || source.requestedVaultType === "personal") {
    vaultType = "personal";
    sensitivity = "private";
    reason = "Personal or sensitive markers require personal/private handling.";
  } else if (source.requestedVaultType === "behavioral" || BEHAVIORAL_PATTERN.test(combined)) {
    vaultType = "behavioral";
    sensitivity = "internal";
    reason = "This source is treated as style or preference memory.";
  } else if (source.requestedVaultType === "verified" && hasPublicUri && VERIFIED_PATTERN.test(combined)) {
    vaultType = "verified";
    sensitivity = "internal";
    reason = "This source has public evidence or verification signals.";
  } else if (source.requestedVaultType === "public" && hasPublicUri) {
    vaultType = "public";
    sensitivity = "public";
    reason = "This public URL can be treated as public knowledge after confirmation.";
  } else if (source.requestedVaultType === "business" || BUSINESS_PATTERN.test(combined)) {
    vaultType = "business";
    sensitivity = "restricted";
    reason = "Business/project markers require restricted business-vault handling.";
  }

  if ((source.requestedVaultType === "public" || source.requestedVaultType === "verified") && vaultType !== source.requestedVaultType) {
    reason = `${reason} Public/verified classification needs a clear public source.`;
  }

  if (vaultType === "personal") {
    return {
      vaultType,
      sensitivity,
      reason,
      allowedContexts: ["Owner-private use"],
      blockedContexts: ["Public debates", "Marketplace exports", "SEO generation", "Clustering", "Public agent behavior"],
      requiresBusinessPermission: false,
      warnings: ["Personal/private memory is blocked from public contexts."],
    };
  }

  if (vaultType === "business") {
    return {
      vaultType,
      sensitivity,
      reason,
      allowedContexts: source.businessUseApproved ? ["Supervised business tasks"] : ["Owner-private use"],
      blockedContexts: ["Public debates", "Marketplace exports", "SEO generation", "Clustering", "Public agent behavior"],
      requiresBusinessPermission: true,
      warnings: source.businessUseApproved
        ? ["Business memory is approved for supervised business tasks only."]
        : ["Business memory needs explicit permission before business-task use."],
    };
  }

  if (vaultType === "behavioral") {
    return {
      vaultType,
      sensitivity,
      reason,
      allowedContexts: ["Agent behavior as sanitized style hints"],
      blockedContexts: ["Raw public output", "Marketplace exports", "SEO generation", "Clustering"],
      requiresBusinessPermission: false,
      warnings: ["Behavioral memory is converted into safe style hints."],
    };
  }

  return {
    vaultType,
    sensitivity,
    reason,
    allowedContexts: ["Agent behavior", "Public debates", "Podcasts"],
    blockedContexts: vaultType === "public" ? ["Restricted exports without later approval"] : [],
    requiresBusinessPermission: false,
    warnings: vaultType === "verified" ? ["Keep evidence references attached when using verified memory."] : [],
  };
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function AgentBuilder() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("Personal");
  const [category, setCategory] = useState("");
  const [role, setRole] = useState("");
  const [personalityPreset, setPersonalityPreset] = useState<PresetKey>("research_analyst");
  const [instructions, setInstructions] = useState("");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [sourceType, setSourceType] = useState<SourceType>("text");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [sourceVault, setSourceVault] = useState<VaultType>("business");
  const [memoryConfirmed, setMemoryConfirmed] = useState(false);
  const [createdResult, setCreatedResult] = useState<any>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [testPrompt, setTestPrompt] = useState("What can you help me do safely?");
  const [testResult, setTestResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth/signin", { replace: true });
    }
  }, [authLoading, navigate, user]);

  const selectedPreset = PERSONALITY_PRESETS.find((preset) => preset.key === personalityPreset) || PERSONALITY_PRESETS[0];
  const classifiedSources = useMemo(() => sources.map((source) => ({ source, classification: classifySource(source) })), [sources]);
  const personalSourceCount = classifiedSources.filter(({ classification }) => classification.vaultType === "personal").length;
  const businessSourceCount = classifiedSources.filter(({ classification }) => classification.vaultType === "business").length;
  const publicReadyCount = classifiedSources.filter(({ classification }) => classification.vaultType === "public" || classification.vaultType === "verified").length;

  const addSource = () => {
    setError("");
    const title = sourceTitle.trim();
    const content = sourceContent.trim();
    const uri = sourceUri.trim();
    if (!title) {
      setError("Source title is required.");
      return;
    }
    if (sourceType === "text" && !content) {
      setError("Text sources need content.");
      return;
    }
    if (sourceType === "link" && !PUBLIC_URL_PATTERN.test(uri)) {
      setError("Link sources need a valid public URL.");
      return;
    }
    setSources((current) => [
      ...current,
      {
        id: makeId(),
        sourceType,
        title,
        content: sourceType === "text" ? content : undefined,
        uri: sourceType === "link" ? uri : undefined,
        requestedVaultType: sourceVault,
        businessUseApproved: false,
      },
    ]);
    setSourceTitle("");
    setSourceContent("");
    setSourceUri("");
    setSourceVault("business");
    setMemoryConfirmed(false);
  };

  const updateSource = (id: string, updates: Partial<KnowledgeSource>) => {
    setSources((current) => current.map((source) => source.id === id ? { ...source, ...updates } : source));
    setMemoryConfirmed(false);
  };

  const removeSource = (id: string) => {
    setSources((current) => current.filter((source) => source.id !== id));
    setMemoryConfirmed(false);
  };

  const createMutation = useMutation({
    mutationFn: () => api.userAgentBuilder.create({
      name,
      industry,
      category,
      role,
      personalityPreset,
      instructions,
      memoryConfirmed,
      sources: sources.map((source) => ({
        sourceType: source.sourceType,
        title: source.title,
        content: source.content,
        uri: source.uri,
        requestedVaultType: source.requestedVaultType,
        businessUseApproved: source.businessUseApproved,
      })),
    }),
    onSuccess: async (result) => {
      setCreatedResult(result);
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ["/api/user-agents"] });
      try {
        const simulation = await api.userAgentBuilder.simulate(result.agent.id);
        setSimulationResult(simulation);
      } catch (err) {
        setSimulationResult({ error: err instanceof Error ? err.message : "Simulation unavailable." });
      }
    },
    onError: (err: any) => {
      setError(err.message || "Failed to create agent.");
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.userAgentBuilder.test(createdResult.agent.id, testPrompt),
    onSuccess: setTestResult,
    onError: (err: any) => setTestResult({ response: err.message || "Test preview unavailable." }),
  });

  const handleNext = () => {
    setError("");
    if (step === 0) {
      if (!name.trim()) return setError("Agent name is required.");
      if (!category.trim()) return setError("Choose a category.");
    }
    if (step === 1) {
      if (!instructions.trim()) return setError("Instructions are required.");
      if (sources.length === 0) return setError("Add at least one text or link training source.");
    }
    if (step === 2 && !memoryConfirmed) {
      return setError("Confirm the memory visibility review before continuing.");
    }
    if (step === 3) {
      createMutation.mutate();
      return;
    }
    setStep((current) => current + 1);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-white/[0.08] bg-card/50 p-5 shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-page-title">
                  Agent Builder
                </h1>
                <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  Create a private user-owned agent with vault-aware training and safe test previews.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              Private MVP
            </Badge>
          </div>
        </section>

        <div className="grid grid-cols-5 gap-2" data-testid="step-indicators">
          {STEPS.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === step;
            const isDone = index < step;
            return (
              <div
                key={item.label}
                className={cn(
                  "rounded-lg border p-3 text-center transition-colors",
                  isDone ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" :
                    isActive ? "border-primary/30 bg-primary/10 text-primary" :
                      "border-white/[0.06] bg-white/[0.02] text-muted-foreground"
                )}
              >
                <Icon className="mx-auto h-4 w-4" />
                <p className="mt-1 text-[11px] font-medium">{item.label}</p>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300" data-testid="text-error">
            {error}
          </div>
        )}

        {step === 0 && (
          <section className="rounded-lg border border-white/[0.06] bg-card/50 p-5 shadow-none">
            <div className="mb-5 flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Agent Profile</h2>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Agent name</Label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Research helper"
                    className="mt-1 bg-white/[0.04]"
                    data-testid="input-agent-name"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Industry</Label>
                    <select
                      value={industry}
                      onChange={(event) => setIndustry(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-foreground"
                      data-testid="select-industry"
                    >
                      {INDUSTRIES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Input
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      placeholder="Research, coaching, operations"
                      className="mt-1 bg-white/[0.04]"
                      data-testid="input-category"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <Input
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="Analyst, planner, tutor"
                    className="mt-1 bg-white/[0.04]"
                    data-testid="input-role"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Personality / DNA preset</Label>
                <div className="mt-2 grid gap-2">
                  {PERSONALITY_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => setPersonalityPreset(preset.key)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        personalityPreset === preset.key
                          ? "border-primary/35 bg-primary/10"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"
                      )}
                      data-testid={`button-preset-${preset.key}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{preset.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{preset.detail}</p>
                        </div>
                        {personalityPreset === preset.key && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {preset.skills.map((skill) => (
                          <Badge key={skill} variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-muted-foreground">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="rounded-lg border border-white/[0.06] bg-card/50 p-5 shadow-none">
            <div className="mb-5 flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Instructions And Knowledge</h2>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Instructions</Label>
                  <Textarea
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    rows={8}
                    placeholder="What should this agent help with? What boundaries should it follow?"
                    className="mt-1 resize-none bg-white/[0.04]"
                    data-testid="input-instructions"
                  />
                </div>
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-200">
                  File uploads are deferred for this phase. Text and link sources are supported first.
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">Add training source</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Source type</Label>
                      <select
                        value={sourceType}
                        onChange={(event) => setSourceType(event.target.value as SourceType)}
                        className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-foreground"
                        data-testid="select-source-type"
                      >
                        <option value="text">Text</option>
                        <option value="link">Link</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Suggested vault</Label>
                      <select
                        value={sourceVault}
                        onChange={(event) => setSourceVault(event.target.value as VaultType)}
                        className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-foreground"
                        data-testid="select-source-vault"
                      >
                        <option value="personal">Personal</option>
                        <option value="business">Business</option>
                        <option value="public">Public</option>
                        <option value="behavioral">Behavioral</option>
                        <option value="verified">Verified</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <Input
                      value={sourceTitle}
                      onChange={(event) => setSourceTitle(event.target.value)}
                      placeholder="Source title"
                      className="mt-1 bg-white/[0.04]"
                      data-testid="input-source-title"
                    />
                  </div>
                  {sourceType === "text" ? (
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">Text</Label>
                      <Textarea
                        value={sourceContent}
                        onChange={(event) => setSourceContent(event.target.value)}
                        rows={5}
                        placeholder="Paste training text here."
                        className="mt-1 resize-none bg-white/[0.04]"
                        data-testid="input-source-content"
                      />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">URL</Label>
                      <Input
                        value={sourceUri}
                        onChange={(event) => setSourceUri(event.target.value)}
                        placeholder="https://example.com/source"
                        className="mt-1 bg-white/[0.04]"
                        data-testid="input-source-uri"
                      />
                    </div>
                  )}
                  <Button onClick={addSource} className="mt-4 gap-2 bg-primary text-primary-foreground" data-testid="button-add-source">
                    <Plus className="h-4 w-4" />
                    Add source
                  </Button>
                </div>

                <div className="space-y-2">
                  {sources.length === 0 ? (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-muted-foreground">
                      No training sources added yet.
                    </div>
                  ) : classifiedSources.map(({ source, classification }) => (
                    <div key={source.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3" data-testid={`knowledge-source-${source.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {source.sourceType === "link" ? <LinkIcon className="h-4 w-4 text-muted-foreground" /> : <Database className="h-4 w-4 text-muted-foreground" />}
                            <p className="truncate text-sm font-medium text-foreground">{source.title}</p>
                            <Badge variant="outline" className={cn("text-[10px]", vaultStyles[classification.vaultType])}>
                              {classification.vaultType}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{classification.reason}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-300" onClick={() => removeSource(source.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="rounded-lg border border-white/[0.06] bg-card/50 p-5 shadow-none">
            <div className="mb-5 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Vault Review</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-xs text-red-200/80">Personal/private</p>
                <p className="mt-1 text-2xl font-semibold text-red-200">{personalSourceCount}</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-xs text-amber-200/80">Business/restricted</p>
                <p className="mt-1 text-2xl font-semibold text-amber-200">{businessSourceCount}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
                <p className="text-xs text-emerald-200/80">Public/verified</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-200">{publicReadyCount}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {classifiedSources.map(({ source, classification }) => (
                <div key={source.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{source.title}</p>
                        <Badge variant="outline" className={cn("text-[10px]", vaultStyles[classification.vaultType])}>
                          {classification.vaultType} / {classification.sensitivity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{classification.reason}</p>
                    </div>
                    <select
                      value={source.requestedVaultType}
                      onChange={(event) => updateSource(source.id, { requestedVaultType: event.target.value as VaultType })}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-foreground"
                    >
                      <option value="personal">Personal</option>
                      <option value="business">Business</option>
                      <option value="public">Public</option>
                      <option value="behavioral">Behavioral</option>
                      <option value="verified">Verified</option>
                    </select>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3">
                      <p className="text-xs font-medium text-emerald-200">Allowed</p>
                      <p className="mt-1 text-xs text-muted-foreground">{classification.allowedContexts.join(", ") || "None"}</p>
                    </div>
                    <div className="rounded-lg border border-red-500/15 bg-red-500/5 p-3">
                      <p className="text-xs font-medium text-red-200">Blocked</p>
                      <p className="mt-1 text-xs text-muted-foreground">{classification.blockedContexts.join(", ") || "None"}</p>
                    </div>
                  </div>
                  {classification.requiresBusinessPermission && (
                    <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                      <input
                        type="checkbox"
                        checked={source.businessUseApproved}
                        onChange={(event) => updateSource(source.id, { businessUseApproved: event.target.checked })}
                        className="mt-0.5"
                        data-testid={`checkbox-business-use-${source.id}`}
                      />
                      <span>Allow this business memory only for supervised business-task use.</span>
                    </label>
                  )}
                </div>
              ))}
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-primary-foreground/90">
              <input
                type="checkbox"
                checked={memoryConfirmed}
                onChange={(event) => setMemoryConfirmed(event.target.checked)}
                className="mt-1"
                data-testid="checkbox-memory-confirmed"
              />
              <span>
                I confirm these memory classifications. Personal/private memory stays out of public debates, safe-clone packages, SEO generation, clustering, and public agent behavior.
              </span>
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="rounded-lg border border-white/[0.06] bg-card/50 p-5 shadow-none">
            <div className="mb-5 flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Safe Simulation Preview</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <div>
                    <p className="font-medium text-foreground">Private user-owned agent</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This phase creates a private agent with no public deployment, marketplace listing, API deployment, sale/rental, or autonomous publishing.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Badge variant="outline" className="justify-center border-emerald-500/20 bg-emerald-500/10 py-2 text-emerald-300">Private ready state</Badge>
                  <Badge variant="outline" className="justify-center border-red-500/20 bg-red-500/10 py-2 text-red-300">Public actions blocked</Badge>
                  <Badge variant="outline" className="justify-center border-amber-500/20 bg-amber-500/10 py-2 text-amber-300">Business memory gated</Badge>
                  <Badge variant="outline" className="justify-center border-sky-500/20 bg-sky-500/10 py-2 text-sky-300">Test preview only</Badge>
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                  Deferred from this MVP
                </div>
                <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <li>Marketplace clone/export</li>
                  <li>Public sale/rental</li>
                  <li>Public debate participation</li>
                  <li>API access</li>
                  <li>Autonomous workers or publishing</li>
                  <li>File upload training</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {step === 4 && createdResult && (
          <section className="rounded-lg border border-white/[0.06] bg-card/50 p-5 shadow-none">
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h2 className="mt-3 text-xl font-semibold text-foreground">Private agent ready</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {createdResult.agent.name} is saved as a private user-owned agent.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs text-muted-foreground">Training status</p>
                  <p className="mt-1 font-semibold text-foreground">{createdResult.trainingStatus?.readyState || "private_ready"}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs text-muted-foreground">Sources</p>
                  <p className="mt-1 font-semibold text-foreground">{createdResult.trainingStatus?.sourceCount || sources.length}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs text-muted-foreground">Visibility</p>
                  <p className="mt-1 font-semibold text-foreground">private</p>
                </div>
              </div>

              {simulationResult && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Shield className="h-4 w-4 text-primary" />
                    Simulation result
                  </div>
                  {simulationResult.error ? (
                    <p className="mt-2 text-sm text-red-300">{simulationResult.error}</p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Public debate allowed</p>
                        <p className="text-lg font-semibold text-foreground">{simulationResult.memoryPolicy?.publicDebate?.allowed ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Public debate blocked</p>
                        <p className="text-lg font-semibold text-foreground">{simulationResult.memoryPolicy?.publicDebate?.denied ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Public action</p>
                        <p className="text-lg font-semibold text-red-300">blocked</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Private test prompt</p>
                </div>
                <Textarea
                  value={testPrompt}
                  onChange={(event) => setTestPrompt(event.target.value)}
                  rows={3}
                  className="resize-none bg-white/[0.04]"
                  data-testid="input-test-prompt"
                />
                <Button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || !testPrompt.trim()}
                  className="mt-3 gap-2 bg-primary text-primary-foreground"
                  data-testid="button-test-agent"
                >
                  {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Run private preview
                </Button>
                {testResult && (
                  <div className="mt-3 rounded-lg border border-white/[0.06] bg-background/40 p-3 text-sm text-muted-foreground" data-testid="text-test-result">
                    {testResult.response}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => navigate("/my-agents")} data-testid="button-go-to-agents">
                  Go to My Agents
                </Button>
                <Button onClick={() => navigate("/dashboard")} className="bg-primary text-primary-foreground">
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </section>
        )}

        {step < 4 && (
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={createMutation.isPending}
              className="bg-primary text-primary-foreground"
              data-testid="button-next"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating
                </>
              ) : step === 3 ? (
                <>
                  Create private agent
                  <Check className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
