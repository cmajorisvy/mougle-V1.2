# Codex Phase 1A Render Pipeline Audit

Audit date: 2026-05-15

Scope: render/newsroom pipeline audit only. This pass reviewed the existing Scene Builder, Preview Studio, FFmpeg, Remotion, RenderPlan/RenderManifest, media package, storage, TTS, caption, history, cancellation, API, and safety-gate code.

Constraints honored:

- `db:push` was not run.
- No schema files were changed.
- No YouTube, social, live, or autonomous publishing action was connected or triggered.
- No provider call was made.
- No secrets were exposed.
- No source code was modified for this task; only this report was updated.

## 1. Files, Services, Components Found

### Admin UI and Scene Builder

- `client/src/pages/admin/scene-builder/SceneBuilderAdvanced.tsx`
  - Main Scene Builder surface.
  - Creates/updates `scene` packages through the admin media package API.
  - Can bind public news metadata into scene fields.
  - Autosaves scene data back into file-backed packages.

- `client/src/pages/admin/scene-builder/NewsroomComposer.tsx`
  - Browser-only newsroom preview.
  - Renders newsroom background, monitor frames, anchor placeholder/safe center area, lower-third, ticker, brand strip, debate layout, and inferred panel modules.

- `client/src/pages/admin/scene-builder/sceneIntelligence.ts`
  - Client-side inference helper.
  - Infers story type, urgency, lower-third type, ticker copy, monitor layout, panel modules, location/map mode, source verification mode, and simple timeline segments.

- `client/src/pages/admin/PreviewStudio.tsx`
  - Admin Preview Studio route.
  - Lists scene packages, displays HTML preview, generates TTS preview audio, creates mock lip-sync packages, generates RenderPlan/RenderManifest, triggers FFmpeg or Remotion internal MP4 preview jobs, polls status, cancels jobs, displays storage status, and manages render history/retention.

- `client/src/pages/admin/ScenePreview.tsx`
  - Additional admin scene preview surface.

### Media Package Model

- `server/services/media-package-service.ts`
  - File-backed package store under `.local/media-packages/<type>/`.
  - Supported package types: `scene`, `image`, `video`, `voice`, `lipsync`, `bodymotion`, `preview`, `youtube`.
  - Uses strict package ID validation.
  - Uses atomic writes for package JSON.
  - Adds default safety flags: manual trigger only, no public publishing, no YouTube upload, no social posting, no live stream, no autonomous execution, dry-run.
  - Strips unsafe upload/publishing fields from updates.

### Render Planning and Manifest

- `server/services/render-plan-service.ts`
  - Builds a `RenderPlan` from a scene package.
  - Defines canvas format, layers, audio tracks, caption tracks, lower-third track, monitor panel track, timeline, missing assets, render readiness, renderer candidates, and storage candidates.

- `server/services/render-manifest-service.ts`
  - Builds canonical `RenderManifest` from a scene package plus `RenderPlan`.
  - Adds safe zones, event media rights gates, monitor panel zones, caption exclusion zones, storage refs, and publish-blocking safety flags.

- `shared/models/render-manifest.ts`
  - Zod schema and TypeScript types for `render_manifest.v1`.
  - Includes canvas, fps, duration, scenes, segments, layers, tracks, safe zones, storage refs, safety flags, event media modes, and rights gates.

### Renderers

- `server/services/ffmpeg-render-service.ts`
  - Internal FFmpeg MP4 renderer.
  - Generates H.264/AAC MP4 plus optional sidecar SRT.
  - Supports background image/color fallback, voice audio or silent fallback, lower-third, ticker strip, source strip, confidence badge, monitor panels, character ribbon, preview-only watermark, render history, cancellation, readiness checks, queue limits, watchdog timeout, and persistent storage upload attempt.

- `server/services/remotion-render-service.ts`
  - Internal Remotion MP4 renderer.
  - Uses `@remotion/bundler` and `@remotion/renderer` when available.
  - Bundles `media-renderer/index.ts`.
  - Supports render jobs, warm/prewarm status, cancellation, watchdog timeout, sidecar SRT, history, queue state, and persistent storage upload attempt.

