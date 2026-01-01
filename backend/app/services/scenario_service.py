"""Scenario selection service.

This module determines the "Next Best Action" (scenario) for a given
client based on recency, frequency, monetary value, preference
concentration and aroma confidence. The logic is derived from the
build guide: possible scenarios are WINBACK, REBUY, CROSS_SELL,
UPSELL and NURTURE.

Each scenario has a score computed from weighted features. The one with
the highest score is selected. You can override the weights via the
``weights`` parameter or configure them in a YAML file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from ..models import Client


@dataclass
class ScenarioDecision:
    scenario: str
    scores: Dict[str, float]


class ScenarioService:
    SCENARIOS = ["WINBACK", "REBUY", "CROSS_SELL", "UPSELL", "NURTURE"]

    def __init__(self, weights: Optional[Dict[str, Dict[str, float]]] = None):
        """Initialize with optional custom weights.

        The weights dict should have the structure:
        {scenario: {feature: weight, ...}}
        """
        # Default weights loosely based on the example matrix
        self.weights = weights or {
            "WINBACK": {"recency": 3, "monetary": 2, "coverage": 0, "families": 0, "aroma_conf": 1},
            "REBUY": {"recency": -1, "monetary": 1, "coverage": 1, "families": 0, "aroma_conf": 1},
            "CROSS_SELL": {"recency": -1, "monetary": 1, "coverage": 3, "families": 2, "aroma_conf": 1},
            "UPSELL": {"recency": -1, "monetary": 2, "coverage": 1, "families": 0, "aroma_conf": 2},
            "NURTURE": {"recency": 1, "monetary": 1, "coverage": 1, "families": 0, "aroma_conf": 1},
        }

    def decide(self, client: Client) -> ScenarioDecision:
        """Compute scenario scores and return the best scenario.

        Args:
            client: Instance of Client with populated RFM and preference fields.

        Returns:
            ScenarioDecision containing the chosen scenario and raw scores.
        """
        # Extract features from client
        recency = client.recency or 0.0
        monetary = client.monetary or 0.0
        # Coverage of top families: parse JSON string like '[{"family": "Blanc", "share": 0.6}, ...]'
        coverage = 0.0
        if client.preferred_families:
            try:
                import json
                prefs = json.loads(client.preferred_families)
                # Compute sum of shares of top 2 families
                shares = [p.get("share", 0.0) for p in prefs]
                coverage = sum(shares[:2])
            except Exception:
                coverage = 0.0
        # Number of distinct families purchased (lower implies dominance)
        families = client.cluster  # reuse cluster field to store nb_families if available
        try:
            num_families = int(families) if families is not None else 0
        except ValueError:
            num_families = 0
        # Aroma confidence from aroma_profile JSON
        aroma_conf = 0.0
        if client.aroma_profile:
            try:
                import json
                ap = json.loads(client.aroma_profile)
                aroma_conf = ap.get("confidence", 0.0)
            except Exception:
                aroma_conf = 0.0
        # Compute scenario scores
        scenario_scores: Dict[str, float] = {}
        for scen in self.SCENARIOS:
            w = self.weights.get(scen, {})
            score = (
                w.get("recency", 0.0) * recency
                + w.get("monetary", 0.0) * monetary
                + w.get("coverage", 0.0) * coverage
                + w.get("families", 0.0) * (1.0 / (1 + num_families))
                + w.get("aroma_conf", 0.0) * aroma_conf
            )
            scenario_scores[scen] = score

        # Select scenario with highest score
        best_scenario = max(scenario_scores, key=scenario_scores.get)
        return ScenarioDecision(scenario=best_scenario, scores=scenario_scores)