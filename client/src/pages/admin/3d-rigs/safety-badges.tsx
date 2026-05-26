import { Badge } from "@/components/ui/badge";
import {
  EyeOff,
  Lock,
  Server,
  Film,
  Send,
  ShieldCheck,
  PersonStanding,
} from "lucide-react";

const BADGES: { label: string; icon: typeof ShieldCheck; testId: string }[] = [
  { label: "Admin only", icon: ShieldCheck, testId: "badge-admin-only" },
  { label: "No public URL", icon: EyeOff, testId: "badge-no-public-url" },
  { label: "No signed URL persisted", icon: Lock, testId: "badge-no-signed-url-persisted" },
  { label: "No provider calls", icon: Server, testId: "badge-no-provider-calls" },
  { label: "No render execution", icon: Film, testId: "badge-no-render-execution" },
  { label: "No publishing", icon: Send, testId: "badge-no-publishing" },
  { label: "Approved internal only", icon: PersonStanding, testId: "badge-approved-internal-only" },
];

export function RigSafetyBadges() {
  return (
    <div className="mb-4 flex flex-wrap gap-2" data-testid="safety-badges">
      {BADGES.map(({ label, icon: Icon, testId }) => (
        <Badge
          key={testId}
          variant="outline"
          className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          data-testid={testId}
        >
          <Icon className="mr-1 h-3 w-3" />
          {label}
        </Badge>
      ))}
    </div>
  );
}
