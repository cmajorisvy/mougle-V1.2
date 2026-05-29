import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, ArrowLeft, Clock, ExternalLink, Hash, Newspaper, FileText, Video, BookOpen, Heart, MessageCircle, ThumbsUp, Send, Reply, Bot, AlertTriangle, CheckCircle, Lightbulb } from "lucide-react";
import { ShareButtons } from "@/components/social/ShareButtons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRoute, Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";

const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  tech: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  science: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  business: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  policy: "bg-red-500/10 text-red-400 border-red-500/30",
  general: "bg-white/5 text-muted-foreground border-white/10",
};

const COMMENT_TYPE_ICONS: Record<string, any> = {
  verification: { icon: CheckCircle, label: "Verification Analysis", color: "text-green-400" },
  expert: { icon: Lightbulb, label: "Expert Analysis", color: "text-blue-400" },
  critic: { icon: AlertTriangle, label: "Critical Analysis", color: "text-amber-400" },
  general: { icon: MessageCircle, label: "Comment", color: "text-muted-foreground" },
};

function CommentItem({ comment, articleId, depth = 0 }: { comment: any; articleId: number; depth?: number }) {
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const typeInfo = COMMENT_TYPE_ICONS[comment.commentType] || COMMENT_TYPE_ICONS.general;
  const TypeIcon = typeInfo.icon;

  const replyMutation = useMutation({
    mutationFn: (data: { authorId: string; content: string; parentId: number }) =>
      api.news.postComment(articleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/news/${articleId}/comments`] });
      setReplyContent("");
      setShowReply(false);
    },
  });

  const likeMutation = useMutation({
    mutationFn: () => api.news.likeComment(comment.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/news/${articleId}/comments`] }),
  });

  return (
    <div className={cn("group", depth > 0 && "ml-6 border-l border-white/5 pl-4")} data-testid={`comment-${comment.id}`}>
      <div className="flex items-start gap-3 py-3">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={comment.author?.avatar} />
          <AvatarFallback className="text-xs">{comment.author?.displayName?.[0] || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{comment.author?.displayName || "Unknown"}</span>
            {comment.author?.role === "agent" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/30">
                <Bot className="w-2.5 h-2.5 mr-0.5" /> AI
              </Badge>
            )}
            {comment.commentType !== "general" && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", typeInfo.color)}>
                <TypeIcon className="w-2.5 h-2.5 mr-0.5" /> {typeInfo.label}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
          <div className="flex items-center gap-3 mt-2">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => likeMutation.mutate()}
              data-testid={`like-comment-${comment.id}`}
            >
              <ThumbsUp className="w-3 h-3" /> {comment.likes || 0}
            </button>
            {currentUserId && depth === 0 && (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowReply(!showReply)}
                data-testid={`reply-comment-${comment.id}`}
              >
                <Reply className="w-3 h-3" /> Reply
              </button>
            )}
          </div>
          {showReply && currentUserId && (
            <div className="flex gap-2 mt-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="min-h-[60px] text-sm bg-background/50 border-white/10 resize-none"
                data-testid={`reply-input-${comment.id}`}
              />
              <Button
                size="sm"
                className="self-end"
                disabled={!replyContent.trim() || replyMutation.isPending}
                onClick={() => replyMutation.mutate({ authorId: currentUserId, content: replyContent, parentId: comment.id })}
                data-testid={`reply-submit-${comment.id}`}
              >
                <Send className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {comment.replies?.map((reply: any) => (
        <CommentItem key={reply.id} comment={reply} articleId={articleId} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function AINewsArticle() {
  const [, params] = useRoute("/ai-news-updates/:idOrSlug");
  const idOrSlug = params?.idOrSlug || "";
  const isNumericId = /^\d+$/.test(idOrSlug);
  const [commentContent, setCommentContent] = useState("");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id || null;

  const { data: article, isLoading } = useQuery({
    queryKey: ["/api/news", idOrSlug],
    queryFn: () => isNumericId ? api.news.get(parseInt(idOrSlug)) : api.news.getBySlug(idOrSlug),
    enabled: !!idOrSlug,
  });

  const articleId = article?.id;

  const { data: comments = [] } = useQuery({
    queryKey: [`/api/news/${articleId}/comments`],
    queryFn: () => api.news.comments(articleId!),
    enabled: !!articleId,
  });

  const { data: likedData } = useQuery({
    queryKey: [`/api/news/${articleId}/liked`, currentUserId],
    queryFn: () => api.news.checkLiked(articleId!, currentUserId!),
    enabled: !!articleId && !!currentUserId,
  });

  const likeMutation = useMutation({
    mutationFn: () => api.news.toggleLike(articleId!, currentUserId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news", idOrSlug] });
      queryClient.invalidateQueries({ queryKey: [`/api/news/${articleId}/liked`, currentUserId] });
    },
  });

  const shareMutation = useMutation({
    mutationFn: () => api.news.share(articleId!, currentUserId!, "internal"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/news", idOrSlug] }),
  });

  const commentMutation = useMutation({
    mutationFn: (data: { authorId: string; content: string }) =>
      api.news.postComment(articleId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/news/${articleId}/comments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/news", idOrSlug] });
      setCommentContent("");
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

  if (!article) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">
          <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Article not found</p>
          <Link href="/ai-news-updates">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to News
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const isLiked = likedData?.liked || false;

  return (
    <Layout>
      <div className="space-y-6">
        <Link href="/ai-news-updates">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="button-back-news">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to AI News
          </Button>
        </Link>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className={cn("text-xs", CATEGORY_COLORS[article.category] || CATEGORY_COLORS.general)}>
              {article.category?.toUpperCase()}
            </Badge>
            {article.isBreakingNews && (
              <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
                BREAKING
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{article.sourceName}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : "Recently"}
            </span>
            {article.impactScore && (
              <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10">
                Impact: {article.impactScore}/100
              </Badge>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-bold mb-4" data-testid="text-article-title">
            {article.title}
          </h1>

          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-48 md:h-64 object-cover rounded-xl mb-4 bg-white/5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}

          {article.summary && (
            <Card className="bg-primary/5 border-primary/20 mb-6">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-primary/90 leading-relaxed" data-testid="text-article-summary">
                  {article.summary}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex items-center gap-3 py-3 border-y border-white/5" data-testid="social-actions">
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1.5 text-sm", isLiked ? "text-red-400 hover:text-red-300" : "text-muted-foreground hover:text-foreground")}
            onClick={() => currentUserId && likeMutation.mutate()}
            disabled={!currentUserId || likeMutation.isPending}
            data-testid="button-like"
          >
            <Heart className={cn("w-4 h-4", isLiked && "fill-red-400")} />
            {article.likesCount || 0}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              const el = document.getElementById("comments-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            data-testid="button-comment-scroll"
          >
            <MessageCircle className="w-4 h-4" />
            {article.commentsCount || 0}
          </Button>
          <ShareButtons
            title={article.title}
            url={`/ai-news-updates/${article.slug || article.id}`}
            description={article.summary}
            compact
          />
        </div>

        <Tabs defaultValue="article" className="w-full">
          <TabsList className="bg-card border border-white/10 w-full grid grid-cols-3">
            <TabsTrigger value="article" className="text-xs" data-testid="tab-article">
              <FileText className="w-3.5 h-3.5 mr-1" /> Article
            </TabsTrigger>
            <TabsTrigger value="seo" className="text-xs" data-testid="tab-seo">
              <BookOpen className="w-3.5 h-3.5 mr-1" /> SEO Blog
            </TabsTrigger>
            <TabsTrigger value="script" className="text-xs" data-testid="tab-script">
              <Video className="w-3.5 h-3.5 mr-1" /> Video Script
            </TabsTrigger>
          </TabsList>

          <TabsContent value="article">
            <Card className="bg-card/50 border-white/5">
              <CardContent className="p-6">
                <div className="prose prose-invert prose-sm max-w-none">
                  {article.content?.split("\n").map((para: string, i: number) => (
                    para.trim() ? <p key={i} className="text-foreground/90 leading-relaxed mb-4">{para}</p> : null
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seo">
            <Card className="bg-card/50 border-white/5">
              <CardContent className="p-6">
                <div className="prose prose-invert prose-sm max-w-none">
                  {article.seoBlog?.split("\n").map((para: string, i: number) => {
                    if (para.startsWith("**") && para.endsWith("**")) {
                      return <h3 key={i} className="text-lg font-display font-semibold text-primary mt-4 mb-2">{para.replace(/\*\*/g, "")}</h3>;
                    }
                    return para.trim() ? <p key={i} className="text-foreground/90 leading-relaxed mb-4">{para}</p> : null;
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="script">
            <Card className="bg-card/50 border-white/5">
              <CardContent className="p-6">
                <div className="bg-background/50 rounded-lg p-4 border border-white/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-primary">60-Second Video Script</span>
                  </div>
                  <p className="text-foreground/90 leading-relaxed italic" data-testid="text-video-script">
                    {article.script || "No script generated yet."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 flex-wrap">
            {article.hashtags?.map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs bg-background border-white/10">
                <Hash className="w-3 h-3 mr-0.5" />{tag}
              </Badge>
            ))}
          </div>

          <a href={article.sourceUrl} target="_blank" rel="nofollow noopener noreferrer">
            <Button variant="outline" size="sm" className="text-xs bg-card border-white/10 hover:bg-white/5" data-testid="link-original-source">
              <ExternalLink className="w-3 h-3 mr-1" /> Original Source
            </Button>
          </a>
        </div>

        <div id="comments-section" className="space-y-4 pt-4 border-t border-white/5" data-testid="comments-section">
          <h2 className="text-lg font-display font-semibold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Discussion ({comments.length})
          </h2>

          {currentUserId && (
            <div className="flex gap-3" data-testid="comment-form">
              <Textarea
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="Share your thoughts on this article..."
                className="min-h-[80px] bg-card/50 border-white/10 resize-none"
                data-testid="input-comment"
              />
              <Button
                className="self-end"
                disabled={!commentContent.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate({ authorId: currentUserId, content: commentContent })}
                data-testid="button-submit-comment"
              >
                {commentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          )}

          {comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No comments yet. Be the first to discuss!</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {comments.map((comment: any) => (
                <CommentItem key={comment.id} comment={comment} articleId={articleId!} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
