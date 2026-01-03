"""
Transformation module for ia‑crm ETL pipeline.

This module defines functions to clean and enrich raw sales data. It reads
CSV files from the staging area, applies normalisation rules (column
names, date formats, client codes), derives additional fields such as
`product_key` and `document_id`, and writes the cleaned dataset to the
curated directory. A `tenant_id` column is inserted on every row to
support the multi‑tenant architecture.

The transformation logic here is deliberately simple and should be
adapted to your specific data model. If you have additional metadata
available (e.g. product catalogues), you can enrich the records
accordingly.
"""
from __future__ import annotations

import unicodedata
from pathlib import Path
from typing import List

import pandas as pd

from .config import get_tenant_paths


def _tenant_value(tenant_id: str):
    try:
        return int(tenant_id)
    except Exception:
        return tenant_id


def _normalize_text(value: str) -> str:
    """Return a lowercase, accent‑stripped version of the input string."""
    if not isinstance(value, str):
        return value
    nfkd_form = unicodedata.normalize("NFKD", value)
    only_ascii = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    return only_ascii.lower().strip()


def _standardise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename columns to lower case with underscores and strip whitespace."""
    new_cols = {}
    for col in df.columns:
        new_col = _normalize_text(col)
        new_col = new_col.replace(" ", "_").replace("-", "_")
        new_cols[col] = new_col
    df = df.rename(columns=new_cols)
    return df


def _transform_clients(df: pd.DataFrame, tenant_id: str) -> pd.DataFrame:
    df = _standardise_columns(df)
    expected = ["client_code", "name", "email"]
    for col in expected:
        if col not in df.columns:
            raise ValueError(f"Colonne requise manquante pour clients: {col}")
    df = df[expected]
    df["tenant_id"] = _tenant_value(tenant_id)
    return df


def _transform_products(df: pd.DataFrame, tenant_id: str) -> pd.DataFrame:
    df = _standardise_columns(df)
    expected = ["product_key", "name", "family_crm", "price_ttc"]
    for col in ["product_key", "name"]:
        if col not in df.columns:
            raise ValueError(f"Colonne requise manquante pour produits: {col}")
    for col in expected:
        if col not in df.columns:
            df[col] = None
    df = df[expected]
    df["tenant_id"] = _tenant_value(tenant_id)
    return df


def _transform_sales(df: pd.DataFrame, tenant_id: str) -> pd.DataFrame:
    df = _standardise_columns(df)
    if "document_id" not in df.columns:
        doc_cols = [c for c in df.columns if "doc" in c or "facture" in c or "document" in c]
        if doc_cols:
            df["document_id"] = df[doc_cols[0]].astype(str)
        else:
            df["document_id"] = df.index.astype(str)
    if "product_key" not in df.columns:
        if "product_label" in df.columns:
            df["product_key"] = df["product_label"].apply(_normalize_text)
        else:
            df["product_key"] = "unknown"
    if "client_code" not in df.columns:
        raise ValueError("Colonne client_code manquante pour sales")
    df["tenant_id"] = _tenant_value(tenant_id)
    if "sale_date" in df.columns:
        df["sale_date"] = pd.to_datetime(df["sale_date"], errors="coerce")
        df["sale_date"] = df["sale_date"].dt.strftime("%Y-%m-%d")
    if "quantity" not in df.columns:
        df["quantity"] = 1
    if "amount" not in df.columns:
        df["amount"] = None
    if "sale_date" not in df.columns:
        df["sale_date"] = None
    df = df[
        ["document_id", "product_key", "client_code", "quantity", "amount", "sale_date", "tenant_id"]
    ]
    df = df.drop_duplicates(subset=["document_id", "product_key"], keep="first")
    return df


def transform_sales_file(tenant_id: str, staging_file: Path) -> Path:
    """Transform a single staging CSV file into a curated CSV."""
    _, _, curated_dir = get_tenant_paths(tenant_id)
    df = pd.read_csv(staging_file)
    name = staging_file.name.lower()
    if "client" in name:
        transformed = _transform_clients(df, tenant_id)
        dataset = "clients"
    elif "product" in name:
        transformed = _transform_products(df, tenant_id)
        dataset = "products"
    else:
        transformed = _transform_sales(df, tenant_id)
        dataset = "sales"
    curated_name = f"{dataset}_{staging_file.stem}_curated.csv"
    curated_path = curated_dir / curated_name
    transformed.to_csv(curated_path, index=False)
    return curated_path


def transform_all_staging_files(tenant_id: str, staging_files: List[Path]) -> List[Path]:
    """Transform multiple staging files and return paths of curated files."""
    curated_paths: List[Path] = []
    for file in staging_files:
        try:
            curated_path = transform_sales_file(tenant_id, file)
            curated_paths.append(curated_path)
        except Exception as e:
            print(f"Error transforming {file.name}: {e}")
    return curated_paths


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Transform staging sales files for a tenant")
    parser.add_argument("tenant_id", help="Tenant identifier")
    parser.add_argument("staging_files", nargs="+", help="Paths of staging CSV files to transform")
    args = parser.parse_args()
    paths = [Path(p) for p in args.staging_files]
    curated = transform_all_staging_files(args.tenant_id, paths)
    print(f"Transformed {len(curated)} file(s)")
    for p in curated:
        print("  ", p)
