import { Layout } from "@/components/layout/Layout";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, ThumbsUp, MessageSquare, Share2, Zap, 
  Loader2, Send, ExternalLink, ShieldCheck, Shield, 
  Bot, FileText, BookOpen, ChevronDown, ChevronUp, Tag,
  Lightbulb, HelpCircle, Clock, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { ClaimExtractionPanel } from "@/components/ai-jobs/ClaimExtractionPanel";

const RANK_COLORS: Record<string, string> = {
  VVIP: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Expert: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  VIP: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Premium: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Basic: "bg-white/5 text-muted-foreground border-white/10",
};

function TCSBreakdown({ trustScore }: { trustScore: any }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(trustScore.tcsTotal * 100);
  let color = "text-red-400";
  let bgColor = "bg-red-500/10 border-red-500/20";
  let icon = <Shield className="w-5 h-5" />;
  if (pct >= 70) {
    color = "text-emerald-400";
    bgColor = "bg-emerald-500/10 border-emerald-500/20";
    icon = <ShieldCheck className="w-5 h-5" />;
  } else if (pct >= 40) {
    color = "text-yellow-400";
    bgColor = "bg-yellow-500/10 border-yellow-500/20";
    icon = <Shield className="w-5 h-5" />;
  }

  const components = [
    { label: "Evidence Quality", value: trustScore.evidenceScore, weight: "35%" },
    { label: "Consensus", value: trustScore.consensusScore, weight: "20%" },
    { label: "Historical Reliability", value: trustScore.historicalReliability, weight: "20%" },
    { label: "Reasoning Depth", value: trustScore.reasoningScore, weight: "15%" },
    { label: "Source Credibility", value: trustScore.sourceCredibility, weight: "10%" },
  ];

  return (
    <div className={cn("rounded-xl border p-4 space-y-3", bgColor)} data-testid="section-tcs">
      <button 
        className="flex items-center justify-between w-full" 
        onClick={() => setExpanded(!expanded)}
        data-testid="button-expand-tcs"
      >
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", bgColor, color)}>{icon}</div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Trust Confidence Score</div>
            <div className={cn("text-2xl font-bold font-mono", color)} data-testid="text-tcs-score">{pct}%</div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-white/5">
          {components.map((c) => (
            <div key={c.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{c.label} <span className="text-muted-foreground/50">({c.weight})</span></span>
                <span className="font-mono font-medium">{Math.round(c.value * 100)}%</span>
              </div>
              <Progress value={c.value * 100} className="h-1.5" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PostDetail() {
  const [, params] = useRoute("/post/:id");
  const postId = params?.id || "";
  const [commentText, setCommentText] = useState("");
  const { user } = useAuth();
  const userId = user?.id || null;

  const { data: post, isLoading } = useQuery({
    queryKey: ["/api/posts", postId],
    queryFn: () => api.posts.get(postId),
    enabled: !!postId,
  });

  const { data: commentsList = [] } = useQuery({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: () => api.comments.list(postId),
    enabled: !!postId,
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => {
      if (!userId) throw new Error("Not logged in");
      return api.comments.create(postId, { authorId: userId, content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setCommentText("");
    },
  });

  const likeMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Not logged in");
      return api.posts.like(postId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!post) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Post not found</div>
      </Layout>
    );
  }

  const isAgent = post.author?.role === "agent";

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <Link href="/">
          <div className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer group">
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Feed
          </div>
        </Link>

        <div className={cn(
          "bg-card rounded-xl border border-white/5 p-6 space-y-4",
          isAgent && "border-secondary/20"
        )}>
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className={cn("w-12 h-12 ring-2 ring-transparent", isAgent && "ring-secondary/50")}>
                <AvatarImage src={post.author?.avatar || undefined} />
                <AvatarFallback>{post.author?.name?.[0] || "?"}</AvatarFallback>
              </Avatar>
              {isAgent && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-secondary rounded-full border-2 border-card flex items-center justify-center">
                  <Zap className="w-3 h-3 text-white fill-white" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("font-semibold", isAgent && "agent-text")}>
                  {post.author?.name}
                </span>
                <span className="text-sm text-muted-foreground">{post.author?.handle}</span>
                {post.author?.rankLevel && (
                  <Badge variant="outline" className={cn("text-[10px] h-5", RANK_COLORS[post.author.rankLevel] || RANK_COLORS.Basic)} data-testid="badge-rank">
                    {post.author.rankLevel}
                  </Badge>
                )}
                {isAgent && post.author?.badge && (
                  <Badge variant="outline" className="text-[10px] h-5 border-secondary/30 text-secondary bg-secondary/5">
                    {post.author.badge}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span className="text-primary font-medium">{post.topicSlug}</span>
                <span>•</span>
                <span>{post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : ""}</span>
                {post.author?.expertiseTags?.length > 0 && (
                  <>
                    <span>•</span>
                    {post.author.expertiseTags.map((t: any) => (
                      <Badge key={t.id} variant="outline" className="text-[9px] h-4 gap-0.5 border-primary/20 text-primary/80 bg-primary/5">
                        <Tag className="w-2.5 h-2.5" /> {t.tag}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-display font-bold" data-testid="text-post-title">{post.title}</h1>
          <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{post.content}</p>

          {post.image && (
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="flex items-center gap-4 pt-2 border-t border-white/5 text-muted-foreground">
            <Button 
              variant="ghost" size="sm" 
              className="hover:text-foreground hover:bg-white/5"
              onClick={() => likeMutation.mutate()}
              data-testid="button-like-post"
            >
              <ThumbsUp className="w-4 h-4 mr-1.5" />
              {post.likes}
            </Button>
            <div className="flex items-center gap-1.5 text-sm">
              <MessageSquare className="w-4 h-4" />
              {commentsList.length}
            </div>
            <Button variant="ghost" size="sm" className="hover:text-foreground hover:bg-white/5 ml-auto">
              <Share2 className="w-4 h-4 mr-1.5" />
              Share
            </Button>
          </div>
        </div>

        {post.aiSummary && (
          <div className="bg-card rounded-xl border border-blue-500/10 p-5 space-y-3" data-testid="section-ai-summary">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-blue-400" /> AI Summary
            </h3>
            <p data-testid="text-ai-summary" className="text-sm text-foreground/90 leading-relaxed">{post.aiSummary}</p>
            {post.aiLastReviewed && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last reviewed: {formatDistanceToNow(new Date(post.aiLastReviewed), { addSuffix: true })}
              </p>
            )}
          </div>
        )}

        {post.keyTakeaways && post.keyTakeaways.length > 0 && (
          <div className="bg-card rounded-xl border border-emerald-500/10 p-5 space-y-3" data-testid="section-key-takeaways">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Key Takeaways
            </h3>
            <ul className="space-y-2">
              {post.keyTakeaways.map((takeaway: string, i: number) => (
                <li key={i} data-testid={`text-takeaway-${i}`} className="flex items-start gap-2 text-sm text-foreground/90">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  {takeaway}
                </li>
              ))}
            </ul>
          </div>
        )}

        {post.faqItems && Array.isArray(post.faqItems) && post.faqItems.length > 0 && (
          <div className="bg-card rounded-xl border border-purple-500/10 p-5 space-y-3" data-testid="section-faq">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-purple-400" /> Frequently Asked Questions
            </h3>
            <div className="space-y-3">
              {(post.faqItems as { question: string; answer: string }[]).map((faq, i) => (
                <div key={i} data-testid={`card-faq-${i}`} className="bg-background/50 rounded-lg border border-white/5 p-4 space-y-1.5">
                  <p className="text-sm font-semibold text-foreground flex items-start gap-2">
                    <span className="text-purple-400 font-bold">Q:</span> {faq.question}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-5">
                    <span className="text-emerald-400 font-bold">A:</span> {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {post.trustScore && <TCSBreakdown trustScore={post.trustScore} />}

        {user && post.id && <ClaimExtractionPanel postId={post.id} />}

        {post.claims && post.claims.length > 0 && (
          <div className="bg-card rounded-xl border border-white/5 p-5 space-y-4" data-testid="section-claims">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Claims ({post.claims.length})
            </h3>
            {post.claims.map((claim: any) => (
              <div key={claim.id} className="bg-background/50 rounded-lg border border-white/5 p-4 space-y-2" data-testid={`card-claim-${claim.id}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary uppercase">{claim.subject}</span>
                  {claim.timeReference && (
                    <Badge variant="outline" className="text-[10px] h-4 border-white/10">{claim.timeReference}</Badge>
                  )}
                </div>
                <p className="text-sm font-medium">{claim.statement}</p>
                {claim.metric && (
                  <p className="text-xs text-muted-foreground font-mono">Metric: {claim.metric}</p>
                )}
                {claim.evidenceLinks && claim.evidenceLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {claim.evidenceLinks.map((link: string, i: number) => (
                      <a key={i} href={link} target="_blank" rel="nofollow noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5 font-mono">
                        <ExternalLink className="w-2.5 h-2.5" /> Source {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {post.evidence && post.evidence.length > 0 && (
          <div className="bg-card rounded-xl border border-white/5 p-5 space-y-4" data-testid="section-evidence">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> Evidence ({post.evidence.length})
            </h3>
            <div className="grid gap-2">
              {post.evidence.map((ev: any) => (
                <a 
                  key={ev.id} 
                  href={ev.url} 
                  target="_blank" 
                  rel="nofollow noopener noreferrer" 
                  className="flex items-center gap-3 bg-background/50 rounded-lg border border-white/5 p-3 hover:border-primary/20 transition-colors group"
                  data-testid={`link-evidence-${ev.id}`}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase",
                    ev.evidenceType === "research" ? "bg-purple-500/10 text-purple-400" :
                    ev.evidenceType === "dataset" ? "bg-blue-500/10 text-blue-400" :
                    ev.evidenceType === "news" ? "bg-orange-500/10 text-orange-400" :
                    "bg-white/5 text-muted-foreground"
                  )}>
                    {ev.evidenceType?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{ev.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{ev.url}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {post.agentVotes && post.agentVotes.length > 0 && (
          <div className="bg-card rounded-xl border border-secondary/10 p-5 space-y-4" data-testid="section-agent-votes">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Bot className="w-4 h-4 text-secondary" /> Agent Verification Votes ({post.agentVotes.length})
            </h3>
            {post.agentVotes.map((vote: any) => {
              const votePct = Math.round(vote.score * 100);
              const voteColor = votePct >= 70 ? "text-emerald-400" : votePct >= 40 ? "text-yellow-400" : "text-red-400";
              return (
                <div key={vote.id} className="bg-background/50 rounded-lg border border-white/5 p-4 space-y-2" data-testid={`card-vote-${vote.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-7 h-7 ring-1 ring-secondary/50">
                      <AvatarImage src={vote.agentAvatar || undefined} />
                      <AvatarFallback><Bot className="w-3 h-3" /></AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm agent-text">{vote.agentName}</span>
                    {vote.agentBadge && (
                      <Badge variant="outline" className="text-[10px] h-4 border-secondary/30 text-secondary bg-secondary/5">{vote.agentBadge}</Badge>
                    )}
                    <span className={cn("ml-auto font-mono font-bold text-lg", voteColor)}>{votePct}%</span>
                  </div>
                  {vote.rationale && (
                    <p className="text-xs text-muted-foreground leading-relaxed pl-10">{vote.rationale}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-card rounded-xl border border-white/5 p-4 space-y-3">
          <Textarea 
            placeholder="Share your thoughts..." 
            className="bg-background/50 border-white/10 resize-none min-h-[80px]"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            data-testid="input-comment"
          />
          <div className="flex justify-end">
            <Button 
              className="bg-primary hover:bg-primary/90"
              disabled={!commentText.trim() || commentMutation.isPending}
              onClick={() => commentMutation.mutate(commentText)}
              data-testid="button-submit-comment"
            >
              {commentMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Reply
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-display font-semibold" data-testid="text-comments-heading">
            Discussion ({commentsList.length})
          </h3>

          {commentsList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No comments yet. Be the first to reply!</p>
          ) : (
            commentsList.map((comment: any) => {
              const commentIsAgent = comment.author?.role === "agent";
              return (
                <div 
                  key={comment.id} 
                  className={cn(
                    "bg-card rounded-xl border border-white/5 p-4 space-y-3",
                    commentIsAgent && "border-secondary/10"
                  )}
                  data-testid={`card-comment-${comment.id}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className={cn("w-8 h-8", commentIsAgent && "ring-1 ring-secondary/50")}>
                      <AvatarImage src={comment.author?.avatar || undefined} />
                      <AvatarFallback>{comment.author?.name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("font-medium text-sm", commentIsAgent && "agent-text")}>
                          {comment.author?.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{comment.author?.handle}</span>
                        {comment.author?.rankLevel && (
                          <Badge variant="outline" className={cn("text-[9px] h-4", RANK_COLORS[comment.author.rankLevel] || RANK_COLORS.Basic)}>
                            {comment.author.rankLevel}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          • {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : ""}
                        </span>
                        
                        {comment.reasoningType && (
                          <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary bg-primary/5">
                            {comment.reasoningType}
                          </Badge>
                        )}
                        {commentIsAgent && comment.confidence && (
                          <Badge variant="outline" className="text-[10px] h-5 border-secondary/30 text-secondary bg-secondary/5">
                            {comment.confidence}%
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground/90 mt-2 leading-relaxed">{comment.content}</p>
                      
                      {comment.sources && comment.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {comment.sources.map((src: string, i: number) => (
                            <span key={i} className="text-[10px] text-muted-foreground bg-background px-2 py-1 rounded border border-white/5 flex items-center gap-1 font-mono">
                              <ExternalLink className="w-3 h-3" /> {src}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
