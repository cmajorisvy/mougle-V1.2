import fs from "node:fs";

const src = fs.readFileSync("server/routes.ts", "utf8");
const lines = src.split("\n");

interface Route {
  method: string;
  path: string;
  middleware: string[];
  line: number;
}

const routes: Route[] = [];
const re = /^\s*app\.(get|post|put|patch|delete)\(\s*"([^"]+)"\s*(?:,\s*([^,)]+(?:\s*,\s*[^,)]+)*))?/i;

lines.forEach((line, idx) => {
  const m = line.match(re);
  if (!m) return;
  const path = m[2];
  if (!path.startsWith("/api/admin/")) return;
  const middleware: string[] = [];
  if (m[3]) {
    for (const part of m[3].split(",")) {
      const t = part.trim();
      if (/^(require\w+|resolve\w+|\w+Middleware|agent\w+)/.test(t) && !t.startsWith("async") && !t.startsWith("(")) {
        middleware.push(t);
      }
    }
  }
  routes.push({ method: m[1].toUpperCase(), path, middleware, line: idx + 1 });
});

const groups: Record<string, { test: RegExp; routes: Route[] }> = {
  "Login & dashboard": { test: /^\/api\/admin\/(login|logout|verify|stats|users|posts|topics|debates|trigger)/, routes: [] },
  "Moderation": { test: /^\/api\/admin\/moderation\//, routes: [] },
  "Social distribution": { test: /^\/api\/admin\/(social|sdh)\//, routes: [] },
  "Promotion engine": { test: /^\/api\/admin\/promotion\//, routes: [] },
  "Growth": { test: /^\/api\/admin\/(growth|growth-autopilot)\//, routes: [] },
  "Founder control & command center": { test: /^\/api\/admin\/(founder-control|command-center)\//, routes: [] },
  "Billing analytics": { test: /^\/api\/admin\/(billing|transition-)/, routes: [] },
  "SEO & gravity": { test: /^\/api\/admin\/(seo|gravity|civilization)/, routes: [] },
  "Marketing": { test: /^\/api\/admin\/marketing\//, routes: [] },
  "AI cost & gateway": { test: /^\/api\/admin\/(ai-gateway|agent-cost)/, routes: [] },
  "Trust admin": { test: /^\/api\/admin\/trust\//, routes: [] },
  "Labs flywheel admin": { test: /^\/api\/admin\/flywheel\//, routes: [] },
  "Teams admin": { test: /^\/api\/admin\/teams\//, routes: [] },
  "GCIS (compliance)": { test: /^\/api\/admin\/gcis\//, routes: [] },
  "Adaptive policy": { test: /^\/api\/admin\/policy\//, routes: [] },
  "Support admin": { test: /^\/api\/admin\/support\//, routes: [] },
  "Knowledge base admin": { test: /^\/api\/admin\/kb\//, routes: [] },
  "Email tests": { test: /^\/api\/admin\/email\//, routes: [] },
  "Operations center": { test: /^\/api\/admin\/operations\//, routes: [] },
  "BondScore admin": { test: /^\/api\/admin\/bondscore\//, routes: [] },
  "Authority & inevitable platform monitors": { test: /^\/api\/admin\/(inevitable-platform|authority-flywheel)/, routes: [] },
  "Bootstrap, PNR & workday": { test: /^\/api\/admin\/(bootstrap|pnr-monitor|workday)/, routes: [] },
  "Dev orders admin": { test: /^\/api\/admin\/dev-orders/, routes: [] },
  "Legal safety admin": { test: /^\/api\/admin\/legal-safety/, routes: [] },
};

const ungrouped: Route[] = [];

for (const r of routes) {
  let placed = false;
  for (const key of Object.keys(groups)) {
    if (groups[key].test.test(r.path)) {
      groups[key].routes.push(r);
      placed = true;
      break;
    }
  }
  if (!placed) ungrouped.push(r);
}

function purposeFor(r: Route): string {
  const segs = r.path.replace("/api/admin/", "").split("/");
  const last = segs[segs.length - 1];
  const action = last.startsWith(":") ? segs[segs.length - 2] : last;
  const verb = r.method;
  const noun = action.replace(/-/g, " ");
  if (verb === "GET") return `Read ${noun}.`;
  if (verb === "POST") return `Trigger / create ${noun}.`;
  if (verb === "PUT") return `Replace ${noun}.`;
  if (verb === "PATCH") return `Update ${noun}.`;
  if (verb === "DELETE") return `Delete ${noun}.`;
  return "";
}

const out: string[] = [];
out.push("<!-- BEGIN: auto-generated admin route tables -->");
for (const [section, data] of Object.entries(groups)) {
  if (data.routes.length === 0) continue;
  out.push(`### ${section}`);
  out.push("");
  out.push("| Method | Path | Purpose |");
  out.push("|---|---|---|");
  for (const r of data.routes) {
    out.push(`| ${r.method} | \`${r.path}\` | ${purposeFor(r)} |`);
  }
  out.push("");
}

if (ungrouped.length) {
  out.push("### Other admin endpoints");
  out.push("");
  out.push("| Method | Path | Purpose |");
  out.push("|---|---|---|");
  for (const r of ungrouped) {
    out.push(`| ${r.method} | \`${r.path}\` | ${purposeFor(r)} |`);
  }
  out.push("");
}
out.push("<!-- END: auto-generated admin route tables -->");

fs.writeFileSync("/tmp/admin_tables.md", out.join("\n"));
console.log(`Extracted ${routes.length} admin routes (ungrouped: ${ungrouped.length})`);
