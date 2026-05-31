# Newsrooms Council Studio Compatibility Report

## Purpose

This report defines the canonical compatibility boundary between the future
Newsrooms Council implementation, the News Room Studio presentation surface,
text/news/blog SEO output, and video/verbal newsroom output.

It is a planning and safety document only. It does not authorize runtime
publishing, external provider calls, hardware execution, payment flows, or any
direct write into Stage 4 or Stage 1.

## Core Compatibility Rule

Newsrooms Council is the editorial and verification control plane.
News Room Studio is the render/presentation plane.
Neither may bypass Stage 6.
Neither may write Stage 4 directly.
Neither may influence Stage 1 directly.
Neither may publish final truth without the Truth Pyramid path.

## Layer 1: Newsrooms Council Backend Control Plane

The Newsrooms Council backend control plane governs editorial intake,
normalization, verification routing, risk scoring, and candidate handoff. It is
not a truth oracle and cannot publish final truth by itself.

Required capabilities:

- `source/feed ingestion`: accept configured local or approved feed inputs as
  candidate newsroom material.
- `article normalization`: convert raw feed items, article records, and
  editorial notes into a stable internal shape with source, timestamp, author,
  topic, and provenance metadata.
- `claim extraction`: decompose normalized articles into atomic claims that can
  be routed into the existing claim graph and verification flow.
- `source reliability`: compute bounded source reliability signals from
  historical reliability, provenance completeness, attribution clarity, and
  conflict history.
- `newsworthiness scoring`: score civic relevance, topic momentum, novelty,
  timeliness, public-interest value, and audience impact without treating the
  score as truth.
- `editorial risk scoring`: flag legal sensitivity, safety concerns, disputed
  claims, source conflict, weak provenance, stale evidence, and manipulation
  risk.
- `Stage 7 candidate routing`: send unresolved, external, disputed, or
  not-yet-verified newsroom claims into candidate-only Stage 7 records.
- `Stage 6 packet submission`: package selected Stage 7 candidates for Stage 6
  HARD-MESH structural verification.
- `Query Tank handoff`: move unresolved, weak, disputed, or high-risk claims to
  Query Tank with required next actions.
- `PTEE/topology trace references`: preserve topology snapshot references,
  graph trace IDs, source lineage, and route decisions so newsroom activity can
  be audited against the broader Truth Pyramid graph.
- `safety invariants`: preserve bounded scores, candidate-only external memory,
  no direct Stage 4 writes, no direct Stage 1 influence, no fabricated evidence,
  no hidden external calls, and no final-truth declaration.

Control-plane safety:

- Newsrooms Council may create candidate records, review queues, route hints,
  and Stage 6 submission packets.
- Newsrooms Council may not publish truth.
- Newsrooms Council may not write Stage 4 directly.
- Newsrooms Council may not influence Stage 1 directly.
- Newsrooms Council may not bypass Stage 6.
- Newsrooms Council may not call external AI providers unless explicitly
  configured by a later approved change.
- Newsrooms Council may not add payment, payout, or financial eligibility logic.

## Layer 2: News Room Studio Presentation Plane

The News Room Studio presentation plane renders approved previews, scripts, cue
plans, and visual layouts. It consumes safe newsroom state and verification
metadata, but it does not execute hardware or publish content.

Supported presentation surfaces:

- `Android Anchor`: preview persona or rendered presenter state only.
- `Robot Anchor / Robot Explainer`: generated explanation persona state only.
- `LED back wall`: visual layout metadata for context panels and safe preview
  scenes.
- `source panel`: source provenance summary and citation state.
- `confidence panel`: bounded confidence, uncertainty, Stage 6 route, and
  candidate status indicators.
- `claims panel`: atomic claim list, claim status, evidence count, and review
  route.
- `timeline panel`: editorial sequence, evidence age, update cadence, and
  broadcast timing preview.
- `lower-third`: safe title, speaker, topic, and status overlay plan.
- `ticker`: short approved text snippets with claim IDs and status metadata.
- `sponsor zone`: presentation-only placeholder metadata; not payment, payout,
  settlement, ad serving, or financial eligibility.
