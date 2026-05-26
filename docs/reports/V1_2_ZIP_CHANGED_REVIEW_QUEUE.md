# V1.2 ZIP Changed-Content Review Queue

Date: 2026-05-26
Branch: cleanup/v1-2-stabilization

## Purpose
These files exist in V1.2 and in uploaded zip archives, but with different content.
They were not auto-overwritten to avoid undoing cleanup and stabilization work.

## Changed existing files (not auto-overwritten)
- .replit
- client/public/opengraph.jpg
- client/src/App.tsx
- client/src/components/layout/DocsLayout.tsx
- client/src/components/layout/Layout.tsx
- client/src/lib/api.ts
- client/src/lib/queryClient.ts
- client/src/pages/Home.tsx
- client/src/pages/PostDetail.tsx
- client/src/pages/admin/AdminDashboard.tsx
- client/src/pages/admin/FounderControl.tsx
- client/src/pages/admin/FounderDebugConsole.tsx
- client/src/pages/admin/FounderWorkday.tsx
- client/src/pages/admin/PreviewStudioHero.tsx
- client/src/pages/admin/ProductionHouse.tsx
- client/src/pages/admin/StaffManagement.tsx
- client/src/pages/admin/VideoRender.tsx
- docs/replit-runtime-setup.md
- drizzle.config.ts
- package-lock.json
- package.json
- playwright.config.ts
- replit.md
- replit.nix
- scripts/e2e/phase1b-verified-newsroom-flow.mjs
- server/db.ts
- server/index.ts
- server/middleware/admin-auth.ts
- server/routes.ts
- server/routes/preview-studio-routes.ts
- server/routes/production-house-routes.ts
- server/services/admin-access-request-service.ts
- server/services/avatar-video-render-service.ts
- server/services/discussion-service.ts
- server/services/email-service.ts
- server/services/news-pipeline-service.ts
- server/services/newsService.ts
- server/services/newsroom/continuousNewsroomScheduler.ts
- server/services/panic-button-service.ts
- server/services/persistent-storage-service.ts
- server/services/preview-studio-service.ts
- server/services/production-house-service.ts
- server/services/production-house-storage.ts
- server/services/render-srt-service.ts
- server/services/replit-object-storage-adapter.ts
- server/static.ts
- server/storage.ts
- server/vite.ts
- shared/newsroom-schema.ts
- shared/newsroom-types.ts
- shared/production-house.ts
- shared/schema.ts
- tests/preview-studio.test.ts
- tests/production-house.test.ts
- tsconfig.json

## Risk-skipped paths
- client/src/pages/admin/SilentSeoDashboard.tsx
- server/seo/schemaTemplates.ts
- server/services/seo-service.ts
- server/services/silent-seo-service.ts
