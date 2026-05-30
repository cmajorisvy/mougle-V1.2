"""Archive reuse discovery for safe Micro-Pyramid integration.

This module reads generated archive manifests and produces an adaptation matrix. It never
imports archived runtime code, never restores files, and blocks P0 secret-risk rows from
reuse decisions.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from app.models import (
    ArchiveIntegrationLayer,
    ArchiveReuseCandidate,
    ArchiveReuseClassification,
    ArchiveReuseMatrix,
    MicroPyramidSignalBand,
    RuntimeImportCheck,
    RuntimeImportViolation,
)

DEFAULT_ARCHIVE_ROOT = Path("archive/legacy-codebase/20260529-1150")

MICRO_PYRAMID_KEYWORDS = {
    MicroPyramidSignalBand.personal_context: ["personal", "profile", "identity", "preference"],
    MicroPyramidSignalBand.professional_business: ["business", "professional", "studio", "brand"],
    MicroPyramidSignalBand.community: ["community", "social", "comment", "room"],
    MicroPyramidSignalBand.knowledge_contribution: ["knowledge", "claim", "evidence", "truth"],
    MicroPyramidSignalBand.risk_safety: ["risk", "safe", "moderation", "policy", "permission"],
    MicroPyramidSignalBand.reputation_gluon: ["reputation", "gluon", "rank", "trust"],
    MicroPyramidSignalBand.marketplace_product: ["marketplace", "product", "clone", "export"],
    MicroPyramidSignalBand.debate_podcast: ["debate", "podcast", "forum", "newsroom"],
}

LAYER_KEYWORDS: dict[ArchiveIntegrationLayer, list[str]] = {
    ArchiveIntegrationLayer.cross_cutting: ["signal", "event", "queue", "route", "audit"],
    ArchiveIntegrationLayer.stage5_micro_pyramid: [
        "agent",
        "memory",
        "reputation",
        "gluon",
        "marketplace",
        "debate",
        "podcast",
        "forum",
        "community",
        "risk",
        "safe",
        "passport",
        "persona",
    ],
    ArchiveIntegrationLayer.stage6_boundary: [
        "verification",
        "hard",
        "mesh",
        "stage6",
        "claim",
        "evidence",
        "provenance",
    ],
    ArchiveIntegrationLayer.stage7_foundation: [
        "external",
        "query",
        "tank",
        "uncertainty",
        "resolver",
        "supported",
        "unapproved",
    ],
    ArchiveIntegrationLayer.admin_governance: ["admin", "governance", "review", "dashboard"],
}

ARCHITECTURE_CONFLICT_PATTERNS = [
    "stage_1",
    "stage1",
    "truth crown",
    "truth_score",
    "verified knowledge",
    "stage_4",
    "stage4",
    "payout",
    "wallet",
    "balance",
]


def _read_json(path: Path, warnings: list[str]) -> Any:
    if not path.exists():
        warnings.append(f"missing manifest: {path}")
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        warnings.append(f"invalid json in {path}: {exc}")
        return []


def _secret_index(secret_rows: Iterable[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_path: dict[str, list[dict[str, Any]]] = {}
    for row in secret_rows:
        file_path = str(row.get("filePath", ""))
        if file_path:
            by_path.setdefault(file_path, []).append(row)
    return by_path


def _max_secret_risk(rows: list[dict[str, Any]]) -> str:
    ranking = {"P0": 4, "P1": 3, "P2": 2, "P3": 1, "none": 0}
    risk = "none"
    for row in rows:
        candidate = str(row.get("riskLevel", "none"))
        if ranking.get(candidate, 0) > ranking.get(risk, 0):
            risk = candidate
    return risk


def _blob(row: dict[str, Any]) -> str:
    return json.dumps(row, sort_keys=True).lower()


def infer_micro_pyramid_band(row: dict[str, Any]) -> MicroPyramidSignalBand | None:
    """Infer the most likely local Micro-Pyramid signal band for an archived row."""

    blob = _blob(row)
    best_band: MicroPyramidSignalBand | None = None
    best_hits = 0
    for band, keywords in MICRO_PYRAMID_KEYWORDS.items():
        hits = sum(1 for keyword in keywords if keyword in blob)
        if hits > best_hits:
            best_band = band
            best_hits = hits
    return best_band if best_hits else None


def infer_target_layer(row: dict[str, Any], raw_classification: str) -> ArchiveIntegrationLayer:
    """Map an archive row into the safest integration layer for planning."""

    if raw_classification == ArchiveReuseClassification.archive_only.value:
        return ArchiveIntegrationLayer.archive_only

    blob = _blob(row)
    best_layer = ArchiveIntegrationLayer.reference_only
    best_hits = 0
    for layer, keywords in LAYER_KEYWORDS.items():
        hits = sum(1 for keyword in keywords if keyword in blob)
        if hits > best_hits:
            best_layer = layer
            best_hits = hits
    return best_layer if best_hits else ArchiveIntegrationLayer.reference_only


def _target_stage(layer: ArchiveIntegrationLayer) -> str:
    return {
        ArchiveIntegrationLayer.cross_cutting: "cross_cutting_signal_culture",
        ArchiveIntegrationLayer.stage5_micro_pyramid: "stage_5_micro_pyramid",
        ArchiveIntegrationLayer.stage6_boundary: "stage_6_boundary",
        ArchiveIntegrationLayer.stage7_foundation: "stage_7_foundation",
        ArchiveIntegrationLayer.admin_governance: "admin_governance",
        ArchiveIntegrationLayer.reference_only: "reference_only",
        ArchiveIntegrationLayer.archive_only: "archive_only",
    }[layer]


def _estimate_effort(layer: ArchiveIntegrationLayer, raw_classification: str, secret_risk: str) -> str:
    if secret_risk == "P0" or raw_classification == "archive_only":
        return "manual_review"
    if layer in {ArchiveIntegrationLayer.stage5_micro_pyramid, ArchiveIntegrationLayer.stage7_foundation}:
        return "medium"
    if layer in {ArchiveIntegrationLayer.stage6_boundary, ArchiveIntegrationLayer.admin_governance}:
        return "medium_high"
    return "low"


def _risk_level(row: dict[str, Any], layer: ArchiveIntegrationLayer, secret_risk: str) -> str:
    if secret_risk == "P0":
        return "P0"
    blob = _blob(row)
    if any(pattern in blob for pattern in ARCHITECTURE_CONFLICT_PATTERNS):
        return "P1"
    if layer in {ArchiveIntegrationLayer.stage6_boundary, ArchiveIntegrationLayer.admin_governance}:
        return "P2"
    return "P3"


def compute_micro_pyramid_compatibility(row: dict[str, Any], secret_risk: str) -> float:
    """Compute the report-specified archive compatibility score for Micro-Pyramid reuse."""

    blob = _blob(row)
    path = str(row.get("originalPath", "")).lower()
    reason = str(row.get("reasonForMatch", "")).lower()
    dependencies = row.get("dependencies", []) or []
    architecture_concerns = row.get("architectureConcerns", []) or []
    security_concerns = row.get("securityConcerns", []) or []

    path_name_match = min(1.0, sum(1 for word in ["agent", "signal", "memory", "risk", "marketplace"] if word in path) / 2)
    exported_symbol_match = 1.0 if re.search(r"exports:[1-9]", reason) else 0.0
    dependency_match = 1.0 if dependencies else 0.3
    domain_keyword_match = min(1.0, sum(1 for keywords in MICRO_PYRAMID_KEYWORDS.values() for word in keywords if word in blob) / 4)
    test_presence = 1.0 if "test" in path or path.startswith("tests/") else 0.0
    code_quality = 0.8 if path.endswith((".ts", ".tsx", ".js", ".py")) else 0.45
    security_risk = 1.0 if secret_risk == "P0" else 0.35 if security_concerns or secret_risk != "none" else 0.0
    architecture_conflict = 1.0 if architecture_concerns or any(pattern in blob for pattern in ARCHITECTURE_CONFLICT_PATTERNS) else 0.0

    score = (
        0.25 * path_name_match
        + 0.20 * exported_symbol_match
        + 0.15 * dependency_match
        + 0.15 * domain_keyword_match
        + 0.10 * test_presence
        + 0.10 * code_quality
        - 0.15 * security_risk
        - 0.10 * architecture_conflict
    )
    return max(0.0, min(1.0, round(score, 3)))


def _classification(score: float, raw_classification: str, secret_risk: str) -> ArchiveReuseClassification:
    if secret_risk == "P0":
        return ArchiveReuseClassification.blocked_secret_risk
    if raw_classification == "archive_only":
        return ArchiveReuseClassification.archive_only
    if score >= 0.80 and raw_classification == "reuse_candidate":
        return ArchiveReuseClassification.reuse_candidate
    if score >= 0.55:
        return ArchiveReuseClassification.adapt_candidate
    if score >= 0.30:
        return ArchiveReuseClassification.reference_only
    return ArchiveReuseClassification.archive_only


def build_archive_reuse_matrix(
    archive_root: Path | str = DEFAULT_ARCHIVE_ROOT,
    *,
    max_candidates: int | None = None,
) -> ArchiveReuseMatrix:
    """Build a file-level archive reuse matrix without restoring archived source."""

    root = Path(archive_root)
    warnings: list[str] = []
    manifests = root / "manifests"
    reuse_rows = _read_json(manifests / "reuse-candidates.json", warnings)
    file_rows = _read_json(manifests / "file-manifest.json", warnings)
    secret_rows = _read_json(manifests / "secret-findings.redacted.json", warnings)
    if not isinstance(reuse_rows, list):
        warnings.append("reuse-candidates.json did not contain a list")
        reuse_rows = []
    if not isinstance(file_rows, list):
        file_rows = []
    if not isinstance(secret_rows, list):
        secret_rows = []

    secret_by_path = _secret_index(secret_rows)
    manifest_by_path = {str(row.get("originalPath", "")): row for row in file_rows if row.get("originalPath")}
    candidates: list[ArchiveReuseCandidate] = []

    for row in reuse_rows:
        original_path = str(row.get("originalPath", ""))
        manifest_row = manifest_by_path.get(original_path, {})
        matching_secrets = secret_by_path.get(original_path, [])
        manifest_risk = str(manifest_row.get("secretRisk", "none") or "none")
        secret_risk = _max_secret_risk(matching_secrets) if matching_secrets else manifest_risk
        raw_classification = str(row.get("classification", "reference_only"))
        score = compute_micro_pyramid_compatibility(row, secret_risk)
        classification = _classification(score, raw_classification, secret_risk)
        target_layer = infer_target_layer(row, raw_classification)
        if classification == ArchiveReuseClassification.blocked_secret_risk:
            target_layer = ArchiveIntegrationLayer.archive_only
        band = infer_micro_pyramid_band(row) if target_layer == ArchiveIntegrationLayer.stage5_micro_pyramid else None
        risk_level = _risk_level(row, target_layer, secret_risk)
        blocked = classification == ArchiveReuseClassification.blocked_secret_risk
        required_adaptation = (
            "blocked until private P0 review and rotation decision"
            if blocked
            else str(row.get("requiredAdaptation") or "adapter or wrapper required")
        )
        recommended_action = (
            "do not reuse until P0 secret review is complete"
            if blocked
            else str(row.get("recommendedAction") or "adapt through stage-safe wrapper")
        )
        candidates.append(
            ArchiveReuseCandidate(
                original_path=original_path,
                archived_path=str(row.get("archivedPath", "")),
                compatibility_score=score,
                raw_classification=raw_classification,
                classification=classification,
                secret_risk=secret_risk,
                target_layer=target_layer,
                target_stage=_target_stage(target_layer),
                micro_pyramid_band=band,
                required_adaptation=required_adaptation,
                estimated_effort=_estimate_effort(target_layer, raw_classification, secret_risk),
                risk_level=risk_level,
                recommended_action=recommended_action,
                reason_for_match=str(row.get("reasonForMatch", "")),
                dependencies=list(row.get("dependencies") or []),
                security_concerns=list(row.get("securityConcerns") or []),
                architecture_concerns=list(row.get("architectureConcerns") or []),
                blocked=blocked,
                block_reason="P0 secret-like finding requires private review" if blocked else None,
            )
        )

    candidates.sort(
        key=lambda item: (
            item.blocked,
            -item.compatibility_score,
            item.target_layer.value,
            item.original_path,
        )
    )
    if max_candidates is not None:
        candidates = candidates[:max_candidates]

    classification_summary = Counter(c.classification.value for c in candidates)
    target_layer_summary = Counter(c.target_layer.value for c in candidates)
    timestamp = root.name
    return ArchiveReuseMatrix(
        archive_timestamp=timestamp,
        archive_path=str(root),
        source_manifest=str(manifests / "reuse-candidates.json"),
        files_scanned=len(reuse_rows),
        candidates=candidates,
        classification_summary=dict(classification_summary),
        target_layer_summary=dict(target_layer_summary),
        blocked_by_secret_risk=sum(1 for c in candidates if c.blocked),
        warnings=warnings,
    )


def export_reuse_matrix(matrix: ArchiveReuseMatrix, json_path: Path, csv_path: Path) -> None:
    """Write the reuse matrix to JSON and CSV for audit/debugging."""

    json_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(matrix.model_dump_json(indent=2), encoding="utf-8")
    fields = [
        "original_path",
        "archived_path",
        "compatibility_score",
        "raw_classification",
        "classification",
        "secret_risk",
        "target_layer",
        "target_stage",
        "micro_pyramid_band",
        "required_adaptation",
        "estimated_effort",
        "risk_level",
        "recommended_action",
        "blocked",
        "block_reason",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for candidate in matrix.candidates:
            row = candidate.model_dump(mode="json")
            writer.writerow({field: row.get(field) for field in fields})


def check_runtime_archive_imports(root: Path | str = Path(".")) -> RuntimeImportCheck:
    """Detect forbidden direct runtime imports from the archived source tree."""

    root_path = Path(root)
    violations: list[RuntimeImportViolation] = []
    scanned = 0
    import_re = re.compile(r"^\s*(from|import)\s+archive(\.|\s|$)")
    source_path_re = re.compile(r"archive/legacy-codebase/.*/source")
    for folder in [root_path / "app", root_path / "tests"]:
        if not folder.exists():
            continue
        for path in folder.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            scanned += 1
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except UnicodeDecodeError:
                continue
            for line_no, line in enumerate(lines, start=1):
                if import_re.search(line) or ("sys.path" in line and source_path_re.search(line)):
                    violations.append(
                        RuntimeImportViolation(
                            file_path=str(path),
                            line_number=line_no,
                            import_text=line.strip(),
                            reason="runtime code must use adapters/manifests, not direct archived-source imports",
                        )
                    )
    return RuntimeImportCheck(
        scanned_files=scanned,
        violation_count=len(violations),
        violations=violations,
        passed=not violations,
    )
