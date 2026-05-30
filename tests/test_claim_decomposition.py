from app.claims.decomposer import decompose_answer_to_claims


def test_claim_decomposition_stable_and_spans():
    text = "Paris is the capital of France. It has about 2 million people."
    claims1 = decompose_answer_to_claims("ans_1", text)
    claims2 = decompose_answer_to_claims("ans_1", text)
    assert len(claims1) == 2
    assert [c.claim_id for c in claims1] == [c.claim_id for c in claims2]
    assert claims1[0].span_start == 0
    assert claims1[0].span_end > claims1[0].span_start
