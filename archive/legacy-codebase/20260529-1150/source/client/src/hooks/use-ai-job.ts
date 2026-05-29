import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type AiJobStatus =
  | "pending"
  | "queued"
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "rejected"
  | "cancelled";

export type AiJobView = {
  jobId: string;
  jobType: string;
  status: AiJobStatus;
  attempt?: number;
  result?: any;
  error?: { code?: string; message?: string } | null;
  createdAt?: string;
  updatedAt?: string;
};

const TERMINAL = new Set(["succeeded", "failed", "rejected", "cancelled"]);

export function useAiJobPolling(
  jobId: string | null,
  options: { intervalMs?: number; enabled?: boolean } = {},
) {
  const intervalMs = options.intervalMs ?? 2500;
  const enabled = (options.enabled ?? true) && !!jobId;

  return useQuery<AiJobView>({
    queryKey: ["ai-job", jobId],
    enabled,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s && TERMINAL.has(s)) return false;
      return intervalMs;
    },
    refetchIntervalInBackground: false,
    retry: (count, err: any) => {
      const msg = err?.message || "";
      if (/^(400|401|403|404):/.test(msg)) return false;
      return count < 2;
    },
    queryFn: async () => {
      const res = await fetch(`/api/ai-jobs/${jobId}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${body || res.statusText}`);
      }
      return res.json();
    },
  });
}

export function useAiJobRunner<TBody = any, TEnqueueResp = { jobId: string }>(
  endpoint: string | ((args: TBody) => string),
  options: { intervalMs?: number } = {},
) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);
  const [enqueueResponse, setEnqueueResponse] = useState<TEnqueueResp | null>(null);
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const polling = useAiJobPolling(jobId, { intervalMs: options.intervalMs });

  const run = async (body: TBody) => {
    setEnqueueError(null);
    setIsEnqueuing(true);
    setJobId(null);
    setEnqueueResponse(null);
    try {
      const url = typeof endpoint === "function" ? endpoint(body) : endpoint;
      const res = await apiRequest("POST", url, body);
      const data = (await res.json()) as TEnqueueResp & { jobId?: string };
      if (!mounted.current) return data;
      setEnqueueResponse(data);
      if (data?.jobId) setJobId(data.jobId);
      return data;
    } catch (err: any) {
      const msg = err?.message ?? "Failed to enqueue job";
      if (mounted.current) setEnqueueError(msg);
      throw err;
    } finally {
      if (mounted.current) setIsEnqueuing(false);
    }
  };

  const reset = () => {
    setJobId(null);
    setEnqueueResponse(null);
    setEnqueueError(null);
  };

  return {
    run,
    reset,
    jobId,
    isEnqueuing,
    enqueueError,
    enqueueResponse,
    job: polling.data,
    isPolling: polling.isFetching && !TERMINAL.has(polling.data?.status ?? ""),
    pollError: polling.error ? (polling.error as Error).message : null,
    isTerminal: polling.data ? TERMINAL.has(polling.data.status) : false,
  };
}