- `media-renderer/Root.tsx`
  - Registers Remotion compositions:
    - `MougleNewsroom-16-9`
    - `MougleNewsroom-9-16`
    - `MougleNewsroom-1-1`

- `media-renderer/MougleNewsroomComposition.tsx`
  - Remotion composition.
  - Renders background, headline, confidence badge, character ribbon, monitor panels, subheadline, source strip, lower-third, animated ticker, watermark, and optional audio.

### Storage, History, Cancellation, Retention

- `server/services/persistent-storage-service.ts`
  - Reports storage status without returning secret values.
  - Creates local media directories under `.local/media-assets`.
  - Provides admin-only metadata shape for generated MP4/SRT/voice files.
  - Preserves `previewAccessMode: "admin_only_stream"`.
  - Uses stable storage keys for render and voice files.
  - Attempts Replit Object Storage only when installed/configured.
  - Falls back to local-only storage.

- `server/services/replit-object-storage-adapter.ts`
  - Sanitizes object-storage keys.
  - Upload/download adapter for Replit Object Storage.
  - Never exposes bucket secret values through API.

- `server/services/render-history-service.ts`
  - Disk-backed render history and cancellation tracking.
  - Stores history under `.local/media-assets/render-history.json`.
  - Stores cancellation entries under `.local/media-assets/render-cancellations.json`.
  - Supports list, delete, delete older than, orphan listing, orphan reclaim, disk usage, and cancellation listing/deletion.

- `server/services/render-retention-service.ts`
  - Optional retention state under `.local/state/render-retention.json`.
  - Supports manual and scheduled cleanup controls.

### Voice/TTS and Captions

- `server/services/openai-tts-service.ts`
  - Admin-only preview TTS flow.
  - Uses `OPENAI_API_KEY` only when configured.
  - Writes MP3 files under `.local/media-assets/voice/`.
  - Returns admin-only `audioRef` and admin-only storage metadata.
  - Does not return provider secret values.

- `server/services/podcast-voice-service.ts`
  - Separate podcast voice/audio path.
  - Not the direct Preview Studio TTS path.

### Related Publishing Gates

- `server/services/publishing-gates.ts`
  - Central external publishing gate for YouTube, social, and live stream capabilities.

- `server/services/youtube-publishing-service.ts`
  - Separate root-admin YouTube publishing package flow.
  - Not part of the internal render preview path.

- `server/services/social-publisher-service.ts`
- `server/services/social-distribution-service.ts`
  - Separate social flows protected by external publishing gates.
  - Not part of the internal render preview path.

## 2. Actual Current Render Flow

1. Admin opens Scene Builder or Preview Studio.
2. Admin creates/selects a `scene` media package.
3. Scene data is stored as JSON under `.local/media-packages/scene/`.
4. Scene Builder may enrich the scene with public news metadata and client-side inferred layout data.
5. Preview Studio loads scene packages through admin-only package APIs.
6. Preview Studio displays HTML preview through `NewsroomComposer`.
7. Optional: admin generates preview voice through `/api/admin/media-tts/generate`.
8. TTS writes MP3 under `.local/media-assets/voice/` and can create a `voice` package.
9. Admin generates plan/manifest through `/api/admin/media-render-plans/generate`.
10. The server builds:
    - `RenderPlan` via `renderPlanService`
    - `RenderManifest` via `renderManifestService`
11. Admin triggers internal MP4 preview through either:
    - `/api/admin/media-render/ffmpeg/generate`
    - `/api/admin/media-render/remotion/generate`
12. Renderer starts an in-memory background job and returns `202`.
13. Preview Studio polls renderer status endpoint.
14. Renderer loads scene package and optional voice package.
15. Renderer builds the canonical manifest bundle again for the selected format.
16. Renderer outputs MP4 under `.local/media-assets/render/<renderJobId>.mp4`.
17. Renderer writes SRT under `.local/media-assets/render/<renderJobId>.srt` when text is available.
18. Renderer attempts persistent storage upload if Replit Object Storage is configured.
19. If upload is unavailable or fails, output remains locally admin-streamable.
20. Renderer records history.
21. MP4/SRT are served only through `/api/admin/media-assets/render/:file`.
22. Jobs can be cancelled through renderer-specific `DELETE` endpoints.

