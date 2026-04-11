from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Dict, List, Literal, Optional
from datetime import date, datetime, timedelta
import statistics
import re
import os
import time
import requests

from backend.db import init_db, DB_PATH, get_conn
from backend.coach_afford import build_afford_response, max_safe_spend, simulate_afford

app = FastAPI()
init_db()

PERIOD = Literal["weekly", "monthly"]
USER_DEFAULT = "default"
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
TRANSACTION_DATASET_EVENTS: Dict[str, Dict[str, object]] = {}


# -----------------------------
# Basic routes
# -----------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/hello")
def hello():
    return {"message": "Hello! Your backend is running."}


# -----------------------------
# Helpers
# -----------------------------
def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def is_income_category(cat: str) -> bool:
    return str(cat).strip() == "Income"


def period_bounds(as_of: date, period: PERIOD):
    if period == "weekly":
        start = as_of - timedelta(days=as_of.weekday())  # Monday
        end = start + timedelta(days=6)  # Sunday
        return start, end

    # monthly
    start = as_of.replace(day=1)
    if start.month == 12:
        next_month = start.replace(year=start.year + 1, month=1, day=1)
    else:
        next_month = start.replace(month=start.month + 1, day=1)
    end = next_month - timedelta(days=1)
    return start, end


def mad(xs: List[float]) -> float:
    med = statistics.median(xs)
    return statistics.median([abs(x - med) for x in xs])


def _mark_transaction_dataset_event(user_id: str, action: str, **details):
    event = {
        "action": action,
        "changed_at": datetime.now().isoformat(timespec="seconds"),
        **details,
    }
    TRANSACTION_DATASET_EVENTS[str(user_id)] = event
    print("TRANSACTION DATASET EVENT:", {"user_id": user_id, **event}, flush=True)


def _get_transaction_dataset_event(user_id: str) -> Dict[str, object]:
    return TRANSACTION_DATASET_EVENTS.get(str(user_id), {})


# -----------------------------
# Transactions
# -----------------------------
@app.get("/transactions")
def transactions(user_id: str = USER_DEFAULT, start: Optional[str] = None, end: Optional[str] = None):
    print(
        "LOADING TRANSACTIONS:",
        {"user_id": user_id, "start": start, "end": end},
        flush=True,
    )
    query = "SELECT date, merchant, amount, category FROM transactions WHERE user_id = ?"
    params: List[str] = []
    if start and end:
        query += " AND date >= ? AND date <= ?"
        params = [user_id, start, end]
    else:
        params = [user_id]
    query += " ORDER BY date ASC"
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
    print("LOADED TRANSACTIONS:", {"user_id": user_id, "count": len(rows)}, flush=True)
    return {"transactions": [dict(r) for r in rows]}


class NewTransaction(BaseModel):
    date: str
    merchant: str
    amount: float
    category: str
    user_id: str = USER_DEFAULT


@app.post("/transactions")
def add_transaction(tx: NewTransaction):
    print(
        "ADDING TRANSACTION:",
        {
            "user_id": tx.user_id,
            "date": tx.date,
            "merchant": tx.merchant,
            "amount": tx.amount,
            "category": tx.category,
        },
        flush=True,
    )
    # Canonical sign: income positive, spending negative.
    amt = float(tx.amount)
    cat = tx.category.strip()
    if is_income_category(cat):
        amt = abs(amt)
    else:
        amt = -abs(amt)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO transactions (date, merchant, amount, category, user_id) VALUES (?, ?, ?, ?, ?)",
            (tx.date, tx.merchant.strip(), amt, cat, tx.user_id),
        )
        conn.commit()
    _mark_transaction_dataset_event(tx.user_id, "add_transaction", amount=float(amt), category=cat, date=tx.date)
    return {"status": "ok", "inserted": {**tx.model_dump(), "amount": amt, "category": cat}}


@app.delete("/transactions")
def clear_transactions(user_id: str = USER_DEFAULT):
    print("CLEARING TRANSACTIONS:", {"user_id": user_id}, flush=True)
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM transactions WHERE user_id = ?", (user_id,))
        conn.commit()
        deleted = int(cur.rowcount or 0)
    _mark_transaction_dataset_event(user_id, "clear_transactions", deleted=deleted)
    print("CLEARED TRANSACTIONS:", {"user_id": user_id, "deleted": deleted}, flush=True)
    return {"status": "ok", "deleted": deleted}


class SampleMonthIn(BaseModel):
    user_id: str = USER_DEFAULT
    as_of: Optional[str] = None


@app.post("/transactions/sample-month")
def load_sample_month(sample: SampleMonthIn):
    as_of_d = parse_date(sample.as_of) if sample.as_of else date.today()
    month_start, month_end = period_bounds(as_of_d, "monthly")
    days_total = (month_end - month_start).days + 1
    days_elapsed = min(days_total, max(1, (as_of_d - month_start).days + 1))
    sample_progress = min(1.0, max(0.0, days_elapsed / days_total)) if days_total > 0 else 1.0

    def sample_date(day_hint: int) -> str:
        if days_total <= 1 or days_elapsed <= 1:
            return month_start.isoformat()
        scaled_index = round(((day_hint - 1) / max(1, days_total - 1)) * (days_elapsed - 1))
        return (month_start + timedelta(days=int(scaled_index))).isoformat()

    def scaled_spend(amount_value: float) -> float:
        return round(float(amount_value) * sample_progress, 2)

    sample_transactions = [
        (sample_date(2), "Employer Payroll", 3200.0, "Income", sample.user_id),
        (sample_date(3), "Apartment Rent", -scaled_spend(950.0), "Bills", sample.user_id),
        (sample_date(8), "City Utilities", -scaled_spend(150.0), "Bills", sample.user_id),
        (sample_date(12), "Phone Plan", -scaled_spend(100.0), "Bills", sample.user_id),
        (sample_date(6), "Trader Joe's", -scaled_spend(110.0), "Groceries", sample.user_id),
        (sample_date(19), "Whole Foods", -scaled_spend(140.0), "Groceries", sample.user_id),
        (sample_date(9), "Sweetgreen", -scaled_spend(35.0), "Food", sample.user_id),
        (sample_date(15), "Chipotle", -scaled_spend(30.0), "Food", sample.user_id),
        (sample_date(22), "Neighborhood Cafe", -scaled_spend(20.0), "Food", sample.user_id),
        (sample_date(26), "Pizza Night", -scaled_spend(35.0), "Food", sample.user_id),
        (sample_date(14), "Movie Theater", -scaled_spend(35.0), "Entertainment", sample.user_id),
        (sample_date(27), "Bowling Alley", -scaled_spend(45.0), "Entertainment", sample.user_id),
        (sample_date(7), "Gas Station", -scaled_spend(40.0), "Transportation", sample.user_id),
        (sample_date(23), "Uber", -scaled_spend(50.0), "Transportation", sample.user_id),
    ]

    print(
        "LOADING SAMPLE MONTH:",
        {"user_id": sample.user_id, "as_of": as_of_d.isoformat(), "count": len(sample_transactions)},
        flush=True,
    )
    with get_conn() as conn:
        conn.execute("DELETE FROM transactions WHERE user_id = ?", (sample.user_id,))
        conn.executemany(
            "INSERT INTO transactions (date, merchant, amount, category, user_id) VALUES (?, ?, ?, ?, ?)",
            sample_transactions,
        )
        conn.commit()
    _mark_transaction_dataset_event(
        sample.user_id,
        "sample_month",
        as_of=as_of_d.isoformat(),
        loaded=len(sample_transactions),
    )
    print(
        "LOADED SAMPLE MONTH:",
        {"user_id": sample.user_id, "as_of": as_of_d.isoformat(), "count": len(sample_transactions)},
        flush=True,
    )
    return {"status": "ok", "loaded": len(sample_transactions)}


