import datetime as dt


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


def test_sales_create_updates_metrics_and_profile(client):
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
    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P1",
            "name": "Product One",
            "family_crm": "Blanc",
            "sub_family": "Alsace",
        },
        user_id=1,
    )

    sale_date = dt.datetime.utcnow().replace(microsecond=0).isoformat()
    response = client.post(
        "/sales",
        json={
            "tenant_id": 1,
            "document_id": "S1",
            "client_code": "C1",
            "product_key": "P1",
            "amount": 100,
            "quantity": 1,
            "sale_date": sale_date,
        },
        headers=_headers(1),
    )
    assert response.status_code == 201

    response = client.get("/clients/C1", headers=_headers(1))
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_spent"] == 100
    assert payload["total_orders"] == 1
    assert payload["average_order_value"] == 100
    assert payload["rfm_score"] == 511

    response = client.get("/clients/C1/profile", headers=_headers(1))
    assert response.status_code == 200
    profile = response.json()
    assert profile["client"]["client_code"] == "C1"
    assert len(profile["latest_sales"]) == 1
    assert profile["latest_sales"][0]["document_id"] == "S1"


def test_sales_access_control(client):
    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "C1",
            "name": "Client Private",
            "email": "private@example.com",
        },
        user_id=1,
    )
    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P1",
            "name": "Product Tenant",
            "family_crm": "Rouge",
            "sub_family": "Bordeaux",
            "visibility": "tenant",
        },
        user_id=1,
    )

    response = client.post(
        "/sales",
        json={
            "document_id": "S2",
            "client_code": "C1",
            "product_key": "P1",
            "amount": 50,
            "quantity": 1,
        },
        headers=_headers(2),
    )
    assert response.status_code == 404

    _create_client(
        client,
        {
            "tenant_id": 1,
            "client_code": "C2",
            "name": "Client Tenant",
            "email": "tenant@example.com",
            "visibility": "tenant",
        },
        user_id=1,
    )
    _create_product(
        client,
        {
            "tenant_id": 1,
            "product_key": "P2",
            "name": "Product Two",
            "family_crm": "Rouge",
            "sub_family": "Rhone",
            "visibility": "tenant",
        },
        user_id=1,
    )

    response = client.post(
        "/sales",
        json={
            "document_id": "S3",
            "client_code": "C2",
            "product_key": "P2",
            "amount": 75,
            "quantity": 1,
        },
        headers=_headers(2),
    )
    assert response.status_code == 201