No public publishing, YouTube upload, social posting, live stream, or autonomous publishing occurs in this flow.

## 3. Scene JSON Shape

Scene packages use a generic media package wrapper:

```json
{
  "id": "scene_<timestamp>_<random>",
  "type": "scene",
  "status": "draft_only",
  "manualApprovalRequired": true,
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "createdBy": "admin actor or null",
  "data": {
    "sourceItemId": "optional news/source id",
    "scriptPackageId": "optional script package id",
    "sceneTemplateId": "opening_anchor_shot",
    "stylePresetId": "mougle_brick_newsroom_v1",
    "characterId": "mougle_brickston",
    "targetFormat": "news_clip",
    "backgroundAssetId": "mougle_newsroom_master",
    "shotType": "wide",
    "sceneNumber": 1,
    "sceneTitle": "Story headline",
    "lowerThirdText": "Lower-third headline",
    "lowerThirdSubline": "Optional lower-third subline",
    "subheadline": "Supporting line",
    "onScreenText": "Large headline text",
    "voiceoverSegment": "Narration copy",
    "sourceReferences": "Source names or notes",
    "estimatedDuration": 30,
    "visualDescription": "Description for the preview",
    "tickerHint": "Ticker text",
    "tickerItems": ["Ticker item 1", "Ticker item 2"],
    "confidenceLabel": "internal | developing | verified | correction",
    "countryTags": "optional",
    "regionTags": "optional",
    "voicePackage": {
      "audioRef": "/api/admin/media-assets/voice/<file>.mp3"
    },
    "eventMedia": [],
    "newsroomDataPackage": {},
    "inferred": {
      "storyType": "general_news",
      "urgencyLevel": "low",
      "locationName": null,
      "countryCode": null,
      "monitorLayout": "anchor_with_right_panel",
      "panelPreset": "anchor_story",
      "confidenceLabel": "internal",
      "tickerText": "Internal preview only",
      "timeline": []
    }
  },
  "safety": {
    "manualTriggerOnly": true,
    "publicPublishing": false,
    "youtubeUpload": false,
    "socialPosting": false,
    "liveStream": false,
    "autonomousExecution": false,
    "dryRun": true
  }
}
```

Notes:

- There is no database schema dependency for scene packages.
- Package status values are restricted to internal preview states.
- Unsafe upload/publication fields are stripped from package writes.

## 4. FFmpeg Entrypoints

### API

- `POST /api/admin/media-render/ffmpeg/generate`
  - Admin media-write route.
  - CSRF-protected by the global write-route policy.
  - Requires persistent render storage if the deployment gate is configured that way.
  - Checks FFmpeg readiness and queue capacity.
  - Enqueues a background job.

- `GET /api/admin/media-render/ffmpeg/:jobId/status`
  - Admin-only.
  - Returns job status, progress, phase, ETA, result/error, timestamps, and safety flags.

- `DELETE /api/admin/media-render/ffmpeg/:jobId`
  - Admin media-write route.
  - CSRF-protected by the global write-route policy.
  - Cancels in-flight job and records cancellation.

### Service

- `ffmpegRenderService.generateInternalPreview`
- `ffmpegRenderService.startRenderJob`
- `ffmpegRenderService.getJobStatus`
- `ffmpegRenderService.cancelJob`
- `ffmpegRenderService.getReadiness`
- `ffmpegRenderService.getQueueState`
- `ffmpegRenderService.resolveSafePath`
- `ffmpegRenderService.contentTypeFor`
- `ffmpegRenderService.fileSize`
- `ffmpegRenderService.openStream`

### Behavior

