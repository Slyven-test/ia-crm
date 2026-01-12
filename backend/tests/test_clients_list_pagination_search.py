def _headers(user_id: int) -> dict[str, str]:
    return {"X-Test-User-Id": str(user_id)}


def _create_client(client, payload, user_id: int = 1):
    response = client.post("/clients", json=payload, headers=_headers(user_id))
    assert response.status_code == 201
    return response.json()


def test_clients_pagination_and_search(client):
    payloads = [
        {
            "tenant_id": 1,
            "client_code": "A1",
            "name": "Alpha",
            "email": "alpha@example.com",
        },
        {
            "tenant_id": 1,
            "client_code": "B1",
            "name": "Beta",
            "email": "beta@domain.com",
        },
        {
            "tenant_id": 1,
            "client_code": "C1",
            "name": "Gamma",
            "email": "gamma@example.com",
        },
    ]
    for payload in payloads:
        _create_client(client, payload)

    response = client.get("/clients", params={"limit": 2, "offset": 0}, headers=_headers(1))
    assert response.status_code == 200
    assert len(response.json()) == 2

    response = client.get("/clients", params={"limit": 2, "offset": 2}, headers=_headers(1))
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get("/clients", params={"q": "b1"}, headers=_headers(1))
    assert response.status_code == 200
    payload = response.json()
    assert {item["client_code"] for item in payload} == {"B1"}

    response = client.get("/clients", params={"q": "@domain.com"}, headers=_headers(1))
    assert response.status_code == 200
    payload = response.json()
    assert {item["client_code"] for item in payload} == {"B1"}


def test_clients_conflict_returns_409(client):
    payload = {
        "tenant_id": 1,
        "client_code": "D1",
        "name": "Delta",
        "email": "delta@example.com",
    }
    _create_client(client, payload)

    response = client.post("/clients", json=payload, headers=_headers(1))
    assert response.status_code == 409


def test_clients_visibility_and_ownership(client):
    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "A1",
            "name": "Alpha",
            "email": "alpha@example.com",
        },
        user_id=1,
    )

    response = client.get("/clients", headers=_headers(2))
    assert response.status_code == 200
    assert {item["client_code"] for item in response.json()} == set()

    response = client.put(
        "/clients/A1",
        json={"name": "Alpha Updated"},
        headers=_headers(2),
    )
    assert response.status_code in {403, 404}

    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "B1",
            "name": "Beta",
            "email": "beta@example.com",
            "visibility": "tenant",
        },
        user_id=1,
    )

    response = client.get("/clients", headers=_headers(2))
    assert response.status_code == 200
    assert {item["client_code"] for item in response.json()} == {"B1"}
