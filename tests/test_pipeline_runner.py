import importlib
import json
from pathlib import Path


def test_pipeline_runner_generates_exports(tmp_path, monkeypatch):
    db_url = f"sqlite:///{tmp_path/'pipeline.db'}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("DB_STRICT_STARTUP", raising=False)

    import backend.app.database as db_module
    import backend.app.models as models_module
    import backend.app.cli.run_pipeline as runner

    importlib.reload(db_module)
    importlib.reload(models_module)
    importlib.reload(runner)

    result = runner.run_pipeline(output_dir=tmp_path / "exports", tenant_id=1)

    exports = result["exports"]
    for path in exports.values():
        assert Path(path).exists()
        assert Path(path).stat().st_size > 0

    summary = json.loads(Path(exports["run_summary"]).read_text())
    assert summary.get("gate_export") is not None
    assert summary.get("audit_score") is not None