- Outputs MP4 using H.264/AAC settings.
- Supports `16x9`, `9x16`, and `1x1`.
- Uses background still image when available, otherwise a safe color fallback.
- Uses voice MP3 when provided, otherwise silent audio fallback.
- Generates sidecar SRT from narration/headline text.
- Uses canonical RenderManifest data for monitor panels, lower-third, ticker, and storage metadata.
- Records render history.
- Supports cancellation and watchdog timeout.

## 5. Remotion Entrypoints And Status

### API

- `POST /api/admin/media-render/remotion/generate`
  - Admin media-write route.
  - CSRF-protected by the global write-route policy.
  - Enqueues Remotion background job.

- `GET /api/admin/media-render/remotion/:jobId/status`
  - Admin-only.
  - Returns job status, progress, phase, result/error, timestamps, and safety flags.

- `DELETE /api/admin/media-render/remotion/:jobId`
  - Admin media-write route.
  - Cancels in-flight Remotion job.

- `GET /api/admin/media-render/remotion/warm-status`
  - Admin-only.
  - Reports warm/cold/warming/failed state and bundle/browser status.

- `POST /api/admin/media-render/remotion/prewarm`
  - Admin media-write route.
  - Starts warm-up.

### Status

- Remotion service is implemented.
- Remotion package imports are optional runtime imports.
- Runtime success depends on the installed Remotion packages, Chromium/browser dependencies, license/runtime constraints, and Replit resource limits.
- Remotion is not the default renderer; FFmpeg remains the safer baseline renderer.

## 6. RenderPlan And RenderManifest Status

Current state:

- `RenderPlan` exists and is used.
- `RenderManifest` exists and is now canonical for shared FFmpeg/Remotion consumption.
- `/api/admin/media-render-plans/generate` returns both `plan` and `manifest`.
- FFmpeg and Remotion both rebuild/consume the RenderManifest bundle internally.

`RenderManifest` includes:

- canvas
- fps
- duration
- scenes
- segments
- layers
- anchor track
- voice/audio track
- caption track
- lower-third track
- ticker track
- monitor panel tracks
- event media tracks
- transition cues
- music/SFX placeholders
- safe zones
- storage refs
- safety flags

Event media modes:

- `fullscreen`
- `background_screen`
- `picture_in_picture`
- `disabled`

Rights gates:

- `approved_for_use`
- `internal_reference_only`
- `needs_review`
- `rejected`
- `unknown`

## 7. Preview Studio Route/Component Status

Preview Studio exists at:

- `/admin/preview-studio`

Current capabilities:

- Scene picker.
- Format selection: `16x9`, `9x16`, `1x1`.
- HTML newsroom preview.
- OpenAI preview voice generation.
- Mock lip-sync package generation.
- RenderPlan/RenderManifest generation.
- Renderer selection for FFmpeg and Remotion.
- Internal MP4 preview generation.
- Progress and phase display.
- Cancel button.
- MP4/SRT output display.
- Renderer used display.
- Storage status display.
- Safety flag display.
- Render readiness display.
- Render history list.
- Reopen previous render result.
- Delete history entry.
- Clear history by scene/global scope.
- Delete older than selected age/date.
- Orphan render file review/reclaim.
- Retention settings and manual run-now sweep.
- Remotion warm-up status card.

Preview Studio does not expose a public publishing action in this internal render path.

## 8. Storage Paths And Persistence Status

### Local Paths

- Media packages:
  - `.local/media-packages/<type>/<id>.json`

- Voice MP3:
  - `.local/media-assets/voice/<voiceId>.mp3`

- Render output:
  - `.local/media-assets/render/<renderJobId>.mp4`
  - `.local/media-assets/render/<renderJobId>.srt`

- Render history:
  - `.local/media-assets/render-history.json`

- Render cancellations:
  - `.local/media-assets/render-cancellations.json`

- Render retention state:
  - `.local/state/render-retention.json`

- Remotion warm-up state:
  - `.local/remotion-warmup-state.json`

### Persistent Storage

