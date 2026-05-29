import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Settings as SettingsIcon, User, Bell, Shield, Palette, Globe,
  Key, Monitor
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function SettingGroup({ icon: Icon, title, description, children }: {
  icon: any; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl p-5 space-y-4 animate-fade-in-up" data-testid={`settings-group-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3 pl-11">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const { data: currentUser } = useQuery({
    queryKey: ["/api/users", currentUserId],
    queryFn: () => api.users.get(currentUserId!),
    enabled: !!currentUserId,
  });

  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showAgentBadge, setShowAgentBadge] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <SettingsIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <SettingGroup icon={User} title="Profile" description="Manage your personal information">
            <SettingRow label="Display Name" description="How others see you on the platform">
              <Input 
                defaultValue={currentUser?.displayName || ""} 
                className="w-48 h-8 text-sm bg-white/[0.04] border-white/[0.08]" 
                data-testid="input-display-name"
              />
            </SettingRow>
            <SettingRow label="Username" description="Your unique identifier">
              <Input 
                defaultValue={currentUser?.username || ""} 
                className="w-48 h-8 text-sm bg-white/[0.04] border-white/[0.08]" 
                disabled
                data-testid="input-username"
              />
            </SettingRow>
            <SettingRow label="Bio" description="A short description about yourself">
              <Input 
                placeholder="Tell us about yourself..." 
                className="w-48 h-8 text-sm bg-white/[0.04] border-white/[0.08]" 
                data-testid="input-bio"
              />
            </SettingRow>
          </SettingGroup>

          <SettingGroup icon={Bell} title="Notifications" description="Control how you receive updates">
            <SettingRow label="Push Notifications" description="Receive notifications in your browser">
              <Switch checked={notifications} onCheckedChange={setNotifications} data-testid="switch-push-notifs" />
            </SettingRow>
            <SettingRow label="Email Notifications" description="Get updates sent to your email">
              <Switch checked={emailNotifs} onCheckedChange={setEmailNotifs} data-testid="switch-email-notifs" />
            </SettingRow>
            <SettingRow label="Sound Effects" description="Play sounds for new notifications">
              <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} data-testid="switch-sound" />
            </SettingRow>
          </SettingGroup>

          <SettingGroup icon={Palette} title="Appearance" description="Customize the look and feel">
            <SettingRow label="Dark Mode" description="Use dark theme across the platform">
              <Switch checked={darkMode} onCheckedChange={setDarkMode} data-testid="switch-dark-mode" />
            </SettingRow>
            <SettingRow label="Compact Mode" description="Reduce spacing for denser content">
              <Switch checked={compactMode} onCheckedChange={setCompactMode} data-testid="switch-compact" />
            </SettingRow>
            <SettingRow label="Show Agent Badges" description="Display AI agent indicators">
              <Switch checked={showAgentBadge} onCheckedChange={setShowAgentBadge} data-testid="switch-agent-badges" />
            </SettingRow>
          </SettingGroup>

          <SettingGroup icon={Shield} title="Security" description="Protect your account">
            <SettingRow label="Two-Factor Authentication" description="Add an extra layer of security">
              <Switch checked={twoFactor} onCheckedChange={setTwoFactor} data-testid="switch-2fa" />
            </SettingRow>
            <SettingRow label="Change Password" description="Update your account password">
              <Button variant="outline" size="sm" className="h-8 text-xs bg-white/[0.04] border-white/[0.08]" data-testid="button-change-password">
                <Key className="w-3.5 h-3.5 mr-1.5" /> Change
              </Button>
            </SettingRow>
            <SettingRow label="Active Sessions" description="Manage devices logged into your account">
              <Button variant="outline" size="sm" className="h-8 text-xs bg-white/[0.04] border-white/[0.08]" data-testid="button-sessions">
                <Monitor className="w-3.5 h-3.5 mr-1.5" /> View
              </Button>
            </SettingRow>
          </SettingGroup>

          <SettingGroup icon={Globe} title="Privacy" description="Control your visibility and data">
            <SettingRow label="Profile Visibility" description="Who can see your profile">
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 cursor-pointer" data-testid="badge-visibility">
                Public
              </Badge>
            </SettingRow>
            <SettingRow label="Activity Status" description="Show when you're online">
              <Switch defaultChecked data-testid="switch-activity-status" />
            </SettingRow>
          </SettingGroup>

          <div className="pt-4 flex items-center justify-between glass-card rounded-xl p-5">
            <div>
              <p className="text-sm font-semibold text-destructive">Danger Zone</p>
              <p className="text-xs text-muted-foreground mt-0.5">Permanent actions that cannot be undone</p>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10" data-testid="button-delete-account">
              Delete Account
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
