import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { ADMIN_STORAGE_STATE_PATH } from "./admin-auth-paths";

type ProductionUnit = {
  label: string;
  href: string;
  status: "admin" | "dryRun" | "manual";
  component: string;
  file: string;
  heading: string;
  safeText: string[];
};

const repoRoot = process.cwd();

function readRepoFile(filePath: string): string {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

const productionUnits: ProductionUnit[] = [
  {
    label: "Production House Console",
    href: "/admin/production-house",
    status: "admin",
    component: "ProductionHouse",
    file: "client/src/pages/admin/ProductionHouse.tsx",
    heading: "Mougle AI Production House",
    safeText: ["Readiness Center", "Approval Board", "No Auto-Approval"],
  },
  {
    label: "Video Render",
    href: "/admin/video-render",
    status: "dryRun",
    component: "VideoRender",
    file: "client/src/pages/admin/VideoRender.tsx",
    heading: "Avatar / Video Render",
    safeText: ["Dry-run default", "No provider calls", "live provider calls and publishing are disabled"],
  },
  {
    label: "Voice Jobs",
    href: "/admin/voice-jobs",
    status: "manual",
    component: "VoiceJobs",
    file: "client/src/pages/admin/VoiceJobs.tsx",
    heading: "Voice Jobs",
    safeText: ["Manual trigger", "Mock dry-run", "manual/admin review"],
  },
  {
    label: "AI Jobs",
    href: "/admin/ai-jobs",
    status: "admin",
    component: "AiJobMonitor",
    file: "client/src/pages/admin/AiJobMonitor.tsx",
    heading: "AI Job Monitor",
    safeText: ["All AI jobs across users", "Job type", "Status"],
  },
  {
    label: "AI Workers",
    href: "/admin/ai-workers",
    status: "admin",
    component: "AiWorkers",
    file: "client/src/pages/admin/AiWorkers.tsx",
    heading: "AI Workers",
    safeText: ["Health and throughput", "Derived status", "Reported status"],
  },
  {
    label: "AI Ops",
    href: "/admin/ai-ops",
    status: "admin",
    component: "AiOps",
    file: "client/src/pages/admin/AiOps.tsx",
    heading: "AI Operations",
    safeText: ["jobs", "workers", "retention"],
  },
  {
    label: "AI Retention",
    href: "/admin/ai-retention",
    status: "admin",
    component: "AiRetention",
    file: "client/src/pages/admin/AiRetention.tsx",
    heading: "AI Retention &amp; Cleanup",
    safeText: ["Dry run with current policy", "preview first", "button-dry-run"],
  },
  {
    label: "Build Queue / Readiness",
    href: "/admin/build-queue",
    status: "dryRun",
    component: "BuildQueueDashboard",
    file: "client/src/pages/admin/BuildQueueDashboard.tsx",
    heading: "Build Queue & Bootstrap Health",
    safeText: ["Build Queue", "Bootstrap Health", "No active builds in queue"],
  },
];

const r3fSurfaces = [
  {
    route: "/admin/r3f-preview-sandbox",
    page: "client/src/pages/admin/R3FPreviewSandbox.tsx",
    canvas: "client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx",
    selectors: ["r3f-sandbox-canvas", "r3f-sandbox-webgl-fallback"],
  },
  {
    route: "/admin/avatar-rig-preview",
    page: "client/src/pages/admin/AvatarRigPreview.tsx",
    canvas: "client/src/components/production-house/r3f/AvatarRigCanvas.tsx",
    selectors: ["r7-rig-canvas", "r7-rig-webgl-fallback"],
  },
  {
    route: "/admin/virtual-set-preview",
    page: "client/src/pages/admin/VirtualSetPreview.tsx",
    canvas: "client/src/components/production-house/virtual-sets/VirtualSet.tsx",
    selectors: ["virtual-set-webgl-fallback"],
  },
];

const providerHostPattern =
  /api\.openai\.com|openai\.com|anthropic\.com|elevenlabs\.io|heygen\.com|runwayml\.com|meshy\.ai|stability\.ai|replicate\.com/i;

const runtimeEnabled = process.env.E2E_PRODUCTION_HOUSE_RUNTIME === "1";

function installProviderCallGuard(page: Page): { violations: string[] } {
  const violations: string[] = [];

  void page.route("**/*", (route) => {
    let hostname = "";
    try {
      hostname = new URL(route.request().url()).hostname;
    } catch {
      void route.continue();
      return;
    }

    if (providerHostPattern.test(hostname)) {
      violations.push(`${route.request().method()} ${route.request().url()}`);
      void route.abort();
      return;
    }

    void route.continue();
  });

  return { violations };
}

test.describe("MOUGLE-PR-D Production House dashboard wiring", () => {
  test("admin dashboard declares the Production House category and all expected units", () => {
    const dashboard = readRepoFile("client/src/pages/admin/AdminDashboard.tsx");

    expect(dashboard).toContain('id: "production-house"');
    expect(dashboard).toContain('title: "Production House"');
    expect(dashboard).toContain(
      "Production console, preview studio, render planning, voice/avatar jobs, AI worker pool, and build readiness.",
    );

    for (const unit of productionUnits) {
      expect(dashboard).toContain(`label: "${unit.label}"`);
      expect(dashboard).toContain(`href: "${unit.href}"`);
      expect(dashboard).toContain(`status: "${unit.status}"`);
    }
  });

  test("each Production House dashboard card points at a registered app route", () => {
    const app = readRepoFile("client/src/App.tsx");

    for (const unit of productionUnits) {
      expect(app).toContain(`path="${unit.href}"`);
      expect(app).toContain(`component={${unit.component}`);
    }
  });

  test("each target route component exposes its heading and safe operating text", () => {
    for (const unit of productionUnits) {
      const source = readRepoFile(unit.file);

      expect(source).toContain(unit.heading);
      for (const text of unit.safeText) {
        expect(source).toContain(text);
      }
    }
  });

  test("Production House target UI files do not hard-code live provider hosts", () => {
    const files = [
      ...productionUnits.map((unit) => unit.file),
      ...r3fSurfaces.flatMap((surface) => [surface.page, surface.canvas]),
    ];

    for (const file of files) {
      expect(readRepoFile(file), `${file} must not hard-code live provider hosts`).not.toMatch(providerHostPattern);
    }
  });

  test("R3F and 3D Production House surfaces are linked and expose canvas or headless fallback hooks", () => {
    const app = readRepoFile("client/src/App.tsx");
    const dashboard = readRepoFile("client/src/pages/admin/AdminDashboard.tsx");

    for (const surface of r3fSurfaces) {
      expect(app).toContain(`path="${surface.route}"`);
      expect(dashboard).toContain(`href: "${surface.route}"`);

      const pageSource = readRepoFile(surface.page);
      const canvasSource = readRepoFile(surface.canvas);

      expect(pageSource).toContain("fallback");
      expect(canvasSource).toContain("Canvas");
      expect(canvasSource).toContain("webgl");
      for (const selector of surface.selectors) {
        expect(`${pageSource}\n${canvasSource}`).toContain(selector);
      }
    }
  });
});

test.describe("MOUGLE-PR-D Production House runtime smoke", () => {
  test.skip(
    !runtimeEnabled,
    "Set E2E_PRODUCTION_HOUSE_RUNTIME=1 only against a local/staging admin session with safe DB/provider stubs.",
  );

  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("dashboard cards navigate without console errors or provider calls", async ({ page }) => {
    const { violations } = installProviderCallGuard(page);
    const consoleErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Mougle Command Center" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Production House" })).toBeVisible();

    for (const unit of productionUnits) {
      const card = page.getByTestId(`card-link-${unit.label.toLowerCase().replace(/\s+/g, "-")}`);
      await expect(card).toBeVisible();
      await expect(card.getByText(unit.label)).toBeVisible();

      await card.click();
      await expect(page).toHaveURL(new RegExp(`${unit.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?.*)?$`));
      await expect(page.getByText(unit.heading.replace("&amp;", "&"), { exact: false }).first()).toBeVisible();

      await page.goto("/admin");
    }

    expect(violations).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("3D production surfaces mount a canvas or deliberate WebGL fallback", async ({ page }) => {
    const { violations } = installProviderCallGuard(page);

    for (const surface of r3fSurfaces) {
      await page.goto(surface.route);
      await expect(
        page
          .locator(
            'canvas, [data-testid="r3f-sandbox-webgl-fallback"], [data-testid="r7-rig-webgl-fallback"], [data-testid="virtual-set-webgl-fallback"]',
          )
          .first(),
      ).toBeVisible();
    }

    expect(violations).toEqual([]);
  });
});
