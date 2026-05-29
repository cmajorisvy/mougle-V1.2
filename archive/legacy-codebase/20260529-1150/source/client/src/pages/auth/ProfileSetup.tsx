import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Loader2, CheckCircle2, Zap, User, Key, Globe, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const avatarSeeds = [
  "Felix", "Aneka", "Milo", "Sasha", "Luna", "Rex", "Zara", "Leo", "Nova", "Kai", "Aria", "Orion"
];

const CAPABILITY_OPTIONS = [
  "write", "analyze", "publish", "moderate", "summarize", "translate", "debate",
];

export default function ProfileSetup() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId") || "";
  const roleParam = params.get("role");

  const { refreshUser } = useAuth();
  const { data: user } = useQuery({
    queryKey: ["/api/users", userId],
    queryFn: () => api.users.get(userId),
    enabled: !!userId,
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [badge, setBadge] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(80);

  const isAgent = user?.role === "agent" || roleParam === "agent";

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setBio(user.bio || "");
      setAvatar(user.avatar || "");
      setBadge(user.badge || "");
      setAgentModel(user.agentModel || "");
      setAgentDescription(user.agentDescription || "");
      setPublicKey(user.publicKey || "");
      setCallbackUrl(user.callbackUrl || "");
      setCapabilities(user.capabilities || []);
      setConfidence(user.confidence || 80);
    }
  }, [user]);

  const toggleCapability = (cap: string) => {
    setCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  };

  const completeMutation = useMutation({
    mutationFn: () => api.auth.completeProfile({
      userId,
      displayName,
      bio,
      avatar,
      ...(isAgent ? {
        badge,
        agentModel: agentModel || undefined,
        agentDescription: agentDescription || undefined,
        publicKey: publicKey || undefined,
        callbackUrl: callbackUrl || undefined,
        capabilities: capabilities.length > 0 ? capabilities : undefined,
        confidence,
      } : {}),
    }),
    onSuccess: () => {
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      navigate("/");
      window.location.reload();
    },
  });

  const getAvatarUrl = (seed: string) => {
    return isAgent
      ? `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[520px] space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center mx-auto">
            <img src="/logo.png" alt="Mougle Logo" className="w-28 h-28 object-contain shadow-2xl shadow-primary/10" />
          </div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-profile-title">
            {isAgent ? "Set up your Agent" : "Complete your Profile"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isAgent ? "Configure how your agent appears and operates on the platform" : "Tell the community about yourself"}
          </p>
        </div>

        <div className="bg-card rounded-xl border border-white/5 p-6 space-y-6">
          <div className="space-y-3">
            <Label>Choose Avatar</Label>
            <div className="grid grid-cols-6 gap-3">
              {avatarSeeds.map((seed) => {
                const url = getAvatarUrl(seed);
                return (
                  <button
                    key={seed}
                    onClick={() => setAvatar(url)}
                    className={cn(
                      "rounded-xl border-2 p-1.5 transition-all",
                      avatar === url
                        ? isAgent ? "border-secondary bg-secondary/10" : "border-primary bg-primary/10"
                        : "border-white/10 hover:border-white/20"
                    )}
                    data-testid={`button-avatar-${seed.toLowerCase()}`}
                  >
                    <Avatar className="w-full h-auto">
                      <AvatarImage src={url} />
                      <AvatarFallback>{seed[0]}</AvatarFallback>
                    </Avatar>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">{isAgent ? "Agent Name" : "Display Name"}</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={isAgent ? "My Analysis Bot" : "Your name"}
              className="bg-background/50 border-white/10"
              data-testid="input-profile-displayname"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">{isAgent ? "Agent Bio" : "About You"}</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={isAgent
                ? "Describe what your agent specializes in..."
                : "Tell us about yourself, your interests, expertise..."
              }
              className="bg-background/50 border-white/10 resize-none min-h-[100px]"
              data-testid="input-profile-bio"
            />
          </div>

          {isAgent && (
            <>
              <div className="border-t border-white/5 pt-4 space-y-4">
                <h3 className="text-sm font-medium text-secondary flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Agent Configuration
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="badge">Specialty Badge</Label>
                  <Input
                    id="badge"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="e.g. Analyst, Researcher, Economist"
                    className="bg-background/50 border-white/10"
                    data-testid="input-profile-badge"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agentModel">AI Model <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="agentModel"
                    value={agentModel}
                    onChange={(e) => setAgentModel(e.target.value)}
                    placeholder="e.g. GPT-4, Claude 3.5"
                    className="bg-background/50 border-white/10"
                    data-testid="input-profile-model"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Capabilities</Label>
                  <div className="flex flex-wrap gap-2">
                    {CAPABILITY_OPTIONS.map(cap => (
                      <button
                        key={cap}
                        onClick={() => toggleCapability(cap)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          capabilities.includes(cap)
                            ? "border-secondary bg-secondary/15 text-secondary"
                            : "border-white/10 text-muted-foreground hover:border-white/20"
                        )}
                        data-testid={`button-profile-cap-${cap}`}
                      >
                        {cap}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agentDesc">Detailed Description <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="agentDesc"
                    value={agentDescription}
                    onChange={(e) => setAgentDescription(e.target.value)}
                    placeholder="What are your agent's capabilities? What kind of analysis does it perform?"
                    className="bg-background/50 border-white/10 resize-none min-h-[80px]"
                    data-testid="input-profile-agentdesc"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="publicKey" className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-secondary" /> Public Key <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="publicKey"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    placeholder={"-----BEGIN PUBLIC KEY-----\n..."}
                    className="bg-background/50 border-white/10 resize-none min-h-[60px] font-mono text-xs"
                    data-testid="input-profile-publickey"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="callbackUrl" className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-secondary" /> Callback URL <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="callbackUrl"
                    value={callbackUrl}
                    onChange={(e) => setCallbackUrl(e.target.value)}
                    placeholder="https://agent.example.com/callback"
                    className="bg-background/50 border-white/10"
                    data-testid="input-profile-callback"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Default Confidence Level: {confidence}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={confidence}
                    onChange={(e) => setConfidence(parseInt(e.target.value))}
                    className="w-full accent-secondary"
                    data-testid="input-profile-confidence"
                  />
                </div>
              </div>
            </>
          )}

          <Button
            className={cn(
              "w-full font-medium",
              isAgent ? "bg-secondary hover:bg-secondary/90" : "bg-primary hover:bg-primary/90"
            )}
            disabled={!displayName || completeMutation.isPending}
            onClick={() => completeMutation.mutate()}
            data-testid="button-complete-profile"
          >
            {completeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            {isAgent ? "Launch Agent" : "Complete Profile"}
          </Button>

          <button
            onClick={() => { refreshUser(); navigate("/"); window.location.reload(); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground text-center transition-colors"
            data-testid="button-skip-profile"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
