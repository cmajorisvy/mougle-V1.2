import { Layout } from "@/components/layout/Layout";
import { Brain } from "lucide-react";
import { OverviewCards } from "./OverviewCards";
import { IntelligencePipeline } from "./IntelligencePipeline";
import { IntelligenceTimeline } from "./IntelligenceTimeline";
import { IntelligenceCivilizationMap } from "./IntelligenceCivilizationMap";
import { PersonalIntelligencePanel } from "./PersonalIntelligencePanel";
import { LabsOpportunityPanel } from "./LabsOpportunityPanel";
import { PassportTrustPanel } from "./PassportTrustPanel";
import { NextActionPanel } from "./NextActionPanel";
import { useDashboardData } from "./hooks/useDashboardData";
import { AmbientIntelligenceStatus } from "./AmbientIntelligenceStatus";
import { IntelligenceActivityFeed } from "./IntelligenceActivityFeed";

export default function IntelligenceDashboard() {
  const {
    userId,
    agents,
    debates,
    discussions,
    labsOps,
    labsApps,
    passports,
    projects,
    personal,
    personalError,
    loading,
    intelligenceScore,
    intelligenceLevel,
    weeklyGrowth,
    nextAction,
    capabilities,
    journey,
  } = useDashboardData();

  const latestPassport = passports?.[0];
  const passportStatus = latestPassport
    ? latestPassport.revoked ? "revoked" : "valid"
    : "none";

  const highlight = labsOps?.[0];

  return (
    <Layout>
      <div
        className="min-h-screen"
        style={
          {
            "--ink": "#e5e7ff",
            "--muted": "#9aa0c3",
            "--accent": "#7dd3fc",
            "--accent2": "#f9a8d4",
            "--card": "#0b0d1d",
          } as React.CSSProperties
        }
      >
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(125,211,252,0.15),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(249,168,212,0.12),transparent_45%),linear-gradient(180deg,#070813,#05060d)]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <Brain className="w-5 h-5 text-sky-300" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: "var(--ink)", fontFamily: "Space Grotesk, ui-sans-serif" }}>
                    Intelligence Dashboard
                  </h1>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Unified view of debates, agents, labs, and passports.
                  </p>
                </div>
              </div>
              <AmbientIntelligenceStatus />
              {journey && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white/80">Stage:</span>
                    <span className="text-sky-300 font-semibold">{journey.stage}</span>
                    <span className="text-white/40">•</span>
                    <span className="text-white/60">{journey.nextGoal}</span>
                  </div>
                </div>
              )}
              <div className="mt-4">
                <OverviewCards
                  agentsCount={agents?.length ?? 0}
                  debatesCount={debates?.length ?? 0}
                  discussionsCount={discussions?.length ?? 0}
                  labsCount={labsOps?.length ?? 0}
                  appsCount={labsApps?.length ?? 0}
                  passportsCount={passports?.length ?? 0}
                  intelligenceScore={intelligenceScore}
                  intelligenceLevel={intelligenceLevel}
                  weeklyGrowth={weeklyGrowth}
                  loading={loading}
                />
              </div>
              {capabilities.timeline && (
                <div className="mt-4">
                  <IntelligenceTimeline
                    debates={debates || []}
                    labsOps={labsOps || []}
                    agents={agents || []}
                    passports={passports || []}
                    loading={loading}
                  />
                </div>
              )}
              {capabilities.civilizationMap && (
                <div className="mt-4">
                  <IntelligenceCivilizationMap
                    debates={debates}
                    agents={agents}
                    projects={projects}
                    passports={passports}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6">
              <div className="lg:col-span-7">
                <IntelligencePipeline
                  discussionsCount={discussions?.length ?? 0}
                  debatesCount={debates?.length ?? 0}
                  labsCount={labsOps?.length ?? 0}
                  appsCount={labsApps?.length ?? 0}
                  loading={loading}
                />
              </div>
              {capabilities.personalPanel && (
                <div className="lg:col-span-5">
                  <PersonalIntelligencePanel personal={personal} personalError={personalError} loading={loading} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6">
              {capabilities.labsPanel && (
                <div className="lg:col-span-6">
                  <LabsOpportunityPanel highlight={highlight} loading={loading} />
                </div>
              )}
              <div className="lg:col-span-3 space-y-4">
                {capabilities.passportTrust && (
                  <PassportTrustPanel passportStatus={passportStatus} loading={loading} />
                )}
                {capabilities.activityFeed && (
                  <IntelligenceActivityFeed
                    debates={debates}
                    agents={agents}
                    passports={passports}
                    projects={projects}
                  />
                )}
              </div>
              {capabilities.nextAction && (
                <div className="lg:col-span-3">
                  <NextActionPanel nextAction={nextAction} loading={loading} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
