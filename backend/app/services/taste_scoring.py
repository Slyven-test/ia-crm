from __future__ import annotations

import json
from typing import Any

from ..models import Client, Product, TasteDimension


def parse_json_text(text: str | None) -> dict[str, Any]:
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        return {}
    return {}


def product_vector(product: Product) -> dict[str, float]:
    vector: dict[str, float] = {}
    for key in (
        "aroma_fruit",
        "aroma_floral",
        "aroma_spice",
        "aroma_mineral",
        "aroma_acidity",
        "aroma_body",
        "aroma_tannin",
    ):
        value = getattr(product, key)
        if value is not None:
            vector[key] = float(value)
    custom = parse_json_text(product.custom_characteristics)
    for key, value in custom.items():
        try:
            vector[key] = float(value)
        except (TypeError, ValueError):
            continue
    return vector


def client_vector(client: Client) -> dict[str, float]:
    vector: dict[str, float] = {}
    profile = parse_json_text(client.aroma_profile)
    for key, value in profile.items():
        try:
            vector[key] = float(value)
        except (TypeError, ValueError):
            continue
    return vector


def compute_weighted_similarity(
    client_vec: dict[str, float],
    product_vec: dict[str, float],
    dimensions: list[TasteDimension],
) -> float:
    active = [d for d in dimensions if d.is_active]
    if not active:
        return 0.0
    total_weight = 0.0
    total_score = 0.0
    for dimension in active:
        weight = float(dimension.weight or 0.0)
        total_weight += weight
        c_val = float(client_vec.get(dimension.key, 0.0))
        p_val = float(product_vec.get(dimension.key, 0.0))
        contribution = weight * max(0.0, 1.0 - abs(c_val - p_val) / 5.0)
        total_score += contribution
    if total_weight <= 0:
        return 0.0
    return total_score / total_weight
