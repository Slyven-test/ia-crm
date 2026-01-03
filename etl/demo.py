"""Demo runner for the ia-crm ETL.

This script copies a tiny sample dataset into the ETL data directories and
runs the full pipeline for a demo tenant. It is intended for local
development so you can see the pipeline execute end-to-end without needing
external data.

Usage
-----
```bash
# Defaults to SQLite in ./data/demo.db and tenant "demo"
python -m etl.demo

# Custom tenant or database
DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/ia_crm python -m etl.demo --tenant acme
```
"""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

# Use a lightweight SQLite database by default for the demo
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/demo.db")

from .config import get_tenant_paths, BASE_DATA_DIR  # noqa: E402
from .ingest_raw import ingest_raw_files  # noqa: E402
from .transform_sales import transform_all_staging_files  # noqa: E402
from .load_postgres_multi import load_all_curated_for_tenant, verify_load  # noqa: E402


SAMPLES_DIR = Path(__file__).resolve().parent / "samples"


def _reset_tenant_dirs(tenant_id: str) -> None:
    """Clean any previous demo artifacts for a tenant."""
    base = BASE_DATA_DIR / tenant_id
    if base.exists():
        shutil.rmtree(base)
    get_tenant_paths(tenant_id)  # recreate empty folders


def _seed_sample_files(tenant_id: str) -> None:
    """Copy the bundled demo CSVs into the raw/curated folders."""
    raw_dir, _, curated_dir = get_tenant_paths(tenant_id)
    raw_dir.mkdir(parents=True, exist_ok=True)
    curated_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy(SAMPLES_DIR / "demo_sales.csv", raw_dir / "sales_demo.csv")
    shutil.copy(SAMPLES_DIR / "demo_clients.csv", curated_dir / "clients_demo_curated.csv")
    shutil.copy(SAMPLES_DIR / "demo_products.csv", curated_dir / "products_demo_curated.csv")


def run_demo_etl(tenant_id: str = "demo") -> dict:
    """Run the full ETL for the demo tenant and return the results summary."""
    _reset_tenant_dirs(tenant_id)
    _seed_sample_files(tenant_id)

    staging_files = ingest_raw_files(tenant_id)
    curated_from_sales = transform_all_staging_files(tenant_id, staging_files)
    load_results = load_all_curated_for_tenant(tenant_id, isolate_schema=False)
    verification = verify_load(load_results if isinstance(load_results, dict) else {})
    return {
        "tenant": tenant_id,
        "staging_files": [str(p) for p in staging_files],
        "curated_from_sales": [str(p) for p in curated_from_sales],
        "load_results": load_results,
        "verification": verification,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run demo ETL with bundled sample data.")
    parser.add_argument("--tenant", default="demo", help="Tenant identifier to use for the demo (default: demo)")
    args = parser.parse_args()
    summary = run_demo_etl(args.tenant)
    print("ETL demo completed:")
    for key, value in summary.items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()

