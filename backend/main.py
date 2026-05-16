from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Dict, List, Literal, Optional
from datetime import date, datetime, timedelta
import statistics
import re
import json

from backend.db import init_db, DB_PATH, get_conn
from backend.coach_afford import build_afford_response, max_safe_spend, simulate_afford

app = FastAPI()
init_db()

PERIOD = Literal["weekly", "monthly"]
USER_DEFAULT = "default"
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
COFFEE_MERCHANTS = ["starbucks", "blue bottle", "peet", "philz", "neighborhood cafe"]
DINING_MERCHANTS = ["chipotle", "sweetgreen", "doordash", "thai basil", "panera", "taco stand", "local pizza"]


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def is_income_category(cat: str) -> bool:
    return str(cat).strip() == "Income"


def normalize_category(merchant: str, category: str) -> str:
    raw_category = str(category or "").strip()
    merchant_l = str(merchant or "").lower()
    if raw_category == "Food":
        if any(name in merchant_l for name in COFFEE_MERCHANTS):
            return "Coffee"
        if any(name in merchant_l for name in DINING_MERCHANTS):
            return "Restaurants / dining"
        return "Restaurants / dining"
    return raw_category


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
    query = "SELECT date, merchant, amount, category, source, scenario FROM transactions WHERE user_id = ?"
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
    transactions_out = []
    for row in rows:
        tx = dict(row)
        tx["raw_category"] = tx["category"]
        tx["category"] = normalize_category(tx["merchant"], tx["category"])
        tx["source"] = tx.get("source") or "demo"
        tx["scenario"] = tx.get("scenario")
        transactions_out.append(tx)
    return {"transactions": transactions_out}


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
    cat = normalize_category(tx.merchant, tx.category.strip())
    if is_income_category(cat):
        amt = abs(amt)
    else:
        amt = -abs(amt)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO transactions (date, merchant, amount, category, user_id, source, scenario) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (tx.date, tx.merchant.strip(), amt, cat, tx.user_id, "manual", None),
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


class SimulateWeekIn(BaseModel):
    user_id: str = USER_DEFAULT
    as_of: Optional[str] = None
    scenario: Literal["good", "average", "overspending"]


