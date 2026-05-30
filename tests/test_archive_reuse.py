import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import app
from app.archive_reuse import (
    build_archive_reuse_matrix,
    check_runtime_archive_imports,
    export_reuse_matrix,
)
from app.models import ArchiveIntegrationLayer, ArchiveReuseClassification

client = TestClient(app)


def _write_manifest(root: Path, reuse_rows: list[dict], secret_rows: list[dict]) -> None:
    manifests = root / "manifests"
    manifests.mkdir(parents=True)
    (manifests / "reuse-candidates.json").write_text(json.dumps(reuse_rows), encoding="utf-8")
    (manifests / "file-manifest.json").write_text(
        json.dumps(
            [
                {
                    "originalPath": row["originalPath"],
                    "archivedPath": row["archivedPath"],
                    "secretRisk": "none",
                }
                for row in reuse_rows
            ]
        ),
        encoding="utf-8",
    )
    (manifests / "secret-findings.redacted.json").write_text(
        json.dumps(secret_rows), encoding="utf-8"
    )


def test_archive_reuse_matrix_blocks_p0_and_maps_micro_pyramid(tmp_path: Path):
    root = tmp_path / "archive" / "legacy-codebase" / "20990101-0101"
    _write_manifest(
        root,
        [
            {
                "originalPath": "server/services/agent-risk-service.ts",
                "archivedPath": "archive/legacy-codebase/20990101-0101/source/server/services/agent-risk-service.ts",
                "classification": "adapt_candidate",
                "reasonForMatch": "agent-service / backend-source / exports:2",
                "dependencies": ["drizzle-orm"],
                "securityConcerns": [],
                "architectureConcerns": [],
                "requiredAdaptation": "wrap behind micro-pyramid readiness adapter",
                "recommendedAction": "adapt through wrapper",
            },
            {
                "originalPath": "tests/openai-audience-moderator.test.ts",
                "archivedPath": "archive/legacy-codebase/20990101-0101/source/tests/openai-audience-moderator.test.ts",
                "classification": "adapt_candidate",
                "reasonForMatch": "test-source / exports:1",
                "dependencies": [],
                "securityConcerns": [],
                "architectureConcerns": [],
            },
        ],
        [
            {
                "filePath": "tests/openai-audience-moderator.test.ts",
                "lineNumber": 10,
                "secretType": "OPENAI_API_KEY",
                "redactedPreview": "sk...[REDACTED]...",
                "riskLevel": "P0",
            }
        ],
    )

    matrix = build_archive_reuse_matrix(root)

    assert matrix.files_scanned == 2
    blocked = [c for c in matrix.candidates if c.blocked]
    assert len(blocked) == 1
    assert blocked[0].classification == ArchiveReuseClassification.blocked_secret_risk
    selected = [c for c in matrix.candidates if not c.blocked][0]
    assert selected.target_layer == ArchiveIntegrationLayer.stage5_micro_pyramid
    assert selected.micro_pyramid_band is not None
    assert selected.compatibility_score >= 0.55


def test_archive_reuse_matrix_export_writes_json_and_csv(tmp_path: Path):
    root = tmp_path / "archive" / "legacy-codebase" / "20990101-0202"
    _write_manifest(
        root,
        [
            {
                "originalPath": "server/services/signal-router.ts",
                "archivedPath": "archive/legacy-codebase/20990101-0202/source/server/services/signal-router.ts",
                "classification": "adapt_candidate",
                "reasonForMatch": "signal-routing / exports:1",
                "dependencies": ["events"],
            }
        ],
        [],
    )
    matrix = build_archive_reuse_matrix(root)
    json_path = tmp_path / "reuse-matrix.json"
    csv_path = tmp_path / "reuse-matrix.csv"

    export_reuse_matrix(matrix, json_path, csv_path)

    assert json_path.exists()
    assert csv_path.exists()
    assert "signal-router" in csv_path.read_text(encoding="utf-8")


def test_runtime_archive_import_check_detects_direct_import(tmp_path: Path):
    app_dir = tmp_path / "app"
    app_dir.mkdir()
    (app_dir / "bad.py").write_text("from archive.legacy_codebase import unsafe\n", encoding="utf-8")

    check = check_runtime_archive_imports(tmp_path)

    assert check.passed is False
    assert check.violation_count == 1
    assert "archived-source imports" in check.violations[0].reason


def test_archive_reuse_api_connection_and_wiring():
    candidates_resp = client.get("/archive/micro-pyramid/candidates?limit=25")
    assert candidates_resp.status_code == 200
    data = candidates_resp.json()
    assert data["archive_timestamp"] == "20260529-1150"
    assert data["files_scanned"] >= 1000
    assert len(data["candidates"]) <= 25
    assert "stage5_micro_pyramid" in data["target_layer_summary"] or data["candidates"]

    import_check_resp = client.get("/archive/runtime-imports/check")
    assert import_check_resp.status_code == 200
    import_check = import_check_resp.json()
    assert import_check["passed"] is True
    assert import_check["violation_count"] == 0
