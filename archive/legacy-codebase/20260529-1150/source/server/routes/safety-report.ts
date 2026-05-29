import type { Express, RequestHandler } from "express";
import { promises as fs } from "fs";
import path from "path";

const REPORT_PATH = path.resolve(process.cwd(), "docs/SAFETY_E2E_REPORT.md");

export interface SafetyGate {
  id: number;
  name: string;
  status: "PASS" | "FAIL";
  details: string;
}

export interface SafetyFixture {
  fixture: string;
  adversarial: string;
  expectedGate: string;
  rejectedAt: string;
  outcome: string;
}

export interface SafetyReport {
  ok: true;
  generatedAt: string | null;
  generatedAtIso: string | null;
  passing: number;
  total: number;
  allPassing: boolean;
  gates: SafetyGate[];
  fixtures: SafetyFixture[];
  raw: string;
  rawPath: string;
  fileModifiedAt: string;
}

function stripCellMarkdown(value: string): string {
  return value.replace(/`/g, "").trim();
}

function parseTableRows(markdown: string, headerMatcher: RegExp): string[][] {
  const lines = markdown.split(/\r?\n/);
  const rows: string[][] = [];
  let inTable = false;
  let sawSeparator = false;
  for (const line of lines) {
    if (!inTable) {
      if (headerMatcher.test(line)) inTable = true;
      continue;
    }
    if (!sawSeparator) {
      if (/^\s*\|?\s*[-:|\s]+\s*\|?\s*$/.test(line)) {
        sawSeparator = true;
      }
      continue;
    }
    if (!line.trim().startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length === 0) break;
    rows.push(cells);
  }
  return rows;
}

export function parseSafetyReport(markdown: string): Omit<SafetyReport, "ok" | "rawPath" | "fileModifiedAt" | "raw"> {
  const generatedMatch = markdown.match(/Generated at:\s*`([^`]+)`/);
  const generatedAtIso = generatedMatch ? generatedMatch[1].trim() : null;

  const resultMatch = markdown.match(/\*\*Result:\*\*\s*(\d+)\s*\/\s*(\d+)\s+gates?\s+passing/i);
  const passing = resultMatch ? Number(resultMatch[1]) : 0;
  const total = resultMatch ? Number(resultMatch[2]) : 0;

  const gateRows = parseTableRows(markdown, /^\|\s*#\s*\|\s*Gate\s*\|/i);
  const gates: SafetyGate[] = gateRows.map((cells) => {
    const status = stripCellMarkdown(cells[2] || "").toUpperCase() === "PASS" ? "PASS" : "FAIL";
    return {
      id: Number(stripCellMarkdown(cells[0] || "0")) || 0,
      name: stripCellMarkdown(cells[1] || ""),
      status,
      details: stripCellMarkdown(cells[3] || ""),
    };
  });

  const fixtureRows = parseTableRows(markdown, /^\|\s*Fixture\s*\|/i);
  const fixtures: SafetyFixture[] = fixtureRows.map((cells) => ({
    fixture: stripCellMarkdown(cells[0] || ""),
    adversarial: stripCellMarkdown(cells[1] || ""),
    expectedGate: stripCellMarkdown(cells[2] || ""),
    rejectedAt: stripCellMarkdown(cells[3] || ""),
    outcome: stripCellMarkdown(cells[4] || ""),
  }));

  const computedPassing = gates.filter((g) => g.status === "PASS").length;
  const finalPassing = resultMatch ? passing : computedPassing;
  const finalTotal = resultMatch ? total : gates.length;

  return {
    generatedAt: generatedAtIso,
    generatedAtIso,
    passing: finalPassing,
    total: finalTotal,
    allPassing: finalTotal > 0 && finalPassing === finalTotal,
    gates,
    fixtures,
  };
}

export function registerSafetyReportRoutes(app: Express, requireRootAdmin: RequestHandler): void {
  app.get("/api/admin/safety-report", requireRootAdmin, async (_req, res) => {
    try {
      const [raw, stat] = await Promise.all([
        fs.readFile(REPORT_PATH, "utf8"),
        fs.stat(REPORT_PATH),
      ]);
      const parsed = parseSafetyReport(raw);
      const payload: SafetyReport = {
        ok: true,
        ...parsed,
        raw,
        rawPath: "docs/SAFETY_E2E_REPORT.md",
        fileModifiedAt: stat.mtime.toISOString(),
      };
      res.json(payload);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        res.status(404).json({
          ok: false,
          error: "safety_report_missing",
          message: "docs/SAFETY_E2E_REPORT.md not found. Run `npm test` to regenerate it.",
        });
        return;
      }
      res.status(500).json({
        ok: false,
        error: "safety_report_read_failed",
        message: err?.message || "Failed to read safety report.",
      });
    }
  });

  app.get("/api/admin/safety-report/raw", requireRootAdmin, async (_req, res) => {
    try {
      const raw = await fs.readFile(REPORT_PATH, "utf8");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.send(raw);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        res.status(404).type("text/plain").send("docs/SAFETY_E2E_REPORT.md not found. Run `npm test` to regenerate it.");
        return;
      }
      res.status(500).type("text/plain").send(err?.message || "Failed to read safety report.");
    }
  });
}
