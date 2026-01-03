import os
from pathlib import Path

import importlib


def test_missing_required_column_reports_error(tmp_path: Path) -> None:
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path/'contract.db'}"

    import etl.load_postgres_multi as load_multi

    importlib.reload(load_multi)

    csv_path = tmp_path / "clients_missing.csv"
    csv_path.write_text("name,email\nAlice,alice@example.com\n", encoding="utf-8")

    result = load_multi.load_table_with_tenant("clients", str(csv_path), tenant_id="1")
    assert result["success"] is False
    assert result["error_type"] == "MissingColumns"
    assert "client_code" in result.get("missing_columns", [])
