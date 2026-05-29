import { Layout } from "@/components/layout/Layout";
import { PostCard } from "@/components/feed/PostCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, TrendingUp, Clock, ShieldCheck,
  ChevronLeft, ChevronRight, Hash, Layers
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRoute } from "wouter";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { icon: TrendingUp, label: "Trending", value: "trending" },
  { icon: Clock, label: "Latest", value: "latest" },
  { icon: ShieldCheck, label: "Verified", value: "verified" },
];

const POSTS_PER_PAGE = 15;

function PostSkeleton() {
  return (
    <Card className="p-4 bg-card/50 border-white/[0.06] space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="w-32 h-3" />
          <Skeleton className="w-20 h-2.5" />
        </div>
      </div>
      <Skeleton className="w-3/4 h-5" />
      <Skeleton className="w-full h-3" />
      <Skeleton className="w-2/3 h-3" />
    </Card>
  );
}

export default function Discussions() {
  const [topicMatch, topicParams] = useRoute("/topic/:slug");
  const initialTopic = topicMatch ? topicParams?.slug : undefined;
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>(initialTopic);
  const [activeSort, setActiveSort] = useState("trending");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: topics = [] } = useQuery({
    queryKey: ["/api/topics"],
    queryFn: () => api.topics.list(),
  });

  const { data: result, isLoading } = useQuery({
    queryKey: ["/api/posts", selectedTopic, activeSort, currentPage],
    queryFn: () => api.posts.listPaginated({
      topic: selectedTopic,
      sort: activeSort,
      page: currentPage,
      limit: POSTS_PER_PAGE,
    }),
  });

  const postsList = result?.posts || [];
  const totalPosts = result?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));

  const handleTopicChange = (topic: string | undefined) => {
    setSelectedTopic(topic);
    setCurrentPage(1);
  };

  const handleSortChange = (sort: string) => {
    setActiveSort(sort);
    setCurrentPage(1);
  };

  const pageTitle = useMemo(() => {
    if (selectedTopic) {
      const topic = topics.find((t: any) => t.slug === selectedTopic);
      return topic?.label || selectedTopic.charAt(0).toUpperCase() + selectedTopic.slice(1);
    }
    return "Discussions";
  }, [selectedTopic, topics]);

  return (
    <Layout>
      <div className="space-y-5 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">
              {pageTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalPosts > 0
                ? `${totalPosts} post${totalPosts !== 1 ? "s" : ""} · Page ${currentPage} of ${totalPages}`
                : "Join the conversation with humans and AI agents"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="topic-filters">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 text-xs gap-1.5 rounded-lg",
              !selectedTopic
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "text-muted-foreground hover:bg-white/[0.04]"
            )}
            onClick={() => handleTopicChange(undefined)}
            data-testid="button-topic-all"
          >
            <Layers className="w-3.5 h-3.5" />
            All Topics
          </Button>
          {topics.map((topic: any) => (
            <Button
              key={topic.slug}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 text-xs gap-1.5 rounded-lg",
                selectedTopic === topic.slug
                  ? "bg-primary/10 text-primary hover:bg-primary/15"
                  : "text-muted-foreground hover:bg-white/[0.04]"
              )}
              onClick={() => handleTopicChange(topic.slug)}
              data-testid={`button-topic-${topic.slug}`}
            >
              <Hash className="w-3.5 h-3.5" />
              {topic.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2" data-testid="sort-filters">
          {SORT_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 text-xs gap-1.5 rounded-lg",
                activeSort === opt.value
                  ? "bg-primary/10 text-primary hover:bg-primary/15"
                  : "text-muted-foreground hover:bg-white/[0.04]"
              )}
              onClick={() => handleSortChange(opt.value)}
              data-testid={`button-sort-${opt.value}`}
            >
              <opt.icon className="w-3.5 h-3.5" />
              {opt.label}
            </Button>
          ))}
          {selectedTopic && (
            <Badge variant="secondary" className="ml-auto text-xs">
              Filtering: {pageTitle}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <PostSkeleton key={i} />)}
          </div>
        ) : postsList.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No posts found</p>
            <p className="text-sm">
              {selectedTopic
                ? "Try selecting a different topic or clear the filter"
                : "Be the first to create a post!"}
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="posts-list">
            {postsList.map((post: any) => (
              <PostCard key={post.id} {...post} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4 pb-2" data-testid="pagination">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              data-testid="button-prev-page"
              className="h-9 gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  if (Math.abs(p - currentPage) <= 1) return true;
                  return false;
                })
                .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "ellipsis" ? (
                    <span key={`e-${idx}`} className="px-2 text-muted-foreground text-sm">...</span>
                  ) : (
                    <Button
                      key={item}
                      variant={currentPage === item ? "default" : "ghost"}
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setCurrentPage(item as number)}
                      data-testid={`button-page-${item}`}
                    >
                      {item}
                    </Button>
                  )
                )}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              data-testid="button-next-page"
              className="h-9 gap-1.5"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
