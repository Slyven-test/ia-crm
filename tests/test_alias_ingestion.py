import os
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine


def _setup_sqlite(tmp_dir: Path) -> str:
    db_path = tmp_dir / "alias.db"
    url = f"sqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url
    engine = create_engine(url)
    return url


def test_alias_resolution_roundtrip(tmp_path: Path) -> None:
    url = _setup_sqlite(tmp_path)
    from backend.app.database import Base  # delayed import to use updated env
    from backend.app.models import Product, ProductAlias
    Base.metadata.create_all(create_engine(url))
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(Product.__table__.insert(), {"product_key": "P001", "name": "Pinot Demo", "tenant_id": 1})
        conn.execute(
            ProductAlias.__table__.insert(),
            {
                "label_norm": "pinot noir",
                "label_raw": "Pinot Noir",
                "product_key": "P001",
                "tenant_id": 1,
            },
        )

    sales_csv = tmp_path / "sales.csv"
    pd.DataFrame(
        [
            {"document_id": "INV-1", "product_label": "Pinot Noir", "client_code": "C1", "quantity": 1, "amount": 10},
        ]
    ).to_csv(sales_csv, index=False)

    from etl.load_postgres_multi import load_table_with_tenant

    result = load_table_with_tenant("sales", str(sales_csv), tenant_id="1")
    assert result["success"]
    assert result.get("resolved_aliases", 0) == 1
    assert not result.get("unknown_labels")


def test_unknown_label_reported(tmp_path: Path) -> None:
    url = _setup_sqlite(tmp_path)
    from backend.app.database import Base  # delayed import to use updated env
    Base.metadata.create_all(create_engine(url))
    sales_csv = tmp_path / "sales.csv"
    pd.DataFrame(
        [
            {"document_id": "INV-2", "product_label": "Inconnu", "client_code": "C1", "quantity": 1, "amount": 10},
        ]
    ).to_csv(sales_csv, index=False)

    from etl.load_postgres_multi import load_table_with_tenant

    result = load_table_with_tenant("sales", str(sales_csv), tenant_id="1")
    assert result["success"]
    assert result.get("resolved_aliases", 0) == 0
    assert result.get("unknown_labels")
