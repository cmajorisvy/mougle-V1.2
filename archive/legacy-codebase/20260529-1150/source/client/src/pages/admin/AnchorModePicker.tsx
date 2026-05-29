import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mic, ShieldAlert, PlayCircle } from "lucide-react";

type AnchorMode =
  | "desk_anchor"
  | "walking_presenter"
  | "corner_explainer"
  | "field_reporter"
  | "data_wall_analyst"
  | "shapeshift_explainer";

interface AnchorModeDef {
  mode: AnchorMode;
  label: string;
  description: string;
  presetId: string;
  framing: string;
  promptPrefix: string;
  allowedForSensitive: boolean;
}

interface AnchorClipRow {
  id: string;
  packageId: string;
  beatIndex: number;
  mode: AnchorMode;
  presetId: string;
  clipPath: string | null;
  dryRun: boolean;
  sensitive: boolean;
  mood: string | null;
  eventType: string | null;
  framing: string | null;
  durationMs: number;
  createdAt: string;
  generationMetadata: Record<string, unknown>;
}

interface BeatDraft {
  index: number;
  text: string;
  mood: string;
  mode: AnchorMode | "auto";
}

const DEFAULT_BEATS: BeatDraft[] = [
  { index: 0, text: "Top of the broadcast — set the headline.", mood: "neutral", mode: "auto" },
  { index: 1, text: "Walk through the supporting context.", mood: "analytical", mode: "auto" },
  { index: 2, text: "Wrap with what comes next.", mood: "neutral", mode: "auto" },
];

