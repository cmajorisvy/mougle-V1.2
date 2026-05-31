# Newsroom Studio Video Compatibility Specification

## Scope

The Newsroom Studio video compatibility layer is a local deterministic metadata and control-plane layer for video/verbal newsroom outputs. It creates candidate bulletins, anchor scripts, robot explainer cues, studio screen states, lower-thirds, tickers, SFX plans, rights checks, VideoObject metadata, video sitemap entries, and modality divergence reports.

It does not generate real video, execute Cinema4D, execute Unreal, control LED walls, trigger 4D hardware, call platform APIs, publish to YouTube/TikTok/X/Facebook/Rumble/Telegram, run hidden scripts, add real payments, or contact external providers.

## Core Boundary

Newsrooms Council remains the editorial and verification control plane. News Room Studio remains the presentation and render metadata plane. Neither plane may bypass Stage 6, write Stage 4 directly, influence Stage 1 directly, or declare final truth without the Truth Pyramid path.

Studio outputs are candidate presentation artifacts only:

- `may_publish_truth = false`
- `may_update_stage1 = false`
- `may_update_stage4 = false`
- `candidate_only = true`
- `no_hardware_execution = true`
- `no_platform_publish = true`
- `external_calls_made = false`

## Supported Video and Studio Contracts

Typed contracts:

- `NewsVideoBulletin`
- `NewsVideoBulletinInput`
- `NewsAnchorScript`
- `NewsAnchorScriptLine`
- `NewsRobotExplainerCue`
- `NewsStudioSceneCue`
- `NewsStudioScreenState`
- `NewsStudioSfxCue`
- `NewsStudioLowerThird`
- `NewsStudioTickerItem`
- `NewsStudioAssetRequirement`
- `NewsStudioRightsCheck`
- `NewsStudioAiReconstructionLabel`
- `NewsVideoSeoArtifact`
- `NewsVideoSitemapEntry`
- `NewsModalityDivergenceReport`

Video formats:

- `standard_16x9`
- `shorts_9x16`
- `square_1x1`
- `ultrawide_32x9`

Controlled studio cue targets:

- `MGL_BACK_DISPLAY_Main`
- `MGL_EVENT_DISPLAY_Fullscreen`
- `MGL_SOURCE_PANEL_Right`
- `MGL_CONFIDENCE_PANEL_Left`
- `MGL_CLAIMS_PANEL_Right`
- `MGL_TIMELINE_PANEL_Left`
- `MGL_TICKER_Bottom`
- `MGL_LOWER_THIRD_Main`
- `MGL_ROBOT_FACE_SCREEN`
- `MGL_CHAT_OVERLAY_Safe`
- `MGL_SPONSOR_SAFE_ZONE`

SFX cue taxonomy:

- `none`
- `neutral_bed`
- `breaking_alert_soft`
- `transition_whoosh`
- `data_ping`
- `weather_ambience`
- `market_energy`
- `correction_notice`
- `respectful_silence`

AI visual disclosures:

- `real_footage`
- `licensed_footage`
- `public_domain`
- `ai_reconstruction`
- `simulation`
- `artist_visualization`
- `not_actual_footage`
- `internal_preview_only`

Synthetic or reconstructed visuals require a visible AI reconstruction/not-actual-footage label before the rights check can pass.

## Text vs Video Modality Separation

The video/verbal layer must not read a text article aloud as-is. It generates short spoken lines from the claim graph and package metadata, while the text article remains a denser inverted-pyramid artifact.

Text article modality:

- inverted pyramid
- dense facts
- self-contained context
- formal/objective tone
- SEO and schema first
- reader controls pace
- no SFX
- no studio cues

Video/verbal modality:

- narrative, hourglass, or chronological flow
- short spoken sentences
- conversational but credible tone
- visuals carry context
- lower information density
- timeline-controlled pacing
- SFX and visual cues only through safe approved cue plans
- `VideoObject` and watch-page metadata

## Formulas

### ModalityDivergence

```text
ModalityDivergence = clip01(1 - similarity(text_variant, video_script_variant))
```

A high value means the video script is structurally distinct from the text article. The implementation stores both similarity and divergence, both bounded in `[0, 1]`.

### AnchorSpeechReadability

