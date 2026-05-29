import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type AdminLiveStudioDebateSummary, type AdminLiveStudioDisplayStatus, type AdminLiveStudioState } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Clock,
  FileText,
  Gavel,
  Loader2,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  UserX,
} from "lucide-react";

function statusClass(status: AdminLiveStudioDisplayStatus | string) {
  if (status === "live") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "paused") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (status === "ended" || status === "archived") return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
  if (status === "scheduled") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  return "bg-violet-500/10 text-violet-300 border-violet-500/20";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return value <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(2);
}

function labelFor(value: string | null | undefined) {
  return (value || "unknown").replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function DebateListItem({
  debate,
  selected,
  onSelect,
}: {
  debate: AdminLiveStudioDebateSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected ? "border-cyan-500/40 bg-cyan-500/[0.08]" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.14]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{debate.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{debate.topic} - {debate.format}</p>
        </div>
        <Badge className={statusClass(debate.displayStatus)}>{debate.displayStatus}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500">
        <span>{debate.activeParticipantCount}/{debate.participantCount} active</span>
        <span>{debate.transcriptTurnCount} turns</span>
        <span>TCS {formatScore(debate.tcsAverage)}</span>
      </div>
    </button>
  );
}

function SpeakerCard({
  participant,
  label,
}: {
  participant: AdminLiveStudioState["stage"]["currentSpeaker"];
  label: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      {participant ? (
        <div className="mt-3 flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-200">
            {participant.avatar ? (
              <img src={participant.avatar} alt="" className="h-11 w-11 rounded-lg object-cover" />
            ) : (
              <Bot className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{participant.displayName}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {labelFor(participant.participantType)} - {labelFor(participant.position || participant.role)}
            </p>
            {participant.ues && (
              <p className="mt-2 text-xs text-cyan-300">
                UES {formatScore(participant.ues.UES)} - {participant.ues.collapseRisk}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No active speaker selected</p>
      )}
    </div>
  );
}

function MetricsStrip({ state }: { state: AdminLiveStudioState }) {
  const metrics = [
    ["TCS", formatScore(state.metrics.tcsAverage)],
    ["UES", formatScore(state.metrics.uesAverage)],
    ["Claims", state.metrics.claimsCount],
    ["Evidence", state.metrics.evidenceCount],
    ["Turns", state.metrics.transcriptTurnCount],
    ["Round", `${state.debate.currentRound}/${state.debate.totalRounds}`],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {metrics.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="mt-1 text-lg font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

function StageView({
  state,
  actionReason,
  setActionReason,
  onPause,
  onResume,
  onEnd,
  onEject,
  isMutating,
}: {
  state: AdminLiveStudioState;
  actionReason: string;
  setActionReason: (value: string) => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onEject: (participantId: number) => void;
  isMutating: boolean;
}) {
  const canPause = state.debate.displayStatus !== "paused" && state.debate.displayStatus !== "ended" && state.debate.displayStatus !== "archived";
  const canResume = state.debate.displayStatus !== "live" && state.debate.displayStatus !== "ended" && state.debate.displayStatus !== "archived";
  const canEnd = state.debate.displayStatus !== "ended" && state.debate.displayStatus !== "archived";

  return (
    <Card className="border-white/[0.08] bg-[#10101a]/90 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-300" />
            <h2 className="text-lg font-semibold text-white">{state.debate.title}</h2>
            <Badge className={statusClass(state.debate.displayStatus)}>{state.debate.displayStatus}</Badge>
            <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">Admin Studio</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{state.debate.description || state.debate.topic}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onPause}
            disabled={!canPause || isMutating}
            className="border-yellow-500/20 text-yellow-200"
          >
            <PauseCircle className="mr-2 h-4 w-4" /> Pause
          </Button>
          <Button
            variant="outline"
            onClick={onResume}
            disabled={!canResume || isMutating}
            className="border-emerald-500/20 text-emerald-200"
          >
            <PlayCircle className="mr-2 h-4 w-4" /> Resume
          </Button>
          <Button
            variant="outline"
            onClick={onEnd}
            disabled={!canEnd || isMutating}
            className="border-red-500/20 text-red-200"
          >
            <Square className="mr-2 h-4 w-4" /> End
          </Button>
        </div>
      </div>

      {state.safeMode.banners.length > 0 && (
        <div className="mt-5 space-y-2">
          {state.safeMode.banners.map((banner) => (
            <div key={banner} className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.06] p-3 text-sm text-yellow-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{banner}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <SpeakerCard participant={state.stage.currentSpeaker} label="Current Speaker" />
            <SpeakerCard participant={state.stage.nextSpeaker} label="Next Speaker" />
          </div>

          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-cyan-300" />
                <div>
                  <p className="text-sm font-medium text-white">Turn Timer</p>
                  <p className="text-xs text-zinc-500">Display-only simulation</p>
                </div>
              </div>
              <p className="text-3xl font-semibold text-white">{state.stage.timer.remainingSeconds}s</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-cyan-400"
                style={{ width: `${Math.max(0, Math.min(100, (state.stage.timer.elapsedSeconds / Math.max(1, state.stage.timer.turnDurationSeconds)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="mt-4">
            <MetricsStrip state={state} />
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">Control Reason</p>
          <Textarea
            value={actionReason}
            onChange={(event) => setActionReason(event.target.value)}
            placeholder="Optional reason for pause, resume, end, or eject."
            className="mt-3 min-h-24 border-white/[0.08] bg-[#090912] text-white"
          />
          <div className="mt-4 space-y-2">
            {state.participants.map((participant) => (
              <div key={participant.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 p-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-100">{participant.displayName}</p>
                  <p className="text-[11px] text-zinc-500">{participant.isActive ? "active" : "removed"} - {labelFor(participant.participantType)}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!participant.isActive || isMutating}
                  onClick={() => onEject(participant.id)}
                  className="h-8 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                >
                  <UserX className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TranscriptPanel({ state }: { state: AdminLiveStudioState }) {
  const turnsByRound = state.transcript.reduce<Record<number, AdminLiveStudioState["transcript"]>>((acc, turn) => {
    acc[turn.roundNumber] = [...(acc[turn.roundNumber] || []), turn];
    return acc;
  }, {});

  return (
    <Card className="border-white/[0.08] bg-[#10101a]/90 p-5">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-violet-300" />
        <h2 className="text-lg font-semibold text-white">Transcript</h2>
      </div>
      <div className="mt-4 max-h-[520px] space-y-4 overflow-y-auto pr-1">
        {state.transcript.length === 0 ? (
          <p className="text-sm text-zinc-500">No transcript turns have been captured yet.</p>
        ) : Object.entries(turnsByRound).map(([round, turns]) => (
          <div key={round} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Round {round}</p>
            <div className="mt-3 space-y-3">
              {turns.map((turn) => (
                <div key={turn.id} className="border-l border-cyan-500/30 pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-zinc-100">{turn.participantName}</p>
                    <Badge className="border-white/[0.08] bg-white/[0.04] text-zinc-300">Turn {turn.turnOrder}</Badge>
                    {typeof turn.tcsScore === "number" && (
                      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">TCS {formatScore(turn.tcsScore)}</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{turn.content}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EvidencePanel({ state }: { state: AdminLiveStudioState }) {
  return (
    <Card className="border-white/[0.08] bg-[#10101a]/90 p-5">
      <div className="flex items-center gap-2">
        <Gavel className="h-5 w-5 text-emerald-300" />
        <h2 className="text-lg font-semibold text-white">Claims / Evidence</h2>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Only linked claim and evidence records are displayed.</p>

      <div className="mt-4 space-y-3">
        {state.evidence.claims.length === 0 && state.evidence.legacyClaims.length === 0 && (
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-zinc-500">No linked claims were found for this debate.</p>
        )}
        {state.evidence.claims.map((claim) => (
          <div key={claim.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusClass(claim.status)}>{claim.status}</Badge>
              <Badge className="border-white/[0.08] bg-white/[0.04] text-zinc-300">confidence {formatScore(claim.confidenceScore)}</Badge>
              <Badge className="border-white/[0.08] bg-white/[0.04] text-zinc-300">evidence {formatScore(claim.evidenceStrength)}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-200">{claim.statement}</p>
          </div>
        ))}
        {state.evidence.legacyClaims.map((claim) => (
          <div key={claim.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <Badge className="border-zinc-500/20 bg-zinc-500/10 text-zinc-300">legacy claim</Badge>
            <p className="mt-2 text-sm leading-6 text-zinc-200">{claim.statement}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-semibold text-white">Evidence References</p>
        {[...state.evidence.evidence, ...state.evidence.legacyEvidence].slice(0, 8).map((item) => (
          <div key={item.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <p className="text-sm text-zinc-300">{item.content || item.label || item.sourceUrl || item.url}</p>
            {(item.sourceUrl || item.url) && <p className="mt-1 break-all text-xs text-zinc-500">{item.sourceUrl || item.url}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MougleSummaryPanel({ state }: { state: AdminLiveStudioState }) {
  return (
    <Card className="border-white/[0.08] bg-[#10101a]/90 p-5">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-cyan-300" />
        <h2 className="text-lg font-semibold text-white">MOUGLE Summary</h2>
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-300">
        {state.mougleSummary.consensusSummary || "No MOUGLE synthesis has been stored for this debate yet."}
      </p>
      {state.mougleSummary.disagreementSummary && (
        <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.05] p-3">
          <p className="text-xs uppercase tracking-wide text-yellow-300">Open disagreements / risks</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{state.mougleSummary.disagreementSummary}</p>
        </div>
      )}
      <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-zinc-400">
        Confidence: {formatScore(state.mougleSummary.confidenceScore)}
      </div>
    </Card>
  );
}

export default function LiveDebateStudio() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const { toast } = useToast();
  const [selectedDebateId, setSelectedDebateId] = useState<number | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [question, setQuestion] = useState("");
  const [questionAuthor, setQuestionAuthor] = useState("admin");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/admin/login", { replace: true });
      return;
    }
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const debatesQuery = useQuery({
    queryKey: ["admin-live-studio-debates"],
    queryFn: () => api.admin.liveStudioDebates(75),
    enabled: isRootAdmin,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!selectedDebateId && debatesQuery.data?.length) {
      setSelectedDebateId(debatesQuery.data[0].id);
    }
  }, [debatesQuery.data, selectedDebateId]);

  const stateQuery = useQuery({
    queryKey: ["admin-live-studio-state", selectedDebateId],
    queryFn: () => api.admin.liveStudioState(selectedDebateId!),
    enabled: isRootAdmin && !!selectedDebateId,
    refetchInterval: 15000,
  });

  const selectedSummary = useMemo(
    () => debatesQuery.data?.find((debate) => debate.id === selectedDebateId) || null,
    [debatesQuery.data, selectedDebateId],
  );

  function updateStateCache(state: AdminLiveStudioState) {
    queryClient.setQueryData(["admin-live-studio-state", state.debate.id], state);
    queryClient.invalidateQueries({ queryKey: ["admin-live-studio-debates"] });
    setActionReason("");
  }

  const pauseMutation = useMutation({
    mutationFn: (id: number) => api.admin.pauseLiveStudioDebate(id, actionReason.trim() || undefined),
    onSuccess: (state) => {
      updateStateCache(state);
      toast({ title: "Debate paused" });
    },
    onError: (err: Error) => toast({ title: "Pause failed", description: err.message, variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: number) => api.admin.resumeLiveStudioDebate(id, actionReason.trim() || undefined),
    onSuccess: (state) => {
      updateStateCache(state);
      toast({ title: "Debate resumed" });
    },
    onError: (err: Error) => toast({ title: "Resume failed", description: err.message, variant: "destructive" }),
  });

  const endMutation = useMutation({
    mutationFn: (id: number) => api.admin.endLiveStudioDebate(id, actionReason.trim() || undefined),
    onSuccess: (state) => {
      updateStateCache(state);
      toast({ title: "Debate ended" });
    },
    onError: (err: Error) => toast({ title: "End failed", description: err.message, variant: "destructive" }),
  });

  const ejectMutation = useMutation({
    mutationFn: ({ id, participantId }: { id: number; participantId: number }) =>
      api.admin.ejectLiveStudioParticipant(id, participantId, actionReason.trim() || undefined),
    onSuccess: (state) => {
      updateStateCache(state);
      toast({ title: "Participant removed from stage" });
    },
    onError: (err: Error) => toast({ title: "Remove failed", description: err.message, variant: "destructive" }),
  });

  const questionMutation = useMutation({
    mutationFn: (id: number) => api.admin.addLiveStudioQuestion(id, {
      question: question.trim(),
      authorLabel: questionAuthor.trim() || "admin",
      reason: actionReason.trim() || undefined,
    }),
    onSuccess: (result) => {
      updateStateCache(result.state);
      setQuestion("");
      toast({ title: "Question captured", description: result.message });
    },
    onError: (err: Error) => toast({ title: "Question action failed", description: err.message, variant: "destructive" }),
  });

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060611] text-zinc-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading...
      </div>
    );
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  const state = stateQuery.data;
  const isMutating = pauseMutation.isPending || resumeMutation.isPending || endMutation.isPending || ejectMutation.isPending || questionMutation.isPending;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <button onClick={() => navigate("/admin/dashboard")} className="mb-4 flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Radio className="h-8 w-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Live Debate Studio</h1>
                <Badge className="border-yellow-500/20 bg-yellow-500/15 text-yellow-300">Founder Only</Badge>
                <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">Admin Control MVP</Badge>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-zinc-500">
                Monitor debate stage state, transcript, claims, evidence, and manual session controls without streaming or autonomous execution.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/digital-world")} className="border-white/10 text-zinc-300">
                Digital World
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/news-to-debate")} className="border-white/10 text-zinc-300">
                News-to-Debate
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/safe-mode")} className="border-white/10 text-zinc-300">
                Safe Mode
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  debatesQuery.refetch();
                  stateQuery.refetch();
                }}
                disabled={debatesQuery.isFetching || stateQuery.isFetching}
                className="border-white/10 text-zinc-300"
              >
                {debatesQuery.isFetching || stateQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <Card className="border-white/[0.08] bg-[#10101a]/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Studio Debates</h2>
                <p className="text-xs text-zinc-500">{debatesQuery.data?.length || 0} sessions</p>
              </div>
              {debatesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
            </div>
            <div className="mt-4 max-h-[680px] space-y-2 overflow-y-auto pr-1">
              {debatesQuery.isLoading && (
                <div className="flex items-center justify-center py-10 text-sm text-zinc-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading debates...
                </div>
              )}
              {debatesQuery.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {(debatesQuery.error as Error).message}
                </div>
              )}
              {debatesQuery.data?.map((debate) => (
                <DebateListItem
                  key={debate.id}
                  debate={debate}
                  selected={debate.id === selectedDebateId}
                  onSelect={() => setSelectedDebateId(debate.id)}
                />
              ))}
              {!debatesQuery.isLoading && debatesQuery.data?.length === 0 && (
                <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-zinc-500">No debates found yet.</p>
              )}
            </div>
          </Card>
        </aside>

        <section className="space-y-6">
          {selectedSummary && !state && stateQuery.isLoading && (
            <div className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#10101a]/90 py-24 text-zinc-400">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading studio state...
            </div>
          )}

          {stateQuery.error && (
            <Card className="border-red-500/20 bg-red-500/10 p-4 text-red-200">
              {(stateQuery.error as Error).message || "Unable to load studio state."}
            </Card>
          )}

          {state && (
            <>
              <StageView
                state={state}
                actionReason={actionReason}
                setActionReason={setActionReason}
                onPause={() => pauseMutation.mutate(state.debate.id)}
                onResume={() => resumeMutation.mutate(state.debate.id)}
                onEnd={() => {
                  if (confirm("End this debate session?")) endMutation.mutate(state.debate.id);
                }}
                onEject={(participantId) => {
                  if (confirm("Remove this participant from the active stage?")) {
                    ejectMutation.mutate({ id: state.debate.id, participantId });
                  }
                }}
                isMutating={isMutating}
              />

              <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
                <TranscriptPanel state={state} />
                <div className="space-y-6">
                  <MougleSummaryPanel state={state} />
                  <Card className="border-white/[0.08] bg-[#10101a]/90 p-5">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-pink-300" />
                      <h2 className="text-lg font-semibold text-white">Admin Question Placeholder</h2>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">Audit-only in this phase. Persistent queue storage is deferred.</p>
                    <Input
                      value={questionAuthor}
                      onChange={(event) => setQuestionAuthor(event.target.value)}
                      placeholder="Author label"
                      className="mt-4 border-white/[0.08] bg-[#090912] text-white"
                    />
                    <Textarea
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder="Add an admin question for later review."
                      className="mt-3 min-h-28 border-white/[0.08] bg-[#090912] text-white"
                    />
                    <Button
                      onClick={() => questionMutation.mutate(state.debate.id)}
                      disabled={question.trim().length === 0 || isMutating}
                      className="mt-4 bg-pink-600 hover:bg-pink-700"
                    >
                      {questionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Capture Question
                    </Button>
                  </Card>
                </div>
              </div>

              <EvidencePanel state={state} />

              <Card className="border-white/[0.08] bg-[#10101a]/90 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-300" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">Phase 28 Safety Boundary</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      This studio is admin-only monitoring and manual control. It does not add public mutation routes, autonomous streams,
                      OBS/RTMP/YouTube live publishing, autonomous agent execution, paid audience questions, private memory access, or marketplace/money changes.
                    </p>
                    <p className="mt-3 text-xs text-zinc-600">Created {formatDate(state.debate.createdAt)} - Last refreshed {formatDate(state.generatedAt)}</p>
                  </div>
                </div>
              </Card>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
