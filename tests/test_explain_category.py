from fastapi.testclient import TestClient

from backend.main import app


def _add_expense(client: TestClient, *, user_id: str, date: str, merchant: str, category: str, amount: float):
    response = client.post(
        "/transactions",
        json={
            "user_id": user_id,
            "date": date,
            "merchant": merchant,
            "category": category,
            "amount": amount,
        },
    )
    assert response.status_code == 200


def test_explain_category_compares_current_month_vs_previous_month():
    client = TestClient(app)
    user = "test_explain_category_compare"

    client.delete("/transactions", params={"user_id": user})

    _add_expense(client, user_id=user, date="2026-03-05", merchant="Chipotle", category="Food", amount=15.0)
    _add_expense(client, user_id=user, date="2026-03-06", merchant="Neighborhood Cafe", category="Food", amount=20.0)

    _add_expense(client, user_id=user, date="2026-04-05", merchant="Chipotle", category="Food", amount=30.0)
    _add_expense(client, user_id=user, date="2026-04-08", merchant="Pizza Night", category="Food", amount=35.0)
    _add_expense(client, user_id=user, date="2026-04-10", merchant="Chipotle", category="Food", amount=25.0)
    _add_expense(client, user_id=user, date="2026-04-11", merchant="Sweetgreen", category="Food", amount=20.0)

    response = client.get(
        "/explain/category",
        params={
            "user_id": user,
            "category": "Food",
            "period": "monthly",
            "as_of": "2026-04-30",
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert round(body["current_month_total"], 2) == 110.00
    assert round(body["previous_month_total"], 2) == 35.00
    assert round(body["dollar_change"], 2) == 75.00
    assert round(body["percent_change"], 1) == round((75.0 / 35.0) * 100.0, 1)
    assert body["transaction_count_change"] == 2
    assert [merchant["merchant"] for merchant in body["top_merchants"][:3]] == [
        "Chipotle",
        "Pizza Night",
        "Sweetgreen",
    ]
    assert "Food is up $75.00 vs last month" in body["explanation"]
    assert "Chipotle and Pizza Night" in body["explanation"]


def test_explain_category_handles_no_previous_month_data():
    client = TestClient(app)
    user = "test_explain_category_no_previous"

    client.delete("/transactions", params={"user_id": user})
    _add_expense(client, user_id=user, date="2026-04-05", merchant="Chipotle", category="Food", amount=20.0)
    _add_expense(client, user_id=user, date="2026-04-06", merchant="Pizza Night", category="Food", amount=15.0)

    response = client.get(
        "/explain/category",
        params={
            "user_id": user,
            "category": "Food",
            "period": "monthly",
            "as_of": "2026-04-30",
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert round(body["current_month_total"], 2) == 35.00
    assert round(body["previous_month_total"], 2) == 0.00
    assert body["percent_change"] is None
    assert body["has_previous_data"] is False
    assert "first month tracking Food" in body["explanation"]


def test_explain_category_handles_bills_with_no_previous_month_data():
    client = TestClient(app)
    user = "test_explain_category_bills_no_previous"

    client.delete("/transactions", params={"user_id": user})
    _add_expense(client, user_id=user, date="2026-04-02", merchant="Apartment Rent", category="Bills", amount=348.33)
    _add_expense(client, user_id=user, date="2026-04-08", merchant="City Utilities", category="Bills", amount=55.00)

    response = client.get(
        "/explain/category",
        params={
            "user_id": user,
            "category": "Bills",
            "period": "monthly",
            "as_of": "2026-04-30",
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert round(body["current_month_total"], 2) == 403.33
    assert round(body["previous_month_total"], 2) == 0.00
    assert body["has_previous_data"] is False
    assert "first month tracking Bills" in body["explanation"]
    assert "Apartment Rent and City Utilities" in body["explanation"]
