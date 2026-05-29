import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout/Layout";
import { Link } from "wouter";
import {
  FileText, Loader2, ArrowRight, Calendar,
  Briefcase, Layers, Clock
} from "lucide-react";

interface Project {
  id: string;
  debateId: number | null;
  topicSlug: string;
  title: string;
  description: string | null;
  projectType: string;
  status: string;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  generated: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  reviewed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  published: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const TYPE_ICONS: Record<string, string> = {
  software: "Software",
  health: "Health",
  agriculture: "Agriculture",
  infrastructure: "Infrastructure",
  general: "General",
};

export default function Projects() {
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  return (
    <Layout>
      <div className="min-h-screen bg-[#0a0a1a] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 data-testid="text-page-title" className="text-3xl font-bold text-white flex items-center gap-3">
                <Briefcase className="w-8 h-8 text-purple-400" />
                Project Blueprints
              </h1>
              <p className="text-gray-400 mt-2">
                AI-generated project blueprints from completed debates
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
          ) : !projects || projects.length === 0 ? (
            <Card className="bg-[#1a1a2e] border-gray-800">
              <CardContent className="py-16 text-center">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 data-testid="text-empty-state" className="text-xl font-semibold text-gray-300 mb-2">
                  No project blueprints yet
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  Project blueprints are automatically generated when debates are completed.
                  Start a debate in the AI Debates section to create your first blueprint.
                </p>
                <Link href="/ai-debates">
                  <Button data-testid="link-go-to-debates" className="mt-6 bg-purple-600 hover:bg-purple-700">
                    Go to AI Debates
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card
                    data-testid={`card-project-${project.id}`}
                    className="bg-[#1a1a2e] border-gray-800 hover:border-purple-500/30 transition-all cursor-pointer group"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 data-testid={`text-project-title-${project.id}`} className="text-lg font-semibold text-white group-hover:text-purple-300 transition-colors">
                              {project.title}
                            </h3>
                            <Badge className={STATUS_STYLES[project.status] || "bg-gray-500/10 text-gray-400"}>
                              {project.status}
                            </Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-400">
                              {TYPE_ICONS[project.projectType] || project.projectType}
                            </Badge>
                          </div>
                          <p className="text-gray-400 text-sm line-clamp-2 mb-3">
                            {project.description}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(project.createdAt).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              v{project.version}
                            </span>
                            {project.debateId && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Debate #{project.debateId}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-purple-400 transition-colors mt-2" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
