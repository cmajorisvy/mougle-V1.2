import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  User, Trophy, Zap, MessageSquare, Swords, Tag,
  Crown, Award, Medal, TrendingUp, Calendar
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const RANK_COLORS: Record<string, string> = {
  VVIP: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Expert: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  VIP: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Premium: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Basic: "bg-white/5 text-muted-foreground border-white/10",
};

const RANK_ICONS: Record<string, any> = { VVIP: Crown, Expert: Award, VIP: Medal };

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id || null;

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/users", currentUserId],
    queryFn: () => api.users.get(currentUserId!),
    enabled: !!currentUserId,
  });

  const { data: ranking = [] } = useQuery({
    queryKey: ["/api/ranking"],
    queryFn: () => api.ranking.list(),
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["/api/posts"],
    queryFn: () => api.posts.list(),
  });

  const userRank = user ? ranking.findIndex((u: any) => u.id === currentUserId) + 1 : 0;
  const userPosts = posts.filter((p: any) => p.author?.handle === `@${user?.username}`);

  if (!currentUserId) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Sign in to view your profile</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        {isLoading ? (
          <Card className="p-6 bg-card/50 border-white/[0.06]">
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-full" />
              <div className="space-y-2"><Skeleton className="w-40 h-5" /><Skeleton className="w-24 h-3" /></div>
            </div>
          </Card>
        ) : user ? (
          <>
            <Card className="p-6 bg-card/50 border-white/[0.06] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-transparent" />
              <div className="relative flex flex-col md:flex-row items-start md:items-center gap-5">
                <Avatar className="w-16 h-16 ring-2 ring-primary/30">
                  <AvatarImage src={user.avatar || undefined} />
                  <AvatarFallback className="text-lg bg-primary/20 text-primary">{user.displayName?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-display font-bold" data-testid="text-profile-name">{user.displayName}</h1>
                    {user.rankLevel && (
                      <Badge variant="outline" className={cn("text-xs gap-1", RANK_COLORS[user.rankLevel])}>
                        {RANK_ICONS[user.rankLevel] && (() => { const I = RANK_ICONS[user.rankLevel]; return <I className="w-3 h-3" />; })()}
                        {user.rankLevel}
                      </Badge>
                    )}
                    {user.badge && (
                      <Badge variant="outline" className="text-xs border-secondary/30 text-secondary bg-secondary/5">{user.badge}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">@{user.username}</p>
                  {user.bio && <p className="text-sm text-foreground/80 mt-2">{user.bio}</p>}
                  {user.expertiseTags?.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {user.expertiseTags.map((t: any) => (
                        <Badge key={t.id} variant="outline" className="text-[10px] h-5 gap-0.5 border-primary/20 text-primary/80 bg-primary/5">
                          <Tag className="w-2.5 h-2.5" /> {t.tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 bg-card/50 border-white/[0.06] text-center">
                <Trophy className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <div className="text-xl font-bold font-mono">{user.reputation}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Reputation</div>
              </Card>
              <Card className="p-4 bg-card/50 border-white/[0.06] text-center">
                <TrendingUp className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <div className="text-xl font-bold font-mono">#{userRank || "--"}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Rank</div>
              </Card>
              <Card className="p-4 bg-card/50 border-white/[0.06] text-center">
                <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <div className="text-xl font-bold font-mono">{user.energy}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Credits</div>
              </Card>
              <Card className="p-4 bg-card/50 border-white/[0.06] text-center">
                <MessageSquare className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <div className="text-xl font-bold font-mono">{userPosts.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase">Posts</div>
              </Card>
            </div>

            {userPosts.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Recent Posts</h2>
                {userPosts.slice(0, 5).map((post: any) => (
                  <Card key={post.id} className="p-3 bg-card/30 border-white/[0.04] hover:bg-card/50 transition-colors">
                    <h3 className="text-sm font-medium">{post.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {post.comments}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : ""}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </Layout>
  );
}
