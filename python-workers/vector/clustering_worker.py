"""
Clustering worker — first real implementation.

Semantic clustering of articles / claims / posts. Used by the verified
newsroom pipeline (clusters raw articles into events) and by user agents
(group user-supplied documents by topic).

Strategy (in order of preference):
  1. If scikit-learn is available, TF-IDF + cosine-distance agglomerative
     clustering with `distance_threshold` from the payload (default 0.55).
  2. Otherwise, deterministic Jaccard-over-content-tokens greedy clustering.

Both paths produce identical output shapes so downstream code does not need
to branch. The greedy fallback is intentionally simple — good enough for
small batches and zero external dependencies.

Future extension: swap the TF-IDF step for real embeddings (OpenAI or local
sentence-transformers) once the TS side wires an embedding budget guard.
"""

from __future__ import annotations

import time
from typing import Any

from shared.contracts import JobEnvelope, JobResult, JobStatus
from shared.ids import cluster_id
from shared.logging import get_logger
from shared.text_utils import content_tokens, jaccard, normalize, top_keywords

log = get_logger(__name__)

_DEFAULT_THRESHOLD = 0.55  # matches semanticClusteringPayloadSchema default
_MIN_DOCS = 1  # we still produce output for a single doc (one trivial cluster)


def _coerce_documents(payload: dict[str, Any]) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    if isinstance(payload.get("documents"), list):
        for raw in payload["documents"]:
            if not isinstance(raw, dict):
                continue
            did = str(raw.get("id") or raw.get("document_id") or "").strip()
            text = str(raw.get("text") or raw.get("content") or "")
            if did and text:
                docs.append({"id": did, "text": text})
    else:
        for did in payload.get("document_ids") or payload.get("documentIds") or []:
            docs.append({"id": str(did), "text": ""})
    return docs


def _cluster_with_sklearn(
    docs: list[dict[str, Any]], threshold: float
) -> tuple[list[list[int]], str]:
    """Returns (clusters_as_index_lists, engine_name)."""
    try:
        from sklearn.cluster import AgglomerativeClustering  # type: ignore
        from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
    except Exception:  # noqa: BLE001 — any import failure → fallback
        return [], ""

    texts = [d["text"] for d in docs]
    vectorizer = TfidfVectorizer(
        lowercase=True, stop_words="english", min_df=1, max_df=0.95
    )
    try:
        matrix = vectorizer.fit_transform(texts)
    except ValueError:
        # Happens when every doc is empty / stopword-only.
        return [], "sklearn-empty-vocab"

    if matrix.shape[0] == 1:
        return [[0]], "sklearn-single"

    model = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=threshold,
        metric="cosine",
        linkage="average",
    )
    labels = model.fit_predict(matrix.toarray())
    buckets: dict[int, list[int]] = {}
    for i, lab in enumerate(labels):
        buckets.setdefault(int(lab), []).append(i)
    # Deterministic ordering: by member count desc, then by lowest index.
    ordered = sorted(buckets.values(), key=lambda ix: (-len(ix), ix[0]))
    return ordered, "sklearn-tfidf-agglomerative"


def _cluster_with_jaccard(
    docs: list[dict[str, Any]], threshold: float
) -> tuple[list[list[int]], str]:
    """Greedy Jaccard fallback. similarity = jaccard(tokens_a, tokens_b)."""
    sim_threshold = 1.0 - threshold  # cosine-distance threshold → similarity floor
    token_lists = [content_tokens(d["text"]) for d in docs]
    clusters: list[list[int]] = []
    representatives: list[list[str]] = []
    for i, toks in enumerate(token_lists):
        placed = False
        for c_idx, rep in enumerate(representatives):
            if jaccard(toks, rep) >= sim_threshold:
                clusters[c_idx].append(i)
                placed = True
                break
        if not placed:
            clusters.append([i])
            representatives.append(toks)
    ordered = sorted(clusters, key=lambda ix: (-len(ix), ix[0]))
    return ordered, "jaccard-greedy"


def _build_cluster_record(
    index_list: list[int], docs: list[dict[str, Any]]
) -> dict[str, Any]:
    members = [docs[i] for i in index_list]
    member_ids = [m["id"] for m in members]
    texts = [m["text"] for m in members]
    keywords = top_keywords(texts, k=5)
    label = " ".join(keywords[:3]) if keywords else members[0]["text"][:40]
    # Representative: shortest non-empty text (tends to be the most concise).
    rep = min((t for t in texts if t), key=len, default="")
    # Confidence: cluster purity proxy = average pairwise Jaccard of contents.
    if len(members) > 1:
        tok_lists = [content_tokens(t) for t in texts]
        pair_count = 0
        total = 0.0
        for i in range(len(tok_lists)):
            for j in range(i + 1, len(tok_lists)):
                total += jaccard(tok_lists[i], tok_lists[j])
                pair_count += 1
        confidence = round(total / max(pair_count, 1), 3) if pair_count else 0.5
    else:
        confidence = 0.5  # singleton — we can't measure cohesion
    return {
        "cluster_id": cluster_id(member_ids),
        "label": label,
        "item_ids": member_ids,
        "representative_text": rep[:280],
        "keywords": keywords,
        "size": len(members),
        "confidence": confidence,
    }


async def run(job: JobEnvelope) -> JobResult:
    started = time.perf_counter()
    payload = job.payload or {}
    log.info("clustering_worker.run", extra={"job_id": job.job_id})

    raw_threshold = payload.get("distance_threshold", payload.get("distanceThreshold", _DEFAULT_THRESHOLD))
    try:
        threshold = max(0.0, min(float(raw_threshold), 1.0))
    except (TypeError, ValueError):
        threshold = _DEFAULT_THRESHOLD

    docs = _coerce_documents(payload)
    skipped_no_text = [d["id"] for d in docs if not d["text"]]
    docs_with_text = [d for d in docs if d["text"]]

    if len(docs_with_text) < _MIN_DOCS:
        duration_ms = int((time.perf_counter() - started) * 1000)
        return JobResult(
            job_id=job.job_id,
            status=JobStatus.SUCCEEDED,
            duration_ms=duration_ms,
            result={
                "worker": "clustering_worker",
                "version": "heuristic-v1",
                "engine": "noop",
                "clusters": [],
                "skipped_documents_missing_text": skipped_no_text,
                "document_count": len(docs),
                "cluster_count": 0,
                "distance_threshold": threshold,
            },
        )

    index_clusters, engine = _cluster_with_sklearn(docs_with_text, threshold)
    if not index_clusters:
        index_clusters, engine = _cluster_with_jaccard(docs_with_text, threshold)

    clusters = [_build_cluster_record(ix, docs_with_text) for ix in index_clusters]

    duration_ms = int((time.perf_counter() - started) * 1000)
    return JobResult(
        job_id=job.job_id,
        status=JobStatus.SUCCEEDED,
        duration_ms=duration_ms,
        result={
            "worker": "clustering_worker",
            "version": "heuristic-v1",
            "engine": engine,
            "distance_threshold": threshold,
            "document_count": len(docs_with_text),
            "cluster_count": len(clusters),
            "clusters": clusters,
            "skipped_documents_missing_text": skipped_no_text,
        },
        metrics={
            "avg_cluster_size": round(
                sum(c["size"] for c in clusters) / max(len(clusters), 1), 2
            ),
            "singleton_clusters": sum(1 for c in clusters if c["size"] == 1),
        },
    )