# -----------------------------
# Insights
# -----------------------------
@app.get("/insights")
def insights(user_id: str = USER_DEFAULT, period: PERIOD = "monthly", as_of: Optional[str] = None):
    if not as_of:
        as_of = date.today().isoformat()
    as_of_d = parse_date(as_of)
    start_d, end_d = period_bounds(as_of_d, period)
    data = transactions(user_id=user_id, start=start_d.isoformat(), end=as_of_d.isoformat())
    transactions_list = data["transactions"]

    income_tx = sum(abs(float(tx["amount"])) for tx in transactions_list if is_income_category(tx["category"]))
    spending = sum(abs(float(tx["amount"])) for tx in transactions_list if not is_income_category(tx["category"]))

    category_totals: Dict[str, float] = {}
    for tx in transactions_list:
        amt = float(tx["amount"])
        cat = str(tx["category"]).strip()
        if not is_income_category(cat):
            category_totals[cat] = category_totals.get(cat, 0.0) + abs(amt)

    sorted_cats = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
    top_cat = sorted_cats[0][0] if sorted_cats else None
    top_total = sorted_cats[0][1] if sorted_cats else 0.0

    if not top_cat:
        spending_msg = "You had no spending transactions in this set."
        tip = "Next step: keep tracking for a full week so we can spot patterns."
    else:
        spending_msg = f"Your biggest spending category is {top_cat}."
        tips_by_cat = {
            "Food": "Next step: try setting a weekly food budget and checking it mid-week.",
            "Shopping": "Next step: wait 24 hours before non-essential purchases to reduce impulse spending.",
            "Subscriptions": "Next step: review subscriptions and cancel anything you haven’t used in 30 days.",
        }
        tip = tips_by_cat.get(top_cat, "Next step: pick one category and try reducing it by $5–$10 this week.")

    # Attach budgeted income for context (if available)
    budget_income = 0.0
    with get_conn() as conn:
        b = conn.execute(
            """
            SELECT income_amount FROM budgets
            WHERE user_id=? AND period=? AND is_active=1
            ORDER BY updated_at DESC LIMIT 1
            """,
            (user_id, period),
        ).fetchone()
        if b:
            try:
                budget_income = float(b["income_amount"])
            except Exception:
                budget_income = 0.0

    # Use budgeted income when present; otherwise fall back to income transactions.
    income_effective = budget_income if budget_income > 0 else income_tx
    net = income_effective - spending
    net_msg = (
        "Your net change is negative, meaning you spent more than you earned."
        if net < 0
        else "Your net change is positive, meaning you earned more than you spent."
    )

    return {
        "summary": {"income": round(income_effective, 2), "spending": round(spending, 2), "net": round(net, 2)},
        "spending_by_category": category_totals,
        "top_category": top_cat,
        "top_category_total": round(top_total, 2),
        "coach_message": {"net_msg": net_msg, "spending_msg": spending_msg, "tip": tip},
        "budget_income": round(budget_income, 2),
    }


# -----------------------------
# Trends
# -----------------------------
@app.get("/trends")
def trends(user_id: str = USER_DEFAULT, period: PERIOD = "monthly", as_of: Optional[str] = None):
    if not as_of:
        as_of = date.today().isoformat()
    as_of_d = parse_date(as_of)
    start_this, end_this = period_bounds(as_of_d, period)
    if period == "weekly":
        start_last = start_this - timedelta(days=7)
        end_last = start_this - timedelta(days=1)
    else:
        prev_month = (start_this.replace(day=1) - timedelta(days=1)).replace(day=1)
        start_last, end_last = period_bounds(prev_month, "monthly")

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT date, amount, category FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?",
            (user_id, start_last.isoformat(), end_this.isoformat()),
        ).fetchall()

    tx = []
    for r in rows:
        try:
            d = datetime.strptime(str(r["date"]).strip(), "%Y-%m-%d").date()
        except Exception:
            continue
        amt = float(r["amount"])
        cat = str(r["category"]).strip()
        if not is_income_category(cat):
            tx.append({"date": d, "amount": abs(amt), "category": cat})

    def in_range(d, a, b):
        return a <= d <= b

    this_period = [t for t in tx if in_range(t["date"], start_this, as_of_d)]
    last_period = [t for t in tx if in_range(t["date"], start_last, end_last)]

    sum_this = sum(t["amount"] for t in this_period)
    sum_last = sum(t["amount"] for t in last_period)

    def by_cat(items):
        out = {}
        for t in items:
            out[t["category"]] = out.get(t["category"], 0.0) + t["amount"]
        return out

    cat_this = by_cat(this_period)
    cat_last = by_cat(last_period)

    all_cats = set(cat_this) | set(cat_last)
    deltas = {c: cat_this.get(c, 0.0) - cat_last.get(c, 0.0) for c in all_cats}
    spike_cat = max(deltas, key=lambda c: deltas[c]) if deltas else None
    spike_amt = deltas.get(spike_cat, 0.0) if spike_cat else 0.0

    if sum_last == 0 and sum_this > 0:
        trend_msg = "This is your first period with spending data."
    elif sum_last == 0 and sum_this == 0:
        trend_msg = "No spending recorded yet."
    else:
        pct = ((sum_this - sum_last) / sum_last) * 100 if sum_last > 0 else 0.0
        direction = "up" if pct > 0 else "down"
        trend_msg = f"Your spending is {direction} {abs(pct):.1f}% vs last period."

    return {
        "this_period_spending": round(sum_this, 2),
        "last_period_spending": round(sum_last, 2),
        "category_spend_this_period": {k: round(v, 2) for k, v in cat_this.items()},
        "category_spend_last_period": {k: round(v, 2) for k, v in cat_last.items()},
        "biggest_spike_category": spike_cat,
        "biggest_spike_amount": round(spike_amt, 2),
        "message": trend_msg,
    }


def _category_window_bounds(as_of_d: date, period: PERIOD):
    start_this, _ = period_bounds(as_of_d, period)
    end_this = as_of_d
    if period == "weekly":
        start_prev = start_this - timedelta(days=7)
        end_prev = start_this - timedelta(days=1)
    else:
        prev_month_end = start_this - timedelta(days=1)
        start_prev = prev_month_end.replace(day=1)
        end_prev = prev_month_end
    return start_this, end_this, start_prev, end_prev


