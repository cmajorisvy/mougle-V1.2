"""Preprocessing layer for HARD-MESH numeric feature matrices."""

from __future__ import annotations

import numpy as np
from sklearn.decomposition import PCA, TruncatedSVD
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.models import FeatureBundle


class Stage6Preprocessor:
    """Produces a scaled, optionally reduced numeric matrix for cluster lanes."""

    def transform(self, bundle: FeatureBundle) -> tuple[np.ndarray, list[str]]:
        warnings = list(bundle.warnings)
        matrix = np.asarray(bundle.matrix, dtype=float)
        if matrix.size == 0:
            warnings.append("empty feature matrix; using single zero row fallback")
            return np.zeros((1, max(1, len(bundle.feature_names))), dtype=float), warnings

        pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]
        )
        transformed = pipeline.fit_transform(matrix)

        sample_count, feature_count = transformed.shape
        if sample_count < 3 or feature_count < 3:
            warnings.append("dataset too small for dimensionality reduction; using scaled features")
            return transformed, warnings
        if np.all(np.nanstd(transformed, axis=0) < 1e-12):
            warnings.append("feature matrix has no variance; using scaled features")
            return transformed, warnings

        components = min(8, sample_count - 1, feature_count - 1)
        if components < 2:
            warnings.append("insufficient dimensions for reduction; using scaled features")
            return transformed, warnings

        try:
            reducer = TruncatedSVD(n_components=components, random_state=42)
            return reducer.fit_transform(transformed), warnings
        except Exception as exc:  # pragma: no cover - defensive fallback
            warnings.append(f"TruncatedSVD fallback to PCA: {exc}")
            try:
                reducer = PCA(n_components=components, random_state=42)
                return reducer.fit_transform(transformed), warnings
            except Exception as pca_exc:  # pragma: no cover - defensive fallback
                warnings.append(f"PCA skipped: {pca_exc}")
                return transformed, warnings
