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


def test_client_notes_access_control(client):
    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "C1",
            "name": "Client One",
            "email": "c1@example.com",
        },
        user_id=1,
    )

    response = client.post(
        "/clients/C1/notes",
        json={"title": "Note", "body": "Private note"},
        headers=_headers(1),
    )
    assert response.status_code == 201

    response = client.get("/clients/C1/notes", headers=_headers(2))
    assert response.status_code == 404

    response = client.put(
        "/clients/C1",
        json={"visibility": "tenant"},
        headers=_headers(1),
    )
    assert response.status_code == 200

    response = client.get("/clients/C1/notes", headers=_headers(2))
    assert response.status_code == 200
    notes = response.json()
    assert len(notes) == 1
    assert notes[0]["body"] == "Private note"


def test_taste_dimensions_and_scoring(client):
    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "C2",
            "name": "Client Two",
            "email": "c2@example.com",
            "visibility": "tenant",
        },
        user_id=1,
    )
    response = client.put(
        "/clients/C2",
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
        user_id=1,
    )

    response = client.post(
        "/taste-dimensions",
        json={"key": "aroma_fruit", "label": "Fruit", "weight": 1.0, "is_active": True},
        headers=_headers(1),
    )
    assert response.status_code == 201

    response = client.get(
        "/clients/C2/taste-scores",
        params={"limit": 10},
        headers=_headers(2),
    )
    assert response.status_code == 200
    scores = response.json()
    assert scores[0]["product_key"] == "P1"
    assert scores[0]["score"] == 1.0
