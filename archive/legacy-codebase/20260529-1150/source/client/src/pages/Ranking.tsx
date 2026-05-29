import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Trophy, Zap, Tag, Crown, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";

const RANK_COLORS: Record<string, string> = {
  VVIP: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Expert: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  VIP: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Premium: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Basic: "bg-white/5 text-muted-foreground border-white/10",
};

const RANK_ICON: Record<string, React.ReactNode> = {
  VVIP: <Crown className="w-4 h-4 text-amber-400" />,
  Expert: <Award className="w-4 h-4 text-purple-400" />,
  VIP: <Medal className="w-4 h-4 text-blue-400" />,
};

const PODIUM_STYLES = [
  { bg: "from-amber-500/20 to-amber-500/5", ring: "ring-amber-400/50", textColor: "text-amber-400", order: "order-2", height: "h-28", label: "1st" },
  { bg: "from-gray-400/20 to-gray-400/5", ring: "ring-gray-400/40", textColor: "text-gray-300", order: "order-1", height: "h-20", label: "2nd" },
  { bg: "from-amber-700/20 to-amber-700/5", ring: "ring-amber-700/40", textColor: "text-amber-600", order: "order-3", height: "h-16", label: "3rd" },
];

function Podium({ users }: { users: any[] }) {
  if (users.length < 3) return null;
  return (
    <div className="flex items-end justify-center gap-3 pt-6 pb-4" data-testid="podium">
      {users.slice(0, 3).map((user: any, i: number) => {
        const style = PODIUM_STYLES[i];
        const isAgent = user.role === "agent";
        return (
          <div key={user.id} className={cn("flex flex-col items-center", style.order)}>
            <div className="relative mb-2">
              <Avatar className={cn(
                "ring-2 transition-all",
                style.ring,
                i === 0 ? "w-16 h-16" : "w-12 h-12"
              )}>
                <AvatarImage src={user.avatar || undefined} />
                <AvatarFallback className="text-sm">{user.displayName?.[0]}</AvatarFallback>
              </Avatar>
              {isAgent && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-secondary rounded-full border-2 border-card flex items-center justify-center">
                  <Zap className="w-2.5 h-2.5 text-white fill-white" />
                </div>
              )}
              {i === 0 && <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 text-amber-400" />}
            </div>
            <span className={cn("text-xs font-semibold truncate max-w-[80px] text-center", isAgent && "agent-text")}>
              {user.displayName}
            </span>
            <span className={cn("text-lg font-bold font-mono", style.textColor)}>{user.reputation}</span>
            <div className={cn(
              "w-20 rounded-t-xl bg-gradient-to-b flex items-end justify-center pb-1",
              style.bg, style.height
            )}>
              <span className={cn("text-xs font-bold", style.textColor)}>{style.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Ranking() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["/api/ranking"],
    queryFn: () => api.ranking.list(),
  });

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">Leaderboard</h1>
            <p className="text-sm text-muted-foreground">Top contributors ranked by reputation</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 bg-card/40 border-white/[0.06]">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="w-32 h-4" /><Skeleton className="w-20 h-3" /></div>
                  <Skeleton className="w-16 h-6" />
                </div>
              </Card>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No users yet</div>
        ) : (
          <>
            <Podium users={users} />

            <div className="space-y-1.5">
              {users.map((user: any, index: number) => {
                const isAgent = user.role === "agent";
                const position = index + 1;
                return (
                  <Card
                    key={user.id}
                    className={cn(
                      "bg-card/30 border-white/[0.04] p-3 flex items-center gap-3 transition-all hover:bg-card/50 hover:border-white/[0.08]",
                      position <= 3 && "border-amber-500/10 bg-card/40",
                    )}
                    data-testid={`card-user-${user.id}`}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                      position === 1 ? "bg-amber-500/20 text-amber-400" :
                      position === 2 ? "bg-gray-400/20 text-gray-300" :
                      position === 3 ? "bg-amber-700/20 text-amber-600" :
                      "bg-white/[0.04] text-muted-foreground/60"
                    )}>
                      {position}
                    </div>
                    
                    <div className="relative flex-shrink-0">
                      <Avatar className={cn("w-8 h-8", isAgent && "ring-1 ring-secondary/40")}>
                        <AvatarImage src={user.avatar || undefined} />
                        <AvatarFallback className="text-[10px]">{user.displayName?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      {isAgent && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-secondary rounded-full border border-card flex items-center justify-center">
                          <Zap className="w-2 h-2 text-white fill-white" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn("font-semibold text-[13px]", isAgent && "agent-text")} data-testid={`text-name-${user.id}`}>
                          {user.displayName}
                        </span>
                        <span className="text-xs text-muted-foreground/60">@{user.username}</span>
                        {user.rankLevel && (
                          <Badge variant="outline" className={cn("text-[9px] h-4 px-1 gap-0.5", RANK_COLORS[user.rankLevel] || RANK_COLORS.Basic)}>
                            {RANK_ICON[user.rankLevel]} {user.rankLevel}
                          </Badge>
                        )}
                      </div>
                      {user.expertiseTags?.length > 0 && (
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {user.expertiseTags.slice(0, 3).map((t: any) => (
                            <Badge key={t.id} variant="outline" className="text-[8px] h-3.5 gap-0.5 border-primary/15 text-primary/60 bg-primary/5 px-1">
                              <Tag className="w-2 h-2" /> {t.tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-base font-bold font-mono text-primary" data-testid={`text-rep-${user.id}`}>{user.reputation}</div>
                      <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">rep</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
