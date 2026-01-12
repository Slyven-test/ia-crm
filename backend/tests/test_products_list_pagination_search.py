from backend.app import models


def test_products_pagination_and_search(client, db_session):
    db_session.add_all(
        [
            models.Product(
                product_key="P1",
                name="Pinot Blanc",
                family_crm="Blanc",
                sub_family="Alsace",
                tenant_id=1,
            ),
            models.Product(
                product_key="P2",
                name="Pinot Noir",
                family_crm="Rouge",
                sub_family="Bourgogne",
                tenant_id=1,
            ),
            models.Product(
                product_key="P3",
                name="Rose de Provence",
                family_crm="Rose",
                sub_family="Provence",
                tenant_id=1,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/products", params={"limit": 2, "offset": 0})
    assert response.status_code == 200
    assert len(response.json()) == 2

    response = client.get("/products", params={"limit": 2, "offset": 2})
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get("/products", params={"q": "P2"})
    assert response.status_code == 200
    payload = response.json()
    assert [item["product_key"] for item in payload] == ["P2"]

    response = client.get("/products", params={"q": "Noir"})
    assert response.status_code == 200
    payload = response.json()
    assert [item["product_key"] for item in payload] == ["P2"]

    response = client.get("/products", params={"q": "Blanc"})
    assert response.status_code == 200
    payload = response.json()
    assert [item["product_key"] for item in payload] == ["P1"]

    response = client.get("/products", params={"q": "Provence"})
    assert response.status_code == 200
    payload = response.json()
    assert [item["product_key"] for item in payload] == ["P3"]


def test_products_conflict_returns_409(client, db_session):
    db_session.add(
        models.Product(
            product_key="P4",
            name="Syrah",
            family_crm="Rouge",
            sub_family="Rhone",
            tenant_id=1,
        )
    )
    db_session.commit()

    response = client.post(
        "/products",
        json={
            "tenant_id": 1,
            "product_key": "P4",
            "name": "Syrah",
            "family_crm": "Rouge",
            "sub_family": "Rhone",
        },
    )
    assert response.status_code == 409
