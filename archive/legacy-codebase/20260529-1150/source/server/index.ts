import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { agentOrchestrator } from "./services/agent-orchestrator";
import { rateLimitMiddleware, suspiciousActivityDetector } from "./middleware/rate-limiter";
import { requestTrace } from "./middleware/request-trace";
import { storage } from "./storage";
import { csrfMiddleware } from "./middleware/csrf";
import { validateEnv, reportEnvValidation } from "./config/validate-env";
import { registerShutdown, bindShutdownSignals } from "./services/shutdown-registry";

// C-ENV-1 / H-ENV-2: refuse to boot in production when mandatory secrets or
// persistent storage are missing. Non-production runs only warn so local dev
// keeps working.
{
  const envResult = validateEnv();
  const { shouldExit } = reportEnvValidation(envResult);
  if (shouldExit) {
    process.exit(1);
  }
}

const app = express();
const httpServer = createServer(app);
const PgSession = connectPgSimple(session);
const { Pool } = pg;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[runtime] Missing required environment variable: ${name}`);
  }
  return value;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    isAdmin?: boolean;
    adminRole?: string;
    adminPermissions?: string[];
    adminActorId?: string;
    adminActorType?: "root_admin" | "staff";
    csrfToken?: string;
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const sessionSecret = requireEnv("SESSION_SECRET");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const host = req.hostname;
    if (host === "mougle.com") {
      return res.redirect(301, `https://www.mougle.com${req.originalUrl}`);
    }
    next();
  });
}

const dbUrl = process.env.DATABASE_URL?.trim();
let sessionStore: session.Store | undefined;

if (dbUrl) {
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 10_000,
  });
  sessionStore = new PgSession({ pool, tableName: "session", createTableIfMissing: true });
}

