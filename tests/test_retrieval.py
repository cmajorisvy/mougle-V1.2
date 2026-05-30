from app.models import CorpusItemInput, Query
from app.retrieval.mock import InMemoryRetriever
from app.claims.decomposer import decompose_answer_to_claims


def test_in_memory_retriever_returns_evidence():
    corpus = [
        CorpusItemInput(source_id="s1", source_name="encyclopedia", text="Paris is the capital city of France", reliability=0.9),
        CorpusItemInput(source_id="s2", source_name="blog", text="Cats are cute", reliability=0.2),
    ]
    query = Query(query_id="q1", text="What is the capital of France?")
    claim = decompose_answer_to_claims("a1", "Paris is the capital of France.")[0]
    retriever = InMemoryRetriever(corpus)
    out = retriever.retrieve(query, claim)
    assert len(out) >= 1
    assert out[0].source.source_id == "s1"
