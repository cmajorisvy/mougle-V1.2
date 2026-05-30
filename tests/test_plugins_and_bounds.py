from datetime import datetime, timezone

from app.claims.decomposer import decompose_answer_to_claims
from app.models import CorpusItemInput, Query
from app.plugins.base import PluginContext
from app.plugins.implementations import (
    ExternalJudgePlugin,
    MacroConsistencyPlugin,
    MicroEvidencePlugin,
    NumericConsistencyPlugin,
    ProvenanceCompletenessPlugin,
    RetrievalSupportPlugin,
    SourceReliabilityPlugin,
    TemporalFreshnessPlugin,
)
from app.retrieval.mock import InMemoryRetriever


def test_plugin_bounds():
    corpus = [
        CorpusItemInput(
            source_id="s1",
            source_name="doc",
            text="The value is 42 and Paris is in France.",
            reliability=0.8,
            timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
            url_or_path="https://example.com",
        )
    ]
    query = Query(query_id="q", text="value and city")
    claim = decompose_answer_to_claims("a", "The value is 42.")[0]
    retriever = InMemoryRetriever(corpus)
    evidences = retriever.retrieve(query, claim)
    ctx = PluginContext(
        query=query,
        claim=claim,
        evidences=evidences,
        all_claims=[claim],
        all_claim_evidence={claim.claim_id: evidences},
        now=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    plugins = [
        SourceReliabilityPlugin(),
        ProvenanceCompletenessPlugin(),
        RetrievalSupportPlugin(),
        TemporalFreshnessPlugin(),
        NumericConsistencyPlugin(),
        MacroConsistencyPlugin(),
        MicroEvidencePlugin(),
        ExternalJudgePlugin(),
    ]
    for p in plugins:
        r = p.evaluate(ctx)
        assert 0.0 <= r.score <= 1.0
        assert 0.0 <= r.uncertainty <= 1.0
