from scripts.discover_routes import build_route_matrix


def test_route_inventory_discovers_current_public_api_surface():
    matrix = build_route_matrix()
    assert len(matrix) >= 105
    paths = {(row.method, row.path) for row in matrix}
    assert ("POST", "/verify") in paths
    assert ("GET", "/graph/{answer_id}") in paths
    assert ("POST", "/admin/agents/collapse/{event_id}/route-stage6") in paths
    assert ("GET", "/newsrooms") in paths
    assert ("GET", "/dashboard/safety-invariants") in paths
    assert all(not row.path.startswith("/docs") for row in matrix)
