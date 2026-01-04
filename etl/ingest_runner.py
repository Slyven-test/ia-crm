"""File-based ingestion pipeline with data-contract validation.

This module implements a simple RAW → STAGING → CURATED flow for iSaVigne
exports (CSV). It validates required columns, archives the raw files by
``run_id`` (immutable), normalises basic types and emits a structured report
with warnings and blocking errors.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import shutil
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd

from .config import BASE_DATA_DIR


REQUIRED_COLUMNS: Dict[str, List[str]] = {
    "clients": ["client_code", "email"],
    "products": ["product_key", "name"],
    "sales": ["document_id", "product_key", "client_code", "quantity", "amount", "sale_date"],
}

OPTIONAL_COLUMNS: Dict[str, List[str]] = {
    "clients": ["budget_band", "rfm_segment"],
    "products": ["family_crm", "price_ttc", "global_popularity_score"],
    "sales": ["currency", "channel"],
}


@dataclass
class IngestionReport:
    run_id: str
    tenant_id: str
    dataset_version: str
    raw_files: Dict[str, str]
    staging_files: Dict[str, str]
    curated_files: Dict[str, str]
    errors: List[str]
    warnings: List[str]
    rows: Dict[str, int]

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, ensure_ascii=False)


def _hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _copy_raw(input_path: Path, raw_dir: Path) -> Dict[str, Path]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    copied: Dict[str, Path] = {}
    for csv_path in input_path.glob("*.csv"):
        target = raw_dir / csv_path.name
        if target.exists():
            raise FileExistsError(f"RAW file already exists (immutable): {target}")
        shutil.copy2(csv_path, target)
        copied[csv_path.name] = target
    return copied


def _normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={c: c.strip().lower() for c in df.columns})
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            continue
        df[col] = df[col].astype(str).str.strip()
    return df


def _validate_contract(table: str, df: pd.DataFrame) -> Tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []
    required = REQUIRED_COLUMNS.get(table, [])
    optional = OPTIONAL_COLUMNS.get(table, [])
    for col in required:
        if col not in df.columns:
            errors.append(f"{table}: colonne requise absente: {col}")
    for col in optional:
        if col not in df.columns:
            warnings.append(f"{table}: colonne optionnelle absente: {col}")
    return errors, warnings


def _write_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, quoting=csv.QUOTE_NONNUMERIC)


def run_ingestion(input_dir: Path, tenant_id: str) -> IngestionReport:
    run_id = uuid.uuid4().hex
    base_dir = BASE_DATA_DIR / tenant_id / "runs" / run_id
    raw_dir = base_dir / "raw"
    staging_dir = base_dir / "staging"
    curated_dir = base_dir / "curated"

    raw_files = _copy_raw(input_dir, raw_dir)

    errors: List[str] = []
    warnings: List[str] = []
    staging_files: Dict[str, str] = {}
    curated_files: Dict[str, str] = {}
    row_counts: Dict[str, int] = {}

    for table, raw_path in raw_files.items():
        df = pd.read_csv(raw_path)
        df = _normalize_dataframe(df)
        table_name = Path(table).stem
        row_counts[table_name] = len(df)
        table_errors, table_warnings = _validate_contract(table_name, df)
        errors.extend(table_errors)
        warnings.extend(table_warnings)

        staging_path = staging_dir / f"{table_name}.csv"
        _write_csv(df, staging_path)
        staging_files[table_name] = str(staging_path)

        curated_path = curated_dir / f"{table_name}_curated.csv"
        _write_csv(df, curated_path)
        curated_files[table_name] = str(curated_path)

    dataset_hash_parts = [f"{name}:{_hash_file(path)}" for name, path in raw_files.items()]
    dataset_version = hashlib.sha256("|".join(dataset_hash_parts).encode()).hexdigest()

    return IngestionReport(
        run_id=run_id,
        tenant_id=tenant_id,
        dataset_version=dataset_version,
        raw_files={k: str(v) for k, v in raw_files.items()},
        staging_files=staging_files,
        curated_files=curated_files,
        errors=errors,
        warnings=warnings,
        rows=row_counts,
    )


def save_report(report: IngestionReport) -> Path:
    base_dir = BASE_DATA_DIR / report.tenant_id / "runs" / report.run_id
    report_path = base_dir / "report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report.to_json(), encoding="utf-8")
    return report_path


def ingest_from_dir(source_dir: Path, tenant_id: str) -> IngestionReport:
    report = run_ingestion(source_dir, tenant_id)
    save_report(report)
    return report


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Ingest iSaVigne exports from a directory")
    parser.add_argument("--tenant", required=True, help="Tenant identifier")
    parser.add_argument("--source", required=True, help="Path to directory containing CSV files")
    args = parser.parse_args()
    report = ingest_from_dir(Path(args.source), args.tenant)
    print(report.to_json())


if __name__ == "__main__":
    main()
