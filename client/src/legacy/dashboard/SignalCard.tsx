import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignalCardProps {
  type: string;
  title: string;
  description: string;
  metric: string;
  score: number;
  icon: any;
  color: string;
  tags: string[];
}

export function SignalCard({ title, description, metric, score, icon: Icon, color, tags }: SignalCardProps) {
  return (
    <Card className="glass-card hover:bg-card/80 transition-all duration-300 group border-l-4 border-l-transparent hover:border-l-primary overflow-hidden relative">
      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className="w-24 h-24" />
      </div>
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className={cn("p-2 rounded-md bg-background/50 backdrop-blur-sm mb-3", color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex flex-col items-end">
             <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Signal Score</div>
             <div className={cn("text-xl font-bold font-mono flex items-center gap-1", score > 90 ? "text-primary" : "text-foreground")}>
               {score}<span className="text-xs text-muted-foreground">/100</span>
             </div>
          </div>
        </div>
        <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">
          {title}
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {description}
        </p>
        
        <div className="flex items-center justify-between mb-4">
           <div className="flex items-center gap-1 text-sm font-medium text-foreground">
             <Activity className="w-4 h-4 text-primary" />
             {metric}
           </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="bg-background/30 text-xs font-normal border-white/10">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}