import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizeMap = {
  sm: { icon: 28, text: "text-sm", gap: "gap-1.5" },
  md: { icon: 36, text: "text-lg", gap: "gap-2" },
  lg: { icon: 48, text: "text-2xl", gap: "gap-2.5" },
  xl: { icon: 64, text: "text-3xl", gap: "gap-3" },
};

export function Logo({ size = "md", showText = true, className, animated = true }: LogoProps) {
  const s = sizeMap[size];

  return (
    <div className={cn("flex items-center", s.gap, className)} data-testid="logo">
      <div className="relative flex-shrink-0" style={{ width: s.icon, height: s.icon }}>
        <svg
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("w-full h-full", animated && "logo-icon-animated")}
        >
          <defs>
            <linearGradient id="logo-grad-main" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="logo-grad-accent" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <radialGradient id="logo-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </radialGradient>
            <filter id="logo-blur">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
            <filter id="logo-glow-filter">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
              <feComposite in2="SourceGraphic" operator="over" />
            </filter>
          </defs>

          <circle cx="60" cy="60" r="55" fill="url(#logo-glow)" className={cn(animated && "logo-glow-pulse")} />

          <g filter="url(#logo-blur)" opacity="0.4">
            <path
              d="M30 60 C30 40, 50 30, 60 45 C70 30, 90 40, 90 60 C90 80, 70 90, 60 75 C50 90, 30 80, 30 60Z"
              stroke="url(#logo-grad-main)"
              strokeWidth="3"
              fill="none"
            />
          </g>

          <path
            d="M28 60 C28 42, 44 28, 60 47 C76 28, 92 42, 92 60 C92 78, 76 92, 60 73 C44 92, 28 78, 28 60Z"
            stroke="url(#logo-grad-main)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            className={cn(animated && "logo-path-draw")}
          />

          <circle cx="42" cy="48" r="3" fill="#a855f7" opacity="0.9">
            {animated && <animate attributeName="opacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />}
          </circle>
          <circle cx="78" cy="48" r="3" fill="#06b6d4" opacity="0.9">
            {animated && <animate attributeName="opacity" values="1;0.5;1" dur="3s" repeatCount="indefinite" />}
          </circle>
          <circle cx="42" cy="72" r="3" fill="#06b6d4" opacity="0.9">
            {animated && <animate attributeName="opacity" values="0.7;1;0.7" dur="2.5s" repeatCount="indefinite" />}
          </circle>
          <circle cx="78" cy="72" r="3" fill="#a855f7" opacity="0.9">
            {animated && <animate attributeName="opacity" values="1;0.7;1" dur="2.5s" repeatCount="indefinite" />}
          </circle>

          <circle cx="60" cy="47" r="4" fill="url(#logo-grad-main)" opacity="0.95">
            {animated && <animate attributeName="r" values="3.5;4.5;3.5" dur="2s" repeatCount="indefinite" />}
          </circle>
          <circle cx="60" cy="73" r="4" fill="url(#logo-grad-accent)" opacity="0.95">
            {animated && <animate attributeName="r" values="4.5;3.5;4.5" dur="2s" repeatCount="indefinite" />}
          </circle>

          <line x1="42" y1="48" x2="60" y2="47" stroke="url(#logo-grad-main)" strokeWidth="1" opacity="0.4" />
          <line x1="78" y1="48" x2="60" y2="47" stroke="url(#logo-grad-main)" strokeWidth="1" opacity="0.4" />
          <line x1="42" y1="72" x2="60" y2="73" stroke="url(#logo-grad-accent)" strokeWidth="1" opacity="0.4" />
          <line x1="78" y1="72" x2="60" y2="73" stroke="url(#logo-grad-accent)" strokeWidth="1" opacity="0.4" />
          <line x1="42" y1="48" x2="42" y2="72" stroke="#8b5cf6" strokeWidth="0.8" opacity="0.3" />
          <line x1="78" y1="48" x2="78" y2="72" stroke="#8b5cf6" strokeWidth="0.8" opacity="0.3" />

          <g className={cn(animated && "logo-center-pulse")}>
            <circle cx="60" cy="60" r="8" fill="none" stroke="url(#logo-grad-main)" strokeWidth="1.5" opacity="0.6" />
            <text
              x="60"
              y="64"
              textAnchor="middle"
              fill="url(#logo-grad-main)"
              fontSize="14"
              fontWeight="800"
              fontFamily="Inter, system-ui, sans-serif"
            >
              M
            </text>
          </g>

          <g opacity="0.2">
            <circle cx="35" cy="38" r="1.5" fill="#a855f7">
              {animated && <animate attributeName="opacity" values="0;0.6;0" dur="4s" repeatCount="indefinite" />}
            </circle>
            <circle cx="85" cy="38" r="1.5" fill="#06b6d4">
              {animated && <animate attributeName="opacity" values="0.6;0;0.6" dur="4s" repeatCount="indefinite" />}
            </circle>
            <circle cx="35" cy="82" r="1.5" fill="#06b6d4">
              {animated && <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3.5s" repeatCount="indefinite" />}
            </circle>
            <circle cx="85" cy="82" r="1.5" fill="#a855f7">
              {animated && <animate attributeName="opacity" values="0.8;0.3;0.8" dur="3.5s" repeatCount="indefinite" />}
            </circle>
          </g>
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <span className={cn(
            "font-bold tracking-[0.2em] logo-wordmark",
            s.text
          )}>
            <span className="logo-text-dig">MOU</span>
            <span className="logo-text-8">G</span>
            <span className="logo-text-opia">LE</span>
          </span>
          {(size === "lg" || size === "xl") && (
            <span className="text-[10px] tracking-[0.35em] text-muted-foreground/60 mt-0.5 font-medium uppercase">
              Where Intelligence Evolves
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function LogoMark({ size = 28, className, animated = true }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <Logo size="sm" showText={false} className={className} animated={animated} />
  );
}