- `live chat overlay`: moderated display state only, with no truth authority.
- `AI reconstruction label`: visible disclosure for simulated, reconstructed,
  synthetic, or illustrative visuals.
- `screen operator states`: preview states such as `idle`, `rehearsal`,
  `review`, `ready_for_manual_operator`, and `blocked`.
- `4D cue timeline as preview-only state data`: temporal cue metadata for
  camera, lighting, sound, visual layers, or immersive sequencing; preview-only
  and never hardware execution.

Presentation-plane safety:

- No hardware execution.
- No publishing commands.
- No hidden scripts.
- No external network calls.
- No autonomous broadcast triggers.
- No direct Stage 4 writes.
- No direct Stage 1 influence.
- No Stage 6 bypass.
- No final-truth declaration.

## Layer 3: Text News Blog / SEO Plane

The text news/blog plane turns verified or candidate-gated newsroom state into
readable article formats and metadata plans. It must remain copyright-safe and
derive prose from the verified claim graph, not from source-paragraph
paraphrasing.

Supported text outputs:

- `text article output`: structured article draft, status-labeled if not final.
- `live update output`: timestamped update stream with each entry tied to claim,
  source, and verification status.
- `blog/explainer output`: educational or contextual explainer with clear
  separation between verified facts, uncertainty, and background.
- `nested taxonomy`: topic hierarchy that maps article context to stable
  category and subcategory paths.
- `category tree`: newsroom category map for navigation, editorial ownership,
  and sitemap grouping.
- `canonical URL`: preferred URL metadata for a final published item or preview
  placeholder.
- `hreflang cluster`: locale cluster metadata for translated or localized
  versions when present.
- `JSON-LD NewsArticle / BlogPosting / LiveBlogPosting`: structured-data plan
  matching the text modality and publication status.
- `BreadcrumbList`: structured breadcrumb path for reader and crawler context.
- `Organization`: publisher identity, logo reference, and ownership metadata.
- `news sitemap`: sitemap entry plan for eligible final content only.
- `originality checks`: similarity, attribution, claim-graph derivation, and
  source-distance checks before publication.
- `copyright-safe rewriting from verified claim graph, not source-paragraph
  paraphrasing`: prose must be generated from atomic claims, verification
  verdicts, provenance metadata, and editorial context, not from near-copy
  transformation of source paragraphs.

Text-plane safety:

- Draft text may remain candidate-only until the Truth Pyramid path permits
  publication.
- Text output must label uncertainty and candidate state.
- SEO metadata cannot override verification state.
- Structured data cannot imply final truth before publish eligibility exists.
- News sitemap entries require final publication readiness.

## Layer 4: Video / Verbal Newsroom Plane

The video/verbal newsroom plane creates spoken, visual, and timeline plans for
watch-page or broadcast-like presentation. It must be distinct from the text
article modality because spoken news has lower information density and depends
on pacing, cues, visuals, and disclosure labels.

Supported video/verbal outputs:

- `anchor script`: short spoken sentences for a human or preview anchor.
- `robot explainer script`: conversational explanatory script for Robot Anchor
  or Robot Explainer preview.
- `shot plan`: scene order, visual context, on-screen source references, and
  safe cue states.
- `SFX plan`: approved sound cue plan only, never automatic sound playback or
  hardware execution.
- `lower-third plan`: visual overlay timing, speaker labels, claim status, and
  topic labels.
- `ticker plan`: concise ticker items with claim IDs and verification status.
- `AI reconstruction labels`: mandatory labels for synthetic, reconstructed,
  illustrative, or AI-assisted visuals.
- `VideoObject structured data`: watch-page metadata for eligible video content.
- `video sitemap`: sitemap entry plan for eligible final video content only.
- `Clip / BroadcastEvent readiness`: readiness metadata for clips, segments,
  and scheduled broadcast-like presentation, without autonomous publishing.
