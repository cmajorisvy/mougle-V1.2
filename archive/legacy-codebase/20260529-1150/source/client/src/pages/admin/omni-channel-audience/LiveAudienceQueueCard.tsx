import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Decision } from "./_shared";

export function LiveAudienceQueueCard({
  productionId,
  messages,
  decisions,
}: {
  productionId: string;
  messages: any[];
  decisions: Decision[];
}) {
  const qc = useQueryClient();

  const evaluateMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("POST", `/api/admin/newsroom/audience/message/${messageId}/evaluate`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/admin/newsroom/audience/${productionId}/history`] }),
  });

  const sendToScreenMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("POST", `/api/admin/newsroom/audience/message/${messageId}/route-to-screen`);
    },
  });

  const sendToRobotMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("POST", `/api/admin/newsroom/audience/message/${messageId}/route-to-robot`);
    },
  });

  const simulateMutation = useMutation({
    mutationFn: async ({ messageId, action }: { messageId: string; action: string }) => {
      return await apiRequest("POST", `/api/admin/newsroom/audience/message/${messageId}/simulate-moderation`, {
        requestedAction: action,
        requestedBy: "ai_moderator",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/admin/newsroom/audience/${productionId}/history`] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Audience Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[480px]">
          <div className="space-y-2">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-no-messages">No audience messages yet.</p>
            )}
            {messages.map((m) => {
              const d = decisions.find((x) => x.messageId === m.messageId);
              return (
                <div
                  key={m.messageId}
                  className="rounded border p-3 space-y-2"
                  data-testid={`card-message-${m.messageId}`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline">{m.platform}</Badge>
                      <Badge variant="secondary">{m.messageType}</Badge>
                      {m.giftValue != null && <Badge variant="default">${m.giftValue}</Badge>}
                    </div>
                    <span className="text-muted-foreground">{m.externalAuthorIdHash.slice(0, 8)}…</span>
                  </div>
                  <div className="text-sm">{m.messageText}</div>
                  {d && (
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={d.reasonCodes.length === 0 ? "default" : "destructive"}>
                        {d.action}
                      </Badge>
                      {d.reasonCodes.map((r) => (
                        <Badge key={r} variant="destructive">{r}</Badge>
                      ))}
                      <Badge variant="outline">C_audience = {d.cAudienceSafety.toFixed(2)}</Badge>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => evaluateMutation.mutate(m.messageId)}
                      data-testid={`button-evaluate-${m.messageId}`}
                    >Evaluate</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendToRobotMutation.mutate(m.messageId)}
                      data-testid={`button-send-robot-${m.messageId}`}
                    >Send to robot</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendToScreenMutation.mutate(m.messageId)}
                      data-testid={`button-send-screen-${m.messageId}`}
                    >Send to screen</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => simulateMutation.mutate({ messageId: m.messageId, action: "hide_comment" })}
                      data-testid={`button-simulate-hide-${m.messageId}`}
                    >Simulate hide</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => simulateMutation.mutate({ messageId: m.messageId, action: "delete_comment" })}
                      data-testid={`button-simulate-delete-${m.messageId}`}
                    >Simulate delete</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => simulateMutation.mutate({ messageId: m.messageId, action: "reply" })}
                      data-testid={`button-simulate-reply-${m.messageId}`}
                    >Simulate reply</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
