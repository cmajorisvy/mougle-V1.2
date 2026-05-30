# Verified Truth Pyramid Prototype

Implementation-ready prototype of a high-reliability verification architecture where atomic claims are verified against evidence and scored with modular plugins.

## Architecture Overview

Computation is bottom-up:

1. Ingestion (`query`, `answer`, `corpus`)
2. Claim decomposition (atomic claims)
3. Evidence retrieval (claim-local)
4. Claim-evidence-source-time graph propagation
5. Plugin scoring + modular truth functional
6. TVS (0-100) + TMI (0-1)
7. Publish/abstain gate

External AI judges are modeled as weighted judges, not oracles.

## Stack

- Python 3.11+
- FastAPI + Pydantic
- NetworkX provenance graph
- scikit-learn calibration adapter
- SQLite persistence
- pytest tests

## Setup

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

## Run API

```bash
uvicorn app.api:app --reload
```

### Health

`GET /health`

### Verify

`POST /verify`

Example payload:

```json
{
  "query": "What is the capital of France?",
  "answer": "Paris is the capital of France.",
  "corpus": [
    {
      "source_id": "s1",
      "source_name": "encyclopedia",
      "text": "Paris is the capital city of France.",
      "timestamp": "2026-01-01T00:00:00",
      "reliability": 0.95
    }
  ]
}
```

Example response (shape):

```json
{
  "answer_id": "ans_...",
  "tvs": 87.42,
  "tmi": 0.73,
  "publish": true,
  "verdict": "supported",
  "claims": [],
  "macro_micro": {},
  "provenance": {},
  "unresolved_reason": null
}
```

### Graph

`GET /graph/{answer_id}` returns claim-evidence-source-time graph JSON.

## CLI

```bash
verify-truth --query "What is the capital of France?" --answer "Paris is the capital of France." --corpus ./corpus.json
```

CLI prints final verdict, TVS, TMI, publish decision, claim verdicts, and unresolved reason if abstained.

## Tests

```bash
pytest
```

## TVS vs TMI

- **TVS**: answer-level calibrated truth score in `[0,100]` from modular claim/evidence scoring.
- **TMI**: system-level maturity score in `[0,1]` from calibration, drift, OOD, and coverage quality terms.

## Safety Behavior

- No fabricated evidence.
- Missing, stale, contradictory, or out-of-domain evidence drives abstention.
- External judges are stubs and never treated as oracles.
- No real external API calls are made.
- Identity calibration is the prototype default until fitted calibration data exists.
