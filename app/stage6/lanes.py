"""Cluster lane adapters for Stage 6 HARD-MESH verification."""

from __future__ import annotations

import numpy as np
from sklearn.cluster import OPTICS, AgglomerativeClustering, Birch, MiniBatchKMeans, SpectralClustering
from sklearn.metrics import pairwise_distances
from sklearn.neighbors import kneighbors_graph

from app.models import ClusterLaneResult
from app.stage6.utils import clip01, unique_cluster_count

try:  # scikit-learn >= 1.3
    from sklearn.cluster import HDBSCAN as SklearnHDBSCAN
except Exception:  # pragma: no cover - depends on installed sklearn
    SklearnHDBSCAN = None


def _skip(name: str, reason: str, n_samples: int) -> ClusterLaneResult:
    return ClusterLaneResult(
        lane_name=name,
        labels=[0] * max(0, n_samples),
        skipped=True,
        warnings=[reason],
        details={"reason": reason},
    )


class BirchLane:
    name = "birch"

    def run(self, matrix: np.ndarray, cfg: dict) -> ClusterLaneResult:
        n_samples = len(matrix)
        if n_samples < 2:
            return _skip(self.name, "BIRCH skipped: fewer than 2 samples", n_samples)
        params = cfg.get("algorithms", {}).get("birch", {})
        try:
            model = Birch(
                threshold=float(params.get("threshold", 0.5)),
                branching_factor=int(params.get("branching_factor", 50)),
                n_clusters=None,
            )
            labels = model.fit_predict(matrix).tolist()
            subcluster_count = int(getattr(model, "subcluster_centers_", np.empty((0,))).shape[0])
            stability = clip01(1.0 - (subcluster_count / max(1, n_samples * 2)))
            return ClusterLaneResult(
                lane_name=self.name,
                labels=labels,
                confidence=stability,
                score=stability,
                details={"subcluster_count": subcluster_count},
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            return _skip(self.name, f"BIRCH unavailable: {exc}", n_samples)


class MiniBatchKMeansLane:
    name = "mini_batch_kmeans"

    def run(self, matrix: np.ndarray, cfg: dict) -> ClusterLaneResult:
        n_samples = len(matrix)
        if n_samples < 3:
            return _skip(self.name, "MiniBatchKMeans skipped: fewer than 3 samples", n_samples)
        params = cfg.get("algorithms", {}).get("mini_batch_kmeans", {})
        k_default = int(params.get("n_clusters_default", 8))
        n_clusters = max(2, min(k_default, n_samples - 1))
        try:
            model = MiniBatchKMeans(
                n_clusters=n_clusters,
                batch_size=int(params.get("batch_size", 1024)),
                random_state=42,
                n_init="auto",
            )
            labels = model.fit_predict(matrix).tolist()
            distances = pairwise_distances(matrix, model.cluster_centers_)
            sorted_distances = np.sort(distances, axis=1)
            margins = (sorted_distances[:, 1] - sorted_distances[:, 0]) / (
                sorted_distances[:, 1] + 1e-9
            )
            confidence = clip01(float(np.mean(margins)))
            compactness = clip01(1.0 / (1.0 + float(model.inertia_) / max(1, n_samples)))
            score = clip01((confidence + compactness) / 2.0)
            return ClusterLaneResult(
                lane_name=self.name,
                labels=labels,
                confidence=confidence,
                score=score,
                details={"inertia": float(model.inertia_), "n_clusters": n_clusters},
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            return _skip(self.name, f"MiniBatchKMeans unavailable: {exc}", n_samples)


class HdbscanLane:
    name = "hdbscan"

    def run(self, matrix: np.ndarray, cfg: dict) -> ClusterLaneResult:
        n_samples = len(matrix)
        params = cfg.get("algorithms", {}).get("hdbscan", {})
        min_cluster_size = int(params.get("min_cluster_size", 5))
        min_samples = int(params.get("min_samples", 5))
        if SklearnHDBSCAN is None:
            return _skip(self.name, "HDBSCAN unavailable in installed scikit-learn", n_samples)
        if n_samples < max(3, min_cluster_size):
            return _skip(self.name, "HDBSCAN skipped: dataset below min_cluster_size", n_samples)
        try:
            model = SklearnHDBSCAN(
                min_cluster_size=min(min_cluster_size, n_samples),
                min_samples=min(min_samples, n_samples),
            )
            labels = model.fit_predict(matrix).tolist()
            probabilities = getattr(model, "probabilities_", None)
            membership = float(np.mean(probabilities)) if probabilities is not None else 0.5
            noise_fraction = labels.count(-1) / max(1, n_samples)
            score = clip01(membership * (1.0 - noise_fraction))
            return ClusterLaneResult(
                lane_name=self.name,
                labels=labels,
                confidence=clip01(membership),
                score=score,
                details={
                    "cluster_count": unique_cluster_count(labels),
                    "noise_fraction": noise_fraction,
                    "membership_strength": membership,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            return _skip(self.name, f"HDBSCAN unavailable: {exc}", n_samples)


class OpticsLane:
    name = "optics"

    def run(self, matrix: np.ndarray, cfg: dict) -> ClusterLaneResult:
        n_samples = len(matrix)
        params = cfg.get("algorithms", {}).get("optics", {})
        min_samples = int(params.get("min_samples", 5))
        if n_samples < max(3, min_samples):
            return _skip(self.name, "OPTICS skipped: dataset below min_samples", n_samples)
        try:
            model = OPTICS(min_samples=min(min_samples, n_samples), xi=float(params.get("xi", 0.05)))
            labels = model.fit_predict(matrix).tolist()
            finite_reachability = model.reachability_[np.isfinite(model.reachability_)]
            reachability = float(np.mean(finite_reachability)) if finite_reachability.size else 1.0
            noise_fraction = labels.count(-1) / max(1, n_samples)
            score = clip01((1.0 / (1.0 + reachability)) * (1.0 - noise_fraction))
            return ClusterLaneResult(
                lane_name=self.name,
                labels=labels,
                confidence=score,
                score=score,
                details={"noise_fraction": noise_fraction, "ordering_length": len(model.ordering_)},
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            return _skip(self.name, f"OPTICS unavailable: {exc}", n_samples)


class SpectralLane:
    name = "spectral"

    def run(self, matrix: np.ndarray, cfg: dict) -> ClusterLaneResult:
        n_samples = len(matrix)
        if n_samples < 3:
            return _skip(self.name, "SpectralClustering skipped: fewer than 3 samples", n_samples)
        params = cfg.get("algorithms", {}).get("spectral", {})
        n_neighbors = max(1, min(int(params.get("n_neighbors", 5)), n_samples - 1))
        n_clusters = max(2, min(3, n_samples - 1))
        try:
            graph = kneighbors_graph(matrix, n_neighbors=n_neighbors, mode="connectivity", include_self=True)
            affinity = 0.5 * (graph + graph.T)
            model = SpectralClustering(
                n_clusters=n_clusters,
                affinity="precomputed",
                assign_labels="cluster_qr",
                random_state=42,
            )
            labels = model.fit_predict(affinity).tolist()
            cluster_balance = unique_cluster_count(labels) / max(1, n_clusters)
            return ClusterLaneResult(
                lane_name=self.name,
                labels=labels,
                confidence=clip01(cluster_balance),
                score=clip01(cluster_balance),
                details={"n_neighbors": n_neighbors, "n_clusters": n_clusters},
            )
        except Exception as exc:  # pragma: no cover - fallback for old sklearn options
            try:
                model = SpectralClustering(n_clusters=n_clusters, random_state=42)
                labels = model.fit_predict(matrix).tolist()
                score = clip01(unique_cluster_count(labels) / max(1, n_clusters))
                return ClusterLaneResult(
                    lane_name=self.name,
                    labels=labels,
                    confidence=score,
                    score=score,
                    warnings=[f"precomputed spectral fallback used: {exc}"],
                )
            except Exception as fallback_exc:  # pragma: no cover
                return _skip(self.name, f"SpectralClustering unavailable: {fallback_exc}", n_samples)


class AgglomerativeLane:
    name = "agglomerative"

    def run(self, matrix: np.ndarray, cfg: dict) -> ClusterLaneResult:
        n_samples = len(matrix)
        if n_samples < 3:
            return _skip(self.name, "AgglomerativeClustering skipped: fewer than 3 samples", n_samples)
        params = cfg.get("algorithms", {}).get("agglomerative", {})
        n_neighbors = max(1, min(int(params.get("n_neighbors", 5)), n_samples - 1))
        n_clusters = max(2, min(3, n_samples - 1))
        try:
            connectivity = kneighbors_graph(matrix, n_neighbors=n_neighbors, include_self=False)
            model = AgglomerativeClustering(
                n_clusters=n_clusters,
                linkage="ward",
                connectivity=connectivity,
                compute_distances=True,
            )
            labels = model.fit_predict(matrix).tolist()
            distances = getattr(model, "distances_", np.asarray([1.0]))
            distance_score = clip01(1.0 / (1.0 + float(np.mean(distances))))
            return ClusterLaneResult(
                lane_name=self.name,
                labels=labels,
                confidence=distance_score,
                score=distance_score,
                details={"n_neighbors": n_neighbors, "n_clusters": n_clusters},
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            return _skip(self.name, f"AgglomerativeClustering unavailable: {exc}", n_samples)

