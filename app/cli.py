"""CLI for local verification runs."""

from __future__ import annotations

import json
from pathlib import Path

import typer

from app.engine import VerificationEngine
from app.models import CorpusItemInput, VerifyRequest


def main(
    query: str = typer.Option(..., "--query"),
    answer: str = typer.Option(..., "--answer"),
    corpus: Path = typer.Option(..., "--corpus"),
) -> None:
    corpus_data = json.loads(corpus.read_text(encoding="utf-8"))
    corpus_items = [CorpusItemInput(**item) for item in corpus_data]
    engine = VerificationEngine()
    result = engine.verify(VerifyRequest(query=query, answer=answer, corpus=corpus_items))

    typer.echo(f"Final verdict: {result.final_verdict.value}")
    typer.echo(f"TVS: {result.truth_metrics.tvs}")
    typer.echo(f"TMI: {result.truth_metrics.tmi}")
    typer.echo(f"Publish: {result.publish_decision.publish}")
    typer.echo("Claim verdicts:")
    for claim in result.claim_records:
        typer.echo(f"- {claim.claim.claim_id}: {claim.verdict.label.value} ({claim.verdict.confidence:.2f})")
    if result.publish_decision.unresolved_reason:
        typer.echo(f"Unresolved reason: {result.publish_decision.unresolved_reason}")


def cli() -> None:
    typer.run(main)


if __name__ == "__main__":
    cli()
