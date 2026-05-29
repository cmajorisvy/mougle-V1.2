import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Connector } from "./_shared";

interface ConnectorSecretMeta {
  connectorId: string;
  platform: string;
  keyVersion: number;
  rotationCount: number;
  lastRotatedBy: string | null;
  lastRotatedAt: string;
  createdAt: string;
}

interface ConnectorSecretRotationEntry {
  id: string;
  connectorId: string;
  platform: string;
  action: "set" | "rotate" | "delete";
  rotatedBy: string | null;
  rotatedAt: string;
  rotationCount: number;
  keyVersion: number;
}

interface ConnectorSecretResponse {
  secret: ConnectorSecretMeta | null;
  rotations: ConnectorSecretRotationEntry[];
  secretsKeyConfigured: boolean;
}

export function ConnectorSecretPanel({ connector }: { connector: Connector }) {
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const secretQuery = useQuery<ConnectorSecretResponse>({
    queryKey: [`/api/admin/newsroom/audience/connectors/${connector.connectorId}/secret`],
  });

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: [`/api/admin/newsroom/audience/connectors/${connector.connectorId}/secret`],
    });

  const setMutation = useMutation({
    mutationFn: async (t: string) => {
      return await apiRequest(
        "PUT",
        `/api/admin/newsroom/audience/connectors/${connector.connectorId}/secret`,
        { token: t, platform: connector.platform },
      );
    },
    onSuccess: () => {
      setToken("");
      setShowInput(false);
      setError(null);
      invalidate();
    },
    onError: (e: any) => setError(e?.message ?? "save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        "DELETE",
        `/api/admin/newsroom/audience/connectors/${connector.connectorId}/secret`,
      );
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: any) => setError(e?.message ?? "delete failed"),
  });

  const data = secretQuery.data;
  const meta = data?.secret ?? null;
  const keyConfigured = data?.secretsKeyConfigured ?? false;

  const submit = () => {
    if (!token.trim()) {
      setError("token cannot be empty");
      return;
    }
    setMutation.mutate(token.trim());
  };

  const confirmDelete = () => {
    if (!window.confirm(`Remove stored access token for ${connector.displayName}?`)) return;
    deleteMutation.mutate();
  };

  return (
    <div
      className="pt-2 border-t space-y-2"
      data-testid={`section-secret-${connector.connectorId}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">
          Platform access token
        </div>
        {meta ? (
          <Badge variant="default" data-testid={`badge-secret-status-${connector.connectorId}`}>
            configured
          </Badge>
        ) : (
          <Badge variant="secondary" data-testid={`badge-secret-status-${connector.connectorId}`}>
            not set
          </Badge>
        )}
      </div>

      {!keyConfigured && (
        <p
          className="text-xs text-amber-600 dark:text-amber-400"
          data-testid={`text-secret-key-missing-${connector.connectorId}`}
        >
          AUDIENCE_GATEWAY_SECRETS_KEY is not configured — token storage is disabled.
        </p>
      )}

      {meta && (
        <div
          className="text-xs text-muted-foreground space-y-0.5"
          data-testid={`text-secret-meta-${connector.connectorId}`}
        >
          <div>
            Last rotated:{" "}
            <span data-testid={`text-secret-rotated-at-${connector.connectorId}`}>
              {new Date(meta.lastRotatedAt).toLocaleString()}
            </span>
          </div>
          <div>
            Rotated by:{" "}
            <span data-testid={`text-secret-rotated-by-${connector.connectorId}`}>
              {meta.lastRotatedBy ?? "—"}
            </span>
          </div>
          <div>
            Rotation count:{" "}
            <span data-testid={`text-secret-rotation-count-${connector.connectorId}`}>
              {meta.rotationCount}
            </span>
          </div>
        </div>
      )}

      {showInput ? (
        <div className="space-y-2">
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste new access token"
            disabled={setMutation.isPending || !keyConfigured}
            data-testid={`input-secret-token-${connector.connectorId}`}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={submit}
              disabled={setMutation.isPending || !keyConfigured}
              data-testid={`button-secret-save-${connector.connectorId}`}
            >
              {setMutation.isPending ? "Saving…" : "Save token"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowInput(false);
                setToken("");
                setError(null);
              }}
              disabled={setMutation.isPending}
              data-testid={`button-secret-cancel-${connector.connectorId}`}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowInput(true);
              setError(null);
            }}
            disabled={!keyConfigured}
            data-testid={`button-secret-${meta ? "rotate" : "set"}-${connector.connectorId}`}
          >
            {meta ? "Rotate token" : "Set token"}
          </Button>
          {meta && (
            <Button
              size="sm"
              variant="outline"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid={`button-secret-remove-${connector.connectorId}`}
            >
              {deleteMutation.isPending ? "Removing…" : "Remove token"}
            </Button>
          )}
        </div>
      )}

      {error && (
        <p
          className="text-xs text-destructive"
          data-testid={`text-secret-error-${connector.connectorId}`}
        >
          {error}
        </p>
      )}

      {data && data.rotations && data.rotations.length > 0 && (
        <div
          className="pt-2 border-t space-y-1"
          data-testid={`section-secret-rotations-${connector.connectorId}`}
        >
          <div className="text-xs font-medium text-muted-foreground">
            Rotation history
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {data.rotations.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2"
                data-testid={`row-secret-rotation-${connector.connectorId}-${r.id}`}
              >
                <span>
                  <span
                    className="font-mono uppercase tracking-wide mr-1"
                    data-testid={`text-secret-rotation-action-${connector.connectorId}-${r.id}`}
                  >
                    {r.action}
                  </span>
                  by{" "}
                  <span
                    data-testid={`text-secret-rotation-by-${connector.connectorId}-${r.id}`}
                  >
                    {r.rotatedBy ?? "—"}
                  </span>
                </span>
                <span
                  data-testid={`text-secret-rotation-at-${connector.connectorId}-${r.id}`}
                >
                  {new Date(r.rotatedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
