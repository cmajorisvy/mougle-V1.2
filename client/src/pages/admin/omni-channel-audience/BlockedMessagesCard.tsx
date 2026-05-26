import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Decision } from "./_shared";

export function BlockedMessagesCard({ blocked }: { blocked: Decision[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocked Messages</CardTitle>
      </CardHeader>
      <CardContent>
        {blocked.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-blocked">Nothing blocked.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {blocked.map((d) => (
              <li key={d.decisionId} data-testid={`row-blocked-${d.decisionId}`}>
                <Badge variant="destructive">{d.action}</Badge>{" "}
                <Badge variant="outline">{d.platform}</Badge>{" "}
                {d.reasonCodes.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
