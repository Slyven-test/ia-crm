"""
Configuration settings for the ETL pipeline.

This module centralises all configurable aspects of the ETL, such as where
raw data lives, where transformed data should be written, and how to
connect to the PostgreSQL database. It also exposes helper functions to
derive tenant‑specific paths.

The aim is to make the ETL flexible and multi‑tenant. Each tenant has its
own subdirectory under the base data directory so that their files remain
isolated. Environment variables are used to override defaults in
production.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple


# Base directory where all tenant data folders reside. You can override
# this with the environment variable ``DATA_DIR``. In development, the
# default ``data`` folder in the project root will be used.
BASE_DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))

# Directory names for the different ETL stages. These should remain
# consistent across tenants.
RAW_SUBDIR = "raw"
STAGING_SUBDIR = "staging"
CURATED_SUBDIR = "curated"

# Environment variable for PostgreSQL connection. For example:
# ``postgresql+psycopg2://user:password@localhost:5432/db_name``
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/ia_crm")


def get_tenant_paths(tenant_id: str) -> Tuple[Path, Path, Path]:
    """Return paths for the raw, staging and curated directories of a tenant.

    Args:
        tenant_id: The identifier of the tenant (e.g. ``"ruhlmann"``).

    Returns:
        A tuple containing (raw_dir, staging_dir, curated_dir).
    """
    base = BASE_DATA_DIR / tenant_id
    raw_dir = base / RAW_SUBDIR
    staging_dir = base / STAGING_SUBDIR
    curated_dir = base / CURATED_SUBDIR
    # Ensure directories exist
    for d in (raw_dir, staging_dir, curated_dir):
        d.mkdir(parents=True, exist_ok=True)
    return raw_dir, staging_dir, curated_dir


__all__ = [
    "BASE_DATA_DIR",
    "RAW_SUBDIR",
    "STAGING_SUBDIR",
    "CURATED_SUBDIR",
    "DATABASE_URL",
    "get_tenant_paths",
]