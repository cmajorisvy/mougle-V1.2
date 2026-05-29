import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/Layout";
import { useRoute, Link } from "wouter";
import {
  FileText, Download, Loader2, ArrowLeft, RefreshCw,
  Shield, DollarSign, AlertTriangle, CheckCircle, Layers,
  BookOpen, Target, Lightbulb, BarChart3, Calendar
} from "lucide-react";

interface ProjectBlueprint {
  executiveSummary: string;
  problemStatement: string;
  researchFindings: Array<{ title: string; content: string; subsections?: Array<{ title: string; content: string }> }>;
  evidenceAnalysis: Array<{ title: string; content: string }>;
  solutionDesign: Array<{ title: string; content: string; subsections?: Array<{ title: string; content: string }> }>;
  feasibilityAnalysis: { technical: string; financial: string; operational: string; timeline: string };
  financialModel: { estimatedCost: string; revenueProjection: string; breakEvenAnalysis: string; fundingRequirements: string };
  riskAssessment: { risks: Array<{ category: string; description: string; mitigation: string; severity: string }> };
  implementationPlan: { phases: Array<{ name: string; duration: string; deliverables: string[]; dependencies: string[] }> };
  conclusion: string;
  metadata: { debateId: number; totalRounds: number; participantCount: number; consensusScore: number; generatedAt: string };
}

