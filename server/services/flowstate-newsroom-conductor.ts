/**
 * FlowState Conductor — simulated live newsroom state machine (Spec §3).
 *
 * Pure in-memory, draft-only. No hardware, no Unreal, no publishing.
 */

import type { FlowState } from "../../shared/neural-newsroom-schema";

export interface FlowStateSnapshot {
  state: FlowState;
  anchorMode: string;
  robotMode: string;
  screenRoute: string; // preset id of the current dominant route
  tickerEnabled: boolean;
  lowerThirdMode: "default" | "safe" | "alert" | "off";
  backDisplay: string;
  sideScreens: string;
  legalVisualMode: "default" | "redacted" | "disabled";
  chatHighlightMode: "off" | "safe_only" | "robot_acknowledge";
  fourDCueSuggestion: string | null;
  reason: string;
  changedAt: string;
}

const TRANSITIONS: Record<FlowState, FlowState[]> = {
  idle: ["calm_read", "kill_switch"],
  calm_read: ["focused_explainer", "breaking_alert", "sensitive_story", "chat_reaction", "fallback_mode", "kill_switch"],
  focused_explainer: ["calm_read", "breaking_alert", "sensitive_story", "fallback_mode", "kill_switch"],
  breaking_alert: ["calm_read", "sensitive_story", "fallback_mode", "kill_switch"],
  sensitive_story: ["calm_read", "fallback_mode", "kill_switch"],
  chat_reaction: ["calm_read", "kill_switch"],
  fallback_mode: ["calm_read", "kill_switch"],
  kill_switch: ["idle"],
};

function presetFor(state: FlowState): FlowStateSnapshot {
  const now = new Date().toISOString();
  switch (state) {
    case "idle":
      return base(state, "solo_desk", "calm", "preset_world_map_default", true, "default", "preset_world_map_default", "preset_world_map_default", "default", "off", null, "idle", now);
    case "calm_read":
      return base(state, "solo_desk", "calm", "preset_world_map_default", true, "default", "preset_event_wall_default", "preset_source_panel_default", "default", "safe_only", null, "calm read", now);
    case "focused_explainer":
      return base(state, "corner_anchor", "explain", "preset_claims_panel_default", true, "default", "preset_event_wall_default", "preset_timeline_panel_default", "default", "robot_acknowledge", null, "focused explainer", now);
    case "breaking_alert":
      return base(state, "solo_desk", "alert", "preset_event_wall_breaking", true, "alert", "preset_event_wall_breaking", "preset_source_panel_default", "default", "off", "bass_hit", "breaking alert", now);
    case "sensitive_story":
      return base(state, "solo_desk", "serious", "preset_world_map_default", true, "safe", "preset_world_map_default", "preset_world_map_default", "redacted", "off", null, "sensitive story", now);
    case "chat_reaction":
      return base(state, "solo_desk", "acknowledge", "preset_world_map_default", true, "default", "preset_world_map_default", "preset_source_panel_default", "default", "safe_only", null, "chat reaction", now);
    case "fallback_mode":
      return base(state, "solo_desk", "calm", "preset_world_map_default", true, "safe", "preset_world_map_default", "preset_world_map_default", "redacted", "off", null, "fallback engaged", now);
    case "kill_switch":
      return base(state, "off_camera", "silent", "preset_world_map_default", false, "off", "preset_world_map_default", "preset_world_map_default", "disabled", "off", null, "kill switch", now);
  }
}

function base(
  state: FlowState,
  anchorMode: string,
  robotMode: string,
  screenRoute: string,
  ticker: boolean,
  lt: FlowStateSnapshot["lowerThirdMode"],
  back: string,
  side: string,
  legal: FlowStateSnapshot["legalVisualMode"],
  chat: FlowStateSnapshot["chatHighlightMode"],
  four: string | null,
  reason: string,
  now: string,
): FlowStateSnapshot {
  return {
    state,
    anchorMode,
    robotMode,
    screenRoute,
    tickerEnabled: ticker,
    lowerThirdMode: lt,
    backDisplay: back,
    sideScreens: side,
    legalVisualMode: legal,
    chatHighlightMode: chat,
    fourDCueSuggestion: four,
    reason,
    changedAt: now,
  };
}

export class FlowStateConductorService {
  private current: FlowStateSnapshot = presetFor("idle");
  private history: FlowStateSnapshot[] = [this.current];

  get(): FlowStateSnapshot {
    return this.current;
  }

  list(limit = 50): FlowStateSnapshot[] {
    return this.history.slice(-limit).reverse();
  }

  transition(to: FlowState, reason?: string): { ok: boolean; snapshot: FlowStateSnapshot; rejected?: string } {
    const allowed = TRANSITIONS[this.current.state] ?? [];
    if (!allowed.includes(to)) {
      return { ok: false, snapshot: this.current, rejected: `transition ${this.current.state}->${to} not allowed` };
    }
    const next = presetFor(to);
    if (reason) next.reason = reason;
    this.current = next;
    this.history.push(next);
    if (this.history.length > 500) this.history.splice(0, this.history.length - 500);
    return { ok: true, snapshot: next };
  }

  reset(): void {
    this.current = presetFor("idle");
    this.history = [this.current];
  }
}

export const flowstateConductorService = new FlowStateConductorService();