app.use(
  session({
    name: "mougle.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use(async (req, _res, next) => {
  const sessionUserId = req.session?.userId;
  if (!sessionUserId) return next();
  try {
    const user = await storage.getUser(sessionUserId);
    if (user) {
      (req as any).user = user;
    }
  } catch (err) {
    console.error("[Auth] Failed to load session user:", (err as Error).message);
  }
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const host = req.hostname;
  if (host === "mougle.com") {
    return res.redirect(301, `https://www.mougle.com${req.originalUrl}`);
  }
  if (host && host.includes("replit.app")) {
    res.set("X-Robots-Tag", "noindex, nofollow");
  }
  next();
});

app.use("/api", requestTrace);
app.use("/api", rateLimitMiddleware);
app.use("/api", suspiciousActivityDetector);
app.use("/api", csrfMiddleware);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      // Newsroom T2 — seed the global source registry from the deprecated
      // config/rssFeeds.json reference if the table is empty. Idempotent.
      try {
        const { seedRegistryFromLegacyJson } = await import("./services/news-source-registry");
        const inserted = await seedRegistryFromLegacyJson();
        if (inserted > 0) {
          log(`seeded news_sources registry with ${inserted} legacy RSS rows`);
        }
      } catch (err) {
        console.warn("[news-source-registry] startup seed skipped:", (err as Error).message);
      }
      // H-DEP-1: install SIGTERM/SIGINT handlers once after the HTTP server is
      // listening. Individual services register their own stoppers below as
      // they start, so a rolling deploy can drain intervals before exit.
      bindShutdownSignals();
      registerShutdown("http-server", () => new Promise<void>((res) => httpServer.close(() => res())));
      try {
        const { installAudienceAuditExportNotifier } = await import(
          "./services/audience-audit-export-notifier"
        );
        installAudienceAuditExportNotifier();
      } catch (err) {
        console.warn(
          "[audience-audit-export-notifier] install skipped:",
          (err as Error).message,
        );
      }
      try {
        const { installAudienceConnectorRotationNotifier } = await import(
          "./services/audience-connector-rotation-notifier"
        );
        installAudienceConnectorRotationNotifier();
      } catch (err) {
        console.warn(
          "[audience-connector-rotation-notifier] install skipped:",
          (err as Error).message,
        );
      }
      // Task #635: run the gateway-event connector backfill once on
      // deploy. The marker in `system_settings` makes it a no-op on
      // every subsequent boot; a previously errored run will retry on
      // the next deploy. Fire-and-forget so a slow backfill cannot
      // block the HTTP server from accepting traffic.
      (async () => {
        try {
          const { runGatewayEventConnectorBackfillOnceOnBoot } = await import(
            "./services/audience-gateway-event-connector-backfill-service"
          );
          const { ran, status } = await runGatewayEventConnectorBackfillOnceOnBoot();
          if (ran) {
            if (status.error) {
              console.warn(
                "[gateway-event-connector-backfill] deploy run failed:",
                status.error,
              );
            } else {
              log(
                `gateway-event connector backfill: attributed ${status.summary?.updated ?? 0} row(s), ${status.summary?.remainingNull ?? 0} remain unattributed`,
              );
            }
          }
        } catch (err) {
          console.warn(
            "[gateway-event-connector-backfill] boot run skipped:",
            (err as Error).message,
          );
        }
      })();
      try {
        const { installAudienceLegacyTokenDispatchAlert } = await import(
          "./services/audience-legacy-token-dispatch-alert-service"
        );
        installAudienceLegacyTokenDispatchAlert();
      } catch (err) {
        console.warn(
          "[audience-legacy-token-dispatch-alert] install skipped:",
          (err as Error).message,
        );
      }
      try {
        const { installOpenAiAudienceModerator } = await import(
          "./services/openai-audience-moderator"
        );
        const ratePerMinute = Number(
          process.env.AUDIENCE_AI_MODERATION_RATE_PER_MINUTE || "60",
        );
        const installed = installOpenAiAudienceModerator({
          ratePerMinute: Number.isFinite(ratePerMinute) ? ratePerMinute : 60,
        });
        if (installed) {
          log("installed OpenAI audience-safety second-opinion moderator");
        }
      } catch (err) {
        console.warn(
          "[openai-audience-moderator] install skipped:",
          (err as Error).message,
        );
      }
      if (process.env.WORKER_ENABLED === "true") {
        const { bootstrapAgents } = await import("./services/agent-bootstrap");
        await bootstrapAgents();
        agentOrchestrator.start();
        registerShutdown("agent-orchestrator", () => agentOrchestrator.stop());
        const { agentLearningService } = await import("./services/agent-learning-service");
        agentLearningService.startWorker();
        const { newsService } = await import("./services/newsService");
        newsService.startScheduler(30);
        registerShutdown("news-service", () => newsService.stopScheduler());
        const { audienceAuditEmailScheduler } = await import("./services/audience-audit-email-scheduler");
        audienceAuditEmailScheduler.startScheduler(15 * 60 * 1000);
        registerShutdown("audience-audit-email", () => audienceAuditEmailScheduler.stop());
        const { audienceAuditHistoryEmailScheduler } = await import(
          "./services/audience-audit-history-email-scheduler"
        );
        audienceAuditHistoryEmailScheduler.startScheduler(15 * 60 * 1000);
        registerShutdown("audience-audit-history-email", () =>
          audienceAuditHistoryEmailScheduler.stop(),
        );
        const { audienceAuditHistoryEmailStaleAlertService } = await import(
          "./services/audience-audit-history-email-stale-alert-service"
        );
        audienceAuditHistoryEmailStaleAlertService.startScheduler();
        registerShutdown("audience-audit-history-email-stale", () =>
          audienceAuditHistoryEmailStaleAlertService.stop(),
        );
        const { auditEmailFailureAlertSnoozeExpiryReminderService } =
          await import(
            "./services/audit-email-failure-alert-snooze-expiry-reminder-service"
          );
        auditEmailFailureAlertSnoozeExpiryReminderService.start();
        registerShutdown("audit-email-snooze-expiry-reminder", () =>
          auditEmailFailureAlertSnoozeExpiryReminderService.stop(),
        );
        const { newsSourceHealthService } = await import("./services/news-source-health");
        newsSourceHealthService.startScheduler(24);
        registerShutdown("news-source-health", () => newsSourceHealthService.stopScheduler());
        const {
          startBroadcastSweepScheduler,
          stopBroadcastSweepScheduler,
        } = await import("./services/broadcast-sweep-scheduler");
        startBroadcastSweepScheduler();
        registerShutdown("broadcast-sweep", () => stopBroadcastSweepScheduler());
        const { newsPipelineService } = await import("./services/news-pipeline-service");
        registerShutdown("news-pipeline", () => newsPipelineService.stopAutoPipeline());
        const {
          startAudienceRetentionScheduler,
          stopAudienceRetentionScheduler,
        } = await import("./services/audience-retention-service");
        startAudienceRetentionScheduler();
        registerShutdown("audience-retention", () => stopAudienceRetentionScheduler());
        const { panicButtonService } = await import("./services/panic-button-service");
        registerShutdown("panic-button", () => panicButtonService.stop());
        const { coverOrphanAlertService } = await import("./services/cover-orphan-alert-service");
        coverOrphanAlertService.start(24 * 60 * 60 * 1000);
        registerShutdown("cover-orphan-alert", () => coverOrphanAlertService.stop());
        const { liveBroadcastAlertService } = await import("./services/live-broadcast-alert-service");
        liveBroadcastAlertService.start(5 * 60 * 1000);
        registerShutdown("live-broadcast-alert", () => liveBroadcastAlertService.stop());
        const { mediaOrphanAlertService } = await import("./services/media-orphan-alert-service");
        mediaOrphanAlertService.start(24 * 60 * 60 * 1000);
        registerShutdown("media-orphan-alert", () => mediaOrphanAlertService.stop());
        // Task #785 — daily scan for orphaned archived 3D-asset rows so
        // silent orphans (manual storage edits, crash mid-delete, botched
        // migrations) get caught without waiting for an admin to open the
        // reconcile panel.
        const { productionAssetOrphanAlertService } = await import(
          "./services/production-asset-orphan-alert-service"
        );
        productionAssetOrphanAlertService.start(24 * 60 * 60 * 1000);
        registerShutdown("production-asset-orphan-alert", () =>
          productionAssetOrphanAlertService.stop(),
        );
        // Task #897 — daily auto-cleanup of R7B-E2E test-seeded
        // approved-internal asset/rig rows so the admin library stays
        // tidy without operator action.
        const {
          startCleanupR7bE2eScheduler,
          stopCleanupR7bE2eScheduler,
        } = await import("./services/cleanup-r7b-e2e-seeds-scheduler");
        startCleanupR7bE2eScheduler();
        registerShutdown("cleanup-r7b-e2e-seeds", () =>
          stopCleanupR7bE2eScheduler(),
        );
        const { gatewayBlockAlertService } = await import("./services/gateway-block-alert-service");
        gatewayBlockAlertService.start();
        registerShutdown("gateway-block-alert", () => gatewayBlockAlertService.stop());
        // Warm the fallback-preset audit retention cache so the synchronous
        // rotation path picks up DB-persisted values before the first
        // appended audit line.
        const { fallbackPresetAuditSettingsService } = await import(
          "./services/fallback-preset-audit-settings-service"
        );
        fallbackPresetAuditSettingsService.ensureAuditCacheLoaded().catch(() => {
          /* non-fatal: sync getter falls back to env/default */
        });
        const { socialPublisherService } = await import("./services/social-publisher-service");
        socialPublisherService.startAutoPublisher(5);
        const { promotionSelectorAgent } = await import("./services/promotion-selector-agent");
        promotionSelectorAgent.startWorker(10);
        const { growthBrainService } = await import("./services/growth-brain-service");
        growthBrainService.startWorker(30);
        const { founderControlService } = await import("./services/founder-control-service");
        await founderControlService.initialize();
        const { activityMonitorService } = await import("./services/activity-monitor-service");
        activityMonitorService.start(5 * 60 * 1000);
        const { anomalyDetectorService } = await import("./services/anomaly-detector-service");
        anomalyDetectorService.start(5 * 60 * 1000);
        const { escalationService } = await import("./services/escalation-service");
        await escalationService.getPolicy();
        const { truthEvolutionService } = await import("./services/truth-evolution-service");
        truthEvolutionService.startDecayScheduler();
        const { labsFlywheelService } = await import("./services/labs-flywheel-service");
        labsFlywheelService.startDailyGeneration();
        const { startAbandonedThumbnailSweeper, stopAbandonedThumbnailSweeper } = await import("./services/shorts-cutter-service");
        startAbandonedThumbnailSweeper();
        registerShutdown("shorts-abandoned-thumb-sweeper", () => stopAbandonedThumbnailSweeper());
        if (process.env.ENABLE_AUTO_DEBATE_RUNNER === "true") {
          const { breakingNewsAgent } = await import("./services/breaking-news-agent");
          breakingNewsAgent.autoRunScheduledDebates().then(count => {
            if (count > 0) console.log(`[Startup] Auto-ran ${count} scheduled debates`);
          }).catch(err => console.log("[Startup] Auto-run debates failed:", err.message));
        }
      }
    },
  );
})();
