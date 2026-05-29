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
import { ArchiveFile, ArchivePreviewResult, ArchiveRowCountResult, formatBytes } from "./_shared";

export function ArchiveBrowserCard() {
  const qc = useQueryClient();
  const [tableFilter, setTableFilter] = useState<"" | "messages" | "decisions" | "commands">("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<ArchiveFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLoadingMore, setPreviewLoadingMore] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ArchivePreviewResult | null>(null);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [rowCountCache, setRowCountCache] = useState<Record<string, number>>({});
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [searchWholeFile, setSearchWholeFile] = useState(false);
  const [searchSubmitting, setSearchSubmitting] = useState(false);
  const [jumpToRow, setJumpToRow] = useState("");
  const [jumpSubmitting, setJumpSubmitting] = useState(false);

  const PREVIEW_LIMIT = 50;

  const rememberRowCount = (path: string, total: number) => {
    setRowCountCache((prev) => (prev[path] === total ? prev : { ...prev, [path]: total }));
  };

  const fetchPreviewPage = async (
    file: ArchiveFile,
    opts: { offset?: number; query?: string },
  ): Promise<ArchivePreviewResult> => {
    const params = new URLSearchParams();
    params.set("path", file.path);
    params.set("limit", String(PREVIEW_LIMIT));
    if (opts.query && opts.query.trim()) {
      params.set("q", opts.query.trim());
    } else {
      params.set("offset", String(opts.offset ?? 0));
    }
    const u = `/api/admin/newsroom/audience/retention/archive/preview?${params.toString()}`;
    const res = await fetch(u, { credentials: "include" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `preview failed (${res.status})`);
    }
    return (await res.json()) as ArchivePreviewResult;
  };

  const openPreview = async (file: ArchiveFile) => {
    setPreviewFile(file);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setPreviewSearch("");
    setCountError(null);
    setSearchWholeFile(false);
    setJumpToRow("");
    try {
      const json = await fetchPreviewPage(file, { offset: 0 });
      setPreviewData(json);
      if (json.totalRows != null) rememberRowCount(file.path, json.totalRows);
      else if (file.rowCount != null) rememberRowCount(file.path, file.rowCount);
    } catch (e: any) {
      setPreviewError(e?.message ?? "preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadMorePreview = async () => {
    if (!previewFile || !previewData || previewData.query) return;
    setPreviewLoadingMore(true);
    setPreviewError(null);
    try {
      const nextOffset = previewData.offset + previewData.rows.length;
      const json = await fetchPreviewPage(previewFile, { offset: nextOffset });
      setPreviewData({
        ...json,
        rows: [...previewData.rows, ...json.rows],
        offset: previewData.offset,
        truncated: json.truncated,
        parseErrors: previewData.parseErrors + json.parseErrors,
      });
      if (json.totalRows != null) rememberRowCount(previewFile.path, json.totalRows);
    } catch (e: any) {
      setPreviewError(e?.message ?? "preview failed");
    } finally {
      setPreviewLoadingMore(false);
    }
  };

  const countAllRows = async () => {
    if (!previewFile) return;
    setCounting(true);
    setCountError(null);
    try {
      const u = `/api/admin/newsroom/audience/retention/archive/count?path=${encodeURIComponent(previewFile.path)}`;
      const res = await fetch(u, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `count failed (${res.status})`);
      }
      const json = (await res.json()) as ArchiveRowCountResult;
      rememberRowCount(previewFile.path, json.rowCount);
    } catch (e: any) {
      setCountError(e?.message ?? "count failed");
    } finally {
      setCounting(false);
    }
  };

  const runServerSearch = async () => {
    if (!previewFile) return;
    const q = previewSearch.trim();
    setSearchSubmitting(true);
    setPreviewError(null);
    try {
      const json = await fetchPreviewPage(previewFile, q ? { query: q } : { offset: 0 });
      setPreviewData(json);
      // Search mode streams the whole file, so totalScanned is the true row count.
      if (json.totalScanned != null) rememberRowCount(previewFile.path, json.totalScanned);
    } catch (e: any) {
      setPreviewError(e?.message ?? "search failed");
    } finally {
      setSearchSubmitting(false);
    }
  };

  const jumpToRowAction = async () => {
    if (!previewFile) return;
    const n = Math.floor(Number(jumpToRow));
    if (!Number.isFinite(n) || n < 1) return;
    const knownTotal =
      rowCountCache[previewFile.path] ??
      previewData?.totalRows ??
      previewFile.rowCount ??
      null;
    const targetRow = knownTotal != null ? Math.min(n, knownTotal) : n;
    const offset = targetRow - 1;
    setJumpSubmitting(true);
    setPreviewError(null);
    try {
      const json = await fetchPreviewPage(previewFile, { offset });
      setPreviewData(json);
      if (json.totalRows != null) rememberRowCount(previewFile.path, json.totalRows);
    } catch (e: any) {
      setPreviewError(e?.message ?? "jump failed");
    } finally {
      setJumpSubmitting(false);
    }
  };

  const clearServerSearch = async () => {
    if (!previewFile) return;
    setSearchSubmitting(true);
    setPreviewError(null);
    try {
      const json = await fetchPreviewPage(previewFile, { offset: 0 });
      setPreviewData(json);
      setPreviewSearch("");
    } catch (e: any) {
      setPreviewError(e?.message ?? "preview failed");
    } finally {
      setSearchSubmitting(false);
    }
  };

  const jumpToMatchLine = async (lineNumber: number) => {
    if (!previewFile) return;
    if (!Number.isFinite(lineNumber) || lineNumber < 1) return;
    const offset = Math.floor(lineNumber) - 1;
    setJumpSubmitting(true);
    setSearchSubmitting(true);
    setPreviewError(null);
    try {
      const json = await fetchPreviewPage(previewFile, { offset });
      setPreviewData(json);
      setPreviewSearch("");
      setSearchWholeFile(false);
      setJumpToRow(String(Math.floor(lineNumber)));
      if (json.totalRows != null) rememberRowCount(previewFile.path, json.totalRows);
    } catch (e: any) {
      setPreviewError(e?.message ?? "jump failed");
    } finally {
      setJumpSubmitting(false);
      setSearchSubmitting(false);
    }
  };

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (tableFilter) params.set("table", tableFilter);
  const url = `/api/admin/newsroom/audience/retention/archive/files?${params.toString()}`;

  const filesQuery = useQuery<{
    files: ArchiveFile[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: [url],
  });

  const restoreMutation = useMutation({
    mutationFn: async (archivePath: string) => {
      return await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/retention/restore",
        { archivePath },
      );
    },
    onSuccess: (data: any) => {
      const r = data?.result;
      setRestoreError(null);
      if (r) {
        setRestoreNotice(
          `Restored ${r.rowsInserted} of ${r.rowsParsed} rows into audience_${r.table} (${r.rowsSkipped} already present)`,
        );
      }
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/retention/restore-log"] });
    },
    onError: (e: any) => {
      setRestoreNotice(null);
      setRestoreError(e?.message ?? "restore failed");
    },
    onSettled: () => setRestoringPath(null),
  });

  const triggerRestore = (file: ArchiveFile) => {
    const rowLabel = file.rowCount != null ? `${file.rowCount}` : "all";
    const ok = window.confirm(
      `Restore ${rowLabel} archived row(s) from\n\n${file.path}\n\nback into audience_${file.table}? Already-present rows will be skipped.`,
    );
    if (!ok) return;
    setRestoringPath(file.path);
    restoreMutation.mutate(file.path);
  };

  const downloadFile = async (file: ArchiveFile) => {
    setDownloading(file.path);
    setDownloadError(null);
    try {
      const dl = `/api/admin/newsroom/audience/retention/archive/download?path=${encodeURIComponent(file.path)}`;
      const res = await fetch(dl, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `download failed (${res.status})`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = file.path.split("/").pop() ?? "audience-archive.jsonl.gz";
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      setDownloadError(e?.message ?? "download failed");
    } finally {
      setDownloading(null);
    }
  };

  const data = filesQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
    <Card data-testid="card-archive-browser">
      <CardHeader>
        <CardTitle>Audience Archive Files</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Every sweep that runs in <strong>archive</strong> mode writes a gzipped
          JSONL copy of the pruned rows to
          <code className="mx-1">PRIVATE_OBJECT_DIR/audience-archive/&lt;table&gt;/</code>.
          Use this browser to download a specific archive for regulator review or
          incident reconstruction. Root admin only.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Table</span>
            <select
              value={tableFilter}
              onChange={(e) => {
                setTableFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-40 h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-archive-table"
            >
              <option value="">All tables</option>
              <option value="messages">messages</option>
              <option value="decisions">decisions</option>
              <option value="commands">commands</option>
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => filesQuery.refetch()}
            disabled={filesQuery.isFetching}
            data-testid="button-archive-refresh"
          >
            {filesQuery.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          {downloadError && (
            <span className="text-xs text-destructive self-center" data-testid="text-archive-error">
              {downloadError}
            </span>
          )}
        </div>

        {filesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="text-archive-loading">
            Loading archive files…
          </p>
        ) : filesQuery.error ? (
          <p className="text-sm text-destructive" data-testid="text-archive-list-error">
            Could not list archive files: {(filesQuery.error as Error).message}
          </p>
        ) : !data || data.files.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-archive-empty">
            No archive files yet. Switch a table to <code>archive</code> mode and
            run a sweep to create one.
          </p>
        ) : (
          <>
            {restoreNotice && (
              <div
                className="text-xs text-emerald-600 dark:text-emerald-400"
                data-testid="text-archive-restore-notice"
              >
                {restoreNotice}
              </div>
            )}
            {restoreError && (
              <div className="text-xs text-destructive" data-testid="text-archive-restore-error">
                {restoreError}
              </div>
            )}
            <div className="space-y-4">
              {(["messages", "decisions", "commands"] as const).map((tbl) => {
                const group = data.files.filter((f) => f.table === tbl);
                if (group.length === 0) return null;
                return (
                  <div key={tbl} className="space-y-1" data-testid={`group-archive-${tbl}`}>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <Badge variant="outline">audience_{tbl}</Badge>
                      <span className="text-muted-foreground">
                        {group.length} file{group.length === 1 ? "" : "s"} on this page
                      </span>
                    </div>
                    {group.map((f) => (
                      <div
                        key={f.path}
                        className="flex items-center justify-between gap-2 rounded border p-2 text-xs"
                        data-testid={`row-archive-file-${f.table}-${f.path}`}
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex gap-2 items-center flex-wrap">
                            <span className="text-muted-foreground">
                              {f.rowCount != null ? `${f.rowCount.toLocaleString()} rows` : "—"} · {formatBytes(f.bytes)}
                            </span>
                            {(f.updatedAt || f.sweepStartedAt) && (
                              <span className="text-muted-foreground">
                                {new Date(f.updatedAt ?? f.sweepStartedAt!).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] break-all text-muted-foreground">
                            {f.path}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPreview(f)}
                            data-testid={`button-archive-preview-${f.table}-${f.path}`}
                          >
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => triggerRestore(f)}
                            disabled={restoringPath === f.path || restoreMutation.isPending}
                            data-testid={`button-archive-restore-${f.table}-${f.path}`}
                          >
                            {restoringPath === f.path ? "Restoring…" : "Restore"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadFile(f)}
                            disabled={downloading === f.path}
                            data-testid={`button-archive-download-${f.table}-${f.path}`}
                          >
                            {downloading === f.path ? "Downloading…" : "Download"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span data-testid="text-archive-total">
                {data.total.toLocaleString()} file{data.total === 1 ? "" : "s"} · page {data.page} / {totalPages}
              </span>
              <div className="flex gap-1 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || filesQuery.isFetching}
                  data-testid="button-archive-prev"
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages || filesQuery.isFetching}
                  data-testid="button-archive-next"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent
        className="max-w-3xl"
        data-testid="dialog-archive-preview"
      >
        <DialogHeader>
          <DialogTitle>Archive preview</DialogTitle>
          <DialogDescription>
            First {PREVIEW_LIMIT} decompressed rows of the gzipped JSONL archive. Root admin only.
          </DialogDescription>
        </DialogHeader>
        {previewFile && (
          <div className="text-xs space-y-1 border rounded p-2 bg-muted/40" data-testid="text-archive-preview-meta">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline">{previewFile.table}</Badge>
              <span className="text-muted-foreground" data-testid="text-archive-preview-total">
                {(() => {
                  const total = rowCountCache[previewFile.path] ?? previewFile.rowCount;
                  return total != null
                    ? `${total.toLocaleString()} rows total`
                    : "row count unknown";
                })()} · {formatBytes(previewFile.bytes)}
              </span>
              {previewFile.sweepStartedAt && (
                <span className="text-muted-foreground">
                  swept {new Date(previewFile.sweepStartedAt).toLocaleString()}
                </span>
              )}
              {previewFile.cutoffIso && (
                <span className="text-muted-foreground">
                  cutoff {new Date(previewFile.cutoffIso).toLocaleString()}
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] break-all text-muted-foreground">
              {previewFile.path}
            </div>
          </div>
        )}
        {previewLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="text-archive-preview-loading">
            Decompressing first {PREVIEW_LIMIT} rows…
          </p>
        ) : previewError ? (
          <p className="text-sm text-destructive" data-testid="text-archive-preview-error">
            Could not preview file: {previewError}
          </p>
        ) : previewData ? (
          (() => {
            const serverQuery = previewData.query ?? null;
            // Highlight + filter source: when in server-search mode, highlight
            // by the server's query; otherwise allow local-only filtering by
            // the current input value.
            const localQ = serverQuery ? "" : previewSearch.trim().toLowerCase();
            const highlightQ = (serverQuery ?? previewSearch.trim()).toLowerCase();
            const rendered = previewData.rows.map((r, i) => ({
              index: i,
              text: JSON.stringify(r, null, 2),
              lineNumber:
                previewData.rowLineNumbers?.[i] ?? previewData.offset + i + 1,
            }));
            const matches = localQ
              ? rendered.filter((r) => r.text.toLowerCase().includes(localQ))
              : rendered;
            const visible = localQ ? matches : rendered;
            const escapeHtml = (s: string) =>
              s
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            const highlight = (text: string) => {
              if (!highlightQ) return escapeHtml(text);
              const lower = text.toLowerCase();
              let out = "";
              let i = 0;
              while (i < text.length) {
                const idx = lower.indexOf(highlightQ, i);
                if (idx === -1) {
                  out += escapeHtml(text.slice(i));
                  break;
                }
                out += escapeHtml(text.slice(i, idx));
                out +=
                  '<mark class="bg-yellow-300 text-black rounded px-0.5">' +
                  escapeHtml(text.slice(idx, idx + highlightQ.length)) +
                  "</mark>";
                i = idx + highlightQ.length;
              }
              return out;
            };
            const emptyMessage = serverQuery
              ? `(no rows in the whole file matched "${serverQuery}")`
              : localQ
                ? "(no rows matched your search in this page)"
                : "(file decoded but contained no rows)";
            const html =
              visible.length === 0
                ? emptyMessage
                : visible
                    .map(
                      (r) =>
                        `// row ${r.lineNumber}\n${highlight(r.text)}`,
                    )
                    .join("\n\n");
            const matchRowsForJump = serverQuery ? visible : [];
            return (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && searchWholeFile && !searchSubmitting) {
                        e.preventDefault();
                        runServerSearch();
                      }
                    }}
                    placeholder={
                      searchWholeFile
                        ? "Search the whole file (press Enter)…"
                        : "Filter loaded rows (e.g. author id, message text)…"
                    }
                    className="flex-1 min-w-[200px] h-9 rounded border bg-background px-2 text-sm"
                    data-testid="input-archive-preview-search"
                  />
                  <label
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                    data-testid="label-archive-preview-search-mode"
                  >
                    <input
                      type="checkbox"
                      checked={searchWholeFile}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setSearchWholeFile(next);
                        // Leaving whole-file mode → drop the server search and
                        // return to the first-page view.
                        if (!next && serverQuery) {
                          clearServerSearch();
                        }
                      }}
                      data-testid="checkbox-archive-preview-search-whole-file"
                    />
                    Search whole file
                  </label>
                  {searchWholeFile && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={runServerSearch}
                      disabled={searchSubmitting || previewSearch.trim().length === 0}
                      data-testid="button-archive-preview-search-run"
                    >
                      {searchSubmitting ? "Searching…" : "Search"}
                    </Button>
                  )}
                  {serverQuery && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clearServerSearch}
                      disabled={searchSubmitting}
                      data-testid="button-archive-preview-search-clear"
                    >
                      Clear
                    </Button>
                  )}
                  {!serverQuery && (
                    <div
                      className="flex items-center gap-1"
                      data-testid="group-archive-preview-jump"
                    >
                      <label
                        className="text-xs text-muted-foreground"
                        htmlFor="input-archive-preview-jump"
                      >
                        Jump to row
                      </label>
                      <input
                        id="input-archive-preview-jump"
                        type="number"
                        min={1}
                        value={jumpToRow}
                        onChange={(e) => setJumpToRow(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !jumpSubmitting) {
                            e.preventDefault();
                            jumpToRowAction();
                          }
                        }}
                        placeholder="e.g. 12345"
                        className="w-28 h-9 rounded border bg-background px-2 text-sm"
                        data-testid="input-archive-preview-jump"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={jumpToRowAction}
                        disabled={
                          jumpSubmitting ||
                          !jumpToRow.trim() ||
                          !(Number(jumpToRow) >= 1)
                        }
                        data-testid="button-archive-preview-jump"
                      >
                        {jumpSubmitting ? "Jumping…" : "Go"}
                      </Button>
                    </div>
                  )}
                  {serverQuery && (previewData.totalMatches ?? 0) > 0 && previewFile && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const u = `/api/admin/newsroom/audience/retention/archive/search-export.csv?path=${encodeURIComponent(previewFile.path)}&q=${encodeURIComponent(serverQuery)}`;
                        // Trigger a real navigation so the browser handles the
                        // streamed CSV download (the route also writes an
                        // audit-export log entry server-side).
                        window.location.assign(u);
                      }}
                      data-testid="button-archive-preview-search-export-csv"
                    >
                      Download matches (.csv)
                    </Button>
                  )}
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="text-archive-preview-match-count"
                  >
                    {serverQuery
                      ? `${(previewData.totalMatches ?? 0).toLocaleString()} match${
                          (previewData.totalMatches ?? 0) === 1 ? "" : "es"
                        } in whole file (${(previewData.totalScanned ?? 0).toLocaleString()} rows scanned)`
                      : localQ
                        ? `${matches.length} of ${rendered.length} loaded row${rendered.length === 1 ? "" : "s"} match`
                        : `${rendered.length} loaded row${rendered.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
                  {(() => {
                    const knownTotal =
                      (previewFile && rowCountCache[previewFile.path]) ??
                      previewData.totalRows ??
                      previewFile?.rowCount ??
                      null;
                    if (serverQuery) {
                      return (
                        <span data-testid="text-archive-preview-count">
                          Showing first {rendered.length} matching row
                          {rendered.length === 1 ? "" : "s"}
                          {knownTotal != null ? ` (file has ${knownTotal.toLocaleString()} rows)` : ""}
                        </span>
                      );
                    }
                    const start = previewData.offset + 1;
                    const end = previewData.offset + rendered.length;
                    return (
                      <span data-testid="text-archive-preview-count">
                        Showing rows {start}–{end}
                        {knownTotal != null ? ` of ${knownTotal.toLocaleString()}` : ""}
                      </span>
                    );
                  })()}
                  {!serverQuery && previewFile && rowCountCache[previewFile.path] == null && previewData.totalRows == null && previewFile.rowCount == null && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={countAllRows}
                      disabled={counting}
                      data-testid="button-archive-preview-count-all"
                    >
                      {counting ? "Counting…" : "Count all rows"}
                    </Button>
                  )}
                  {countError && (
                    <span className="text-destructive" data-testid="text-archive-preview-count-error">
                      {countError}
                    </span>
                  )}
                  {previewData.truncated && (
                    <Badge variant="outline" data-testid="badge-archive-preview-truncated">
                      {serverQuery ? "more matches available" : "more rows available"}
                    </Badge>
                  )}
                  {previewData.parseErrors > 0 && (
                    <Badge variant="destructive" data-testid="badge-archive-preview-parse-errors">
                      {previewData.parseErrors} parse error{previewData.parseErrors === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {!serverQuery && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={loadMorePreview}
                      disabled={!previewData.truncated || previewLoadingMore}
                      data-testid="button-archive-preview-load-more"
                    >
                      {previewLoadingMore
                        ? "Loading…"
                        : previewData.truncated
                          ? `Load next ${PREVIEW_LIMIT}`
                          : "End of file"}
                    </Button>
                  )}
                </div>
                <ScrollArea className="h-80 rounded border">
                  {serverQuery ? (
                    <div
                      className="p-2 space-y-3"
                      data-testid="text-archive-preview-rows"
                    >
                      {matchRowsForJump.length === 0 ? (
                        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
                          {emptyMessage}
                        </pre>
                      ) : (
                        matchRowsForJump.map((r) => (
                          <div
                            key={`${r.lineNumber}-${r.index}`}
                            className="space-y-1"
                            data-testid={`row-archive-preview-match-${r.lineNumber}`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="font-mono">
                                // row {r.lineNumber}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => jumpToMatchLine(r.lineNumber)}
                                disabled={jumpSubmitting || searchSubmitting}
                                data-testid={`button-archive-preview-view-in-file-${r.lineNumber}`}
                                title="Clear the search and open this row in its 50-row file window"
                              >
                                View in file
                              </Button>
                            </div>
                            <pre
                              className="text-[11px] font-mono whitespace-pre-wrap break-all"
                              dangerouslySetInnerHTML={{
                                __html: highlight(r.text),
                              }}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <pre
                      className="text-[11px] font-mono whitespace-pre-wrap break-all p-2"
                      data-testid="text-archive-preview-rows"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  )}
                </ScrollArea>
              </>
            );
          })()
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );
}