@app.post("/transactions/sample-month")
def load_sample_month(sample: SampleMonthIn):
    as_of_d = parse_date(sample.as_of) if sample.as_of else date.today()
    month_start, month_end = period_bounds(as_of_d, "monthly")
    if month_start.month == 1:
        prior_anchor = month_start.replace(year=month_start.year - 1, month=12, day=1)
    else:
        prior_anchor = month_start.replace(month=month_start.month - 1, day=1)
    prior_month_start, prior_month_end = period_bounds(prior_anchor, "monthly")
    days_total = (month_end - month_start).days + 1
    days_elapsed = min(days_total, max(1, (as_of_d - month_start).days + 1))
    sample_progress = min(1.0, max(0.0, days_elapsed / days_total)) if days_total > 0 else 1.0

    def sample_date(day_hint: int) -> str:
        if days_total <= 1 or days_elapsed <= 1:
            return month_start.isoformat()
        scaled_index = round(((day_hint - 1) / max(1, days_total - 1)) * (days_elapsed - 1))
        return (month_start + timedelta(days=int(scaled_index))).isoformat()

    def baseline_date(day_hint: int) -> str:
        prior_days = (prior_month_end - prior_month_start).days + 1
        safe_day = min(max(1, day_hint), prior_days)
        return (prior_month_start + timedelta(days=safe_day - 1)).isoformat()

    def scaled_spend(amount_value: float) -> float:
        return round(float(amount_value), 2)

    sample_transactions = [
        (sample_date(1), "Employer Payroll", 3200.0, "Income", sample.user_id),
        (sample_date(15), "Employer Payroll", 3200.0, "Income", sample.user_id),
        (sample_date(2), "Apartment Rent", -scaled_spend(1850.0), "Bills", sample.user_id),
        (sample_date(3), "SoCal Edison", -scaled_spend(82.14), "Bills", sample.user_id),
        (sample_date(4), "City Water Utility", -scaled_spend(44.68), "Bills", sample.user_id),
        (sample_date(5), "Verizon Wireless", -scaled_spend(96.20), "Bills", sample.user_id),
        (sample_date(6), "Spectrum Internet", -scaled_spend(69.99), "Bills", sample.user_id),
        (sample_date(1), "Automatic Savings Transfer", -scaled_spend(350.0), "Savings", sample.user_id),
        (sample_date(3), "Trader Joe's", -scaled_spend(87.42), "Groceries", sample.user_id),
        (sample_date(7), "Costco", -scaled_spend(146.31), "Groceries", sample.user_id),
        (sample_date(11), "Whole Foods Market", -scaled_spend(64.27), "Groceries", sample.user_id),
        (sample_date(16), "Safeway", -scaled_spend(72.88), "Groceries", sample.user_id),
        (sample_date(21), "Trader Joe's", -scaled_spend(59.34), "Groceries", sample.user_id),
        (sample_date(27), "Target Grocery", -scaled_spend(44.16), "Groceries", sample.user_id),
        (sample_date(2), "Starbucks", -scaled_spend(6.85), "Food", sample.user_id),
        (sample_date(4), "Blue Bottle Coffee", -scaled_spend(7.40), "Food", sample.user_id),
        (sample_date(6), "Starbucks", -scaled_spend(5.95), "Food", sample.user_id),
        (sample_date(9), "Neighborhood Cafe", -scaled_spend(13.25), "Food", sample.user_id),
        (sample_date(12), "Starbucks", -scaled_spend(6.35), "Food", sample.user_id),
        (sample_date(15), "Philz Coffee", -scaled_spend(8.10), "Food", sample.user_id),
        (sample_date(18), "Starbucks", -scaled_spend(6.15), "Food", sample.user_id),
        (sample_date(22), "Peet's Coffee", -scaled_spend(7.20), "Food", sample.user_id),
        (sample_date(26), "Starbucks", -scaled_spend(5.75), "Food", sample.user_id),
        (sample_date(3), "Chipotle", -scaled_spend(16.84), "Food", sample.user_id),
        (sample_date(5), "Sweetgreen", -scaled_spend(18.62), "Food", sample.user_id),
        (sample_date(8), "Thai Basil", -scaled_spend(42.37), "Food", sample.user_id),
        (sample_date(10), "DoorDash", -scaled_spend(31.49), "Food", sample.user_id),
        (sample_date(13), "Local Pizza Co.", -scaled_spend(28.70), "Food", sample.user_id),
        (sample_date(17), "Sushi House", -scaled_spend(54.22), "Food", sample.user_id),
        (sample_date(20), "Panera Bread", -scaled_spend(14.95), "Food", sample.user_id),
        (sample_date(24), "Taco Stand", -scaled_spend(19.18), "Food", sample.user_id),
        (sample_date(29), "Italian Kitchen", -scaled_spend(63.80), "Food", sample.user_id),
        (sample_date(4), "Shell Gas", -scaled_spend(48.72), "Transportation", sample.user_id),
        (sample_date(6), "Downtown Parking", -scaled_spend(12.00), "Transportation", sample.user_id),
        (sample_date(9), "Uber", -scaled_spend(22.46), "Transportation", sample.user_id),
        (sample_date(14), "Chevron", -scaled_spend(52.18), "Transportation", sample.user_id),
        (sample_date(18), "Metro Transit", -scaled_spend(25.00), "Transportation", sample.user_id),
        (sample_date(23), "Lyft", -scaled_spend(18.64), "Transportation", sample.user_id),
        (sample_date(28), "Shell Gas", -scaled_spend(46.51), "Transportation", sample.user_id),
        (sample_date(2), "Netflix", -scaled_spend(15.49), "Subscriptions", sample.user_id),
        (sample_date(8), "Spotify", -scaled_spend(10.99), "Subscriptions", sample.user_id),
        (sample_date(14), "iCloud Storage", -scaled_spend(2.99), "Subscriptions", sample.user_id),
        (sample_date(20), "Hulu", -scaled_spend(17.99), "Subscriptions", sample.user_id),
        (sample_date(24), "Planet Fitness", -scaled_spend(29.99), "Subscriptions", sample.user_id),
        (sample_date(27), "Apple Music", -scaled_spend(10.99), "Subscriptions", sample.user_id),
        (sample_date(7), "AMC Theatres", -scaled_spend(34.50), "Entertainment", sample.user_id),
        (sample_date(12), "Bowling Alley", -scaled_spend(41.20), "Entertainment", sample.user_id),
        (sample_date(19), "Concert Tickets", -scaled_spend(88.00), "Entertainment", sample.user_id),
        (sample_date(26), "Kindle Books", -scaled_spend(18.98), "Entertainment", sample.user_id),
        (sample_date(5), "Amazon", -scaled_spend(39.84), "Shopping", sample.user_id),
        (sample_date(10), "Target", -scaled_spend(76.45), "Shopping", sample.user_id),
        (sample_date(16), "Old Navy", -scaled_spend(58.32), "Shopping", sample.user_id),
        (sample_date(22), "Amazon", -scaled_spend(24.17), "Shopping", sample.user_id),
        (sample_date(28), "Best Buy", -scaled_spend(92.61), "Shopping", sample.user_id),
        (sample_date(11), "CVS Pharmacy", -scaled_spend(18.44), "Health", sample.user_id),
        (sample_date(25), "Walgreens", -scaled_spend(23.79), "Health", sample.user_id),
        (sample_date(13), "Venmo - Birthday Gift", -scaled_spend(35.00), "Other", sample.user_id),
        (sample_date(18), "Etsy", -scaled_spend(27.45), "Other", sample.user_id),
        (sample_date(21), "Pet Supplies Plus", -scaled_spend(31.26), "Other", sample.user_id),
        (sample_date(30), "Farmers Market", -scaled_spend(22.80), "Other", sample.user_id),
    ]
    baseline_transactions = [
        (baseline_date(1), "Employer Payroll", 3200.0, "Income", sample.user_id),
        (baseline_date(15), "Employer Payroll", 3200.0, "Income", sample.user_id),
        (baseline_date(2), "Apartment Rent", -1850.0, "Bills", sample.user_id),
        (baseline_date(3), "SoCal Edison", -82.14, "Bills", sample.user_id),
        (baseline_date(5), "Verizon Wireless", -96.20, "Bills", sample.user_id),
        (baseline_date(6), "Spectrum Internet", -69.99, "Bills", sample.user_id),
        (baseline_date(1), "Automatic Savings Transfer", -350.0, "Savings", sample.user_id),
        (baseline_date(3), "Trader Joe's", -91.42, "Groceries", sample.user_id),
        (baseline_date(8), "Costco", -156.31, "Groceries", sample.user_id),
        (baseline_date(13), "Whole Foods Market", -84.27, "Groceries", sample.user_id),
        (baseline_date(19), "Safeway", -78.88, "Groceries", sample.user_id),
        (baseline_date(25), "Trader Joe's", -69.34, "Groceries", sample.user_id),
        (baseline_date(2), "Starbucks", -11.50, "Coffee", sample.user_id),
        (baseline_date(4), "Blue Bottle Coffee", -13.25, "Coffee", sample.user_id),
        (baseline_date(7), "Starbucks", -10.95, "Coffee", sample.user_id),
        (baseline_date(9), "Neighborhood Cafe", -18.25, "Coffee", sample.user_id),
        (baseline_date(12), "Starbucks", -11.35, "Coffee", sample.user_id),
        (baseline_date(15), "Philz Coffee", -14.10, "Coffee", sample.user_id),
        (baseline_date(18), "Starbucks", -10.15, "Coffee", sample.user_id),
        (baseline_date(22), "Peet's Coffee", -13.20, "Coffee", sample.user_id),
        (baseline_date(26), "Starbucks", -10.75, "Coffee", sample.user_id),
        (baseline_date(28), "Blue Bottle Coffee", -15.40, "Coffee", sample.user_id),
        (baseline_date(3), "Chipotle", -34.84, "Restaurants / dining", sample.user_id),
        (baseline_date(5), "Sweetgreen", -38.62, "Restaurants / dining", sample.user_id),
        (baseline_date(8), "Thai Basil", -72.37, "Restaurants / dining", sample.user_id),
        (baseline_date(10), "DoorDash", -61.49, "Restaurants / dining", sample.user_id),
        (baseline_date(13), "Local Pizza Co.", -58.70, "Restaurants / dining", sample.user_id),
        (baseline_date(17), "Sushi House", -84.22, "Restaurants / dining", sample.user_id),
        (baseline_date(20), "Panera Bread", -34.95, "Restaurants / dining", sample.user_id),
        (baseline_date(24), "Taco Stand", -49.18, "Restaurants / dining", sample.user_id),
        (baseline_date(27), "DoorDash", -66.80, "Restaurants / dining", sample.user_id),
        (baseline_date(29), "Italian Kitchen", -83.80, "Restaurants / dining", sample.user_id),
        (baseline_date(4), "Shell Gas", -54.72, "Transportation", sample.user_id),
        (baseline_date(6), "Downtown Parking", -18.00, "Transportation", sample.user_id),
        (baseline_date(9), "Uber", -32.46, "Transportation", sample.user_id),
        (baseline_date(14), "Chevron", -58.18, "Transportation", sample.user_id),
        (baseline_date(18), "Metro Transit", -25.00, "Transportation", sample.user_id),
        (baseline_date(23), "Lyft", -28.64, "Transportation", sample.user_id),
        (baseline_date(28), "Shell Gas", -56.51, "Transportation", sample.user_id),
        (baseline_date(2), "Netflix", -15.49, "Subscriptions", sample.user_id),
        (baseline_date(8), "Spotify", -10.99, "Subscriptions", sample.user_id),
        (baseline_date(14), "iCloud Storage", -2.99, "Subscriptions", sample.user_id),
        (baseline_date(20), "Hulu", -17.99, "Subscriptions", sample.user_id),
        (baseline_date(24), "Planet Fitness", -29.99, "Subscriptions", sample.user_id),
        (baseline_date(7), "AMC Theatres", -58.50, "Entertainment", sample.user_id),
        (baseline_date(12), "Bowling Alley", -66.20, "Entertainment", sample.user_id),
        (baseline_date(19), "Concert Tickets", -128.00, "Entertainment", sample.user_id),
        (baseline_date(26), "Kindle Books", -38.98, "Entertainment", sample.user_id),
        (baseline_date(5), "Amazon", -89.84, "Shopping", sample.user_id),
        (baseline_date(10), "Target", -136.45, "Shopping", sample.user_id),
        (baseline_date(16), "Old Navy", -118.32, "Shopping", sample.user_id),
        (baseline_date(22), "Amazon", -94.17, "Shopping", sample.user_id),
        (baseline_date(28), "Best Buy", -162.61, "Shopping", sample.user_id),
        (baseline_date(11), "CVS Pharmacy", -18.44, "Health", sample.user_id),
        (baseline_date(25), "Walgreens", -23.79, "Health", sample.user_id),
        (baseline_date(13), "Venmo - Birthday Gift", -45.00, "Other", sample.user_id),
        (baseline_date(18), "Etsy", -47.45, "Other", sample.user_id),
        (baseline_date(21), "Pet Supplies Plus", -51.26, "Other", sample.user_id),
        (baseline_date(30), "Farmers Market", -42.80, "Other", sample.user_id),
    ]

    print(
        "LOADING SAMPLE MONTH:",
        {"user_id": sample.user_id, "as_of": as_of_d.isoformat(), "count": len(sample_transactions)},
        flush=True,
    )
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?",
            (sample.user_id, prior_month_start.isoformat(), month_end.isoformat()),
        )
        conn.executemany(
            "INSERT INTO transactions (date, merchant, amount, category, user_id, source, scenario) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(*tx, "demo", None) for tx in sample_transactions],
        )
        conn.executemany(
            "INSERT INTO transactions (date, merchant, amount, category, user_id, source, scenario) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(*tx, "baseline", None) for tx in baseline_transactions],
        )
        conn.commit()
    _mark_transaction_dataset_event(
        sample.user_id,
        "sample_month",
        as_of=as_of_d.isoformat(),
        loaded=len(sample_transactions),
        baseline_loaded=len(baseline_transactions),
    )
    print(
        "LOADED SAMPLE MONTH:",
        {"user_id": sample.user_id, "as_of": as_of_d.isoformat(), "count": len(sample_transactions)},
        flush=True,
    )
    return {"status": "ok", "loaded": len(sample_transactions), "baseline_loaded": len(baseline_transactions)}