def _category_period_summary(user_id: str, category: str, start_d: date, end_d: date) -> Dict[str, object]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT date, merchant, amount
            FROM transactions
            WHERE user_id = ? AND category = ? AND date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (user_id, category, start_d.isoformat(), end_d.isoformat()),
        ).fetchall()

    merchants: Dict[str, Dict[str, float | int | str]] = {}
    total = 0.0
    tx_count = 0
    for row in rows:
        amount = abs(float(row["amount"]))
        merchant = str(row["merchant"]).strip() or "Unknown"
        total += amount
        tx_count += 1
        merchant_row = merchants.setdefault(
            merchant,
            {"merchant": merchant, "total": 0.0, "tx_count": 0},
        )
        merchant_row["total"] = float(merchant_row["total"]) + amount
        merchant_row["tx_count"] = int(merchant_row["tx_count"]) + 1

    avg_spend = (total / tx_count) if tx_count > 0 else 0.0
    return {
        "total": round(total, 2),
        "tx_count": int(tx_count),
        "avg_spend": round(avg_spend, 2),
        "merchants": merchants,
    }


def _join_labels(labels: List[str]) -> str:
    clean = [str(label).strip() for label in labels if str(label).strip()]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return f"{clean[0]} and {clean[1]}"
    return f"{', '.join(clean[:-1])}, and {clean[-1]}"


def _build_category_explanation_text(
    *,
    category: str,
    period: PERIOD,
    current_total: float,
    previous_total: float,
    dollar_change: float,
    percent_change: Optional[float],
    current_tx_count: int,
    transaction_count_change: int,
    current_avg_spend: float,
    previous_avg_spend: float,
    top_merchants: List[Dict[str, object]],
) -> str:
    period_label = "month" if period == "monthly" else "week"
    category_lower = str(category).strip().lower()
    merchant_names = _join_labels([str(m.get("merchant", "")).strip() for m in top_merchants[:2]])

    if current_total <= 0 and previous_total <= 0:
        return f"No {category_lower} spending was recorded this {period_label} or last {period_label}."

    if previous_total <= 0:
        explanation = f"There’s no previous {period_label} data for {category} yet."
        if current_total > 0:
            explanation += f" This {period_label} you spent {_fmt_money(current_total)} across {int(current_tx_count)} transactions"
            if merchant_names:
                explanation += f", mainly at {merchant_names}"
            explanation += "."
        return explanation

    direction = "up" if dollar_change > 0 else "down" if dollar_change < 0 else "flat"
    pct_text = f" ({percent_change:+.0f}%)" if percent_change is not None else ""
    explanation = f"{category} is {direction} {_fmt_money(abs(dollar_change))}{pct_text} vs last {period_label}"
    if dollar_change > 0 and merchant_names:
        explanation += f", mainly from higher spending at {merchant_names}"
    elif dollar_change < 0 and merchant_names:
        explanation += f", mostly due to lower spending at {merchant_names}"
    explanation += "."

    avg_phrase = ""
    if current_avg_spend > previous_avg_spend + 0.01:
        avg_phrase = " and a higher average spend per transaction"
    elif current_avg_spend < previous_avg_spend - 0.01:
        avg_phrase = " and a lower average spend per transaction"

    if transaction_count_change > 0:
        explanation += f" You had {transaction_count_change} more {category_lower} transactions{avg_phrase}."
    elif transaction_count_change < 0:
        explanation += f" You had {abs(transaction_count_change)} fewer {category_lower} transactions{avg_phrase}."
    elif avg_phrase:
        explanation += f" You had the same number of {category_lower} transactions{avg_phrase}."

    return explanation


@app.get("/explain/category")
def explain_category(user_id: str = USER_DEFAULT, category: str = "", period: PERIOD = "monthly", as_of: Optional[str] = None):
    if not as_of:
        as_of = date.today().isoformat()
    as_of_d = parse_date(as_of)
    category_name = str(category).strip()
    start_this, end_this, start_prev, end_prev = _category_window_bounds(as_of_d, period)

    current = _category_period_summary(user_id, category_name, start_this, end_this)
    previous = _category_period_summary(user_id, category_name, start_prev, end_prev)

    current_total = float(current.get("total", 0.0))
    previous_total = float(previous.get("total", 0.0))
    current_tx_count = int(current.get("tx_count", 0))
    previous_tx_count = int(previous.get("tx_count", 0))
    current_avg_spend = float(current.get("avg_spend", 0.0))
    previous_avg_spend = float(previous.get("avg_spend", 0.0))
    dollar_change = round(current_total - previous_total, 2)
    percent_change = None if previous_total == 0 else round((dollar_change / previous_total) * 100.0, 1)
    transaction_count_change = current_tx_count - previous_tx_count

    current_merchants = current.get("merchants", {}) or {}
    previous_merchants = previous.get("merchants", {}) or {}
    merchant_changes: List[Dict[str, object]] = []
    delta_sign = 1 if dollar_change >= 0 else -1
    for merchant in set(current_merchants) | set(previous_merchants):
        current_merchant = current_merchants.get(merchant, {}) or {}
        previous_merchant = previous_merchants.get(merchant, {}) or {}
        merchant_delta = round(
            float(current_merchant.get("total", 0.0)) - float(previous_merchant.get("total", 0.0)),
            2,
        )
        if delta_sign > 0 and merchant_delta <= 0:
            continue
        if delta_sign < 0 and merchant_delta >= 0:
            continue
        merchant_changes.append(
            {
                "merchant": merchant,
                "current_total": round(float(current_merchant.get("total", 0.0)), 2),
                "previous_total": round(float(previous_merchant.get("total", 0.0)), 2),
                "dollar_change": merchant_delta,
                "current_tx_count": int(current_merchant.get("tx_count", 0)),
                "previous_tx_count": int(previous_merchant.get("tx_count", 0)),
            }
        )

    merchant_changes.sort(key=lambda item: abs(float(item.get("dollar_change", 0.0))), reverse=True)
    top_merchants = merchant_changes[:3]

    explanation = _build_category_explanation_text(
        category=category_name,
        period=period,
        current_total=current_total,
        previous_total=previous_total,
        dollar_change=dollar_change,
        percent_change=percent_change,
        current_tx_count=current_tx_count,
        transaction_count_change=transaction_count_change,
        current_avg_spend=current_avg_spend,
        previous_avg_spend=previous_avg_spend,
        top_merchants=top_merchants,
    )

    return {
        "category": category_name,
        "period": period,
        "as_of": as_of_d.isoformat(),
        "current_month_total": round(current_total, 2),
        "previous_month_total": round(previous_total, 2),
        "dollar_change": float(dollar_change),
        "percent_change": percent_change,
        "transaction_count_change": int(transaction_count_change),
        "current_transaction_count": int(current_tx_count),
        "previous_transaction_count": int(previous_tx_count),
        "current_avg_spend": round(current_avg_spend, 2),
        "previous_avg_spend": round(previous_avg_spend, 2),
        "top_merchants": top_merchants,
        "has_previous_data": bool(previous_total > 0 or previous_tx_count > 0),
        "explanation": explanation,
    }


