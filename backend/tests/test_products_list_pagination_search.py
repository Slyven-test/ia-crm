def _headers(user_id: int) -> dict[str, str]:
    return {"X-Test-User-Id": str(user_id)}


def _create_product(client, payload, user_id: int = 1):
    response = client.post("/products", json=payload, headers=_headers(user_id))
    assert response.status_code == 201
    return response.json()


def test_products_pagination_and_search(client):
    payloads = [
        {
            "tenant_id": 1,
            "product_key": "P1",
            "name": "Pinot Blanc",
            "family_crm": "Blanc",
            "sub_family": "Alsace",
        },
        {
            "tenant_id": 1,
            "product_key": "P2",
            "name": "Pinot Noir",
            "family_crm": "Rouge",
            "sub_family": "Bourgogne",
        },
        {
            "tenant_id": 1,
            "product_key": "P3",
            "name": "Rose de Provence",
            "family_crm": "Rose",
            "sub_family": "Provence",
        },
    ]
    for payload in payloads:
        _create_product(client, payload)

    response = client.get("/products", params={"limit": 2, "offset": 0}, headers=_headers(1))
    assert response.status_code == 200
    assert len(response.json()) == 2

    response = client.get("/products", params={"limit": 2, "offset": 2}, headers=_headers(1))
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get("/products", params={"q": "P2"}, headers=_headers(1))
    assert response.status_code == 200
    payload = response.json()
    assert {item["product_key"] for item in payload} == {"P2"}

    response = client.get("/products", params={"q": "Noir"}, headers=_headers(1))
    assert response.status_code == 200
    payload = response.json()
    assert {item["product_key"] for item in payload} == {"P2"}

    response = client.get("/products", params={"q": "Blanc"}, headers=_headers(1))
    assert response.status_code == 200
    payload = response.json()
    assert {item["product_key"] for item in payload} == {"P1"}

    response = client.get("/products", params={"q": "Provence"}, headers=_headers(1))
    assert response.status_code == 200
    payload = response.json()
    assert {item["product_key"] for item in payload} == {"P3"}


def test_products_conflict_returns_409(client):
    payload = {
        "tenant_id": 1,
        "product_key": "P4",
        "name": "Syrah",
        "family_crm": "Rouge",
        "sub_family": "Rhone",
    }
    _create_product(client, payload)

    response = client.post("/products", json=payload, headers=_headers(1))
    assert response.status_code == 409


def test_products_visibility_and_ownership(client):
    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P1",
            "name": "Pinot Blanc",
            "family_crm": "Blanc",
            "sub_family": "Alsace",
        },
        user_id=1,
    )

    response = client.get("/products", headers=_headers(2))
    assert response.status_code == 200
    assert {item["product_key"] for item in response.json()} == set()

    response = client.put(
        "/products/P1",
        json={"name": "Pinot Blanc Updated"},
        headers=_headers(2),
    )
    assert response.status_code in {403, 404}

    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P2",
            "name": "Pinot Noir",
            "family_crm": "Rouge",
            "sub_family": "Bourgogne",
            "visibility": "tenant",
        },
        user_id=1,
    )

    response = client.get("/products", headers=_headers(2))
    assert response.status_code == 200
    assert {item["product_key"] for item in response.json()} == {"P2"}