- `short spoken sentences`: wording optimized for comprehension when heard once.
- `low information density`: fewer facts per sentence than text articles.
- `narrative flow distinct from text article`: spoken scripts should use
  narrative, hourglass, or chronological flow rather than simply reading the
  text article.

Video-plane safety:

- No hidden rendering or publishing scripts.
- No hardware execution.
- No external network calls.
- No Stage 6 bypass.
- No direct Stage 4 writes.
- No direct Stage 1 influence.
- No final-truth declaration from a script, cue plan, or watch-page metadata.

## Text Blog vs Video News Modality Separation

| Dimension | Text news/blog | Video/verbal news |
| --- | --- | --- |
| Structure | inverted pyramid | narrative / hourglass / chronological flow |
| Fact density | dense facts | lower information density |
| Context | self-contained context | visuals carry context |
| Sentence style | formal/objective tone | short spoken sentences |
| Voice | reader controls pace | conversational tone |
| Metadata | SEO + schema | VideoObject and watch-page metadata |
| Pacing | reader controls pace | timeline-controlled pacing |
| Audio and cues | no SFX; no studio cues | SFX / visual cues allowed only through safe approved cue plan |

Compatibility requirements:

- Text output and video output may share the same verified claim graph.
- Text output and video output must not share identical prose plans.
- Text may carry denser background and citations.
- Video/verbal scripts must preserve clarity for one-pass listening.
- Video cue plans are preview-only until a separate approved production path
  exists.
- Neither modality may convert candidate-only material into final truth.

## Compatibility Data Model Guidance

The four layers should exchange explicit state instead of implicit authority:

- `newsroom_item_id`: stable ID for normalized source/feed item.
- `claim_id`: atomic claim reference.
- `source_id`: source provenance reference.
- `evidence_id`: evidence reference.
- `stage7_record_id`: candidate memory reference when routed.
- `stage6_submission_id`: Stage 6 packet reference when submitted.
- `query_tank_id`: unresolved handoff reference.
- `topology_ref`: PTEE/topology trace reference.
- `presentation_state_id`: Studio preview state reference.
- `text_article_plan_id`: text/news/blog output plan reference.
- `video_script_plan_id`: video/verbal output plan reference.
- `safety_invariant_version`: versioned safety boundary reference.

## Math Formulas

All formulas are bounded planning signals. They are not final truth and cannot
publish content by themselves.

### SourceReliability

```text
SourceReliability =
  clip01(
    0.30 * historical_accuracy
  + 0.20 * provenance_completeness
  + 0.15 * author_attribution
  + 0.15 * source_transparency
  + 0.10 * correction_history_quality
  + 0.10 * cross_source_agreement
  - 0.20 * conflict_penalty
  - 0.15 * manipulation_risk
  )
```

### Newsworthiness

```text
Newsworthiness =
  clip01(
    0.22 * public_interest
  + 0.18 * civic_relevance
  + 0.16 * novelty
  + 0.14 * timeliness
  + 0.12 * topic_momentum
  + 0.10 * affected_population
  + 0.08 * explanatory_value
  - 0.12 * sensationalism_penalty
  )
```

### EditorialRisk

```text
EditorialRisk =
  clip01(
    0.22 * legal_sensitivity
  + 0.20 * source_conflict
  + 0.16 * evidence_weakness
  + 0.14 * safety_harm_risk
  + 0.12 * privacy_risk
  + 0.10 * manipulation_risk
  + 0.06 * staleness_risk
  )
```

### ClaimPriority

```text
ClaimPriority =
  clip01(
    0.28 * Newsworthiness
  + 0.22 * EditorialRisk
  + 0.18 * uncertainty
  + 0.14 * audience_impact
  + 0.10 * claim_centrality
  + 0.08 * freshness
  )
```

### FreshnessDecay

```text
FreshnessDecay =
  exp(-lambda * age_hours)

freshness =
  clip01(FreshnessDecay * source_update_factor)
```

### NewsroomReadiness

