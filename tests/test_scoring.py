from app.scoring.gate import publish_gate
from app.scoring.tmi import compute_tmi
from app.scoring.truth_functional import ScoreInputs, compute_tvs


def test_tvs_computation_bounds():
    tvs = compute_tvs(
        ScoreInputs(
            plugin_scores={"a": 0.9, "b": 0.7},
            plugin_uncertainties={"a": 0.1, "b": 0.2},
            graph_features={"coverage": 1.0, "contradiction_rate": 0.0},
            contradiction_penalty=0.0,
            drift_or_staleness_penalty=0.1,
        ),
        {"weights": {"a": 1.0, "b": 1.0}, "publish": {}},
    )
    assert 0.0 <= tvs <= 100.0


def test_tmi_clipping_and_sensitivity():
    tmi_high = compute_tmi(brier_loss=0.01, cal_loss=0.01, ood_loss=0.01, drift_loss=0.01, coverage=1.0)
    tmi_low = compute_tmi(brier_loss=10.0, cal_loss=10.0, ood_loss=10.0, drift_loss=10.0, coverage=0.0)
    assert 0.0 <= tmi_low <= 1.0
    assert 0.0 <= tmi_high <= 1.0
    assert tmi_high > tmi_low


def test_publish_gate_abstains_on_low_tvs():
    decision = publish_gate(20.0, 0.0, 0.1, [], {"publish": {"tvs_threshold": 65.0}})
    assert decision.publish is False
    assert decision.unresolved_reason == "insufficient evidence"
