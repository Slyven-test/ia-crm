import json


def _headers(user_id: int) -> dict[str, str]:
    return {"X-Test-User-Id": str(user_id)}


def _create_client(client, payload, user_id: int = 1):
    response = client.post("/clients", json=payload, headers=_headers(user_id))
    assert response.status_code == 201
    return response.json()


def _create_product(client, payload, user_id: int = 1):
    response = client.post("/products", json=payload, headers=_headers(user_id))
    assert response.status_code == 201
    return response.json()


def _create_dimension(client, payload, user_id: int = 1):
    response = client.post("/taste-dimensions", json=payload, headers=_headers(user_id))
    assert response.status_code == 201
    return response.json()


def test_recommendations_ranking_and_listing(client):
    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "C1",
            "name": "Client One",
            "email": "c1@example.com",
            "visibility": "tenant",
        },
    )
    response = client.put(
        "/clients/C1",
        json={"aroma_profile": json.dumps({"aroma_fruit": 5})},
        headers=_headers(1),
    )
    assert response.status_code == 200

    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P1",
            "name": "Product One",
            "family_crm": "Blanc",
            "sub_family": "Alsace",
            "aroma_fruit": 5,
            "visibility": "tenant",
        },
    )
    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P2",
            "name": "Product Two",
            "family_crm": "Blanc",
            "sub_family": "Alsace",
            "aroma_fruit": 1,
            "visibility": "tenant",
        },
    )

    _create_dimension(
        client,
        {"key": "aroma_fruit", "label": "Fruit", "weight": 1.0, "is_active": True},
    )

    response = client.post(
        "/clients/C1/recommendations/run",
        json={"scenario": "cross-sell", "limit": 10},
        headers=_headers(1),
    )
    assert response.status_code == 200
    computed = response.json()
    assert computed[0]["product_key"] == "P1"
    assert 0 <= computed[0]["score"] <= 1

    response = client.get("/clients/C1/recommendations", headers=_headers(1))
    assert response.status_code == 200
    recos = response.json()
    assert recos[0]["product_key"] == "P1"


def test_recommendations_access_control(client):
    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "C2",
            "name": "Private Client",
            "email": "c2@example.com",
        },
        user_id=1,
    )
    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P3",
            "name": "Product Three",
            "family_crm": "Rouge",
            "sub_family": "Bordeaux",
            "visibility": "tenant",
        },
        user_id=1,
    )
    _create_dimension(
        client,
        {"key": "aroma_fruit", "label": "Fruit", "weight": 1.0, "is_active": True},
        user_id=1,
    )

    response = client.post(
        "/clients/C2/recommendations/run",
        json={"scenario": "cross-sell", "limit": 5},
        headers=_headers(2),
    )
    assert response.status_code == 404

    response = client.get("/clients/C2/recommendations", headers=_headers(2))
    assert response.status_code == 404


def test_recommendations_listing_no_leak_and_approval(client):
    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "C3",
            "name": "Client Three",
            "email": "c3@example.com",
        },
        user_id=1,
    )
    response = client.put(
        "/clients/C3",
        json={"aroma_profile": json.dumps({"aroma_fruit": 3})},
        headers=_headers(1),
    )
    assert response.status_code == 200

    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P4",
            "name": "Product Four",
            "family_crm": "Rouge",
            "sub_family": "Bordeaux",
            "aroma_fruit": 3,
            "visibility": "tenant",
        },
        user_id=1,
    )
    _create_dimension(
        client,
        {"key": "aroma_fruit", "label": "Fruit", "weight": 1.0, "is_active": True},
        user_id=1,
    )

    response = client.post(
        "/clients/C3/recommendations/run",
        json={"scenario": "cross-sell", "limit": 5},
        headers=_headers(1),
    )
    assert response.status_code == 200

    response = client.get("/recommendations", headers=_headers(2))
    assert response.status_code == 200
    assert response.json() == []

    response = client.put(
        "/clients/C3",
        json={"visibility": "tenant"},
        headers=_headers(1),
    )
    assert response.status_code == 200

    response = client.get("/recommendations", headers=_headers(2))
    assert response.status_code == 200
    recos = response.json()
    assert len(recos) == 1

    reco_id = recos[0]["id"]
    response = client.patch(
        f"/recommendations/{reco_id}",
        json={"is_approved": True},
        headers=_headers(1),
    )
    assert response.status_code == 200

    response = client.get("/recommendations", params={"approved_only": True}, headers=_headers(2))
    assert response.status_code == 200
    approved = response.json()
    assert len(approved) == 1
    assert approved[0]["id"] == reco_id
