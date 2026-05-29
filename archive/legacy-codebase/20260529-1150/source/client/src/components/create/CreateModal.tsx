import { 
  Dialog, DialogContent, DialogHeader, DialogTitle 
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  PenTool, Image as ImageIcon, Bot, Loader2 
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateModal({ open, onOpenChange }: CreateModalProps) {
  const [activeTab, setActiveTab] = useState("post");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topicSlug, setTopicSlug] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: topicsList = [] } = useQuery({
    queryKey: ["/api/topics"],
    queryFn: () => api.topics.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.posts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Post created!", description: "Your post has been published." });
      setTitle("");
      setContent("");
      setTopicSlug("");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    const userId = user?.id || null;
    if (!userId) return;
    createMutation.mutate({
      title,
      content,
      topicSlug: topicSlug || "tech",
      authorId: userId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-card border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Create Content</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="post" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full bg-background/50 border border-white/5">
            <TabsTrigger value="post" data-testid="tab-create-post"><PenTool className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="image"><ImageIcon className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="agent"><Bot className="w-4 h-4" /></TabsTrigger>
          </TabsList>

          <div className="mt-6 space-y-4">
            <TabsContent value="post" className="space-y-4">
              <Input 
                placeholder="Title" 
                className="bg-background/50 border-white/10" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-post-title"
              />
              <Textarea 
                placeholder="What's on your mind?" 
                className="min-h-[150px] bg-background/50 border-white/10 resize-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                data-testid="input-post-content"
              />
              <Select value={topicSlug} onValueChange={setTopicSlug}>
                <SelectTrigger className="bg-background/50 border-white/10" data-testid="select-topic">
                  <SelectValue placeholder="Select topic" />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {topicsList.map((t: any) => (
                    <SelectItem key={t.slug} value={t.slug}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end">
                <Button 
                  className="bg-primary hover:bg-primary/90"
                  disabled={!title.trim() || !content.trim() || createMutation.isPending}
                  onClick={handleCreate}
                  data-testid="button-submit-post"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Post
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="image" className="space-y-4">
              <Textarea 
                placeholder="Describe the image you want to generate..." 
                className="min-h-[100px] bg-background/50 border-white/10 resize-none"
              />
              <Button className="w-full bg-secondary hover:bg-secondary/90 text-white">
                <ImageIcon className="w-4 h-4 mr-2" /> Generate Image (50 Energy)
              </Button>
            </TabsContent>

            <TabsContent value="agent" className="space-y-4">
              <Textarea 
                placeholder="Ask the AI agents a question..." 
                className="min-h-[120px] bg-background/50 border-white/10 resize-none"
              />
              <Button className="w-full bg-secondary hover:bg-secondary/90 text-white">
                <Bot className="w-4 h-4 mr-2" /> Ask Agents (10 Energy)
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
