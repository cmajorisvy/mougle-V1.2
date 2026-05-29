/**
 * Admin route/link audit guard.
 *
 * Verification-only: keeps AdminDashboard card links aligned with the client
 * route table and catches stale admin page imports before a dashboard card can
 * point at a missing page.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.cwd();
const APP_PATH = resolve(REPO, "client/src/App.tsx");
const DASHBOARD_PATH = resolve(REPO, "client/src/pages/admin/AdminDashboard.tsx");

// Dashboard hrefs should point at exact literal routes. Use this only for a
// deliberate literal href that is expected to resolve through a param route.
const PARAM_ONLY_DASHBOARD_HREF_ALLOWLIST: Record<string, string> = {};

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePattern(route: string): RegExp {
  const pattern = route
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "[^/]+" : escapeRegex(segment)))
    .join("/");
  return new RegExp(`^${pattern}$`);
}

function extractAdminRoutes(appSource: string): string[] {
  return unique(
    [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path === "/admin" || path.startsWith("/admin/")),
  );
}

function extractDashboardAdminHrefs(dashboardSource: string): string[] {
  return unique(
    [...dashboardSource.matchAll(/\bhref:\s*"([^"]+)"/g)]
      .map((match) => match[1])
      .filter((href) => href === "/admin" || href.startsWith("/admin/")),
  );
}

function extractAdminPageImports(appSource: string): string[] {
  const importSpecs = [
    ...appSource.matchAll(
      /(?:import\s+[^;]*?\s+from\s+|lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\()"(@\/pages\/admin\/[^"]+)"/g,
    ),
  ].map((match) => match[1]);

  return unique(importSpecs);
}

function adminImportExists(specifier: string): boolean {
  const withoutAlias = specifier.replace(/^@\//, "client/src/");
  return [
    resolve(REPO, `${withoutAlias}.tsx`),
    resolve(REPO, `${withoutAlias}.ts`),
    resolve(REPO, withoutAlias, "index.tsx"),
    resolve(REPO, withoutAlias, "index.ts"),
  ].some((candidate) => existsSync(candidate));
}

describe("AdminDashboard route/link audit", () => {
  const appSource = read(APP_PATH);
  const dashboardSource = read(DASHBOARD_PATH);
  const adminRoutes = extractAdminRoutes(appSource);
  const exactAdminRoutes = new Set(adminRoutes);
  const paramAdminRoutes = adminRoutes.filter((route) =>
    route.split("/").some((segment) => segment.startsWith(":")),
  );
  const paramRoutePatterns = paramAdminRoutes.map((route) => ({
    route,
    pattern: routePattern(route),
  }));

  it("keeps every AdminDashboard card href registered as an exact literal route in App.tsx", () => {
    const dashboardHrefs = extractDashboardAdminHrefs(dashboardSource);
    assert.ok(dashboardHrefs.length >= 60, "expected the dashboard to expose the admin operations link set");

    const failures = dashboardHrefs.flatMap((href) => {
      if (exactAdminRoutes.has(href)) return [];

      const paramMatches = paramRoutePatterns
        .filter(({ pattern }) => pattern.test(href))
        .map(({ route }) => route);
      const allowedParamRoute = PARAM_ONLY_DASHBOARD_HREF_ALLOWLIST[href];

      if (allowedParamRoute) {
        return paramMatches.includes(allowedParamRoute)
          ? []
          : [`${href} is allowlisted for ${allowedParamRoute}, but only matched: ${paramMatches.join(", ") || "none"}`];
      }

      if (paramMatches.length > 0) {
        return [
          `${href} has no exact <Route path="${href}"> and only matched param route(s): ${paramMatches.join(
            ", ",
          )}. Add the literal route back or explicitly allowlist this href.`,
        ];
      }

      return [`${href} has no matching admin route in App.tsx.`];
    });

    assert.deepEqual(failures, []);
  });

  it("keeps every App.tsx admin page import pointed at an existing file", () => {
    const imports = extractAdminPageImports(appSource);
    assert.ok(imports.length >= 80, "expected App.tsx to import the admin page surface");

    const missing = imports.filter((specifier) => !adminImportExists(specifier));
    assert.deepEqual(missing, []);
  });
});
