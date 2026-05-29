import { Badge } from "@/components/ui/badge";

export const STATUS_OPTIONS = ["any", "draft", "active", "archived"] as const;
export const REVIEW_OPTIONS = [
  "any",
  "pending",
  "approved_internal",
  "rejected",
  "needs_changes",
] as const;
export const GATE_OPTIONS = ["any", "not_approved", "approved_internal"] as const;

export const ROLE_PRESETS = [
  "news_anchor",
  "podcast_host",
  "debate_moderator",
  "guest",
  "analyst",
  "field_reporter",
  "teacher",
  "virtual_ceo",
  "ai_assistant",
  "custom",
] as const;

export const DEFAULT_ROOM_KINDS = [
  "news_room",
  "podcast_room",
  "debate_studio",
  "living_room",
] as const;

export type PermanentAvatar = {
  id: string;
  displayName: string;
  slug: string;
  personaSummary: string;
  rolePreset: string;
  voiceProfileHint: string;
  languageHint: string;
  bodyAssetId: string;
  rigId: string;
  defaultRoomKind: string | null;
  defaultRoomId: string | null;
  status: string;
  lifecycleState: string;
  identityReview: string;
  identityReviewNote: string | null;
  safetyReview: string;
  safetyReviewNote: string | null;
  approvalGate: string;
  publicUrl: null;
  metadata: any;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type BoundAssetSummary = {
  id: string;
  name: string;
  status: string;
  approvalGate: string;
};

export type BoundRigSummary = {
  id: string;
  name: string;
  status: string;
  approvalGate: string;
};

export type AuditRow = {
  id: string;
  permanentAvatarId: string;
  actorUserId: string;
  event: string;
  payload: any;
  createdAt: string;
};

export function PermanentAvatarSafetyBadges() {
  return (
    <div className="mb-4 flex flex-wrap gap-2 text-xs" data-testid="permanent-avatar-safety-badges">
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        Admin-only · private
      </Badge>
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        publicUrl always null
      </Badge>
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        No approved_public
      </Badge>
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        No provider calls
      </Badge>
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
        Preview URLs ≤ 15 min · never persisted
      </Badge>
    </div>
  );
}
