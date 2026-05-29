import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { COMPLIANCE_EMAIL_SCHEDULE_URL, buildComplianceEmailSchedulePayload } from "../omni-channel-audience-forms";
import { EmailSchedule, EmailRun, PLATFORMS, FailureAlertSnoozeControls } from "./_shared";

export function ScheduledComplianceEmailCard() {
  const qc = useQueryClient();
  const scheduleQuery = useQuery<{ schedule: EmailSchedule; runs: EmailRun[] }>({
    queryKey: ["/api/admin/newsroom/audience/email-schedule"],
  });

  const [enabled, setEnabled] = useState(false);
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [recipientsText, setRecipientsText] = useState("");
  const [platform, setPlatform] = useState<string>("");
  const [productionIdFilter, setProductionIdFilter] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const s = scheduleQuery.data?.schedule;
    if (s && !hydrated) {
      setEnabled(s.enabled);
      setCadence(s.cadence);
      setRecipientsText(s.recipients.join(", "));
      setPlatform(s.platform ?? "");
      setProductionIdFilter(s.productionId ?? "");
      setHydrated(true);
    }
  }, [scheduleQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildComplianceEmailSchedulePayload({
        enabled,
        cadence,
        recipientsText,
        platform,
        productionIdFilter,
      });
      return await apiRequest(
        "PUT",
        COMPLIANCE_EMAIL_SCHEDULE_URL,
        payload,
      );
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: [COMPLIANCE_EMAIL_SCHEDULE_URL] });
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/newsroom/audience/email-schedule/preview");
      return (await res.json()) as {
        preview: {
          windowFrom: string;
          windowTo: string;
          subject: string;
          html: string;
          recipients: string[];
          attachments: Array<{ filename: string; sizeBytes: number }>;
          messageCount: number;
          decisionCount: number;
          commandCount: number;
          connectorCount: number;
        };
      };
    },
    onSuccess: () => {
      setSaveError(null);
      setPreviewOpen(true);
    },
    onError: (e: any) => setSaveError(e?.message ?? "preview failed"),
  });
  const preview = previewMutation.data?.preview;

  const [sendTestResult, setSendTestResult] = useState<string | null>(null);
  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/email-schedule/preview/send-test",
      );
      return (await res.json()) as { recipient: string; run: { runId: string; status: string } };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setSendTestResult(
        data.run.status === "success"
          ? `Test sent to ${data.recipient}`
          : `Send failed for ${data.recipient}`,
      );
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/email-schedule"] });
    },
    onError: (e: any) => {
      setSendTestResult(null);
      setSaveError(e?.message ?? "send test failed");
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/newsroom/audience/email-schedule/run-now");
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/email-schedule"] });
    },
    onError: (e: any) => setSaveError(e?.message ?? "run failed"),
  });

  const schedule = scheduleQuery.data?.schedule;
  const runs = scheduleQuery.data?.runs ?? [];

  const failureAlertQuery = useQuery<{
    alert: {
      id: number | string;
      message: string;
      createdAt: string;
      details: Record<string, any>;
    } | null;
    snooze: {
      snoozeUntil: string | null;
      updatedAt: string | null;
      updatedBy: string | null;
    };
  }>({
    queryKey: [
      "/api/admin/newsroom/audience/email-schedule/failure-alert",
    ],
    refetchInterval: 60_000,
  });
  const failureAlert = failureAlertQuery.data?.alert ?? null;
  const failureSnooze = failureAlertQuery.data?.snooze ?? null;

  return (
    <Card data-testid="card-email-schedule" id="audit-trail-email">
      <CardHeader>
        <CardTitle>Scheduled Compliance Email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {failureAlert && (
          <div
            className="rounded border border-destructive/60 bg-destructive/10 p-3 space-y-1 text-sm"
            data-testid="banner-audit-trail-email-failure-alert"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="destructive">delivery failing</Badge>
              <span className="font-medium">
                Audit-trail compliance email is failing
              </span>
              <span className="text-xs text-muted-foreground">
                opened {new Date(failureAlert.createdAt).toLocaleString()}
              </span>
            </div>
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-audit-trail-email-failure-alert-message"
            >
              {failureAlert.message}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Auto-clears as soon as the next scheduled run succeeds. The
              founder dashboard and root admins were also notified by email.
            </p>
          </div>
        )}
        <FailureAlertSnoozeControls
          testIdPrefix="audit-trail-email-failure-alert"
          snoozeUntil={failureSnooze?.snoozeUntil ?? null}
          endpoint="/api/admin/newsroom/audience/email-schedule/failure-alert/snooze"
          invalidateKey="/api/admin/newsroom/audience/email-schedule/failure-alert"
          historyEndpoint="/api/admin/newsroom/audience/email-schedule/failure-alert/snooze-history"
        />
        <p className="text-xs text-muted-foreground">
          Automatically email the audience moderation audit trail (JSON + CSV
          attached) to your compliance / legal team on a fixed cadence. The
          window covers the previous period. Recipients are root-admin only and
          no platform API is called.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-schedule-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Cadence</span>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as "weekly" | "monthly")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-schedule-cadence"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Platform filter (optional)</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-schedule-platform"
            >
              <option value="">All</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Production ID (optional)</span>
            <Input
              value={productionIdFilter}
              onChange={(e) => setProductionIdFilter(e.target.value)}
              data-testid="input-schedule-production"
              placeholder="any"
            />
          </label>
        </div>
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">Recipients (comma or space separated)</span>
          <Input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            data-testid="input-schedule-recipients"
            placeholder="compliance@example.com, legal@example.com"
          />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-schedule-save"
          >
            {saveMutation.isPending ? "Saving…" : "Save schedule"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
            data-testid="button-schedule-preview"
          >
            {previewMutation.isPending ? "Loading…" : "Preview"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runNowMutation.mutate()}
            disabled={runNowMutation.isPending || !schedule || schedule.recipients.length === 0}
            data-testid="button-schedule-run-now"
          >
            {runNowMutation.isPending ? "Sending…" : "Send now"}
          </Button>
          {schedule?.nextRunAt && (
            <Badge variant="outline" data-testid="badge-schedule-next-run">
              Next: {new Date(schedule.nextRunAt).toLocaleString()}
            </Badge>
          )}
          {schedule?.lastRunStatus && (
            <Badge
              variant={schedule.lastRunStatus === "success" ? "default" : "destructive"}
              data-testid="badge-schedule-last-status"
            >
              Last: {schedule.lastRunStatus}
            </Badge>
          )}
          {saveError && (
            <span className="text-xs text-destructive" data-testid="text-schedule-error">{saveError}</span>
          )}
        </div>
        {schedule?.lastRunError && (
          <div
            className="text-xs text-destructive rounded border border-destructive/40 bg-destructive/5 p-2"
            data-testid="text-schedule-last-error"
          >
            Last error: {schedule.lastRunError}
          </div>
        )}
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">Recent runs</div>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-runs">No runs yet.</p>
          ) : (
            <div className="space-y-1">
              {runs.map((r) => (
                <div
                  key={r.runId}
                  className="flex items-center justify-between text-xs rounded border p-2"
                  data-testid={`row-run-${r.runId}`}
                >
                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                    <Badge variant="outline">{r.cadence}</Badge>
                    <Badge variant="outline">{r.triggeredBy}</Badge>
                    {r.isTest && (
                      <Badge
                        variant="secondary"
                        data-testid={`badge-test-${r.runId}`}
                      >
                        test
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {new Date(r.startedAt).toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      msgs:{r.messageCount} · dec:{r.decisionCount} · cmd:{r.commandCount}
                    </span>
                  </div>
                  <div className="text-muted-foreground truncate max-w-[40%]">
                    {r.errorMessage ?? r.recipients.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
          data-testid="dialog-schedule-preview"
        >
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
            <DialogDescription>
              Rendered HTML body for the currently saved schedule. Nothing was
              sent. Window covers the previous {schedule?.cadence ?? "period"}.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="flex-1 overflow-auto space-y-3">
              <div className="text-xs space-y-1" data-testid="text-preview-meta">
                <div>
                  <span className="text-muted-foreground">Subject:</span>{" "}
                  <span className="font-medium">{preview.subject}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Window:</span>{" "}
                  <span className="font-mono">
                    {new Date(preview.windowFrom).toLocaleString()} →{" "}
                    {new Date(preview.windowTo).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Recipients:</span>{" "}
                  {preview.recipients.length === 0
                    ? <span className="italic text-muted-foreground">none configured</span>
                    : preview.recipients.join(", ")}
                </div>
                <div className="flex gap-2 flex-wrap pt-1">
                  <Badge variant="outline">connectors: {preview.connectorCount}</Badge>
                  <Badge variant="outline">messages: {preview.messageCount}</Badge>
                  <Badge variant="outline">decisions: {preview.decisionCount}</Badge>
                  <Badge variant="outline">commands: {preview.commandCount}</Badge>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">
                  Attachments ({preview.attachments.length})
                </div>
                <div className="space-y-1">
                  {preview.attachments.map((a) => (
                    <div
                      key={a.filename}
                      className="flex items-center justify-between text-xs rounded border p-2"
                      data-testid={`row-preview-attachment-${a.filename}`}
                    >
                      <span className="font-mono truncate">{a.filename}</span>
                      <span className="text-muted-foreground ml-2 shrink-0">
                        {(a.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Rendered HTML</div>
                <iframe
                  title="Audit email preview"
                  data-testid="iframe-preview-html"
                  sandbox=""
                  srcDoc={preview.html}
                  className="w-full h-[420px] rounded border bg-white"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendTestMutation.mutate()}
                  disabled={sendTestMutation.isPending}
                  data-testid="button-send-test-to-me"
                >
                  {sendTestMutation.isPending ? "Sending…" : "Send test to me"}
                </Button>
                {sendTestResult && (
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="text-send-test-result"
                  >
                    {sendTestResult}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Preview only · "Send test to me" emails this rendered payload to
                your admin address only (not the configured recipients) ·
                platformSendAllowed:false · realSendAllowed:false
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No preview loaded.</p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
