import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import models
from backend.app.database import Base, get_db
from backend.app.routers.auth import get_current_user
from backend.app import main as app_main


@pytest.fixture()
def app():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    tenant = models.Tenant(id=1, name="Tenant 1")
    user = models.User(
        id=1,
        username="test-user",
        email="test@example.com",
        hashed_password="not-used",
        is_active=True,
        is_superuser=False,
        tenant_id=1,
    )
    db.add_all([tenant, user])
    db.commit()
    db.close()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user():
        db = TestingSessionLocal()
        try:
            return db.query(models.User).filter(models.User.id == 1).first()
        finally:
            db.close()

    app_main.engine = engine
    app = app_main.create_app()
    app.state.session_local = TestingSessionLocal
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield app
    app.dependency_overrides.clear()


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture()
def db_session(app):
    SessionLocal = app.state.session_local
    db = SessionLocal()
    try:
        yield db
        db.commit()
    finally:
        db.close()