# -----------------------------
# Insights bundle + Coach
# -----------------------------
class InsightsBundleOut(BaseModel):
    user_id: str
    period: PERIOD
    as_of: str
    summary: Dict[str, float]
    spending_by_category: Dict[str, float]
    top_category: Optional[str]
    top_category_total: float
    coach_message: Dict[str, str]
    budget_income: float
    trends: Dict[str, object]
    budget_report: Dict[str, object]
    cash_forecast: Dict[str, object]


@app.get("/insights_bundle", response_model=InsightsBundleOut)
def insights_bundle(user_id: str = USER_DEFAULT, period: PERIOD = "monthly", as_of: Optional[str] = None):
    if not as_of:
        as_of = date.today().isoformat()
    insights_data = insights(user_id=user_id, period=period, as_of=as_of)
    trends_data = trends(user_id=user_id, period=period, as_of=as_of)
    report_data = budget_report(user_id=user_id, period=period, as_of=as_of)
    cash_data = forecast_cash(user_id=user_id, period=period, as_of=as_of, starting_balance=0.0)

    return {
        "user_id": user_id,
        "period": period,
        "as_of": as_of,
        "summary": insights_data.get("summary", {}),
        "spending_by_category": insights_data.get("spending_by_category", {}),
        "top_category": insights_data.get("top_category"),
        "top_category_total": float(insights_data.get("top_category_total", 0.0)),
        "coach_message": insights_data.get("coach_message", {}),
        "budget_income": float(insights_data.get("budget_income", 0.0)),
        "trends": trends_data,
        "budget_report": report_data,
        "cash_forecast": cash_data,
    }


@app.get("/insight_bundle", response_model=InsightsBundleOut)
def insight_bundle(user_id: str = USER_DEFAULT, period: PERIOD = "monthly", as_of: Optional[str] = None):
    # Alias for product wording
    return insights_bundle(user_id=user_id, period=period, as_of=as_of)


class CoachRequest(BaseModel):
    question: str
    beginner_mode: bool = False
    bundle: Dict[str, object]


class AffordRequest(BaseModel):
    user_id: str = USER_DEFAULT
    period: PERIOD = "monthly"
    as_of: Optional[str] = None
    amount: float = Field(gt=0)
    beginner_mode: bool = False


class CoachResponse(BaseModel):
    headline: str
    why: List[str]
    action: str
    data_note: str
    used_bundle_keys: List[str]


class AffordCoachResponse(BaseModel):
    answer: str
    source: Literal["gemini", "deterministic"]


def _parse_amount(question: str) -> Optional[float]:
    m = re.search(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)", question)
    if not m:
        return None
    try:
        return float(m.group(1))
    except Exception:
        return None


def _fmt_money(value: float) -> str:
    return f"${float(value):,.2f}"


def _normalize_affordability_state(decision_state: str = "", verdict: str = "") -> str:
    state_key = str(decision_state or "").strip().upper()
    if state_key in {"SAFE", "TIGHT", "NOT_RECOMMENDED"}:
        return state_key

    verdict_key = str(verdict or "").strip().upper()
    if verdict_key in {"YES_SAFE", "YES", "SAFE"}:
        return "SAFE"
    if verdict_key in {"YES_RISKY", "RISKY", "TIGHT"}:
        return "TIGHT"
    return "NOT_RECOMMENDED"


def _affordability_deterministic_explanation(
    *,
    decision_state: str,
    verdict: str,
    amount: float,
    after_balance: float,
    max_safe_spend_amount: float,
) -> str:
    state_key = _normalize_affordability_state(decision_state=decision_state, verdict=verdict)

    if state_key == "SAFE":
        return "Yes — safe. This leaves a meaningful buffer after expenses."
    if state_key == "TIGHT":
        return "Tight — proceed carefully. This slightly reduces your buffer."
    if float(after_balance) < 0:
        return "No — not recommended. This risks pushing your projected balance below zero."
    return "No — not recommended. This materially reduces your buffer."


def _affordability_verdict_label(decision_state: str = "", verdict: str = "") -> str:
    state_key = _normalize_affordability_state(decision_state=decision_state, verdict=verdict)
    if state_key == "SAFE":
        return "Yes — safe"
    if state_key == "TIGHT":
        return "Tight — proceed carefully"
    return "No — not recommended"


def _is_valid_affordability_rewrite(
    *,
    answer: str,
    deterministic_explanation: str,
    decision_state: str,
    verdict: str,
    amount: float,
    after_balance: float,
    max_safe_spend_amount: float,
) -> bool:
    cleaned = str(answer or "").strip()
    if not cleaned:
        return False

    sentence_check = re.sub(r"\$[0-9,]+\.[0-9]{2}", "MONEY", cleaned)
    sentence_marks = re.findall(r"[.!?]+", sentence_check)
    if len(sentence_marks) > 2:
        return False

    verdict_label = _affordability_verdict_label(decision_state=decision_state, verdict=verdict)
    if not cleaned.startswith(verdict_label):
        return False

    required_tokens = (_fmt_money(after_balance),)
    if any(token not in cleaned for token in required_tokens):
        return False

    lower = cleaned.lower()
    state_key = _normalize_affordability_state(decision_state=decision_state, verdict=verdict)
    if state_key in {"SAFE", "TIGHT"} and "not recommended" in lower:
        return False
    if state_key == "NOT_RECOMMENDED" and "yes — safe" in lower:
        return False

    return True


def generate_ai_explanation(prompt: str) -> Optional[str]:
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        print("ERROR: GOOGLE_API_KEY missing", flush=True)
        return None

    url = f"{GEMINI_URL}/{GEMINI_MODEL}:generateContent?key={api_key}"
    logged_url = f"{GEMINI_URL}/{GEMINI_MODEL}:generateContent?key=[REDACTED]"
    response = None
    try:
        print("CALLING GEMINI", flush=True)
        print("GEMINI URL:", logged_url, flush=True)
        response = requests.post(
            url,
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ]
            },
            timeout=(3, 6),
        )
        print("GEMINI STATUS:", response.status_code, flush=True)
        print("GEMINI BODY:", response.text, flush=True)
        if response.status_code != 200:
            return None
        response_json = response.json() or {}
        print("GEMINI RESPONSE:", response_json, flush=True)
        explanation = str(response_json["candidates"][0]["content"]["parts"][0]["text"]).strip()
        return explanation or None
    except Exception as e:
        print("GEMINI STATUS:", getattr(response, "status_code", None), flush=True)
        print("GEMINI BODY:", getattr(response, "text", ""), flush=True)
        print("GEMINI ERROR:", str(e), flush=True)
        return None