```text
AnchorSpeechReadability = sigmoid(
    0.25 * short_sentence_score
  + 0.20 * breath_unit_fit
  + 0.15 * pronunciation_clarity
  + 0.15 * visual_alignment
  + 0.10 * pacing_fit
  + 0.10 * one_idea_per_breath
  - 0.15 * dense_sentence_penalty
)
```

The MVP enforces short spoken sentence lines and records breath-unit fit metadata without invoking any speech or voice provider.

### StudioCueSafety

```text
StudioCueSafety = min(
    rights_pass,
    ai_label_pass,
    sponsor_disclosure_pass,
    sfx_policy_pass,
    no_hardware_execution_pass,
    no_platform_publish_pass
)
```

A cue plan is safe only when all required local metadata checks pass. This value is not a TruthScore and is not publication approval.

### BroadcastReadiness

Broadcast readiness stays aligned with the existing Newsrooms Council formula:

```text
BroadcastReadiness = clip01(sigmoid(
    0.18 * newsroom_readiness
  + 0.15 * script_completeness
  + 0.12 * anchor_safety
  + 0.12 * source_attribution_completeness
  + 0.10 * visual_asset_safety
  + 0.10 * correction_disclosure
  + 0.08 * duration_fit
  + 0.08 * segment_coherence
  + 0.07 * compliance_status
  - 0.12 * unverified_claim_penalty
  - 0.08 * sensationalism_penalty
))
```

BroadcastReadiness is a routing and preparation signal only. It does not publish truth.

## Persistence

The layer adds additive local SQLite tables:

- `news_video_bulletins`
- `news_anchor_scripts`
- `news_anchor_script_lines`
- `news_robot_explainer_cues`
- `news_studio_scene_cues`
- `news_studio_screen_states`
- `news_studio_sfx_cues`
- `news_studio_lower_thirds`
- `news_studio_ticker_items`
- `news_studio_asset_requirements`
- `news_studio_rights_checks`
- `news_studio_ai_reconstruction_labels`
- `news_video_seo_artifacts`
- `news_video_sitemap_entries`
- `news_modality_divergence_reports`

No production database path is introduced.

## API Surface

- `POST /newsrooms/packages/{package_id}/video-bulletin`
- `GET /newsrooms/video-bulletins`
- `GET /newsrooms/video-bulletins/{bulletin_id}`
- `POST /newsrooms/video-bulletins/{bulletin_id}/anchor-script`
- `POST /newsrooms/video-bulletins/{bulletin_id}/studio-cues`
- `POST /newsrooms/video-bulletins/{bulletin_id}/sfx-plan`
- `POST /newsrooms/video-bulletins/{bulletin_id}/rights-check`
- `POST /newsrooms/video-bulletins/{bulletin_id}/video-seo`
- `POST /newsrooms/video-bulletins/{bulletin_id}/modality-divergence`
- `GET /dashboard/newsrooms/studio-cues`
- `GET /dashboard/newsrooms/video-bulletins`
- `GET /dashboard/newsrooms/video-safety`

## Safety Rules

- Video bulletins can be created from candidate/provisional newsroom packages only as metadata artifacts.
- Anchor scripts must be distinct from text article output and use short spoken sentence lines.
- Studio cue targets must be members of the `MGL_*` controlled zone enum.
- Studio cue payloads may describe preview state only; they must not contain hardware execution commands.
- Studio video SEO produces `VideoObject` JSON-LD and sitemap metadata only; it must not submit to platforms.
- Unsafe celebratory or energetic SFX cues are rejected for tragedy, disaster, death, injury, war, accident, child-safety, and similar sensitive categories.
- Synthetic, simulated, AI-reconstructed, artist-visualized, not-actual-footage, or internal-preview-only visuals require explicit visible disclosure metadata.
- No studio output can publish truth, update Stage 1, update Stage 4, bypass Stage 6, call external providers, or touch production databases.

## Validation Coverage

The E2E coverage verifies:

- video bulletin creation from a candidate newsroom package
- anchor script distinction from text article output
- bounded `ModalityDivergence`
- short spoken sentence enforcement
- SFX rejection for unsafe tragedy/disaster cues
- AI reconstruction labels for synthetic visuals
- controlled `MGL_*` studio cue targets
- no hardware execution commands
- no platform publishing commands
- `VideoObject` JSON-LD generation
- video sitemap entry generation
- studio output cannot publish truth, update Stage 1, or update Stage 4
