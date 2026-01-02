"""Tests for the recommendation engine service.

Ce module contient des tests unitaires simples visant à vérifier que
les pondérations de scoring pour les différents scénarios sont
définies correctement. Il s'agit d'un test de validation minimal
garantissant que la constante ``SCORING_WEIGHTS`` est cohérente.

Les tests peuvent être exécutés via ``pytest``.
"""

def test_scoring_weights_sum_to_one() -> None:
    """Vérifie que la somme des pondérations pour chaque scénario vaut 1.

    Chaque scénario (rebuy, cross_sell, upsell, winback, nurture)
    définit des pondérations sur quatre composantes: popularité,
    adéquation de prix, correspondance de famille et RFM. La somme
    doit être égale à 1 pour obtenir un score normalisé.
    """
    from backend.app.services.recommendation_engine import SCORING_WEIGHTS

    for scenario, weights in SCORING_WEIGHTS.items():
        total = sum(weights.values())
        assert abs(total - 1.0) < 1e-6, f"La somme des poids pour {scenario} vaut {total}, attendu 1.0"