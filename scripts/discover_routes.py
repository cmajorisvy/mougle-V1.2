"""Discover public FastAPI routes and write E2E route coverage artifacts."""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

os.environ.setdefault(
    "TRUTH_PYRAMID_DB_PATH",
    str(Path(tempfile.gettempdir()) / "truth_pyramid_route_discovery.db"),
)

from app.api import app

EXCLUDED_PATHS = {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}
EXCLUDED_METHODS = {"HEAD", "OPTIONS"}
PODCAST_COUNCIL_E2E = (
    "tests/test_podcast_council.py::"
    "test_podcast_council_mvp_routes_candidates_and_packets_without_truth_authority"
)
NEWSROOMS_COUNCIL_E2E = (
    "tests/test_newsrooms_council.py::"
    "test_newsrooms_council_mvp_routes_candidates_packets_and_dashboard"
)
NEWSROOMS_TEXT_SEO_E2E = (
    "tests/test_newsrooms_text_seo.py::"
    "test_newsrooms_text_blog_seo_structured_data_and_originality"
)

TESTED_BY: dict[tuple[str, str], list[str]] = {
    ("GET", "/health"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("POST", "/verify"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("GET", "/graph/{answer_id}"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("POST", "/hard-mesh/analyze"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("GET", "/query-tank"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("POST", "/council/socket/events"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("GET", "/council/socket/events"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("GET", "/topology/evolution"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("POST", "/agents/action-request"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("POST", "/signal/events"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("GET", "/admin/signal-load-reduction"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("GET", "/archive/micro-pyramid/candidates"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("GET", "/archive/runtime-imports/check"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("POST", "/stage7/external-records"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("GET", "/stage7/external-records"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("POST", "/stage7/query-tank/resolve"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("POST", "/stage7/stage6/submit"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("GET", "/admin/stage7/alerts"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("POST", "/podcast-council/rooms"): [PODCAST_COUNCIL_E2E],
    ("GET", "/podcast-council/rooms"): [PODCAST_COUNCIL_E2E],
    ("GET", "/podcast-council/rooms/{room_id}"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/rooms/{room_id}/sessions"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/rooms/{room_id}/participants"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/rooms/{room_id}/call-for-experts"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/rooms/{room_id}/agent-invitations"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/sessions/{session_id}/turns"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/sessions/{session_id}/claims"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/claims/{claim_id}/evidence"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/claims/{claim_id}/reviews"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/claims/{claim_id}/route-stage7"): [PODCAST_COUNCIL_E2E],
    ("POST", "/podcast-council/claims/{claim_id}/submit-stage6"): [PODCAST_COUNCIL_E2E],
    ("GET", "/podcast-council/rooms/{room_id}/risk-alerts"): [PODCAST_COUNCIL_E2E],
    ("GET", "/podcast-council/audit-logs"): [PODCAST_COUNCIL_E2E],
    ("GET", "/dashboard/podcast-council/cards"): [PODCAST_COUNCIL_E2E],
    ("GET", "/dashboard/podcast-council/pages"): [PODCAST_COUNCIL_E2E],
    ("POST", "/newsrooms/sources"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/sources"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/sources/{source_id}"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/categories"): [NEWSROOMS_TEXT_SEO_E2E],
    ("GET", "/newsrooms/categories"): [NEWSROOMS_TEXT_SEO_E2E],
    ("POST", "/newsrooms/feeds"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/feeds"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/feeds/{feed_id}/ingest"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/articles"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/articles"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/articles/{article_id}"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/articles/{article_id}/normalize"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/articles/{article_id}/extract-claims"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/articles/{article_id}/seo-artifact"): [NEWSROOMS_TEXT_SEO_E2E],
    ("GET", "/newsrooms/articles/{article_id}/seo-artifact"): [NEWSROOMS_TEXT_SEO_E2E],
    ("POST", "/newsrooms/articles/{article_id}/originality-check"): [NEWSROOMS_TEXT_SEO_E2E],
    ("POST", "/newsrooms/claims"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/claims"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/claims/{claim_id}"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/claims/{claim_id}/evidence"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/claims/{claim_id}/route-stage7"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/claims/{claim_id}/submit-stage6"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/packages"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/packages"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/packages/{package_id}"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/packages/{package_id}/script"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/packages/{package_id}/text-article"): [NEWSROOMS_TEXT_SEO_E2E],
    ("POST", "/newsrooms/packages/{package_id}/live-blog-update"): [NEWSROOMS_TEXT_SEO_E2E],
    ("POST", "/newsrooms/packages/{package_id}/blog-post"): [NEWSROOMS_TEXT_SEO_E2E],
    ("POST", "/newsrooms/packages/{package_id}/news-to-debate"): [NEWSROOMS_COUNCIL_E2E],
    ("POST", "/newsrooms/corrections"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/risk-alerts"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/newsrooms/audit-logs"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/dashboard/newsrooms/cards"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/dashboard/newsrooms/pages"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/dashboard/newsrooms/risk-alerts"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/dashboard/newsrooms/audit-logs"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/dashboard/newsrooms/safety-boundaries"): [NEWSROOMS_COUNCIL_E2E],
    ("GET", "/dashboard/newsrooms/seo"): [NEWSROOMS_TEXT_SEO_E2E],
    ("GET", "/dashboard/newsrooms/originality"): [NEWSROOMS_TEXT_SEO_E2E],
    ("GET", "/api/dashboard/collapse-metrics"): [
        "tests/test_api.py::test_dashboard_collapse_alias_preserves_metrics_payload"
    ],
    ("GET", "/api/dashboard/collapse"): [
        "tests/test_api.py::test_dashboard_collapse_alias_preserves_metrics_payload"
    ],
    ("POST", "/agents/{agent_id}/collapse/evaluate"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("POST", "/agents/{agent_id}/collapse/events"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("GET", "/agents/{agent_id}/collapse/events"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("GET", "/agents/{agent_id}/collapse/state"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_persistence_restart.py::test_persistence_survives_engine_reinstantiation"],
    ("POST", "/agents/{agent_id}/collapse/restrictions"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("POST", "/agents/{agent_id}/collapse/recovery-plan"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("POST", "/agents/{agent_id}/collapse/review"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("POST", "/agents/{agent_id}/collapse/restore"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries", "tests/test_e2e_security_boundaries.py::test_security_and_no_bypass_boundaries"],
    ("GET", "/admin/agents/collapse/events"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("GET", "/admin/agents/collapse/alerts"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("GET", "/admin/agents/collapse/metrics"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("POST", "/admin/agents/collapse/{event_id}/route-stage6"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
    ("POST", "/admin/agents/collapse/{event_id}/route-truth-impact"): ["tests/test_100_percent_connection_wiring_e2e.py::test_100_percent_connection_wiring_all_routes_and_boundaries"],
}


@dataclass(frozen=True)
class RouteEntry:
    method: str
    path: str
    name: str
    module_owner: str
    criticality: str
    tested_by: list[str]
    status: str
    reason: str | None = None


def route_owner(path: str) -> str:
    if path == "/health":
        return "api_health"
    if path.startswith("/dashboard/newsrooms"):
        return "newsrooms_council_dashboard"
    if path.startswith("/newsrooms"):
        return "newsrooms_council"
    if path.startswith("/dashboard/podcast-council"):
        return "podcast_council_dashboard"
    if path.startswith("/podcast-council"):
        return "podcast_forum_debate_council"
    if path.startswith("/verify") or path.startswith("/graph") or path.startswith("/query-tank"):
        return "truth_pipeline"
    if path.startswith("/hard-mesh"):
        return "stage6_hard_mesh"
    if path.startswith("/council"):
        return "council_socket_fabric"
    if path.startswith("/topology"):
        return "ptee_topology"
    if path.startswith("/agents/action"):
        return "user_agent_micro_pyramid"
    if path.startswith("/signal") or path.startswith("/admin/signal"):
        return "signal_culture"
    if path.startswith("/archive"):
        return "archive_reuse_guard"
    if path.startswith("/stage7") or path.startswith("/admin/stage7"):
        return "stage7_candidate_memory"
    if "/collapse" in path:
        return "agent_collapse"
    return "unknown"


def route_criticality(path: str) -> str:
    if path in {"/health", "/admin/agents/collapse/metrics", "/admin/signal-load-reduction"}:
        return "P1"
    if path.startswith("/dashboard/newsrooms"):
        return "P1"
    if path.startswith("/dashboard/podcast-council"):
        return "P1"
    if path.startswith("/admin/agents/collapse") or path.startswith("/admin/stage7"):
        return "P1"
    return "P0"


def iter_public_routes() -> Iterable[tuple[str, str, str]]:
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path or path in EXCLUDED_PATHS or path.startswith("/static"):
            continue
        for method in sorted(getattr(route, "methods", set()) - EXCLUDED_METHODS):
            yield method, path, getattr(route, "name", "")


def build_route_matrix() -> list[RouteEntry]:
    rows: list[RouteEntry] = []
    for method, path, name in sorted(iter_public_routes(), key=lambda item: (item[1], item[0])):
        tests = TESTED_BY.get((method, path), [])
        status = "tested" if tests else "missing_test"
        reason = None if tests else "No E2E test registered for implemented public route."
        rows.append(
            RouteEntry(
                method=method,
                path=path,
                name=name,
                module_owner=route_owner(path),
                criticality=route_criticality(path),
                tested_by=tests,
                status=status,
                reason=reason,
            )
        )
    return rows


def write_route_artifacts(root: Path = Path(".")) -> dict[str, object]:
    artifact_dir = root / "artifacts" / "e2e"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    matrix = build_route_matrix()
    implemented = [
        {"method": row.method, "path": row.path, "name": row.name, "module_owner": row.module_owner}
        for row in matrix
    ]
    matrix_payload = [asdict(row) for row in matrix]
    missing = [row for row in matrix if row.status == "missing_test" and row.criticality in {"P0", "P1"}]
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "route_count_discovered": len(matrix),
        "route_count_tested": sum(1 for row in matrix if row.status == "tested"),
        "route_coverage_percentage": round(
            100.0 * sum(1 for row in matrix if row.status == "tested") / max(1, len(matrix)), 2
        ),
        "missing_p0_p1_routes": [asdict(row) for row in missing],
        "intentionally_excluded_routes": sorted(EXCLUDED_PATHS),
    }
    (artifact_dir / "implemented-routes.json").write_text(json.dumps(implemented, indent=2) + "\n")
    (artifact_dir / "route-coverage-matrix.json").write_text(json.dumps(matrix_payload, indent=2) + "\n")
    return summary


if __name__ == "__main__":
    print(json.dumps(write_route_artifacts(), indent=2))