def _generate_affordability_coach_explanation(
    *,
    decision_state: str = "",
    verdict: str,
    amount: float,
    before_balance: float,
    after_balance: float,
    max_safe_spend_amount: float,
) -> Dict[str, str]:
    state_key = _normalize_affordability_state(decision_state=decision_state, verdict=verdict)
    deterministic = _affordability_deterministic_explanation(
        decision_state=state_key,
        verdict=verdict,
        amount=amount,
        after_balance=after_balance,
        max_safe_spend_amount=max_safe_spend_amount,
    )

    prompt = (
        "You are a financial assistant embedded in a consumer fintech app.\n"
        "Task: Answer the question: 'Can I afford this purchase?'\n"
        "Use the provided text as the source of truth.\n"
        "Rules:\n"
        "- Respond in 2 short sentences maximum\n"
        "- First sentence: clear decision using the exact decision meaning from the source text\n"
        "- Second sentence: explain the impact on balance in plain language\n"
        "- Keep the exact meaning\n"
        "- Keep all numbers exactly the same\n"
        "- Do not change the decision state\n"
        "- SAFE means the purchase leaves a meaningful buffer after expenses\n"
        "- TIGHT means the purchase slightly reduces the user's buffer\n"
        "- NOT RECOMMENDED means the purchase materially reduces the user's buffer or risks going negative\n"
        "- Do not mention 'safe limit' or 'max safe spend'\n"
        "- Use natural phrasing like 'safe range', 'buffer', or 'threshold'\n"
        "- Treat safe-to-spend as the true affordability limit\n"
        "- Avoid robotic or overly technical wording\n"
        "- Sound like a polished finance app: calm, confident, human\n"
        "- Do not use awkward phrasing like 'leaves your projected balance'\n"
        "- Make SAFE feel lightweight, TIGHT feel cautionary, and NOT RECOMMENDED feel decisive\n"
        "- Avoid repeating the same phrasing across states\n"
        "- Do not repeat the amount unnecessarily\n"
        "- Do not add extra reasoning\n"
        "Output format examples:\n"
        "- Yes — safe. This leaves a meaningful buffer after expenses.\n"
        "- Tight — proceed carefully. This slightly reduces your buffer.\n"
        "- No — not recommended. This materially reduces your buffer.\n"
        "- No — not recommended. This risks pushing your projected balance below zero.\n"
        f"Text to rewrite:\n{deterministic}"
    )

    answer = generate_ai_explanation(prompt)
    if answer:
        return {"answer": answer, "source": "gemini"}

    return {"answer": deterministic, "source": "deterministic"}


@app.post("/coach/respond", response_model=CoachResponse | AffordCoachResponse)
def coach_respond(payload: Dict[str, object]):
    if str(payload.get("question_type", "")).strip().lower() == "affordability":
        decision_state = str(payload.get("decision_state", "")).strip()
        amount = float(payload.get("amount", 0.0) or 0.0)
        before_balance = float(payload.get("before_balance", 0.0) or 0.0)
        after_balance = float(payload.get("after_balance", 0.0) or 0.0)
        max_safe_spend_amount = float(payload.get("max_safe_spend", 0.0) or 0.0)
        verdict = str(payload.get("verdict", "")).strip() or "NO_UNSAFE"
        return _generate_affordability_coach_explanation(
            decision_state=decision_state,
            verdict=verdict,
            amount=amount,
            before_balance=before_balance,
            after_balance=after_balance,
            max_safe_spend_amount=max_safe_spend_amount,
        )

    coach_payload = CoachRequest(**payload)
    q = coach_payload.question.strip()
    b = coach_payload.bundle or {}

    summary = b.get("summary", {}) or {}
    spending_by_category = b.get("spending_by_category", {}) or {}
    trends_data = b.get("trends", {}) or {}
    report = b.get("budget_report", {}) or {}
    cash = b.get("cash_forecast", {}) or {}

    income = float(summary.get("income", 0.0))
    spending = float(summary.get("spending", 0.0))
    net = float(summary.get("net", 0.0))
    top_cat = b.get("top_category")
    top_total = float(b.get("top_category_total", 0.0))

    # Budget report quick fields
    over_budget = report.get("over_budget", []) or []
    near_budget = report.get("near_budget", []) or []
    rows = report.get("rows", []) or []
    remaining_budget = 0.0
    total_budget = 0.0
    for r in rows:
        try:
            total_budget += float(r.get("budget", 0.0))
            remaining_budget += float(r.get("remaining", 0.0))
        except Exception:
            continue

    def data_note_text() -> str:
        days_remaining = int(cash.get("days_remaining", 0))
        if days_remaining > 0:
            return f"Based on your current budget and spending with {days_remaining} days left."
        return "Based on your current saved budget and transactions."

    def simple(text: str) -> str:
        if coach_payload.beginner_mode:
            return text
        return text

    q_lower = q.lower()
    headline = ""
    why = []
    action = ""
    if "explain" in q_lower and "month" in q_lower:
        msg = trends_data.get("message", "")
        headline = f"This month you earned ${income:,.2f} and spent ${spending:,.2f}."
        why = [
            f"Net change is ${net:,.2f}.",
            f"Top category is {top_cat or 'N/A'} at ${top_total:,.2f}.",
            msg or "No trend message available.",
        ]
        action = f"Pick one category to trim this week; start with {top_cat or 'your largest spend'}."
    elif "food" in q_lower and "higher" in q_lower:
        this_food = float(trends_data.get("category_spend_this_period", {}).get("Food", 0.0))
        last_food = float(trends_data.get("category_spend_last_period", {}).get("Food", 0.0))
        delta = this_food - last_food
        if last_food == 0 and this_food == 0:
            headline = "Food spending is flat."
            why = ["No Food spending recorded for this or last period."]
        elif last_food == 0:
            headline = "Food is higher this period."
            why = [f"It moved from $0.00 last period to ${this_food:,.2f} this period."]
        else:
            pct = (delta / last_food) * 100.0
            headline = "Food is higher this period."
            why = [f"Up ${delta:,.2f} ({pct:.1f}%) vs last period."]
        action = "Set a small weekly Food cap and check it mid-week."
    elif "change" in q_lower and "week" in q_lower:
        if over_budget:
            headline = "One change to make this week."
            why = [f"Over budget: {', '.join(over_budget)}."]
            action = f"Pause or cut spending in {over_budget[0]}."
        elif near_budget:
            headline = "One change to make this week."
            why = [f"Near budget: {', '.join(near_budget)}."]
            action = f"Reduce spending in {near_budget[0]}."
        elif top_cat:
            headline = "One change to make this week."
            why = [f"Top spend is {top_cat} at ${top_total:,.2f}."]
            action = f"Trim {top_cat} by $10–$25 this week."
        else:
            headline = "Not enough data yet."
            why = ["Add a few transactions this week so I can spot patterns."]
            action = "Log spending for a few days, then ask again."
    elif "afford" in q_lower:
        amt = _parse_amount(q)
        if amt is None:
            headline = "Answer: Risky."
            why = ["I couldn’t find a dollar amount to simulate the scenario."]
            action = "Ask again with a specific amount (e.g., “Can I afford $25?”)."
        elif cash:
            forecast_end = float(cash.get("forecast_end_balance", 0.0))
            safe_per_day = float(cash.get("safe_to_spend_per_day_budget", 0.0))
            days_remaining = int(cash.get("days_remaining", 0))
            target_pace = float(cash.get("target_spend_daily_budget", 0.0))

            new_end = forecast_end - amt
            per_day_hit = (amt / days_remaining) if days_remaining > 0 else amt
            new_safe = safe_per_day - per_day_hit

            if new_end >= 0 and new_safe >= 0:
                verdict = "Yes — spending this is safe right now."
            elif new_end >= 0:
                verdict = "Yes, but risky."
            else:
                verdict = "No."

            headline = verdict
            why = [
                f"You’re currently pacing about ${target_pace:,.2f}/day.",
                f"Impact: end-of-month balance ${forecast_end:,.2f} → ${new_end:,.2f}.",
            ]
            action = (
                f"Guardrail: If you expect more discretionary purchases, keep any additional spend under "
                f"${max(0.0, new_safe):,.2f}/day for the rest of the month."
            )
        elif total_budget <= 0 and remaining_budget <= 0:
            headline = "Answer: Risky."
            why = ["I don’t have a saved budget or forecast for this period."]
            action = "Save a budget, then ask again so I can simulate the impact."
        else:
            if amt <= remaining_budget * 0.8:
                verdict = "Yes — spending this is safe right now."
            elif amt <= remaining_budget:
                verdict = "Yes, but risky."
            else:
                verdict = "No."
            headline = verdict
            why = [f"This would use ${amt:,.2f} of your remaining budget (${remaining_budget:,.2f})."]
            action = "Guardrail: If you spend this, reduce other discretionary spending this month."
    else:
        headline = "Ask me about your month."
        why = [f"Income ${income:,.2f}, spending ${spending:,.2f}, net ${net:,.2f}."]
        action = "Try: “Explain this month” or “What should I change this week?”"

    return {
        "headline": simple(headline),
        "why": why,
        "action": simple(action),
        "data_note": data_note_text(),
        "used_bundle_keys": ["summary", "spending_by_category", "trends", "budget_report"],
    }


