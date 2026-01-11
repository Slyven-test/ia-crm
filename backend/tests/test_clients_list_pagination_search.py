from backend.app import models


def test_clients_pagination_and_search(client, db_session):
    db_session.add_all(
        [
            models.Client(
                client_code="A1",
                name="Alpha",
                email="alpha@example.com",
                tenant_id=1,
            ),
            models.Client(
                client_code="B1",
                name="Beta",
                email="beta@domain.com",
                tenant_id=1,
            ),
            models.Client(
                client_code="C1",
                name="Gamma",
                email="gamma@example.com",
                tenant_id=1,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/clients", params={"limit": 2, "offset": 0})
    assert response.status_code == 200
    assert len(response.json()) == 2

    response = client.get("/clients", params={"limit": 2, "offset": 2})
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get("/clients", params={"q": "b1"})
    assert response.status_code == 200
    payload = response.json()
    assert [item["client_code"] for item in payload] == ["B1"]

    response = client.get("/clients", params={"q": "@domain"})
    assert response.status_code == 200
    payload = response.json()
    assert [item["client_code"] for item in payload] == ["B1"]


def test_clients_conflict_returns_409(client, db_session):
    db_session.add(
        models.Client(
            client_code="D1",
            name="Delta",
            email="delta@example.com",
            tenant_id=1,
        )
    )
    db_session.commit()

    response = client.post(
        "/clients",
        json={
            "tenant_id": 1,
            "client_code": "D1",
            "name": "Delta",
            "email": "delta@example.com",
        },
    )
    assert response.status_code == 409
