import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Beaker, Rocket, Clock, DollarSign, Code, ArrowLeft,
  Shield, FileText, Users, TrendingUp, Zap, CheckCircle2,
  ExternalLink, Copy, AlertTriangle, Star, Download
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link, useParams } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { LabsOpportunity } from "@shared/schema";

const difficultyColors: Record<string, string> = {
  beginner: "bg-emerald-500/20 text-emerald-400 border-emerald-500/20",
  intermediate: "bg-amber-500/20 text-amber-400 border-amber-500/20",
  advanced: "bg-red-500/20 text-red-400 border-red-500/20",
};

export default function LabsDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [buildStarted, setBuildStarted] = useState(false);
  const [scaffoldData, setScaffoldData] = useState<any>(null);

  const { data: opp, isLoading } = useQuery<LabsOpportunity>({
    queryKey: ["labs-opportunity", id],
    queryFn: () => api.labs.opportunity(id!),
    enabled: !!id,
  });

  const buildMutation = useMutation({
    mutationFn: () => api.labs.build(id!),
    onSuccess: (data) => {
      setScaffoldData(data);
      setBuildStarted(true);
      toast({ title: "Project scaffold ready!", description: "Your app structure has been generated." });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="w-32 h-8" />
          <Skeleton className="w-full h-12" />
          <Skeleton className="w-full h-64" />
        </div>
      </Layout>
    );
  }

  if (!opp) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <Beaker className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Opportunity not found</h2>
          <Link href="/labs"><Button variant="outline">Back to Labs</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/labs">
            <Button variant="ghost" size="sm" data-testid="button-back-to-labs">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Labs
            </Button>
          </Link>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20" data-testid="badge-detail-industry">
                {opp.industry}
              </Badge>
              <Badge variant="outline" data-testid="badge-detail-category">{opp.category}</Badge>
              <Badge variant="outline" className={cn(difficultyColors[opp.difficulty])} data-testid="badge-detail-difficulty">
                {opp.difficulty}
              </Badge>
              {opp.trending && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/20">
                  <TrendingUp className="w-3 h-3 mr-1" /> Trending
                </Badge>
              )}
            </div>
          </div>

          <h1 className="text-xl font-display font-bold" data-testid="text-detail-problem">{opp.problemStatement}</h1>

          <Card className="glass-card rounded-xl p-5" data-testid="card-solution">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Solution</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{opp.solution}</p>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="glass-card rounded-xl p-4 text-center">
              <Clock className="w-5 h-5 text-blue-400 mx-auto mb-2" />
              <div className="text-lg font-bold">{opp.developmentSpec.estimatedHours}h</div>
              <div className="text-[10px] text-muted-foreground">Est. Dev Time</div>
            </Card>
            <Card className="glass-card rounded-xl p-4 text-center">
              <DollarSign className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-bold">{opp.revenueEstimate || "Varies"}</div>
              <div className="text-[10px] text-muted-foreground">Revenue Est.</div>
            </Card>
            <Card className="glass-card rounded-xl p-4 text-center">
              <Code className="w-5 h-5 text-violet-400 mx-auto mb-2" />
              <div className="text-lg font-bold">{opp.developmentSpec.complexity}</div>
              <div className="text-[10px] text-muted-foreground">Complexity</div>
            </Card>
            <Card className="glass-card rounded-xl p-4 text-center">
              <Rocket className="w-5 h-5 text-orange-400 mx-auto mb-2" />
              <div className="text-lg font-bold">{opp.buildCount}</div>
              <div className="text-[10px] text-muted-foreground">Builders</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="glass-card rounded-xl p-5" data-testid="card-tech-stack">
              <div className="flex items-center gap-2 mb-3">
                <Code className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold">Tech Stack</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {opp.developmentSpec.techStack.map((tech) => (
                  <Badge key={tech} variant="outline" className="text-xs bg-violet-500/10 text-violet-300 border-violet-500/20">
                    {tech}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="glass-card rounded-xl p-5" data-testid="card-features">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">Core Features</h3>
              </div>
              <ul className="space-y-2">
                {opp.developmentSpec.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" /> {feature}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {opp.targetAudience && (
            <Card className="glass-card rounded-xl p-5" data-testid="card-audience">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold">Target Audience</h3>
              </div>
              <p className="text-sm text-muted-foreground">{opp.targetAudience}</p>
            </Card>
          )}

          {opp.competitiveEdge && (
            <Card className="glass-card rounded-xl p-5" data-testid="card-competitive-edge">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold">Competitive Edge</h3>
              </div>
              <p className="text-sm text-muted-foreground">{opp.competitiveEdge}</p>
            </Card>
          )}

          <Card className="glass-card rounded-xl p-5" data-testid="card-monetization">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Readiness Model</h3>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 capitalize">
                {opp.monetizationModel}
              </Badge>
              {opp.revenueEstimate && (
                <span className="text-sm text-muted-foreground">Revenue estimate disabled until a future approved marketplace phase.</span>
              )}
            </div>
          </Card>

          <Card className="glass-card rounded-xl p-5 border-amber-500/10" data-testid="card-legal">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Legal Requirements & Disclaimers</h3>
            </div>
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Requirements</h4>
                <ul className="space-y-1.5">
                  {opp.legalRequirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> {req}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Auto-Attached Disclaimers</h4>
                <ul className="space-y-1.5">
                  {opp.legalDisclaimers.map((disc, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" /> {disc}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {!buildStarted ? (
            <Card className="glass-card rounded-xl p-6 border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5" data-testid="card-build-cta">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Ready to build?</h3>
                  <p className="text-sm text-muted-foreground">Generate a project scaffold and start building this app</p>
                </div>
                <Button
                  size="lg"
                  onClick={() => buildMutation.mutate()}
                  disabled={buildMutation.isPending}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-build-this-app"
                >
                  {buildMutation.isPending ? (
                    <>Generating...</>
                  ) : (
                    <><Rocket className="w-5 h-5 mr-2" /> Build This App</>
                  )}
                </Button>
              </div>
            </Card>
          ) : scaffoldData && (
            <Card className="glass-card rounded-xl p-6 border-emerald-500/20" data-testid="card-scaffold-result">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-semibold">Project Scaffold Generated!</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Project Name</h4>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-white/[0.06] px-3 py-1.5 rounded" data-testid="text-project-name">{scaffoldData.name}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(scaffoldData.name);
                        toast({ title: "Copied!" });
                      }}
                      data-testid="button-copy-name"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Scaffold Files</h4>
                  <div className="space-y-2">
                    {Object.entries(scaffoldData.files).map(([filename, content]) => (
                      <Card key={filename} className="bg-white/[0.04] p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-xs text-primary">{filename}</code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(content as string);
                              toast({ title: `Copied ${filename}!` });
                            }}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <pre className="text-[11px] text-muted-foreground overflow-x-auto max-h-32 whitespace-pre-wrap">{(content as string).slice(0, 500)}{(content as string).length > 500 ? "..." : ""}</pre>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Legal Disclaimers (Auto-attached)</h4>
                  <ul className="space-y-1">
                    {scaffoldData.legalDisclaimers?.map((d: string, i: number) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <Shield className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> {d}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button className="bg-primary hover:bg-primary/90" data-testid="button-open-in-replit">
                    <ExternalLink className="w-4 h-4 mr-2" /> Open in Replit
                  </Button>
                  <Button variant="outline" data-testid="button-download-scaffold">
                    <Download className="w-4 h-4 mr-2" /> Download Files
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
