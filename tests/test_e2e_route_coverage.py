import json
from pathlib import Path

from scripts.discover_routes import build_route_matrix, write_route_artifacts


def test_route_coverage_matrix_has_no_missing_p0_p1_routes():
    summary = write_route_artifacts()
    matrix = build_route_matrix()
    missing = [row for row in matrix if row.criticality in {"P0", "P1"} and row.status != "tested"]
    assert missing == []
    assert summary["route_count_discovered"] == len(matrix)
    assert summary["route_count_tested"] == len(matrix)

    matrix_path = Path("artifacts/e2e/route-coverage-matrix.json")
    routes_path = Path("artifacts/e2e/implemented-routes.json")
    assert matrix_path.exists()
    assert routes_path.exists()
    matrix_payload = json.loads(matrix_path.read_text())
    assert len(matrix_payload) == len(matrix)
    assert all(row["status"] == "tested" for row in matrix_payload if row["criticality"] in {"P0", "P1"})
