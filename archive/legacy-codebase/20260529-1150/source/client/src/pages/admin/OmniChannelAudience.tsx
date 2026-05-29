/**
 * Omni-Channel Audience Safety — admin command center (Task #371).
 *
 * Read-only dashboard backed by `/api/admin/newsroom/audience/*`. Every
 * action button is simulation-only — the server never calls a platform API
 * in this phase (platformSendAllowed:false on every record).
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Decision, MetricCard } from "./omni-channel-audience/_shared";
import { AuditExportOutlierConfigCard } from "./AuditExportOutlierConfigCard";
import { ArchiveRetentionPolicyCard } from "./omni-channel-audience/ArchiveRetentionPolicyCard";
import { ArchiveBrowserCard } from "./omni-channel-audience/ArchiveBrowserCard";
import { ScheduledComplianceEmailCard } from "./omni-channel-audience/ScheduledComplianceEmailCard";
import { ConnectorRotationNotifierCard } from "./omni-channel-audience/ConnectorRotationNotifierCard";
import { AuditExportNotifierCard } from "./omni-channel-audience/AuditExportNotifierCard";
import { RiskSignalRulesCard } from "./omni-channel-audience/RiskSignalRulesCard";
import { LegacyTokenDispatchAlertCard } from "./omni-channel-audience/LegacyTokenDispatchAlertCard";
import { LegacyTokenStatusCard } from "./omni-channel-audience/LegacyTokenStatusCard";
import { LegacyTokenKillSwitchHistoryCard } from "./omni-channel-audience/LegacyTokenKillSwitchHistoryCard";
import { LegacyTokenKillSwitchNotifierCard } from "./omni-channel-audience/LegacyTokenKillSwitchNotifierCard";
import { RecycleBinAlertNotifierCard } from "./omni-channel-audience/RecycleBinAlertNotifierCard";
import { GatewayBlockAlertSettingsCard } from "./omni-channel-audience/GatewayBlockAlertSettingsCard";
import { GatewayAlertSettingsAuditCard } from "./omni-channel-audience/GatewayAlertSettingsAuditCard";
import { ArchiveDeletionNotifierCard } from "./omni-channel-audience/ArchiveDeletionNotifierCard";
import { ScheduledHistoryEmailCard } from "./omni-channel-audience/ScheduledHistoryEmailCard";
import { ConnectedChannelsCard } from "./omni-channel-audience/ConnectedChannelsCard";
import { GatewayActivityCard } from "./omni-channel-audience/GatewayActivityCard";
import { AuditExportCard } from "./omni-channel-audience/AuditExportCard";
import { SecretRotationsExportCard } from "./omni-channel-audience/SecretRotationsExportCard";
import { RetentionCard } from "./omni-channel-audience/RetentionCard";
import { ConnectorBackfillCard } from "./omni-channel-audience/ConnectorBackfillCard";
import { ExportLogCard } from "./omni-channel-audience/ExportLogCard";
import { LiveAudienceQueueCard } from "./omni-channel-audience/LiveAudienceQueueCard";
import { SimulatedModerationCommandsCard } from "./omni-channel-audience/SimulatedModerationCommandsCard";
import { OrphanedAttributionCard } from "./omni-channel-audience/OrphanedAttributionCard";
import { BlockedMessagesCard } from "./omni-channel-audience/BlockedMessagesCard";

export default function OmniChannelAudience() {
  const [productionId, setProductionId] = useState("prod_demo");

  const historyQuery = useQuery<{
    messages: any[];
    decisions: Decision[];
    commands: any[];
  }>({
    queryKey: [`/api/admin/newsroom/audience/${productionId}/history`],
  });

  const decisions = historyQuery.data?.decisions ?? [];
  const messages = historyQuery.data?.messages ?? [];
  const commands = historyQuery.data?.commands ?? [];

  const blocked = decisions.filter((d) => d.reasonCodes.length > 0);
  const safeHighlights = decisions.filter(
    (d) => d.action === "safe_highlight" || d.action === "anchor_read",
  );
  const giftQueue = decisions.filter((d) => d.giftValue != null);
  const reviewQueue = decisions.filter((d) => d.action === "moderator_review");

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-omni-channel-audience">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Omni-Channel Audience Safety</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cross-platform audience comment / chat / gift moderation. All actions are
            simulation-only — no platform API is called in this phase.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            value={productionId}
            onChange={(e) => setProductionId(e.target.value)}
            className="w-48"
            data-testid="input-production-id"
            placeholder="productionId"
          />
        </div>
      </div>

      <ConnectedChannelsCard productionId={productionId} />

      <LegacyTokenStatusCard />
      <LegacyTokenKillSwitchHistoryCard />
      <LegacyTokenKillSwitchNotifierCard />

      <GatewayBlockAlertSettingsCard />
      <GatewayAlertSettingsAuditCard />

      <GatewayActivityCard productionId={productionId} />

      <ScheduledComplianceEmailCard />

      <ScheduledHistoryEmailCard />

      <AuditExportNotifierCard />
      <ConnectorRotationNotifierCard />
      <LegacyTokenDispatchAlertCard />
      <RiskSignalRulesCard />

      <AuditExportOutlierConfigCard />

      <ArchiveDeletionNotifierCard />
      <RecycleBinAlertNotifierCard />

      <AuditExportCard productionId={productionId} setProductionId={setProductionId} />

      <SecretRotationsExportCard productionId={productionId} />

      <RetentionCard productionId={productionId} />

      <ConnectorBackfillCard />
      <OrphanedAttributionCard />

      <ArchiveRetentionPolicyCard />

      <ArchiveBrowserCard />

      <ExportLogCard productionId={productionId} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Live audience queue" value={messages.length} testid="metric-messages" />
        <MetricCard label="Safe highlights" value={safeHighlights.length} testid="metric-safe" />
        <MetricCard label="Gifts / superchats / tips" value={giftQueue.length} testid="metric-gifts" />
        <MetricCard label="Moderator review queue" value={reviewQueue.length} testid="metric-review" />
      </div>

      <LiveAudienceQueueCard
        productionId={productionId}
        messages={messages}
        decisions={decisions}
      />

      <SimulatedModerationCommandsCard commands={commands} />

      <BlockedMessagesCard blocked={blocked} />
    </div>
  );
}
