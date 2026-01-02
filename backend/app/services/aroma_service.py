"""Aroma profile computation for customers.

This service computes a 7‑axis aroma vector for a client based on
historical purchases. It follows the recommendations from the build
guide: the intensity of each axis is a weighted average of the product
vectors (weights given by amount spent). The result is normalized on
0..1 and can be bucketed into a low/medium/high confidence level based
on number of orders and variance.

Note: This is a simplified implementation. In production you may
refactor to precompute product vectors, handle missing values and tune
the confidence formula.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple, List

from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models import Client, Product, Order, OrderItem


@dataclass
class AromaProfile:
    axes: Dict[str, float]
    top_axes: List[Tuple[str, float]]
    confidence: float
    level: str


class AromaService:
    def __init__(self, db: Session):
        self.db = db

    def compute_for_client(self, client_id: int) -> AromaProfile:
        """Compute aroma profile for a given client.

        Args:
            client_id: ID of the client

        Returns:
            AromaProfile dataclass with axes and confidence
        """
        # Fetch order items for client
        items = (
            self.db.query(OrderItem)
            .join(Order)
            .filter(Order.client_id == client_id)
            .all()
        )
        if not items:
            return AromaProfile(axes={}, top_axes=[], confidence=0.0, level="Low")

        # Aggregate weighted product vectors
        total_weight = 0.0
        aggregate: Dict[str, float] = {
            "fruit": 0.0,
            "floral": 0.0,
            "spice": 0.0,
            "mineral": 0.0,
            "acidity": 0.0,
            "body": 0.0,
            "tannin": 0.0,
        }
        for item in items:
            product: Product = item.product
            weight = item.total_price or 0.0
            total_weight += weight
            # Sum weighted intensities; missing values contribute 0
            aggregate["fruit"] += (product.aroma_fruit or 0) * weight
            aggregate["floral"] += (product.aroma_floral or 0) * weight
            aggregate["spice"] += (product.aroma_spice or 0) * weight
            aggregate["mineral"] += (product.aroma_mineral or 0) * weight
            aggregate["acidity"] += (product.aroma_acidity or 0) * weight
            aggregate["body"] += (product.aroma_body or 0) * weight
            aggregate["tannin"] += (product.aroma_tannin or 0) * weight

        # Normalize by total weight and divide by 5 to scale 0..1
        axes_norm: Dict[str, float] = {}
        for axis, value in aggregate.items():
            if total_weight > 0:
                axes_norm[axis] = round((value / total_weight) / 5.0, 3)
            else:
                axes_norm[axis] = 0.0

        # Determine top 3 axes
        sorted_axes = sorted(axes_norm.items(), key=lambda x: x[1], reverse=True)
        top_axes = sorted_axes[:3]

        # Compute confidence (heuristic: number of orders + variance)
        n_orders = (
            self.db.query(func.count(Order.id))
            .filter(Order.client_id == client_id)
            .scalar()
        ) or 0
        # Simplified variance: average absolute deviation from mean
        values = [v for _, v in axes_norm.items()]
        mean_val = sum(values) / len(values)
        variance = sum(abs(v - mean_val) for v in values) / len(values)
        stability = 1.0 - variance  # 0 unstable -> 1 stable
        volume_factor = min(1.0, (n_orders / 10.0))
        confidence = round(0.2 + 0.8 * volume_factor * stability, 3)
        level = "Low"
        if confidence >= 0.7:
            level = "High"
        elif confidence >= 0.45:
            level = "Medium"

        return AromaProfile(axes=axes_norm, top_axes=top_axes, confidence=confidence, level=level)

    def compute_client_aroma_profiles(self, tenant_id: int) -> int:
        """Calcule et stocke les profils aromatiques pour tous les clients d'un tenant.

        Cette méthode itère sur l'ensemble des clients du tenant donné,
        calcule leur profil aromatique (axes, top_axes, niveau de confiance)
        via ``compute_for_client`` et sérialise le résultat dans le champ
        ``Client.aroma_profile`` (au format JSON). Elle retourne le nombre
        de clients mis à jour.

        Args:
            tenant_id: identifiant du locataire

        Returns:
            nombre de clients pour lesquels le profil a été calculé
        """
        import json

        count = 0
        # Récupérer les clients du tenant
        clients = self.db.query(Client).filter(Client.tenant_id == tenant_id).all()
        for client in clients:
            profile = self.compute_for_client(client.id)
            # Sérialiser le profil complet (axes, top_axes, confidence, level)
            client.aroma_profile = json.dumps({
                "axes": profile.axes,
                "top_axes": profile.top_axes,
                "confidence": profile.confidence,
                "level": profile.level,
            })
            count += 1
        # Commit en bloc pour toutes les mises à jour
        self.db.commit()
        return count