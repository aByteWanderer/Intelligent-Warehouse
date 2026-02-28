from pathlib import Path
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
import app.main as main


@pytest.fixture()
def client_and_db(monkeypatch):
    db_file = Path(tempfile.mkdtemp()) / "test_wms.db"
    engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    monkeypatch.setattr(main, "SessionLocal", testing_session)

    Base.metadata.create_all(bind=engine)
    with testing_session() as db:
        main.seed_permissions_and_admin(db)

    with TestClient(main.app) as client:
        login = client.post("/auth/login", json={"username": "admin", "password": "admin"})
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        yield client, testing_session, headers

