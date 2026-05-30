from datetime import datetime, timezone

from app.graph.provenance_graph import ProvenanceGraph
from app.models import (
    AtomicClaim,
    ClaimVerdict,
    ClaimVerificationRecord,
    EvidenceItem,
    EvidenceSource,
    VerdictLabel,
)


def _record(label: VerdictLabel):
    claim = AtomicClaim(claim_id="c1", answer_id="a1", text="X is true", span_start=0, span_end=9, sentence_index=0)
    ev = EvidenceItem(
        evidence_id="e1",
        source=EvidenceSource(source_id="s1", source_name="src", reliability=0.8),
        text="X is true",
        quote="X is true",
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    verdict = ClaimVerdict(claim_id="c1", label=label, confidence=0.8)
    return ClaimVerificationRecord(claim=claim, evidences=[ev], plugin_results=[], verdict=verdict)


def test_graph_add_and_export():
    g = ProvenanceGraph()
    g.add_verification_record("q1", "a1", _record(VerdictLabel.supported))
    js = g.to_json()
    assert js["nodes"]
    assert js["edges"]


def test_contradiction_detection():
    g = ProvenanceGraph()
    g.add_verification_record("q1", "a1", _record(VerdictLabel.supported))
    g.add_verification_record("q1", "a1", _record(VerdictLabel.refuted))
    assert g.detect_contradictions("c1") is True
