"""Service de segmentation et de clustering des clients.

Ce module fournit une fonction pour calculer des clusters de clients à
l'aide d'une implémentation simplifiée de l'algorithme K‑means. Les
clusters sont stockés dans le champ ``Client.cluster`` sous forme de
chaîne (ex. "c0", "c1", etc.). Le but est d'offrir une segmentation
complémentaire aux segments RFM et d'identifier des groupes de
comportement similaires. Le nombre de clusters par défaut est 4, mais
peut être ajusté en paramètre.

L'algorithme K‑means implémenté ici effectue un nombre fixe
d'itérations et initialise les centres aléatoirement. Il est destiné à
être utilisé sur des jeux de données de taille modeste (quelques
centaines ou milliers de clients). Pour des volumes plus importants ou
des fonctionnalités avancées (initialisation K‑means++, scoring par
silhouette), l'utilisation de scikit‑learn est recommandée.
"""

from __future__ import annotations

import math
import random
from typing import List, Tuple

import numpy as np
from sqlalchemy.orm import Session

from ..models import Client


def _normalize_features(values: np.ndarray) -> np.ndarray:
    """Normalise chaque colonne de la matrice par min-max scaling.

    Cette fonction transforme les valeurs pour qu'elles soient comprises
    entre 0 et 1, afin de réduire l'influence des différences d'échelle
    entre les composantes R, F et M.
    """
    if values.size == 0:
        return values
    mins = values.min(axis=0)
    maxs = values.max(axis=0)
    # éviter la division par zéro
    ranges = np.where((maxs - mins) == 0, 1, maxs - mins)
    return (values - mins) / ranges


def _initialize_centers(data: np.ndarray, k: int) -> np.ndarray:
    """Choisit aléatoirement k lignes de data comme centres initiaux."""
    indices = random.sample(range(data.shape[0]), k)
    return data[indices].copy()


def _assign_clusters(data: np.ndarray, centers: np.ndarray) -> np.ndarray:
    """Assigne chaque point au centre le plus proche en distance euclidienne."""
    # Calculer la distance euclidienne au carré pour chaque centre
    distances = np.linalg.norm(data[:, None, :] - centers[None, :, :], axis=2)
    return distances.argmin(axis=1)


def _recompute_centers(data: np.ndarray, labels: np.ndarray, k: int) -> np.ndarray:
    """Recalcule les centres comme la moyenne des points de chaque cluster."""
    new_centers = np.zeros((k, data.shape[1]))
    for idx in range(k):
        points = data[labels == idx]
        if len(points) > 0:
            new_centers[idx] = points.mean(axis=0)
        else:
            # Si un cluster est vide, réinitialiser aléatoirement un centre
            new_centers[idx] = data[random.randrange(data.shape[0])]
    return new_centers


def kmeans(data: np.ndarray, k: int, max_iter: int = 20) -> Tuple[np.ndarray, np.ndarray]:
    """Implémentation simple de l'algorithme K‑means.

    :param data: tableau NumPy 2D de forme (n_samples, n_features).
    :param k: nombre de clusters.
    :param max_iter: nombre maximum d'itérations.
    :returns: un tuple (labels, centers) où ``labels`` est un tableau 1D
      contenant l'indice du cluster pour chaque point, et ``centers`` est
      un tableau 2D des centres calculés.
    """
    if data.shape[0] < k:
        raise ValueError("Le nombre de points est inférieur au nombre de clusters")
    centers = _initialize_centers(data, k)
    labels = np.zeros(data.shape[0], dtype=int)
    for _ in range(max_iter):
        new_labels = _assign_clusters(data, centers)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        centers = _recompute_centers(data, labels, k)
    return labels, centers


def compute_clusters_for_tenant(db: Session, tenant_id: int, n_clusters: int = 4) -> dict[str, int]:
    """Calcule les clusters de clients pour un locataire et met à jour la base.

    Les composantes RFM (recency, frequency, monetary) servent de
    caractéristiques d'entrée. Les valeurs manquantes sont exclues.

    :param db: session SQLAlchemy active.
    :param tenant_id: identifiant du locataire.
    :param n_clusters: nombre de clusters à créer.
    :returns: un dictionnaire {"c0": count0, "c1": count1, ...} indiquant
      le nombre de clients dans chaque cluster.
    """
    # Récupérer les clients disposant de valeurs RFM complètes
    clients = (
        db.query(Client)
        .filter(Client.tenant_id == tenant_id)
        .filter(Client.recency.isnot(None), Client.frequency.isnot(None), Client.monetary.isnot(None))
        .all()
    )
    if not clients:
        return {}
    data = np.array([[c.recency, c.frequency, c.monetary] for c in clients], dtype=float)
    # Normaliser les caractéristiques
    data_norm = _normalize_features(data)
    # Exécuter K‑means
    labels, _centers = kmeans(data_norm, n_clusters)
    # Mettre à jour les clients avec leur cluster sous forme de chaîne "cX"
    cluster_counts: dict[str, int] = {}
    for client, label in zip(clients, labels):
        cluster_label = f"c{label}"
        client.cluster = cluster_label
        cluster_counts[cluster_label] = cluster_counts.get(cluster_label, 0) + 1
    db.commit()
    return cluster_counts