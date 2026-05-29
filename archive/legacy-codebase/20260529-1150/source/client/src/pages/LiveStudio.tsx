import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Users, Play, Square, Bot, User, Volume2,
  Settings, Tv, ChevronLeft, Zap, MessageSquare, Eye
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { useState, useEffect, useRef, useMemo } from "react";
import { DebateStudio3D } from "@/studio3d/DebateStudio3D";

interface StudioParticipant {
  id: number;
  userId: string;
  participantType: "human" | "agent";
  position: string | null;
  ttsVoice: string;
  isActive: boolean;
  user: { id: string; displayName: string; avatar: string; role: string } | null;
}

function useDebateSSE(debateId: number | null) {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!debateId) return;
    const evtSource = new EventSource(`/api/debates/${debateId}/stream`);
    evtSource.onopen = () => setConnected(true);
    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-50), event]);
      } catch {}
    };
    evtSource.onerror = () => setConnected(false);
    return () => evtSource.close();
  }, [debateId]);

  return { events, connected };
}

function TranscriptPanel({ turns }: { turns: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 p-3" data-testid="panel-transcript">
      {turns.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-8">Debate transcript will appear here...</p>
      )}
      {turns.map((turn: any, i: number) => (
        <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/30">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-purple-400">Round {turn.roundNumber}</span>
            <span className="text-xs text-gray-500">Turn {turn.turnOrder}</span>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">{turn.content}</p>
        </div>
      ))}
    </div>
  );
}

export default function LiveStudio() {
  const [, params] = useRoute("/live-studio/:id");
  const [, navigate] = useLocation();
  const debateId = params?.id ? parseInt(params.id) : null;

  const [showSettings, setShowSettings] = useState(false);
  const [youtubeKey, setYoutubeKey] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);

  const { events, connected } = useDebateSSE(debateId);

  const { data: debate, isLoading, refetch } = useQuery({
    queryKey: ["/api/debates", debateId],
    queryFn: () => debateId ? api.debates.get(debateId) : null,
    enabled: !!debateId,
    refetchInterval: 5000,
  });

  const setupMutation = useMutation({
    mutationFn: () => debateId ? api.debates.studioSetup(debateId, youtubeKey || undefined) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debates", debateId] });
      refetch();
    },
  });

  const startMutation = useMutation({
    mutationFn: () => debateId ? api.debates.start(debateId) : Promise.reject(),
    onSuccess: () => refetch(),
  });

  const endMutation = useMutation({
    mutationFn: () => debateId ? api.debates.end(debateId) : Promise.reject(),
    onSuccess: () => refetch(),
  });

  const participants: StudioParticipant[] = useMemo(() => {
    return debate?.participants || [];
  }, [debate]);

  const turns = useMemo(() => debate?.turns || [], [debate]);
  const currentSpeakerId = debate?.currentSpeakerId;
  const isLive = debate?.status === "live";
  const isCompleted = debate?.status === "completed";

  const humanCount = participants.filter(p => p.participantType === "human").length;
  const agentCount = participants.filter(p => p.participantType === "agent").length;

  if (isLoading || !debate) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            <span className="text-sm text-muted-foreground">Loading Debate Studio...</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-black" data-testid="page-live-studio">
      <div className="h-12 flex items-center justify-between px-3 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/live-debates")}
            className="text-gray-400 hover:text-white h-8"
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="w-px h-5 bg-gray-700" />
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4 text-purple-400" />
            <h1 className="text-sm font-bold text-white truncate max-w-md" data-testid="text-studio-title">
              {debate.title}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/40">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-red-400 tracking-wider">LIVE</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Users className="w-3 h-3" />
            <span>{humanCount}H · {agentCount}AI</span>
          </div>
          {connected && (
            <div className="flex items-center gap-1 text-[10px] text-green-500">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              SSE
            </div>
          )}

          {!isLive && !isCompleted && (
            <>
              <Button
                onClick={() => setupMutation.mutate()}
                disabled={setupMutation.isPending}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 gap-1.5 h-7 text-xs"
                data-testid="button-setup-studio"
              >
                {setupMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Setup
              </Button>
              {participants.length >= 2 && (
                <Button
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-1.5 h-7 text-xs"
                  data-testid="button-start-debate"
                >
                  {startMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Go Live
                </Button>
              )}
            </>
          )}

          {isLive && (
            <Button
              onClick={() => endMutation.mutate()}
              disabled={endMutation.isPending}
              variant="destructive"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              data-testid="button-end-debate"
            >
              {endMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              End
            </Button>
          )}

          {isCompleted && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Ended
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className="h-7 w-7 p-0 text-gray-400"
            data-testid="button-toggle-sidebar"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="h-7 w-7 p-0 text-gray-400"
            data-testid="button-settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative" data-testid="studio-viewport">
          <DebateStudio3D
            debateId={debateId}
            participants={participants}
            currentSpeakerId={currentSpeakerId}
            events={events}
          />
        </div>

        {showSidebar && (
          <div className="w-72 border-l border-gray-800/60 flex flex-col bg-gray-950/95 backdrop-blur-sm flex-shrink-0">
            <div className="p-3 border-b border-gray-800/60">
              <h3 className="text-xs font-semibold text-white/80 flex items-center gap-2 uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                Transcript
              </h3>
            </div>

            <TranscriptPanel turns={turns} />

            {showSettings && (
              <div className="p-3 border-t border-gray-800/60 space-y-2">
                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Stream Settings</h4>
                <div>
                  <label className="text-[10px] text-gray-600 mb-0.5 block">YouTube Key</label>
                  <Input
                    value={youtubeKey}
                    onChange={(e) => setYoutubeKey(e.target.value)}
                    placeholder="Stream key..."
                    className="bg-gray-800/80 border-gray-700/50 text-xs h-7"
                    data-testid="input-youtube-key"
                  />
                </div>
                <div className="text-[10px] text-gray-600 space-y-0.5">
                  <p>Topic: {debate.topic}</p>
                  <p>Format: {debate.format}</p>
                  <p>Rounds: {debate.currentRound}/{debate.totalRounds}</p>
                </div>
              </div>
            )}

            <div className="p-3 border-t border-gray-800/60">
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Participants</h4>
              <div className="space-y-1">
                {participants.map((p: StudioParticipant) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 p-1.5 rounded text-[11px] transition-colors ${
                      currentSpeakerId === p.userId
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {p.participantType === "agent" ? (
                      <Bot className="w-3 h-3 text-purple-400 flex-shrink-0" />
                    ) : (
                      <User className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    )}
                    <span className="truncate">{p.user?.displayName || "Unknown"}</span>
                    {currentSpeakerId === p.userId && (
                      <Volume2 className="w-3 h-3 ml-auto flex-shrink-0 animate-pulse" />
                    )}
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="text-[10px] text-gray-600 text-center py-3">No participants yet</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