interface Project {
  id: string;
  debateId: number | null;
  topicSlug: string;
  title: string;
  description: string | null;
  projectType: string;
  status: string;
  version: number;
  blueprintJson: ProjectBlueprint | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectPackage {
  id: string;
  projectId: string;
  pdfUrl: string;
  pages: number;
  versionNumber: number;
  generatedAt: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: packages } = useQuery<ProjectPackage[]>({
    queryKey: ["/api/projects", projectId, "packages"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/packages`);
      if (!res.ok) throw new Error("Failed to fetch packages");
      return res.json();
    },
    enabled: !!projectId,
  });

  const generatePdfMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/generate-pdf`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate PDF");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "packages"] });
      toast({ title: "PDF Generated", description: `${data.pages}-page PDF is ready for download.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="min-h-screen bg-[#0a0a1a] p-6">
          <div className="max-w-4xl mx-auto text-center py-20">
            <h2 className="text-xl text-gray-300">Project not found</h2>
            <Link href="/projects">
              <Button className="mt-4">Back to Projects</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const blueprint = project.blueprintJson;

  return (
    <Layout>
      <div className="min-h-screen bg-[#0a0a1a] p-6">
        <div className="max-w-5xl mx-auto">
          <Link href="/projects">
            <Button variant="ghost" className="text-gray-400 hover:text-white mb-4" data-testid="link-back-to-projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>

          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 data-testid="text-project-title" className="text-2xl font-bold text-white mb-2">{project.title}</h1>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <Badge className="bg-purple-500/10 text-purple-400">{project.projectType}</Badge>
                <Badge className="bg-emerald-500/10 text-emerald-400">{project.status}</Badge>
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" /> v{project.version}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(project.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <Button
              data-testid="button-generate-pdf"
              onClick={() => generatePdfMutation.mutate()}
              disabled={generatePdfMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {generatePdfMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generate PDF
            </Button>
          </div>

          {packages && packages.length > 0 && (
            <Card className="bg-[#1a1a2e] border-gray-800 mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-gray-300">Generated PDFs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {packages.map((pkg) => (
                    <div key={pkg.id} data-testid={`card-package-${pkg.id}`} className="flex items-center justify-between p-3 bg-[#0a0a1a] rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-purple-400" />
                        <div>
                          <span className="text-sm text-white">Version {pkg.versionNumber}</span>
                          <span className="text-xs text-gray-500 ml-3">{pkg.pages} pages</span>
                        </div>
                      </div>
                      <a
                        href={`/api/projects/${project.id}/packages/${pkg.id}/download`}
                        data-testid={`link-download-${pkg.id}`}
                        className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                      >
                        <Download className="w-4 h-4" /> Download
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {blueprint ? (
            <Tabs defaultValue="summary" className="space-y-4">
              <TabsList className="bg-[#1a1a2e] border border-gray-800">
                <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
                <TabsTrigger value="research" data-testid="tab-research">Research</TabsTrigger>
                <TabsTrigger value="solutions" data-testid="tab-solutions">Solutions</TabsTrigger>
                <TabsTrigger value="financials" data-testid="tab-financials">Financials</TabsTrigger>
                <TabsTrigger value="risks" data-testid="tab-risks">Risks</TabsTrigger>
                <TabsTrigger value="plan" data-testid="tab-plan">Implementation</TabsTrigger>
              </TabsList>

              <TabsContent value="summary">
                <div className="space-y-4">
                  <Card className="bg-[#1a1a2e] border-gray-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-purple-400" />
                        Executive Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p data-testid="text-executive-summary" className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {blueprint.executiveSummary}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-[#1a1a2e] border-gray-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Target className="w-5 h-5 text-red-400" />
                        Problem Statement
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p data-testid="text-problem-statement" className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {blueprint.problemStatement}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-[#1a1a2e] border-gray-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        Conclusion
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p data-testid="text-conclusion" className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {blueprint.conclusion}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="research">
                <div className="space-y-4">
                  {blueprint.researchFindings?.map((finding, i) => (
                    <Card key={i} className="bg-[#1a1a2e] border-gray-800">
                      <CardHeader>
                        <CardTitle className="text-white text-lg">{finding.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{finding.content}</p>
                        {finding.subsections?.map((sub, j) => (
                          <div key={j} className="mt-4 pl-4 border-l-2 border-purple-500/30">
                            <h4 className="text-white font-medium mb-1">{sub.title}</h4>
                            <p className="text-gray-400 text-sm leading-relaxed">{sub.content}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                  {blueprint.evidenceAnalysis?.map((ev, i) => (
                    <Card key={`ev-${i}`} className="bg-[#1a1a2e] border-gray-800">
                      <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-yellow-400" />
                          {ev.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{ev.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="solutions">
                <div className="space-y-4">
                  {blueprint.solutionDesign?.map((sol, i) => (
                    <Card key={i} className="bg-[#1a1a2e] border-gray-800">
                      <CardHeader>
                        <CardTitle className="text-white text-lg">{sol.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{sol.content}</p>
                        {sol.subsections?.map((sub, j) => (
                          <div key={j} className="mt-4 pl-4 border-l-2 border-blue-500/30">
                            <h4 className="text-white font-medium mb-1">{sub.title}</h4>
                            <p className="text-gray-400 text-sm leading-relaxed">{sub.content}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                  <Card className="bg-[#1a1a2e] border-gray-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-400" />
                        Feasibility Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {blueprint.feasibilityAnalysis && Object.entries(blueprint.feasibilityAnalysis).map(([key, value]) => (
                        <div key={key}>
                          <h4 className="text-white font-medium capitalize mb-1">{key} Feasibility</h4>
                          <p className="text-gray-400 text-sm leading-relaxed">{value}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="financials">
                <Card className="bg-[#1a1a2e] border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-400" />
                      Financial Model
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {blueprint.financialModel && Object.entries(blueprint.financialModel).map(([key, value]) => (
                      <div key={key} className="p-4 bg-[#0a0a1a] rounded-lg">
                        <h4 className="text-white font-medium mb-2 capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </h4>
                        <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="risks">
                <Card className="bg-[#1a1a2e] border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                      Risk Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {blueprint.riskAssessment?.risks?.map((risk, i) => (
                        <div key={i} data-testid={`card-risk-${i}`} className="p-4 bg-[#0a0a1a] rounded-lg border border-gray-800">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-white font-medium">{risk.category}</h4>
                            <Badge className={SEVERITY_STYLES[risk.severity] || "bg-gray-500/10 text-gray-400"}>
                              {risk.severity}
                            </Badge>
                          </div>
                          <p className="text-gray-400 text-sm mb-2">{risk.description}</p>
                          <div className="text-xs text-gray-500">
                            <span className="text-emerald-400 font-medium">Mitigation:</span>{" "}
                            {risk.mitigation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="plan">
                <Card className="bg-[#1a1a2e] border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Layers className="w-5 h-5 text-purple-400" />
                      Implementation Plan
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {blueprint.implementationPlan?.phases?.map((phase, i) => (
                        <div key={i} className="relative pl-8">
                          <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs text-white font-bold">
                            {i + 1}
                          </div>
                          {i < (blueprint.implementationPlan?.phases?.length || 0) - 1 && (
                            <div className="absolute left-3 top-6 w-0.5 h-full bg-purple-500/20" />
                          )}
                          <div className="p-4 bg-[#0a0a1a] rounded-lg border border-gray-800">
                            <h4 className="text-white font-medium mb-1">{phase.name}</h4>
                            <p className="text-purple-400 text-xs mb-3">Duration: {phase.duration}</p>
                            {phase.deliverables?.length > 0 && (
                              <div className="mb-2">
                                <span className="text-xs text-gray-500 uppercase tracking-wider">Deliverables</span>
                                <ul className="mt-1 space-y-1">
                                  {phase.deliverables.map((d, j) => (
                                    <li key={j} className="text-gray-400 text-sm flex items-start gap-2">
                                      <CheckCircle className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                                      {d}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {phase.dependencies?.length > 0 && (
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wider">Dependencies</span>
                                <ul className="mt-1 space-y-1">
                                  {phase.dependencies.map((d, j) => (
                                    <li key={j} className="text-gray-500 text-sm">- {d}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="bg-[#1a1a2e] border-gray-800">
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No blueprint data available yet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