@app.post("/transactions/simulate-week")
def simulate_week(sim: SimulateWeekIn):
    as_of_d = parse_date(sim.as_of) if sim.as_of else date.today()
    week_start = as_of_d - timedelta(days=as_of_d.weekday())
    week_end = min(as_of_d, week_start + timedelta(days=6))
    elapsed_days = max(1, (week_end - week_start).days + 1)
    month_start, _ = period_bounds(as_of_d, "monthly")
    if month_start.month == 1:
        prior_anchor = month_start.replace(year=month_start.year - 1, month=12, day=1)
    else:
        prior_anchor = month_start.replace(month=month_start.month - 1, day=1)
    baseline_start, baseline_end = period_bounds(prior_anchor, "monthly")
    baseline_weeks = max(1.0, ((baseline_end - baseline_start).days + 1) / 7.0)

    def tx(day_offset: int, merchant: str, amount: float, category: str):
        d = min(week_end, week_start + timedelta(days=day_offset))
        return (d.isoformat(), merchant, -abs(float(amount)), category, sim.user_id, "simulation", sim.scenario)

    fallback_weekly = {
        "Coffee": 45.0,
        "Restaurants / dining": 125.0,
        "Shopping": 90.0,
        "Entertainment": 55.0,
        "Subscriptions": 30.0,
        "Other": 25.0,
        "Transportation": 60.0,
    }
    merchants = {
        "Coffee": {"good": "Home Coffee Supplies", "average": "Starbucks", "overspending": "Starbucks"},
        "Restaurants / dining": {"good": "Chipotle", "average": "Sweetgreen", "overspending": "DoorDash"},
        "Shopping": {"good": "Target", "average": "Amazon", "overspending": "Amazon"},
        "Entertainment": {"good": "Kindle Books", "average": "AMC Theatres", "overspending": "Concert Tickets"},
        "Subscriptions": {"good": "Spotify", "average": "Netflix", "overspending": "Streaming Bundle"},
        "Other": {"good": "Local Errand", "average": "Convenience Store", "overspending": "Impulse Purchase"},
        "Transportation": {"good": "Metro Transit", "average": "Uber", "overspending": "Lyft"},
    }
    scenario_multipliers = {
        "good": {
            "Coffee": 0.60,
            "Restaurants / dining": 0.65,
            "Shopping": 0.70,
            "Entertainment": 0.75,
            "Subscriptions": 0.90,
            "Other": 0.80,
            "Transportation": 0.90,
        },
        "average": {
            "Coffee": 1.0,
            "Restaurants / dining": 1.0,
            "Shopping": 1.0,
            "Entertainment": 1.0,
            "Subscriptions": 1.0,
            "Other": 1.0,
            "Transportation": 1.0,
        },
        "overspending": {
            "Coffee": 1.20,
            "Restaurants / dining": 1.40,
            "Shopping": 1.50,
            "Entertainment": 1.35,
            "Subscriptions": 1.0,
            "Other": 1.25,
            "Transportation": 1.10,
        },
    }

    with get_conn() as conn:
        baseline_rows = conn.execute(
            """
            SELECT merchant, category, amount
            FROM transactions
            WHERE user_id = ?
              AND amount < 0
              AND date >= ?
              AND date <= ?
              AND category IN ('Food', 'Coffee', 'Restaurants / dining', 'Shopping', 'Entertainment', 'Subscriptions', 'Other', 'Transportation')
              AND COALESCE(source, 'demo') != 'simulation'
            """,
            (sim.user_id, baseline_start.isoformat(), baseline_end.isoformat()),
        ).fetchall()
        baseline_totals = {}
        for row in baseline_rows:
            category = normalize_category(row["merchant"], row["category"])
            baseline_totals[category] = baseline_totals.get(category, 0.0) + abs(float(row["amount"] or 0.0))
        baseline_weekly = {category: amount / baseline_weeks for category, amount in baseline_totals.items()}
        for category, amount in fallback_weekly.items():
            baseline_weekly.setdefault(category, amount)

        scenario_transactions = []
        for idx, (category, weekly_amount) in enumerate(baseline_weekly.items()):
            multiplier = scenario_multipliers[sim.scenario].get(category, 1.0)
            target_to_date = weekly_amount * (elapsed_days / 7.0) * multiplier
            if target_to_date < 1:
                continue
            scenario_transactions.append(
                tx(
                    min(idx, elapsed_days - 1),
                    merchants.get(category, {}).get(sim.scenario, category),
                    round(target_to_date, 2),
                    category,
                )
            )

        cur = conn.execute(
            """
            DELETE FROM transactions
            WHERE user_id = ?
              AND date >= ?
              AND date <= ?
              AND category IN ('Food', 'Coffee', 'Restaurants / dining', 'Shopping', 'Entertainment', 'Subscriptions', 'Other', 'Transportation')
              AND COALESCE(source, 'demo') IN ('demo', 'simulation')
            """,
            (sim.user_id, week_start.isoformat(), week_end.isoformat()),
        )
        stale_sim = conn.execute(
            """
            DELETE FROM transactions
            WHERE user_id = ?
              AND COALESCE(source, 'demo') = 'simulation'
            """,
            (sim.user_id,),
        )
        conn.executemany(
            "INSERT INTO transactions (date, merchant, amount, category, user_id, source, scenario) VALUES (?, ?, ?, ?, ?, ?, ?)",
            scenario_transactions,
        )
        conn.commit()

    _mark_transaction_dataset_event(
        sim.user_id,
        "simulate_week",
        scenario=sim.scenario,
        deleted=int(cur.rowcount or 0) + int(stale_sim.rowcount or 0),
        loaded=len(scenario_transactions),
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
    )
    return {
        "status": "ok",
        "scenario": sim.scenario,
        "deleted": int(cur.rowcount or 0) + int(stale_sim.rowcount or 0),
        "loaded": len(scenario_transactions),
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
    }


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
    category_name = str(category).strip() or "This category"
    category_lower = category_name.lower()
    merchant_names = _join_labels([str(m.get("merchant", "")).strip() for m in top_merchants[:2]])

    if current_total <= 0 and previous_total <= 0:
        return f"You have not spent in {category_lower} this {period_label} or last {period_label}."

    if previous_total <= 0:
        explanation = f"This looks like your first {period_label} tracking {category_name}."
        if current_total > 0:
            explanation += f" You've spent {_fmt_money(current_total)} so far"
            if merchant_names:
                explanation += f", mostly on {merchant_names}"
            explanation += "."
        return explanation

    change_amount = _fmt_money(abs(dollar_change))
    if dollar_change > 0:
        explanation = f"{category_name} is up {change_amount} vs last {period_label}"
        if merchant_names:
            explanation += f", mostly due to more spending at {merchant_names}"
        explanation += "."
    elif dollar_change < 0:
        explanation = f"{category_name} is down {change_amount} vs last {period_label}"
        if merchant_names:
            explanation += f", mainly because spending was lower at {merchant_names}"
        explanation += "."
    else:
        explanation = f"{category_name} looks steady vs last {period_label}."

    if dollar_change == 0:
        return explanation

    if transaction_count_change > 0 and current_avg_spend > previous_avg_spend + 0.01:
        explanation += " You made more purchases, and they were a bit larger on average."
    elif transaction_count_change > 0:
        explanation += " You made more purchases than last month."
    elif transaction_count_change < 0 and current_avg_spend < previous_avg_spend - 0.01:
        explanation += " You made fewer purchases, and they were smaller on average."
    elif transaction_count_change < 0:
        explanation += " You made fewer purchases than last month."
    elif current_avg_spend > previous_avg_spend + 0.01:
        explanation += " The average purchase was a bit larger."
    elif current_avg_spend < previous_avg_spend - 0.01:
        explanation += " The average purchase was a bit smaller."

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
    current_tx_count = _safe_int(current.get("tx_count", 0))
    previous_tx_count = _safe_int(previous.get("tx_count", 0))
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
                "current_tx_count": _safe_int(current_merchant.get("tx_count", 0)),
                "previous_tx_count": _safe_int(previous_merchant.get("tx_count", 0)),
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
    impact: str = ""
    next_step: str = ""
    actions: List[str] = []
    action: str
    data_note: str
    used_bundle_keys: List[str]


