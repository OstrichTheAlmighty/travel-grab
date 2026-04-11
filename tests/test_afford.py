from fastapi.testclient import TestClient

from backend.coach_afford import (
    simulate_afford,
    format_afford_response,
    build_afford_response,
    max_safe_spend,
)
from backend.main import app


def cash_base():
    return {
        "forecast_end_balance": 500.0,
        "safe_to_spend_per_day_budget": 20.0,
        "days_remaining": 10,
        "days_elapsed": 10,
        "days_total": 20,
        "spending_to_date": 800.0,
        "spend_daily_current": 80.0,
        "target_spend_daily_budget": 90.0,
        "income_daily": 100.0,
        "starting_balance": 1000.0,
        "as_of": "2026-02-05",
    }


def test_small_spend_is_risky_not_no():
    cash = cash_base()
    cash["forecast_end_balance"] = -50.0
    cash["safe_to_spend_per_day_budget"] = -1.0
    scenario = simulate_afford(25.0, cash)
    assert scenario.verdict == "YES_RISKY"


def test_spend_introduces_shortfall_is_no():
    cash = cash_base()
    cash["forecast_end_balance"] = 50.0
    cash["safe_to_spend_per_day_budget"] = -10.0
    cash["spending_to_date"] = 950.0
    cash["spend_daily_current"] = 95.0
    scenario = simulate_afford(100.0, cash)
    assert scenario.verdict == "NO_UNSAFE"


def test_positive_forecast_under_pace_is_yes_safe():
    cash = cash_base()
    cash["forecast_end_balance"] = 300.0
    cash["safe_to_spend_per_day_budget"] = 15.0
    cash["target_spend_daily_budget"] = 100.0
    cash["spend_daily_current"] = 80.0
    scenario = simulate_afford(25.0, cash)
    assert scenario.verdict == "YES_SAFE"


def test_formatting_includes_sections():
    cash = cash_base()
    cash["forecast_end_balance"] = -50.0
    cash["safe_to_spend_per_day_budget"] = -1.0
    scenario = simulate_afford(25.0, cash)
    out = format_afford_response(scenario, beginner_mode=False)
    assert "headline" in out
    assert "why" in out
    assert "impact" in out
    assert "next_step" in out


def test_amount_changes_after_end_balance():
    cash = cash_base()
    s_small = simulate_afford(25.0, cash)
    s_large = simulate_afford(250.0, cash)
    diff = s_large.after_end_balance - s_small.after_end_balance
    assert round(diff, 2) == -225.0


def test_verdict_shifts_with_large_amount():
    cash = cash_base()
    cash["forecast_end_balance"] = 500.0
    cash["safe_to_spend_per_day_budget"] = 20.0
    small = simulate_afford(25.0, cash)
    large = simulate_afford(2500.0, cash)
    assert small.verdict == "YES_SAFE"
    assert large.verdict in {"YES_RISKY", "NO_UNSAFE"}


def test_afford_response_uses_amount_not_cached():
    cash = cash_base()
    max_safe = max_safe_spend(cash)
    s1 = simulate_afford(25.0, cash)
    s2 = simulate_afford(250.0, cash)
    r1 = build_afford_response(s1, max_safe)
    r2 = build_afford_response(s2, max_safe)
    assert r1["after_end_balance"] != r2["after_end_balance"]


def test_max_safe_spend_uses_projected_balance_minus_fixed_buffer():
    cash = {
        "starting_balance": 0.0,
        "income_to_date": 1173.33,
        "spending_to_date": 638.28,
        "forecast_income_total": 3200.0,
        "forecast_spending_total": 1739.95,
        "forecast_end_balance": 1460.05,
    }
    assert round(max_safe_spend(cash), 2) == 704.31


def test_max_safe_spend_allows_negative_values():
    cash = {
        "income_to_date": 0.0,
        "spending_to_date": 0.0,
        "forecast_income_total": 100.0,
        "forecast_spending_total": 500.0,
    }
    assert round(max_safe_spend(cash), 2) == -500.0


def test_affordability_policy_on_sample_month():
    client = TestClient(app)
    user = "test_afford_policy_sample_month"

    client.delete("/transactions", params={"user_id": user})
    client.post(
        "/budget",
        json={
            "user_id": user,
            "period": "monthly",
            "income_amount": 3200,
            "allocations": {
                "Bills": 1400,
                "Groceries": 250,
                "Food": 120,
                "Entertainment": 80,
                "Transportation": 100,
            },
        },
    )
    client.post("/transactions/sample-month", json={"user_id": user, "as_of": "2026-04-11"})

    expected = {
        25: "SAFE",
        500: "SAFE",
        700: "SAFE",
        750: "TIGHT",
        800: "NOT_RECOMMENDED",
        900: "NOT_RECOMMENDED",
        1000: "NOT_RECOMMENDED",
        1300: "NOT_RECOMMENDED",
        1500: "NOT_RECOMMENDED",
    }

    for amount, verdict in expected.items():
        response = client.post(
            "/afford",
            json={"user_id": user, "period": "monthly", "amount": amount, "as_of": "2026-04-11"},
        )
        body = response.json()
        assert response.status_code == 200
        assert round(body["max_safe_spend"], 2) == 704.31
        assert round(body["protected_balance"], 2) == 0.0
        assert round(body["projected_balance_before_purchase"], 2) == 924.70
        assert round(body["before_end_balance"], 2) == 924.70
        assert body["decision_state"] == verdict


def test_afford_response_exposes_correct_projected_balances():
    client = TestClient(app)
    user = "test_afford_projected_balance_binding"

    client.delete("/transactions", params={"user_id": user})
    client.post(
        "/budget",
        json={
            "user_id": user,
            "period": "monthly",
            "income_amount": 3200,
            "allocations": {
                "Bills": 1400,
                "Groceries": 250,
                "Food": 120,
                "Entertainment": 80,
                "Transportation": 100,
            },
        },
    )
    client.post("/transactions/sample-month", json={"user_id": user, "as_of": "2026-04-11"})

    expected_after = {
        25: 899.70,
        705: 219.70,
        1000: -75.30,
    }

    for amount, projected_after in expected_after.items():
        response = client.post(
            "/afford",
            json={"user_id": user, "period": "monthly", "amount": amount, "as_of": "2026-04-11"},
        )
        body = response.json()
        assert response.status_code == 200
        assert round(body["projected_balance_before_purchase"], 2) == 924.70
        assert round(body["before_end_balance"], 2) == 924.70
        assert round(body["projected_balance_after_purchase"], 2) == projected_after
        assert round(body["after_end_balance"], 2) == projected_after
