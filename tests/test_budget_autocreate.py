import datetime

from frontend.budget_utils import estimate_budget_from_transactions, planned_surplus


ROLES = {
    "Bills": "protected",
    "Savings": "protected",
    "Groceries": "essential",
    "Food": "flexible",
}
CATEGORIES = ["Bills", "Savings", "Groceries", "Food"]
MONTH_START = datetime.date(2026, 5, 1)
MONTH_END = datetime.date(2026, 5, 31)


def test_manual_income_stays_after_auto_create():
    estimate = estimate_budget_from_transactions(
        [
            {"date": "2026-05-01", "merchant": "Employer Payroll", "amount": 3200.0, "category": "Income"},
            {"date": "2026-05-15", "merchant": "Employer Payroll", "amount": 3200.0, "category": "Income"},
        ],
        MONTH_START,
        MONTH_END,
        ROLES,
        CATEGORIES,
        manual_income=3200.0,
    )
    assert estimate["income_amount"] == 3200.0


def test_one_income_transaction_produces_income_once():
    estimate = estimate_budget_from_transactions(
        [{"date": "2026-05-01", "merchant": "Employer Payroll", "amount": 3200.0, "category": "Income"}],
        MONTH_START,
        MONTH_END,
        ROLES,
        CATEGORIES,
        manual_income=0.0,
    )
    assert estimate["income_amount"] == 3200.0


def test_duplicate_demo_income_is_not_counted_twice():
    duplicate = {"date": "2026-05-01", "merchant": "Employer Payroll", "amount": 3200.0, "category": "Income", "source": "demo"}
    estimate = estimate_budget_from_transactions(
        [duplicate, dict(duplicate)],
        MONTH_START,
        MONTH_END,
        ROLES,
        CATEGORIES,
        manual_income=0.0,
    )
    assert estimate["income_amount"] == 3200.0


def test_planned_surplus_formula():
    assert planned_surplus(3200.0, 2100.0, 700.0) == 400.0


def test_goal_aware_budget_targets_required_goal_savings_when_possible():
    estimate = estimate_budget_from_transactions(
        [
            {"date": "2026-05-02", "merchant": "Rent", "amount": -2600.0, "category": "Bills"},
            {"date": "2026-05-03", "merchant": "Restaurant", "amount": -900.0, "category": "Food"},
        ],
        MONTH_START,
        MONTH_END,
        ROLES,
        CATEGORIES,
        manual_income=4200.0,
        required_weekly_goal_savings=140.0,
    )
    assert round(estimate["required_monthly_goal_savings"], 2) == 606.20
    assert round(estimate["flexible_spending_limit"], 2) == 993.80
    assert round(estimate["planned_surplus"], 2) == 606.20
    assert round(estimate["allocations"]["Bills"], 2) == 2600.0
    assert round(estimate["allocations"]["Food"], 2) == 993.80
    assert estimate["category_budget_mode"] == "recommended budget"


def test_goal_aware_budget_flags_shortfall_and_uses_best_possible_budget():
    estimate = estimate_budget_from_transactions(
        [
            {"date": "2026-05-02", "merchant": "Rent", "amount": -2600.0, "category": "Bills"},
            {"date": "2026-05-03", "merchant": "Restaurant", "amount": -900.0, "category": "Food"},
        ],
        MONTH_START,
        MONTH_END,
        ROLES,
        CATEGORIES,
        manual_income=3200.0,
        required_weekly_goal_savings=140.0,
    )
    assert round(estimate["required_monthly_goal_savings"], 2) == 606.20
    assert estimate["flexible_spending_limit"] == 0.0
    assert round(estimate["planned_surplus"], 2) == 150.0
    assert round(estimate["goal_budget_shortfall"], 2) == 6.20
    assert estimate["goal_achievable_with_current_rules"] is False
    assert estimate["allocations"]["Food"] == 450.0
    assert estimate["category_budget_mode"] == "best possible budget"


def test_flexible_category_budgets_reduce_proportionally_to_limit():
    roles = {**ROLES, "Shopping": "flexible"}
    categories = CATEGORIES + ["Shopping"]
    estimate = estimate_budget_from_transactions(
        [
            {"date": "2026-05-02", "merchant": "Rent", "amount": -2000.0, "category": "Bills"},
            {"date": "2026-05-03", "merchant": "Restaurant", "amount": -600.0, "category": "Food"},
            {"date": "2026-05-04", "merchant": "Store", "amount": -300.0, "category": "Shopping"},
        ],
        MONTH_START,
        MONTH_END,
        roles,
        categories,
        manual_income=3200.0,
        required_weekly_goal_savings=200.0,
    )
    assert round(estimate["flexible_spending_limit"], 2) == 334.0
    assert round(estimate["allocations"]["Food"], 2) == round(334.0 * (600.0 / 900.0), 2)
    assert round(estimate["allocations"]["Shopping"], 2) == round(334.0 * (300.0 / 900.0), 2)


def test_essentials_over_income_warns_but_keeps_manual_income():
    estimate = estimate_budget_from_transactions(
        [
            {"date": "2026-05-02", "merchant": "Rent", "amount": -3400.0, "category": "Bills"},
            {"date": "2026-05-03", "merchant": "Restaurant", "amount": -200.0, "category": "Food"},
        ],
        MONTH_START,
        MONTH_END,
        ROLES,
        CATEGORIES,
        manual_income=3200.0,
        required_weekly_goal_savings=100.0,
    )
    assert estimate["income_amount"] == 3200.0
    assert estimate["essential_spending"] == 3400.0
    assert estimate["essentials_exceed_income"] is True
    assert estimate["flexible_spending_limit"] == 0.0
    assert estimate["allocations"]["Food"] == 100.0