```text
NewsroomReadiness =
  clip01(
    0.24 * normalized_claim_coverage
  + 0.20 * mean_SourceReliability
  + 0.18 * evidence_completeness
  + 0.14 * editorial_review_completeness
  + 0.12 * topology_trace_completeness
  + 0.12 * safety_invariant_pass_rate
  - 0.25 * EditorialRisk
  )
```

### BroadcastReadiness

```text
BroadcastReadiness =
  clip01(
    0.20 * NewsroomReadiness
  + 0.18 * script_review_status
  + 0.16 * cue_plan_approval
  + 0.14 * disclosure_label_completeness
  + 0.12 * lower_third_accuracy
  + 0.10 * ticker_accuracy
  + 0.10 * operator_review_status
  - 0.20 * unapproved_hardware_or_publish_command_risk
  )
```

### OriginalityScore

```text
OriginalityScore =
  clip01(
    0.30 * claim_graph_derivation
  + 0.20 * independent_sentence_structure
  + 0.18 * source_distance
  + 0.14 * attribution_completeness
  + 0.10 * synthesis_value
  + 0.08 * quote_limit_compliance
  - 0.25 * source_paragraph_similarity
  )
```

### ModalityDivergence

```text
ModalityDivergence =
  clip01(
    0.24 * structure_difference
  + 0.20 * sentence_length_difference
  + 0.18 * density_difference
  + 0.14 * pacing_difference
  + 0.12 * cue_usage_difference
  + 0.12 * metadata_difference
  )
```

### PublishReadiness

```text
PublishReadiness =
  clip01(
    0.24 * NewsroomReadiness
  + 0.18 * Stage6_clearance_signal
  + 0.16 * evidence_completeness
  + 0.14 * editorial_approval
  + 0.10 * OriginalityScore
  + 0.08 * safety_invariant_pass_rate
  + 0.06 * topology_trace_completeness
  + 0.04 * modality_specific_metadata_readiness
  - 0.24 * EditorialRisk
  )
```

PublishReadiness is still only a readiness signal. Final publication requires
the established Truth Pyramid path, including Stage 6 and downstream gates.

## Safety Invariant Matrix

| Invariant | Newsrooms Council | News Room Studio | Text/SEO plane | Video/verbal plane |
| --- | --- | --- | --- | --- |
| No Stage 6 bypass | Required | Required | Required | Required |
| No direct Stage 4 writes | Required | Required | Required | Required |
| No direct Stage 1 influence | Required | Required | Required | Required |
| Stage 7 candidate-only | Required when routed | Display only | Label only | Label only |
| Query Tank handoff | Required for unresolved work | Display only | Label only | Label only |
| No fabricated evidence | Required | Display only | Required | Required |
| No external calls by default | Required | Required | Required | Required |
| No payments or payouts | Required | Required | Required | Required |
| No hardware execution | Not applicable | Required | Not applicable | Required |
| No publishing commands | Required | Required | Required | Required |

## Implementation Compatibility Checklist

- Backend endpoints must expose state and route decisions, not final truth.
- Studio endpoints must expose preview state, not hardware or publishing actions.
- Text output plans must derive from verified claim graph state and attribution.
- Video output plans must use a distinct spoken narrative and approved cue plan.
- All outputs must carry claim IDs, source IDs, evidence IDs, and route state.
- Unresolved claims must route to Query Tank or Stage 7 candidate memory.
- Stage 6 packets must preserve `candidate_answer_not_verified=true`.
- PTEE/topology references must be persisted where verification graph state is
  involved.
- Any future external feed, AI provider, hardware, payment, or publishing
  integration must be separately configured and reviewed.

## Conclusion

The compatible architecture is layered:

1. Newsrooms Council governs editorial verification routing.
2. News Room Studio renders safe preview and presentation plans.
3. Text news/blog output produces reader-paced, SEO-aware, copyright-safe prose
   from verified claim graph state.
4. Video/verbal output produces spoken scripts, cue plans, watch-page metadata,
   and labels with lower information density and timeline-controlled pacing.

The shared safety boundary is simple: none of these layers can bypass Stage 6,
write Stage 4 directly, influence Stage 1 directly, or publish final truth
outside the Truth Pyramid path.