@app.post("/afford")
def afford(payload: AffordRequest):
    as_of = payload.as_of or date.today().isoformat()
    cash = forecast_cash(
        user_id=payload.user_id,
        period=payload.period,
        as_of=as_of,
        starting_balance=0.0,
    )
    scenario = simulate_afford(float(payload.amount), cash)
    safe_limit = max_safe_spend(cash)
    response = build_afford_response(scenario, safe_limit)
    income_ahead = float(cash.get("forecast_income_total", 0.0)) - float(cash.get("income_to_date", 0.0))
    upcoming_expenses = float(cash.get("forecast_spending_total", 0.0)) - float(cash.get("spending_to_date", 0.0))
    projected_balance_before_purchase = income_ahead - upcoming_expenses
    projected_balance_after_purchase = projected_balance_before_purchase - float(payload.amount)
    response["before_end_balance"] = float(projected_balance_before_purchase)
    response["after_end_balance"] = float(projected_balance_after_purchase)
    response["projected_balance_before_purchase"] = float(projected_balance_before_purchase)
    response["projected_balance_after_purchase"] = float(projected_balance_after_purchase)
    coach = _generate_affordability_coach_explanation(
        decision_state=str(response.get("decision_state", "")),
        verdict=str(response.get("verdict", scenario.verdict)),
        amount=float(response.get("amount", payload.amount)),
        before_balance=float(response.get("before_end_balance", scenario.before_end_balance)),
        after_balance=float(response.get("after_end_balance", scenario.after_end_balance)),
        max_safe_spend_amount=float(response.get("max_safe_spend", safe_limit)),
    )
    response_dict = response
    response_dict["answer"] = coach["answer"]
    response_dict["source"] = coach["source"]
    response_dict["coach_explanation"] = coach["answer"]
    response_dict["coach_source"] = coach["source"]
    protected_balance = float(response_dict.get("protected_balance", response_dict.get("safe_threshold", 0.0)))
    print(
        "AFFORD DEBUG:",
        {
            "projected_balance_before_purchase": float(projected_balance_before_purchase),
            "safe_to_spend": float(response_dict.get("max_safe_spend", 0.0)),
            "protected_balance": float(protected_balance),
            "projected_balance_after_purchase": float(projected_balance_after_purchase),
            "verdict": str(response_dict.get("decision_state", response_dict.get("verdict", ""))),
        },
        flush=True,
    )
    print("FINAL /afford RESPONSE:", response_dict, flush=True)
    return response_dict


# ============================================================
# Budgets + Report + Anomalies + Forecast
# ============================================================

class BudgetUpsertIn(BaseModel):
    user_id: str = USER_DEFAULT
    period: PERIOD
    income_amount: float = Field(ge=0)
    allocations: Dict[str, float]


class BudgetOut(BaseModel):
    user_id: str
    period: PERIOD
    income_amount: float
    allocations: Dict[str, float]
    budget_id: int


