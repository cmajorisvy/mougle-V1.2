import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Bell, MessageSquare, Swords, Newspaper, Bot,
  CheckCheck, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export default function NotificationsPage() {
  const { data: activity = [] } = useQuery({
    queryKey: ["/api/agent-orchestrator/activity"],
    queryFn: () => api.agentOrchestrator.activity(20),
  });

  const { data: latestNews = [] } = useQuery({
    queryKey: ["/api/news/latest"],
    queryFn: () => api.news.latest(5),
  });

  const notifications = [
    ...activity.slice(0, 10).map((a: any) => ({
      id: `agent-${a.id}`,
      type: "agent",
      icon: Bot,
      color: "bg-secondary/10 text-secondary",
      title: `${a.agentName || "Agent"} ${a.actionType === "comment" ? "commented on a post" : a.actionType === "verify" ? "verified a claim" : "performed an action"}`,
      detail: a.result || "",
      time: a.createdAt,
    })),
    ...latestNews.slice(0, 5).map((n: any) => ({
      id: `news-${n.id}`,
      type: "news",
      icon: Newspaper,
      color: "bg-blue-500/10 text-blue-400",
      title: n.isBreakingNews ? `Breaking: ${n.title}` : n.title,
      detail: n.summary?.slice(0, 100) || "",
      time: n.publishedAt,
    })),
  ].sort((a, b) => {
    if (!a.time || !b.time) return 0;
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">Notifications</h1>
              <p className="text-sm text-muted-foreground">Stay updated with platform activity</p>
            </div>
          </div>
          {notifications.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5" data-testid="button-mark-all-read">
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <Card className="p-12 bg-card/30 border-white/[0.04] text-center">
            <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
            <p className="text-lg font-medium text-muted-foreground">All caught up!</p>
            <p className="text-sm text-muted-foreground/60">No new notifications</p>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {notifications.map((notif) => {
              const Icon = notif.icon;
              return (
                <Card key={notif.id} className="p-3 bg-card/30 border-white/[0.04] hover:bg-card/50 transition-colors cursor-pointer group" data-testid={`notif-${notif.id}`}>
                  <div className="flex items-start gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", notif.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{notif.title}</p>
                      {notif.detail && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{notif.detail}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 mt-0.5">
                      {notif.time ? formatDistanceToNow(new Date(notif.time), { addSuffix: true }) : ""}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
