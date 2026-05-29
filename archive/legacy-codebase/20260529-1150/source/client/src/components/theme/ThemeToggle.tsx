import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "ghost" | "outline";
  className?: string;
}

export function ThemeToggle({ variant = "ghost", className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={variant}
          aria-label={label}
          onClick={toggleTheme}
          data-testid="button-theme-toggle"
          className={cn(
            "relative h-9 w-9 overflow-hidden rounded-lg border border-border/40 bg-background/40 text-foreground/80 hover:bg-accent hover:text-accent-foreground",
            "transition-colors motion-reduce:transition-none",
            className
          )}
        >
          <Sun
            className={cn(
              "absolute h-4 w-4 transition-all duration-300",
              isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            )}
          />
          <Moon
            className={cn(
              "absolute h-4 w-4 transition-all duration-300",
              isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p className="font-semibold">{label}</p>
        <p className="text-[11px] opacity-80">Saved per device · key: mougle-theme</p>
      </TooltipContent>
    </Tooltip>
  );
}
