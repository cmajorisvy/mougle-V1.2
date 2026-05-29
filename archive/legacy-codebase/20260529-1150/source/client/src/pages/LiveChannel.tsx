import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Radio, Pause, Clock, AlertTriangle, Globe } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface LiveChannelItem {
  broadcastId: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  region: string;
  scheduledAt: string;
  breaking: boolean;
  startedAt?: string | null;
}

interface LiveChannelResponse {
  ok: boolean;
  killSwitchActive: boolean;
  current: LiveChannelItem | null;
  upNext: LiveChannelItem[];
  updatedAt: string;
}

async function fetchLiveChannel(): Promise<LiveChannelResponse> {
  const r = await fetch("/api/public/live-channel", { credentials: "include" });
  if (!r.ok) throw new Error("failed");
  return r.json();
}

function safeRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export default function LiveChannel() {
  const { data, isLoading, isError } = useQuery<LiveChannelResponse>({
    queryKey: ["/api/public/live-channel"],
    queryFn: fetchLiveChannel,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const killed = !!data?.killSwitchActive;
  const current = data?.current ?? null;
  const upNext = data?.upNext ?? [];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Radio className="w-6 h-6 text-red-500" />
          <h1
            className="text-3xl font-bold tracking-tight"
            data-testid="text-live-channel-title"
          >
            Live Channel
          </h1>
          <Badge variant="outline" className="ml-auto" data-testid="badge-live-status">
            {killed ? "Paused" : current ? "On Air" : "Idle"}
          </Badge>
        </div>

        {isLoading && (
          <Card data-testid="card-live-loading">
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading channel…
            </CardContent>
          </Card>
        )}

        {isError && (
          <Card data-testid="card-live-error">
            <CardContent className="py-12 text-center text-muted-foreground">
              Couldn't reach the channel right now. Trying again…
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && killed && (
          <Card
            className="border-amber-500/40 bg-amber-500/5"
            data-testid="card-channel-paused"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-500">
                <Pause className="w-5 h-5" />
                Channel paused
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              The Live Channel is temporarily paused by the operations team.
              We'll be back on air shortly — please check back soon.
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && !killed && (
          <>
            <Card data-testid="card-now-playing">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-red-500" />
                  Now on air
                </CardTitle>
              </CardHeader>
              <CardContent>
                {current ? (
                  <div className="space-y-3" data-testid={`now-playing-${current.broadcastId}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {current.breaking && (
                        <Badge
                          className="bg-red-600 hover:bg-red-600 text-white"
                          data-testid="badge-breaking-now"
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Breaking
                        </Badge>
                      )}
                      <Badge variant="secondary" data-testid="badge-now-region">
                        <Globe className="w-3 h-3 mr-1" />
                        {current.region}
                      </Badge>
                      {current.startedAt && (
                        <span
                          className="text-sm text-muted-foreground"
                          data-testid="text-now-started"
                        >
                          <Clock className="inline w-3 h-3 mr-1" />
                          Started {safeRelative(current.startedAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4">
                      {current.thumbnailUrl && (
                        <img
                          src={current.thumbnailUrl}
                          alt=""
                          className="w-40 h-24 object-cover rounded-md border border-border flex-shrink-0 bg-muted"
                          data-testid="img-now-thumbnail"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                      <div className="space-y-1 min-w-0 flex-1">
                        {current.title ? (
                          <h2
                            className="text-xl font-semibold leading-tight"
                            data-testid="text-now-title"
                          >
                            {current.title}
                          </h2>
                        ) : (
                          <h2
                            className="text-base font-medium text-muted-foreground"
                            data-testid="text-now-title-fallback"
                          >
                            Untitled broadcast
                          </h2>
                        )}
                        <div
                          className="text-xs text-muted-foreground font-mono break-all"
                          data-testid="text-now-broadcast-id"
                        >
                          Broadcast ID: {current.broadcastId}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-muted-foreground"
                    data-testid="text-now-idle"
                  >
                    Nothing is on air right now. The next scheduled broadcast
                    will appear here automatically.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-up-next">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Up next
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upNext.length === 0 ? (
                  <div
                    className="text-muted-foreground"
                    data-testid="text-upnext-empty"
                  >
                    No upcoming broadcasts queued.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {upNext.map((item, idx) => (
                      <li
                        key={`${item.broadcastId}-${idx}`}
                        className="py-3 flex items-center gap-3"
                        data-testid={`row-upnext-${idx}`}
                      >
                        <span className="text-sm text-muted-foreground w-6 flex-shrink-0">
                          {idx + 1}.
                        </span>
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="w-20 h-12 object-cover rounded border border-border flex-shrink-0 bg-muted"
                            data-testid={`img-upnext-thumbnail-${idx}`}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div
                            className="w-20 h-12 rounded border border-border bg-muted flex-shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          {item.title ? (
                            <div
                              className="text-sm font-medium truncate"
                              data-testid={`text-upnext-title-${idx}`}
                            >
                              {item.title}
                            </div>
                          ) : (
                            <div
                              className="text-sm text-muted-foreground"
                              data-testid={`text-upnext-title-fallback-${idx}`}
                            >
                              Untitled broadcast
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {item.breaking && (
                              <Badge
                                className="bg-red-600 hover:bg-red-600 text-white"
                                data-testid={`badge-upnext-breaking-${idx}`}
                              >
                                Breaking
                              </Badge>
                            )}
                            <Badge variant="secondary" data-testid={`badge-upnext-region-${idx}`}>
                              {item.region}
                            </Badge>
                            <span
                              className="text-xs text-muted-foreground font-mono truncate"
                              data-testid={`text-upnext-broadcast-${idx}`}
                            >
                              {item.broadcastId}
                            </span>
                          </div>
                        </div>
                        <span
                          className="text-sm text-muted-foreground flex-shrink-0"
                          data-testid={`text-upnext-scheduled-${idx}`}
                        >
                          {safeRelative(item.scheduledAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <p
          className="text-xs text-muted-foreground text-center"
          data-testid="text-channel-footer"
        >
          Updates automatically every few seconds.
        </p>
      </div>
    </Layout>
  );
}
