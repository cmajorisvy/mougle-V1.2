# Newsrooms Text Blog SEO Specification

## Scope

The Newsrooms text/blog/SEO system is a local deterministic drafting and metadata layer for the Newsrooms Council. It creates candidate textual newsroom outputs from normalized claims, evidence references, and package metadata. It does not publish articles, does not call external providers, does not touch a production database, and does not mark any rewritten text as final truth.

Supported textual output types:

- `reported_news_article`
- `live_blog_update`
- `blog_explainer`
- `correction_notice`

Legacy-compatible internal aliases remain possible for earlier MVP fields, but public text generation should prefer the four canonical text output types above.

## Control Boundary

Newsrooms Council remains the editorial and verification control plane. Text artifacts are generated from the claim graph and evidence references, not by copying raw source paragraphs. Text artifacts are draft/candidate outputs only.

Hard boundaries:

- No real publishing commands.
- No production database writes.
- No external provider calls.
- No fabricated evidence.
- No source article paragraph copying.
- No direct Stage 4 writes.
- No direct Stage 1 writes.
- No Stage 6 bypass.
- Newsworthiness is not TruthScore.
- SourceReliability is not TruthScore.
- Virality is not truth.

## Taxonomy

Taxonomy entities:

- `NewsCategory`: parent-child section tree with public URL depth capped at three category levels.
- `NewsTopic`: topic landing page metadata.
- `NewsSlug`: stable slug metadata for generated paths.
- `NewsCanonicalCluster`: canonical URL plus localized variants.
- `NewsHreflangVariant`: self-referencing and bidirectional hreflang variants.

Allowed URL patterns:

- Article: `/{locale}/{section}/{subsection}/{story-slug}/`
- Live: `/{locale}/live/{event-slug}/`
- Blog: `/{locale}/blog/{topic}/{story-slug}/`
- Video: `/{locale}/video/{section}/{video-slug}/`
- Topic: `/{locale}/topic/{topic-slug}/`
- Author: `/{locale}/author/{author-slug}/`

## Text Modality Rules

Text outputs follow an inverted pyramid shape:

1. Lead paragraph first.
2. Supporting facts from the claim graph.
3. Context and background with preserved source attribution.
4. Minor details and safety notes.

Text outputs must be dense but readable, self-contained, formal/objective, and free of SFX or studio cue dependencies.

## Structured Data

Generated JSON-LD artifacts:

- `NewsArticle` for standard reported news.
- `LiveBlogPosting` for rolling updates.
- `BlogPosting` for blog/explainer outputs.
- `VideoObject` placeholder for future video watch pages.
- `BreadcrumbList` for section hierarchy.
- `Organization` for Mougle publisher identity.

Structured data includes available fields for headline, image, datePublished, dateModified, author, publisher, articleSection, keywords, canonical URL, language/locale, backstory/provenance, and `digitalSourceType` when AI reconstruction or synthetic asset metadata is present.

## Originality

Originality uses:

`OriginalityScore = 1 - max_similarity(generated_text, source_texts)`

Rules:

- Do not paraphrase raw third-party article paragraphs.
- Generate from normalized claim graph and evidence references.
- Preserve attribution/source refs.
- Allow direct quotes only as attributed snippets.
- If `OriginalityScore` is below the configured threshold, block the output or route it for rewrite.
- Never mark rewritten text as verified unless its claims passed the Truth Pyramid verification path.

## API Surface

- `POST /newsrooms/categories`
- `GET /newsrooms/categories`
- `POST /newsrooms/articles/{article_id}/seo-artifact`
- `GET /newsrooms/articles/{article_id}/seo-artifact`
- `POST /newsrooms/articles/{article_id}/originality-check`
- `POST /newsrooms/packages/{package_id}/text-article`
- `POST /newsrooms/packages/{package_id}/live-blog-update`
- `POST /newsrooms/packages/{package_id}/blog-post`
- `GET /dashboard/newsrooms/seo`
- `GET /dashboard/newsrooms/originality`

## Persistence

The implementation adds additive SQLite tables only:

- `news_categories`
- `news_topics`
- `news_canonical_clusters`
- `news_hreflang_variants`
- `news_seo_artifacts`
- `news_sitemap_entries`
- `news_structured_data_artifacts`
- `news_originality_reports`

No production database access is introduced.
