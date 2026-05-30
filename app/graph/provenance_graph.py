"""Claim-evidence-source-time provenance graph utilities."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import networkx as nx

from app.models import ClaimVerificationRecord, HardMeshConsensusResult, VerdictLabel


class ProvenanceGraph:
    def __init__(self) -> None:
        self.graph = nx.MultiDiGraph()

    def add_verification_record(
        self,
        query_id: str,
        answer_id: str,
        claim_record: ClaimVerificationRecord,
    ) -> None:
        claim = claim_record.claim
        self.graph.add_node(query_id, node_type="query")
        self.graph.add_node(answer_id, node_type="answer")
        self.graph.add_node(
            claim.claim_id,
            node_type="claim",
            text=claim.text,
            verdict=claim_record.verdict.label.value,
        )
        self.graph.add_edge(answer_id, claim.claim_id, edge_type="answer_contains_claim")
        self.graph.add_edge(query_id, answer_id, edge_type="query_has_answer")

        for ev in claim_record.evidences:
            source_id = f"source:{ev.source.source_id}"
            evidence_id = ev.evidence_id
            self.graph.add_node(source_id, node_type="source", **ev.source.model_dump())
            self.graph.add_node(
                evidence_id,
                node_type="evidence",
                text=ev.text,
                timestamp=ev.timestamp.isoformat() if ev.timestamp else None,
                reliability=ev.source.reliability,
                retrieval_method=ev.retrieval_method,
            )
            self.graph.add_edge(evidence_id, source_id, edge_type="evidence_from_source")

            if claim_record.verdict.label in {
                VerdictLabel.refuted,
                VerdictLabel.source_conflict,
            }:
                edge_type = "claim_refuted_by"
            else:
                edge_type = "claim_supported_by"
            self.graph.add_edge(claim.claim_id, evidence_id, edge_type=edge_type)

            if ev.timestamp:
                t_node = f"timestamp:{ev.timestamp.isoformat()}"
                self.graph.add_node(t_node, node_type="timestamp", value=ev.timestamp.isoformat())
                self.graph.add_edge(claim.claim_id, t_node, edge_type="claim_temporally_depends_on")

        if claim_record.verdict.label == VerdictLabel.source_conflict:
            conflicting = [
                other
                for other, data in self.graph.nodes(data=True)
                if data.get("node_type") == "claim" and other != claim.claim_id
            ]
            for other_claim_id in conflicting:
                self.graph.add_edge(claim.claim_id, other_claim_id, edge_type="claim_conflicts_with")

    def add_hard_mesh_result(
        self,
        answer_id: str,
        claim_records: list[ClaimVerificationRecord],
        hard_mesh: HardMeshConsensusResult,
    ) -> None:
        hard_mesh_id = f"hard_mesh:{answer_id}"
        self.graph.add_node(
            hard_mesh_id,
            node_type="hard_mesh_run",
            omega=hard_mesh.omega,
            route=hard_mesh.route.value,
            route_reason=hard_mesh.route_reason,
        )
        self.graph.add_edge(answer_id, hard_mesh_id, edge_type="claim_flagged_by_hard_mesh")
        for record in claim_records:
            self.graph.add_edge(record.claim.claim_id, hard_mesh_id, edge_type="claim_flagged_by_hard_mesh")
            if hard_mesh.route.value == "query_tank_pending":
                self.graph.add_edge(record.claim.claim_id, hard_mesh_id, edge_type="evidence_routes_to_query_tank")

        evidence_ids = [e.evidence_id for record in claim_records for e in record.evidences]
        for index, evidence_id in enumerate(evidence_ids):
            for other_id in evidence_ids[index + 1 :]:
                self.graph.add_edge(evidence_id, other_id, edge_type="evidence_clustered_with")
                self.graph.add_edge(other_id, evidence_id, edge_type="evidence_clustered_with")

        for left in claim_records:
            for right in claim_records:
                if left.claim.claim_id != right.claim.claim_id:
                    self.graph.add_edge(
                        left.claim.claim_id,
                        right.claim.claim_id,
                        edge_type="claim_structurally_grouped_with",
                    )

    def get_claim_evidence(self, claim_id: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for _, ev_id, data in self.graph.out_edges(claim_id, data=True):
            if data.get("edge_type") not in {"claim_supported_by", "claim_refuted_by"}:
                continue
            out.append(
                {
                    "edge_type": data.get("edge_type"),
                    "evidence_id": ev_id,
                    "evidence": self.graph.nodes.get(ev_id, {}),
                }
            )
        return out

    def detect_contradictions(self, claim_id: str) -> bool:
        edges = [d.get("edge_type") for _, _, d in self.graph.out_edges(claim_id, data=True)]
        return "claim_supported_by" in edges and "claim_refuted_by" in edges

    def consistency_features(self) -> dict[str, float]:
        claim_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("node_type") == "claim"]
        if not claim_nodes:
            return {"contradiction_rate": 1.0, "coverage": 0.0, "graph_density": 0.0}

        contradictions = sum(1 for c in claim_nodes if self.detect_contradictions(c))
        covered = sum(1 for c in claim_nodes if self.get_claim_evidence(c))
        evidence_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("node_type") == "evidence"]
        source_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("node_type") == "source"]
        reliability_values = [
            float(d.get("reliability", 0.0))
            for _, d in self.graph.nodes(data=True)
            if d.get("node_type") == "source"
        ]
        support_count = sum(
            1 for _, _, d in self.graph.edges(data=True) if d.get("edge_type") == "claim_supported_by"
        )
        refutation_count = sum(
            1 for _, _, d in self.graph.edges(data=True) if d.get("edge_type") == "claim_refuted_by"
        )
        hard_mesh_nodes = [
            d for _, d in self.graph.nodes(data=True) if d.get("node_type") == "hard_mesh_run"
        ]
        return {
            "contradiction_rate": contradictions / len(claim_nodes),
            "coverage": covered / len(claim_nodes),
            "graph_density": nx.density(self.graph),
            "support_count": float(support_count),
            "refutation_count": float(refutation_count),
            "contradiction_pressure": contradictions / len(claim_nodes),
            "source_diversity": len(source_nodes) / max(1, len(evidence_nodes)),
            "source_reliability_aggregate": sum(reliability_values) / max(1, len(reliability_values)),
            "provenance_completeness": covered / len(claim_nodes),
            "freshness_indicator": 1.0,
            "macro_micro_disagreement_contribution": contradictions / len(claim_nodes),
            "stage6_structural_purity_score": float(hard_mesh_nodes[-1].get("omega", 0.0))
            if hard_mesh_nodes
            else 0.0,
        }

    def to_json(self) -> dict[str, Any]:
        return {
            "generated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            "nodes": [
                {"id": n, **d} for n, d in self.graph.nodes(data=True)
            ],
            "edges": [
                {"source": u, "target": v, **d}
                for u, v, d in self.graph.edges(data=True)
            ],
            "features": self.consistency_features(),
        }
