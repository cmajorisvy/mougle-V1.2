/**
 * Continuous Newsroom Scheduler — Autopilot 24/7 loop (MVP).
 *
 * SAFETY:
 *   - Default DISABLED. Requires AUTOPILOT_NEWSROOM_ENABLED=1 + an explicit
 *     start() call from a root-admin route.
 *   - No DB writes. No provider calls. No FFmpeg / Remotion / Unreal /
 *     4D-hardware execution. Pure planning + decision evaluation.
 *   - SIGTERM-safe: registers a stopper with the shutdown registry so
 *     rolling Replit Deployments don't leave a cycle in flight.
 *   - All exposed state is non-secret. No bucket IDs, no API keys.
 */

import { randomUUID } from "crypto";
import {
  type AutopilotAuditEvent,
  type AutopilotMode,
  type AutopilotPlayoutItem,
  type AutopilotQueueItem,
  type AutopilotSettings,
  type ContinuousNewsroomSchedule,
  AutopilotSettingsSchema,
  DEFAULT_SETTINGS,
  FALLBACK_NO_UPDATE,
  SAFETY_ENVELOPE,
} from "../../../shared/autopilot-newsroom";
import { registerShutdown } from "../shutdown-registry";
import {
  evaluateAutopilotEligibility,
  type AutopilotStoryInput,
} from "./autopilotDecisionService.helpers";
import {
  dispatchNext as playoutDispatchNext,
  expireStaleItems as playoutExpire,
  isKillSwitchActive as playoutKillSwitchActive,
} from "../playout-queue-service";

/* ------------------------------------------------------------------ */
/* In-memory state (MVP — no DB)                                       */
/* ------------------------------------------------------------------ */

const state: {
  settings: AutopilotSettings;
  schedule: ContinuousNewsroomSchedule;
  queue: AutopilotQueueItem[];
  playout: AutopilotPlayoutItem[];
  audit: AutopilotAuditEvent[];
  timer: NodeJS.Timeout | null;
  running: boolean;
  shutdownRegistered: boolean;
} = {
  settings: { ...DEFAULT_SETTINGS },
  schedule: {
    enabled: false,
    mode: "manual",
    cycleIntervalMs: DEFAULT_SETTINGS.cycleIntervalMs,
    maxItemsPerCycle: DEFAULT_SETTINGS.maxItemsPerCycle,
    lastCycleAt: null,
    lastCycleProcessed: 0,
    consecutiveFailures: 0,
  },
  queue: [],
  playout: [],
  audit: [],
  timer: null,
  running: false,
  shutdownRegistered: false,
};

/* ------------------------------------------------------------------ */
/* Feature-flag helpers                                                */
/* ------------------------------------------------------------------ */

export function isAutopilotFeatureEnabled(): boolean {
  return process.env.AUTOPILOT_NEWSROOM_ENABLED === "1";
}
export function isInternalPlayoutFeatureEnabled(): boolean {
  return process.env.AUTOPILOT_INTERNAL_PLAYOUT_ENABLED === "1";
}
export function isPublicPublishFeatureEnabled(): boolean {
  // Permanently false in this MVP. The env var is ignored; we always return false.
  return false;
}
export function isProviderCallsAllowed(): boolean {
  return process.env.AUTOPILOT_ALLOW_PROVIDER_CALLS === "1";
}
export function isUnrealSendAllowed(): boolean {
  // Permanently false in this MVP.
  return false;
}
export function is4DSendAllowed(): boolean {
  // Permanently false in this MVP.
  return false;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

function recordAudit(
  action: string,
  actor: string,
  detail: string,
  storyId: string | null = null,
): AutopilotAuditEvent {
  const ev: AutopilotAuditEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    storyId,
    mode: state.settings.mode,
    detail: detail.slice(0, 400),
  };
  state.audit.push(ev);
  if (state.audit.length > 2000) state.audit.splice(0, state.audit.length - 2000);
  return ev;
}

/* ------------------------------------------------------------------ */
/* Settings + kill switch                                              */
/* ------------------------------------------------------------------ */

export function getSettings(): AutopilotSettings {
  return { ...state.settings };
}

