import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserSquare2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DEFAULT_ROOM_KINDS,
  PermanentAvatarSafetyBadges,
  ROLE_PRESETS,
} from "./shared";

type ApprovedAsset = { id: string; name: string };
type ApprovedRig = { id: string; name: string };

type AssetListResponse = { ok: boolean; items: ApprovedAsset[] };
type RigListResponse = { ok: boolean; items: ApprovedRig[] };

const ASSETS_URL =
  "/api/admin/production-assets?status=active&approvalGate=approved_internal&limit=200";
const RIGS_URL =
  "/api/admin/production-rigs?status=active&approvalGate=approved_internal&limit=200";

export default function PermanentAvatarCreate() {
  const [, navigate] = useLocation();

  const { data: assetsData, isLoading: assetsLoading } = useQuery<AssetListResponse>({
    queryKey: [ASSETS_URL],
  });
  const { data: rigsData, isLoading: rigsLoading } = useQuery<RigListResponse>({
    queryKey: [RIGS_URL],
  });

  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [personaSummary, setPersonaSummary] = useState("");
  const [rolePreset, setRolePreset] = useState<string>("custom");
  const [voiceProfileHint, setVoiceProfileHint] = useState("");
  const [languageHint, setLanguageHint] = useState("");
  const [bodyAssetId, setBodyAssetId] = useState<string>("");
  const [rigId, setRigId] = useState<string>("");
  const [defaultRoomKind, setDefaultRoomKind] = useState<string>("");
  const [defaultRoomId, setDefaultRoomId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !slug.trim() || !bodyAssetId || !rigId) {
      setError({ message: "Display name, slug, body asset, and rig are required." });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body: Record<string, any> = {
        displayName: displayName.trim(),
        slug: slug.trim(),
        personaSummary: personaSummary.trim(),
        rolePreset,
        voiceProfileHint: voiceProfileHint.trim(),
        languageHint: languageHint.trim(),
        bodyAssetId,
        rigId,
      };
      if (defaultRoomKind) body.defaultRoomKind = defaultRoomKind;
      if (defaultRoomId.trim()) body.defaultRoomId = defaultRoomId.trim();

      const res = await apiRequest("POST", "/api/admin/permanent-avatars", body);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError({
          message: json?.message || `Create failed (HTTP ${res.status})`,
          reason: json?.reason || json?.error,
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/permanent-avatars"] });
      navigate(`/admin/permanent-avatars/${json.avatar.id}`);
    } catch (err: any) {
      setError({ message: err?.message || "Create failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-permanent-avatars-create">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/permanent-avatars">
            <Button variant="ghost" size="sm" data-testid="button-back-to-list">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to library
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <UserSquare2 className="h-5 w-5 text-fuchsia-400" />
              New permanent avatar
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Bind one approved body asset and one approved rig. Pair-validity is verified
              server-side; duplicate (asset, rig) pairs are rejected with HTTP 409.
            </p>
          </CardHeader>
          <CardContent>
            <PermanentAvatarSafetyBadges />

            {error && (
              <div
                className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
                data-testid="text-create-error"
              >
                <strong>Failed:</strong> {error.message}
                {error.reason ? <> · <code>{error.reason}</code></> : null}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <section className="space-y-3 rounded border border-border p-4">
                <h3 className="text-sm font-semibold">Identity</h3>
                <div>
                  <Label htmlFor="input-display-name">Display name</Label>
                  <Input
                    id="input-display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    data-testid="input-display-name"
                  />
                </div>
                <div>
                  <Label htmlFor="input-slug">Slug</Label>
                  <Input
                    id="input-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="lowercase-kebab"
                    data-testid="input-slug"
                  />
                </div>
                <div>
                  <Label htmlFor="select-role-preset">Role preset</Label>
                  <Select value={rolePreset} onValueChange={setRolePreset}>
                    <SelectTrigger id="select-role-preset" data-testid="select-role-preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_PRESETS.map((r) => (
                        <SelectItem key={r} value={r} data-testid={`select-role-preset-option-${r}`}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="input-persona-summary">Persona summary</Label>
                  <Textarea
                    id="input-persona-summary"
                    value={personaSummary}
                    onChange={(e) => setPersonaSummary(e.target.value)}
                    rows={3}
                    placeholder="≤ 1000 chars"
                    data-testid="input-persona-summary"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="input-voice-profile-hint">Voice profile hint</Label>
                    <Input
                      id="input-voice-profile-hint"
                      value={voiceProfileHint}
                      onChange={(e) => setVoiceProfileHint(e.target.value)}
                      placeholder="Free-text hint only (not a provider voice id)"
                      data-testid="input-voice-profile-hint"
                    />
                  </div>
                  <div>
                    <Label htmlFor="input-language-hint">Language hint</Label>
                    <Input
                      id="input-language-hint"
                      value={languageHint}
                      onChange={(e) => setLanguageHint(e.target.value)}
                      placeholder="BCP-47 hint (e.g. en-US)"
                      data-testid="input-language-hint"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded border border-border p-4">
                <h3 className="text-sm font-semibold">Bound assets (approved internal only)</h3>
                <div>
                  <Label htmlFor="select-body-asset">Body asset</Label>
                  <Select value={bodyAssetId} onValueChange={setBodyAssetId}>
                    <SelectTrigger id="select-body-asset" data-testid="select-body-asset">
                      <SelectValue placeholder={assetsLoading ? "Loading approved assets…" : "Choose an approved body asset"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(assetsData?.items ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id} data-testid={`select-body-asset-option-${a.id}`}>
                          {a.name} · {a.id.slice(0, 8)}…
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="select-rig">Rig</Label>
                  <Select value={rigId} onValueChange={setRigId}>
                    <SelectTrigger id="select-rig" data-testid="select-rig">
                      <SelectValue placeholder={rigsLoading ? "Loading approved rigs…" : "Choose an approved rig"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(rigsData?.items ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id} data-testid={`select-rig-option-${r.id}`}>
                          {r.name} · {r.id.slice(0, 8)}…
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section className="space-y-3 rounded border border-border p-4">
                <h3 className="text-sm font-semibold">Default room (optional)</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="select-default-room-kind">Default room kind</Label>
                    <Select
                      value={defaultRoomKind || "__none"}
                      onValueChange={(v) => setDefaultRoomKind(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger id="select-default-room-kind" data-testid="select-default-room-kind">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none" data-testid="select-default-room-kind-option-none">(none)</SelectItem>
                        {DEFAULT_ROOM_KINDS.map((r) => (
                          <SelectItem key={r} value={r} data-testid={`select-default-room-kind-option-${r}`}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="input-default-room-id">Default room ID (soft FK)</Label>
                    <Input
                      id="input-default-room-id"
                      value={defaultRoomId}
                      onChange={(e) => setDefaultRoomId(e.target.value)}
                      placeholder="optional"
                      data-testid="input-default-room-id"
                    />
                  </div>
                </div>
              </section>

              <Button type="submit" disabled={pending} data-testid="button-submit-create">
                <Plus className="mr-2 h-4 w-4" />
                {pending ? "Creating…" : "Create permanent avatar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
