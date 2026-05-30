"""Claim-evidence-source-time provenance graph utilities."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import networkx as nx

from app.models import ClaimVerificationRecord, VerdictLabel


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
        return {
            "contradiction_rate": contradictions / len(claim_nodes),
            "coverage": covered / len(claim_nodes),
            "graph_density": nx.density(self.graph),
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
