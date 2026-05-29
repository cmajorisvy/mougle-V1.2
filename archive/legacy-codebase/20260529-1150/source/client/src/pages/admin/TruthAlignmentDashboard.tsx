import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, Brain, Target, AlertTriangle,
  CheckCircle, TrendingUp, Zap, Shield
} from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

async function adminGet(url: string) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export default function TruthAlignmentDashboard() {
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "events">("overview");
  const [, navigate] = useLocation();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["truth-analytics"],
    queryFn: () => adminGet("/api/truth/analytics"),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  if (authLoading || isLoading) {
    return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>;
  }
  if (!isAuthenticated) return null;

  const mem = analytics?.memories || {};
  const ev = analytics?.events24h || {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="button-back-admin">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg"><Brain className="w-6 h-6 text-cyan-400" /></div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-truth-title">Truth Alignment Analytics</h1>
              <p className="text-sm text-gray-400">Monitor agent factual reliability and truth evolution</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-total-memories">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><Brain className="w-4 h-4" /><span className="text-xs">Total Memories</span></div>
            <span className="text-2xl font-bold">{mem.total || 0}</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-avg-confidence">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><Target className="w-4 h-4" /><span className="text-xs">Avg Confidence</span></div>
            <span className="text-2xl font-bold">{((mem.avgConfidence || 0) * 100).toFixed(0)}%</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-high-confidence">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><CheckCircle className="w-4 h-4" /><span className="text-xs">High Confidence Ratio</span></div>
            <span className="text-2xl font-bold">{((mem.highConfidenceRatio || 0) * 100).toFixed(0)}%</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-events-24h">
            <div className="flex items-center gap-2 mb-2 text-gray-400"><Zap className="w-4 h-4" /><span className="text-xs">Events (24h)</span></div>
            <span className="text-2xl font-bold">{ev.total || 0}</span>
          </Card>
        </div>

        <div className="flex gap-2 mb-6 border-b border-gray-800 pb-2">
          {(["overview", "events"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} data-testid={`tab-${tab}`}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === tab ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              {tab === "overview" ? "Truth Distribution" : "Evolution Events"}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-[#12121a] border-gray-800 p-6" data-testid="card-truth-distribution">
              <h3 className="text-lg font-semibold mb-4">Truth Type Distribution</h3>
              <div className="space-y-4">
                {[
                  { key: "personal_truth", label: "Personal Truth", color: "bg-blue-500", icon: Shield },
                  { key: "objective_fact", label: "Objective Fact", color: "bg-green-500", icon: CheckCircle },
                  { key: "contextual_interpretation", label: "Contextual Interpretation", color: "bg-purple-500", icon: Brain },
                ].map(({ key, label, color, icon: Icon }) => {
                  const val = mem.distribution?.[key] || 0;
                  const pct = mem.total > 0 ? (val / mem.total * 100).toFixed(0) : 0;
                  return (
                    <div key={key} data-testid={`truth-type-${key}`}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2"><Icon className="w-4 h-4 text-gray-400" /><span className="text-sm">{label}</span></div>
                        <span className="text-sm font-medium">{val} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="bg-[#12121a] border-gray-800 p-6" data-testid="card-evolution-summary">
              <h3 className="text-lg font-semibold mb-4">Evolution Activity (24h)</h3>
              <div className="space-y-3">
                {[
                  { label: "Fact Corrections", value: ev.corrections || 0, icon: TrendingUp, color: "text-orange-400" },
                  { label: "Contradictions Detected", value: ev.contradictions || 0, icon: AlertTriangle, color: "text-red-400" },
                  { label: "Expert Validations", value: ev.validations || 0, icon: CheckCircle, color: "text-green-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex items-center justify-between p-3 bg-[#0a0a0f] rounded-lg">
                    <div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${color}`} /><span className="text-sm">{label}</span></div>
                    <span className="text-lg font-bold">{value}</span>
                  </div>
                ))}
              </div>
              {mem.lowConfidenceCount > 0 && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
                  <AlertTriangle className="w-4 h-4 inline mr-1" /> {mem.lowConfidenceCount} memories with low confidence (&lt;30%) need attention
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === "events" && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Recent Evolution Events</h3>
            {(!analytics?.recentEvents || analytics.recentEvents.length === 0) ? (
              <Card className="bg-[#12121a] border-gray-800 p-8 text-center text-gray-400">No evolution events yet</Card>
            ) : (
              <div className="space-y-2">
                {analytics.recentEvents.map((evt: any) => (
                  <Card key={evt.id} className="bg-[#12121a] border-gray-800 p-3" data-testid={`event-${evt.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${evt.eventType === "fact_correction" ? "bg-orange-500/20 text-orange-400" : evt.eventType === "contradiction_detected" ? "bg-red-500/20 text-red-400" : evt.eventType === "expert_validation" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"}`}>
                          {evt.eventType.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm">{evt.description?.slice(0, 80)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {evt.previousConfidence !== null && (
                          <span>{(evt.previousConfidence * 100).toFixed(0)}% → {(evt.newConfidence * 100).toFixed(0)}%</span>
                        )}
                        <span>{new Date(evt.createdAt).toLocaleString()}</span>
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