- Replit Object Storage adapter exists.
- Upload is attempted only when adapter and bucket/sidecar are configured.
- Object storage keys are sanitized.
- Stable storage key families:
  - `mougle-media/render/<file>.mp4`
  - `mougle-media/render/<file>.srt`
  - `mougle-media/voice/<file>.mp3`

### Admin-Only Metadata Shape

Generated media metadata keeps:

- `storageKey`
- `persistedStorageKey`
- `mimeType`
- `size`
- `fileSize`
- `createdAt`
- `accessMode: "admin_only_stream"`
- `previewAccessMode: "admin_only_stream"`
- `adminOnly: true`
- `publicUrl: null`
- `publicUrlAvailable: false`
- `storageDriver`
- `persisted`
- `localFallback`

### Stream Routes

- Voice:
  - `GET /api/admin/media-assets/voice/:file`

- Render MP4/SRT:
  - `GET /api/admin/media-assets/render/:file`

Both are admin-only. The render stream route tries object storage first, then local fallback. No public URL is returned.

## 9. Voice/TTS Package Flow

Current path:

1. Preview Studio calls `/api/admin/media-tts/generate`.
2. Route checks admin media-write permission and OpenAI key presence.
3. `openaiTtsService.generatePreview` creates an MP3 if configured.
4. MP3 is written under `.local/media-assets/voice/`.
5. Response returns `audioRef`, filename, rough duration estimate, voice used, size, and admin-only storage metadata.
6. Optional `voice` media package can be saved.
7. FFmpeg/Remotion can receive `voicePackageId` and use audio.

Notes:

- Provider calls are manual/admin-only.
- Provider error details are sanitized.
- Secret values are not returned.
- If no voice package exists, renderers can use silent fallback for internal preview.

## 10. Caption/SRT Generation

Current state:

- FFmpeg and Remotion both generate sidecar SRT files.
- SRT text comes from narration/subheadline/headline data.
- Timing is heuristic: text chunks are distributed across the render duration.
- Captions are not burned into the video.
- Preview Studio shows SRT links where present.
- Caption safe-zone data exists in RenderManifest (`captionZone`, `captionExclusionZoneRefs`) but final MP4 captions are sidecar, not visual overlays.

## 11. Lower-Third, Ticker, Panel Logic

### Lower-Third

Current lower-third modes include:

- breaking news
- verified sources
- debate
- market
- location
- tech/science
- correction
- general news

Browser preview:

- Rich lower-third UI with typed styling.
- Debate lower-third can show claim/counter layout.
- Lower-third is tied to inferred story type and form fields.

FFmpeg:

- Draws palette-based lower-third, label tab, source strip, confidence badge, and watermark.
- Lower-third text is length-limited and sanitized.

Remotion:

- Draws palette-based lower-third and label tab.
- Uses fixed layout math based on composition dimensions.

### Ticker

- Browser preview uses CSS animation.
- RenderPlan marks ticker animation as `ticker_crawl`.
- RenderManifest tracks ticker items and behavior.
- FFmpeg currently renders a static ticker strip.
- Remotion renders an animated ticker offset.

### Panels

- Browser composer supports richer monitor layouts.
- RenderPlan creates monitor/map/data panel layers for non-short layouts.
- RenderManifest assigns monitor panel zones.
- FFmpeg renders up to 3 compact panels.
- Remotion renders up to 3 compact panels.

## 12. Safe-Zone And Text-Overflow Behavior

Existing protections:

- RenderManifest defines:
  - `anchorSafeZone`
  - `lowerThirdZone`
  - `tickerZone`
  - `monitorPanelZones`
  - `captionZone`
  - caption exclusion refs for lower-third/ticker

- Renderers use safe margins based on output width.
- Scene fields are sanitized and length-limited before drawing.
- Browser preview uses fixed frames, overflow-hidden containers, truncation, and line clamps in several areas.
- Remotion uses dimension-derived font sizes and fixed boxes.
- FFmpeg uses fixed coordinate/drawbox/drawtext overlays.

Remaining gaps:

