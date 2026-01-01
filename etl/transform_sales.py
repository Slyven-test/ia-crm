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


def transform_sales_file(tenant_id: str, staging_file: Path) -> Path:
    """Transform a single staging CSV file into a curated CSV.

    Args:
        tenant_id: Identifier of the tenant owning this file.
        staging_file: Path to the CSV file in staging.

    Returns:
        Path to the curated CSV file written to disk.
    """
    _, _, curated_dir = get_tenant_paths(tenant_id)
    df = pd.read_csv(staging_file)
    # Standardise column names
    df = _standardise_columns(df)
    # Insert tenant_id
    df["tenant_id"] = tenant_id
    # Normalise known columns if they exist
    if "client" in df.columns:
        df["client"] = df["client"].astype(str).apply(_normalize_text)
    if "client_code" in df.columns:
        df["client_code"] = df["client_code"].astype(str).apply(_normalize_text)
    # Derive document_id if fields exist
    doc_cols = [c for c in df.columns if "doc" in c or "facture" in c or "document" in c]
    if doc_cols:
        base_col = doc_cols[0]
        df["document_id"] = df[base_col].astype(str)
    else:
        df["document_id"] = df.index.astype(str)
    # Derive product_key from product or item columns
    prod_cols = [c for c in df.columns if "produit" in c or "product" in c or "item" in c]
    if prod_cols:
        df["product_key"] = df[prod_cols[0]].astype(str).apply(_normalize_text)
    else:
        df["product_key"] = "unknown"
    # Normalise dates
    date_cols = [c for c in df.columns if "date" in c]
    if date_cols:
        def _parse_date(val):
            try:
                return pd.to_datetime(val, dayfirst=True).date()
            except Exception:
                return pd.NaT
        for c in date_cols:
            df[c] = df[c].apply(_parse_date)
    # Drop duplicate rows based on document_id and product_key
    df = df.drop_duplicates(subset=["document_id", "product_key"], keep="first")
    # Write curated file
    curated_name = staging_file.stem.replace("_", "-") + "_curated.csv"
    curated_path = curated_dir / curated_name
    df.to_csv(curated_path, index=False)
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