export default function AnchorModePicker() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [packageId, setPackageId] = useState("demo-pkg-001");
  const [mood, setMood] = useState("neutral");
  const [eventType, setEventType] = useState("policy_update");
  const [sensitive, setSensitive] = useState(false);
  const [beats, setBeats] = useState<BeatDraft[]>(DEFAULT_BEATS);

  const modesQ = useQuery<{ ok: true; modes: AnchorModeDef[] }>({
    queryKey: ["/api/admin/anchor/modes"],
    queryFn: async () => {
      const r = await fetch("/api/admin/anchor/modes", { credentials: "include" });
      if (!r.ok) throw new Error(`load_modes_failed_${r.status}`);
      return r.json();
    },
  });

  const clipsQ = useQuery<{ ok: true; clips: AnchorClipRow[] }>({
    queryKey: ["/api/admin/anchor/packages", packageId, "clips"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/anchor/packages/${encodeURIComponent(packageId)}/clips`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`load_clips_failed_${r.status}`);
      return r.json();
    },
    enabled: !!packageId,
  });

  const renderMut = useMutation({
    mutationFn: async (beat: BeatDraft) => {
      const r = await fetch("/api/admin/anchor/render-beat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: { packageId, mood, eventType, sensitive },
          beat: {
            index: beat.index,
            text: beat.text,
            mood: beat.mood || null,
            modeOverride: beat.mode === "auto" ? null : beat.mode,
          },
          mode: beat.mode === "auto" ? null : beat.mode,
          dryRun: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || j.error || `render_failed_${r.status}`);
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/anchor/packages", packageId, "clips"] });
      toast({ title: "Anchor clip queued", description: "Dry-run clip stored under PRIVATE_OBJECT_DIR/anchors/." });
    },
    onError: (err: Error) => {
      toast({ title: "Render rejected", description: err.message, variant: "destructive" });
    },
  });

  const modes = modesQ.data?.modes || [];
  const clips = clipsQ.data?.clips || [];

  const blockedShapeshift = useMemo(() => {
    if (!sensitive) return false;
    return beats.some((b) => b.mode === "shapeshift_explainer");
  }, [sensitive, beats]);

  function updateBeat(index: number, patch: Partial<BeatDraft>) {
    setBeats((prev) => prev.map((b) => (b.index === index ? { ...b, ...patch } : b)));
  }

  function addBeat() {
    setBeats((prev) => [
      ...prev,
      { index: prev.length, text: "", mood: "neutral", mode: "auto" },
    ]);
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-anchor-mode-picker">
      <div className="flex items-center gap-3">
        <Mic className="w-6 h-6" />
        <h1 className="text-2xl font-semibold" data-testid="heading-anchor-picker">
          AI Anchor Director — Mode Picker
        </h1>
        <Badge variant="outline" data-testid="badge-dry-run">DRY RUN</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brief context</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="input-package-id">Package ID</Label>
            <Input
              id="input-package-id"
              data-testid="input-package-id"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="input-mood">Mood</Label>
            <Input id="input-mood" data-testid="input-mood" value={mood} onChange={(e) => setMood(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="input-event-type">Event Type</Label>
            <Input
              id="input-event-type"
              data-testid="input-event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch
              id="switch-sensitive"
              data-testid="switch-sensitive"
              checked={sensitive}
              onCheckedChange={setSensitive}
            />
            <Label htmlFor="switch-sensitive">Sensitive story</Label>
          </div>
        </CardContent>
      </Card>

      {blockedShapeshift && (
        <div
          className="flex items-center gap-2 p-3 rounded border border-destructive text-destructive"
          data-testid="warning-shapeshift-blocked"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Shapeshift Explainer is blocked on sensitive stories. The server will reject these renders.</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Beats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {beats.map((b) => {
            const isShapeshiftBlocked = sensitive && b.mode === "shapeshift_explainer";
            return (
              <div
                key={b.index}
                className="grid md:grid-cols-12 gap-3 items-start border rounded p-3"
                data-testid={`row-beat-${b.index}`}
              >
                <div className="md:col-span-1 text-sm pt-2">#{b.index}</div>
                <Textarea
                  className="md:col-span-6"
                  value={b.text}
                  data-testid={`textarea-beat-text-${b.index}`}
                  onChange={(e) => updateBeat(b.index, { text: e.target.value })}
                  placeholder="Beat text…"
                />
                <Input
                  className="md:col-span-2"
                  value={b.mood}
                  data-testid={`input-beat-mood-${b.index}`}
                  onChange={(e) => updateBeat(b.index, { mood: e.target.value })}
                  placeholder="mood override"
                />
                <Select
                  value={b.mode}
                  onValueChange={(v) => updateBeat(b.index, { mode: v as BeatDraft["mode"] })}
                >
                  <SelectTrigger className="md:col-span-2" data-testid={`select-mode-${b.index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" data-testid={`option-mode-auto-${b.index}`}>
                      auto-pick
                    </SelectItem>
                    {modes.map((m) => (
                      <SelectItem
                        key={m.mode}
                        value={m.mode}
                        data-testid={`option-mode-${m.mode}-${b.index}`}
                      >
                        {m.label}
                        {!m.allowedForSensitive ? " (non-sensitive only)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="md:col-span-1"
                  disabled={renderMut.isPending || isShapeshiftBlocked}
                  onClick={() => renderMut.mutate(b)}
                  data-testid={`button-render-beat-${b.index}`}
                >
                  {renderMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Render"}
                </Button>
              </div>
            );
          })}
          <Button variant="outline" onClick={addBeat} data-testid="button-add-beat">
            Add beat
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clips for package</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {clips.length === 0 && (
            <div className="text-sm text-muted-foreground" data-testid="text-no-clips">
              No clips yet for this package.
            </div>
          )}
          {clips.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border rounded p-3"
              data-testid={`row-clip-${c.id}`}
            >
              <Badge data-testid={`badge-clip-mode-${c.id}`}>{c.mode}</Badge>
              <Badge variant="outline">beat #{c.beatIndex}</Badge>
              {c.dryRun && <Badge variant="secondary">dryRun</Badge>}
              {c.sensitive && <Badge variant="destructive">sensitive</Badge>}
              <div className="text-xs text-muted-foreground flex-1 truncate">
                preset: {c.presetId} · framing: {c.framing} · {Math.round(c.durationMs / 100) / 10}s
              </div>
              <Button
                size="sm"
                variant="ghost"
                asChild
                data-testid={`button-preview-clip-${c.id}`}
              >
                <a
                  href={`/api/admin/anchor/clips/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <PlayCircle className="w-4 h-4 mr-1" /> Preview
                </a>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
