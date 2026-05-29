import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  EyeOff,
  Server,
  Film,
  Cpu,
  Send,
  Lock,
  Sparkles,
  Box,
  AlertCircle,
  Gauge,
} from "lucide-react";

const UNITY_SANDBOX_PATH = "/unity-sandbox/index.html";
const MAX_SANDBOX_MESSAGE_LOG = 25;

const SAFETY_BADGES: { label: string; icon: typeof ShieldCheck; testId: string }[] = [
  { label: "Admin sandbox only", icon: ShieldCheck, testId: "badge-admin-sandbox-only" },
  { label: "Same-origin only", icon: Lock, testId: "badge-same-origin-only" },
  { label: "No public URL", icon: EyeOff, testId: "badge-no-public-url" },
  { label: "No provider calls", icon: Server, testId: "badge-no-provider-calls" },
  { label: "No render execution", icon: Film, testId: "badge-no-render-execution" },
  { label: "No Unreal execution", icon: Cpu, testId: "badge-no-unreal-execution" },
  { label: "No 4D hardware", icon: Sparkles, testId: "badge-no-4d-hardware" },
  { label: "No publishing", icon: Send, testId: "badge-no-publishing" },
  { label: "Static local build only", icon: Box, testId: "badge-static-local-build-only" },
];

const SandboxMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("unity:ready"),
    buildId: z.string().max(128).optional(),
    unityVersion: z.string().max(64).optional(),
  }),
  z.object({
    type: z.literal("unity:status"),
    fps: z.number().nonnegative().max(240).optional(),
    memoryMb: z.number().nonnegative().max(2048).optional(),
    message: z.string().max(280).optional(),
  }),
  z.object({
    type: z.literal("unity:error"),
    code: z.string().max(64).optional(),
    message: z.string().max(280),
  }),
]);

type SandboxMessage = z.infer<typeof SandboxMessageSchema>;

type SandboxLogEntry = {
  ts: number;
  kind: "accepted" | "dropped";
  reason?: string;
  type?: string;
  origin?: string;
};

