import pytest
from pydantic import ValidationError

from backend.app.schemas import ClientRead, ClientCreate, ClientUpdate

def test_clientread_invalid_email_becomes_none():
    obj = {
        "id": 1,
        "tenant_id": 123,
        "client_code": "C001",
        "name": "Test",
        "email": "not-an-email",
    }
    m = ClientRead.model_validate(obj)
    assert m.email is None

def test_clientread_blank_email_becomes_none():
    obj = {
        "id": 1,
        "tenant_id": 123,
        "client_code": "C002",
        "name": "Test",
        "email": "   ",
    }
    m = ClientRead.model_validate(obj)
    assert m.email is None

def test_clientread_valid_email_is_preserved_and_stripped():
    obj = {
        "id": 1,
        "tenant_id": 123,
        "client_code": "C003",
        "name": "Test",
        "email": "  test@example.com ",
    }
    m = ClientRead.model_validate(obj)
    assert m.email == "test@example.com"

def test_clientcreate_rejects_invalid_email_input():
    obj = {
        "tenant_id": 123,
        "client_code": "C004",
        "name": "Test",
        "email": "not-an-email",
    }
    with pytest.raises(ValidationError):
        ClientCreate.model_validate(obj)

def test_clientupdate_rejects_invalid_email_when_provided():
    with pytest.raises(ValidationError):
        ClientUpdate.model_validate({"email": "not-an-email"})
