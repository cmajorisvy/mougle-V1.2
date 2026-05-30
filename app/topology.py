"""Persistent Topological Engine scaffold for graph-topology metrics."""

from __future__ import annotations

import hashlib
from typing import Iterable

import networkx as nx

from app.models import TopologicalEvolutionRecord, TopologySnapshot


def build_topology_snapshot(
    graph: nx.MultiDiGraph,
    previous: TopologySnapshot | None = None,
) -> TopologySnapshot:
    """Compute lightweight topology metrics without heavy topology dependencies."""
    undirected = nx.Graph(graph)
    node_count = undirected.number_of_nodes()
    edge_count = undirected.number_of_edges()
    components = [len(component) for component in nx.connected_components(undirected)] if node_count else []
    component_count = len(components)
    cycle_rank = max(0, edge_count - node_count + component_count)
    density = nx.density(undirected) if node_count > 1 else 0.0
    average_degree = (2 * edge_count / node_count) if node_count else 0.0
    clustering = nx.average_clustering(undirected) if node_count > 1 else 0.0
    stability = None
    drift = False
    if previous is not None:
        node_delta = abs(node_count - previous.node_count) / max(1, previous.node_count)
        edge_delta = abs(edge_count - previous.edge_count) / max(1, previous.edge_count)
        stability = max(0.0, min(1.0, 1.0 - ((node_delta + edge_delta) / 2.0)))
        drift = stability < 0.7
    snapshot_hash = hashlib.sha1(f"{node_count}:{edge_count}:{components}:{cycle_rank}".encode()).hexdigest()[:12]
    return TopologySnapshot(
        snapshot_id=f"topology_{snapshot_hash}",
        node_count=node_count,
        edge_count=edge_count,
        connected_components=component_count,
        component_sizes=sorted(components, reverse=True),
        cycle_rank=cycle_rank,
        graph_density=max(0.0, min(1.0, density)),
        average_degree=average_degree,
        clustering_coefficient=max(0.0, min(1.0, clustering)),
        stability_score=stability,
        topology_drift=drift,
    )


def build_topological_evolution_record(
    snapshot: TopologySnapshot,
    previous: TopologySnapshot | None = None,
    *,
    answer_id: str | None = None,
    event_refs: Iterable[str] = (),
    route_hint: str | None = None,
) -> TopologicalEvolutionRecord:
    """Create a versioned PTEE evolution record from topology snapshots.

    The prototype stores lightweight topology deltas only. Heavy persistent
    homology remains an optional future sidecar, so this function is safe for
    tests and local demos.
    """
    refs = list(event_refs)
    previous_id = previous.snapshot_id if previous else None
    version_body = f"{previous_id}:{snapshot.snapshot_id}:{refs}:{route_hint}"
    digest = hashlib.sha1(version_body.encode("utf-8")).hexdigest()[:12]
    return TopologicalEvolutionRecord(
        evolution_id=f"evolution_{digest}",
        state_version=f"ptee_v_{digest}",
        answer_id=answer_id,
        previous_snapshot_id=previous_id,
        current_snapshot_id=snapshot.snapshot_id,
        stability_score=snapshot.stability_score,
        topology_drift=snapshot.topology_drift,
        event_refs=refs,
        route_hint=route_hint,
    )