class AffordCoachResponse(BaseModel):
    answer: str
    source: Literal["local", "deterministic"]


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


def _fmt_signed_money(value: float) -> str:
    amount = abs(float(value))
    if value < 0:
        return f"-${amount:,.2f}"
    return f"${amount:,.2f}"


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        try:
            return int(float(value or 0))
        except (TypeError, ValueError):
            return 0


def _extract_category_from_question(question: str, categories: List[str]) -> Optional[str]:
    q_lower = str(question or "").lower()
    for category in categories:
        name = str(category).strip()
        if name and name.lower() in q_lower:
            return name
    return None


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

    return {"answer": deterministic, "source": "local"}


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
        days_remaining = _safe_int(cash.get("days_remaining", 0))
        if days_remaining > 0:
            return f"Based on your current budget and spending with {days_remaining} days left."
        return "Based on your current saved budget and transactions."

    def budget_status_meta(pct_used: float) -> tuple[str, str]:
        pct = float(pct_used or 0.0)
        if pct > 100.0:
            return "off_track", "Off-track"
        if pct >= 70.0:
            return "tight", "Tight"
        return "healthy", "Healthy"

    def month_status_meta() -> tuple[str, str]:
        if forecast_end < 0 or over_budget:
            return "off_track", "Needs attention"
        if near_budget or top_above_cat:
            return "tight", "Getting tight"
        return "healthy", "On track"

    def projected_category_total(current_total: float) -> float:
        bundle_as_of = str(b.get("as_of", "")).strip()
        bundle_period = str(b.get("period", "monthly")).strip() or "monthly"
        if not bundle_as_of:
            return float(current_total)
        as_of_d = parse_date(bundle_as_of)
        start_d, end_d = period_bounds(as_of_d, bundle_period)  # type: ignore[arg-type]
        days_elapsed = max(1, (as_of_d - start_d).days + 1)
        days_total = max(days_elapsed, (end_d - start_d).days + 1)
        return float(current_total) / float(days_elapsed) * float(days_total)

    fixed_categories = {"Bills", "Rent", "Utilities", "Insurance"}

    def top_flexible_category() -> str:
        variable_items = [
            (str(category).strip(), float(total or 0.0))
            for category, total in spending_by_category.items()
            if str(category).strip() and str(category).strip() not in fixed_categories
        ]
        if not variable_items:
            return str(top_cat or "").strip()
        variable_items.sort(key=lambda item: item[1], reverse=True)
        return variable_items[0][0]

    def primary_priority_category() -> str:
        if top_above_cat:
            return top_above_cat
        if over_budget:
            return str(over_budget[0]).strip()
        if near_budget:
            return str(near_budget[0]).strip()
        return top_flexible_category()

    def budget_pace_line(
        *,
        category: str,
        row: Optional[Dict[str, object]],
        current_total: float,
    ) -> str:
        budget_amount = float((row or {}).get("budget", 0.0) or 0.0)
        pct_used = float((row or {}).get("pct_used", 0.0) or 0.0)
        projection = projected_category_total(current_total)
        status_key, status_label = budget_status_meta(pct_used)
        if budget_amount <= 0:
            return (
                f"At this pace, {category} would finish around {_fmt_money(projection)} this month."
            )
        if status_key == "off_track":
            return (
                f"{category} looks off-track: you've used {pct_used:.0f}% of your "
                f"{_fmt_money(budget_amount)} budget, and pace points to about {_fmt_money(projection)} for the month."
            )
        if status_key == "tight":
            return (
                f"{category} looks tight: you've used {pct_used:.0f}% of your "
                f"{_fmt_money(budget_amount)} budget, and pace points to about {_fmt_money(projection)} for the month."
            )
        return (
            f"{category} looks healthy against plan: you've used {pct_used:.0f}% of your "
            f"{_fmt_money(budget_amount)} budget so far."
        )

    def action_impact_amount(
        *,
        category: str,
        row: Optional[Dict[str, object]] = None,
        above_pace_amount: float = 0.0,
        avg_spend: float = 0.0,
    ) -> float:
        budget_amount = float((row or {}).get("budget", 0.0) or 0.0)
        base = max(abs(float(above_pace_amount or 0.0)), float(avg_spend or 0.0), budget_amount * 0.08, 15.0)
        if category in {"Food", "Dining", "Shopping"}:
            base = max(base, 25.0)
        if category == "Entertainment":
            base = max(base, 20.0)
        return round(min(60.0, base), 2)

    def action_line(
        *,
        category: str,
        status_key: str,
        row: Optional[Dict[str, object]] = None,
        above_pace_amount: float = 0.0,
        avg_spend: float = 0.0,
    ) -> str:
        impact_amount = action_impact_amount(
            category=category,
            row=row,
            above_pace_amount=above_pace_amount,
            avg_spend=avg_spend,
        )
        if category in {"Food", "Dining"}:
            if status_key == "healthy":
                return "Keep restaurant spending near the current pace this week."
            if status_key == "tight":
                return f"Keep restaurant spending to one lower-cost meal this week. Likely impact: about {_fmt_money(impact_amount)}."
            return f"Cut 1-2 restaurant meals this week. Likely impact: about {_fmt_money(impact_amount)}."
        if category == "Entertainment":
            if status_key == "healthy":
                return "Entertainment looks fine right now; just avoid adding extra impulse plans this week."
            if status_key == "tight":
                return f"Skip one lower-value entertainment purchase this week. Likely impact: about {_fmt_money(impact_amount)}."
            return f"Cut one entertainment purchase this week. Likely impact: about {_fmt_money(impact_amount)}."
        if category == "Shopping":
            if status_key == "healthy":
                return "Shopping is still under control, so the goal is simply to pause before the next nonessential buy."
            if status_key == "tight":
                return f"Delay one nonessential purchase this week. Likely impact: about {_fmt_money(impact_amount)}."
            return f"Pause one nonessential purchase this week. Likely impact: about {_fmt_money(impact_amount)}."
        if category == "Groceries":
            if status_key == "healthy":
                return "Groceries look healthy so far; keep the next trip close to your usual size."
            if status_key == "tight":
                return f"Plan one tighter grocery trip this week. Likely impact: about {_fmt_money(impact_amount)}."
            return f"Tighten one grocery trip this week or switch one trip to a lower-cost store. Likely impact: about {_fmt_money(impact_amount)}."
        if category == "Transportation":
            if status_key == "healthy":
                return "Transportation looks manageable right now; keep the current pace if you can."
            if status_key == "tight":
                return f"Combine a few trips or cut one low-value ride this week. Likely impact: about {_fmt_money(impact_amount)}."
            return f"Trim one or two low-value rides this week. Likely impact: about {_fmt_money(impact_amount)}."
        if category in {"Bills", "Rent", "Utilities", "Insurance"}:
            return "This category looks mostly fixed, so focus your changes on more flexible spending this week."
        if status_key == "healthy":
            return f"{category} looks healthy so far; keep the current pace steady this week."
        if status_key == "tight":
            return f"Trim one lower-value {category.lower()} purchase this week. Likely impact: about {_fmt_money(impact_amount)}."
        return f"Cut one or two lower-value {category.lower()} purchases this week. Likely impact: about {_fmt_money(impact_amount)}."

    def build_response(
        *,
        headline: str,
        why: List[str],
        impact: str = "",
        next_step: str = "",
        actions: Optional[List[str]] = None,
    ) -> Dict[str, object]:
        why_items = [str(item).strip() for item in why if str(item).strip()]
        action_items = [str(item).strip() for item in (actions or []) if str(item).strip()]
        if coach_payload.beginner_mode:
            why_items = why_items[:2]
            action_items = action_items[:2]
        else:
            why_items = why_items[:4]
            action_items = action_items[:3]

        next_step_text = str(next_step or "").strip()
        if not next_step_text and action_items:
            next_step_text = action_items[0]

        return {
            "headline": headline.strip(),
            "why": why_items,
            "impact": impact.strip(),
            "next_step": next_step_text,
            "actions": action_items,
            "action": next_step_text,
            "data_note": data_note_text(),
            "used_bundle_keys": ["summary", "spending_by_category", "trends", "budget_report", "cash_forecast"],
        }

    row_map = {str(r.get("category", "")).strip(): r for r in rows if str(r.get("category", "")).strip()}
    top_above = cash.get("top_above_pace_categories", []) or []
    top_above_cat = str(top_above[0].get("category", "")).strip() if top_above else ""
    top_above_amt = float(top_above[0].get("above_pace", 0.0) or 0.0) if top_above else 0.0
    forecast_end = float(cash.get("forecast_end_balance", 0.0))
    days_remaining = _safe_int(cash.get("days_remaining", 0))
    safe_per_day = float(cash.get("safe_to_spend_per_day_budget", 0.0))
    bundle_user_id = str(b.get("user_id", USER_DEFAULT)).strip() or USER_DEFAULT
    bundle_period = str(b.get("period", "monthly")).strip() or "monthly"
    bundle_as_of = str(b.get("as_of", date.today().isoformat())).strip() or date.today().isoformat()

    q_lower = q.lower()
    available_categories = sorted({*spending_by_category.keys(), *row_map.keys()})
    requested_category = _extract_category_from_question(q, available_categories)

    if "explain" in q_lower and "month" in q_lower:
        month_status_key, month_status_label = month_status_meta()
        primary_cat = primary_priority_category()
        primary_row = row_map.get(primary_cat, {})
        primary_pct = float((primary_row or {}).get("pct_used", 0.0) or 0.0)
        primary_budget = float((primary_row or {}).get("budget", 0.0) or 0.0)
        primary_spent = float((primary_row or {}).get("spent_ptd", spending_by_category.get(primary_cat, 0.0)) or 0.0)

        if month_status_key == "off_track":
            headline = "This month needs attention." if coach_payload.beginner_mode else "Monthly check: your month is off track."
        elif month_status_key == "tight":
            headline = "This month is getting tight." if coach_payload.beginner_mode else "Monthly check: your month is getting tight."
        else:
            headline = "This month looks on track." if coach_payload.beginner_mode else "Monthly check: your month looks on track."

        if primary_cat and top_above_cat == primary_cat and top_above_amt > 0:
            focus_line = (
                f"{primary_cat} matters most right now. You're about {_fmt_money(top_above_amt)} above pace there."
            )
        elif primary_cat and primary_budget > 0:
            focus_line = (
                f"{primary_cat} matters most right now at {_fmt_money(primary_spent)} spent, "
                f"or {primary_pct:.0f}% of its budget."
            )
        elif primary_cat:
            focus_line = f"{primary_cat} matters most right now at {_fmt_money(primary_spent)} spent so far."
        else:
            focus_line = "No single category is driving the month right now."

        if forecast_end < 0:
            urgent_line = (
                f"Your projected end balance is {_fmt_money(forecast_end)}, so the month turns risky if the current pace holds."
            )
        elif over_budget:
            urgent_line = (
                f"{_join_labels(over_budget[:2])} already {'is' if len(over_budget[:2]) == 1 else 'are'} over budget."
            )
        elif near_budget or top_above_cat:
            urgent_line = "Nothing is broken yet, but one or two categories are putting pressure on the rest of the month."
        else:
            urgent_line = "Nothing urgent stands out right now."

        why = []
        if coach_payload.beginner_mode:
            why.append(
                f"You've spent {_fmt_money(spending)} so far and you're projected to end the month at {_fmt_money(forecast_end)}."
            )
            why.append(focus_line)
            if month_status_key != "healthy":
                why.append(urgent_line)
        else:
            why.append(
                f"Income is {_fmt_money(income)}, spending is {_fmt_money(spending)}, and net is {_fmt_signed_money(net)} so far this month."
            )
            why.append(
                f"Projected end balance is {_fmt_money(forecast_end)} with about {_fmt_money(safe_per_day)}/day of safe budget left for the rest of the month."
            )
            why.append(focus_line)
            why.append(urgent_line)

        if primary_cat:
            primary_row = row_map.get(primary_cat, {})
            primary_status_key, _ = budget_status_meta(float((primary_row or {}).get("pct_used", 0.0) or 0.0))
            next_step = action_line(
                category=primary_cat,
                status_key=primary_status_key,
                row=primary_row,
                above_pace_amount=top_above_amt if primary_cat == top_above_cat else 0.0,
            )
        else:
            next_step = "Keep discretionary spending near the current pace this week."

        return build_response(
            headline=headline,
            why=why,
            impact=(
                f"Month status: {month_status_label}. {urgent_line}"
                if coach_payload.beginner_mode
                else f"Budget pressure: {len(over_budget)} over budget, {len(near_budget)} near budget, with {days_remaining} days left."
            ),
            next_step=next_step,
        )
    elif requested_category and any(keyword in q_lower for keyword in {"driving", "higher", "category", "food"}):
        category_name = requested_category
        category_data = explain_category(
            user_id=bundle_user_id,
            category=category_name,
            period=bundle_period,  # type: ignore[arg-type]
            as_of=bundle_as_of,
        )
        row = row_map.get(category_name, {})
        pct_used = float((row or {}).get("pct_used", 0.0) or 0.0)
        budget_amount = float((row or {}).get("budget", 0.0) or 0.0)
        remaining_amount = float((row or {}).get("remaining", 0.0) or 0.0)
        status_key, status_label = budget_status_meta(pct_used)
        current_total = float(category_data.get("current_month_total", 0.0))
        current_avg_spend = float(category_data.get("current_avg_spend", 0.0))
        percent_change = category_data.get("percent_change")
        top_merchants = category_data.get("top_merchants", []) or []
        merchant_names = _join_labels([str(item.get("merchant", "")).strip() for item in top_merchants[:2]])
        projection = projected_category_total(current_total)
        projection_delta = projection - budget_amount

        if coach_payload.beginner_mode:
            headline = f"{category_name} looks {status_label.lower()} right now."
            why = [str(category_data.get("explanation", "")).strip() or f"You've spent {_fmt_money(current_total)} on {category_name} so far this month."]
            if budget_amount > 0:
                why.append(budget_pace_line(category=category_name, row=row, current_total=current_total))
            elif merchant_names:
                why.append(f"Most of the spending is coming from {merchant_names}.")
        else:
            headline = f"{category_name} check: {status_label.lower()} against plan."
            why = [f"You've spent {_fmt_money(current_total)} across {_safe_int(category_data.get('current_transaction_count', 0))} purchases, averaging {_fmt_money(current_avg_spend)} each."]
            if merchant_names:
                why.append(f"Most of the activity is coming from {merchant_names}.")
            if percent_change is not None:
                why.append(
                    f"That's {_fmt_signed_money(float(category_data.get('dollar_change', 0.0)))} ({float(percent_change):+.1f}%) vs last month."
                )
            why.append(budget_pace_line(category=category_name, row=row, current_total=current_total))

        if budget_amount > 0:
            if projection_delta > 0:
                impact = (
                    f"At this pace, {category_name} would finish around {_fmt_money(projection)} this month, "
                    f"or about {_fmt_money(projection_delta)} above budget."
                )
            else:
                impact = (
                    f"At this pace, {category_name} would finish around {_fmt_money(projection)} this month, "
                    f"leaving about {_fmt_money(remaining_amount)} of budget room right now."
                )
        else:
            impact = f"At this pace, {category_name} would finish around {_fmt_money(projection)} for the month."

        next_step = action_line(
            category=category_name,
            status_key=status_key,
            row=row,
            above_pace_amount=max(0.0, current_total - budget_amount) if budget_amount > 0 else 0.0,
            avg_spend=current_avg_spend,
        )

        return build_response(
            headline=headline,
            why=why,
            impact=impact,
            next_step=next_step,
        )
    elif "change" in q_lower and "week" in q_lower:
        priority_categories: List[str] = []
        for item in top_above:
            category_name = str(item.get("category", "")).strip()
            if category_name and category_name not in priority_categories:
                priority_categories.append(category_name)
        for category_name in over_budget + near_budget:
            category_name = str(category_name or "").strip()
            if category_name and category_name not in priority_categories:
                priority_categories.append(category_name)

        if not priority_categories:
            flexible_category = top_flexible_category()
            fallback_category = flexible_category or str(top_cat or "").strip()
            priority_categories = [fallback_category] if fallback_category else []

        if priority_categories:
            flexible_by_spend = [
                str(category).strip()
                for category, _ in sorted(
                    spending_by_category.items(),
                    key=lambda item: float(item[1] or 0.0),
                    reverse=True,
                )
                if str(category).strip() and str(category).strip() not in fixed_categories
            ]
            for category_name in flexible_by_spend:
                if category_name not in priority_categories:
                    priority_categories.append(category_name)

        actions: List[str] = []
        why: List[str] = []
        total_estimated_impact = 0.0
        for category_name in priority_categories[:3]:
            row = row_map.get(category_name, {})
            pct_used = float((row or {}).get("pct_used", 0.0) or 0.0)
            status_key, status_label = budget_status_meta(pct_used)
            above_pace_amount = 0.0
            for item in top_above:
                if str(item.get("category", "")).strip() == category_name:
                    above_pace_amount = float(item.get("above_pace", 0.0) or 0.0)
                    break

            actions.append(
                action_line(
                    category=category_name,
                    status_key=status_key,
                    row=row,
                    above_pace_amount=above_pace_amount,
                )
            )
            total_estimated_impact += action_impact_amount(
                category=category_name,
                row=row,
                above_pace_amount=above_pace_amount,
            )
            spent_amount = float((row or {}).get("spent_ptd", spending_by_category.get(category_name, 0.0)) or 0.0)
            if row:
                why.append(f"{category_name} is at {pct_used:.0f}% of budget after {_fmt_money(spent_amount)} spent so far.")
            else:
                why.append(f"{category_name} is your biggest variable category at {_fmt_money(spent_amount)} so far.")

        if not actions:
            return build_response(
                headline="This week looks steady.",
                why=["Nothing urgent stands out in the current month data."],
                impact="You do not need a major change this week if the current pace holds.",
                next_step="Keep discretionary spending near the current pace.",
            )

        headline = (
            "The best changes this week are small and specific."
            if coach_payload.beginner_mode
            else "This week's highest-leverage changes"
        )
        if coach_payload.beginner_mode:
            why = why[:2]
            why.insert(
                0,
                "The biggest pressure is coming from the categories that are closest to or above plan right now.",
            )
        else:
            why.insert(
                0,
                f"These are the categories putting the most pressure on your remaining monthly buffer, with {days_remaining} days left."
            )
        impact = f"If you follow the top changes, you could protect about {_fmt_money(total_estimated_impact)} of buffer this week."
        return build_response(
            headline=headline,
            why=why,
            impact=impact,
            next_step=actions[0],
            actions=actions,
        )
    elif "afford" in q_lower:
        amt = _parse_amount(q)
        if amt is None:
            headline = "Answer: Risky."
            why = ["I couldn’t find a dollar amount to simulate the scenario."]
            action = "Ask again with a specific amount (e.g., “Can I afford $25?”)."
        elif cash:
            forecast_end = float(cash.get("forecast_end_balance", 0.0))
            safe_per_day = float(cash.get("safe_to_spend_per_day_budget", 0.0))
            days_remaining = _safe_int(cash.get("days_remaining", 0))
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
        return build_response(
            headline="Ask me about this month.",
            why=[
                f"Income is {_fmt_money(income)}, spending is {_fmt_money(spending)}, and net is {_fmt_signed_money(net)}.",
                f"{top_cat or 'Your top category'} matters most right now.",
            ],
            impact="Try one of the quick actions for a more specific answer.",
            next_step="Try: “Explain this month” or “What should I change this week?”",
        )

    return {
        "headline": headline,
        "why": why,
        "impact": "",
        "next_step": action,
        "actions": [],
        "action": action,
        "data_note": data_note_text(),
        "used_bundle_keys": ["summary", "spending_by_category", "trends", "budget_report", "cash_forecast"],
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
# Goal plans
# ============================================================

class GoalPlanIn(BaseModel):
    user_id: str = USER_DEFAULT
    goal_name: str
    target_amount: float = Field(ge=0)
    target_date: str
    progress: float = Field(default=0, ge=0)
    weekly_needed: float = Field(default=0, ge=0)
    monthly_needed: float = Field(default=0, ge=0)
    realistic: bool = False
    recommendations: List[Dict[str, object]] = Field(default_factory=list)
    protected: Dict[str, float] = Field(default_factory=dict)
    flexibility_preferences: Dict[str, object] = Field(default_factory=dict)


class GoalProgressIn(BaseModel):
    progress: float = Field(ge=0)


def _goal_row_to_dict(row):
    return {
        "id": int(row["id"]),
        "user_id": row["user_id"],
        "goal_name": row["goal_name"],
        "target_amount": float(row["target_amount"]),
        "target_date": row["target_date"],
        "progress": float(row["progress"]),
        "weekly_needed": float(row["weekly_needed"]),
        "monthly_needed": float(row["monthly_needed"]),
        "realistic": bool(row["realistic"]),
        "recommendations": json.loads(row["recommendations_json"] or "[]"),
        "protected": json.loads(row["protected_json"] or "{}"),
        "flexibility_preferences": json.loads(row["flexibility_preferences_json"] or "{}"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@app.get("/goals")
def list_goals(user_id: str = USER_DEFAULT):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM goal_plans WHERE user_id = ? ORDER BY created_at DESC, id DESC",
            (user_id,),
        ).fetchall()
    return {"goals": [_goal_row_to_dict(row) for row in rows]}


@app.post("/goals")
def save_goal(goal: GoalPlanIn):
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO goal_plans (
                user_id, goal_name, target_amount, target_date, progress,
                weekly_needed, monthly_needed, realistic, recommendations_json, protected_json,
                flexibility_preferences_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                goal.user_id,
                goal.goal_name.strip(),
                float(goal.target_amount),
                goal.target_date,
                float(goal.progress),
                float(goal.weekly_needed),
                float(goal.monthly_needed),
                1 if goal.realistic else 0,
                json.dumps(goal.recommendations),
                json.dumps(goal.protected),
                json.dumps(goal.flexibility_preferences),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM goal_plans WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"status": "ok", "goal": _goal_row_to_dict(row)}


@app.patch("/goals/{goal_id}/progress")
def update_goal_progress(goal_id: int, payload: GoalProgressIn):
    with get_conn() as conn:
        conn.execute(
            "UPDATE goal_plans SET progress = ?, updated_at = datetime('now') WHERE id = ?",
            (float(payload.progress), int(goal_id)),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM goal_plans WHERE id = ?", (int(goal_id),)).fetchone()
    return {"status": "ok", "goal": _goal_row_to_dict(row)}


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
