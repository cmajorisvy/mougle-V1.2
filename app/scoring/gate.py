"""Publish or abstain gating logic."""

from __future__ import annotations

from app.models import ClaimVerificationRecord, PublishDecision, VerdictLabel


HARD_BLOCKERS = {
    VerdictLabel.out_of_domain,
    VerdictLabel.source_conflict,
    VerdictLabel.pending_human_review,
}


def publish_gate(
    tvs: float,
    macro_micro_disagreement: float,
    mean_uncertainty: float,
    claims: list[ClaimVerificationRecord],
    cfg: dict,
) -> PublishDecision:
    publish_cfg = cfg.get("publish", {})
    threshold = float(publish_cfg.get("tvs_threshold", 70.0))
    epsilon = float(publish_cfg.get("epsilon_disagreement", 0.25))
    u_max = float(publish_cfg.get("uncertainty_max", 0.45))

    labels = {c.verdict.label for c in claims}

    if VerdictLabel.stale in labels:
        return PublishDecision(publish=False, unresolved_reason="stale knowledge")
    if VerdictLabel.out_of_domain in labels:
        return PublishDecision(publish=False, unresolved_reason="out of domain")
    if VerdictLabel.source_conflict in labels:
        return PublishDecision(publish=False, unresolved_reason="source conflict")
    if labels & HARD_BLOCKERS:
        return PublishDecision(publish=False, unresolved_reason="human review required")
    if tvs < threshold:
        return PublishDecision(publish=False, unresolved_reason="insufficient evidence")
    if macro_micro_disagreement > epsilon:
        return PublishDecision(publish=False, unresolved_reason="source conflict")
    if mean_uncertainty > u_max:
        return PublishDecision(publish=False, unresolved_reason="human review required")

    return PublishDecision(publish=True, unresolved_reason=None)
