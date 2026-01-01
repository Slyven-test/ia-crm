"""
Orchestration du Pipeline ETL multi‑tenant
Version : 2.0

Ce script orchestre les trois étapes de l'ETL pour un ou plusieurs locataires :
  1. Ingestion RAW → STAGING (réutilise le module existant `ingest_raw`)
  2. Transformation STAGING → CURATED (réutilise `transform_sales`)
  3. Chargement CURATED → PostgreSQL avec injection du `tenant_id`

L'objectif est de permettre de traiter les données de plusieurs entreprises
en une seule exécution, en conservant l'isolation logique via la colonne
``tenant_id`` ou via des schémas dédiés. Les résultats et temps de
traitement sont affichés pour chaque locataire.

NB : Pour la simplicité, ce module suppose que les fonctions d'ingestion et
de transformation sont compatibles avec un environnement multi‑tenant. Si ce
n'est pas le cas, prévoyez des dossiers RAW/STAGING séparés par tenant et
passez le chemin en paramètre aux fonctions d'ingestion et de transformation.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import List, Dict, Any

import logging
from .ingest_raw import ingest_raw_files
from .transform_sales import transform_all_staging_files
from .load_postgres_multi import load_all_curated_for_tenant, verify_load

# Configure logger for this module
logger = logging.getLogger(__name__)


def run_etl_for_tenant(tenant_id: str, isolate_schema: bool = False) -> Dict[str, Any]:
    """Exécute le pipeline ETL complet pour un locataire unique.

    Args:
        tenant_id: identifiant du locataire.
        isolate_schema: si ``True``, les données sont chargées dans des
            schémas/tables séparés pour chaque tenant.

    Returns:
        Dictionnaire contenant les résultats détaillés du pipeline pour ce tenant.
    """
    timings = {}
    start_time = time.time()
    start_dt = datetime.now()
    logger.info(f"\n=== DÉMARRAGE PIPELINE POUR TENANT '{tenant_id}' ===")

    # Étape 1 : ingestion
    stage1_start = time.time()
    staging_files = ingest_raw_files(tenant_id)
    timings["ingestion_duration"] = time.time() - stage1_start

    # Étape 2 : transformation
    stage2_start = time.time()
    curated_files = transform_all_staging_files(tenant_id, staging_files)
    timings["transformation_duration"] = time.time() - stage2_start

    # Étape 3 : chargement avec tenant
    stage3_start = time.time()
    load_results = load_all_curated_for_tenant(tenant_id, isolate_schema=isolate_schema)
    verification = verify_load(load_results)
    timings["load_duration"] = time.time() - stage3_start

    total_duration = time.time() - start_time
    logger.info(f"=== FIN PIPELINE POUR '{tenant_id}' en {total_duration:.2f}s ===")

    return {
        "tenant_id": tenant_id,
        "success": verification["success"],
        "total_duration": total_duration,
        "timings": timings,
        "ingested_files": staging_files,
        "curated_files": curated_files,
        "load_results": load_results,
        "verification": verification,
    }


def run_etl_multi_tenant(tenants: List[str], isolate_schema: bool = False) -> List[Dict[str, Any]]:
    """Exécute le pipeline ETL pour une liste de locataires.

    Args:
        tenants: liste des identifiants de locataires.
        isolate_schema: si ``True``, isole physiquement les données par schéma/table.

    Returns:
        Liste de dictionnaires avec les résultats pour chaque tenant.
    """
    results: List[Dict[str, Any]] = []
    for tenant in tenants:
        result = run_etl_for_tenant(tenant_id=tenant, isolate_schema=isolate_schema)
        results.append(result)
    return results


if __name__ == "__main__":
    """Point d’entrée CLI pour exécuter le pipeline ETL.

    Ce script accepte les arguments suivants :

    * ``--tenant TENANT`` (peut être répété) : identifiant(s) des tenants à
      traiter. S'il n'est pas fourni, les tenants ``ruhlmann`` et
      ``valentinr`` sont utilisés à titre d'exemple.
    * ``--isolate-schema`` : active le chargement dans des schémas ou
      tables séparés.

    Exemple :
        python etl/main_multi.py --tenant ruhlmann --tenant valentinr --isolate-schema
    """
    import argparse

    parser = argparse.ArgumentParser(description="Run multi-tenant ETL")
    parser.add_argument(
        "--tenant",
        dest="tenants",
        action="append",
        help="Tenant identifier (can be repeated)",
    )
    parser.add_argument(
        "--isolate-schema",
        dest="isolate",
        action="store_true",
        help="Load data into separate schemas/tables per tenant",
    )
    args = parser.parse_args()
    tenants_to_run = args.tenants if args.tenants else ["ruhlmann", "valentinr"]
    all_results = run_etl_multi_tenant(tenants_to_run, isolate_schema=args.isolate)
    # Afficher un résumé final
    for res in all_results:
        status = "✅" if res["success"] else "❌"
        logger.info(
            f"Tenant {res['tenant_id']}: {status} - {res['total_duration']:.2f}s, lignes chargées = {res['verification']['total_rows']}"
        )