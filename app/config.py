"""Configuration loader for truth scoring weights and gate thresholds."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import yaml


DEFAULT_CONFIG_PATH = Path("config/truth_weights.yaml")


def load_truth_config(path: Optional[Path] = None) -> dict[str, Any]:
    cfg_path = path or DEFAULT_CONFIG_PATH
    if not cfg_path.exists():
        return {
            "base_bias": 0.0,
            "weights": {},
            "pairwise": {},
            "lambda_graph": 0.2,
            "mu_contradiction": 0.5,
            "mu_uncertainty": 0.5,
            "mu_drift": 0.3,
            "publish": {
                "tvs_threshold": 70.0,
                "epsilon_disagreement": 0.25,
                "uncertainty_max": 0.45,
            },
        }
    text = cfg_path.read_text(encoding="utf-8")
    if cfg_path.suffix.lower() == ".json":
        return json.loads(text)
    return yaml.safe_load(text)
