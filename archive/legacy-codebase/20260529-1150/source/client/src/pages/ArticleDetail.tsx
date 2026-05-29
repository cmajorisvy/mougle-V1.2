import { Layout } from "@/components/layout/Layout";
import { articles } from "@/lib/mockData";
import { useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Share2, 
  Download, 
  Play, 
  Clock, 
  Calendar,
  Zap,
  TrendingUp,
  Twitter,
  Linkedin,
  Send,
  MessageCircle
} from "lucide-react";
import { Link } from "wouter";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function ArticleDetail() {
  const [match, params] = useRoute("/articles/:slug");
  const article = articles.find(a => a.slug === params?.slug);

  useEffect(() => {
    if (article) {
      document.title = `${article.title} | Mougle Intelligence`;
    }
  }, [article]);

  if (!article) return <NotFound />;

  // Mock social content based on the article
  const socialContent = {
    twitter: `🧵 1/5 ${article.title}\n\n${article.content.summary}\n\n#AI #Tech #${article.tags[0]}`,
    linkedin: `🚀 Strategic Analysis: ${article.title}\n\n${article.content.executive_analysis}\n\nRead the full technical breakdown below. 👇\n\n#ArtificialIntelligence #TechTrends #Innovation`,
    telegram: `📢 **New Intelligence Drop**\n\n**${article.title}**\n\n${article.content.summary}\n\nSignal Score: ${article.signal_score}/100 🟢`
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Navigation */}
        <Link href="/articles">
          <div className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-4 group cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Intelligence Feed
          </div>
        </Link>

        {/* Header */}
        <header className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-primary/50 text-primary uppercase tracking-widest text-[10px]">
              {article.category}
            </Badge>
            <div className="flex items-center gap-2 bg-secondary/10 text-secondary px-3 py-0.5 rounded-full border border-secondary/20 text-xs font-mono font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
              </span>
              Signal Score: {article.signal_score}/100
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            {article.title}
          </h1>
          
          <div className="flex items-center gap-4 text-muted-foreground text-sm font-mono border-l-2 border-primary pl-4">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" /> {article.date}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> {article.readTime}
            </span>
          </div>
        </header>

        {/* Video Player Placeholder */}
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black/50 border border-border/50 relative group shadow-2xl">
          {/* Animated Gradient Background for "Looping" effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 animate-pulse opacity-50" />
          
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors z-10">
            <div className="w-20 h-20 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center border border-primary/50 group-hover:scale-110 transition-transform cursor-pointer shadow-[0_0_30px_rgba(6,182,212,0.3)]">
              <Play className="w-8 h-8 text-primary fill-primary ml-1" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-10">
            <div className="flex items-center gap-2 mb-2">
               <div className="px-2 py-0.5 bg-red-500/80 text-white text-[10px] font-bold uppercase tracking-wider rounded">
                 Live Preview
               </div>
               <p className="font-mono text-xs text-primary tracking-widest uppercase">AI Generated Brief</p>
            </div>
            <h3 className="text-xl font-bold">{article.title}</h3>
          </div>
          <img 
            src={article.image} 
            alt="Video Thumbnail" 
            className="w-full h-full object-cover opacity-60 transition-opacity group-hover:opacity-40"
          />
          {/* Scanline overlay for video feel */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none background-size-[100%_2px,3px_100%] pointer-events-none" />
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap justify-between items-center py-4 border-y border-border/50 gap-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="hover:bg-primary/10 hover:text-primary transition-colors border-primary/20">
              <Share2 className="w-4 h-4 mr-2" /> Share Analysis
            </Button>
            <Button variant="outline" size="sm" className="hover:bg-primary/10 hover:text-primary transition-colors border-primary/20">
              <Download className="w-4 h-4 mr-2" /> Export PDF
            </Button>
          </div>
          <div className="flex gap-2">
            {article.tags.map(tag => (
              <span key={tag} className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded border border-white/5">#{tag}</span>
            ))}
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <section className="space-y-4">
              <h3 className="text-2xl font-bold flex items-center gap-2 text-primary">
                <Zap className="w-6 h-6" />
                Executive Analysis
              </h3>
              <p className="text-lg leading-relaxed text-foreground/90 font-light">
                {article.content.executive_analysis}
              </p>
            </section>

            <Separator className="bg-border/50" />

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Technical Breakdown
              </h3>
              <div className="p-6 rounded-lg bg-card/40 border border-border/50 backdrop-blur-sm relative overflow-hidden group hover:border-primary/30 transition-colors">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors" />
                <p className="leading-relaxed font-mono text-sm text-foreground/80">
                  {article.content.technical_breakdown}
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Market Implications
              </h3>
              <p className="leading-relaxed text-foreground/80">
                {article.content.market_implications}
              </p>
            </section>

            {/* Generated Social Media Content */}
            <section className="space-y-4 pt-8">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Generated Social Assets
              </h3>
              <Tabs defaultValue="twitter" className="w-full">
                <TabsList className="bg-card/50 border border-border/50 w-full justify-start">
                  <TabsTrigger value="twitter" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Twitter className="w-4 h-4 mr-2"/> X / Twitter</TabsTrigger>
                  <TabsTrigger value="linkedin" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400"><Linkedin className="w-4 h-4 mr-2"/> LinkedIn</TabsTrigger>
                  <TabsTrigger value="telegram" className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-400"><Send className="w-4 h-4 mr-2"/> Telegram</TabsTrigger>
                </TabsList>
                <TabsContent value="twitter" className="mt-4 animate-in fade-in slide-in-from-left-2 duration-300">
                  <Card className="bg-card/30 border-border/30">
                    <CardContent className="p-4 font-mono text-sm whitespace-pre-wrap text-foreground/80">
                      {socialContent.twitter}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="linkedin" className="mt-4 animate-in fade-in slide-in-from-left-2 duration-300">
                  <Card className="bg-card/30 border-border/30">
                    <CardContent className="p-4 font-mono text-sm whitespace-pre-wrap text-foreground/80">
                      {socialContent.linkedin}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="telegram" className="mt-4 animate-in fade-in slide-in-from-left-2 duration-300">
                  <Card className="bg-card/30 border-border/30">
                    <CardContent className="p-4 font-mono text-sm whitespace-pre-wrap text-foreground/80">
                      {socialContent.telegram}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </section>
          </div>

          {/* Sidebar Info */}
          <aside className="space-y-6">
            <div className="p-6 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 space-y-4 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
              <h4 className="font-bold text-primary flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Forward Outlook
              </h4>
              <p className="text-sm leading-relaxed text-foreground/90">
                {article.content.forward_outlook}
              </p>
            </div>

            <div className="p-6 rounded-lg bg-card/40 border border-border/50 space-y-4">
              <h4 className="font-bold text-muted-foreground text-sm uppercase tracking-wider">
                Competitive Landscape
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {article.content.competitive_landscape}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}