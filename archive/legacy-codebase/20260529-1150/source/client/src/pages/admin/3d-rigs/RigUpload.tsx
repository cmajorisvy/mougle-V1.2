import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Upload, Globe, PersonStanding } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RigSafetyBadges } from "./safety-badges";

const LICENSE_HINTS = [
  "unknown",
  "internal_only",
  "cc0",
  "cc_by",
  "proprietary_licensed",
  "unlicensed_rejected",
] as const;

type Feedback =
  | { kind: "idle" }
  | { kind: "pending"; message: string }
  | { kind: "error"; message: string; reason?: string }
  | { kind: "success"; rigId: string; name: string };

export default function RigUpload() {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [licenseHint, setLicenseHint] = useState<string>("unknown");
  const [licenseSource, setLicenseSource] = useState("");
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");
  const [urlLicenseHint, setUrlLicenseHint] = useState<string>("unknown");
  const [urlLicenseSource, setUrlLicenseSource] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFeedback({ kind: "error", message: "Please choose a .glb or .gltf file." });
      return;
    }
    setFeedback({ kind: "pending", message: "Uploading…" });
    const form = new FormData();
    form.append("file", file);
    if (name.trim()) form.append("name", name.trim());
    if (licenseHint) form.append("licenseHint", licenseHint);
    if (licenseSource.trim()) form.append("licenseSource", licenseSource.trim());

    try {
      const csrfRes = await fetch("/api/auth/csrf-token", { credentials: "include" });
      let csrf = "";
      try {
        const j = await csrfRes.json();
        csrf = j?.csrfToken ?? "";
      } catch {
        csrf = "";
      }
      const res = await fetch("/api/admin/production-rigs/upload", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-CSRF-Token": csrf } : undefined,
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setFeedback({
          kind: "error",
          message: json?.message || `Upload failed (HTTP ${res.status})`,
          reason: json?.reason || json?.error,
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/production-rigs"] });
      setFeedback({ kind: "success", rigId: json.rig.id, name: json.rig.name });
    } catch (err: any) {
      setFeedback({ kind: "error", message: err?.message || "Upload failed" });
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !urlName.trim()) {
      setFeedback({ kind: "error", message: "URL and name are required." });
      return;
    }
    setFeedback({ kind: "pending", message: "Importing…" });
    try {
      const res = await apiRequest("POST", "/api/admin/production-rigs/import-from-url", {
        url: url.trim(),
        name: urlName.trim(),
        licenseHint: urlLicenseHint,
        licenseSource: urlLicenseSource.trim() || undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setFeedback({
          kind: "error",
          message: json?.message || `Import failed (HTTP ${res.status})`,
          reason: json?.reason || json?.error,
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/production-rigs"] });
      setFeedback({ kind: "success", rigId: json.rig.id, name: json.rig.name });
    } catch (err: any) {
      setFeedback({ kind: "error", message: err?.message || "Import failed" });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-3d-rigs-upload">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/3d-rigs">
            <Button variant="ghost" size="sm" data-testid="button-back-to-list">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to library
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <PersonStanding className="h-5 w-5 text-fuchsia-400" />
              Upload avatar rig
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              GLB or GLTF · max 25 MB · validator runs before any byte or DB row is written.
            </p>
          </CardHeader>
          <CardContent>
            <RigSafetyBadges />

            {feedback.kind !== "idle" && (
              <div
                className={`mb-4 rounded border px-3 py-2 text-sm ${
                  feedback.kind === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : feedback.kind === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive-foreground"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
                data-testid="text-validator-feedback"
              >
                {feedback.kind === "pending" && <span>{feedback.message}</span>}
                {feedback.kind === "error" && (
                  <span>
                    <strong>Failed:</strong> {feedback.message}
                    {feedback.reason ? (
                      <>
                        {" · "}
                        <code>{feedback.reason}</code>
                      </>
                    ) : null}
                  </span>
                )}
                {feedback.kind === "success" && (
                  <span>
                    <strong>Created:</strong> {feedback.name}{" "}
                    <Button
                      variant="link"
                      size="sm"
                      className="px-1"
                      onClick={() => navigate(`/admin/3d-rigs/${feedback.rigId}`)}
                      data-testid="link-go-to-detail"
                    >
                      Open detail →
                    </Button>
                  </span>
                )}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <form onSubmit={handleUpload} className="space-y-3 rounded border border-border p-4" data-testid="form-file-upload">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Upload className="h-4 w-4" /> File upload
                </div>
                <div>
                  <Label htmlFor="input-file">.glb or .gltf file</Label>
                  <Input
                    id="input-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                    data-testid="input-file"
                  />
                </div>
                <div>
                  <Label htmlFor="input-upload-name">Display name (optional)</Label>
                  <Input
                    id="input-upload-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Defaults to filename"
                    data-testid="input-upload-name"
                  />
                </div>
                <div>
                  <Label htmlFor="select-upload-license">License hint</Label>
                  <Select value={licenseHint} onValueChange={setLicenseHint}>
                    <SelectTrigger id="select-upload-license" data-testid="select-upload-license">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LICENSE_HINTS.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="input-upload-license-source">License source (optional)</Label>
                  <Input
                    id="input-upload-license-source"
                    value={licenseSource}
                    onChange={(e) => setLicenseSource(e.target.value)}
                    placeholder="URL or note"
                    data-testid="input-upload-license-source"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={feedback.kind === "pending"}
                  data-testid="button-upload"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Button>
              </form>

              <form onSubmit={handleImport} className="space-y-3 rounded border border-border p-4" data-testid="form-url-import">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4" /> Import from URL
                </div>
                <div>
                  <Label htmlFor="input-url">HTTPS URL</Label>
                  <Input
                    id="input-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/rig.glb"
                    type="url"
                    data-testid="input-url"
                  />
                </div>
                <div>
                  <Label htmlFor="input-url-name">Display name</Label>
                  <Input
                    id="input-url-name"
                    value={urlName}
                    onChange={(e) => setUrlName(e.target.value)}
                    data-testid="input-url-name"
                  />
                </div>
                <div>
                  <Label htmlFor="select-url-license">License hint</Label>
                  <Select value={urlLicenseHint} onValueChange={setUrlLicenseHint}>
                    <SelectTrigger id="select-url-license" data-testid="select-url-license">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LICENSE_HINTS.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="input-url-license-source">License source (optional)</Label>
                  <Input
                    id="input-url-license-source"
                    value={urlLicenseSource}
                    onChange={(e) => setUrlLicenseSource(e.target.value)}
                    placeholder="URL or note"
                    data-testid="input-url-license-source"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  variant="secondary"
                  disabled={feedback.kind === "pending"}
                  data-testid="button-import-url"
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </form>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              <Badge variant="outline" className="mr-2">Validator</Badge>
              Checks: GLB magic, version, length, chunks; ≤25 MB; ≤200 nodes/meshes; ≤2000
              accessors/bufferViews; no required extensions; no external image URIs.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