export default function UnityWebGLSandbox() {
  const { isAuthenticated, isAuthorized, isLoading } = useAdminAuth({
    redirectTo: "/admin/login",
  });
  const [embedActive, setEmbedActive] = useState(false);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [lastAccepted, setLastAccepted] = useState<SandboxMessage | null>(null);
  const [log, setLog] = useState<SandboxLogEntry[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const expectedOrigin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );

  const pushLog = useCallback((entry: SandboxLogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, MAX_SANDBOX_MESSAGE_LOG));
  }, []);

  useEffect(() => {
    if (!embedActive) return;
    function onMessage(event: MessageEvent) {
      const fromIframe = iframeRef.current?.contentWindow === event.source;
      if (!fromIframe) {
        pushLog({
          ts: Date.now(),
          kind: "dropped",
          reason: "source-not-iframe",
          origin: event.origin,
        });
        // Audit-log drop (no DB row in R8 — table requires separate approval).
        // eslint-disable-next-line no-console
        console.warn("[unity-sandbox] dropped message: source not iframe", {
          origin: event.origin,
        });
        return;
      }
      if (event.origin !== expectedOrigin) {
        pushLog({
          ts: Date.now(),
          kind: "dropped",
          reason: "origin-mismatch",
          origin: event.origin,
        });
        // eslint-disable-next-line no-console
        console.warn("[unity-sandbox] dropped message: origin mismatch", {
          origin: event.origin,
          expected: expectedOrigin,
        });
        return;
      }
      const parsed = SandboxMessageSchema.safeParse(event.data);
      if (!parsed.success) {
        pushLog({
          ts: Date.now(),
          kind: "dropped",
          reason: "schema-invalid",
          origin: event.origin,
        });
        // eslint-disable-next-line no-console
        console.warn("[unity-sandbox] dropped message: schema invalid", {
          issues: parsed.error.issues.slice(0, 3),
        });
        return;
      }
      setLastAccepted(parsed.data);
      pushLog({
        ts: Date.now(),
        kind: "accepted",
        type: parsed.data.type,
        origin: event.origin,
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedActive, expectedOrigin, pushLog]);

  // Hard cap: tear down iframe on unmount.
  useEffect(() => {
    return () => {
      setEmbedActive(false);
    };
  }, []);

  const handleToggleEmbed = useCallback((next: boolean) => {
    setEmbedActive(next);
    setLastAccepted(null);
    if (next) setIframeNonce((n) => n + 1);
  }, []);

  if (isLoading || !isAuthenticated || !isAuthorized) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm text-muted-foreground"
        data-testid="text-admin-auth-checking"
      >
        Verifying admin access…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
          <Badge
            variant="outline"
            className="border-fuchsia-500/40 text-fuchsia-300"
            data-testid="badge-r8-phase"
          >
            R8 · Unity sandbox · Admin-only
          </Badge>
        </div>

        <Card data-testid="card-unity-sandbox-header">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Cpu className="h-5 w-5 text-fuchsia-400" />
                  Unity WebGL Sandbox
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin-only sandboxed iframe slot for a future Unity WebGL build.
                  R8 ships the shell only — no Unity build is committed. Same-origin
                  iframe, locked <code>sandbox</code> attribute, strict postMessage
                  allow-list (origin + Zod schema). No public surface, no provider
                  call, no production embed.
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-300"
                data-testid="badge-dry-run"
              >
                <ShieldAlert className="mr-1 h-3 w-3" />
                Sandbox only
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2" data-testid="safety-badges">
              {SAFETY_BADGES.map(({ label, icon: Icon, testId }) => (
                <Badge
                  key={testId}
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300"
                  data-testid={testId}
                >
                  <Icon className="mr-1 h-3 w-3" />
                  {label}
                </Badge>
              ))}
            </div>

            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-muted/20 px-3 py-2"
              data-testid="embed-controls"
            >
              <div className="flex items-center gap-3">
                <Switch
                  id="toggle-unity-embed"
                  checked={embedActive}
                  onCheckedChange={handleToggleEmbed}
                  data-testid="switch-unity-embed"
                />
                <Label htmlFor="toggle-unity-embed" className="cursor-pointer text-sm">
                  Mount sandboxed iframe (<code className="text-xs">{UNITY_SANDBOX_PATH}</code>)
                </Label>
              </div>
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="text-expected-origin"
              >
                Expected origin: <code>{expectedOrigin || "(unknown)"}</code>
              </span>
            </div>

            {embedActive ? (
              <iframe
                key={iframeNonce}
                ref={iframeRef}
                src={UNITY_SANDBOX_PATH}
                title="Unity WebGL Sandbox"
                sandbox="allow-scripts allow-same-origin"
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-[480px] w-full rounded border border-border bg-black"
                data-testid="iframe-unity-sandbox"
              />
            ) : (
              <div
                className="flex h-[480px] w-full items-center justify-center rounded border border-dashed border-border bg-muted/30 text-sm text-muted-foreground"
                data-testid="text-iframe-inactive"
              >
                Iframe inactive. Toggle to mount the sandboxed Unity WebGL slot.
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div
                className="rounded border border-border bg-muted/20 p-3 text-xs"
                data-testid="panel-last-message"
              >
                <div className="mb-1 flex items-center gap-2 text-foreground">
                  <Gauge className="h-3.5 w-3.5" />
                  <strong>Last accepted message</strong>
                </div>
                {lastAccepted ? (
                  <pre
                    className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground"
                    data-testid="text-last-message"
                  >
                    {JSON.stringify(lastAccepted, null, 2)}
                  </pre>
                ) : (
                  <span className="text-muted-foreground" data-testid="text-last-message-empty">
                    No message accepted yet. The placeholder slot does not ship a
                    Unity build, so no <code>postMessage</code> traffic is expected
                    until a build is dropped into <code>client/public/unity-sandbox/</code>.
                  </span>
                )}
              </div>
              <div
                className="rounded border border-border bg-muted/20 p-3 text-xs"
                data-testid="panel-message-log"
              >
                <div className="mb-1 flex items-center gap-2 text-foreground">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <strong>Message log (last {MAX_SANDBOX_MESSAGE_LOG})</strong>
                </div>
                {log.length === 0 ? (
                  <span className="text-muted-foreground" data-testid="text-log-empty">
                    Empty.
                  </span>
                ) : (
                  <ul className="space-y-1" data-testid="list-message-log">
                    {log.map((entry, idx) => (
                      <li
                        key={`${entry.ts}-${idx}`}
                        className={
                          entry.kind === "accepted"
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }
                        data-testid={`log-entry-${entry.kind}-${idx}`}
                      >
                        [{new Date(entry.ts).toLocaleTimeString()}] {entry.kind}
                        {entry.type ? ` · ${entry.type}` : ""}
                        {entry.reason ? ` · ${entry.reason}` : ""}
                        {entry.origin ? ` · ${entry.origin}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 rounded border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div data-testid="text-sandbox-notes">
                <strong className="text-foreground">Sandbox model:</strong> iframe{" "}
                <code>sandbox="allow-scripts allow-same-origin"</code> only · no{" "}
                <code>allow-popups</code> · no <code>allow-top-navigation</code> · no{" "}
                <code>allow-forms</code> · no <code>allow-modals</code> · no{" "}
                <code>allow-downloads</code> · same-origin <code>src</code> only.
              </div>
              <div data-testid="text-message-contract">
                <strong className="text-foreground">postMessage contract:</strong>{" "}
                <code>event.origin === window.location.origin</code>, source ===
                iframe contentWindow, payload validated by a Zod{" "}
                <code>discriminatedUnion</code> over{" "}
                <code>unity:ready | unity:status | unity:error</code>. Anything else
                is dropped silently and logged (admin UI + <code>console.warn</code>).
              </div>
              <div data-testid="text-budget-notes">
                <strong className="text-foreground">Budget:</strong> one iframe at a
                time · closed on route unmount · documented memory budget ≤ 512 MB ·
                FPS cap 30 (Unity build setting) · referrerPolicy <code>no-referrer</code>.
              </div>
              <div data-testid="text-safety-note">
                <strong className="text-foreground">Safety envelope:</strong>{" "}
                publicUrl=null · signedUrl=null · realSendAllowed=false ·
                executionEnabled=false. No provider/env secret access. No external
                Unity URL loading. No asset-pipeline integration (R5 production_assets
                wiring is a later task).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
