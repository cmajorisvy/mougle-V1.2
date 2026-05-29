import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, MessageSquare, Share2, MoreHorizontal, Zap, Shield, ShieldCheck, FileText, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

const RANK_COLORS: Record<string, string> = {
  VVIP: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Expert: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  VIP: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Premium: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Basic: "bg-white/5 text-muted-foreground border-white/10",
};

function TCSBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  let color = "bg-red-500/10 text-red-400 border-red-500/30";
  let icon = <Shield className="w-3 h-3" />;
  if (pct >= 70) {
    color = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    icon = <ShieldCheck className="w-3 h-3" />;
  } else if (pct >= 40) {
    color = "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    icon = <Shield className="w-3 h-3" />;
  }
  return (
    <Badge variant="outline" className={cn("text-[10px] h-5 gap-1 font-mono", color)} data-testid="badge-tcs">
      {icon} TCS {pct}%
    </Badge>
  );
}

interface PostCardProps {
  id: string;
  title: string;
  content: string;
  image?: string | null;
  topicSlug: string;
  likes: number;
  comments: number;
  createdAt: string;
  author: {
    name: string;
    handle: string;
    avatar: string | null;
    role: string;
    confidence?: number | null;
    badge?: string | null;
    reputation?: number | null;
    rankLevel?: string | null;
  } | null;
  isDebate?: boolean;
  debateActive?: boolean;
  trustScore?: { tcsTotal: number } | null;
  agentVoteCount?: number;
  claimCount?: number;
}

export function PostCard({ id, title, content, image, topicSlug, likes, comments, author, isDebate, debateActive, createdAt, trustScore, agentVoteCount, claimCount }: PostCardProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAgent = author?.role === "agent";
  const timeAgo = createdAt ? formatDistanceToNow(new Date(createdAt), { addSuffix: true }) : "";

  const likeMutation = useMutation({
    mutationFn: () => {
      const userId = user?.id || null;
      if (!userId) throw new Error("Not logged in");
      return api.posts.like(id, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
  });

  const handleCardClick = () => navigate(`/post/${id}`);

  return (
    <Card className={cn(
      "bg-card/40 border-white/[0.06] overflow-hidden transition-all duration-200 hover:border-white/[0.1] hover:bg-card/60 group cursor-pointer",
      isAgent && "border-secondary/10 hover:border-secondary/20"
    )} data-testid={`card-post-${id}`} onClick={handleCardClick} role="article" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && handleCardClick()}>
      <CardHeader className="flex flex-row items-start gap-3 pb-2 pt-4 px-4">
        <div className="relative flex-shrink-0">
          <Avatar className={cn("w-9 h-9 ring-1 ring-white/10", isAgent && "ring-secondary/40")} data-testid={`avatar-author-${id}`}>
            <AvatarImage src={author?.avatar || undefined} />
            <AvatarFallback className="text-xs">{author?.name?.[0] || "?"}</AvatarFallback>
          </Avatar>
          {isAgent && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-secondary rounded-full border-2 border-card flex items-center justify-center" data-testid={`badge-agent-${id}`}>
              <Zap className="w-2 h-2 text-white fill-white" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("font-medium text-[13px]", isAgent ? "agent-text font-semibold" : "text-foreground")} data-testid={`text-author-${id}`}>
              {author?.name || "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground/60" data-testid={`text-handle-${id}`}>{author?.handle}</span>
            {author?.rankLevel && (
              <Badge variant="outline" className={cn("text-[9px] h-4 px-1", RANK_COLORS[author.rankLevel] || RANK_COLORS.Basic)} data-testid={`badge-rank-${id}`}>
                {author.rankLevel}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground/60" data-testid={`text-time-${id}`}>{timeAgo}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/20 text-primary/70 bg-primary/5" data-testid={`badge-topic-${id}`}>{topicSlug}</Badge>
            {isAgent && author?.badge && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-secondary/20 text-secondary/70 bg-secondary/5" data-testid={`badge-expertise-${id}`}>
                {author.badge}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-2 px-4 space-y-2">
        <h3 className="text-[15px] font-display font-semibold leading-snug group-hover:text-primary transition-colors" data-testid={`text-title-${id}`}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-2" data-testid={`text-content-${id}`}>
          {content}
        </p>
        
        {image && (
          <div className="relative aspect-video rounded-xl overflow-hidden bg-muted mt-2">
            <img src={image} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" data-testid={`img-post-${id}`} />
          </div>
        )}

        {(trustScore || (agentVoteCount && agentVoteCount > 0) || (claimCount && claimCount > 0)) && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {trustScore && <TCSBadge score={trustScore.tcsTotal} />}
            {agentVoteCount !== undefined && agentVoteCount > 0 && (
              <Badge variant="outline" className="text-[9px] h-5 gap-1 border-secondary/20 text-secondary/70 bg-secondary/5" data-testid={`badge-agent-votes-${id}`}>
                <Bot className="w-3 h-3" /> {agentVoteCount} Votes
              </Badge>
            )}
            {claimCount !== undefined && claimCount > 0 && (
              <Badge variant="outline" className="text-[9px] h-5 gap-1 border-primary/20 text-primary/70 bg-primary/5" data-testid={`badge-claims-${id}`}>
                <FileText className="w-3 h-3" /> {claimCount} Claims
              </Badge>
            )}
          </div>
        )}

      </CardContent>

      <CardFooter className="pt-1 pb-3 px-4 flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" size="sm" 
            className="h-7 px-2 text-xs hover:text-foreground hover:bg-white/[0.04] rounded-lg gap-1"
            onClick={(e) => { e.stopPropagation(); likeMutation.mutate(); }}
            data-testid={`button-like-${id}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span className="font-medium" data-testid={`text-likes-${id}`}>{likes}</span>
          </Button>
          <Button 
            variant="ghost" size="sm" 
            className="h-7 px-2 text-xs hover:text-foreground hover:bg-white/[0.04] rounded-lg gap-1"
            onClick={(e) => { e.stopPropagation(); navigate(`/post/${id}`); }}
            data-testid={`button-comments-${id}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="font-medium" data-testid={`text-comments-${id}`}>{comments}</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs hover:text-foreground hover:bg-white/[0.04] rounded-lg gap-1" onClick={(e) => e.stopPropagation()} data-testid={`button-share-${id}`}>
            <Share2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-foreground hover:bg-white/[0.04] rounded-lg" onClick={(e) => e.stopPropagation()} data-testid={`button-more-${id}`}>
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
      </CardFooter>
    </Card>
  );
}
