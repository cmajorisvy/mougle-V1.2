import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Connector,
  ConnectorFeatureFlags,
  LexiconLocale,
  LEXICON_LOCALES,
  PLATFORMS,
} from "./_shared";
import { ConnectorSecretPanel } from "./ConnectorSecretPanel";

export function ConnectedChannelsCard(_props: { productionId: string }) {
  const qc = useQueryClient();

  const connectorsQuery = useQuery<{ connectors: Connector[] }>({
    queryKey: ["/api/admin/newsroom/audience/connectors"],
  });

  const updateFlagsMutation = useMutation({
    mutationFn: async ({
      connectorId,
      flags,
    }: {
      connectorId: string;
      flags: Partial<ConnectorFeatureFlags>;
    }) => {
      return await apiRequest(
        "PATCH",
        `/api/admin/newsroom/audience/connectors/${connectorId}/feature-flags`,
        flags,
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/connectors"] }),
  });

  const toggleLexicon = (c: Connector, locale: LexiconLocale) => {
    const current = c.featureFlags?.multilingualLexicons ?? [];
    const next = current.includes(locale)
      ? current.filter((l) => l !== locale)
      : [...current, locale];
    updateFlagsMutation.mutate({
      connectorId: c.connectorId,
      flags: { multilingualLexicons: next },
    });
  };

  const toggleSecondOpinion = (c: Connector) => {
    updateFlagsMutation.mutate({
      connectorId: c.connectorId,
      flags: { aiModerationSecondOpinion: !c.featureFlags?.aiModerationSecondOpinion },
    });
  };

  const connectors = connectorsQuery.data?.connectors ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Channels</CardTitle>
      </CardHeader>
      <CardContent>
        {connectors.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-connectors">No channels connected.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {connectors.map((c) => (
              <div
                key={c.connectorId}
                className="rounded border p-3 space-y-2"
                data-testid={`card-connector-${c.connectorId}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{c.displayName}</div>
                  <Badge variant="outline" data-testid={`badge-platform-${c.connectorId}`}>{c.platform}</Badge>
                </div>
                <div className="text-xs flex gap-2">
                  <Badge variant={c.connectionStatus === "connected" ? "default" : "secondary"}>
                    {c.connectionStatus}
                  </Badge>
                  <Badge variant="outline">{c.apiAccessMode}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {Object.entries(c.permissions).filter(([, v]) => v).map(([k]) => k.replace("can", "")).join(", ") || "read-only"}
                </div>
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Multilingual safety lexicons
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {LEXICON_LOCALES.map((loc) => {
                      const enabled =
                        c.featureFlags?.multilingualLexicons?.includes(loc.code) ?? false;
                      return (
                        <label
                          key={loc.code}
                          className="flex items-center gap-1 text-xs cursor-pointer"
                          data-testid={`label-lexicon-${c.connectorId}-${loc.code}`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={updateFlagsMutation.isPending}
                            onChange={() => toggleLexicon(c, loc.code)}
                            data-testid={`checkbox-lexicon-${c.connectorId}-${loc.code}`}
                          />
                          <span>{loc.code.toUpperCase()}</span>
                          <span className="text-muted-foreground">{loc.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <label
                    className="flex items-center gap-2 text-xs cursor-pointer"
                    data-testid={`label-second-opinion-${c.connectorId}`}
                  >
                    <input
                      type="checkbox"
                      checked={c.featureFlags?.aiModerationSecondOpinion ?? false}
                      disabled={updateFlagsMutation.isPending}
                      onChange={() => toggleSecondOpinion(c)}
                      data-testid={`checkbox-second-opinion-${c.connectorId}`}
                    />
                    <span>AI moderation second opinion</span>
                  </label>
                </div>
                <ConnectorSecretPanel connector={c} />
              </div>
            ))}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-3">
          Supported: {PLATFORMS.join(" · ")}
        </div>
      </CardContent>
    </Card>
  );
}
