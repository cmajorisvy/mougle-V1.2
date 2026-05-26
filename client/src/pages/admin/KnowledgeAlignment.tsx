import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, Globe, FileCheck, Scale,
  CheckCircle, XCircle, HelpCircle, MessageSquare
} from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

async function adminGet(url: string) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

const STATUS_STYLES: Record<string, { bg: string; label: string; icon: any }> = {
  unverified: { bg: "bg-gray-500/20 text-gray-400", label: "Unverified", icon: HelpCircle },
  contested: { bg: "bg-red-500/20 text-red-400", label: "Contested", icon: XCircle },
  supported: { bg: "bg-blue-500/20 text-blue-400", label: "Supported", icon: FileCheck },
  consensus: { bg: "bg-green-500/20 text-green-400", label: "Consensus", icon: CheckCircle },
};

export default function KnowledgeAlignment() {
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "claims" | "transitions">("overview");
  const [, navigate] = useLocation();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["reality-analytics"],
    queryFn: () => adminGet("/api/reality/analytics"),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: claims } = useQuery({
    queryKey: ["reality-claims"],
    queryFn: async () => {
      const res = await fetch("/api/reality/claims?limit=20");
      return res.json();
    },
    enabled: isAuthenticated && activeTab === "claims",
  });

  if (authLoading || isLoading) {
    return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>;
  }
  if (!isAuthenticated) return null;

  const cl = analytics?.claims || {};
  const ev = analytics?.evidence || {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="button-back-admin">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg"><Globe className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-knowledge-title">Knowledge Alignment</h1>
              <p className="text-sm text-gray-400">Reality alignment and collective truth convergence analytics</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-total-claims">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><FileCheck className="w-4 h-4" /><span className="text-xs">Total Claims</span></div>
            <span className="text-2xl font-bold">{cl.total || 0}</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-avg-confidence">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><Scale className="w-4 h-4" /><span className="text-xs">Avg Confidence</span></div>
            <span className="text-2xl font-bold">{((cl.avgConfidence || 0) * 100).toFixed(0)}%</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-total-evidence">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><MessageSquare className="w-4 h-4" /><span className="text-xs">Total Evidence</span></div>
            <span className="text-2xl font-bold">{ev.total || 0}</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-transitions-24h">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><Globe className="w-4 h-4" /><span className="text-xs">Transitions (24h)</span></div>
            <span className="text-2xl font-bold">{analytics?.transitions24h || 0}</span>
          </Card>
        </div>

        <div className="flex gap-2 mb-6 border-b border-gray-800 pb-2">
          {(["overview", "claims", "transitions"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} data-testid={`tab-${tab}`}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === tab ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              {tab === "overview" ? "Overview" : tab === "claims" ? "Claims" : "Transitions"}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-[#12121a] border-gray-800 p-6" data-testid="card-claim-lifecycle">
              <h3 className="text-lg font-semibold mb-4">Claim Lifecycle States</h3>
              <div className="space-y-4">
                {Object.entries(STATUS_STYLES).map(([key, style]) => {
                  const Icon = style.icon;
                  const val = cl.statusDistribution?.[key] || 0;
                  const pct = cl.total > 0 ? (val / cl.total * 100).toFixed(0) : 0;
                  return (
                    <div key={key} data-testid={`claim-status-${key}`}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2"><Icon className="w-4 h-4" /><span className="text-sm">{style.label}</span></div>
                        <span className="text-sm font-medium">{val} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${key === "consensus" ? "bg-green-500" : key === "supported" ? "bg-blue-500" : key === "contested" ? "bg-red-500" : "bg-gray-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="bg-[#12121a] border-gray-800 p-6" data-testid="card-evidence-breakdown">
              <h3 className="text-lg font-semibold mb-4">Evidence Breakdown</h3>
              <div className="space-y-3">
                {[
                  { label: "Supporting", value: ev.typeDistribution?.supporting || 0, color: "text-green-400" },
                  { label: "Contradicting", value: ev.typeDistribution?.contradicting || 0, color: "text-red-400" },
                  { label: "Neutral", value: ev.typeDistribution?.neutral || 0, color: "text-gray-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between p-3 bg-[#0a0a0f] rounded-lg">
                    <span className={`text-sm ${color}`}>{label}</span>
                    <span className="text-lg font-bold">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-[#0a0a0f] rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Avg Evidence Weight</span>
                  <span className="font-medium">{ev.avgWeight || 0}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-400">Avg Agreement Level</span>
                  <span className="font-medium">{((cl.avgAgreement || 0) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "claims" && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Recent Claims</h3>
            {(!claims || claims.length === 0) ? (
              <Card className="bg-[#12121a] border-gray-800 p-8 text-center text-gray-400">No claims extracted yet</Card>
            ) : (
              <div className="space-y-2">
                {claims.map((claim: any) => {
                  const style = STATUS_STYLES[claim.status] || STATUS_STYLES.unverified;
                  const Icon = style.icon;
                  return (
                    <Card key={claim.id} className="bg-[#12121a] border-gray-800 p-4" data-testid={`claim-${claim.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm">{claim.content}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                            {claim.domain && <span className="bg-gray-800 px-2 py-0.5 rounded">{claim.domain}</span>}
                            <span>Confidence: {(claim.confidenceScore * 100).toFixed(0)}%</span>
                            <span>Evaluations: {claim.evaluationCount}</span>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${style.bg}`}>
                          <Icon className="w-3 h-3" /> {style.label}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "transitions" && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Recent Consensus Transitions</h3>
            {(!analytics?.recentTransitions || analytics.recentTransitions.length === 0) ? (
              <Card className="bg-[#12121a] border-gray-800 p-8 text-center text-gray-400">No transitions recorded yet</Card>
            ) : (
              <div className="space-y-2">
                {analytics.recentTransitions.map((t: any) => (
                  <Card key={t.id} className="bg-[#12121a] border-gray-800 p-3" data-testid={`transition-${t.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[t.previousStatus]?.bg || "bg-gray-500/20"}`}>
                          {t.previousStatus}
                        </span>
                        <span className="text-gray-500">→</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[t.newStatus]?.bg || "bg-gray-500/20"}`}>
                          {t.newStatus}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        <span>{(t.previousConfidence * 100).toFixed(0)}% → {(t.newConfidence * 100).toFixed(0)}%</span>
                        <span className="ml-3">{t.participantCount} participants, {t.evidenceCount} evidence</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