@app.get("/budget/active", response_model=BudgetOut)
def budget_active(user_id: str = USER_DEFAULT, period: Optional[PERIOD] = None):
    with get_conn() as conn:
        if period:
            b = conn.execute(
                """
                SELECT * FROM budgets
                WHERE user_id=? AND period=? AND is_active=1
                ORDER BY updated_at DESC LIMIT 1
                """,
                (user_id, period),
            ).fetchone()
        else:
            b = conn.execute(
                """
                SELECT * FROM budgets
                WHERE user_id=? AND is_active=1
                ORDER BY updated_at DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()

        if not b:
            return {"user_id": user_id, "period": "weekly", "income_amount": 0, "allocations": {}, "budget_id": -1}

        allocs = conn.execute(
            "SELECT category, amount FROM budget_allocations WHERE budget_id=?",
            (b["id"],),
        ).fetchall()

        allocations = {str(r["category"]).strip(): float(r["amount"]) for r in allocs}

        return {
            "user_id": b["user_id"],
            "period": b["period"],
            "income_amount": float(b["income_amount"]),
            "allocations": allocations,
            "budget_id": int(b["id"]),
        }


@app.post("/budget", response_model=BudgetOut)
def budget_upsert(payload: BudgetUpsertIn):
    with get_conn() as conn:
        # deactivate current active budget for that user+period
        conn.execute(
            """
            UPDATE budgets SET is_active=0, updated_at=datetime('now')
            WHERE user_id=? AND period=? AND is_active=1
            """,
            (payload.user_id, payload.period),
        )

        cur = conn.execute(
            """
            INSERT INTO budgets(user_id, period, income_amount, is_active, created_at, updated_at)
            VALUES(?, ?, ?, 1, datetime('now'), datetime('now'))
            """,
            (payload.user_id, payload.period, float(payload.income_amount)),
        )
        budget_id = cur.lastrowid

        for cat, amt in payload.allocations.items():
            conn.execute(
                """
                INSERT INTO budget_allocations(budget_id, category, amount, created_at, updated_at)
                VALUES(?, ?, ?, datetime('now'), datetime('now'))
                """,
                (budget_id, str(cat).strip(), float(amt)),
            )

        conn.commit()

    return {
        "user_id": payload.user_id,
        "period": payload.period,
        "income_amount": float(payload.income_amount),
        "allocations": {str(k).strip(): float(v) for k, v in payload.allocations.items()},
        "budget_id": int(budget_id),
    }


class BudgetReportRow(BaseModel):
    category: str
    budget: float
    spent_ptd: float
    remaining: float
    pct_used: float


class BudgetReportOut(BaseModel):
    user_id: str
    period: PERIOD
    as_of: str
    period_start: str
    period_end: str
    rows: List[BudgetReportRow]
    over_budget: List[str]
    near_budget: List[str]


@app.get("/budget/report", response_model=BudgetReportOut)
def budget_report(user_id: str = USER_DEFAULT, period: PERIOD = "weekly", as_of: str = None):
    if not as_of:
        as_of = date.today().isoformat()

    as_of_d = parse_date(as_of)
    start_d, end_d = period_bounds(as_of_d, period)

    with get_conn() as conn:
        b = conn.execute(
            """
            SELECT * FROM budgets
            WHERE user_id=? AND period=? AND is_active=1
            ORDER BY updated_at DESC LIMIT 1
            """,
            (user_id, period),
        ).fetchone()

        if not b:
            return {
                "user_id": user_id,
                "period": period,
                "as_of": as_of,
                "period_start": start_d.isoformat(),
                "period_end": end_d.isoformat(),
                "rows": [],
                "over_budget": [],
                "near_budget": [],
            }

        allocs = conn.execute(
            "SELECT category, amount FROM budget_allocations WHERE budget_id=?",
            (b["id"],),
        ).fetchall()
        allocations = {str(r["category"]).strip(): float(r["amount"]) for r in allocs}

        txs = conn.execute(
            """
            SELECT date, amount, category FROM transactions
            WHERE user_id=? AND date >= ? AND date <= ?
            """,
            (user_id, start_d.isoformat(), as_of_d.isoformat()),
        ).fetchall()

    spend_by_cat: Dict[str, float] = {}
    for r in txs:
        amt = float(r["amount"])
        cat = str(r["category"]).strip()
        if not is_income_category(cat):
            spend_by_cat[cat] = spend_by_cat.get(cat, 0.0) + abs(amt)

    rows = []
    over, near = [], []
    for cat, budget in allocations.items():
        spent = float(spend_by_cat.get(cat, 0.0))
        remaining = float(budget) - spent
        pct = (spent / float(budget) * 100.0) if budget > 0 else 0.0
        rows.append({"category": cat, "budget": float(budget), "spent_ptd": spent, "remaining": remaining, "pct_used": pct})

        if budget > 0 and spent > budget:
            over.append(cat)
        elif budget > 0 and spent >= 0.85 * budget:
            near.append(cat)

    rows.sort(key=lambda x: x["pct_used"], reverse=True)

    return {
        "user_id": user_id,
        "period": period,
        "as_of": as_of_d.isoformat(),
        "period_start": start_d.isoformat(),
        "period_end": end_d.isoformat(),
        "rows": rows,
        "over_budget": over,
        "near_budget": [] if over else near,
    }


class ForecastRow(BaseModel):
    category: str
    spent_to_date: float
    forecast_total: float
    budget: float
    projected_over: float


class ForecastOut(BaseModel):
    user_id: str
    period: PERIOD
    as_of: str
    period_start: str
    period_end: str
    rows: List[ForecastRow]


@app.get("/forecast/eop", response_model=ForecastOut)
def forecast_eop(user_id: str = USER_DEFAULT, period: PERIOD = "monthly", as_of: str = None):
    if not as_of:
        as_of = date.today().isoformat()

    as_of_d = parse_date(as_of)
    start_d, end_d = period_bounds(as_of_d, period)

    days_elapsed = max(1, (as_of_d - start_d).days + 1)
    days_total = (end_d - start_d).days + 1
    days_remaining = max(0, days_total - days_elapsed)

    with get_conn() as conn:
        b = conn.execute(
            """
            SELECT * FROM budgets
            WHERE user_id=? AND period=? AND is_active=1
            ORDER BY updated_at DESC LIMIT 1
            """,
            (user_id, period),
        ).fetchone()

        if not b:
            return {
                "user_id": user_id,
                "period": period,
                "as_of": as_of_d.isoformat(),
                "period_start": start_d.isoformat(),
                "period_end": end_d.isoformat(),
                "rows": [],
            }

        allocs = conn.execute(
            "SELECT category, amount FROM budget_allocations WHERE budget_id=?",
            (b["id"],),
        ).fetchall()
        allocations = {str(r["category"]).strip(): float(r["amount"]) for r in allocs}

        txs = conn.execute(
            """
            SELECT date, amount, category FROM transactions
            WHERE user_id=? AND date >= ? AND date <= ?
            """,
            (user_id, start_d.isoformat(), as_of_d.isoformat()),
        ).fetchall()

    spend_by_cat: Dict[str, float] = {}
    for r in txs:
        amt = float(r["amount"])
        cat = str(r["category"]).strip()
        if not is_income_category(cat):
            spend_by_cat[cat] = spend_by_cat.get(cat, 0.0) + abs(amt)

    rows = []
    for cat, budget in allocations.items():
        spent = float(spend_by_cat.get(cat, 0.0))
        daily = spent / days_elapsed
        forecast_total = spent + daily * days_remaining
        projected_over = max(0.0, forecast_total - float(budget))
        rows.append(
            {
                "category": cat,
                "spent_to_date": spent,
                "forecast_total": float(forecast_total),
                "budget": float(budget),
                "projected_over": float(projected_over),
            }
        )

    rows.sort(key=lambda x: x["projected_over"], reverse=True)

    return {
        "user_id": user_id,
        "period": period,
        "as_of": as_of_d.isoformat(),
        "period_start": start_d.isoformat(),
        "period_end": end_d.isoformat(),
        "rows": rows,
    }

class AbovePaceCategory(BaseModel):
    category: str
    above_pace: float
    spent_to_date: float
    pace_allowed_to_date: float
    budget: float


class PacePoint(BaseModel):
    date: str
    cum_spend: float
    cum_target: float

class CashForecastOut(BaseModel):
    user_id: str
    period: PERIOD
    as_of: str
    period_start: str
    period_end: str
    starting_balance: float

    income_to_date: float
    spending_to_date: float
    transaction_count: int

    total_budget: float
    remaining_budget: float

    forecast_income_total: float
    forecast_spending_total: float
    forecast_net_total: float
    forecast_end_balance: float

    days_elapsed: int
    days_total: int
    days_remaining: int

    income_daily: float
    spend_daily_current: float

    target_spend_daily_budget: float
    safe_to_spend_per_day_budget: float

    # “most above pace right now” (top 2)
    top_above_pace_categories: List[AbovePaceCategory]

    # cumulative pace line chart data
    pace_series: List[PacePoint]


@app.get("/forecast/cash", response_model=CashForecastOut)
def forecast_cash(
    user_id: str = USER_DEFAULT,
    period: PERIOD = "monthly",
    as_of: str = None,
    starting_balance: float = 0.0,
):
    if not as_of:
        as_of = date.today().isoformat()

    as_of_d = parse_date(as_of)
    start_d, end_d = period_bounds(as_of_d, period)

    days_elapsed = max(1, (as_of_d - start_d).days + 1)
    days_total = (end_d - start_d).days + 1
    days_remaining = max(0, days_total - days_elapsed)

    # -----------------------------
    # Load active budget allocations
    # -----------------------------
    with get_conn() as conn:
        b = conn.execute(
            """
            SELECT * FROM budgets
            WHERE user_id=? AND period=? AND is_active=1
            ORDER BY updated_at DESC LIMIT 1
            """,
            (user_id, period),
        ).fetchone()

        if not b:
            return {
                "user_id": user_id,
                "period": period,
                "as_of": as_of_d.isoformat(),
                "period_start": start_d.isoformat(),
                "period_end": end_d.isoformat(),
                "starting_balance": float(starting_balance),

                "income_to_date": 0.0,
                "spending_to_date": 0.0,
                "transaction_count": 0,

                "total_budget": 0.0,
                "remaining_budget": 0.0,

                "forecast_income_total": 0.0,
                "forecast_spending_total": 0.0,
                "forecast_net_total": 0.0,
                "forecast_end_balance": float(starting_balance),

                "days_elapsed": int(days_elapsed),
                "days_total": int(days_total),
                "days_remaining": int(days_remaining),

                "income_daily": 0.0,
                "spend_daily_current": 0.0,

                "target_spend_daily_budget": 0.0,
                "safe_to_spend_per_day_budget": 0.0,

                "top_above_pace_categories": [],
                "pace_series": [],
            }

        alloc_rows = conn.execute(
            "SELECT category, amount FROM budget_allocations WHERE budget_id=?",
            (b["id"],),
        ).fetchall()
        allocations = {str(r["category"]).strip(): float(r["amount"]) for r in alloc_rows}
        total_budget = float(sum(allocations.values()))
        budget_income = float(b["income_amount"]) if b and "income_amount" in b.keys() else 0.0

        txs = conn.execute(
            """
            SELECT date, amount, category
            FROM transactions
            WHERE user_id=? AND date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (user_id, start_d.isoformat(), as_of_d.isoformat()),
        ).fetchall()

    # -----------------------------
    # Compute income/spend to date + spend by cat/day
    # -----------------------------
    income_to_date = 0.0
    spending_to_date = 0.0
    spend_by_cat: Dict[str, float] = {}
    spend_by_day: Dict[str, float] = {}

    for r in txs:
        amt = float(r["amount"])
        cat = str(r["category"]).strip()
        d = str(r["date"]).strip()

        if is_income_category(cat):
            income_to_date += abs(amt)
        else:
            spend = abs(amt)
            spending_to_date += spend
            spend_by_cat[cat] = spend_by_cat.get(cat, 0.0) + spend
            spend_by_day[d] = spend_by_day.get(d, 0.0) + spend

    remaining_budget = max(0.0, total_budget - spending_to_date)

    # -----------------------------
    # Burn-rate projection (income & spend)
    # -----------------------------
    if budget_income > 0:
        # Treat budget income as the period income target
        income_daily = budget_income / days_total if days_total > 0 else 0.0
        income_to_date = income_daily * days_elapsed
        forecast_income_total = budget_income
    else:
        income_daily = income_to_date / days_elapsed
        forecast_income_total = income_to_date + income_daily * days_remaining

    spend_daily_current = spending_to_date / days_elapsed
    forecast_spending_total = spending_to_date + spend_daily_current * days_remaining

    forecast_net_total = forecast_income_total - forecast_spending_total
    forecast_end_balance = float(starting_balance) + forecast_net_total

    # -----------------------------
    # Budget pace metrics
    # -----------------------------
    target_spend_daily_budget = (total_budget / days_total) if days_total > 0 else 0.0
    safe_to_spend_per_day_budget = (remaining_budget / days_remaining) if days_remaining > 0 else 0.0

    # -----------------------------
    # Top 2 categories “most above pace right now”
    # category pace allowed to date = budget_cat * (days_elapsed/days_total)
    # if category not in allocations => budget = 0
    # -----------------------------
    above_pace = []
    for cat, spent in spend_by_cat.items():
        budget_cat = float(allocations.get(cat, 0.0))  # missing => $0
        pace_allowed = budget_cat * (days_elapsed / days_total) if days_total > 0 else 0.0
        above = spent - pace_allowed
        if above > 0:
            above_pace.append(
                {
                    "category": cat,
                    "above_pace": float(above),
                    "spent_to_date": float(spent),
                    "pace_allowed_to_date": float(pace_allowed),
                    "budget": float(budget_cat),
                }
            )

    above_pace.sort(key=lambda x: x["above_pace"], reverse=True)
    top_above_pace = above_pace[:2]

    # -----------------------------
    # Cumulative pace line series (start -> as_of)
    # cum_target = total_budget * (elapsed_days/days_total)
    # -----------------------------
    pace_series = []
    cum_spend = 0.0
    for i in range(days_elapsed):
        day = start_d + timedelta(days=i)
        day_str = day.isoformat()
        cum_spend += float(spend_by_day.get(day_str, 0.0))
        cum_target = total_budget * ((i + 1) / days_total) if days_total > 0 else 0.0
        pace_series.append({"date": day_str, "cum_spend": float(cum_spend), "cum_target": float(cum_target)})

    return {
        "user_id": user_id,
        "period": period,
        "as_of": as_of_d.isoformat(),
        "period_start": start_d.isoformat(),
        "period_end": end_d.isoformat(),
        "starting_balance": float(starting_balance),

        "income_to_date": float(income_to_date),
        "spending_to_date": float(spending_to_date),
        "transaction_count": int(len(txs)),

        "total_budget": float(total_budget),
        "remaining_budget": float(remaining_budget),

        "forecast_income_total": float(forecast_income_total),
        "forecast_spending_total": float(forecast_spending_total),
        "forecast_net_total": float(forecast_net_total),
        "forecast_end_balance": float(forecast_end_balance),

        "days_elapsed": int(days_elapsed),
        "days_total": int(days_total),
        "days_remaining": int(days_remaining),

        "income_daily": float(income_daily),
        "spend_daily_current": float(spend_daily_current),

        "target_spend_daily_budget": float(target_spend_daily_budget),
        "safe_to_spend_per_day_budget": float(safe_to_spend_per_day_budget),

        "top_above_pace_categories": top_above_pace,
        "pace_series": pace_series,
    }


@app.get("/routes")
def routes():
    return sorted([r.path for r in app.routes])
