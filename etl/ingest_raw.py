"""
Ingestion module for the ia‑crm ETL pipeline.

This script scans the raw directory of a given tenant and copies any new
CSV or Excel files into a staging directory. Each file is stored with a
timestamp in its filename to avoid overwriting previous ingestions. A
simple manifest file is maintained to keep track of which raw files
have already been processed, preventing duplicate ingestion.

The ingestion phase does not attempt to interpret the contents of the
files; that responsibility lies with the transformation module. The goal
here is simply to collect and archive incoming data in a consistent
format for further processing.
"""
from __future__ import annotations

import csv
import json
import time
from pathlib import Path
from typing import List

import pandas as pd

from .config import get_tenant_paths


MANIFEST_FILENAME = ".manifest.json"


def load_manifest(staging_dir: Path) -> set[str]:
    """Load the manifest of already processed raw file names.

    The manifest is a JSON file stored in the staging directory. It
    contains a list of filenames that have been ingested. If the file
    does not exist, an empty set is returned.
    """
    manifest_path = staging_dir / MANIFEST_FILENAME
    if not manifest_path.exists():
        return set()
    try:
        with manifest_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return set(data.get("processed_files", []))
    except Exception:
        return set()


def save_manifest(staging_dir: Path, processed_files: set[str]) -> None:
    """Persist the manifest of processed files back to disk."""
    manifest_path = staging_dir / MANIFEST_FILENAME
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump({"processed_files": sorted(processed_files)}, f, indent=2)


def ingest_raw_files(tenant_id: str) -> List[Path]:
    """Ingest raw files for a given tenant and copy them to staging.

    Args:
        tenant_id: Identifier of the tenant (e.g. ``"ruhlmann"``).

    Returns:
        A list of Path objects representing the newly created staging files.
    """
    raw_dir, staging_dir, _ = get_tenant_paths(tenant_id)
    processed = load_manifest(staging_dir)
    new_staging_files: List[Path] = []
    for file in raw_dir.glob("*"):
        if file.name in processed or not file.is_file():
            continue
        if file.suffix.lower() not in {".csv", ".xlsx", ".xls"}:
            continue
        timestamp = int(time.time())
        # Construct new filename in staging directory
        staging_name = f"{file.stem}_{timestamp}{file.suffix.lower()}"
        staging_path = staging_dir / staging_name
        # Read and immediately write to ensure consistent encoding
        try:
            if file.suffix.lower() == ".csv":
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file)
            # Save as CSV to staging for uniform downstream processing
            staging_path = staging_path.with_suffix(".csv")
            df.to_csv(staging_path, index=False)
        except Exception as e:
            print(f"Error ingesting {file.name}: {e}")
            continue
        processed.add(file.name)
        new_staging_files.append(staging_path)
    # Update manifest
    save_manifest(staging_dir, processed)
    return new_staging_files


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest raw files for a tenant")
    parser.add_argument("tenant_id", help="Identifier of the tenant to ingest")
    args = parser.parse_args()
    files = ingest_raw_files(args.tenant_id)
    print(f"Ingested {len(files)} file(s):")
    for f in files:
        print("  ", f)