- No shared text measurement/wrapping engine across HTML, FFmpeg, and Remotion.
- FFmpeg `drawtext` does not robustly wrap long words.
- Remotion can still visually overflow with extreme input strings.
- Browser preview is not pixel-identical to encoded MP4 output.
- No automated frame-level safe-zone/pixel overlap verification currently runs as part of this audit.

## 13. API Routes Used By Rendering

Read/admin data routes:

- `GET /api/admin/media-pipeline/overview`
- `GET /api/admin/media-plugins`
- `GET /api/admin/media-characters`
- `GET /api/admin/media-visual-assets`
- `GET /api/admin/media-style-presets`
- `GET /api/admin/media-scene-templates`
- `GET /api/admin/media-packages/:type`
- `GET /api/admin/media-packages/:type/:id`
- `GET /api/admin/media-storage/status`
- `GET /api/admin/media-go-live/readiness`

Write/admin package and planning routes:

- `POST /api/admin/media-packages/:type`
- `PATCH /api/admin/media-packages/:type/:id`
- `DELETE /api/admin/media-packages/:type/:id`
- `POST /api/admin/media-tts/generate`
- `POST /api/admin/media-render-plans/generate`

Renderer routes:

- `POST /api/admin/media-render/ffmpeg/generate`
- `GET /api/admin/media-render/ffmpeg/:jobId/status`
- `DELETE /api/admin/media-render/ffmpeg/:jobId`
- `POST /api/admin/media-render/remotion/generate`
- `GET /api/admin/media-render/remotion/:jobId/status`
- `DELETE /api/admin/media-render/remotion/:jobId`
- `GET /api/admin/media-render/remotion/warm-status`
- `POST /api/admin/media-render/remotion/prewarm`

Asset routes:

- `GET /api/admin/media-assets/voice/:file`
- `GET /api/admin/media-assets/render/:file`

History/cancellation/retention routes:

- `GET /api/admin/media-render/history`
- `DELETE /api/admin/media-render/history`
- `DELETE /api/admin/media-render/history/:renderJobId`
- `GET /api/admin/media-render/history/orphans`
- `POST /api/admin/media-render/history/orphans/reclaim`
- `GET /api/admin/media-render/history/older-than-count`
- `DELETE /api/admin/media-render/history/older-than`
- `GET /api/admin/media-render/cancellations`
- `DELETE /api/admin/media-render/cancellations/:renderJobId`
- `DELETE /api/admin/media-render/cancellations`
- `GET /api/admin/media-render/retention`
- `PATCH /api/admin/media-render/retention`
- `POST /api/admin/media-render/retention/run-now`

Related but separate publishing routes:

- `/api/admin/youtube-publishing/*`
- social distribution/publisher routes

These are not part of the internal preview render flow.

## 14. Safety Gates

Current protections found:

- All media render/package routes are under `/api/admin`.
- Read routes use `requireAdmin` or stricter.
- Write routes use `requireMediaWrite` or stricter.
- Mutating `/api` routes are protected by the app's CSRF middleware.
- Render asset routes are admin-only.
- Asset filenames are regex-whitelisted.
- Package IDs are strictly validated.
- Package writes strip unsafe upload/publish fields.
- Media package safety flags default to no public publishing, no YouTube upload, no social posting, no live stream, no autonomous execution.
- Render plan/manifest safety flags are literal false for public/external publishing.
- Preview and render responses include no-publish safety flags.
- Persistent storage status reports only boolean configuration, never bucket secret value.
- TTS route checks key presence but does not expose key value.
- YouTube/social/live capabilities are behind external publishing gates in separate services.

Important nuance:

- `media-go-live/readiness` reports the current external publishing gate status, but internal render routes themselves still return fixed `youtubeUpload: false`, `socialPosting: false`, `liveStream: false`, and `autonomousExecution: false`.
- Render retention can be scheduled if enabled, but it cleans local render artifacts; it is not public publishing.

## 15. What Already Exists From Natalie Phase 1A

Already present:

