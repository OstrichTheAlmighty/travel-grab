import datetime


def parse_transaction_date(transaction):
    value = transaction.get("date")
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    return datetime.date.fromisoformat(str(value))


def monthly_spending_totals(transactions):
    totals = {}
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        category = str(tx.get("category") or "Other")
        totals[category] = totals.get(category, 0.0) + abs(amount)
    return totals


def monthly_income_total(transactions):
    seen = set()
    total = 0.0
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        category = str(tx.get("category") or "")
        if amount <= 0 and category != "Income":
            continue
        identity = (
            str(tx.get("date") or ""),
            str(tx.get("merchant") or "").strip().lower(),
            round(abs(amount), 2),
            category,
            str(tx.get("source") or "").strip().lower(),
        )
        if identity in seen:
            continue
        seen.add(identity)
        total += abs(amount)
    return total


def is_income_transaction(transaction):
    amount = float(transaction.get("amount", 0.0))
    if amount <= 0:
        return False
    category = str(transaction.get("category") or "").strip().lower()
    merchant = str(transaction.get("merchant") or "").strip().lower()
    blocked_words = [
        "transfer",
        "savings",
        "credit card",
        "card payment",
        "payment",
        "autopay",
        "venmo",
        "zelle",
    ]
    if any(word in merchant for word in blocked_words):
        return False
    income_words = ["income", "payroll", "salary", "paycheck", "direct deposit", "employer"]
    return category == "income" or any(word in merchant for word in income_words)


def _income_cadence(dates):
    if len(dates) <= 1:
        return "monthly"
    sorted_dates = sorted(dates)
    gaps = [(right - left).days for left, right in zip(sorted_dates, sorted_dates[1:]) if (right - left).days > 0]
    if not gaps:
        return "monthly"
    median_gap = sorted(gaps)[len(gaps) // 2]
    if median_gap <= 9:
        return "weekly"
    if median_gap <= 16:
        return "biweekly"
    if median_gap <= 20:
        return "semi-monthly"
    return "monthly"


def detect_income_sources(transactions, month_start, month_end, fallback_income=0.0):
    grouped = {}
    seen = set()
    for tx in transactions:
        if not is_income_transaction(tx):
            continue
        amount = abs(float(tx.get("amount", 0.0)))
        tx_date = parse_transaction_date(tx)
        merchant = str(tx.get("merchant") or "Income").strip() or "Income"
        identity = (tx_date.isoformat(), merchant.lower(), round(amount, 2))
        if identity in seen:
            continue
        seen.add(identity)
        key = merchant.lower()
        grouped.setdefault(key, {"merchant": merchant, "amounts": [], "dates": [], "month_amounts": []})
        grouped[key]["amounts"].append(amount)
        grouped[key]["dates"].append(tx_date)
        if month_start <= tx_date <= month_end:
            grouped[key]["month_amounts"].append(amount)

    sources = []
    for group in grouped.values():
        month_amounts = group["month_amounts"]
        if not month_amounts:
            continue
        cadence = _income_cadence(group["dates"])
        typical_amount = sorted(month_amounts)[len(month_amounts) // 2]
        month_sum = sum(month_amounts)
        if len(month_amounts) > 1 and len({round(amount, 2) for amount in month_amounts}) == 1:
            monthly_amount = typical_amount
            cadence_label = f"{cadence} (duplicate-safe)"
        elif cadence == "weekly":
            monthly_amount = typical_amount * 4.33
            cadence_label = "weekly"
        elif cadence == "biweekly":
            monthly_amount = typical_amount * 2.17
            cadence_label = "biweekly"
        elif cadence == "semi-monthly":
            monthly_amount = typical_amount * 2
            cadence_label = "semi-monthly"
        else:
            monthly_amount = month_sum
            cadence_label = "monthly"
        sources.append(
            {
                "merchant": group["merchant"],
                "cadence": cadence_label,
                "detected_monthly_amount": float(monthly_amount),
            }
        )

    detected_total = sum(source["detected_monthly_amount"] for source in sources)
    if fallback_income and detected_total > float(fallback_income) * 1.25:
        detected_total = float(fallback_income)
    return sources, float(detected_total)


def planned_surplus(income, essentials, flexible_limit):
    return float(income) - float(essentials) - float(flexible_limit)


def estimate_budget_from_transactions(
    transactions,
    month_start,
    month_end,
    roles,
    budget_categories,
    manual_income=0.0,
    demo_default_income=3200.0,
    required_weekly_goal_savings=0.0,
):
    month_transactions = [
        tx for tx in transactions
        if month_start <= parse_transaction_date(tx) <= month_end
    ]
    income_from_transactions = monthly_income_total(month_transactions)
    if float(manual_income or 0.0) > 0:
        income = float(manual_income)
    elif income_from_transactions > 0:
        income = income_from_transactions
    else:
        income = float(demo_default_income)

    totals = monthly_spending_totals(month_transactions)
    essential_spending = sum(
        amount
        for category, amount in totals.items()
        if roles.get(category, "flexible") in {"protected", "essential"}
    )
    baseline_flexible_spending = sum(
        amount
        for category, amount in totals.items()
        if roles.get(category, "flexible") == "flexible"
    )
    required_monthly_goal_savings = max(0.0, float(required_weekly_goal_savings or 0.0) * 4.33)
    available_after_essentials = float(income) - float(essential_spending)
    recommended_flexible_limit = max(0.0, available_after_essentials - required_monthly_goal_savings)
    essentials_exceed_income = essential_spending > income
    goal_achievable = available_after_essentials >= required_monthly_goal_savings
    baseline_allocations = {category: float(totals.get(category, 0.0)) for category in budget_categories}
    minimum_flexible_spending = baseline_flexible_spending * 0.50 if baseline_flexible_spending > 0 else 0.0
    best_possible_flexible_limit = max(recommended_flexible_limit, minimum_flexible_spending)
    effective_flexible_limit = recommended_flexible_limit if goal_achievable else best_possible_flexible_limit
    allocations = {}
    for category in budget_categories:
        baseline = float(totals.get(category, 0.0))
        if roles.get(category, "flexible") == "flexible":
            if baseline_flexible_spending > 0:
                allocations[category] = effective_flexible_limit * (baseline / baseline_flexible_spending)
            else:
                allocations[category] = 0.0
        else:
            allocations[category] = baseline

    return {
        "income_amount": float(income),
        "income_from_transactions": float(income_from_transactions),
        "baseline_allocations": baseline_allocations,
        "allocations": allocations,
        "essential_spending": float(essential_spending),
        "flexible_spending_limit": float(recommended_flexible_limit),
        "effective_flexible_limit": float(effective_flexible_limit),
        "minimum_flexible_spending": float(minimum_flexible_spending),
        "baseline_flexible_spending": float(baseline_flexible_spending),
        "required_monthly_goal_savings": float(required_monthly_goal_savings),
        "goal_budget_shortfall": max(0.0, required_monthly_goal_savings - available_after_essentials),
        "goal_achievable_with_current_rules": goal_achievable,
        "essentials_exceed_income": essentials_exceed_income,
        "category_budget_mode": "best possible budget" if not goal_achievable else "recommended budget",
        "planned_surplus": planned_surplus(income, essential_spending, effective_flexible_limit),
    }
