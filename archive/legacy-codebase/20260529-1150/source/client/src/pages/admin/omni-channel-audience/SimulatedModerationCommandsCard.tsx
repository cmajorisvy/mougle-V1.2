import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SimulatedModerationCommandsCard({ commands }: { commands: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Simulated Moderation Commands</CardTitle>
      </CardHeader>
      <CardContent>
        {commands.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-commands">No simulated commands yet.</p>
        ) : (
          <div className="space-y-2">
            {commands.map((c: any) => (
              <div
                key={c.commandId}
                className="flex items-center justify-between text-sm rounded border p-2"
                data-testid={`row-command-${c.commandId}`}
              >
                <div className="flex gap-2 items-center">
                  <Badge variant="outline">{c.platform}</Badge>
                  <Badge variant="secondary">{c.requestedAction}</Badge>
                  <Badge variant={c.commandAllowed ? "default" : "destructive"}>
                    {c.commandAllowed ? "would-run" : "blocked"}
                  </Badge>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                  {c.requestedBy && (
                    <span
                      title={c.requestedBy}
                      data-testid={`text-command-issued-by-${c.commandId}`}
                    >
                      issued by:{" "}
                      {c.requestedByDisplayName
                        ? `${c.requestedByDisplayName}${c.requestedByEmail ? ` (${c.requestedByEmail})` : ""}`
                        : c.requestedByEmail ?? c.requestedBy}
                    </span>
                  )}
                  <span>{c.blockerReason ?? "platformSendAllowed:false"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
