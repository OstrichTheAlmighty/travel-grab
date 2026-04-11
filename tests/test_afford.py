from backend.coach_afford import (
    simulate_afford,
    format_afford_response,
    build_afford_response,
    max_safe_spend,
)


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
