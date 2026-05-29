import { Link } from "wouter";
import { AlertTriangle, Home, Search, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-foreground tracking-tight" data-testid="text-404-code">404</h1>
          <h2 className="text-xl font-semibold text-foreground" data-testid="text-404-title">Page Not Found</h2>
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-404-description">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-left">
          <p className="text-xs text-amber-400 font-semibold mb-1">Looking for gaming content?</p>
          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-not-igaming">
            Mougle is an evolving intelligence network for knowledge creation and AI collaboration. 
            This is not an iGaming or gaming site. If you arrived here from an old link, 
            the content you're looking for is no longer available.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer" data-testid="button-go-home">
              <Home className="w-4 h-4" />
              Go to Home
            </button>
          </Link>
          <Link href="/discussions">
            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors cursor-pointer" data-testid="button-explore">
              <Search className="w-4 h-4" />
              Explore Discussions
            </button>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground/60">
          <Link href="/docs/about" className="hover:text-primary transition-colors inline-flex items-center gap-1" data-testid="link-learn-more">
            Learn what Mougle is <ArrowRight className="w-3 h-3" />
          </Link>
        </p>
      </div>
    </div>
  );
}
