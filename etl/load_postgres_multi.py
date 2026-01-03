"""
Chargement des données CURATED en PostgreSQL avec support multi‑tenants
Version: 2.0
Ce module est une extension du script original `load_postgres.py`.

Il ajoute la prise en charge d'un identifiant de locataire (tenant) afin de
permettre le chargement séparé des données pour plusieurs entreprises dans
une base de données partagée. Chaque enregistrement est annoté avec un
``tenant_id`` avant l'insertion, ce qui permet de filtrer et de requêter
facilement les données par client.

Principales fonctionnalités :
  - Déduplication basée sur les clés naturelles, identique au script
    d'origine ;
  - Injection d'un identifiant ``tenant_id`` dans chaque DataFrame avant
    chargement ;
  - Sélection dynamique du schéma ou de la table via un préfixe tenant ;
  - Journaux détaillés et gestion robuste des erreurs via SQLAlchemy.

Utilisation :
  >>> from etl.load_postgres_multi import load_all_curated_for_tenant
  >>> load_all_curated_for_tenant(tenant_id="ruhlmann")

Cette fonction parcourt tous les fichiers CSV présents dans le dossier
CURATED et les insère dans la base de données, en ajoutant automatiquement
l'identifiant ``tenant_id``. Les noms de table peuvent être suffixés par
l'identifiant du tenant si vous souhaitez isoler physiquement les données
dans des tables séparées (voir argument ``isolate_schema``).
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from pathlib import Path
import os

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .config import DATABASE_URL, get_tenant_paths

# Configure a module‑level logger. In production, you can configure
# handlers/formatters globally.
logger = logging.getLogger(__name__)


def _add_tenant_column(df: pd.DataFrame, tenant_id: str) -> pd.DataFrame:
    """Ajoute une colonne ``tenant_id`` au DataFrame.

    Si la colonne existe déjà, elle est remplacée par la valeur fournie.

    Args:
        df: DataFrame à enrichir.
        tenant_id: identifiant du locataire.

    Returns:
        DataFrame enrichi.
    """
    df = df.copy()
    df["tenant_id"] = tenant_id
    return df


def _is_sqlite(engine) -> bool:
    return engine.dialect.name == "sqlite"


def _ensure_schema(engine, schema_name: str | None) -> None:
    if not schema_name or _is_sqlite(engine):
        return
    safe_schema = schema_name.replace('"', "")
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{safe_schema}"'))


def _normalize_label(label: str) -> str:
    label = label.strip().lower()
    label = "".join(ch for ch in unicodedata.normalize("NFD", label) if unicodedata.category(ch) != "Mn")
    label = re.sub(r"[^a-z0-9\s]", " ", label)
    label = re.sub(r"\s+", " ", label).strip()
    return label


def _get_engine():
    db_url = os.getenv("DATABASE_URL", DATABASE_URL)
    return create_engine(db_url)


def load_table_with_tenant(
    table_name: str,
    csv_file: str,
    tenant_id: str,
    schema: str = "etl",
    isolate_schema: bool = False,
) -> dict:
    """Charge un fichier CSV dans une table PostgreSQL en y ajoutant un tenant.

    Args:
        table_name: nom de la table cible (ex. ``ventes_lignes``).
        csv_file: chemin du fichier CURATED CSV.
        tenant_id: identifiant du locataire à injecter dans les données.
    schema: schéma PostgreSQL (défaut ``etl``). Ignoré en mode SQLite.
        isolate_schema: si ``True``, le schéma ou la table est suffixé par
            ``tenant_id`` afin d'isoler physiquement les données.

    Returns:
        dict avec le statut de chargement et des informations de diagnostic.
    """
    try:
        logger.info(f"\n📥 Chargement {schema}.{table_name} pour tenant '{tenant_id}'")
        logger.info(f"   Source: {csv_file}")

        # Charger le CSV
        chunk_size_env = int(os.getenv("ETL_CHUNK_SIZE", "0"))
        if chunk_size_env > 0:
            chunks = pd.read_csv(csv_file, chunksize=chunk_size_env)
            df = pd.concat(chunks, ignore_index=True)
        else:
            df = pd.read_csv(csv_file)
        initial_rows = len(df)
        logger.info(f"   Chargé: {initial_rows} lignes brutes")

        required_columns: dict[str, list[str | tuple[str, ...]]] = {
            "clients": ["client_code"],
            "products": ["product_key", "name"],
            "sales": ["document_id", "client_code", ("product_key", "product_label")],
        }
        missing_cols: list[str] = []
        for col in required_columns.get(table_name, []):
            if isinstance(col, tuple):
                if not any(c in df.columns for c in col):
                    missing_cols.append("/".join(col))
            elif col not in df.columns:
                missing_cols.append(col)
        if missing_cols:
            logger.error(f"   ✗ Colonnes manquantes: {missing_cols}")
            return {
                "success": False,
                "table": f"{schema}.{table_name}",
                "error_type": "MissingColumns",
                "missing_columns": missing_cols,
                "tenant_id": tenant_id,
            }

        if table_name == "sales" and "sale_date" in df.columns:
            df["sale_date"] = pd.to_datetime(df["sale_date"], errors="coerce")

        # Déduplication selon la table
        duplicates_removed = 0
        if table_name == "sales":
            key_cols = ["document_id", "product_key", "client_code"]
            if all(col in df.columns for col in key_cols):
                dedup_cols = key_cols + (["tenant_id"] if "tenant_id" in df.columns else [])
                df_dedup = df.drop_duplicates(subset=dedup_cols, keep="last")
                duplicates_removed = initial_rows - len(df_dedup)
                if duplicates_removed > 0:
                    logger.warning(f"   ⚠️ Doublons détectés: {duplicates_removed}")
                df = df_dedup
        elif table_name == "clients":
            if "client_code" in df.columns:
                df_dedup = df.drop_duplicates(subset=["client_code"], keep="last")
                duplicates_removed = initial_rows - len(df_dedup)
                if duplicates_removed > 0:
                    logger.warning(f"   ⚠️ Doublons clients: {duplicates_removed}")
                df = df_dedup
        elif table_name == "products":
            if "product_key" in df.columns:
                df_dedup = df.drop_duplicates(subset=["product_key"], keep="last")
                duplicates_removed = initial_rows - len(df_dedup)
                if duplicates_removed > 0:
                    logger.warning(f"   ⚠️ Doublons produits: {duplicates_removed}")
                df = df_dedup

        # Ajouter la colonne tenant
        df = _add_tenant_column(df, tenant_id)

        resolved_aliases = 0
        unknown_labels: dict[str, int] = {}
        if table_name == "sales":
            if "product_key" not in df.columns:
                df["product_key"] = None
            # Resolve via alias if product_label present
            engine = _get_engine()
            alias_map: dict[str, str] = {}
            with engine.connect() as conn:
                result = conn.execute(
                    text(
                        "SELECT label_norm, product_key FROM product_alias WHERE tenant_id=:tenant_id"
                    ),
                    {"tenant_id": int(tenant_id)},
                )
                alias_map = {row[0]: row[1] for row in result}
                if not alias_map:
                    prod_rows = conn.execute(
                        text("SELECT name, product_key FROM products WHERE tenant_id=:tenant_id"),
                        {"tenant_id": int(tenant_id)},
                    )
                    alias_map = {_normalize_label(row[0]): row[1] for row in prod_rows}

            if "product_label" in df.columns:
                mapped_keys = []
                for _, row in df.iterrows():
                    key = row.get("product_key")
                    if pd.isna(key) or not str(key).strip():
                        label_raw = str(row.get("product_label", ""))
                        norm = _normalize_label(label_raw)
                        mapped = alias_map.get(norm)
                        if mapped:
                            mapped_keys.append(mapped)
                            resolved_aliases += 1
                        else:
                            mapped_keys.append(key)
                            unknown_labels[norm] = unknown_labels.get(norm, 0) + 1
                    else:
                        mapped_keys.append(key)
                df["product_key"] = mapped_keys
                df = df.drop(columns=["product_label"])

        final_rows = len(df)

        # Préparer le nom de table cible
        schema_name = f"{schema}_{tenant_id}" if isolate_schema else schema
        table_target = f"{table_name}_{tenant_id}" if isolate_schema else table_name

        # Connexion PostgreSQL ou SQLite
        engine = _get_engine()
        schema_for_sql = None if _is_sqlite(engine) else schema_name

        # Vérifier la connexion
        with engine.connect() as conn:
            if _is_sqlite(engine):
                result = conn.execute(text("select sqlite_version();"))
                db_version = result.fetchone()[0]
            else:
                result = conn.execute(text("SELECT version();"))
                db_version = result.fetchone()[0]
            logger.info(f"   ✓ Connecté: {db_version.split(',')[0]}")

        _ensure_schema(engine, schema_for_sql)

        # Chargement
        chunksize = 1000
        with engine.begin() as conn:
            df.to_sql(
                table_target,
                conn,
                schema=schema_for_sql,
                if_exists="append",
                index=False,
                chunksize=chunksize,
                method="multi",
            )
            total_loaded = len(df)

        logger.info(f"   ✅ Succès: {total_loaded} lignes chargées dans {schema_name}.{table_target}")

        return {
            "success": True,
            "table": f"{schema_name}.{table_target}",
            "rows_initial": initial_rows,
            "rows_duplicates": duplicates_removed,
            "rows_loaded": total_loaded,
            "tenant_id": tenant_id,
            "status": "OK",
            "resolved_aliases": resolved_aliases,
            "unknown_labels": unknown_labels,
        }

    except IntegrityError as e:
        logger.error(f"   ✗ Erreur intégrité (clé étrangère): {str(e)}")
        return {
            "success": False,
            "table": f"{schema}.{table_name}",
            "error_type": "IntegrityError",
            "error": str(e),
            "tenant_id": tenant_id,
        }
    except SQLAlchemyError as e:
        logger.error(f"   ✗ Erreur SQL: {str(e)}")
        return {
            "success": False,
            "table": f"{schema}.{table_name}",
            "error_type": "SQLAlchemyError",
            "error": str(e),
            "tenant_id": tenant_id,
        }
    except Exception as e:
        logger.error(f"   ✗ Erreur inattendue: {str(e)}", exc_info=True)
        return {
            "success": False,
            "table": f"{schema}.{table_name}",
            "error_type": "Exception",
            "error": str(e),
            "tenant_id": tenant_id,
        }


def load_all_curated_for_tenant(tenant_id: str, isolate_schema: bool = False) -> dict:
    """Parcourt et charge tous les fichiers CURATED pour un tenant donné.

    Cette fonction détecte les fichiers présents dans le dossier CURATED du
    locataire, détermine la table cible en fonction du nom de fichier
    (sales, clients, products…) et appelle ``load_table_with_tenant`` pour
    insérer les données dans la base. Si `isolate_schema` est vrai, les
    données sont chargées dans des schémas/tables distincts pour chaque
    tenant.

    Args:
        tenant_id: identifiant du locataire.
        isolate_schema: isolation physique des données.

    Returns:
        dict contenant les résultats pour chaque table.
    """
    logger.info("\n" + "=" * 60)
    logger.info(
        f"🔵 ÉTAPE 3/3: CHARGEMENT CURATED → PostgreSQL pour tenant '{tenant_id}'"
    )
    logger.info("=" * 60)

    results: dict = {}
    # Obtenir le dossier curated spécifique au tenant
    _, _, curated_dir = get_tenant_paths(tenant_id)
    curated_files = list(curated_dir.glob("*.csv"))
    if not curated_files:
        logger.warning(
            f"⚠️ Aucun fichier CURATED détecté pour le tenant '{tenant_id}' dans {curated_dir}"
        )
        return {"error": "No curated files found", "tenant_id": tenant_id}

    logger.info(f"\nDétecté {len(curated_files)} fichier(s) CURATED\n")

    for csv_file in curated_files:
        filename_lower = csv_file.name.lower()
        # Déterminer la table cible selon le nom du fichier
        if "vente" in filename_lower or "sales" in filename_lower:
            table_name = "sales"
        elif "client" in filename_lower:
            table_name = "clients"
        elif "produit" in filename_lower or "product" in filename_lower:
            table_name = "products"
        else:
            logger.warning(f"⚠️ Fichier non reconnu: {csv_file.name}")
            continue
        result = load_table_with_tenant(
            table_name=table_name,
            csv_file=str(csv_file),
            tenant_id=tenant_id,
            schema="etl",
            isolate_schema=isolate_schema,
        )
        full_table_name = result.get("table", f"etl.{table_name}")
        results[full_table_name] = result

    return results


def verify_load(results: dict) -> dict:
    """Vérifie que le chargement s'est bien déroulé pour un tenant.

    Args:
        results: résultat retourné par ``load_all_curated_for_tenant``.

    Returns:
        dict contenant des informations de succès et le nombre de lignes chargées.
    """
    logger.info("\n" + "-" * 60)
    logger.info("✓ VÉRIFICATION DU CHARGEMENT")
    logger.info("-" * 60)

    total_success = sum(1 for r in results.values() if r.get("success", False))
    total_failed = sum(1 for r in results.values() if not r.get("success", True))
    total_rows = sum(r.get("rows_loaded", 0) for r in results.values())
    total_resolved = sum(r.get("resolved_aliases", 0) for r in results.values())
    unknown_labels: dict[str, int] = {}
    for r in results.values():
        for label, count in r.get("unknown_labels", {}).items():
            unknown_labels[label] = unknown_labels.get(label, 0) + count

    logger.info(f"\n📊 Statistiques:")
    logger.info(f"   Tables réussies: {total_success}")
    logger.info(f"   Tables échouées: {total_failed}")
    logger.info(f"   Total lignes chargées: {total_rows}")
    if total_resolved:
        logger.info(f"   Alias résolus: {total_resolved}")
    if unknown_labels:
        logger.warning(f"   Labels produits inconnus: {unknown_labels}")

    for table_name, result in results.items():
        if result.get("success", False):
            logger.info(f"   ✅ {table_name}: {result['rows_loaded']} lignes")
        else:
            logger.error(f"   ❌ {table_name}: {result.get('error_type', 'Erreur inconnue')}")

    return {
        "success": total_failed == 0,
        "total_success": total_success,
        "total_failed": total_failed,
        "total_rows": total_rows,
        "resolved_aliases": total_resolved,
        "unknown_labels": unknown_labels,
    }