export function updateSettings(
  patch: Partial<AutopilotSettings>,
  actor = "root_admin",
): AutopilotSettings {
  const next = AutopilotSettingsSchema.parse({ ...state.settings, ...patch });
  // Public publish mode is permanently rejected.
  if (next.mode === "autopilot_public_publish") {
    throw new Error("autopilot_public_publish is permanently disabled in this MVP");
  }
  state.settings = next;
  state.schedule.mode = next.mode;
  state.schedule.cycleIntervalMs = next.cycleIntervalMs;
  state.schedule.maxItemsPerCycle = next.maxItemsPerCycle;
  recordAudit("settings_updated", actor, `mode=${next.mode} kill=${next.killSwitchEngaged}`);
  if (next.killSwitchEngaged && state.timer) stop("root_admin", "kill_switch_engaged");
  return { ...next };
}

export function engageKillSwitch(actor: string, reason: string): void {
  state.settings.killSwitchEngaged = true;
  recordAudit("kill_switch_engaged", actor, reason);
  if (state.timer) stop(actor, "kill_switch");
}

/* ------------------------------------------------------------------ */
/* Scheduler                                                           */
/* ------------------------------------------------------------------ */

export interface SchedulerStatus {
  settings: AutopilotSettings;
  schedule: ContinuousNewsroomSchedule;
  envelope: typeof SAFETY_ENVELOPE;
  flags: {
    autopilotFeatureEnabled: boolean;
    internalPlayoutFeatureEnabled: boolean;
    publicPublishFeatureEnabled: boolean; // always false
    providerCallsAllowed: boolean;
    unrealSendAllowed: boolean; // always false
    fourDSendAllowed: boolean; // always false
  };
  running: boolean;
  queueSize: number;
  playoutCount: number;
  auditCount: number;
}

export function getStatus(): SchedulerStatus {
  return {
    settings: { ...state.settings },
    schedule: { ...state.schedule },
    envelope: SAFETY_ENVELOPE,
    flags: {
      autopilotFeatureEnabled: isAutopilotFeatureEnabled(),
      internalPlayoutFeatureEnabled: isInternalPlayoutFeatureEnabled(),
      publicPublishFeatureEnabled: isPublicPublishFeatureEnabled(),
      providerCallsAllowed: isProviderCallsAllowed(),
      unrealSendAllowed: isUnrealSendAllowed(),
      fourDSendAllowed: is4DSendAllowed(),
    },
    running: state.running,
    queueSize: state.queue.length,
    playoutCount: state.playout.length,
    auditCount: state.audit.length,
  };
}

export interface StartResult {
  ok: boolean;
  reason?: string;
  status: SchedulerStatus;
}

export function start(actor: string, fetchPending: () => AutopilotStoryInput[] = () => []): StartResult {
  if (state.settings.killSwitchEngaged) {
    return { ok: false, reason: "kill_switch_engaged", status: getStatus() };
  }
  if (state.settings.mode === "manual") {
    return { ok: false, reason: "mode_is_manual", status: getStatus() };
  }
  if (!isAutopilotFeatureEnabled()) {
    return { ok: false, reason: "feature_flag_disabled", status: getStatus() };
  }
  if (state.settings.mode === "autopilot_internal_playout" && !isInternalPlayoutFeatureEnabled()) {
    return { ok: false, reason: "internal_playout_feature_flag_disabled", status: getStatus() };
  }
  if (state.timer) {
    return { ok: true, reason: "already_running", status: getStatus() };
  }
  if (!state.shutdownRegistered) {
    registerShutdown("continuousNewsroomScheduler", () => {
      stop("shutdown_registry", "sigterm");
    });
    state.shutdownRegistered = true;
  }
  state.schedule.enabled = true;
  state.running = true;
  recordAudit("scheduler_started", actor, `mode=${state.settings.mode}`);
  const tick = async () => {
    try {
      const pending = fetchPending().slice(0, state.settings.maxItemsPerCycle);
      let processed = 0;
      for (const story of pending) {
        const decision = evaluateAutopilotEligibility(story, state.settings);
        if (decision.eligible) {
          queueStoryForPlayout(story);
        } else {
          recordAudit(
            "story_blocked",
            "scheduler",
            decision.reasons.slice(0, 3).join("; "),
            story.storyId,
          );
        }
        processed += 1;
      }
      state.schedule.lastCycleAt = new Date().toISOString();
      state.schedule.lastCycleProcessed = processed;
      state.schedule.consecutiveFailures = 0;
      if (processed === 0 && state.settings.fallbackEnabled) {
        enqueueFallback();
      }
      // T8 — drive the playout channel state. Kill switch hard-stops dispatch.
      try {
        playoutExpire();
        if (!playoutKillSwitchActive()) {
          await playoutDispatchNext("GLOBAL", "scheduler");
        }
      } catch (e) {
        recordAudit("playout_dispatch_failed", "scheduler", String((e as Error)?.message || e).slice(0, 200));
      }
    } catch (err) {
      state.schedule.consecutiveFailures += 1;
      recordAudit("cycle_failed", "scheduler", String((err as Error)?.message || err).slice(0, 200));
    }
  };
  // Kick off first tick immediately, then on interval.
  void tick();
  state.timer = setInterval(tick, state.schedule.cycleIntervalMs);
  return { ok: true, status: getStatus() };
}