- Scene package model.
- Scene Builder.
- Browser Preview Studio.
- FFmpeg internal preview renderer.
- Remotion internal preview renderer.
- RenderPlan service.
- Canonical RenderManifest service and schema.
- Layered render concepts:
  - background
  - anchor/placeholder
  - monitor/data/map panels
  - lower-third
  - ticker
  - source attribution
  - confidence badge
  - watermark
  - captions sidecar
- Safe-zone model in RenderManifest.
- Preview-only watermark.
- Admin-only MP4/SRT stream route.
- TTS preview flow.
- Sidecar SRT generation.
- Render history.
- Render cancellation.
- Render retention/orphan tools.
- Local storage plus optional Replit Object Storage fallback.
- Safety gates blocking public publishing, YouTube, social, live, and autonomous execution in this path.

## 16. What Is Missing

Key gaps:

- No real presenter/anchor image or avatar compositing in FFmpeg/Remotion.
- Browser preview, FFmpeg output, and Remotion output are not pixel-identical.
- FFmpeg ticker is still static.
- Captions are heuristic sidecar SRT, not audio-aligned.
- No burned-in captions option in current render output.
- No real lip-sync provider integration in this Preview Studio path.
- No real body-motion/avatar provider integration in this Preview Studio path.
- No robust text measurement/wrapping engine.
- No automated visual safe-zone/pixel-overlap test for final MP4 frames.
- No durable render queue across server restarts; active jobs are in memory.
- No full production object-storage requirement unless deployment gates are configured.
- No full event-media/B-roll rendering in FFmpeg/Remotion beyond contract and placeholders.
- No rights approval workflow tied directly to event media usage in Preview Studio.
- No manual approval block that universally prevents internal preview rendering for scenes not `approved_for_preview`; readiness can report `needs_approval`, but internal preview generation is still possible.
- No guaranteed Remotion readiness in every environment; Chromium/runtime/package setup can still block it.

## 17. Recommended Implementation Order

1. Keep Phase 1A limited to internal preview stability and render quality.
2. Make Preview Studio text and status labels fully match current behavior:
   - plan-only action
   - FFmpeg render action
   - Remotion render action
   - storage state
   - approval/readiness state
3. Align shared layout constants across:
   - `NewsroomComposer`
   - FFmpeg overlay builder
   - Remotion composition
   - RenderManifest safe zones
4. Add text fitting and wrapping helpers for headlines, lower-thirds, tickers, and panels.
5. Make FFmpeg ticker animate or explicitly label it static in report/UI.
6. Add optional visual/frame verification for generated MP4 outputs.
7. Add deterministic fixture audio so E2E can run without provider calls.
8. Gate final production storage strictly when running in deployment mode.
9. Add event-media/B-roll usage only after rights status is enforced in the manifest and admin UI.
10. Keep public publishing, YouTube, social, and live paths separate until explicit approval.

## 18. Risk List

Critical:

- Public publishing safety must remain separate from internal preview rendering. Current render path is safe, but future wiring to YouTube/social/live must keep manual gates.

High:

- Active render jobs are in memory and disappear on server restart.
- Local render files can be ephemeral on Replit deployments if object storage is not configured.
- Remotion runtime depends on browser/system dependencies and may fail despite code presence.
- Long text can overflow because no shared measurement/wrapping engine exists.

Medium:

- HTML preview can give a false sense of final MP4 layout quality because FFmpeg/Remotion are not pixel-identical.
- SRT timing is heuristic rather than audio-aligned.
- FFmpeg ticker is static while HTML/Remotion ticker is animated.
- Approval/readiness status does not fully block internal preview rendering.
- Event media rights model exists but is not yet deeply enforced in rendered visuals.

Low:

- Some UI copy still needs tightening to distinguish planning, preview render, storage, and production publishing.
- Plugin registry and runtime readiness can describe adapter status differently unless kept synchronized.

## 19. No-Code-Change Confirmation

This task was an audit/report task only. I did not modify application source files, database schema, routes, services, UI components, or configuration for this prompt. I did not run `db:push`, did not connect providers, did not upload or publish media, and did not trigger YouTube/social/live/autonomous execution.
