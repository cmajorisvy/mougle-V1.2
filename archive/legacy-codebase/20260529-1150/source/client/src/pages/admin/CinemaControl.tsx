import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, ShieldAlert, ShieldCheck, Film, Mic2, Sparkles, Clapperboard, Cpu, Wind } from "lucide-react";

type ProjectType = "newsroom" | "podcast_room" | "avatar_scene" | "debate_room" | "interview_room";
type ProjectStatus = "draft" | "preview_ready" | "approved" | "blocked";
type Project = {
  id: string;
  title: string;
  projectType: ProjectType;
  status: ProjectStatus;
  safetyStatus: "safe" | "needs_review" | "blocked";
  sceneManifestStatus: "not_generated" | "generated" | "stale";
  cueManifestStatus: "not_generated" | "generated" | "stale";
  approvalNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Readiness = {
  ok: true;
  readiness: {
    openai: boolean; elevenlabs: boolean; meshy: boolean; runway: boolean;
    unrealRemote: boolean; fourDBridge: boolean; webhookSecret: boolean;
  };
  featureFlags: Record<string, boolean>;
  safetyEnvelope: Record<string, boolean>;
};

const PROJECT_TYPES: ProjectType[] = ["newsroom", "podcast_room", "avatar_scene", "debate_room", "interview_room"];

export default function CinemaControl() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<ProjectType>("newsroom");
  const [topic, setTopic] = useState("AI safety briefing");
  const [host, setHost] = useState("Mougle Host");
  const [guest, setGuest] = useState("");
  const [sceneManifest, setSceneManifest] = useState<any>(null);
  const [cueManifest, setCueManifest] = useState<any>(null);
  const [scriptPreview, setScriptPreview] = useState<any>(null);
  const [voicePreview, setVoicePreview] = useState<any>(null);
  const [meshyPreview, setMeshyPreview] = useState<any>(null);
  const [runwayPreview, setRunwayPreview] = useState<any>(null);

  const readinessQ = useQuery<Readiness>({
    queryKey: ["/api/admin/cinema/readiness"],
    queryFn: async () => {
      const res = await fetch("/api/admin/cinema/readiness", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const projectsQ = useQuery<{ ok: true; projects: Project[] }>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const selected = projectsQ.data?.projects.find((p) => p.id === selectedId) ?? null;

  const createMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/projects", { title: newTitle, projectType: newType });
      return r.json() as Promise<{ project: Project }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedId(r.project.id);
      setNewTitle("");
      toast({ title: "Project created", description: r.project.title });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const sceneMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a project first");
      const body: any = { projectId: selected.id, topic };
      if (selected.projectType === "podcast_room" || selected.projectType === "interview_room") {
        body.podcast = { host, guest: guest || null };
      }
      const r = await apiRequest("POST", "/api/scene-manifest", body);
      return r.json();
    },
    onSuccess: (r) => {
      setSceneManifest(r.manifest);
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Scene manifest generated (preview only)" });
    },
    onError: (e: Error) => toast({ title: "Scene gen failed", description: e.message, variant: "destructive" }),
  });

  const cueMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a project first");
      const cues = [
        {
          timeMs: 0,
          cueType: "intro_swell",
          effects: { lights: { preset: "neutral", intensity: 0.6 }, audioHit: { preset: "transition_swell" } },
        },
        {
          timeMs: 8500,
          cueType: "breaking_news_alert",
          effects: {
            lights: { preset: "red_flash", intensity: 0.8 },
            vibration: { intensity: 0.5, durationMs: 1200 },
            wind: { intensity: 0.25, durationMs: 1500 },
            fog: { enabled: true, durationMs: 800 },
            scent: { preset: "none" },
            audioHit: { preset: "breaking_news_bass" },
          },
        },
      ];
      const r = await apiRequest("POST", "/api/4d-cue-manifest", { projectId: selected.id, cues });
      return r.json();
    },
    onSuccess: (r) => {
      setCueManifest(r.manifest);
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "4D cue manifest generated (preview only)" });
    },
    onError: (e: Error) => toast({ title: "Cue gen failed", description: e.message, variant: "destructive" }),
  });

  const scriptMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/script/generate", { topic, projectId: selected?.id });
      return r.json();
    },
    onSuccess: (r) => { setScriptPreview(r.script); toast({ title: "Mock script generated" }); },
    onError: (e: Error) => toast({ title: "Script failed", description: e.message, variant: "destructive" }),
  });

  const voiceMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/voice/generate", { provider: "elevenlabs", text: topic, projectId: selected?.id });
      return r.json();
    },
    onSuccess: (r) => { setVoicePreview(r.voice); toast({ title: "Mock voice plan generated" }); },
    onError: (e: Error) => toast({ title: "Voice failed", description: e.message, variant: "destructive" }),
  });

  const meshyMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/assets/meshy", { assetPrompt: topic, assetKind: "prop", projectId: selected?.id });
      return r.json();
    },
    onSuccess: (r) => { setMeshyPreview(r.assetRequest); toast({ title: "Mock Meshy request planned" }); },
    onError: (e: Error) => toast({ title: "Meshy failed", description: e.message, variant: "destructive" }),
  });

  const runwayMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/video/runway", { videoPrompt: topic, durationSec: 4, projectId: selected?.id });
      return r.json();
    },
    onSuccess: (r) => { setRunwayPreview(r.videoRequest); toast({ title: "Mock Runway request planned" }); },
    onError: (e: Error) => toast({ title: "Runway failed", description: e.message, variant: "destructive" }),
  });

  const approvalMut = useMutation({
    mutationFn: async (status: ProjectStatus) => {
      if (!selected) throw new Error("Select a project first");
      const r = await apiRequest("POST", `/api/projects/${selected.id}/approval`, { status, notes: null });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Approval status updated" });
    },
  });

  const exportJson = (data: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container max-w-7xl py-6 space-y-4" data-testid="page-cinema-control">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Clapperboard className="w-6 h-6" /> 4D Cinema Control
            <Badge variant="outline" data-testid="badge-preview-only">Preview-only MVP</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Mock generators for newsroom / podcast / avatar / debate / interview scenes.
            No real Unreal or 4D hardware commands are sent. No public publishing.
          </p>
        </div>
      </div>

      <ReadinessCard q={readinessQ} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1" data-testid="card-projects">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Film className="w-4 h-4" /> Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <Input
                placeholder="Project title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-project-title"
              />
              <Select value={newType} onValueChange={(v) => setNewType(v as ProjectType)}>
                <SelectTrigger data-testid="select-project-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!newTitle.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
                data-testid="button-create-project"
              >
                {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                Create project
              </Button>
            </div>

            <div className="border-t border-border pt-2 space-y-1 max-h-72 overflow-auto">
              {projectsQ.data?.projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left rounded border border-border p-2 hover:bg-muted ${selectedId === p.id ? "bg-muted" : ""}`}
                  data-testid={`button-select-project-${p.id}`}
                >
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Badge variant="outline">{p.projectType}</Badge>
                    <Badge variant={p.status === "approved" ? "default" : p.status === "blocked" ? "destructive" : "secondary"}>
                      {p.status}
                    </Badge>
                  </div>
                </button>
              ))}
              {projectsQ.data && projectsQ.data.projects.length === 0 && (
                <div className="text-xs text-muted-foreground" data-testid="text-no-projects">
                  No projects yet. Create one above to start.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="card-workbench">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Workbench</CardTitle>
            {selected && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-selected-type">{selected.projectType}</Badge>
                <Badge data-testid="badge-selected-status">{selected.status}</Badge>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selected && (
              <div className="text-muted-foreground" data-testid="text-pick-project">
                Pick a project on the left to start generating preview manifests.
              </div>
            )}
            {selected && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Topic / episode title</label>
                    <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} data-testid="input-topic" />
                  </div>
                  {(selected.projectType === "podcast_room" || selected.projectType === "interview_room") && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Host</label>
                        <Input value={host} onChange={(e) => setHost(e.target.value)} data-testid="input-host" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Guest (optional)</label>
                        <Input value={guest} onChange={(e) => setGuest(e.target.value)} data-testid="input-guest" />
                      </div>
                    </div>
                  )}
                </div>

                <Tabs defaultValue="scene">
                  <TabsList>
                    <TabsTrigger value="scene" data-testid="tab-scene">Scene</TabsTrigger>
                    <TabsTrigger value="cues" data-testid="tab-cues">4D cues</TabsTrigger>
                    <TabsTrigger value="providers" data-testid="tab-providers">Mock providers</TabsTrigger>
                    <TabsTrigger value="approval" data-testid="tab-approval">Approval</TabsTrigger>
                  </TabsList>

                  <TabsContent value="scene" className="space-y-2">
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => sceneMut.mutate()} disabled={sceneMut.isPending} data-testid="button-generate-scene">
                        {sceneMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                        Generate scene preview
                      </Button>
                      {sceneManifest && (
                        <Button size="sm" variant="outline" onClick={() => exportJson(sceneManifest, `${selected.id}-scene.json`)} data-testid="button-export-scene">
                          Export JSON
                        </Button>
                      )}
                    </div>
                    {sceneManifest && (
                      <pre className="text-xs bg-muted p-2 rounded max-h-96 overflow-auto" data-testid="pre-scene-manifest">
                        {JSON.stringify(sceneManifest, null, 2)}
                      </pre>
                    )}
                  </TabsContent>

                  <TabsContent value="cues" className="space-y-2">
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => cueMut.mutate()} disabled={cueMut.isPending} data-testid="button-generate-cues">
                        {cueMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                        Generate 4D cue manifest
                      </Button>
                      {cueManifest && (
                        <Button size="sm" variant="outline" onClick={() => exportJson(cueManifest, `${selected.id}-cues.json`)} data-testid="button-export-cues">
                          Export JSON
                        </Button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Wind className="w-3 h-3" /> Cues are validated server-side; unsafe values (intensity &gt; 1, duration &gt; 30 s, bad LED hex) are rejected.
                    </div>
                    {cueManifest && (
                      <pre className="text-xs bg-muted p-2 rounded max-h-96 overflow-auto" data-testid="pre-cue-manifest">
                        {JSON.stringify(cueManifest, null, 2)}
                      </pre>
                    )}
                  </TabsContent>

                  <TabsContent value="providers" className="space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Button size="sm" variant="outline" onClick={() => scriptMut.mutate()} disabled={scriptMut.isPending} data-testid="button-script">
                        <Sparkles className="w-3.5 h-3.5 mr-1" /> Mock script
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => voiceMut.mutate()} disabled={voiceMut.isPending} data-testid="button-voice">
                        <Mic2 className="w-3.5 h-3.5 mr-1" /> Mock voice
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => meshyMut.mutate()} disabled={meshyMut.isPending} data-testid="button-meshy">
                        <Cpu className="w-3.5 h-3.5 mr-1" /> Mock Meshy
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => runwayMut.mutate()} disabled={runwayMut.isPending} data-testid="button-runway">
                        <Film className="w-3.5 h-3.5 mr-1" /> Mock Runway
                      </Button>
                    </div>
                    {scriptPreview && <pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-auto" data-testid="pre-script">{JSON.stringify(scriptPreview, null, 2)}</pre>}
                    {voicePreview && <pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-auto" data-testid="pre-voice">{JSON.stringify(voicePreview, null, 2)}</pre>}
                    {meshyPreview && <pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-auto" data-testid="pre-meshy">{JSON.stringify(meshyPreview, null, 2)}</pre>}
                    {runwayPreview && <pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-auto" data-testid="pre-runway">{JSON.stringify(runwayPreview, null, 2)}</pre>}
                  </TabsContent>

                  <TabsContent value="approval" className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" onClick={() => approvalMut.mutate("approved")} data-testid="button-mark-approved">
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Mark approved for future Unreal test
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Marks the project APPROVED. Still no real command will be sent in this MVP.</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="destructive" onClick={() => approvalMut.mutate("blocked")} data-testid="button-mark-blocked">
                        <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Mark blocked
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => approvalMut.mutate("preview_ready")} data-testid="button-mark-preview-ready">
                        Mark preview ready
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" disabled data-testid="button-execute-unreal-disabled">
                            <Shield className="w-3.5 h-3.5 mr-1" /> Execute on Unreal (disabled, future / manual)
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Disabled in this MVP. Requires founder-approved feature flag + WEBHOOK_SECRET.</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" disabled data-testid="button-execute-4d-disabled">
                            <Shield className="w-3.5 h-3.5 mr-1" /> Fire 4D hardware (disabled, future / manual)
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Disabled in this MVP. Requires founder-approved feature flag + WEBHOOK_SECRET.</TooltipContent>
                      </Tooltip>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReadinessCard({ q }: { q: ReturnType<typeof useQuery<Readiness>> }) {
  return (
    <Card data-testid="card-readiness">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4" /> Provider & safety readiness
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {q.isLoading && <div className="text-muted-foreground">Loading…</div>}
        {q.isError && <div className="text-red-400">{(q.error as Error)?.message}</div>}
        {q.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(q.data.readiness).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded border border-border px-2 py-1" data-testid={`readiness-${k}`}>
                <span className="text-muted-foreground">{k}</span>
                <Badge variant={v ? "default" : "secondary"}>{v ? "configured" : "missing"}</Badge>
              </div>
            ))}
            {Object.entries(q.data.featureFlags).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded border border-border px-2 py-1" data-testid={`flag-${k}`}>
                <span className="text-muted-foreground">{k}</span>
                <Badge variant={v ? "default" : "outline"}>{v ? "on" : "off"}</Badge>
              </div>
            ))}
            <div className="col-span-full text-muted-foreground text-[11px]" data-testid="text-safety-note">
              Safety envelope: publicPublishing=false · youtubeUpload=false · socialPosting=false · autonomousExecution=false · manualRootAdminTriggerOnly=true · internalAdminReviewOnly=true. No secret values are read or displayed.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
