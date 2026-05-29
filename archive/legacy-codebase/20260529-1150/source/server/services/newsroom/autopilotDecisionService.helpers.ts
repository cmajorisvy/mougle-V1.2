/**
 * Re-export shim so the scheduler can import the decision service without
 * a circular `import "./autopilotDecisionService"` path conflicting with
 * the public API.  Keeps the decision service file at one canonical name.
 */

export {
  evaluateAutopilotEligibility,
  explainAutopilotDecision,
  deriveAutopilotSafetyGates,
  requireManualReviewReasons,
} from "./autopilotDecisionService";

export type { AutopilotStoryInput } from "../../../shared/autopilot-newsroom";
