import type { Express, RequestHandler } from "express";
import { registerNewsroomPreviewRoutes } from "./newsroom-preview-routes";
import { registerNeuralNewsroomRoutes } from "./neural-newsroom-routes";
import { registerOmniChannelAudienceRoutes } from "./omni-channel-audience-routes";
import { registerFounderPtoModeRoutes } from "./founder-pto-mode-routes";
import { registerBroadcastBriefRoutes } from "./broadcast-briefs";
import { registerNewsroomPackageRoutes } from "./newsroom-packages";
import { registerCinemaControlRoutes } from "./cinema-control-routes";
import { registerAutopilotNewsroomRoutes } from "./autopilot-newsroom-routes";
import { registerProductionHouseRoutes } from "./production-house-routes";
import { registerPreviewStudioRoutes } from "./preview-studio-routes";
import { registerBroadcastRoutes } from "./broadcasts";
import { registerBRollRoutes } from "./broll";
import { registerShortsRoutes } from "./shorts";
import { registerCostRoutes } from "./cost";
import { registerAnchorRoutes } from "./anchor";
import { registerPlayoutQueueRoutes } from "./playout";
import { registerSafetyReportRoutes } from "./safety-report";
import { registerNewsSourceRoutes } from "./news-sources";
import { registerProductionAssetRoutes } from "./admin/production-assets";
import { registerProductionRigRoutes } from "./admin/production-rigs";
import { registerPermanentAvatarRoutes } from "./admin/permanent-avatars";

export function registerModularRouteGroups(app: Express, requireRootAdmin: RequestHandler): void {
  // Phase 1B Verified Newsroom — admin dry-run preview routes (no DB writes).
  registerNewsroomPreviewRoutes(app, requireRootAdmin);
  registerBroadcastBriefRoutes(app, requireRootAdmin);
  registerNeuralNewsroomRoutes(app, requireRootAdmin);
  registerOmniChannelAudienceRoutes(app, requireRootAdmin);
  registerFounderPtoModeRoutes(app, requireRootAdmin);
  registerNewsroomPackageRoutes(app, requireRootAdmin);

  // Mougle 4D Cinema Control MVP — admin preview-only routes.
  registerCinemaControlRoutes(app, requireRootAdmin);
  registerAutopilotNewsroomRoutes(app, requireRootAdmin);
  registerProductionHouseRoutes(app, requireRootAdmin);
  registerPreviewStudioRoutes(app, requireRootAdmin);
  registerBroadcastRoutes(app, requireRootAdmin);
  registerBRollRoutes(app, requireRootAdmin);
  registerShortsRoutes(app, requireRootAdmin);
  registerCostRoutes(app, requireRootAdmin);
  registerAnchorRoutes(app, requireRootAdmin);

  // Newsroom playout + safety + source registry.
  registerPlayoutQueueRoutes(app, requireRootAdmin);
  registerSafetyReportRoutes(app, requireRootAdmin);
  registerNewsSourceRoutes(app, requireRootAdmin);

  // Admin 3D asset/rig/avatar route groups.
  registerProductionAssetRoutes(app, requireRootAdmin);
  registerProductionRigRoutes(app, requireRootAdmin);
  registerPermanentAvatarRoutes(app, requireRootAdmin);
}
