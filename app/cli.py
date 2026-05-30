"""CLI for local verification runs."""

from __future__ import annotations

import json as jsonlib
from pathlib import Path

import typer

from app.engine import VerificationEngine
from app.models import CorpusItemInput, VerifyRequest


def main(
    query: str = typer.Option(..., "--query"),
    answer: str = typer.Option(..., "--answer"),
    corpus: Path = typer.Option(..., "--corpus"),
    enable_hard_mesh: bool = typer.Option(True, "--enable-hard-mesh/--disable-hard-mesh"),
    show_claims: bool = typer.Option(False, "--show-claims"),
    show_graph_summary: bool = typer.Option(False, "--show-graph-summary"),
    json_output: bool = typer.Option(False, "--json"),
    verbose: bool = typer.Option(False, "--verbose"),
) -> None:
    corpus_data = jsonlib.loads(corpus.read_text(encoding="utf-8"))
    corpus_items = [CorpusItemInput(**item) for item in corpus_data]
    engine = VerificationEngine()
    result = engine.verify(
        VerifyRequest(
            query=query,
            answer=answer,
            corpus=corpus_items,
            options={"enable_hard_mesh": enable_hard_mesh},
        )
    )

    if json_output:
        typer.echo(result.model_dump_json(indent=2))
        return

    typer.echo(f"Final verdict: {result.final_verdict.value}")
    typer.echo(f"TVS: {result.truth_metrics.tvs}")
    typer.echo(f"TMI: {result.truth_metrics.tmi}")
    typer.echo(f"Publish: {result.publish_decision.publish}")
    if result.publish_decision.unresolved_reason:
        typer.echo(f"Unresolved reason: {result.publish_decision.unresolved_reason}")
    if result.hard_mesh:
        typer.echo(f"Stage 6 Omega: {result.hard_mesh.omega}")
        typer.echo(f"Stage 6 route: {result.hard_mesh.route.value}")
        typer.echo(f"Stage 6 route reason: {result.hard_mesh.route_reason}")
        if verbose and result.hard_mesh.lane_warnings:
            typer.echo("Stage 6 warnings:")
            for warning in result.hard_mesh.lane_warnings:
                typer.echo(f"- {warning}")
    if show_claims or verbose:
        typer.echo("Claim verdicts:")
        for claim in result.claim_records:
            typer.echo(
                f"- {claim.claim.claim_id}: {claim.verdict.label.value} "
                f"({claim.verdict.confidence:.2f})"
            )
    if show_graph_summary:
        graph = engine.get_graph(result.answer.answer_id) or {"nodes": [], "edges": []}
        typer.echo(f"Graph nodes: {len(graph.get('nodes', []))}")
        typer.echo(f"Graph edges: {len(graph.get('edges', []))}")


def cli() -> None:
    typer.run(main)


if __name__ == "__main__":
    cli()
