import os
from datetime import datetime, timezone

os.environ.setdefault("LOKY_MAX_CPU_COUNT", "2")

from app.config import load_truth_config
from app.engine import VerificationEngine
from app.models import CorpusItemInput, QueryTankItem, StageRoute, VerifyRequest
from app.stage6.feature_builder import Stage6FeatureBuilder
from app.stage6.lanes import (
    AgglomerativeLane,
    BirchLane,
    HdbscanLane,
    MiniBatchKMeansLane,
    OpticsLane,
    SpectralLane,
)
from app.stage6.metrics import compute_agreement_metrics, compute_validation_metrics
from app.stage6.ml_bus import ClassicalMLVerificationBus
from app.stage6.pipeline import HardMeshPipeline
from app.stage6.preprocessing import Stage6Preprocessor


def _record_set():
    corpus = [
        CorpusItemInput(
            source_id="s1",
            source_name="encyclopedia",
            text="Paris is the capital city of France.",
            timestamp=datetime(2026, 1, 1),
            reliability=0.95,
        ),
        CorpusItemInput(
            source_id="s2",
            source_name="atlas",
            text="France has Paris as its capital.",
            timestamp=datetime(2026, 1, 1),
            reliability=0.9,
        ),
    ]
    engine = VerificationEngine(db_path=":memory:")
    result = engine.verify(
        VerifyRequest(query="What is the capital of France?", answer="Paris is the capital of France.", corpus=corpus)
    )
    return result.claim_records, result.hard_mesh


def test_feature_builder_creates_numeric_features_and_metadata():
    records, _ = _record_set()
    bundle = Stage6FeatureBuilder().build(records, {"coverage": 1.0}, datetime.now(timezone.utc).replace(tzinfo=None))
    assert bundle.matrix
    assert bundle.feature_names
    assert bundle.row_metadata[0].claim_id == records[0].claim.claim_id


def test_preprocessing_handles_missing_values():
    records, _ = _record_set()
    bundle = Stage6FeatureBuilder().build(records * 2, {"coverage": 1.0}, datetime.now(timezone.utc).replace(tzinfo=None))
    bundle.matrix[0][0] = float("nan")
    bundle.matrix[1][0] = 0.8
    matrix, warnings = Stage6Preprocessor().transform(bundle)
    assert matrix.shape[0] >= 1
    assert isinstance(warnings, list)


def test_stage6_tiny_dataset_does_not_crash():
    records, _ = _record_set()
    cfg = load_truth_config()
    engine = VerificationEngine(db_path=":memory:")
    query = engine.verify(
        VerifyRequest(query="q", answer="Paris is the capital of France.", corpus=[])
    ).query
    answer = engine.verify(VerifyRequest(query="q2", answer="Paris is the capital of France.", corpus=[])).answer
    result, bundle, run = HardMeshPipeline(cfg).run(query, answer, records[:1], {"coverage": 1.0}, datetime.now(timezone.utc).replace(tzinfo=None))
    assert 0.0 <= result.omega <= 1.0
    assert bundle.matrix
    assert run.lane_results


def test_cluster_lanes_return_bounded_or_skip():
    records, _ = _record_set()
    cfg = load_truth_config()["hard_mesh"]
    bundle = Stage6FeatureBuilder().build(records * 3, {"coverage": 1.0}, datetime.now(timezone.utc).replace(tzinfo=None))
    matrix, _ = Stage6Preprocessor().transform(bundle)
    lanes = [BirchLane(), MiniBatchKMeansLane(), HdbscanLane(), OpticsLane(), SpectralLane(), AgglomerativeLane()]
    for lane in lanes:
        result = lane.run(matrix, cfg)
        assert 0.0 <= result.score <= 1.0
        assert 0.0 <= result.confidence <= 1.0
        assert len(result.labels) == len(matrix)


def test_validation_and_agreement_metrics_are_structured():
    records, _ = _record_set()
    cfg = load_truth_config()["hard_mesh"]
    bundle = Stage6FeatureBuilder().build(records * 3, {"coverage": 1.0}, datetime.now(timezone.utc).replace(tzinfo=None))
    matrix, _ = Stage6Preprocessor().transform(bundle)
    lanes = [MiniBatchKMeansLane().run(matrix, cfg), AgglomerativeLane().run(matrix, cfg)]
    validation = compute_validation_metrics(matrix, lanes)
    agreement = compute_agreement_metrics(lanes)
    assert isinstance(validation.raw_metrics, dict)
    assert isinstance(agreement.raw_metrics, dict)


def test_classical_ml_bus_returns_bounded_structural_signals():
    records, _ = _record_set()
    cfg = load_truth_config()["hard_mesh"]
    bundle = Stage6FeatureBuilder().build(records * 4, {"coverage": 1.0}, datetime.now(timezone.utc).replace(tzinfo=None))
    matrix, _ = Stage6Preprocessor().transform(bundle)
    result = ClassicalMLVerificationBus().run(matrix, cfg)
    assert 0.0 <= result.anomaly_score <= 1.0
    assert 0.0 <= result.novelty_score <= 1.0
    assert 0.0 <= result.ensemble_score <= 1.0
    assert "supported_future_estimators" in result.details


def test_hard_mesh_routes_and_query_tank_persistence():
    engine = VerificationEngine(db_path=":memory:")
    result = engine.verify(
        VerifyRequest(query="What is the capital of France?", answer="Paris is the capital of France.", corpus=[])
    )
    assert result.hard_mesh is not None
    assert result.hard_mesh.route == StageRoute.query_tank_pending
    assert result.hard_mesh.classical_ml is not None
    tank = engine.list_query_tank()
    assert tank
    item = QueryTankItem(**tank[0])
    assert item.status == "open"


def test_tvs_tmi_separation_with_evidence_changes():
    engine = VerificationEngine(db_path=":memory:")
    empty = engine.verify(
        VerifyRequest(query="What is the capital of France?", answer="Paris is the capital of France.", corpus=[])
    )
    supported = engine.verify(
        VerifyRequest(
            query="What is the capital of France?",
            answer="Paris is the capital of France.",
            corpus=[
                CorpusItemInput(
                    source_id="s1",
                    source_name="encyclopedia",
                    text="Paris is the capital city of France.",
                    timestamp=datetime(2026, 1, 1),
                    reliability=0.95,
                )
            ],
        )
    )
    assert 0.0 <= empty.truth_metrics.tvs <= 100.0
    assert 0.0 <= supported.truth_metrics.tmi <= 1.0
    assert supported.truth_metrics.tvs > empty.truth_metrics.tvs
