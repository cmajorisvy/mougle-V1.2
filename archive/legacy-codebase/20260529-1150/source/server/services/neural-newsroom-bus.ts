/**
 * Neural Newsroom Bus — in-process event bus with audit history,
 * per-event subscriber whitelist, and admin-field redaction before
 * broadcast to display subscribers (Spec §4).
 *
 * No DB persistence here; audit history is in-memory and bounded.
 */

export type BusEventName =
  | "story.selected"
  | "story.verified"
  | "apexload.decided"
  | "precognition.plan_created"
  | "flowstate.changed"
  | "anchor.beat_started"
  | "robot.intent_created"
  | "screen.take_requested"
  | "screen.take_validated"
  | "screen.take_simulated"
  | "chat.message_received"
  | "chat.message_filtered"
  | "chat.highlight_approved"
  | "audience.message_received"
  | "audience.message_filtered"
  | "audience.highlight_approved"
  | "audience.gift_received"
  | "audience.gift_safe_acknowledged"
  | "audience.spam_blocked"
  | "audience.abuse_blocked"
  | "audience.misinformation_blocked"
  | "audience.moderation_simulated"
  | "audience.robot_response_created"
  | "audience.screen_highlight_created"
  | "audience.gateway_send_simulated"
  | "audience.gateway_send_dispatched"
  | "audience.gateway_send_blocked"
  | "audience.audit_exported"
  | "audience.audit_export_outlier"
  | "audience.connector_secret_set"
  | "audience.connector_secret_rotated"
  | "audience.connector_secret_deleted"
  | "fallback.triggered"
  | "kill_switch.activated";

export interface BusEvent {
  id: string;
  name: BusEventName;
  payload: unknown;
  emittedAt: string;
}

const REDACT_FIELDS = new Set([
  "adminId",
  "approvedBy",
  "sessionId",
  "userId",
  "secret",
  "apiKey",
  "password",
  "signedUrl",
]);

const DISPLAY_EVENTS = new Set<BusEventName>([
  "anchor.beat_started",
  "robot.intent_created",
  "screen.take_simulated",
  "chat.highlight_approved",
  "audience.highlight_approved",
  "audience.screen_highlight_created",
  "audience.gift_safe_acknowledged",
  "flowstate.changed",
]);

function redactForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForDisplay);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_FIELDS.has(k)) continue;
      out[k] = redactForDisplay(v);
    }
    return out;
  }
  return value;
}

type Subscriber = {
  id: string;
  type: "admin" | "display";
  handler: (e: BusEvent) => void;
};

export class NeuralNewsroomBus {
  private allowedDisplaySubscribers = new Set<string>();
  private subscribers = new Map<BusEventName, Subscriber[]>();
  private audit: BusEvent[] = [];
  private maxAudit = 2000;

  whitelistDisplaySubscriber(id: string): void {
    this.allowedDisplaySubscribers.add(id);
  }

  subscribe(event: BusEventName, sub: Subscriber): () => void {
    if (sub.type === "display") {
      if (!this.allowedDisplaySubscribers.has(sub.id)) {
        throw new Error(`display subscriber ${sub.id} is not whitelisted`);
      }
      if (!DISPLAY_EVENTS.has(event)) {
        throw new Error(`display subscriber ${sub.id} cannot subscribe to non-display event ${event}`);
      }
    }
    const list = this.subscribers.get(event) ?? [];
    list.push(sub);
    this.subscribers.set(event, list);
    return () => {
      this.subscribers.set(
        event,
        (this.subscribers.get(event) ?? []).filter((s) => s !== sub),
      );
    };
  }

  emit(name: BusEventName, payload: unknown): BusEvent {
    const event: BusEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      payload,
      emittedAt: new Date().toISOString(),
    };
    this.audit.push(event);
    if (this.audit.length > this.maxAudit) this.audit.splice(0, this.audit.length - this.maxAudit);
    const subs = this.subscribers.get(name) ?? [];
    for (const sub of subs) {
      // Belt-and-braces: display subscribers ALWAYS receive redacted payloads,
      // regardless of event name. subscribe() also blocks non-display events,
      // so this is defense-in-depth.
      const pay = sub.type === "display" ? redactForDisplay(payload) : payload;
      try {
        sub.handler({ ...event, payload: pay });
      } catch (err) {
        console.error("[neural-newsroom-bus] subscriber error", sub.id, err);
      }
    }
    return event;
  }

  history(limit = 200): BusEvent[] {
    return this.audit.slice(-limit).reverse();
  }

  reset(): void {
    this.audit = [];
    this.subscribers.clear();
    this.allowedDisplaySubscribers.clear();
  }
}

export const neuralNewsroomBus = new NeuralNewsroomBus();
// Default display subscribers used by the simulated preview UI.
neuralNewsroomBus.whitelistDisplaySubscriber("preview_studio");
neuralNewsroomBus.whitelistDisplaySubscriber("admin_dashboard");

export { redactForDisplay as __redactForDisplay };
