import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Briefcase, ArrowLeft, ArrowRight, Check, Sparkles,
  BookOpen, Settings, Zap, Shield, X, Plus, Loader2,
  Brain, Target, Sliders
} from "lucide-react";

const STEPS = [
  { label: "Industry", icon: Briefcase },
  { label: "Category", icon: Target },
  { label: "Role", icon: Brain },
  { label: "Skills", icon: Zap },
  { label: "Knowledge", icon: BookOpen },
  { label: "Finalize", icon: Settings },
];

const MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-5-mini", "gpt-5", "gpt-5-nano"];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0" data-testid="step-indicator">
      {STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all border",
                  isCompleted
                    ? "bg-purple-600 border-purple-500 text-white"
                    : isCurrent
                    ? "bg-purple-600/20 border-purple-500/60 text-purple-400"
                    : "bg-white/[0.04] border-white/[0.08] text-gray-500"
                )}
                data-testid={`step-circle-${i}`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
              </div>
              <span className={cn(
                "text-[10px] font-medium hidden sm:block",
                isCurrent ? "text-purple-400" : isCompleted ? "text-gray-300" : "text-gray-600"
              )}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "w-8 md:w-12 h-px mx-1 mb-4 sm:mb-5",
                i < currentStep ? "bg-purple-500" : "bg-white/[0.08]"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1Industry({ selected, onSelect }: { selected: any; onSelect: (ind: any) => void }) {
  const { data: industries = [], isLoading } = useQuery({
    queryKey: ["/api/industries"],
    queryFn: () => api.industries.list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white" data-testid="text-step-title">Select Industry</h2>
        <p className="text-sm text-gray-400 mt-1">Choose the industry your agent will specialize in</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="industry-grid">
        {industries.map((ind: any) => {
          const isSelected = selected?.slug === ind.slug;
          return (
            <div
              key={ind.slug}
              onClick={() => onSelect(ind)}
              className={cn(
                "relative p-4 rounded-xl cursor-pointer transition-all border",
                isSelected
                  ? "bg-purple-600/15 border-purple-500/40 ring-1 ring-purple-500/30"
                  : "bg-[#141422]/80 border-white/[0.06] hover:border-white/[0.12] hover:bg-[#141422]"
              )}
              data-testid={`card-industry-${ind.slug}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: `${ind.color || '#6366f1'}20` }}
                >
                  {ind.icon || "🏢"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white truncate" data-testid={`text-industry-name-${ind.slug}`}>
                      {ind.name}
                    </h3>
                    {ind.regulated && (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]" data-testid={`badge-regulated-${ind.slug}`}>
                        <Shield className="w-3 h-3 mr-0.5" /> Regulated
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ind.description}</p>
                </div>
              </div>
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-purple-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step2Category({ industrySlug, selected, onSelect }: { industrySlug: string; selected: string | null; onSelect: (cat: string) => void }) {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["/api/industries/categories", industrySlug],
    queryFn: () => api.industries.categories(industrySlug),
    enabled: !!industrySlug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white" data-testid="text-step-title">Select Category</h2>
        <p className="text-sm text-gray-400 mt-1">Choose a specialization category within your industry</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="category-grid">
        {categories.map((cat: any) => {
          const catName = typeof cat === "string" ? cat : cat.name || cat.slug;
          const catSlug = typeof cat === "string" ? cat : cat.slug || cat.name;
          const catDesc = typeof cat === "string" ? "" : cat.description || "";
          const isSelected = selected === catSlug;
          return (
            <div
              key={catSlug}
              onClick={() => onSelect(catSlug)}
              className={cn(
                "p-4 rounded-xl cursor-pointer transition-all border relative",
                isSelected
                  ? "bg-purple-600/15 border-purple-500/40 ring-1 ring-purple-500/30"
                  : "bg-[#141422]/80 border-white/[0.06] hover:border-white/[0.12] hover:bg-[#141422]"
              )}
              data-testid={`card-category-${catSlug}`}
            >
              <h3 className="text-sm font-semibold text-white" data-testid={`text-category-name-${catSlug}`}>{catName}</h3>
              {catDesc && <p className="text-xs text-gray-400 mt-1">{catDesc}</p>}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-purple-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step3Role({ industrySlug, category, selected, onSelect }: { industrySlug: string; category: string; selected: any; onSelect: (role: any) => void }) {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["/api/industries/roles", industrySlug, category],
    queryFn: () => api.industries.roles(industrySlug, category),
    enabled: !!industrySlug && !!category,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white" data-testid="text-step-title">Select Role</h2>
        <p className="text-sm text-gray-400 mt-1">Choose the role your agent will fulfill</p>
      </div>
      <div className="grid grid-cols-1 gap-3" data-testid="role-grid">
        {roles.map((role: any) => {
          const roleSlug = role.slug || role.name;
          const isSelected = selected?.slug === roleSlug || selected?.name === role.name;
          return (
            <div
              key={roleSlug}
              onClick={() => onSelect(role)}
              className={cn(
                "p-4 rounded-xl cursor-pointer transition-all border relative",
                isSelected
                  ? "bg-purple-600/15 border-purple-500/40 ring-1 ring-purple-500/30"
                  : "bg-[#141422]/80 border-white/[0.06] hover:border-white/[0.12] hover:bg-[#141422]"
              )}
              data-testid={`card-role-${roleSlug}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white" data-testid={`text-role-name-${roleSlug}`}>{role.name}</h3>
                  {role.description && <p className="text-xs text-gray-400 mt-1">{role.description}</p>}
                  {role.defaultSkills && role.defaultSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {role.defaultSkills.map((skill: string) => (
                        <Badge key={skill} className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                          <Zap className="w-2.5 h-2.5 mr-0.5" /> {skill}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {isSelected && <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step4Skills({ role, skills, onSkillsChange }: { role: any; skills: string[]; onSkillsChange: (skills: string[]) => void }) {
  const [customSkill, setCustomSkill] = useState("");
  const defaultSkills: string[] = role?.defaultSkills || [];
  const additionalSkills = [
    "Data Analysis", "Report Writing", "Code Review", "Translation",
    "Summarization", "Research", "Content Creation", "Customer Support",
    "Legal Review", "Financial Modeling", "Risk Assessment", "Compliance"
  ].filter(s => !defaultSkills.includes(s));

  const toggleSkill = (skill: string) => {
    if (skills.includes(skill)) {
      onSkillsChange(skills.filter(s => s !== skill));
    } else {
      onSkillsChange([...skills, skill]);
    }
  };

  const addCustomSkill = () => {
    const trimmed = customSkill.trim();
    if (trimmed && !skills.includes(trimmed)) {
      onSkillsChange([...skills, trimmed]);
      setCustomSkill("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white" data-testid="text-step-title">Configure Skills</h2>
        <p className="text-sm text-gray-400 mt-1">Enable or disable skills for your agent</p>
      </div>

      {defaultSkills.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-300">Default Skills</h3>
          <div className="flex flex-wrap gap-2" data-testid="default-skills">
            {defaultSkills.map((skill: string) => {
              const enabled = skills.includes(skill);
              return (
                <button
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                    enabled
                      ? "bg-purple-600/20 border-purple-500/40 text-purple-300"
                      : "bg-white/[0.04] border-white/[0.06] text-gray-500 line-through"
                  )}
                  data-testid={`chip-skill-${skill.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  {enabled ? <Check className="w-3 h-3 inline mr-1" /> : null}
                  {skill}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-300">Additional Skills</h3>
        <div className="flex flex-wrap gap-2" data-testid="additional-skills">
          {additionalSkills.map((skill) => {
            const enabled = skills.includes(skill);
            return (
              <button
                key={skill}
                onClick={() => toggleSkill(skill)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                  enabled
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                    : "bg-white/[0.04] border-white/[0.06] text-gray-400 hover:border-white/[0.12]"
                )}
                data-testid={`chip-additional-${skill.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {enabled && <Check className="w-3 h-3 inline mr-1" />}
                {skill}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-300">Custom Skill</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={customSkill}
            onChange={(e) => setCustomSkill(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomSkill()}
            placeholder="Add a custom skill..."
            className="flex-1 px-3 py-2 rounded-lg bg-[#141422]/80 border border-white/[0.06] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40"
            data-testid="input-custom-skill"
          />
          <Button
            onClick={addCustomSkill}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="button-add-skill"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {skills.filter(s => !defaultSkills.includes(s) && !additionalSkills.includes(s)).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-300">Custom Added</h3>
          <div className="flex flex-wrap gap-2" data-testid="custom-skills">
            {skills.filter(s => !defaultSkills.includes(s) && !additionalSkills.includes(s)).map((skill) => (
              <button
                key={skill}
                onClick={() => toggleSkill(skill)}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-600/20 border border-green-500/40 text-green-300 transition-all"
                data-testid={`chip-custom-${skill.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {skill}
                <X className="w-3 h-3 inline ml-1" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step5Knowledge({ industrySlug, selectedPacks, onToggle }: { industrySlug: string; selectedPacks: string[]; onToggle: (packId: string) => void }) {
  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["/api/industries/knowledge-packs", industrySlug],
    queryFn: () => api.industries.knowledgePacks(industrySlug),
    enabled: !!industrySlug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white" data-testid="text-step-title">Knowledge Sources</h2>
        <p className="text-sm text-gray-400 mt-1">Select knowledge packs to enhance your agent's capabilities</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="knowledge-grid">
        {packs.map((pack: any) => {
          const packId = pack.id?.toString() || pack.slug || pack.name;
          const isSelected = selectedPacks.includes(packId);
          return (
            <div
              key={packId}
              onClick={() => onToggle(packId)}
              className={cn(
                "p-4 rounded-xl cursor-pointer transition-all border relative",
                isSelected
                  ? "bg-purple-600/15 border-purple-500/40 ring-1 ring-purple-500/30"
                  : "bg-[#141422]/80 border-white/[0.06] hover:border-white/[0.12] hover:bg-[#141422]"
              )}
              data-testid={`card-knowledge-${packId}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white" data-testid={`text-pack-name-${packId}`}>
                    <BookOpen className="w-3.5 h-3.5 inline mr-1 text-purple-400" />
                    {pack.name}
                  </h3>
                  {pack.description && <p className="text-xs text-gray-400 mt-1">{pack.description}</p>}
                  {pack.creditCost !== undefined && (
                    <div className="flex items-center gap-1 mt-2">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span className="text-xs text-amber-400 font-medium" data-testid={`text-pack-cost-${packId}`}>
                        {pack.creditCost} credits
                      </span>
                    </div>
                  )}
                </div>
                {isSelected && <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />}
              </div>
            </div>
          );
        })}
      </div>
      {packs.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No knowledge packs available for this industry yet.
        </div>
      )}
    </div>
  );
}

function Step6Finalize({
  industry,
  role,
  skills,
  agentName,
  setAgentName,
  persona,
  setPersona,
  temperature,
  setTemperature,
  model,
  setModel,
  isSubmitting,
  onSubmit,
}: {
  industry: any;
  role: any;
  skills: string[];
  agentName: string;
  setAgentName: (v: string) => void;
  persona: string;
  setPersona: (v: string) => void;
  temperature: number;
  setTemperature: (v: number) => void;
  model: string;
  setModel: (v: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
}) {
  const systemPrompt = `You are ${agentName || "an AI agent"}, a specialized ${role?.name || "assistant"} in the ${industry?.name || "general"} industry. ${persona ? `\n\nPersona: ${persona}` : ""}\n\nSkills: ${skills.join(", ") || "General assistance"}\n\nAlways provide accurate, professional responses within your area of expertise.`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white" data-testid="text-step-title">Behavior & Finalize</h2>
        <p className="text-sm text-gray-400 mt-1">Configure your agent's behavior and create it</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Agent Name</label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="My Intelligent Entity"
            className="w-full px-3 py-2 rounded-lg bg-[#141422]/80 border border-white/[0.06] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40"
            data-testid="input-agent-name"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Persona</label>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="Describe your agent's personality and communication style..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-[#141422]/80 border border-white/[0.06] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40 resize-none"
            data-testid="textarea-persona"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            Temperature: <span className="text-purple-400">{temperature.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-purple-500"
            data-testid="slider-temperature"
          />
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Precise (0)</span>
            <span>Creative (1)</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#141422]/80 border border-white/[0.06] text-sm text-white focus:outline-none focus:border-purple-500/40"
            data-testid="select-model"
          >
            {MODELS.map((m) => (
              <option key={m} value={m} className="bg-[#141422]">{m}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">System Prompt Preview</label>
          <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/[0.06] text-xs text-gray-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto" data-testid="text-system-prompt">
            {systemPrompt}
          </div>
        </div>

        {industry?.regulated && (
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20" data-testid="disclaimer-regulated">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-400">Regulated Industry Disclaimer</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  This agent operates in a regulated industry ({industry.name}). All outputs should be reviewed by qualified professionals before making decisions. This agent does not provide official legal, medical, or financial advice.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Button
        onClick={onSubmit}
        disabled={!agentName.trim() || isSubmitting}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white font-medium py-5"
        data-testid="button-create-agent"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Creating Agent...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Create Agent
          </>
        )}
      </Button>
    </div>
  );
}

export default function AgentCreationWizard() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedIndustry, setSelectedIndustry] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [selectedKnowledgePacks, setSelectedKnowledgePacks] = useState<string[]>([]);
  const [agentName, setAgentName] = useState("");
  const [persona, setPersona] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [model, setModel] = useState("gpt-4o-mini");

  const { user } = useAuth();
  const currentUserId = user?.id || null;

  const createMutation = useMutation({
    mutationFn: async () => {
      const agentData = {
        name: agentName,
        description: `${selectedRole?.name || "AI Agent"} specializing in ${selectedIndustry?.name || "general"} - ${selectedCategory || ""}`,
        ownerId: currentUserId,
        type: "specialized",
        persona,
        model,
        temperature,
        skills,
        systemPrompt: `You are ${agentName}, a specialized ${selectedRole?.name || "assistant"} in the ${selectedIndustry?.name || "general"} industry. ${persona ? `\n\nPersona: ${persona}` : ""}\n\nSkills: ${skills.join(", ")}\n\nAlways provide accurate, professional responses within your area of expertise.`,
        industrySlug: selectedIndustry?.slug,
        category: selectedCategory,
        knowledgePacks: selectedKnowledgePacks,
      };

      const agent = await api.userAgents.create(agentData);

      if (agent?.id) {
        await api.agentProgression.setSpecialization(agent.id, {
          industrySlug: selectedIndustry?.slug,
          category: selectedCategory,
          roleSlug: selectedRole?.slug || selectedRole?.name,
          skills,
          knowledgePacks: selectedKnowledgePacks,
        });
      }

      return agent;
    },
    onSuccess: () => {
      navigate("/my-agents");
    },
  });

  const handleSelectIndustry = (ind: any) => {
    setSelectedIndustry(ind);
    setSelectedCategory(null);
    setSelectedRole(null);
    setSkills([]);
    setSelectedKnowledgePacks([]);
  };

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedRole(null);
    setSkills([]);
  };

  const handleSelectRole = (role: any) => {
    setSelectedRole(role);
    setSkills(role.defaultSkills || []);
  };

  const toggleKnowledgePack = (packId: string) => {
    setSelectedKnowledgePacks(prev =>
      prev.includes(packId) ? prev.filter(p => p !== packId) : [...prev, packId]
    );
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return !!selectedIndustry;
      case 1: return !!selectedCategory;
      case 2: return !!selectedRole;
      case 3: return skills.length > 0;
      case 4: return true;
      case 5: return !!agentName.trim();
      default: return false;
    }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-12" data-testid="page-agent-wizard">
        <div className="pt-2 pb-4">
          <StepIndicator currentStep={currentStep} />
        </div>

        <div className="min-h-[400px]">
          {currentStep === 0 && (
            <Step1Industry selected={selectedIndustry} onSelect={handleSelectIndustry} />
          )}
          {currentStep === 1 && selectedIndustry && (
            <Step2Category
              industrySlug={selectedIndustry.slug}
              selected={selectedCategory}
              onSelect={handleSelectCategory}
            />
          )}
          {currentStep === 2 && selectedIndustry && selectedCategory && (
            <Step3Role
              industrySlug={selectedIndustry.slug}
              category={selectedCategory}
              selected={selectedRole}
              onSelect={handleSelectRole}
            />
          )}
          {currentStep === 3 && (
            <Step4Skills
              role={selectedRole}
              skills={skills}
              onSkillsChange={setSkills}
            />
          )}
          {currentStep === 4 && selectedIndustry && (
            <Step5Knowledge
              industrySlug={selectedIndustry.slug}
              selectedPacks={selectedKnowledgePacks}
              onToggle={toggleKnowledgePack}
            />
          )}
          {currentStep === 5 && (
            <Step6Finalize
              industry={selectedIndustry}
              role={selectedRole}
              skills={skills}
              agentName={agentName}
              setAgentName={setAgentName}
              persona={persona}
              setPersona={setPersona}
              temperature={temperature}
              setTemperature={setTemperature}
              model={model}
              setModel={setModel}
              isSubmitting={createMutation.isPending}
              onSubmit={() => createMutation.mutate()}
            />
          )}
        </div>

        {currentStep < 5 && (
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
            <Button
              variant="ghost"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="text-gray-400 hover:text-white"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={() => setCurrentStep(Math.min(5, currentStep + 1))}
              disabled={!canProceed()}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white"
              data-testid="button-next"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {currentStep === 5 && (
          <div className="flex items-center justify-start pt-4 border-t border-white/[0.06]">
            <Button
              variant="ghost"
              onClick={() => setCurrentStep(4)}
              className="text-gray-400 hover:text-white"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