export function stop(actor: string, reason: string): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.running = false;
  state.schedule.enabled = false;
  recordAudit("scheduler_stopped", actor, reason);
}

export function _resetForTests(): void {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  state.queue = [];
  state.playout = [];
  state.audit = [];
  state.settings = { ...DEFAULT_SETTINGS };
  state.schedule = {
    enabled: false,
    mode: "manual",
    cycleIntervalMs: DEFAULT_SETTINGS.cycleIntervalMs,
    maxItemsPerCycle: DEFAULT_SETTINGS.maxItemsPerCycle,
    lastCycleAt: null,
    lastCycleProcessed: 0,
    consecutiveFailures: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Queue / playout planning                                            */
/* ------------------------------------------------------------------ */

export function getQueue(): AutopilotQueueItem[] {
  return state.queue.map((q) => ({ ...q }));
}

export function getPlayout(): AutopilotPlayoutItem[] {
  return state.playout.map((p) => ({ ...p }));
}

export function getAudit(limit = 100): AutopilotAuditEvent[] {
  return state.audit.slice(-limit).map((a) => ({ ...a }));
}

function queueStoryForPlayout(story: AutopilotStoryInput): void {
  const now = new Date().toISOString();
  const stages: AutopilotQueueItem["stage"][] = [
    "source_ingestion",
    "verified_newsroom",
    "script_generation",
    "voice_generation",
    "scene_render_plan",
    "playout",
  ];
  for (const stage of stages) {
    state.queue.push({
      id: randomUUID(),
      storyId: story.storyId,
      stage,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      blockedReasons: [],
    });
  }
  // Plan a playout item — internal admin-only, no public/signed URLs.
  if (state.settings.mode === "autopilot_internal_playout") {
    state.playout.push({
      id: randomUUID(),
      storyId: story.storyId,
      kind: "newsroom_reader",
      scenePlanRef: `plan/scene/${story.storyId}`,
      voicePlanRef: isProviderCallsAllowed() ? `plan/voice/${story.storyId}` : null,
      avatarPlanRef: `plan/avatar/${story.storyId}`,
      unrealManifestRef: `plan/unreal/${story.storyId}`,
      fourDCueManifestRef: `plan/4d-cue/${story.storyId}`,
      durationMs: 30_000,
      visibility: "admin_only_internal",
      publicUrl: null,
      signedUrl: null,
      createdAt: now,
    });
    recordAudit("playout_planned", "scheduler", `kind=newsroom_reader`, story.storyId);
  }
}

function enqueueFallback(): void {
  const now = new Date().toISOString();
  state.playout.push({
    id: randomUUID(),
    storyId: null,
    kind: "fallback",
    scenePlanRef: `plan/scene/${FALLBACK_NO_UPDATE.id}`,
    voicePlanRef: null,
    avatarPlanRef: null,
    unrealManifestRef: null,
    fourDCueManifestRef: null,
    durationMs: FALLBACK_NO_UPDATE.durationMs,
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    createdAt: now,
  });
  recordAudit("fallback_enqueued", "scheduler", FALLBACK_NO_UPDATE.id);
}
