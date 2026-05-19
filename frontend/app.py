import datetime
import calendar
import ast
import hashlib
import json
import os
import re
import sys
import pandas as pd
import streamlit as st
import requests
from openai import OpenAI
from urllib.parse import quote_plus, urlparse

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)
for import_path in (CURRENT_DIR, ROOT_DIR):
    if import_path not in sys.path:
        sys.path.insert(0, import_path)

from affordability_engine import calculateGoalTrajectory
from budget_utils import detect_income_sources, monthly_spending_totals
from goal_discovery import is_product_interest
from providers import route_intents

BASE_URL = ""
DEV_MODE = str(os.environ.get("DEV_MODE", "")).lower() in {"1", "true", "yes", "on"}
PROVIDER_CACHE_PATH = os.path.join(CURRENT_DIR, "provider_results_cache.json")
PROVIDER_CACHE_TTL_DAYS = 7

st.set_page_config(page_title="Byable", layout="wide")

SESSION_DEFAULTS = {
    "user_id": "default",
    "local_transactions": [],
    "local_goals": [],
    "local_budget": {"income_amount": 0.0, "allocations": {}},
    "category_roles": {},
    "flexibility_preferences": {},
    "merchant_category_memory": {},
    "planner_manual_income": 0.0,
    "planner_use_detected_income": True,
    "ai_coach_cache": {},
}
for key, value in SESSION_DEFAULTS.items():
    st.session_state.setdefault(key, value.copy() if isinstance(value, dict) else list(value) if isinstance(value, list) else value)

st.title("How can I afford this by this date?")
st.caption("See the path to what you want.")

# -----------------------------
# Month selector (global)
# -----------------------------
today = datetime.date.today()
default_month = today.replace(day=1)

def month_start_list(n_back: int = 12):
    out = []
    d = today.replace(day=1)
    for _ in range(n_back + 1):
        out.append(d)
        if d.month == 1:
            d = d.replace(year=d.year - 1, month=12, day=1)
        else:
            d = d.replace(month=d.month - 1, day=1)
    return out

month_options = month_start_list(24)
month_labels = [d.strftime("%B %Y") for d in month_options]
default_idx = 0

selected_label = st.sidebar.selectbox("Month", month_labels, index=default_idx)
selected_month_date = month_options[month_labels.index(selected_label)]

month_start = selected_month_date.replace(day=1)
month_end = selected_month_date.replace(
    day=calendar.monthrange(selected_month_date.year, selected_month_date.month)[1]
)
as_of_date = today if (selected_month_date.year, selected_month_date.month) == (today.year, today.month) else month_end
as_of_str = as_of_date.isoformat()

st.sidebar.text_input("User ID (name or email)", key="user_id")
st.sidebar.caption(f"Viewing {month_start.strftime('%B %Y')}")

SPEND_CATEGORIES = [
    "Food",
    "Coffee",
    "Restaurants / dining",
    "Groceries",
    "Shopping",
    "Subscriptions",
    "Transportation",
    "Entertainment",
    "Bills",
    "Health",
    "Education",
    "Other",
]

SAVINGS_CATEGORY = "Savings"
BUDGET_CATEGORIES = SPEND_CATEGORIES + [SAVINGS_CATEGORY]

RECOMMENDED_PCT = {
    "Bills": 0.35,
    "Groceries": 0.12,
    "Food": 0.08,
    "Transportation": 0.10,
    "Subscriptions": 0.03,
    "Health": 0.03,
    "Education": 0.03,
    "Entertainment": 0.05,
    "Shopping": 0.05,
    "Other": 0.06,
}

CATEGORY_ROLE_OPTIONS = ["essential", "flexible", "protected"]
DEFAULT_CATEGORY_ROLES = {
    "Bills": "protected",
    "Savings": "protected",
    "Groceries": "essential",
    "Transportation": "essential",
    "Health": "essential",
    "Education": "essential",
    "Food": "flexible",
    "Coffee": "flexible",
    "Restaurants / dining": "flexible",
    "Shopping": "flexible",
    "Subscriptions": "flexible",
    "Entertainment": "flexible",
    "Other": "flexible",
}
ROLE_TO_PREFERENCE_LABEL = {
    "Bills": "Rent / bills",
    "Savings": "Savings",
    "Groceries": "Groceries",
    "Transportation": "Transportation",
    "Health": "Health",
    "Food": "Restaurants / dining",
    "Coffee": "Coffee",
    "Restaurants / dining": "Restaurants / dining",
    "Shopping": "Shopping",
    "Subscriptions": "Subscriptions",
    "Entertainment": "Entertainment",
    "Other": "Other discretionary",
}


def ensure_category_roles():
    roles = dict(DEFAULT_CATEGORY_ROLES)
    roles.update(st.session_state.get("category_roles", {}) or {})
    st.session_state.category_roles = roles
    return roles


def category_role(category):
    return ensure_category_roles().get(str(category), DEFAULT_CATEGORY_ROLES.get(str(category), "flexible"))


def save_category_roles(roles):
    clean_roles = {
        category: role
        for category, role in roles.items()
        if category in BUDGET_CATEGORIES and role in CATEGORY_ROLE_OPTIONS
    }
    st.session_state.category_roles = {**ensure_category_roles(), **clean_roles}
    apply_roles_to_flexibility_preferences()


def set_category_role(category, role):
    if category not in BUDGET_CATEGORIES or role not in CATEGORY_ROLE_OPTIONS:
        return
    roles = ensure_category_roles()
    roles[category] = role
    save_category_roles(roles)


def apply_roles_to_flexibility_preferences():
    roles = ensure_category_roles()
    preferences = ensure_flexibility_preferences()
    for category, role in roles.items():
        pref_label = ROLE_TO_PREFERENCE_LABEL.get(category)
        if not pref_label or pref_label not in preferences:
            continue
        preferences[pref_label]["enabled"] = role == "flexible"
    st.session_state.flexibility_preferences = preferences


def budget_summary_defaults(active_budget=None):
    active_budget = active_budget or st.session_state.get("local_budget", {})
    allocations = active_budget.get("allocations", {}) or {}
    roles = ensure_category_roles()
    essential_total = float(active_budget.get("essential_spending", 0.0) or 0.0)
    flexible_limit = float(active_budget.get("flexible_spending_limit", 0.0) or 0.0)
    if essential_total <= 0:
        essential_total = sum(
            float(allocations.get(category, 0.0))
            for category, role in roles.items()
            if role in {"essential", "protected"}
        )
    if flexible_limit <= 0:
        flexible_limit = sum(
            float(allocations.get(category, 0.0))
            for category, role in roles.items()
            if role == "flexible"
        )
    return {
        "income": float(active_budget.get("income_amount", 0.0) or 0.0),
        "essential_spending": essential_total,
        "flexible_spending_limit": flexible_limit,
    }


def spending_totals_by_category(transactions):
    return monthly_spending_totals(transactions)


def transaction_date_value(value):
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    return str(value)


SIMPLE_BUDGET_CATEGORIES = [
    "Housing & bills",
    "Groceries",
    "Food & dining",
    "Transportation",
    "Shopping",
    "Entertainment",
    "Health",
    "Savings",
    "Other",
]

RAW_TO_SIMPLE_CATEGORY = {
    "Bills": "Housing & bills",
    "Groceries": "Groceries",
    "Food": "Food & dining",
    "Coffee": "Food & dining",
    "Restaurants / dining": "Food & dining",
    "Transportation": "Transportation",
    "Shopping": "Shopping",
    "Subscriptions": "Entertainment",
    "Entertainment": "Entertainment",
    "Health": "Health",
    "Education": "Other",
    "Savings": "Savings",
    "Other": "Other",
}

SIMPLE_TO_RAW_CATEGORY = {
    "Housing & bills": "Bills",
    "Groceries": "Groceries",
    "Food & dining": "Food",
    "Transportation": "Transportation",
    "Shopping": "Shopping",
    "Entertainment": "Entertainment",
    "Health": "Health",
    "Savings": "Savings",
    "Other": "Other",
}


def simple_budget_category(category):
    return RAW_TO_SIMPLE_CATEGORY.get(str(category or "Other"), "Other")


def simple_spending_totals(transactions):
    totals = {category: 0.0 for category in SIMPLE_BUDGET_CATEGORIES}
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        totals[simple_budget_category(tx.get("category", "Other"))] += abs(amount)
    return totals


def simple_category_role(simple_category):
    raw_categories = [
        raw_category
        for raw_category, mapped_category in RAW_TO_SIMPLE_CATEGORY.items()
        if mapped_category == simple_category
    ]
    role_rank = {"flexible": 0, "essential": 1, "protected": 2}
    role = "flexible"
    for raw_category in raw_categories:
        raw_role = category_role(raw_category)
        if role_rank[raw_role] > role_rank[role]:
            role = raw_role
    return role


def categorization_explanation(tx):
    merchant = str(tx.get("merchant", "")).strip()
    category = str(tx.get("category") or "Other")
    source = str(tx.get("source") or "").lower()
    remembered = st.session_state.get("merchant_category_memory", {})
    if merchant.lower() in remembered:
        return "Remembered from your correction"
    if category == "Income":
        return "Paycheck or income deposit"
    if source in {"manual", "user"}:
        return "You confirmed this"
    if category in {"Coffee", "Food", "Restaurants / dining"}:
        return "Food or dining merchant"
    if category == "Subscriptions":
        return "Recurring monthly charge detected"
    if category == "Groceries":
        return "Merchant matched grocery spending"
    if category == "Bills":
        return "Merchant matched housing or bills"
    if merchant:
        return "Merchant matched this category"
    return "Please confirm this category"


def transaction_confidence(tx, recurring_keys=None):
    category = str(tx.get("category") or "Other")
    source = str(tx.get("source") or "").lower()
    merchant = str(tx.get("merchant") or "").strip()
    remembered = st.session_state.get("merchant_category_memory", {})
    if merchant.lower() in remembered:
        return "User verified"
    if source in {"manual", "user"}:
        return "User verified"
    if category == "Other" or not merchant:
        return "Review recommended"
    if recurring_keys and recurring_transaction_key(tx) in recurring_keys:
        return "Strong confidence"
    if category in {"Coffee", "Food", "Restaurants / dining", "Shopping", "Entertainment"}:
        return "Some transactions may need confirmation"
    return "Moderate confidence"


def recurring_transaction_key(tx):
    return (str(tx.get("merchant") or "").strip().lower(), str(tx.get("category") or "").strip())


def recurring_subscription_patterns(transactions):
    grouped = {}
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        merchant = str(tx.get("merchant") or "").strip()
        if not merchant:
            continue
        key = recurring_transaction_key(tx)
        grouped.setdefault(key, {"Merchant": merchant, "Category": simple_budget_category(tx.get("category")), "Dates": [], "Amounts": []})
        grouped[key]["Dates"].append(parse_tx_date(tx))
        grouped[key]["Amounts"].append(abs(amount))

    patterns = []
    for key, group in grouped.items():
        dates = sorted(group["Dates"])
        amounts = group["Amounts"]
        if len(dates) < 2:
            continue
        gaps = [(right - left).days for left, right in zip(dates, dates[1:])]
        amount_range = max(amounts) - min(amounts)
        looks_monthly = any(24 <= gap <= 37 for gap in gaps)
        small_variance = amount_range <= max(2.0, sum(amounts) / len(amounts) * 0.10)
        if looks_monthly and small_variance:
            patterns.append(
                {
                    "Key": key,
                    "Merchant": group["Merchant"],
                    "Category": group["Category"],
                    "Typical amount": sum(amounts) / len(amounts),
                    "Confidence": "Strong confidence" if str(key[1]) == "Subscriptions" else "Moderate confidence",
                }
            )
    return sorted(patterns, key=lambda row: row["Typical amount"], reverse=True)


def remember_merchant_category(merchant, simple_category):
    merchant_key = str(merchant or "").strip().lower()
    raw_category = SIMPLE_TO_RAW_CATEGORY.get(str(simple_category), "Other")
    if not merchant_key:
        return
    memory = dict(st.session_state.get("merchant_category_memory", {}))
    memory[merchant_key] = raw_category
    st.session_state.merchant_category_memory = memory


def apply_merchant_memory(transactions):
    memory = st.session_state.get("merchant_category_memory", {}) or {}
    if not memory:
        return list(transactions)
    updated_transactions = []
    for tx in transactions:
        updated = dict(tx)
        merchant_key = str(updated.get("merchant") or "").strip().lower()
        if merchant_key in memory and float(updated.get("amount", 0.0)) < 0:
            updated["category"] = memory[merchant_key]
            updated["source"] = "user"
        updated_transactions.append(updated)
    return updated_transactions


def save_local_transaction_updates(updated_transactions):
    st.session_state.local_transactions = apply_merchant_memory(updated_transactions)
    st.session_state.pop("goal_plan", None)


def trajectory_status_from_gap(gap_vs_target, weekly_target):
    if abs(float(gap_vs_target)) < 5:
        return "Near target"
    if gap_vs_target >= weekly_target * 0.10:
        return "Ahead"
    if gap_vs_target >= weekly_target * -0.40:
        return "On track"
    return "Behind"


def current_week_flexible_spending_pace(transactions, as_of):
    week_start, week_end = week_bounds(as_of)
    elapsed_days = max(1, (min(as_of, week_end) - week_start).days + 1)
    total = 0.0
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        tx_date = parse_tx_date(tx)
        if not (week_start <= tx_date <= min(as_of, week_end)):
            continue
        category = str(tx.get("category") or "Other")
        bucket = intelligence_bucket(tx)
        if category_role(category) == "flexible" or bucket in BEHAVIOR_TRACKED_CATEGORIES:
            total += abs(amount)
    return total / elapsed_days * 7.0


def apply_budget_goal_progress(analysis, active_budget, transactions, goal_cost, goal_progress, target_date):
    budget_summary = budget_summary_defaults(active_budget)
    flexible_limit = float(budget_summary.get("flexible_spending_limit", 0.0))
    if flexible_limit <= 0:
        return analysis

    budget_weekly_limit = flexible_limit * 12 / 52
    current_flexible_pace = current_week_flexible_spending_pace(transactions, as_of_date)
    budget_delta = budget_weekly_limit - current_flexible_pace
    budget_saved = max(0.0, budget_delta)
    existing_saved = float(analysis.get("savedTowardGoalThisWeek", 0.0))
    if budget_saved <= existing_saved:
        analysis["budgetFlexibleWeeklyLimit"] = budget_weekly_limit
        analysis["budgetFlexibleCurrentPace"] = current_flexible_pace
        return analysis

    starting_remaining = max(0.0, float(goal_cost) - max(0.0, float(goal_progress)))
    weeks_until_target = max(1.0, (target_date - today).days / 7.0)
    weekly_target = starting_remaining / weeks_until_target
    gap_vs_target = budget_saved - weekly_target
    behavior_gap_vs_target = budget_delta - weekly_target
    remaining = max(0.0, starting_remaining - budget_saved)
    projected_date = projected_goal_date_from_gap(target_date, weekly_target, gap_vs_target)
    status = trajectory_status_from_gap(gap_vs_target, weekly_target)

    analysis.update(
        {
            "behaviorImprovement": budget_delta,
            "behaviorDelta": budget_delta,
            "detectedSavings": budget_saved,
            "savedTowardGoalThisWeek": budget_saved,
            "gapVsTarget": gap_vs_target,
            "behaviorGapVsTarget": gap_vs_target,
            "behaviorGap": behavior_gap_vs_target,
            "savingsGap": gap_vs_target,
            "remaining": remaining,
            "projectedDate": projected_date,
            "behaviorProjectedDate": projected_date,
            "projected_date": projected_date,
            "trajectoryStatus": status,
            "behaviorTrajectoryStatus": status,
            "savingsTrajectoryStatus": status,
            "trajectory_status": status,
            "effective_progress_amount": min(float(goal_cost), max(0.0, float(goal_progress)) + budget_saved),
            "budgetFlexibleWeeklyLimit": budget_weekly_limit,
            "budgetFlexibleCurrentPace": current_flexible_pace,
            "budgetProgressSource": "budget",
        }
    )
    return analysis


# -----------------------------
# Debug helpers
# -----------------------------
def show_http_error(resp: requests.Response):
    st.error(f"HTTP {resp.status_code} — {resp.request.method} {resp.request.url}")
    try:
        st.json(resp.json())
    except Exception:
        st.code(resp.text)


def api_get_budget_active():
    if not BASE_URL:
        return st.session_state.get("local_budget", {"income_amount": 0.0, "allocations": {}})
    try:
        r = requests.get(
            f"{BASE_URL}/budget/active",
            params={"user_id": st.session_state.user_id},
            timeout=3,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return st.session_state.get("local_budget", {"income_amount": 0.0, "allocations": {}})


def api_save_budget(period, income_amount, allocations, essential_spending=None, flexible_spending_limit=None, protected_categories=None, reducible_categories=None):
    payload = {
        "user_id": st.session_state.user_id,
        "period": period,
        "income_amount": float(income_amount),
        "allocations": {k: float(v) for k, v in allocations.items()},
        "essential_spending": float(essential_spending or 0.0),
        "flexible_spending_limit": float(flexible_spending_limit or 0.0),
        "protected_categories": list(protected_categories or []),
        "reducible_categories": list(reducible_categories or []),
    }
    if BASE_URL:
        try:
            r = requests.post(f"{BASE_URL}/budget", json=payload, timeout=3)
            if r.ok:
                return r.json()
        except requests.RequestException:
            pass
    st.session_state.local_budget = {
        "income_amount": float(income_amount),
        "allocations": {k: float(v) for k, v in allocations.items()},
        "essential_spending": float(essential_spending or 0.0),
        "flexible_spending_limit": float(flexible_spending_limit or 0.0),
        "protected_categories": list(protected_categories or []),
        "reducible_categories": list(reducible_categories or []),
    }
    return st.session_state.local_budget


def api_get_budget_report(period, as_of):
    if not BASE_URL:
        return {"period": period, "income": 0.0, "categories": []}
    try:
        r = requests.get(
            f"{BASE_URL}/budget/report",
            params={"user_id": st.session_state.user_id, "period": period, "as_of": as_of},
            timeout=3,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return {"period": period, "income": 0.0, "categories": []}


def api_get_forecast(period, as_of):
    if not BASE_URL:
        return {"period": period, "projected_end_balance": 0.0, "series": []}
    try:
        r = requests.get(
            f"{BASE_URL}/forecast/eop",
            params={"user_id": st.session_state.user_id, "period": period, "as_of": as_of},
            timeout=3,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return {"period": period, "projected_end_balance": 0.0, "series": []}


def api_get_transactions(start, end):
    if not BASE_URL:
        return {"transactions": local_get_transactions(start, end)}
    try:
        r = requests.get(
            f"{BASE_URL}/transactions",
            params={"user_id": st.session_state.user_id, "start": start, "end": end},
            timeout=3,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return {"transactions": local_get_transactions(start, end)}


def api_get_all_transactions():
    if not BASE_URL:
        return list(st.session_state.get("local_transactions", []))
    try:
        r = requests.get(
            f"{BASE_URL}/transactions",
            params={"user_id": st.session_state.user_id},
            timeout=3,
        )
        if r.ok:
            return r.json().get("transactions", [])
    except requests.RequestException:
        pass
    return list(st.session_state.get("local_transactions", []))


def api_get_goals():
    if not BASE_URL:
        return list(st.session_state.get("local_goals", []))
    try:
        r = requests.get(f"{BASE_URL}/goals", params={"user_id": st.session_state.user_id}, timeout=3)
        if r.ok:
            return r.json().get("goals", [])
    except requests.RequestException:
        pass
    return list(st.session_state.get("local_goals", []))


def api_save_goal(plan):
    payload = {
        "user_id": st.session_state.user_id,
        "goal_name": plan["goal_name"],
        "target_amount": float(plan["goal_cost"]),
        "target_date": plan["target_date"].isoformat(),
        "progress": float(plan.get("progress", 0.0)),
        "weekly_needed": float(plan["weekly_needed"]),
        "monthly_needed": float(plan["monthly_needed"]),
        "realistic": bool(plan["realistic"]),
        "recommendations": plan.get("recommendations", []),
        "protected": plan.get("protected", {}),
        "flexibility_preferences": plan.get("flexibility_preferences", {}),
    }
    if BASE_URL:
        try:
            r = requests.post(f"{BASE_URL}/goals", json=payload, timeout=3)
            if r.ok:
                return r.json().get("goal", {})
        except requests.RequestException:
            pass
    goals = list(st.session_state.get("local_goals", []))
    goal = dict(payload)
    goal["id"] = max([int(g.get("id", 0)) for g in goals] or [0]) + 1
    goals.append(goal)
    st.session_state.local_goals = goals
    return goal


def api_update_goal_progress(goal_id, progress):
    if not BASE_URL:
        goals = list(st.session_state.get("local_goals", []))
        updated = {}
        for goal in goals:
            if int(goal.get("id", -1)) == int(goal_id):
                goal["progress"] = float(progress)
                updated = goal
                break
        st.session_state.local_goals = goals
        return updated
    try:
        r = requests.patch(
            f"{BASE_URL}/goals/{int(goal_id)}/progress",
            json={"progress": float(progress)},
            timeout=3,
        )
        if r.ok:
            return r.json().get("goal", {})
    except requests.RequestException:
        pass
    goals = list(st.session_state.get("local_goals", []))
    updated = {}
    for goal in goals:
        if int(goal.get("id", -1)) == int(goal_id):
            goal["progress"] = float(progress)
            updated = goal
            break
    st.session_state.local_goals = goals
    return updated


def api_load_realistic_transaction_history():
    if not BASE_URL:
        return local_load_realistic_transaction_history(as_of_date)
    try:
        r = requests.post(
            f"{BASE_URL}/transactions/sample-month",
            json={"user_id": st.session_state.user_id, "as_of": as_of_str},
            timeout=3,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return local_load_realistic_transaction_history(as_of_date)


def api_simulate_week(scenario):
    if not BASE_URL:
        return local_simulate_week(scenario, as_of_date)
    try:
        r = requests.post(
            f"{BASE_URL}/transactions/simulate-week",
            json={"user_id": st.session_state.user_id, "as_of": as_of_str, "scenario": scenario},
            timeout=3,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return local_simulate_week(scenario, as_of_date)


def api_add_transaction(tx):
    memory = st.session_state.get("merchant_category_memory", {}) or {}
    merchant_key = str(tx.get("merchant", "")).strip().lower()
    remembered_category = memory.get(merchant_key)
    category = remembered_category if remembered_category and float(tx.get("amount", 0.0)) < 0 else tx.get("category", "Other")
    tx = {**tx, "category": category}
    if not BASE_URL:
        local_tx = {
            "date": tx["date"],
            "merchant": tx.get("merchant", ""),
            "amount": float(tx.get("amount", 0.0)),
            "category": category,
            "source": "manual",
            "scenario": None,
        }
        st.session_state.local_transactions = list(st.session_state.get("local_transactions", [])) + [local_tx]
        return {"transaction": local_tx, "local": True}
    try:
        r = requests.post(f"{BASE_URL}/transactions", json=tx, timeout=3)
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    local_tx = {
        "date": tx["date"],
        "merchant": tx.get("merchant", ""),
        "amount": float(tx.get("amount", 0.0)),
        "category": category,
        "source": "manual",
        "scenario": None,
    }
    st.session_state.local_transactions = list(st.session_state.get("local_transactions", [])) + [local_tx]
    return {"transaction": local_tx, "local": True}


# -----------------------------
# Goal affordability planner
# -----------------------------
PROTECTED_CATEGORY_LABELS = {
    "Bills": "rent / bills",
    "Groceries": "essentials",
    "Transportation": "essentials",
    "Health": "essentials",
    "Education": "essentials",
    SAVINGS_CATEGORY: "savings",
}

FLEXIBLE_CUT_RULES = {
    "subscriptions": {"label": "Subscriptions", "priority": 1, "max_cut_pct": 0.40},
    "shopping": {"label": "Shopping", "priority": 2, "max_cut_pct": 0.30},
    "restaurants": {"label": "Restaurants / dining", "priority": 3, "max_cut_pct": 0.35},
    "coffee": {"label": "Coffee", "priority": 4, "max_cut_pct": 0.45},
    "entertainment": {"label": "Entertainment", "priority": 5, "max_cut_pct": 0.30},
    "other": {"label": "Other discretionary", "priority": 6, "max_cut_pct": 0.25},
}

SEMI_FLEXIBLE_CATEGORIES = {"Groceries", "Transportation", "Health", "Education"}
BEHAVIOR_TRACKED_CATEGORIES = {
    "Subscriptions",
    "Shopping",
    "Restaurants / dining",
    "Coffee",
    "Entertainment",
    "Other discretionary",
    "Transportation",
}

PREFERENCE_CATEGORY_GROUPS = {
    "Protected by default": [
        ("Bills", "Rent / bills"),
        ("Groceries", "Groceries"),
        ("Transportation", "Transportation"),
        (SAVINGS_CATEGORY, "Savings"),
        ("Health", "Health"),
    ],
    "Flexible by default": [
        ("restaurants", "Restaurants / dining"),
        ("coffee", "Coffee"),
        ("entertainment", "Entertainment"),
        ("shopping", "Shopping"),
        ("subscriptions", "Subscriptions"),
        ("other", "Other discretionary"),
    ],
}

AGGRESSIVENESS_MULTIPLIERS = {
    "Light cuts": 0.55,
    "Moderate cuts": 1.0,
    "Aggressive cuts": 1.35,
}

PLAN_STYLE_MULTIPLIERS = {
    "Minimal lifestyle change": 0.65,
    "Balanced": 1.0,
    "Fastest possible": 1.3,
    "Conservative": 0.65,
    "Aggressive": 1.3,
}

REALISM_CAPS = {
    "Subscriptions": {"Minimal lifestyle change": 0.25, "Balanced": 0.40, "Fastest possible": 0.65},
    "Restaurants / dining": {"Minimal lifestyle change": 0.20, "Balanced": 0.35, "Fastest possible": 0.50},
    "Coffee": {"Minimal lifestyle change": 0.30, "Balanced": 0.45, "Fastest possible": 0.60},
    "Entertainment": {"Minimal lifestyle change": 0.20, "Balanced": 0.30, "Fastest possible": 0.40},
    "Shopping": {"Minimal lifestyle change": 0.20, "Balanced": 0.35, "Fastest possible": 0.50},
    "Other discretionary": {"Minimal lifestyle change": 0.15, "Balanced": 0.25, "Fastest possible": 0.35},
}


def load_demo_transactions_if_needed():
    data = api_get_transactions(month_start.isoformat(), as_of_str)
    transactions = data.get("transactions", [])
    if transactions:
        prev_start, prev_end = month_bounds(previous_month(month_start))
        previous = api_get_transactions(prev_start.isoformat(), prev_end.isoformat()).get("transactions", [])
        has_baseline = any(str(tx.get("source") or "").lower() == "baseline" for tx in previous)
        if has_baseline:
            return transactions
        api_load_realistic_transaction_history()
        return api_get_transactions(month_start.isoformat(), as_of_str).get("transactions", [])

    transactions = api_get_all_transactions()
    if transactions:
        return transactions

    api_load_realistic_transaction_history()
    return api_get_transactions(month_start.isoformat(), as_of_str).get("transactions", [])


def flexible_bucket(tx):
    category = str(tx.get("category", "")).strip()
    merchant = str(tx.get("merchant", "")).lower()

    if category == "Coffee":
        return "coffee"
    if category == "Restaurants / dining":
        return "restaurants"
    if category == "Food":
        if any(word in merchant for word in ["cafe", "coffee", "starbucks", "blue bottle", "peet", "philz"]):
            return "coffee"
        return "restaurants"
    if category == "Shopping":
        return "shopping"
    if category == "Entertainment":
        return "entertainment"
    if category == "Subscriptions":
        return "subscriptions"
    if category == "Other":
        return "other"
    return None


def intelligence_bucket(tx):
    category = str(tx.get("category", "")).strip()
    bucket = flexible_bucket(tx)
    if bucket:
        return FLEXIBLE_CUT_RULES[bucket]["label"]
    if category == "Bills":
        return "Rent / bills"
    if category:
        return category
    return "Other discretionary"


def transaction_source_label(tx):
    source = str(tx.get("source") or "demo").strip().lower()
    scenario = str(tx.get("scenario") or "").strip().lower()
    if source == "simulation":
        return {
            "good": "Simulation: good week",
            "average": "Simulation: average week",
            "overspending": "Simulation: overspending week",
        }.get(scenario, "Simulation")
    if source == "manual":
        return "Manual"
    if source == "baseline":
        return "Baseline month transactions"
    return "Current month transactions"


def category_flexibility(category_name):
    aliases = {
        "Rent / bills": "Bills",
        "Other discretionary": "Other",
    }
    return category_role(aliases.get(str(category_name), str(category_name)))


def category_cut_rate(category_name):
    if category_flexibility(category_name) != "flexible":
        return 0.0
    for rule in FLEXIBLE_CUT_RULES.values():
        if category_name == rule["label"]:
            return float(rule["max_cut_pct"])
    return 0.20


def category_priority(category_name):
    for rule in FLEXIBLE_CUT_RULES.values():
        if category_name == rule["label"]:
            return int(rule["priority"])
    if category_name == "Transportation":
        return 7
    if category_flexibility(category_name) == "essential":
        return 50
    if category_flexibility(category_name) == "protected":
        return 99
    return 99


def default_flexibility_preferences():
    preferences = {}
    for group_name, categories in PREFERENCE_CATEGORY_GROUPS.items():
        for key, label in categories:
            flexible_default = category_flexibility(label) == "flexible"
            preferences[label] = {
                "enabled": flexible_default,
                "aggressiveness": "Moderate cuts" if flexible_default else "Light cuts",
                "source_key": key,
                "group": group_name,
            }
    return preferences


def ensure_flexibility_preferences():
    defaults = default_flexibility_preferences()
    current = st.session_state.get("flexibility_preferences")
    if not current:
        st.session_state.flexibility_preferences = defaults
        return st.session_state.flexibility_preferences
    for label, pref in defaults.items():
        current.setdefault(label, pref)
        current[label].setdefault("enabled", pref["enabled"])
        current[label].setdefault("aggressiveness", pref["aggressiveness"])
        current[label].setdefault("source_key", pref["source_key"])
        current[label].setdefault("group", pref["group"])
    st.session_state.flexibility_preferences = current
    return current


def preference_for_category(category_name, preferences=None):
    preferences = preferences or ensure_flexibility_preferences()
    aliases = {
        "Bills": "Rent / bills",
        "Rent / bills": "Rent / bills",
        "Food": "Restaurants / dining",
    }
    label = aliases.get(category_name, category_name)
    return preferences.get(label, {"enabled": False, "aggressiveness": "Light cuts"})


def canonical_plan_style(plan_style):
    if plan_style in {"Minimal lifestyle change", "Balanced", "Fastest possible"}:
        return plan_style
    if plan_style == "Conservative":
        return "Minimal lifestyle change"
    if plan_style == "Aggressive":
        return "Fastest possible"
    return "Balanced"


def realism_cap(category_name, plan_style):
    style = canonical_plan_style(plan_style)
    role = category_flexibility(category_name)
    if role != "flexible":
        return 0.0
    if category_name in REALISM_CAPS:
        return REALISM_CAPS[category_name][style]
    return {"Minimal lifestyle change": 0.15, "Balanced": 0.25, "Fastest possible": 0.35}[style]


def preference_adjusted_cut_rate(category_name, preferences=None, plan_style="Balanced"):
    pref = preference_for_category(category_name, preferences)
    if not pref.get("enabled", False):
        return 0.0
    base_rate = category_cut_rate(category_name)
    if base_rate <= 0:
        return 0.0
    multiplier = AGGRESSIVENESS_MULTIPLIERS.get(pref.get("aggressiveness", "Moderate cuts"), 1.0)
    style_multiplier = PLAN_STYLE_MULTIPLIERS.get(plan_style, 1.0)
    rate = base_rate * multiplier * style_multiplier
    return min(rate, realism_cap(category_name, plan_style))


def approved_reduction_capacity(category_rows, preferences=None, plan_style="Balanced"):
    preferences = preferences or ensure_flexibility_preferences()
    return sum(
        float(row["Monthly spend"]) * preference_adjusted_cut_rate(row["Category"], preferences, plan_style)
        for row in category_rows
    )


def category_insight(category_name, monthly_spend, suggested_cut, total_spend):
    if suggested_cut <= 0:
        if category_flexibility(category_name) == "protected":
            return "Protected. Byable will never suggest cutting this."
        return "Essential. Necessary spending usually stays out of reduction plans."
    pct = (suggested_cut / monthly_spend * 100) if monthly_spend > 0 else 0
    if category_name == "Coffee":
        return f"Reducing coffee by {pct:.0f}% frees up {money(suggested_cut)}/month without touching essentials."
    if category_name == "Restaurants / dining":
        return f"Dining is a strong tradeoff lever; a {pct:.0f}% cut saves {money(suggested_cut)}/month."
    if category_name == "Subscriptions":
        return f"Canceling or pausing low-use subscriptions could save about {money(suggested_cut)}/month."
    if category_name in {"Entertainment", "Shopping", "Other discretionary"}:
        return f"This is flexible spending. A realistic trim could redirect {money(suggested_cut)}/month toward a goal."
    return f"This is flexible spending. A realistic trim could redirect {money(suggested_cut)}/month toward a goal."


def month_bounds(d):
    start = d.replace(day=1)
    end = start.replace(day=calendar.monthrange(start.year, start.month)[1])
    return start, end


def previous_month(d):
    if d.month == 1:
        return d.replace(year=d.year - 1, month=12, day=1)
    return d.replace(month=d.month - 1, day=1)


def week_bounds(d):
    start = d - datetime.timedelta(days=d.weekday())
    end = start + datetime.timedelta(days=6)
    return start, end


def parse_tx_date(tx):
    return datetime.datetime.strptime(str(tx.get("date")), "%Y-%m-%d").date()


def _local_tx(d, merchant, amount, category, source="demo", scenario=None):
    return {
        "date": d.isoformat() if isinstance(d, datetime.date) else str(d),
        "merchant": merchant,
        "amount": float(amount),
        "category": category,
        "source": source,
        "scenario": scenario,
    }


def local_get_transactions(start=None, end=None):
    transactions = list(st.session_state.get("local_transactions", []))
    if not start and not end:
        return transactions
    start_d = datetime.date.min if not start else datetime.date.fromisoformat(str(start))
    end_d = datetime.date.max if not end else datetime.date.fromisoformat(str(end))
    return [tx for tx in transactions if start_d <= parse_tx_date(tx) <= end_d]


def _dated(month_anchor, day):
    last_day = calendar.monthrange(month_anchor.year, month_anchor.month)[1]
    return month_anchor.replace(day=min(day, last_day))


def local_sample_transactions(as_of):
    current_month = as_of.replace(day=1)
    prior_month = previous_month(current_month)
    current_specs = [
        (1, "Employer Payroll", 5200.0, "Income"),
        (2, "Apartment Rent", -1850.0, "Bills"), (3, "SoCal Edison", -82.14, "Bills"),
        (4, "City Water Utility", -44.68, "Bills"), (5, "Verizon Wireless", -96.20, "Bills"),
        (6, "Spectrum Internet", -69.99, "Bills"), (1, "Automatic Savings Transfer", -350.0, "Savings"),
        (3, "Trader Joe's", -87.42, "Groceries"), (7, "Costco", -146.31, "Groceries"),
        (11, "Whole Foods Market", -64.27, "Groceries"), (16, "Safeway", -72.88, "Groceries"),
        (21, "Trader Joe's", -59.34, "Groceries"), (27, "Target Grocery", -44.16, "Groceries"),
        (2, "Starbucks", -6.85, "Food"), (4, "Blue Bottle Coffee", -7.40, "Food"),
        (6, "Starbucks", -5.95, "Food"), (9, "Neighborhood Cafe", -13.25, "Food"),
        (12, "Starbucks", -6.35, "Food"), (15, "Philz Coffee", -8.10, "Food"),
        (18, "Starbucks", -6.15, "Food"), (22, "Peet's Coffee", -7.20, "Food"),
        (26, "Starbucks", -5.75, "Food"), (3, "Chipotle", -16.84, "Food"),
        (5, "Sweetgreen", -18.62, "Food"), (8, "Thai Basil", -42.37, "Food"),
        (10, "DoorDash", -31.49, "Food"), (13, "Local Pizza Co.", -28.70, "Food"),
        (17, "Sushi House", -54.22, "Food"), (20, "Panera Bread", -14.95, "Food"),
        (24, "Taco Stand", -19.18, "Food"), (29, "Italian Kitchen", -63.80, "Food"),
        (4, "Shell Gas", -48.72, "Transportation"), (6, "Downtown Parking", -12.00, "Transportation"),
        (9, "Uber", -22.46, "Transportation"), (14, "Chevron", -52.18, "Transportation"),
        (18, "Metro Transit", -25.00, "Transportation"), (23, "Lyft", -18.64, "Transportation"),
        (28, "Shell Gas", -46.51, "Transportation"), (2, "Netflix", -15.49, "Subscriptions"),
        (8, "Spotify", -10.99, "Subscriptions"), (14, "iCloud Storage", -2.99, "Subscriptions"),
        (20, "Hulu", -17.99, "Subscriptions"), (24, "Planet Fitness", -29.99, "Subscriptions"),
        (27, "Apple Music", -10.99, "Subscriptions"), (7, "AMC Theatres", -34.50, "Entertainment"),
        (12, "Bowling Alley", -41.20, "Entertainment"), (19, "Concert Tickets", -88.00, "Entertainment"),
        (26, "Kindle Books", -18.98, "Entertainment"), (5, "Amazon", -39.84, "Shopping"),
        (10, "Target", -76.45, "Shopping"), (16, "Old Navy", -58.32, "Shopping"),
        (22, "Amazon", -24.17, "Shopping"), (28, "Best Buy", -92.61, "Shopping"),
        (11, "CVS Pharmacy", -18.44, "Health"), (25, "Walgreens", -23.79, "Health"),
        (13, "Venmo - Birthday Gift", -35.00, "Other"), (18, "Etsy", -27.45, "Other"),
        (21, "Pet Supplies Plus", -31.26, "Other"), (30, "Farmers Market", -22.80, "Other"),
    ]
    baseline_specs = [
        (1, "Employer Payroll", 5200.0, "Income"),
        (2, "Apartment Rent", -1850.0, "Bills"), (3, "SoCal Edison", -82.14, "Bills"),
        (5, "Verizon Wireless", -96.20, "Bills"), (6, "Spectrum Internet", -69.99, "Bills"),
        (1, "Automatic Savings Transfer", -350.0, "Savings"), (3, "Trader Joe's", -91.42, "Groceries"),
        (8, "Costco", -156.31, "Groceries"), (13, "Whole Foods Market", -84.27, "Groceries"),
        (19, "Safeway", -78.88, "Groceries"), (25, "Trader Joe's", -69.34, "Groceries"),
        (2, "Starbucks", -11.50, "Coffee"), (4, "Blue Bottle Coffee", -13.25, "Coffee"),
        (7, "Starbucks", -10.95, "Coffee"), (9, "Neighborhood Cafe", -18.25, "Coffee"),
        (12, "Starbucks", -11.35, "Coffee"), (15, "Philz Coffee", -14.10, "Coffee"),
        (18, "Starbucks", -10.15, "Coffee"), (22, "Peet's Coffee", -13.20, "Coffee"),
        (26, "Starbucks", -10.75, "Coffee"), (28, "Blue Bottle Coffee", -15.40, "Coffee"),
        (3, "Chipotle", -34.84, "Restaurants / dining"), (5, "Sweetgreen", -38.62, "Restaurants / dining"),
        (8, "Thai Basil", -72.37, "Restaurants / dining"), (10, "DoorDash", -61.49, "Restaurants / dining"),
        (13, "Local Pizza Co.", -58.70, "Restaurants / dining"), (17, "Sushi House", -84.22, "Restaurants / dining"),
        (20, "Panera Bread", -34.95, "Restaurants / dining"), (24, "Taco Stand", -49.18, "Restaurants / dining"),
        (27, "DoorDash", -66.80, "Restaurants / dining"), (29, "Italian Kitchen", -83.80, "Restaurants / dining"),
        (4, "Shell Gas", -54.72, "Transportation"), (6, "Downtown Parking", -18.00, "Transportation"),
        (9, "Uber", -32.46, "Transportation"), (14, "Chevron", -58.18, "Transportation"),
        (18, "Metro Transit", -25.00, "Transportation"), (23, "Lyft", -28.64, "Transportation"),
        (28, "Shell Gas", -56.51, "Transportation"), (2, "Netflix", -15.49, "Subscriptions"),
        (8, "Spotify", -10.99, "Subscriptions"), (14, "iCloud Storage", -2.99, "Subscriptions"),
        (20, "Hulu", -17.99, "Subscriptions"), (24, "Planet Fitness", -29.99, "Subscriptions"),
        (7, "AMC Theatres", -58.50, "Entertainment"), (12, "Bowling Alley", -66.20, "Entertainment"),
        (19, "Concert Tickets", -128.00, "Entertainment"), (26, "Kindle Books", -38.98, "Entertainment"),
        (5, "Amazon", -89.84, "Shopping"), (10, "Target", -136.45, "Shopping"),
        (16, "Old Navy", -118.32, "Shopping"), (22, "Amazon", -94.17, "Shopping"),
        (28, "Best Buy", -162.61, "Shopping"), (11, "CVS Pharmacy", -18.44, "Health"),
        (25, "Walgreens", -23.79, "Health"), (13, "Venmo - Birthday Gift", -45.00, "Other"),
        (18, "Etsy", -47.45, "Other"), (21, "Pet Supplies Plus", -51.26, "Other"),
        (30, "Farmers Market", -42.80, "Other"),
    ]
    txs = [_local_tx(_dated(current_month, day), merchant, amount, category, "demo") for day, merchant, amount, category in current_specs]
    txs += [_local_tx(_dated(prior_month, day), merchant, amount, category, "baseline") for day, merchant, amount, category in baseline_specs]
    return txs


def local_load_realistic_transaction_history(as_of):
    _, current_end = month_bounds(as_of.replace(day=1))
    baseline_start, _ = month_bounds(previous_month(as_of.replace(day=1)))
    existing = [
        tx for tx in st.session_state.get("local_transactions", [])
        if str(tx.get("source", "manual")).lower() not in {"demo", "baseline", "simulation"}
        or parse_tx_date(tx) < baseline_start
        or parse_tx_date(tx) > current_end
    ]
    sample = local_sample_transactions(as_of)
    st.session_state.local_transactions = existing + sample
    return {
        "status": "ok",
        "loaded": sum(1 for tx in sample if tx.get("source") == "demo"),
        "baseline_loaded": sum(1 for tx in sample if tx.get("source") == "baseline"),
        "local": True,
    }


def local_simulate_week(scenario, as_of):
    if not st.session_state.get("local_transactions"):
        local_load_realistic_transaction_history(as_of)
    week_start, week_end = week_bounds(as_of)
    baseline_start, baseline_end = month_bounds(previous_month(as_of.replace(day=1)))
    baseline_weeks = max(1.0, ((baseline_end - baseline_start).days + 1) / 7.0)
    tracked = {"Food", "Coffee", "Restaurants / dining", "Shopping", "Entertainment", "Subscriptions", "Other", "Transportation", "Other discretionary"}
    kept = []
    baseline_totals = {}
    deleted = 0
    for tx in st.session_state.get("local_transactions", []):
        tx_date = parse_tx_date(tx)
        bucket = intelligence_bucket(tx)
        if baseline_start <= tx_date <= baseline_end and float(tx.get("amount", 0.0)) < 0 and bucket in BEHAVIOR_TRACKED_CATEGORIES:
            baseline_totals[bucket] = baseline_totals.get(bucket, 0.0) + abs(float(tx["amount"]))
        is_current_week_tracked = week_start <= tx_date <= week_end and str(tx.get("category")) in tracked
        if is_current_week_tracked and str(tx.get("source", "demo")).lower() in {"demo", "simulation"}:
            deleted += 1
            continue
        if str(tx.get("source", "")).lower() == "simulation":
            deleted += 1
            continue
        kept.append(tx)

    multipliers = SIMULATION_MULTIPLIERS[scenario]
    merchants = {
        "Coffee": {"good": "Home Coffee Supplies", "average": "Starbucks", "overspending": "Starbucks"},
        "Restaurants / dining": {"good": "Chipotle", "average": "Sweetgreen", "overspending": "DoorDash"},
        "Shopping": {"good": "Target", "average": "Amazon", "overspending": "Amazon"},
        "Entertainment": {"good": "Kindle Books", "average": "AMC Theatres", "overspending": "Concert Tickets"},
        "Subscriptions": {"good": "Spotify", "average": "Netflix", "overspending": "Streaming Bundle"},
        "Other discretionary": {"good": "Local Errand", "average": "Convenience Store", "overspending": "Impulse Purchase"},
        "Transportation": {"good": "Metro Transit", "average": "Uber", "overspending": "Lyft"},
    }
    elapsed_days = max(1, (min(as_of, week_end) - week_start).days + 1)
    simulation_txs = []
    for idx, category in enumerate(BEHAVIOR_TRACKED_CATEGORIES):
        weekly_amount = baseline_totals.get(category, 0.0) / baseline_weeks
        if weekly_amount <= 0:
            continue
        amount = round(weekly_amount * (elapsed_days / 7.0) * multipliers.get(category, 1.0), 2)
        if amount < 1:
            continue
        simulation_txs.append(
            _local_tx(
                min(week_end, week_start + datetime.timedelta(days=min(idx, elapsed_days - 1))),
                merchants.get(category, {}).get(scenario, category),
                -amount,
                "Other" if category == "Other discretionary" else category,
                "simulation",
                scenario,
            )
        )
    st.session_state.local_transactions = kept + simulation_txs
    return {"status": "ok", "scenario": scenario, "deleted": deleted, "loaded": len(simulation_txs), "local": True}


SIMULATION_MULTIPLIERS = {
    "good": {
        "Coffee": 0.60,
        "Restaurants / dining": 0.65,
        "Shopping": 0.70,
        "Entertainment": 0.75,
        "Subscriptions": 1,
        "Other discretionary": 1,
        "Transportation": 1,
    },
    "average": {
        "Coffee": 1,
        "Restaurants / dining": 1,
        "Shopping": 1,
        "Entertainment": 1,
        "Subscriptions": 1,
        "Other discretionary": 1,
        "Transportation": 1,
    },
    "overspending": {
        "Coffee": 1.20,
        "Restaurants / dining": 1.40,
        "Shopping": 1.50,
        "Entertainment": 1.35,
        "Subscriptions": 1,
        "Other discretionary": 1.25,
        "Transportation": 1.10,
    },
}


def calculate_goal_analysis(
    transactions,
    selected_month,
    active_simulation,
    goal_cost,
    goal_progress,
    target_date,
    weekly_target,
    flexibility_preferences,
):
    target_date = canonical_target_date(target_date)
    selected_month = selected_month.replace(day=1)
    as_of = today if (selected_month.year, selected_month.month) == (today.year, today.month) else month_bounds(selected_month)[1]
    current_week_start, current_week_end = week_bounds(as_of)
    elapsed_days = max(1, (min(as_of, current_week_end) - current_week_start).days + 1)
    baseline_start, baseline_end = month_bounds(previous_month(selected_month))
    baseline_weeks = max(1.0, ((baseline_end - baseline_start).days + 1) / 7.0)

    baseline = {}
    current = {}
    simulation_scenarios = []
    simulation_count = 0
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        category_name = intelligence_bucket(tx)
        if category_name not in BEHAVIOR_TRACKED_CATEGORIES:
            continue
        tx_date = parse_tx_date(tx)
        spend = abs(amount)
        if baseline_start <= tx_date <= baseline_end:
            baseline[category_name] = baseline.get(category_name, 0.0) + spend
        if current_week_start <= tx_date <= min(as_of, current_week_end):
            current[category_name] = current.get(category_name, 0.0) + spend
            if str(tx.get("source") or "").lower() == "simulation":
                simulation_count += 1
                if tx.get("scenario"):
                    simulation_scenarios.append(str(tx.get("scenario")))

    inferred_simulation = active_simulation or (simulation_scenarios[-1] if simulation_scenarios else "none")
    category_names = sorted(set(baseline) | set(current), key=category_priority)
    category_deltas = []
    for category_name in category_names:
        baseline_weekly = baseline.get(category_name, 0.0) / baseline_weeks
        current_weekly = current.get(category_name, 0.0) / elapsed_days * 7.0
        delta = baseline_weekly - current_weekly
        if abs(delta) < 1:
            status = "tracking normally"
        elif delta > 0:
            status = "savings detected"
        else:
            status = "spending increased"
        category_deltas.append(
            {
                "Category": category_name,
                "Baseline weekly": baseline_weekly,
                "Current weekly pace": current_weekly,
                "Estimated savings": delta,
                "Status": status,
            }
        )

    baseline_weekly_flexible_spend = sum(float(row["Baseline weekly"]) for row in category_deltas)
    current_week_flexible_spend = sum(float(row["Current weekly pace"]) for row in category_deltas)
    behavior_improvement = baseline_weekly_flexible_spend - current_week_flexible_spend
    saved_toward_goal_this_week = max(0.0, behavior_improvement)
    starting_remaining = max(0.0, float(goal_cost) - max(0.0, float(goal_progress)))
    remaining = max(0.0, starting_remaining - saved_toward_goal_this_week)
    weeks_until_target = max(1.0, (target_date - today).days / 7.0)
    computed_weekly_target = starting_remaining / weeks_until_target
    gap_vs_target = behavior_improvement - computed_weekly_target

    enabled_categories = {
        category
        for category, pref in (flexibility_preferences or {}).items()
        if isinstance(pref, dict) and pref.get("enabled", False)
    }
    recommended_actions = []
    for row in sorted(category_deltas, key=lambda item: item["Estimated savings"]):
        category = row["Category"]
        if enabled_categories and category not in enabled_categories:
            continue
        if row["Estimated savings"] < -1 or category in {"Coffee", "Restaurants / dining", "Shopping", "Entertainment", "Subscriptions"}:
            recommended_actions.append(
                {
                    "Category": category,
                    "Behavior delta": row["Estimated savings"],
                    "Recommendation": category_action_phrase(category),
                }
            )

    scenario_rows = []
    scenario_checks = {}
    for scenario_name, multipliers in SIMULATION_MULTIPLIERS.items():
        scenario_current = sum(
            (baseline.get(category, 0.0) / baseline_weeks) * multipliers.get(category, 1.0)
            for category in category_names
        )
        scenario_delta = baseline_weekly_flexible_spend - scenario_current
        scenario_analysis = calculateGoalTrajectory(
            active_simulation=scenario_name,
            baseline_weekly_flexible_spend=baseline_weekly_flexible_spend,
            current_week_flexible_spend=scenario_current,
            goal_cost=goal_cost,
            goal_progress=goal_progress,
            target_date=target_date,
            today=today,
            category_deltas=category_deltas,
            recommended_actions=recommended_actions,
            number_of_simulation_transactions=simulation_count,
        )
        scenario_checks[scenario_name] = {
            "current_spend": scenario_current,
            "behavior_improvement": scenario_analysis["behaviorImprovement"],
            "projected_date": scenario_analysis["projectedDate"],
        }
        scenario_rows.append(
            {
                "Scenario": {"good": "Good week", "average": "Average week", "overspending": "Overspending week"}[scenario_name],
                "Baseline spend": baseline_weekly_flexible_spend,
                "Current spend": scenario_current,
                "Behavior delta": scenario_delta,
                "Projected date": scenario_analysis["projectedDate"],
                "Expected direction": "Positive" if scenario_delta > 1 else "Near zero" if abs(scenario_delta) <= 1 else "Negative",
            }
        )

    if scenario_checks and baseline_weekly_flexible_spend > 0:
        assert (
            scenario_checks["good"]["behavior_improvement"] > scenario_checks["average"]["behavior_improvement"]
        ), "Good week must improve behavior versus average"
        assert (
            scenario_checks["overspending"]["behavior_improvement"] < scenario_checks["average"]["behavior_improvement"]
        ), "Overspending week must worsen behavior versus average"
        assert (
            scenario_checks["good"]["projected_date"] <= scenario_checks["average"]["projected_date"] <= scenario_checks["overspending"]["projected_date"]
        ), "Projection dates must move earlier for good and later for overspending"

    trajectory = calculateGoalTrajectory(
        active_simulation=inferred_simulation,
        baseline_weekly_flexible_spend=baseline_weekly_flexible_spend,
        current_week_flexible_spend=current_week_flexible_spend,
        goal_cost=goal_cost,
        goal_progress=goal_progress,
        target_date=target_date,
        today=today,
        category_deltas=category_deltas,
        recommended_actions=recommended_actions,
        number_of_simulation_transactions=simulation_count,
    )

    return {
        "activeSimulation": inferred_simulation,
        "baselineWeeklyFlexibleSpend": trajectory["baselineWeeklyFlexibleSpend"],
        "currentWeekFlexibleSpend": trajectory["currentWeekFlexibleSpend"],
        "behaviorImprovement": trajectory["behaviorImprovement"],
        "behaviorDelta": trajectory["behaviorDelta"],
        "detectedSavings": trajectory["detectedSavings"],
        "savedTowardGoalThisWeek": trajectory["savedTowardGoalThisWeek"],
        "weeklyTarget": trajectory["weeklyTarget"],
        "weeklyGoalNeed": trajectory["weeklyGoalNeed"],
        "gapVsTarget": trajectory["gapVsTarget"],
        "behaviorGapVsTarget": trajectory["gapVsTarget"],
        "behaviorGap": trajectory["behaviorGap"],
        "savingsGap": trajectory["savingsGap"],
        "remaining": trajectory["remaining"],
        "projectedDate": trajectory["projectedDate"],
        "behaviorProjectedDate": trajectory["projectedDate"],
        "trajectoryStatus": trajectory["trajectoryStatus"],
        "behaviorTrajectoryStatus": trajectory["trajectoryStatus"],
        "savingsTrajectoryStatus": trajectory["trajectoryStatus"],
        "categoryDeltas": category_deltas,
        "recommendedActions": recommended_actions,
        "numberOfSimulationTransactions": simulation_count,
        "baseline_weekly_flexible_spend": baseline_weekly_flexible_spend,
        "weekly_target": computed_weekly_target,
        "gap_vs_target": gap_vs_target,
        "remaining": trajectory["remaining"],
        "progress_amount": max(0.0, float(goal_progress)),
        "effective_progress_amount": min(float(goal_cost), max(0.0, float(goal_progress)) + trajectory["savedTowardGoalThisWeek"]),
        "projected_date": trajectory["projectedDate"],
        "trajectory_status": trajectory["trajectoryStatus"],
        "category_deltas": category_deltas,
        "recommended_actions": recommended_actions,
        "number_of_simulation_transactions": simulation_count,
        "validation_scenarios": scenario_rows,
        "simulation": {
            "active_simulation": inferred_simulation,
            "adjusted_weekly_spend": trajectory["currentWeekFlexibleSpend"],
            "behavior_improvement": trajectory["behaviorImprovement"],
            "effective_gap_vs_target": trajectory["gapVsTarget"],
            "projected_completion_date": trajectory["projectedDate"],
            "trajectory_status": trajectory["trajectoryStatus"],
            "estimated_days_early_or_late": (trajectory["projectedDate"] - target_date).days if trajectory["projectedDate"] else None,
            "projection_confidence": trajectory["simulationSummary"]["projection_confidence"],
        },
        "simulationSummary": trajectory["simulationSummary"],
    }


def savings_detection_sentence(row):
    amount = abs(float(row["Estimated savings"]))
    if row["Estimated savings"] > 0:
        return f"{row['Category']} spending is down {money(amount)} this week."
    if row["Estimated savings"] < 0:
        return f"{row['Category']} spending increased {money(amount)} this week."
    return f"{row['Category']} is tracking normally this week."


def behavior_difficulty_label(strategy):
    weekly_cuts = float(strategy.get("Estimated weekly cuts", 0.0))
    item_count = len(strategy.get("items", []))
    high_impact_count = sum(1 for item in strategy.get("items", []) if item.get("Lifestyle impact") == "high impact")
    if weekly_cuts < 35 and high_impact_count == 0:
        return "Easy win"
    if weekly_cuts < 90 and high_impact_count <= 1 and item_count <= 4:
        return "Moderate adjustment"
    return "Major lifestyle adjustment"


def build_category_intelligence(transactions, previous_transactions=None):
    previous_transactions = previous_transactions or []
    totals = {}
    counts = {}
    prev_totals = {}
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount < 0:
            bucket = intelligence_bucket(tx)
            totals[bucket] = totals.get(bucket, 0.0) + abs(amount)
            counts[bucket] = counts.get(bucket, 0) + 1
    for tx in previous_transactions:
        amount = float(tx.get("amount", 0.0))
        if amount < 0:
            bucket = intelligence_bucket(tx)
            prev_totals[bucket] = prev_totals.get(bucket, 0.0) + abs(amount)

    total_spend = sum(totals.values())
    weeks_in_month = max(1.0, calendar.monthrange(month_start.year, month_start.month)[1] / 7)
    rows = []
    for category_name, monthly_spend in sorted(totals.items(), key=lambda item: category_priority(item[0])):
        cut_rate = category_cut_rate(category_name)
        suggested_cut = monthly_spend * cut_rate
        prev = prev_totals.get(category_name)
        if prev is None:
            trend = None
        else:
            trend = monthly_spend - prev
        rows.append(
            {
                "Category": category_name,
                "Monthly spend": monthly_spend,
                "Weekly average": monthly_spend / weeks_in_month,
                "Transaction count": counts.get(category_name, 0),
                "Average transaction": monthly_spend / max(1, counts.get(category_name, 0)),
                "% of spend": (monthly_spend / total_spend * 100) if total_spend > 0 else 0.0,
                "Trend": trend,
                "Flexibility": category_flexibility(category_name),
                "Suggested cut": suggested_cut,
                "Insight": category_insight(category_name, monthly_spend, suggested_cut, total_spend),
            }
        )
    return rows


def spending_summary(transactions):
    flexible = {key: 0.0 for key in FLEXIBLE_CUT_RULES}
    protected = {}

    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        spend = abs(amount)
        category = str(tx.get("category", "")).strip()
        bucket = flexible_bucket(tx)
        if bucket:
            flexible[bucket] += spend
        else:
            protected[category] = protected.get(category, 0.0) + spend

    return flexible, protected


def lifestyle_impact(category_name, cut_rate):
    if cut_rate <= 0.20:
        return "low impact"
    if category_name == "Subscriptions" and cut_rate <= 0.45:
        return "low impact"
    if cut_rate <= 0.45:
        return "moderate impact"
    return "high impact"


def category_action_phrase(category_name):
    return {
        "Subscriptions": "Pause unused subscriptions",
        "Restaurants / dining": "Reduce takeout frequency",
        "Coffee": "Replace some cafe purchases with home coffee",
        "Shopping": "Delay discretionary purchases temporarily",
        "Entertainment": "Choose fewer paid nights out",
        "Other discretionary": "Trim impulse and one-off discretionary spending",
        "Groceries": "Switch a few premium grocery items to lower-cost staples",
        "Transportation": "Reduce ride share or paid parking where practical",
        "Health": "Avoid non-urgent pharmacy extras",
        "Rent / bills": "Review bills only where there is a real lower-cost option",
        "Savings": "Temporarily lower extra savings transfers",
    }.get(category_name, "Reduce flexible spending")


def recommendation_language(category_name, weekly_cut, current_weekly_spend, avg_transaction=0.0):
    if category_name == "Coffee":
        purchases = max(1, round(float(weekly_cut) / max(1.0, float(avg_transaction or 6.5))))
        if purchases == 1:
            return f"Skipping about 1 cafe purchase per week could free up {money(weekly_cut)}/week."
        return f"Cutting {purchases}-{purchases + 1} coffee purchases per week could free up about {money(weekly_cut)}/week."
    if category_name == "Restaurants / dining":
        meals = max(1, round(float(weekly_cut) / max(12.0, float(avg_transaction or 25.0))))
        return f"Replacing about {meals} takeout or restaurant order per week could free up {money(weekly_cut)}/week."
    if category_name == "Subscriptions":
        return f"Pausing unused or duplicate subscriptions could free up about {money(weekly_cut)}/week."
    if category_name == "Shopping":
        return f"Delaying discretionary purchases could free up about {money(weekly_cut)}/week without touching essentials."
    if category_name == "Entertainment":
        return f"Choosing a lower-cost plan for nights out could free up about {money(weekly_cut)}/week."
    return f"{category_action_phrase(category_name)} to free up about {money(weekly_cut)}/week."


def action_label(category_name, weekly_cut, current_weekly_spend=0.0, avg_transaction=0.0):
    weekly_cut = float(weekly_cut)
    current_weekly_spend = float(current_weekly_spend or 0.0)
    avg_transaction = float(avg_transaction or 0.0)
    if category_name == "Restaurants / dining":
        visits = max(1, round(weekly_cut / max(18.0, avg_transaction or 24.0)))
        return f"Skip {visits} restaurant visit{'s' if visits != 1 else ''}"
    if category_name == "Coffee":
        runs = max(1, round(weekly_cut / max(5.0, avg_transaction or 6.0)))
        return f"Make {runs} coffee run{'s' if runs != 1 else ''} at home"
    if category_name == "Shopping":
        pct = min(35, max(10, round((weekly_cut / max(1.0, current_weekly_spend)) * 100 / 5) * 5))
        return f"Reduce shopping by {pct}%"
    if category_name == "Entertainment":
        return "Pick one lower-cost night out"
    if category_name == "Subscriptions":
        return "Pause one unused subscription" if weekly_cut * 4.345 <= 20 else "Pause unused subscriptions"
    return category_action_phrase(category_name)


def timeline_impact_text(weekly_cut, weekly_target):
    weekly_cut = float(weekly_cut)
    weekly_target = max(1.0, float(weekly_target or 0.0))
    share = weekly_cut / weekly_target
    if share >= 0.75:
        return "This covers most of your weekly goal pace."
    if share >= 0.35:
        return "This meaningfully pulls the goal date closer."
    return "This gives the goal a small but useful push."


def what_this_changes(recommendations):
    categories = [str(r.get("Category", "")).replace(" (protected)", "") for r in recommendations]
    if not categories:
        return "This plan keeps your routine intact, but it does not create enough savings on its own."
    protected_touched = any(category_flexibility(cat) == "protected" for cat in categories)
    primary = ", ".join(categories[:3])
    if protected_touched:
        return f"This plan mainly changes {primary}."
    return f"This plan mainly reduces {primary} while avoiding protected and essential categories."


def enrich_recommendations(recommendations, category_rows, weekly_target=0.0):
    by_category = {row["Category"]: row for row in category_rows}
    enriched = []
    for rec in recommendations:
        base_category = str(rec["Category"]).replace(" (protected)", "")
        row = by_category.get(base_category, {})
        current_weekly = float(rec.get("Current weekly spend", 0.0))
        weekly_cut = float(rec.get("Recommended weekly cut", rec.get("Weekly cut", 0.0)))
        cut_rate = weekly_cut / max(1.0, current_weekly)
        rec = dict(rec)
        rec["Lifestyle impact"] = lifestyle_impact(base_category, cut_rate)
        rec["Behavior change"] = category_action_phrase(base_category)
        rec["Baseline spend"] = float(row.get("Weekly average", current_weekly))
        rec["Current spend"] = current_weekly
        rec["Projected impact"] = weekly_cut
        rec["Action"] = action_label(
            base_category,
            weekly_cut,
            current_weekly,
            avg_transaction=float(row.get("Average transaction", 0.0)),
        )
        rec["Timeline impact"] = timeline_impact_text(weekly_cut, weekly_target)
        rec["Protected categories"] = ", ".join(
            category for category, role in ensure_category_roles().items() if role == "protected"
        )
        rec["Recommendation"] = recommendation_language(
            base_category,
            weekly_cut,
            current_weekly,
            avg_transaction=float(row.get("Average transaction", 0.0)),
        )
        enriched.append(rec)
    return enriched


def recommend_goal_cuts(
    weekly_needed,
    flexible,
    allow_protected,
    protected,
    budget_allocations=None,
    preferences=None,
    plan_style="Balanced",
    improved_categories=None,
):
    preferences = preferences or ensure_flexibility_preferences()
    budget_allocations = budget_allocations or {}
    improved_categories = improved_categories or set()
    weeks_elapsed = max(1.0, ((as_of_date - month_start).days + 1) / 7)
    weekly_spend = {k: v / weeks_elapsed for k, v in flexible.items()}
    budget_weekly = {k: 0.0 for k in FLEXIBLE_CUT_RULES}
    for category, monthly_amount in budget_allocations.items():
        bucket = flexible_bucket({"category": category, "merchant": ""})
        if bucket:
            budget_weekly[bucket] += float(monthly_amount) / 4.345

    baseline_weekly = {
        key: max(weekly_spend.get(key, 0.0), budget_weekly.get(key, 0.0))
        for key in FLEXIBLE_CUT_RULES
    }
    recommendations = []
    remaining = float(weekly_needed)

    flexible_candidates = sorted(
        FLEXIBLE_CUT_RULES.items(),
        key=lambda item: (-baseline_weekly.get(item[0], 0.0), item[1]["priority"]),
    )
    for key, rule in flexible_candidates:
        if not preference_for_category(rule["label"], preferences).get("enabled", False):
            continue
        rate = preference_adjusted_cut_rate(rule["label"], preferences, plan_style)
        if rule["label"] in improved_categories:
            rate *= 0.25
        capacity = baseline_weekly.get(key, 0.0) * rate
        cut = min(remaining, capacity)
        if cut >= 1:
            if rule["label"] in improved_categories:
                why_selected = (
                    f"You already improved {rule['label']} this week, so this is a small maintenance adjustment "
                    "instead of asking for another major cut."
                )
            else:
                why_selected = (
                    f"You approved {rule['label']} at "
                    f"{preference_for_category(rule['label'], preferences).get('aggressiveness', 'Moderate cuts').lower()}, "
                    "and your recent transactions show optional spend there."
                )
            recommendations.append(
                {
                    "Category": rule["label"],
                    "Current weekly spend": baseline_weekly.get(key, 0.0),
                    "Recommended weekly cut": cut,
                    "Why selected": why_selected,
                }
            )
            remaining -= cut
        if remaining <= 0.5:
            break

    return recommendations, max(0.0, remaining)


def build_strategy_plan(name, weekly_needed, category_rows, allow_protected, preferences=None):
    preferences = preferences or ensure_flexibility_preferences()
    style_multiplier = {"Conservative": 0.65, "Balanced": 1.0, "Aggressive": 1.35}[name]
    difficulty_base = {"Conservative": 2, "Balanced": 4, "Aggressive": 7}[name]
    remaining = float(weekly_needed)
    recommendations = []

    candidate_rows = []
    for row in category_rows:
        flexibility = row["Flexibility"]
        pref = preference_for_category(row["Category"], preferences)
        if not pref.get("enabled", False):
            continue
        if flexibility != "flexible":
            continue
        strategy_style = canonical_plan_style(name)
        cut_rate = preference_adjusted_cut_rate(row["Category"], preferences, strategy_style) * style_multiplier
        cut_rate = min(cut_rate, realism_cap(row["Category"], strategy_style))
        weekly_baseline = float(row["Weekly average"])
        weekly_capacity = weekly_baseline * cut_rate
        if weekly_capacity >= 1:
            candidate_rows.append((category_priority(row["Category"]), row, weekly_capacity, pref))

    for _, row, weekly_capacity, pref in sorted(candidate_rows, key=lambda item: item[0]):
        cut = min(remaining, weekly_capacity)
        if cut >= 1:
            recommendations.append(
                {
                    "Category": row["Category"],
                    "Weekly cut": cut,
                    "Monthly impact": cut * 4.345,
                    "Lifestyle impact": lifestyle_impact(row["Category"], cut / max(1.0, float(row["Weekly average"]))),
                    "Recommendation": recommendation_language(
                        row["Category"],
                        cut,
                        float(row["Weekly average"]),
                        avg_transaction=float(row.get("Average transaction", 0.0)),
                    ),
                    "Why selected": (
                        f"You approved {row['Category']} at {pref.get('aggressiveness', 'moderate cuts').lower()}. "
                        f"{row['Insight']}"
                    ),
                }
            )
            remaining -= cut
        if remaining <= 0.5:
            break

    total_weekly_cut = sum(item["Weekly cut"] for item in recommendations)
    likelihood = min(100, round((total_weekly_cut / max(1.0, weekly_needed)) * 100))
    categories_affected = ", ".join(item["Category"] for item in recommendations) or "None"
    adjustment_score = min(10, max(1, round(difficulty_base + (len(recommendations) * 0.6) + (remaining / max(1.0, weekly_needed) * 3))))
    if likelihood >= 95:
        pace_label = "Very achievable"
    elif likelihood >= 75:
        pace_label = "Achievable with consistency"
    elif likelihood >= 45:
        pace_label = "Tight timeline"
    else:
        pace_label = "Unrealistic without major changes"
    if adjustment_score <= 3:
        adjustment_label = "Minimal"
    elif adjustment_score <= 6:
        adjustment_label = "Noticeable"
    elif adjustment_score <= 8:
        adjustment_label = "Major"
    else:
        adjustment_label = "Extreme"
    if likelihood >= 95:
        explanation = f"This plan can cover the goal using {categories_affected} while staying explainable and tied to current spending."
    elif likelihood >= 60:
        explanation = f"This plan makes meaningful progress, but it leaves about {money(remaining)}/week uncovered."
    else:
        explanation = f"This plan is not enough on its own; move the date, reduce the target, or add income."

    return {
        "Plan": f"{name} plan",
        "Realistic pace": pace_label,
        "Estimated weekly cuts": total_weekly_cut,
        "Categories affected": categories_affected,
        "Lifestyle adjustment": adjustment_label,
        "Explanation": explanation,
        "items": recommendations,
        "remaining_gap": max(0.0, remaining),
    }


def build_target_date_simulations(goal_cost, target_date):
    rows = []
    current_days = max(1, (target_date - today).days)
    current_weekly = float(goal_cost) / max(1.0, current_days / 7)
    for extra_days in [30, 60, 90]:
        new_target = target_date + datetime.timedelta(days=extra_days)
        new_days = max(1, (new_target - today).days)
        new_weekly = float(goal_cost) / max(1.0, new_days / 7)
        rows.append(
            {
                "New target date": new_target.strftime("%b %-d, %Y"),
                "Required weekly savings": new_weekly,
                "Weekly reduction": current_weekly - new_weekly,
            }
        )
    return rows


def money(value):
    if value in {None, ""}:
        return "Price unavailable"
    return f"${float(value):,.2f}"


def source_text_says_free(idea):
    debug = idea.get("validation_debug", {}) or {}
    text = " ".join(
        [
            str(idea.get("title", "")),
            str(idea.get("source_price_or_price_note", "")),
            str(idea.get("affordability_note", "")),
            str(debug.get("extraction_snippet", "")),
        ]
    ).lower()
    return bool(re.search(r"(\$0\b|\bfree\b|\bno cost\b|\bcomplimentary\b|\btrial\b)", text))


def calculate_monthly_savings_from_cost(estimated_cost, target_month):
    if estimated_cost in {None, ""}:
        return None
    try:
        cost = float(estimated_cost)
    except Exception:
        return None
    target_date = parse_discovery_target_date(target_month)
    months_until = max(1.0, (target_date - today).days / 30.4375)
    return cost / months_until


def normalize_target_month(value):
    return parse_discovery_target_date(value).strftime("%B %Y")


def final_goal_card_gate(idea):
    debug = idea.get("validation_debug", {}) or {}
    source_urls = idea.get("source_urls", []) or []
    source_titles = idea.get("source_titles", []) or []
    raw_price = idea.get("current_price", idea.get("estimated_cost"))
    try:
        estimated_cost = float(idea.get("estimated_cost")) if idea.get("estimated_cost") not in {None, ""} else None
    except Exception:
        estimated_cost = None
    is_free = source_text_says_free(idea)
    confidence = str(idea.get("confidence", "")).lower()
    if confidence in {"medium", "high"} and (not source_urls or not source_titles):
        return False, idea, {
            "reason": "Rejected: missing source metadata",
            "raw_price": raw_price,
            "estimated_cost": idea.get("estimated_cost"),
            "source_title": source_titles[0] if source_titles else "",
            "source_url": source_urls[0] if source_urls else debug.get("extraction_source", ""),
        }
    if is_free and (estimated_cost is None or estimated_cost <= 5):
        idea["estimated_cost"] = 0.0
        idea["current_price"] = 0.0
        idea["monthly_savings"] = 0.0
        idea["monthly_savings_needed"] = 0.0
        idea["monthly_savings_required"] = 0.0
        return True, idea, None
    if estimated_cost is None or estimated_cost <= 5:
        return False, idea, {
            "reason": "Rejected: invalid price",
            "raw_price": raw_price,
            "estimated_cost": idea.get("estimated_cost"),
            "source_title": source_titles[0] if source_titles else "",
            "source_url": source_urls[0] if source_urls else debug.get("extraction_source", ""),
        }
    if str(idea.get("type", idea.get("goal_type", ""))).lower() == "subscription":
        monthly = estimated_cost
    else:
        monthly = calculate_monthly_savings_from_cost(estimated_cost, idea.get("target_month") or idea.get("target_date_or_month"))
    idea["monthly_savings"] = monthly
    idea["monthly_savings_needed"] = monthly
    idea["monthly_savings_required"] = monthly
    return True, idea, None


def render_need_more_price_data(search_links):
    if not search_links:
        return
    st.markdown("**Need more price data**")
    st.caption("Byable found ideas, but not enough verified prices. These searches are more likely to surface purchasable pages.")
    cols = st.columns(min(3, len(search_links)))
    for idx, link in enumerate(search_links[:3]):
        with cols[idx % len(cols)]:
            st.link_button(link["label"], link["url"])


LANTERN_DEMO_CATEGORIES = {
    "restaurants": {
        "label": "restaurants",
        "share": 0.30,
        "action": "Limit restaurant spending by planning one lower-cost meal.",
    },
    "shopping": {
        "label": "shopping",
        "share": 0.25,
        "action": "Pause non-essential shopping until next week.",
    },
    "entertainment": {
        "label": "entertainment",
        "share": 0.20,
        "action": "Choose one lower-cost entertainment option.",
    },
    "coffee": {
        "label": "coffee",
        "share": 0.10,
        "action": "Make coffee at home a few extra days.",
    },
    "subscriptions": {
        "label": "subscriptions",
        "share": 0.15,
        "action": "Pause or cancel one subscription you are not using.",
    },
}


def calculate_lantern_demo(
    goal_name,
    cost,
    target_date,
    monthly_income,
    essential_spending,
    flexible_spending,
    selected_categories,
):
    target_date = canonical_target_date(target_date)
    days_until = max(1, (target_date - today).days)
    weeks_until = max(1.0, days_until / 7)
    required_weekly_savings = float(cost) / weeks_until

    monthly_surplus = float(monthly_income) - float(essential_spending) - float(flexible_spending)
    current_weekly_savings = max(0.0, monthly_surplus * 12 / 52)
    flexible_weekly = max(0.0, float(flexible_spending) * 12 / 52)
    weekly_gap = max(0.0, required_weekly_savings - current_weekly_savings)

    selected = [key for key in selected_categories if key in LANTERN_DEMO_CATEGORIES]
    selected_share_total = sum(LANTERN_DEMO_CATEGORIES[key]["share"] for key in selected)
    selected_weekly_spend = flexible_weekly * min(1.0, selected_share_total)
    suggested_cut_total = min(weekly_gap, selected_weekly_spend * 0.35)
    share_denominator = selected_share_total or 1.0

    plan_rows = []
    for key in selected:
        category = LANTERN_DEMO_CATEGORIES[key]
        suggested_cut = suggested_cut_total * (category["share"] / share_denominator)
        if suggested_cut >= 0.50:
            plan_rows.append(
                {
                    "Category": category["label"],
                    "Weekly cut": suggested_cut,
                    "This week": category["action"],
                }
            )

    planned_weekly_savings = current_weekly_savings + suggested_cut_total
    if planned_weekly_savings >= required_weekly_savings:
        status = "On track"
    elif planned_weekly_savings >= required_weekly_savings * 0.75:
        status = "Near target"
    else:
        status = "Behind"

    if planned_weekly_savings > 0:
        projected_weeks = float(cost) / planned_weekly_savings
        projected_date = today + datetime.timedelta(days=round(projected_weeks * 7))
    else:
        projected_date = None

    clean_goal_name = goal_name.strip() or "this goal"
    if plan_rows:
        plan_text = (
            f"Move {money(required_weekly_savings)} toward {clean_goal_name} this week. "
            f"The selected categories can contribute about {money(suggested_cut_total)} per week."
        )
    elif current_weekly_savings >= required_weekly_savings:
        plan_text = (
            f"Your current surplus can cover the goal. Set aside {money(required_weekly_savings)} this week."
        )
    else:
        plan_text = (
            "Select at least one flexible category, move the target date, reduce the cost, or increase income."
        )

    return {
        "required_weekly_savings": required_weekly_savings,
        "suggested_cut_total": suggested_cut_total,
        "projected_date": projected_date,
        "status": status,
        "plan_text": plan_text,
        "plan_rows": plan_rows,
    }


def render_lantern_demo_page():
    st.title("Can I afford this?")
    st.caption("Byable demo. Local calculations only.")

    with st.form("lantern_demo_form"):
        goal_cols = st.columns([1.4, 0.8, 0.8])
        goal_name = goal_cols[0].text_input("What do you want to afford?", value="Hawaii trip")
        cost = goal_cols[1].number_input("How much does it cost?", min_value=1.0, value=1800.0, step=25.0)
        target_date = goal_cols[2].date_input(
            "By what date?",
            value=today + datetime.timedelta(days=90),
            min_value=today,
        )

        cash_cols = st.columns(3)
        monthly_income = cash_cols[0].number_input("Monthly income", min_value=0.0, value=4200.0, step=100.0)
        essential_spending = cash_cols[1].number_input(
            "Monthly essential spending",
            min_value=0.0,
            value=2600.0,
            step=100.0,
        )
        flexible_spending = cash_cols[2].number_input(
            "Monthly flexible spending",
            min_value=0.0,
            value=900.0,
            step=50.0,
        )

        st.write("Categories the user is willing to reduce")
        selected_categories = []
        category_cols = st.columns(len(LANTERN_DEMO_CATEGORIES))
        for col, (key, category) in zip(category_cols, LANTERN_DEMO_CATEGORIES.items()):
            if col.checkbox(category["label"], value=True, key=f"demo_reduce_{key}"):
                selected_categories.append(key)

        email = st.text_input("Want updates? Enter your email", placeholder="you@example.com")
        submitted = st.form_submit_button("Show my path", width="stretch")

    if not submitted:
        st.info("Enter a goal and click Show my path to see the weekly plan.")
        return

    result = calculate_lantern_demo(
        goal_name=goal_name,
        cost=cost,
        target_date=target_date,
        monthly_income=monthly_income,
        essential_spending=essential_spending,
        flexible_spending=flexible_spending,
        selected_categories=selected_categories,
    )

    if email.strip():
        st.session_state.setdefault("lantern_emails", [])
        if email.strip() not in st.session_state.lantern_emails:
            st.session_state.lantern_emails.append(email.strip())
        st.success("Email saved. You are on the Byable updates list.")

    metric_cols = st.columns(3)
    metric_cols[0].metric("Required weekly savings", money(result["required_weekly_savings"]))
    metric_cols[1].metric(
        "Projected affordability date",
        result["projected_date"].strftime("%b %-d, %Y") if result["projected_date"] else "Not projected",
    )
    metric_cols[2].metric("Status", result["status"])

    st.subheader("Suggested weekly plan")
    st.write(result["plan_text"])
    if result["plan_rows"]:
        plan_df = pd.DataFrame(result["plan_rows"])
        plan_df["Weekly cut"] = plan_df["Weekly cut"].map(money)
        st.dataframe(plan_df, width="stretch", hide_index=True)
    else:
        st.info("No category cuts are available from the current selections.")


@st.dialog("Flexibility preferences")
def flexibility_preferences_dialog():
    preferences = ensure_flexibility_preferences()
    st.write("You stay in control. The planner only recommends reductions in categories you approve.")

    updated = {}
    for group_name, categories in PREFERENCE_CATEGORY_GROUPS.items():
        st.markdown(f"**{group_name}**")
        for source_key, label in categories:
            pref = preferences.get(label, {})
            cols = st.columns([1.5, 1.8])
            enabled = cols[0].toggle(
                label,
                value=bool(pref.get("enabled", group_name == "Flexible by default")),
                key=f"pref_enabled_{source_key}",
            )
            aggressiveness = cols[1].select_slider(
                "Aggressiveness",
                options=["Light cuts", "Moderate cuts", "Aggressive cuts"],
                value=str(pref.get("aggressiveness", "Moderate cuts" if enabled else "Light cuts")),
                key=f"pref_aggr_{source_key}",
                label_visibility="collapsed",
                disabled=not enabled,
            )
            updated[label] = {
                "enabled": enabled,
                "aggressiveness": aggressiveness,
                "source_key": source_key,
                "group": group_name,
            }

    left, right = st.columns(2)
    if left.button("Save preferences", type="primary", width="stretch"):
        st.session_state.flexibility_preferences = updated
        st.session_state.pop("goal_plan", None)
        st.rerun()
    if right.button("Reset to recommended defaults", width="stretch"):
        st.session_state.flexibility_preferences = default_flexibility_preferences()
        for group_name, categories in PREFERENCE_CATEGORY_GROUPS.items():
            for source_key, _ in categories:
                st.session_state.pop(f"pref_enabled_{source_key}", None)
                st.session_state.pop(f"pref_aggr_{source_key}", None)
        st.session_state.pop("goal_plan", None)
        st.rerun()


def build_goal_plan(goal_name, goal_cost, target_date, allow_protected):
    target_date = canonical_target_date(target_date)
    plan_style = st.session_state.get("plan_style", "Balanced")
    apply_roles_to_flexibility_preferences()
    preferences = {k: dict(v) for k, v in ensure_flexibility_preferences().items()}
    transactions = load_demo_transactions_if_needed()
    all_transactions = api_get_all_transactions() or transactions
    flexible, protected = spending_summary(transactions)
    prev_start, prev_end = month_bounds(previous_month(month_start))
    try:
        previous_transactions = api_get_transactions(prev_start.isoformat(), prev_end.isoformat()).get("transactions", [])
    except Exception:
        previous_transactions = []
    category_rows = build_category_intelligence(transactions, previous_transactions)
    try:
        active_budget = api_get_budget_active()
        budget_allocations = active_budget.get("allocations", {}) or {}
    except Exception:
        active_budget = {"income_amount": 0.0, "allocations": {}}
        budget_allocations = {}

    for category, amount in budget_allocations.items():
        if category in PROTECTED_CATEGORY_LABELS and float(amount) > 0:
            protected.setdefault(category, 0.0)

    days_until = max(1, (target_date - today).days)
    weeks_until = max(1.0, days_until / 7)
    months_until = max(1.0, days_until / 30.4375)
    clean_goal_name = goal_name.strip() or "this goal"
    progress_amount = goal_progress_value(clean_goal_name, float(goal_cost), target_date)
    remaining_amount = max(0.0, float(goal_cost) - progress_amount)
    weekly_needed = remaining_amount / weeks_until
    monthly_needed = remaining_amount / months_until
    analysis_preferences = {k: dict(v) for k, v in preferences.items()}
    goal_analysis = calculate_goal_analysis(
        transactions=all_transactions,
        selected_month=month_start,
        active_simulation=None,
        goal_cost=float(goal_cost),
        goal_progress=progress_amount,
        target_date=target_date,
        weekly_target=weekly_needed,
        flexibility_preferences=analysis_preferences,
    )
    goal_analysis = apply_budget_goal_progress(
        goal_analysis,
        active_budget,
        all_transactions,
        float(goal_cost),
        progress_amount,
        target_date,
    )
    improved_categories = {
        row["Category"]
        for row in goal_analysis["category_deltas"]
        if float(row.get("Estimated savings", 0.0)) > 5
    }
    recommendations, gap = recommend_goal_cuts(
        weekly_needed,
        flexible,
        allow_protected,
        protected,
        budget_allocations=budget_allocations,
        preferences=preferences,
        plan_style=plan_style,
        improved_categories=improved_categories,
    )
    recommendations = enrich_recommendations(recommendations, category_rows, weekly_needed)
    total_weekly_cut = sum(float(r["Recommended weekly cut"]) for r in recommendations)
    strategy_plans = [
        build_strategy_plan("Conservative", weekly_needed, category_rows, allow_protected, preferences),
        build_strategy_plan("Balanced", weekly_needed, category_rows, allow_protected, preferences),
        build_strategy_plan("Aggressive", weekly_needed, category_rows, allow_protected, preferences),
    ]
    realistic = gap <= max(5.0, weekly_needed * 0.10)
    plan = {
        "goal_name": clean_goal_name,
        "goal_cost": float(goal_cost),
        "progress": progress_amount,
        "target_date": target_date,
        "days_until": days_until,
        "weeks_until": weeks_until,
        "monthly_needed": monthly_needed,
        "weekly_needed": weekly_needed,
        "flexible": flexible,
        "protected": protected,
        "budget": active_budget,
        "budget_allocations": budget_allocations,
        "category_intelligence": category_rows,
        "flexibility_preferences": {k: dict(v) for k, v in preferences.items()},
        "preference_capacity_monthly": approved_reduction_capacity(category_rows, preferences, plan_style),
        "recommendations": recommendations,
        "strategy_plans": strategy_plans,
        "date_simulations": build_target_date_simulations(remaining_amount, target_date),
        "plan_style": plan_style,
        "what_this_changes": what_this_changes(recommendations),
        "analysis_transactions": all_transactions,
        "improved_categories": sorted(improved_categories),
        "dining_streak": dining_streak(all_transactions, as_of_date),
        "momentum": savings_momentum(all_transactions, as_of_date),
        "recurring_patterns": recurring_spending_patterns(all_transactions, month_start),
        "gap": gap,
        "total_weekly_cut": total_weekly_cut,
        "realistic": realistic,
        "allow_protected": allow_protected,
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    plan["goalAnalysis"] = goal_analysis
    return plan


def top_behavior_rows(behavior_rows, limit=3):
    return sorted(
        behavior_rows or [],
        key=lambda row: abs(float(row.get("Estimated savings", 0.0))),
        reverse=True,
    )[:limit]


def plan_coverage(plan):
    analysis = plan.get("goalAnalysis", {})
    weekly_needed = float(analysis.get("weekly_target", plan.get("weekly_needed", 0.0)))
    saved = float(analysis.get("savedTowardGoalThisWeek", analysis.get("detectedSavings", 0.0)))
    return saved / max(1.0, weekly_needed)


def realistic_pace_label(plan):
    coverage = plan_coverage(plan)
    if coverage >= 1.15:
        return "Very achievable"
    if coverage >= 0.90:
        return "Achievable with consistency"
    if coverage >= 0.60:
        return "Tight timeline"
    return "Unrealistic without major changes"


def lifestyle_adjustment_label(plan):
    recommendations = plan.get("recommendations", [])
    high_impact = sum(1 for item in recommendations if item.get("Lifestyle impact") == "high impact")
    moderate_impact = sum(1 for item in recommendations if item.get("Lifestyle impact") == "moderate impact")
    weekly_cut = float(plan.get("total_weekly_cut", 0.0))
    if weekly_cut < 30 and high_impact == 0 and moderate_impact <= 1:
        return "Minimal"
    if weekly_cut < 85 and high_impact <= 1:
        return "Noticeable"
    if weekly_cut < 150 and high_impact <= 2:
        return "Major"
    return "Extreme"


def plan_difficulty_label(plan):
    return lifestyle_adjustment_label(plan)


def projected_goal_date_from_gap(target_date, weekly_needed, pace_vs_target):
    if weekly_needed <= 0:
        return None
    delta_weeks = float(pace_vs_target) / float(weekly_needed)
    shift_days = round(delta_weeks * 7)
    return target_date - datetime.timedelta(days=shift_days)


def canonical_target_date(value):
    if isinstance(value, datetime.datetime):
        return value.date()
    return value


def goal_storage_key(goal_name, target_amount, target_date):
    return f"{str(goal_name).strip().lower()}::{float(target_amount):.2f}::{target_date.isoformat()}"


def goal_progress_value(goal_name, target_amount, target_date):
    return float(st.session_state.get("goal_progress", {}).get(goal_storage_key(goal_name, target_amount, target_date), 0.0))


def projected_date_label(value):
    if not value:
        return "Needs momentum"
    return value.strftime("%b %-d, %Y")


def signed_money(value):
    value = float(value)
    if value >= 0:
        return f"+{money(value)}"
    return f"-{money(abs(value))}"


def delta_class(value):
    value = float(value)
    if value < -0.01:
        return "delta-good"
    if value > 0.01:
        return "delta-bad"
    return "delta-neutral"


def monthly_change_text(value):
    value = float(value)
    if value < -0.01:
        return f"{money(abs(value))} saved"
    if value > 0.01:
        return f"{money(value)} more"
    return "No change"


def role_microcopy(role):
    return {
        "protected": "Difficult to reduce",
        "essential": "Necessary spending",
        "flexible": "Easiest to adjust",
    }.get(str(role), "Editable")


def build_budget_insights(
    budget_baselines,
    allocations,
    budget_roles,
    income_amount,
    remaining_goal,
    monthly_available_for_goal,
    projected_affordability_date,
):
    insights = []
    food_baseline = float(budget_baselines.get("Food & dining", 0.0))
    food_plan = float(allocations.get("Food & dining", food_baseline))
    if food_baseline > 0:
        food_change_pct = (food_plan - food_baseline) / food_baseline * 100
        if food_change_pct < -1:
            insights.append(f"Food & dining is down {abs(food_change_pct):.0f}% from baseline.")
        elif food_change_pct > 1:
            insights.append(f"Food & dining is {food_change_pct:.0f}% above baseline.")
        else:
            insights.append("Food & dining is tracking close to baseline.")

    shopping_baseline = float(budget_baselines.get("Shopping", 0.0))
    shopping_plan = float(allocations.get("Shopping", shopping_baseline))
    if shopping_plan > 0 and monthly_available_for_goal > 0 and remaining_goal > 0:
        current_weeks = remaining_goal / (monthly_available_for_goal / 4.33)
        cut_amount = shopping_plan * 0.10
        improved_weeks = remaining_goal / ((monthly_available_for_goal + cut_amount) / 4.33)
        days_gained = max(0, round((current_weeks - improved_weeks) * 7))
        if days_gained > 0:
            insights.append(f"Reducing shopping by 10% moves affordability up about {days_gained} days.")

    protected_total = sum(
        float(allocations.get(category, 0.0))
        for category, role in budget_roles.items()
        if role == "protected"
    )
    planned_total = sum(float(value) for value in allocations.values())
    if planned_total > 0:
        protected_share = protected_total / planned_total * 100
        insights.append(f"Protected categories make up {protected_share:.0f}% of planned spending.")

    goal_room = float(monthly_available_for_goal)
    if income_amount > 0 and goal_room > 0:
        insights.append(f"{goal_room / income_amount * 100:.0f}% of income is available for goals.")

    return insights[:3]


def ai_coach_cache_key(coach_data):
    payload = json.dumps(coach_data, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_openai_api_key():
    """Read OpenAI key from Streamlit secrets without exposing it."""
    api_key = ""
    try:
        api_key = st.secrets.get("OPENAI_API_KEY", "")
    except Exception:
        api_key = ""
    if not api_key:
        api_key = os.environ.get("OPENAI_API_KEY", "")
    return str(api_key or "").strip()


def get_tavily_api_key():
    api_key = ""
    try:
        api_key = st.secrets.get("TAVILY_API_KEY", "")
    except Exception:
        api_key = ""
    if not api_key:
        api_key = os.environ.get("TAVILY_API_KEY", "")
    return str(api_key or "").strip()


def get_serpapi_api_key():
    api_key = ""
    try:
        api_key = st.secrets["SERPAPI_API_KEY"]
    except Exception:
        api_key = ""
    if not api_key:
        api_key = os.environ.get("SERPAPI_API_KEY", "")
    return str(api_key or "").strip()


def show_ai_key_detection(api_key):
    st.caption(f"AI key detected: {'Yes' if api_key else 'No'}")


def show_missing_ai_key_sources():
    st.info(
        'AI Coach checked st.secrets.get("OPENAI_API_KEY") and '
        'os.environ.get("OPENAI_API_KEY").'
    )


def show_ai_debug_response(raw_response):
    if not DEV_MODE:
        return
    with st.expander("Raw API response"):
        st.code(raw_response or "[empty response]")


def response_output_text(result):
    output_text = result.get("output_text", "")
    if output_text:
        return output_text
    chunks = []
    for item in result.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"}:
                chunks.append(content.get("text", ""))
    return "".join(chunks).strip()


class AIJsonParseError(ValueError):
    def __init__(self, message, raw_response=""):
        super().__init__(message)
        self.raw_response = raw_response


def safe_parse_json(response_text):
    cleaned = str(response_text or "").strip()
    if not cleaned:
        return {
            "success": False,
            "error": "AI returned an empty response.",
            "raw_response": response_text or "",
        }
    try:
        return {"success": True, "data": json.loads(cleaned), "raw_response": cleaned}
    except json.JSONDecodeError as first_error:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            candidate = cleaned[start : end + 1]
            try:
                return {"success": True, "data": json.loads(candidate), "raw_response": cleaned}
            except json.JSONDecodeError:
                pass
        return {
            "success": False,
            "error": f"AI returned invalid structured data. {first_error}",
            "raw_response": cleaned,
        }


def parse_ai_json_response(output_text):
    parsed = safe_parse_json(output_text)
    if parsed["success"]:
        return parsed["data"]
    raise AIJsonParseError(parsed["error"], parsed.get("raw_response", ""))


def openai_responses_json(api_key, prompt, payload, max_output_tokens=700, retries=1):
    request_body = {
        "model": "gpt-4o-mini",
        "input": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(payload, sort_keys=True)},
        ],
        "max_output_tokens": max_output_tokens,
        "response_format": {"type": "json_object"},
    }
    last_error = None
    for attempt in range(retries + 1):
        body = dict(request_body)
        try:
            response = requests.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=35,
            )
            if response.status_code == 400 and "response_format" in response.text:
                body.pop("response_format", None)
                response = requests.post(
                    "https://api.openai.com/v1/responses",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                    timeout=35,
                )
            response.raise_for_status()
            raw_response = response_output_text(response.json())
            parsed = safe_parse_json(raw_response)
            parsed["raw_response"] = raw_response
            return parsed
        except Exception as e:
            last_error = e
            if attempt >= retries:
                return {
                    "success": False,
                    "error": str(last_error),
                    "raw_response": getattr(last_error, "response", None).text
                    if getattr(last_error, "response", None) is not None
                    else "",
                }
    return {"success": False, "error": str(last_error or "OpenAI request failed."), "raw_response": ""}


def detected_price_strings(text):
    matches = re.findall(r"\$\s?\d[\d,]*(?:\.\d{2})?", str(text or ""))
    return list(dict.fromkeys(match.replace(" ", "") for match in matches))[:4]


def parse_budget_numbers(value):
    text = str(value or "").lower().replace(",", "")
    numbers = []
    for raw, suffix in re.findall(r"\$?\s*(\d+(?:\.\d+)?)\s*([kK]?)", text):
        try:
            amount = float(raw)
            if suffix.lower() == "k":
                amount *= 1000
            numbers.append(amount)
        except Exception:
            continue
    return numbers


def budget_quality_context(discovery_data):
    numbers = parse_budget_numbers(discovery_data.get("preferred_budget_range"))
    budget_reference = max(numbers) if numbers else 1000.0
    return {
        "target_budget": budget_reference,
        "budget_reference": budget_reference,
        "preferred_min_cost": round(budget_reference * 0.6, 2),
        "preferred_max_cost": round(budget_reference * 1.1, 2),
        "acceptable_min_cost": round(budget_reference * 0.25, 2),
        "acceptable_max_cost": round(budget_reference * 1.25, 2),
        "avoid_under_cost": round(max(25.0, budget_reference * 0.25), 2),
        "budget_numbers_detected": numbers,
    }


def user_requested_budget_free(discovery_data):
    text = " ".join(
        str(discovery_data.get(key, ""))
        for key in ("interests", "preferred_budget_range", "preference", "travel_distance")
    ).lower()
    return any(term in text for term in ("free", "cheap", "budget", "low cost", "low-cost", "$0", "under $25"))


def user_requested_subscription_app(discovery_data):
    text = " ".join(
        str(discovery_data.get(key, ""))
        for key in ("interests", "preferred_budget_range", "preference", "travel_distance", "location")
    ).lower()
    return any(term in text for term in ("app", "apps", "subscription", "membership", "monthly"))


def is_destination_interest(interests):
    text = str(interests or "").lower()
    destination_terms = ("concert", "gaming", "anime", "fashion", "tech", "food", "wellness")
    return any(term in text for term in destination_terms)


def is_online_fitness_interest(discovery_data):
    text = " ".join(
        str(discovery_data.get(key, ""))
        for key in ("interests", "preference", "travel_distance", "location")
    ).lower()
    return "fitness" in text and any(term in text for term in ("online", "subscription", "app", "home", "digital", "virtual", "workout"))


def is_fitness_interest(discovery_data):
    text = " ".join(
        str(discovery_data.get(key, ""))
        for key in ("interests", "preference", "travel_distance", "location")
    ).lower()
    return any(term in text for term in ("fitness", "wellness", "workout", "training", "gym", "running", "yoga"))


ALLOWED_GOAL_CATEGORIES = {
    "gaming",
    "travel",
    "concerts",
    "fitness",
    "photography",
    "learning",
    "fashion",
    "tech",
    "wellness",
}


def normalize_goal_category(value, discovery_data=None):
    text = str(value or "").strip().lower()
    aliases = {
        "concert": "concerts",
        "music": "concerts",
        "event": "concerts",
        "events": "concerts",
        "trip": "travel",
        "product": "tech",
        "technology": "tech",
        "gadgets": "tech",
        "camera": "photography",
        "photo": "photography",
        "course": "learning",
        "class": "learning",
        "health": "wellness",
    }
    text = aliases.get(text, text)
    if text in ALLOWED_GOAL_CATEGORIES:
        return text
    source_text = ""
    if discovery_data:
        source_text = " ".join(
            str(discovery_data.get(key, ""))
            for key in ("interests", "preference", "travel_distance", "location")
        ).lower()
    source_text = f"{text} {source_text}"
    category_terms = {
        "gaming": ("gaming", "game", "playstation", "xbox", "steam", "pc"),
        "travel": ("travel", "trip", "flight", "hotel", "destination", "weekend"),
        "concerts": ("concert", "music", "festival", "ticket", "show"),
        "fitness": ("fitness", "workout", "training", "gym", "running"),
        "photography": ("photo", "camera", "lens", "photography"),
        "learning": ("learning", "course", "class", "workshop", "education"),
        "fashion": ("fashion", "style", "clothing", "shoes", "sneakers"),
        "tech": ("tech", "gadget", "laptop", "phone", "headphones", "vr"),
        "wellness": ("wellness", "retreat", "spa", "yoga", "health"),
    }
    for category, terms in category_terms.items():
        if any(term in source_text for term in terms):
            return category
    return "tech" if is_product_interest(discovery_data or {}) else "travel"


def budget_range_label(discovery_data):
    quality = budget_quality_context(discovery_data)
    return f"${quality['preferred_min_cost']:.0f}-${quality['preferred_max_cost']:.0f}"


def normalized_cache_text(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "any"


def provider_budget_band(discovery_data):
    quality = budget_quality_context(discovery_data)
    return f"{int(quality['acceptable_min_cost'])}-{int(quality['acceptable_max_cost'])}"


def provider_cache_key(discovery_data, intents):
    categories = sorted({normalize_goal_category(intent.get("category"), discovery_data) for intent in intents})
    category_key = "-".join(categories) or normalize_goal_category(discovery_data.get("interests"), discovery_data)
    return "|".join(
        [
            normalized_cache_text(discovery_data.get("interests")),
            normalized_cache_text(category_key),
            normalized_cache_text(provider_budget_band(discovery_data)),
            normalized_cache_text(discovery_data.get("location")),
        ]
    )


def load_provider_cache():
    try:
        with open(PROVIDER_CACHE_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_provider_cache(cache):
    try:
        with open(PROVIDER_CACHE_PATH, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, indent=2, sort_keys=True)
    except Exception:
        if DEV_MODE:
            st.caption("Provider cache could not be written.")


def provider_cache_entry(cache_key):
    cache = load_provider_cache()
    entry = cache.get(cache_key)
    if not isinstance(entry, dict):
        return None, False
    checked_at = entry.get("checked_at", "")
    try:
        checked_date = datetime.date.fromisoformat(str(checked_at)[:10])
    except Exception:
        return None, False
    is_fresh = (today - checked_date).days < PROVIDER_CACHE_TTL_DAYS
    return entry, is_fresh


def write_provider_cache(cache_key, cards):
    cache = load_provider_cache()
    checked_at = today.isoformat()
    serialized_cards = []
    for card in cards:
        item = dict(card)
        item["last_checked"] = checked_at
        serialized_cards.append(item)
    cache[cache_key] = {"checked_at": checked_at, "cards": serialized_cards}
    save_provider_cache(cache)
    return serialized_cards


def normalize_goal_intent(item, discovery_data):
    category = normalize_goal_category(item.get("category"), discovery_data)
    title = str(item.get("title", "")).strip()
    if not title:
        title = f"{category.title()} goal"
    try:
        score = int(round(float(item.get("experience_score", 7) or 7)))
    except Exception:
        score = 7
    score = max(1, min(10, score))
    confidence = str(item.get("confidence", "medium")).strip().lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"
    return {
        "category": category,
        "title": title,
        "estimated_budget_range": str(item.get("estimated_budget_range") or budget_range_label(discovery_data)).strip(),
        "experience_score": score,
        "confidence": confidence,
        "why_match": str(item.get("why_match", item.get("why_it_matches", "Matches your interests."))).strip(),
        "product_search_queries": [
            str(query).strip()
            for query in item.get("product_search_queries", [])
            if str(query).strip()
        ]
        if isinstance(item.get("product_search_queries", []), list)
        else [],
    }


def default_goal_intents(discovery_data):
    text = " ".join(
        str(discovery_data.get(key, ""))
        for key in ("interests", "preference", "travel_distance", "location")
    ).lower()
    budget_range = budget_range_label(discovery_data)
    if "gaming" in text or "game" in text:
        titles = ["Gaming laptop", "Gaming PC", "Gaming monitor", "Meta Quest 3", "PlayStation 5 bundle", "Steam Deck OLED"]
        return [
            {
                "category": "gaming",
                "title": title,
                "estimated_budget_range": budget_range,
                "experience_score": 8,
                "confidence": "medium",
                "why_match": "A concrete gaming goal with shopping-result pricing.",
                "product_search_queries": [f"{title}"],
            }
            for title in titles
        ]
    first_interest = str(discovery_data.get("interests") or "product").split(",")[0].strip()
    category = normalize_goal_category(first_interest, discovery_data)
    return [
        {"category": category, "title": first_interest.title(), "estimated_budget_range": budget_range, "experience_score": 7, "confidence": "medium", "why_match": "Matches the category you entered.", "product_search_queries": [first_interest]},
        {"category": category, "title": f"{first_interest.title()} premium option", "estimated_budget_range": budget_range, "experience_score": 8, "confidence": "medium", "why_match": "A higher-quality option near your preferred range.", "product_search_queries": [f"{first_interest} premium"]},
        {"category": category, "title": f"{first_interest.title()} bundle", "estimated_budget_range": budget_range, "experience_score": 7, "confidence": "medium", "why_match": "A bundled version of the goal you described.", "product_search_queries": [f"{first_interest} bundle"]},
    ]


def generate_goal_intents(api_key, discovery_data):
    fallback = [normalize_goal_intent(item, discovery_data) for item in default_goal_intents(discovery_data)]
    if not api_key:
        return fallback
    prompt = (
        "Return strict JSON only. Generate 4 to 6 structured goal intents for Byable Goal Discovery. "
        "Do not generate final products, source URLs, source titles, exact prices, or estimated_cost. "
        "Only describe intent and product search queries. Every item must include exactly these fields: "
        "title, category, experience_score, confidence, why_match, product_search_queries. "
        "Allowed categories: gaming, travel, concerts, fitness, photography, learning, fashion, tech, wellness. "
        "Do not include exact prices, estimated_cost, source_url, or source_title. "
        "product_search_queries should be 1 to 3 concise Google Shopping queries for product-like goals, otherwise an empty list. "
        "experience_score must be 1-10. confidence must be high, medium, or low. "
        'Schema: {"goals":[{"title":"...","category":"gaming","experience_score":8,"confidence":"medium","why_match":"...","product_search_queries":["gaming laptop under 1500"]}]}'
    )
    parsed = openai_responses_json(api_key, prompt, discovery_data, max_output_tokens=700, retries=0)
    if not parsed.get("success"):
        return fallback
    intents = []
    for item in (parsed.get("data") or {}).get("goals", (parsed.get("data") or {}).get("intents", [])):
        intent = normalize_goal_intent(item, discovery_data)
        if intent["category"] in ALLOWED_GOAL_CATEGORIES:
            intents.append(intent)
    return intents[:6] or fallback


def goal_intent_search_query(intent, discovery_data):
    category = normalize_goal_category(intent.get("category"), discovery_data)
    title = str(intent.get("title") or category).strip()
    location = str(discovery_data.get("location") or "near me").strip()
    target_month = normalize_target_month(discovery_data.get("target_month"))
    if category == "gaming":
        exact_queries = {
            "gaming laptop": "gaming laptop site:bestbuy.com $1000 $1500",
            "gaming pc": "gaming pc site:bestbuy.com $1000 $1500",
            "gaming monitor": "gaming monitor site:bestbuy.com $500 $1500",
            "meta quest 3": "Meta Quest 3 price site:meta.com",
            "playstation 5 bundle": "PlayStation 5 bundle price",
            "steam deck oled": "Steam Deck OLED price",
        }
        return exact_queries.get(title.lower(), f"{title} price site:bestbuy.com")
    if category in {"tech", "photography", "fashion", "fitness"} and is_product_interest({"interests": title, **discovery_data}):
        return f"{title} price buy"
    if category == "concerts":
        return f"{title} {location} tickets {target_month} price"
    if category in {"learning", "fitness", "wellness"}:
        return f"{title} {location} class workshop price"
    if category == "travel":
        return f"{title} travel package {target_month} price"
    return f"{title} {location} price"


def provider_categories_for_intent(category):
    category = normalize_goal_category(category)
    if category in {"gaming", "travel", "concerts", "fitness", "tech"}:
        return [category]
    if category in {"photography", "fashion"}:
        return ["tech"]
    if category == "learning":
        return ["fitness", "tech"]
    if category == "wellness":
        return ["fitness", "travel"]
    return ["tech"]


def provider_cards_from_intents(intents, discovery_data):
    cards = []
    seen = set()
    target_month = normalize_target_month(discovery_data.get("target_month"))
    for item in route_intents(intents, discovery_data):
        intent = item.get("intent", {})
        if not item.get("price_verified"):
            continue
        try:
            price = float(item["price"])
        except Exception:
            continue
        key = (item.get("title"), item.get("source_url"))
        if key in seen:
            continue
        seen.add(key)
        provider_category = normalize_goal_category(intent.get("category"), discovery_data)
        cards.append(
            {
                "title": str(item.get("title", intent.get("title", "Goal"))).strip(),
                "goal_type": provider_category,
                "type": provider_category,
                "category": provider_category,
                "estimated_cost": price,
                "current_price": price,
                "confidence": str(intent.get("confidence", "medium")).lower(),
                "experience_score": int(intent.get("experience_score", 7) or 7),
                "why_it_matches_user_interest": str(intent.get("why_match", "Matches the goal direction you described.")),
                "why_it_matches": str(intent.get("why_match", "Matches the goal direction you described.")),
                "source_urls": [item.get("source_url", "")],
                "source_titles": [item.get("source_title", "")],
                "source_url": item.get("source_url", ""),
                "source_title": item.get("source_title", ""),
                "image": item.get("image", ""),
                "rating": item.get("rating"),
                "merchant": item.get("merchant", ""),
                "provider": item.get("provider", "catalog"),
                "source_price_or_price_note": f"Shopping price: {money(price)}"
                if item.get("provider") == "serpapi_google_shopping"
                else f"Provider price: {money(price)}",
                "target_month": target_month,
                "target_date_or_month": target_month,
                "monthly_savings": None,
                "monthly_savings_needed": None,
                "monthly_savings_required": None,
                "package_deal_angle": "Deterministic provider result.",
                "package_or_deal_angle": "Deterministic provider result.",
                "what_to_check_next": "Open the source to confirm current availability, fees, and taxes.",
                "affordability_note": "Provider result. Byable checks affordability with your budget math.",
                "travel_cost_buckets": {"flight": None, "lodging": None, "activities": None, "food_local_transport": None},
                "ways_to_afford_it": [
                    "Use the Budget Planner to test this goal against your current plan.",
                    "Adjust flexible categories if the target month is tight.",
                ],
                "validation_debug": {
                    "source_type": item.get("provider", "provider"),
                    "price_verified": True,
                    "extracted_price": price,
                    "accepted_or_rejected_reason": "Accepted structured provider result.",
                },
            }
        )
    cards.sort(key=lambda item: (int(item.get("experience_score", 0) or 0), float(item.get("estimated_cost", 0.0))), reverse=True)
    return cards[:6]


def cached_provider_cards(intents, discovery_data, refresh=False):
    cache_key = provider_cache_key(discovery_data, intents)
    entry, is_fresh = provider_cache_entry(cache_key)
    if entry and is_fresh and not refresh:
        return entry.get("cards", []), {
            "cache_key": cache_key,
            "source": "cache",
            "last_checked": entry.get("checked_at", ""),
        }

    live_context = dict(discovery_data)
    live_context["use_live_prices"] = True
    live_context["serpapi_api_key"] = get_serpapi_api_key()
    live_cards = provider_cards_from_intents(intents, live_context)
    if live_cards:
        cards = write_provider_cache(cache_key, live_cards)
        return cards, {"cache_key": cache_key, "source": "live", "last_checked": today.isoformat()}

    if entry and not refresh:
        return entry.get("cards", []), {
            "cache_key": cache_key,
            "source": "stale_cache",
            "last_checked": entry.get("checked_at", ""),
        }

    catalog_context = dict(discovery_data)
    catalog_context["use_live_prices"] = False
    catalog_cards = provider_cards_from_intents(intents, catalog_context)
    cards = write_provider_cache(cache_key, catalog_cards) if catalog_cards else []
    return cards, {
        "cache_key": cache_key,
        "source": "catalog",
        "last_checked": today.isoformat() if cards else "",
    }



def generate_ai_coach_advice(api_key, coach_data):
    """Ask AI to explain existing Byable calculations without recalculating them."""
    prompt = (
        "You are Byable's AI Coach. Use only the structured data provided. "
        "Do not recalculate totals, invent transactions, or change budget numbers. "
        "Reference actual dollar amounts from the input. "
        "Recommend only flexible categories unless protected_cuts_enabled is true. "
        "Identify the 3 most useful categories to adjust from category_baseline_and_future_budget_table. "
        "If transaction_confidence_low is true, mention reviewing suspicious transactions. "
        "Keep every item short, specific, and practical. "
        "Return valid JSON only with exactly these keys: "
        "status, summary, recommended_actions, categories_to_watch, confidence_warning. "
        "status must say whether the goal is on track or short using the provided available_for_goals and required_monthly_savings. "
        "summary must be one plain-English sentence. "
        "recommended_actions must contain exactly 3 practical category-specific actions with dollar amounts. "
        "categories_to_watch must contain exactly 3 category names. "
        "confidence_warning must be one sentence if transaction_confidence_low is true, otherwise an empty string."
    )
    parsed_result = openai_responses_json(api_key, prompt, coach_data, max_output_tokens=600, retries=1)
    if not parsed_result["success"]:
        return parsed_result
    parsed = parsed_result["data"]
    actions = [str(item).strip() for item in parsed.get("recommended_actions", []) if str(item).strip()][:3]
    watch = [str(item).strip() for item in parsed.get("categories_to_watch", []) if str(item).strip()][:3]
    while len(actions) < 3:
        actions.append("Review one flexible category and decide whether its planned amount can come down this month.")
    return {
        "success": True,
        "raw_response": parsed_result.get("raw_response", ""),
        "status": str(parsed.get("status", "Review the current plan.")).strip(),
        "summary": str(parsed.get("summary", "This guidance uses Byable's current budget numbers.")).strip(),
        "recommended_actions": actions,
        "categories_to_watch": watch,
        "confidence_warning": str(parsed.get("confidence_warning", "")).strip(),
    }


def generate_goal_ai_coaching_plan(api_key, coach_data):
    """Generate narrative coaching from existing affordability calculations only."""
    prompt = (
        "Use only this Byable budget data. Do not recalculate totals, invent categories, or change any budget numbers. "
        "Reference actual dollar amounts from the data. Recommend only flexible categories unless protected_cuts_enabled is true. "
        "Return valid JSON only with this exact schema: "
        '{"summary":"...","recommended_actions":["...","...","..."],"risk_warning":"...","next_best_step":"..."}. '
        "summary should explain whether the goal is on track or short. "
        "recommended_actions must be exactly 3 specific actions using current category/budget numbers. "
        "risk_warning should mention transaction review if transaction_confidence_low is true, otherwise be brief. "
        "next_best_step should be the single most useful next action."
    )
    def fallback_coaching(error, raw_response="", parse_succeeded=False):
        status_text = str(coach_data.get("goal_status_from_lantern", "review")).replace("_", " ")
        gap = float(coach_data.get("monthly_surplus_or_shortfall", 0.0) or 0.0)
        flexible_categories = [
            row.get("category", "a flexible category")
            for row in coach_data.get("category_budgets_and_roles", [])
            if row.get("role") == "flexible"
        ][:3]
        while len(flexible_categories) < 3:
            flexible_categories.append("a flexible category")
        gap_text = money(abs(gap))
        summary = (
            f"Byable's math shows this goal is {status_text}; "
            f"the plan is {'ahead by' if gap >= 0 else 'short by'} {gap_text} per month."
        )
        actions = [
            f"Review {flexible_categories[0]} and decide whether it can move closer to the goal this month.",
            f"Look for a smaller cut in {flexible_categories[1]} before touching protected spending.",
            f"Use {flexible_categories[2]} as the backup tradeoff if the target date still feels tight.",
        ]
        return {
            "success": True,
            "error": error,
            "raw_response": raw_response,
            "raw_text_length": len(raw_response or ""),
            "parse_succeeded": parse_succeeded,
            "summary": summary,
            "recommended_actions": actions,
            "risk_warning": "This fallback uses Byable's deterministic budget numbers because AI did not return usable structured data.",
            "next_best_step": "Check the flexible categories above, then regenerate AI coaching once the API response is healthy.",
        }

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a practical budgeting coach. Return valid JSON only."},
            {"role": "user", "content": f"{prompt}\n\nByable budget data:\n{json.dumps(coach_data, sort_keys=True)}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    raw_text = ""
    try:
        raw_text = response.choices[0].message.content or ""
    except Exception:
        raw_text = ""
    if DEV_MODE:
        with st.expander("AI raw response debug"):
            st.code(raw_text or "[empty response]")
    if not raw_text.strip():
        return fallback_coaching("OpenAI returned an empty response", raw_text, False)
    parsed_result = safe_parse_json(raw_text)
    if not parsed_result["success"]:
        return fallback_coaching("AI returned invalid JSON", raw_text, False)
    parsed = parsed_result["data"]
    actions = [str(item).strip() for item in parsed.get("recommended_actions", []) if str(item).strip()][:3]
    while len(actions) < 3:
        actions.append("Review one flexible category and decide whether the planned amount still feels realistic.")
    return {
        "success": True,
        "raw_response": raw_text,
        "raw_text_length": len(raw_text),
        "parse_succeeded": True,
        "summary": str(parsed.get("summary", "This plan is based on the current Byable budget numbers.")).strip(),
        "recommended_actions": actions,
        "risk_warning": str(parsed.get("risk_warning", "")).strip(),
        "next_best_step": str(parsed.get("next_best_step", "")).strip(),
    }

@st.cache_data(show_spinner=False)
def load_clean_goal_catalog():
    """Load the deterministic V2 catalog without importing/running app_v2 UI code."""
    fallback_catalog = [
        {
            "title": "Gaming laptop",
            "category": "gaming",
            "estimated_cost": 1500,
            "keywords": ["gaming", "laptop", "pc"],
            "source_title": "Best Buy gaming laptops",
            "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=gaming+laptop",
            "ways_to_afford_it": ["Cut dining and shopping first.", "Compare open-box models.", "Delay accessories until after purchase."],
        },
        {
            "title": "Peloton Bike fund",
            "category": "fitness",
            "estimated_cost": 1445,
            "keywords": ["fitness", "bike", "cycling"],
            "source_title": "Peloton Bike",
            "source_url": "https://www.onepeloton.com/bike",
            "ways_to_afford_it": ["Reduce restaurants for 8 weeks.", "Compare used options.", "Budget for membership separately."],
        },
        {
            "title": "Tokyo food + culture trip starter fund",
            "category": "travel",
            "estimated_cost": 2500,
            "keywords": ["travel", "japan", "asian culture", "food"],
            "source_title": "Google Flights",
            "source_url": "https://www.google.com/travel/flights",
            "ways_to_afford_it": ["Track flight deals.", "Choose shoulder season.", "Reduce flexible spending before booking."],
        },
        {
            "title": "Concert weekend package",
            "category": "concerts",
            "estimated_cost": 650,
            "keywords": ["concert", "music", "event"],
            "source_title": "Ticketmaster",
            "source_url": "https://www.ticketmaster.com/",
            "ways_to_afford_it": ["Set a ticket ceiling.", "Budget for fees.", "Choose local lodging only if needed."],
        },
        {
            "title": "Wellness retreat weekend",
            "category": "wellness",
            "estimated_cost": 900,
            "keywords": ["wellness", "retreat", "yoga"],
            "source_title": "Booking wellness stays",
            "source_url": "https://www.booking.com/",
            "ways_to_afford_it": ["Choose local first.", "Book deposit early.", "Pause nonessential shopping."],
        },
    ]
    app_v2_path = os.path.join(CURRENT_DIR, "app_v2.py")
    supplemental_catalog = [
        {
            "title": "VIP concert package",
            "category": "concerts",
            "estimated_cost": 1450,
            "keywords": ["concert", "concerts", "music", "vip", "event", "events"],
            "source_title": "Ticketmaster VIP packages",
            "source_url": "https://www.ticketmaster.com/",
            "ways_to_afford_it": ["Set a ticket ceiling before fees.", "Trim dining and shopping for the next few pay periods.", "Keep hotel and rideshare costs capped."],
        },
        {
            "title": "Music festival weekend",
            "category": "concerts",
            "estimated_cost": 1350,
            "keywords": ["concert", "concerts", "festival", "music", "event", "events"],
            "source_title": "Live Nation festivals",
            "source_url": "https://www.livenation.com/festivals",
            "ways_to_afford_it": ["Buy passes early if pricing is tiered.", "Share lodging with friends.", "Set a fixed food and merch budget."],
        },
        {
            "title": "Season concert pass fund",
            "category": "concerts",
            "estimated_cost": 1500,
            "keywords": ["concert", "concerts", "music", "season", "pass", "events"],
            "source_title": "Ticketmaster concerts",
            "source_url": "https://www.ticketmaster.com/concerts",
            "ways_to_afford_it": ["Pick a monthly ticket budget.", "Prioritize must-see artists first.", "Move unused entertainment spend into the pass fund."],
        },
        {
            "title": "Premium show + hotel night",
            "category": "concerts",
            "estimated_cost": 1200,
            "keywords": ["concert", "concerts", "music", "hotel", "weekend", "event"],
            "source_title": "Ticketmaster concerts",
            "source_url": "https://www.ticketmaster.com/concerts",
            "ways_to_afford_it": ["Choose one premium show instead of several smaller nights.", "Compare nearby hotel prices before booking.", "Cut flexible dining for the month before the show."],
        },
        {
            "title": "Artist meet-and-greet fund",
            "category": "concerts",
            "estimated_cost": 1600,
            "keywords": ["concert", "concerts", "music", "meet and greet", "vip", "event"],
            "source_title": "VIP Nation",
            "source_url": "https://www.vipnation.com/",
            "ways_to_afford_it": ["Treat it as a premium one-time goal.", "Pause lower-priority entertainment buys.", "Keep travel and merch spending separate."],
        },
        {
            "title": "Indoor climbing gym membership",
            "category": "climbing",
            "estimated_cost": 900,
            "keywords": ["rock climbing", "climbing", "bouldering", "indoor climbing", "climbing gym"],
            "source_title": "Movement climbing gyms",
            "source_url": "https://movementgyms.com/",
            "ways_to_afford_it": ["Swap one flexible fitness or entertainment expense.", "Start with a monthly membership before buying extra gear.", "Set a weekly climbing fund."],
        },
        {
            "title": "Outdoor guided climbing day",
            "category": "climbing",
            "estimated_cost": 450,
            "keywords": ["rock climbing", "climbing", "outdoor climbing", "guided climbing"],
            "source_title": "REI climbing classes and events",
            "source_url": "https://www.rei.com/events/a/outdoor-classes-climbing-rappelling",
            "ways_to_afford_it": ["Book a single guided day first.", "Use entertainment savings for the guide fee.", "Rent gear before buying it."],
        },
        {
            "title": "Climbing shoes + chalk bag starter kit",
            "category": "climbing",
            "estimated_cost": 220,
            "keywords": ["rock climbing", "climbing", "bouldering", "climbing shoes", "chalk bag"],
            "source_title": "REI climbing gear",
            "source_url": "https://www.rei.com/c/climbing-gear",
            "ways_to_afford_it": ["Buy shoes first and borrow other gear.", "Use a small monthly gear fund.", "Compare entry-level shoes before upgrading."],
        },
        {
            "title": "Bouldering crash pad",
            "category": "climbing",
            "estimated_cost": 300,
            "keywords": ["rock climbing", "climbing", "bouldering", "crash pad", "outdoor climbing"],
            "source_title": "REI bouldering crash pads",
            "source_url": "https://www.rei.com/c/crash-pads",
            "ways_to_afford_it": ["Split outdoor gear costs with a climbing partner.", "Wait until you know your outdoor routine.", "Cut one shopping category for a month."],
        },
        {
            "title": "Weekend climbing trip",
            "category": "climbing",
            "estimated_cost": 750,
            "keywords": ["rock climbing", "climbing", "bouldering", "outdoor climbing", "weekend trip"],
            "source_title": "Mountain Project climbing areas",
            "source_url": "https://www.mountainproject.com/",
            "ways_to_afford_it": ["Keep lodging simple.", "Share transportation with friends.", "Cap food and gear purchases before the trip."],
        },
        {
            "title": "Private climbing coaching package",
            "category": "climbing",
            "estimated_cost": 600,
            "keywords": ["rock climbing", "climbing", "bouldering", "private coaching", "climbing gym"],
            "source_title": "Movement private instruction",
            "source_url": "https://movementgyms.com/classes/private-instruction/",
            "ways_to_afford_it": ["Book a short coaching block.", "Reduce subscriptions while training.", "Pair coaching with practice days instead of more sessions."],
        },
    ]
    try:
        with open(app_v2_path, "r", encoding="utf-8") as handle:
            tree = ast.parse(handle.read(), filename=app_v2_path)
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "GOAL_CATALOG" for target in node.targets
            ):
                catalog = ast.literal_eval(node.value)
                if isinstance(catalog, list) and len(catalog) >= 5:
                    titles = {str(item.get("title", "")).lower() for item in catalog if isinstance(item, dict)}
                    return catalog + [
                        item for item in supplemental_catalog if item["title"].lower() not in titles
                    ]
    except Exception:
        pass
    titles = {str(item.get("title", "")).lower() for item in fallback_catalog}
    return fallback_catalog + [item for item in supplemental_catalog if item["title"].lower() not in titles]


def parse_clean_discovery_budget(value):
    numbers = []
    for raw, suffix in re.findall(r"\$?\s*(\d+(?:\.\d+)?)\s*([kK]?)", str(value or "").replace(",", "")):
        amount = float(raw)
        if suffix.lower() == "k":
            amount *= 1000
        numbers.append(amount)
    return max(numbers) if numbers else 1000.0


def clean_goal_score(goal, interest_terms, target_budget):
    text = " ".join(
        [
            str(goal.get("title", "")),
            str(goal.get("category", "")),
            " ".join(str(item) for item in goal.get("keywords", [])),
        ]
    ).lower()
    keyword_score = sum(1 for term in interest_terms if term and term in text)
    budget_distance = abs(float(goal.get("estimated_cost", 0.0) or 0.0) - target_budget) / max(target_budget, 1.0)
    return (keyword_score * 10) - budget_distance


GOAL_CATEGORY_TERMS = {
    "concerts": {"concert", "concerts", "event", "events", "music", "festival", "festivals", "show", "shows"},
    "gaming": {"gaming", "game", "games", "gamer", "playstation", "xbox", "pc", "vr"},
    "fitness": {"fitness", "workout", "gym", "running", "training", "wellness"},
    "tech": {"tech", "technology", "gadgets", "gadget", "laptop", "computer", "headphones"},
    "travel": {"travel", "trip", "trips", "vacation", "flight", "hotel", "japan", "korea"},
    "climbing": {"climbing", "climb", "bouldering", "boulder"},
}


def detected_goal_categories(interests):
    text = str(interests or "").lower()
    tokens = set(re.findall(r"[a-z0-9]+", text))
    if any(
        phrase in text
        for phrase in ("rock climbing", "indoor climbing", "outdoor climbing", "climbing gym")
    ) or tokens & GOAL_CATEGORY_TERMS["climbing"]:
        return ["climbing"]
    matches = []
    for category, terms in GOAL_CATEGORY_TERMS.items():
        if tokens & terms:
            matches.append(category)
    return matches


def detected_goal_keywords(interests):
    text = str(interests or "").lower()
    tokens = set(re.findall(r"[a-z0-9]+", text))
    matched = []
    for terms in GOAL_CATEGORY_TERMS.values():
        matched.extend(sorted(tokens & terms))
    if "rock climbing" in text:
        matched.append("rock climbing")
    if "indoor climbing" in text:
        matched.append("indoor climbing")
    if "outdoor climbing" in text:
        matched.append("outdoor climbing")
    if "climbing gym" in text:
        matched.append("climbing gym")
    return sorted(set(matched))


def valid_catalog_source(goal):
    source_url = str(goal.get("source_url", "") or "").strip()
    if not source_url:
        return False
    if "facebook.com" in source_url.lower():
        return False
    return True


def parse_goal_card_cost(value):
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").replace(",", "")
    matches = re.findall(r"\$?\s*(\d+(?:\.\d+)?)\s*([kK]?)", text)
    if not matches:
        return None
    amount = float(matches[-1][0])
    if matches[-1][1].lower() == "k":
        amount *= 1000
    return amount


def goal_category_matches_interest(category, interests, title="", why_match=""):
    matched_categories = detected_goal_categories(interests)
    if not matched_categories:
        text = str(interests or "").lower().strip()
        if not text or "surprise" in text:
            return True
        terms = [
            term
            for term in re.findall(r"[a-z0-9]+", text)
            if len(term) > 2 and term not in {"and", "for", "the", "with"}
        ]
        card_text = " ".join([str(category), str(title), str(why_match)]).lower()
        return bool(terms) and any(term in card_text for term in terms)
    return str(category or "").lower().strip() in matched_categories


def validate_ai_goal_cards(raw_cards, interests, budget):
    valid_cards = []
    rejected_cards = []
    min_cost = budget * 0.25
    max_cost = budget * 1.25
    for raw in raw_cards or []:
        card = dict(raw or {})
        title = str(card.get("title", "") or "").strip()
        category = str(card.get("category", "") or "").strip().lower()
        estimated_cost = parse_goal_card_cost(card.get("estimated_cost"))
        source_url = str(card.get("source_url", "") or "").strip()
        reasons = []
        if not title:
            reasons.append("missing title")
        if not category or not goal_category_matches_interest(
            category,
            interests,
            title=title,
            why_match=card.get("why_match", ""),
        ):
            reasons.append("category does not match interest")
        if estimated_cost is None or estimated_cost < min_cost or estimated_cost > max_cost:
            reasons.append("outside budget band")
        if not source_url:
            reasons.append("missing source_url")
        if "facebook.com" in source_url.lower():
            reasons.append("facebook source")
        if reasons:
            rejected_cards.append({"title": title or "[missing]", "reasons": reasons, "raw": card})
            continue
        ways = card.get("ways_to_afford_it", [])
        if isinstance(ways, str):
            ways = [ways]
        valid_cards.append(
            {
                "title": title,
                "category": category,
                "estimated_cost": estimated_cost,
                "source_title": str(card.get("source_title", "") or "Source").strip(),
                "source_url": source_url,
                "why_match": str(card.get("why_match", "") or "").strip(),
                "ways_to_afford_it": [str(item).strip() for item in ways if str(item).strip()][:3],
                "source_mode": "AI personalized",
            }
        )
    valid_cards = sorted(
        valid_cards,
        key=lambda goal: abs(float(goal.get("estimated_cost", 0.0) or 0.0) - budget),
    )
    return valid_cards[:5], rejected_cards


def generate_ai_goal_cards(api_key, discovery_payload):
    if not api_key:
        return {"success": False, "error": "OpenAI key missing", "cards": [], "raw_response": ""}
    budget = float(discovery_payload.get("budget", 1000.0) or 1000.0)
    prompt = (
        "You are Byable's Goal Discovery assistant. Return JSON only. "
        "Generate exactly 5 goal ideas based on the user's interests, location, budget, target_month, and preference. "
        "Each goal must include: title, category, estimated_cost, source_title, source_url, why_match, ways_to_afford_it. "
        "Use categories that match the user's stated interest, even when the interest is not in Byable's catalog. "
        "If the user says concerts, use concerts/events/music/festivals only. "
        "If the user says scuba diving, generate cards like beginner scuba certification, local dive trip, "
        "mask/fins/snorkel starter kit, advanced open water course, and warm-water dive vacation fund. "
        f"estimated_cost must be between {budget * 0.25:.2f} and {budget * 1.25:.2f}. "
        "source_url must be a real-looking public URL. Do not use Facebook. "
        'Return schema: {"goals":[{"title":"...","category":"concerts","estimated_cost":1200,"source_title":"Ticketmaster","source_url":"https://www.ticketmaster.com/","why_match":"...","ways_to_afford_it":["...","...","..."]}]}'
    )
    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(discovery_payload, sort_keys=True)},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        raw_text = response.choices[0].message.content or ""
    except Exception as e:
        return {"success": False, "error": str(e), "cards": [], "raw_response": ""}
    parsed = safe_parse_json(raw_text)
    if not parsed.get("success"):
        return {
            "success": False,
            "error": parsed.get("error", "AI returned invalid JSON"),
            "cards": [],
            "raw_response": raw_text,
        }
    data = parsed.get("data") or {}
    cards = data.get("goals") if isinstance(data, dict) else []
    return {"success": True, "error": "", "cards": cards or [], "raw_response": raw_text}


def select_clean_goal_cards(interests, budget):
    terms = [
        term.strip().lower()
        for term in re.split(r"[,/ ]+", str(interests or ""))
        if term.strip()
    ]
    catalog = [goal for goal in load_clean_goal_catalog() if valid_catalog_source(goal)]
    matched_categories = detected_goal_categories(interests)
    surprise_me = "surprise" in str(interests or "").lower()
    if terms and not matched_categories and not surprise_me:
        return []
    if matched_categories and not surprise_me:
        catalog = [goal for goal in catalog if str(goal.get("category", "")).lower() in matched_categories]
    ranked = sorted(
        catalog,
        key=lambda goal: (
            -abs(float(goal.get("estimated_cost", 0.0) or 0.0) - budget) / max(budget, 1.0),
            clean_goal_score(goal, terms, budget),
        ),
        reverse=True,
    )
    selected = []
    seen_categories = set()
    for goal in ranked:
        category = str(goal.get("category", "goal"))
        if category not in seen_categories or len(selected) >= 3:
            selected.append(dict(goal))
            seen_categories.add(category)
        if len(selected) == 5:
            break
    for goal in ranked:
        if len(selected) == 5:
            break
        if not any(existing.get("title") == goal.get("title") for existing in selected):
            selected.append(dict(goal))
    return selected[:5]


def hard_rule_goal_cards(interests):
    """Return fixed templates for common interests so unrelated fallback cards cannot leak in."""
    user_interest = str(interests or "").lower()
    if "rock climbing" in user_interest or "climbing" in user_interest or "bouldering" in user_interest:
        return [
            {
                "title": "Indoor climbing gym membership",
                "category": "Rock climbing",
                "estimated_cost": 900,
                "source_title": "Movement Climbing gyms",
                "source_url": "https://movementgyms.com/",
                "ways_to_afford_it": ["Start with monthly membership.", "Buy shoes after trying rentals.", "Use entertainment budget first."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Climbing shoes + chalk starter kit",
                "category": "Rock climbing",
                "estimated_cost": 180,
                "source_title": "REI climbing shoes",
                "source_url": "https://www.rei.com/c/climbing-shoes",
                "ways_to_afford_it": ["Save for shoes first.", "Rent harness until needed.", "Buy chalk bag used."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Outdoor guided climbing day",
                "category": "Rock climbing",
                "estimated_cost": 350,
                "source_title": "REI climbing classes and events",
                "source_url": "https://www.rei.com/events/a/climbing",
                "ways_to_afford_it": ["Book one guided day first.", "Go with friends to split costs.", "Use local trip budget."],
                "source_mode": "Catalog fallback",
            },
        ]
    if "concert" in user_interest or "music" in user_interest or "festival" in user_interest:
        return [
            {
                "title": "VIP concert package",
                "category": "Concerts",
                "estimated_cost": 1450,
                "source_title": "Ticketmaster",
                "source_url": "https://www.ticketmaster.com/",
                "ways_to_afford_it": ["Set a ticket ceiling.", "Budget for fees.", "Limit merch spending."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Music festival weekend",
                "category": "Concerts",
                "estimated_cost": 1350,
                "source_title": "Live Nation festivals",
                "source_url": "https://www.livenation.com/festivals",
                "ways_to_afford_it": ["Buy early tiers.", "Share lodging.", "Set a fixed food budget."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Premium show + hotel night",
                "category": "Concerts",
                "estimated_cost": 1200,
                "source_title": "Ticketmaster concerts",
                "source_url": "https://www.ticketmaster.com/concerts",
                "ways_to_afford_it": ["Choose one premium show.", "Compare hotel prices.", "Cut dining before the event."],
                "source_mode": "Catalog fallback",
            },
        ]
    if "gaming" in user_interest or "game" in user_interest or "playstation" in user_interest or "xbox" in user_interest:
        return [
            {
                "title": "Gaming laptop",
                "category": "Gaming",
                "estimated_cost": 1500,
                "source_title": "Best Buy gaming laptops",
                "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=gaming+laptop",
                "ways_to_afford_it": ["Compare open-box models.", "Delay accessories.", "Cut entertainment first."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "PlayStation 5 bundle",
                "category": "Gaming",
                "estimated_cost": 575,
                "source_title": "PlayStation 5",
                "source_url": "https://www.playstation.com/en-us/ps5/",
                "ways_to_afford_it": ["Cap game purchases.", "Use entertainment budget.", "Buy one game first."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Meta Quest 3 setup",
                "category": "Gaming",
                "estimated_cost": 600,
                "source_title": "Meta Quest 3",
                "source_url": "https://www.meta.com/quest/quest-3/",
                "ways_to_afford_it": ["Start with base headset.", "Add accessories later.", "Trim entertainment spending."],
                "source_mode": "Catalog fallback",
            },
        ]
    if "fitness" in user_interest or "gym" in user_interest or "workout" in user_interest or "training" in user_interest:
        return [
            {
                "title": "Peloton Bike fund",
                "category": "Fitness",
                "estimated_cost": 1445,
                "source_title": "Peloton Bike",
                "source_url": "https://www.onepeloton.com/bike",
                "ways_to_afford_it": ["Compare used options.", "Budget membership separately.", "Reduce restaurants temporarily."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Home gym dumbbell set",
                "category": "Fitness",
                "estimated_cost": 430,
                "source_title": "Bowflex SelectTech",
                "source_url": "https://www.bowflex.com/product/selecttech-552/100131.html",
                "ways_to_afford_it": ["Buy bench later.", "Trade an unused subscription.", "Use wellness budget."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Personal training package",
                "category": "Fitness",
                "estimated_cost": 900,
                "source_title": "Thumbtack personal trainers",
                "source_url": "https://www.thumbtack.com/k/personal-trainers/near-me/",
                "ways_to_afford_it": ["Book a limited session pack.", "Cut shopping first.", "Use a monthly health allocation."],
                "source_mode": "Catalog fallback",
            },
        ]
    if "travel" in user_interest or "trip" in user_interest or "vacation" in user_interest:
        return [
            {
                "title": "Domestic city weekend",
                "category": "Travel",
                "estimated_cost": 900,
                "source_title": "Booking.com",
                "source_url": "https://www.booking.com/",
                "ways_to_afford_it": ["Travel off-peak.", "Use public transit.", "Set a food budget."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Tokyo food + culture trip starter fund",
                "category": "Travel",
                "estimated_cost": 2500,
                "source_title": "Google Flights",
                "source_url": "https://www.google.com/travel/flights",
                "ways_to_afford_it": ["Track flight deals.", "Choose shoulder season.", "Reduce flexible spending before booking."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "National park long weekend",
                "category": "Travel",
                "estimated_cost": 750,
                "source_title": "Recreation.gov",
                "source_url": "https://www.recreation.gov/",
                "ways_to_afford_it": ["Book early.", "Split lodging.", "Pack meals."],
                "source_mode": "Catalog fallback",
            },
        ]
    if "tech" in user_interest or "laptop" in user_interest or "computer" in user_interest or "headphones" in user_interest:
        return [
            {
                "title": "MacBook Air upgrade",
                "category": "Tech",
                "estimated_cost": 999,
                "source_title": "Apple MacBook Air",
                "source_url": "https://www.apple.com/macbook-air/",
                "ways_to_afford_it": ["Use a monthly tech fund.", "Compare refurbished pricing.", "Cut subscriptions temporarily."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Sony noise-canceling headphones",
                "category": "Tech",
                "estimated_cost": 399,
                "source_title": "Best Buy headphones",
                "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=sony+wh-1000xm5",
                "ways_to_afford_it": ["Wait for sale pricing.", "Redirect entertainment spending.", "Use cash-back rewards if available."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "iPad Air creative setup",
                "category": "Tech",
                "estimated_cost": 750,
                "source_title": "Apple iPad Air",
                "source_url": "https://www.apple.com/ipad-air/",
                "ways_to_afford_it": ["Buy accessories later.", "Pause shopping for one month.", "Set a dedicated weekly transfer."],
                "source_mode": "Catalog fallback",
            },
        ]
    if "photography" in user_interest or "camera" in user_interest or "photo" in user_interest:
        return [
            {
                "title": "Mirrorless camera starter kit",
                "category": "Photography",
                "estimated_cost": 1000,
                "source_title": "Best Buy cameras",
                "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=mirrorless+camera",
                "ways_to_afford_it": ["Buy body first.", "Rent lenses before purchasing.", "Sell old gear."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Portrait photography workshop",
                "category": "Photography",
                "estimated_cost": 300,
                "source_title": "CreativeLive photography",
                "source_url": "https://www.creativelive.com/photography",
                "ways_to_afford_it": ["Start with one workshop.", "Delay gear upgrades.", "Use learning budget."],
                "source_mode": "Catalog fallback",
            },
            {
                "title": "Lightroom editing setup",
                "category": "Photography",
                "estimated_cost": 250,
                "source_title": "Adobe Lightroom",
                "source_url": "https://www.adobe.com/products/photoshop-lightroom.html",
                "ways_to_afford_it": ["Use subscription budget.", "Avoid buying presets early.", "Start with mobile workflow."],
                "source_mode": "Catalog fallback",
            },
        ]
    return None


def optional_tavily_link_for_goal(goal, location):
    api_key = get_tavily_api_key()
    if not api_key:
        return None
    query = f"{goal.get('title', '')} {location or ''} price".strip()
    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": 1,
                "include_answer": False,
                "include_raw_content": False,
            },
            timeout=12,
        )
        response.raise_for_status()
        results = response.json().get("results", [])
    except Exception:
        return None
    if not results:
        return None
    result = results[0]
    result_url = str(result.get("url") or "").strip()
    if "facebook.com" in result_url.lower():
        return None
    return {
        "source_title": result.get("title") or goal.get("source_title", "Source"),
        "source_url": result_url or goal.get("source_url", ""),
    }


BLOCKED_SOURCE_DOMAINS = {
    "youtube.com",
    "youtu.be",
    "reddit.com",
    "facebook.com",
    "pinterest.com",
    "wikipedia.org",
    "medium.com",
}

PREFERRED_SOURCE_DOMAINS = {
    "ticketmaster.com",
    "eventbrite.com",
    "stubhub.com",
    "seatgeek.com",
    "rei.com",
    "amazon.com",
    "bestbuy.com",
    "target.com",
    "walmart.com",
    "peloton.com",
    "classpass.com",
    "thumbtack.com",
    "mindbodyonline.com",
    "airbnb.com",
    "expedia.com",
    "kayak.com",
    "padi.com",
    "viator.com",
    "masterliveaboards.com",
    "pchscuba.com",
}

PRICE_SIGNALS = (
    "$",
    "price",
    "cost",
    "from",
    "starting at",
    "per month",
    "membership",
    "ticket",
    "book",
    "buy",
    "register",
    "enroll",
)

ARTICLE_SIGNALS = (
    "blog",
    "article",
    "guide",
    "review",
    "reviews",
    "best ",
    "top ",
    "tips",
    "what ",
    "why ",
    "how ",
)

BOOKING_SIGNALS = (
    "book",
    "booking",
    "reserve",
    "reservation",
    "register",
    "enroll",
    "course",
    "class",
    "certification",
    "ticket",
    "tickets",
    "from",
    "starting at",
)

PRODUCT_SIGNALS = (
    "buy",
    "shop",
    "add to cart",
    "product",
    "shipping",
    "in stock",
)


def source_domain(url):
    try:
        domain = urlparse(str(url or "")).netloc.lower()
    except Exception:
        return ""
    return domain[4:] if domain.startswith("www.") else domain


def domain_matches(domain, candidates):
    return any(domain == candidate or domain.endswith(f".{candidate}") for candidate in candidates)


def extract_source_price(text):
    cleaned = str(text or "").replace(",", "")
    patterns = [
        r"(?:from|starting at|starts at|price|cost)\s*:?\s*\$([1-9]\d{1,5}(?:\.\d{1,2})?)",
        r"\$([1-9]\d{1,5}(?:\.\d{1,2})?)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, cleaned, flags=re.IGNORECASE):
            try:
                value = float(match.group(1))
            except Exception:
                continue
            if value >= 10:
                return value
    return None


def source_text_bundle(result):
    return " ".join(
        [
            str(result.get("title") or ""),
            str(result.get("content") or result.get("snippet") or ""),
            str(result.get("url") or ""),
        ]
    )


def classify_source(result):
    url = str(result.get("url") or "").strip()
    domain = source_domain(url)
    text = source_text_bundle(result).lower()
    path = urlparse(url).path.lower() if url else ""
    if not url or not domain:
        return "no_source"
    if domain_matches(domain, BLOCKED_SOURCE_DOMAINS):
        return "no_source"
    is_article = any(signal in text for signal in ARTICLE_SIGNALS) or any(
        segment in path for segment in ("/blog", "/article", "/guide", "/reviews", "/best")
    )
    has_price = extract_source_price(text) is not None
    has_booking = any(signal in text for signal in BOOKING_SIGNALS)
    has_product = any(signal in text for signal in PRODUCT_SIGNALS)
    is_product_domain = domain_matches(domain, {"amazon.com", "bestbuy.com", "target.com", "walmart.com", "rei.com", "peloton.com"})
    is_booking_domain = domain_matches(
        domain,
        {
            "ticketmaster.com",
            "eventbrite.com",
            "stubhub.com",
            "seatgeek.com",
            "classpass.com",
            "thumbtack.com",
            "mindbodyonline.com",
            "airbnb.com",
            "expedia.com",
            "kayak.com",
            "padi.com",
            "viator.com",
            "masterliveaboards.com",
            "pchscuba.com",
        },
    )
    if is_article:
        return "pricing_reference" if has_price else "inspiration_only"
    if has_price and (is_product_domain or has_product):
        return "verified_product_page"
    if has_price and (is_booking_domain or has_booking):
        return "verified_booking_page"
    if has_price:
        return "pricing_reference"
    return "inspiration_only"


def source_badge(source_type):
    return {
        "verified_booking_page": "Verified price source",
        "verified_product_page": "Verified price source",
        "pricing_reference": "Research source",
        "inspiration_only": "Estimated price",
        "no_source": "Estimated price",
    }.get(source_type, "Estimated price")


def display_source_label(label):
    return {
        "Catalog fallback": "Template suggestion",
        "AI personalized": "AI personalized",
        "Verified price source": "Verified price source",
        "Pricing reference": "Research source",
        "Estimate only": "Estimated price",
    }.get(str(label or "").strip(), str(label or "").strip() or "Estimated price")


def validate_tavily_source(result):
    url = str(result.get("url") or "").strip()
    domain = source_domain(url)
    snippet = str(result.get("content") or result.get("snippet") or "").lower()
    title = str(result.get("title") or "").strip()
    full_text = source_text_bundle(result)
    source_type = classify_source(result)
    source_price = extract_source_price(full_text)
    debug = {
        "source_url": url,
        "source_title": title,
        "source_domain": domain,
        "snippet": snippet[:500],
        "source_type": source_type,
        "source_price": source_price,
        "accepted_source_url": "",
        "rejected_source_url": "",
        "rejected_reason": "",
    }
    if not url or not domain:
        debug["rejected_reason"] = "missing source URL"
        return None, debug
    if domain_matches(domain, BLOCKED_SOURCE_DOMAINS):
        debug["rejected_source_url"] = url
        debug["rejected_reason"] = "blocked source domain"
        return None, debug
    if not snippet:
        debug["rejected_source_url"] = url
        debug["rejected_reason"] = "missing snippet/content"
        return None, debug
    if not any(signal in snippet for signal in PRICE_SIGNALS):
        debug["rejected_source_url"] = url
        debug["rejected_reason"] = "snippet has no price or purchase signal"
        return None, debug
    if source_type in {"inspiration_only", "no_source"}:
        debug["rejected_source_url"] = url
        debug["rejected_reason"] = "source does not verify pricing"
        return None, debug
    preferred = domain_matches(domain, PREFERRED_SOURCE_DOMAINS)
    if not preferred and not any(signal in snippet for signal in ("$", "ticket", "book", "buy", "register", "enroll", "membership")):
        debug["rejected_source_url"] = url
        debug["rejected_reason"] = "non-preferred domain without strong purchase intent"
        return None, debug
    debug["accepted_source_url"] = url
    return {
        "source_title": title or domain,
        "source_url": url,
        "source_type": source_type,
        "source_price": source_price,
    }, debug


def purchasable_search_query(card, location, budget):
    title = str(card.get("title") or card.get("search_query") or "").strip()
    category = str(card.get("category") or "").lower()
    existing_query = str(card.get("search_query") or "").strip()
    if "subscription" in category or "membership" in title.lower():
        return f"{title} membership price"
    if any(term in category for term in ("event", "concert", "festival")):
        return f"{title} tickets price {location}".strip()
    if any(term in category for term in ("travel", "trip", "vacation")):
        return f"{title} package price"
    if any(term in category for term in ("class", "course", "certification", "lesson")) or any(
        term in title.lower() for term in ("class", "course", "certification", "lesson", "coaching")
    ):
        return f"{title} registration price"
    if any(term in category for term in ("product", "tech", "gaming", "gear", "photography", "fashion")):
        return f"{title} buy price under {int(float(budget or 0) or 1000)}"
    if existing_query:
        return f"{existing_query} price register buy"
    return f"{title} price register buy"


def optional_tavily_link_for_query(search_query):
    api_key = get_tavily_api_key()
    query = str(search_query or "").strip()
    if not api_key or not query:
        return None
    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": 1,
                "include_answer": False,
                "include_raw_content": False,
            },
            timeout=12,
        )
        response.raise_for_status()
        results = response.json().get("results", [])
    except Exception:
        return None
    if not results:
        return None
    source, _debug = validate_tavily_source(results[0])
    return source


def tavily_link_for_card(card, location, budget):
    api_key = get_tavily_api_key()
    query = purchasable_search_query(card, location, budget)
    debug = {"query": query, "accepted_source_url": "", "rejected_source_url": "", "rejected_reason": ""}
    if not api_key or not query:
        debug["rejected_reason"] = "Tavily key or query missing"
        return None, debug
    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": 1,
                "include_answer": False,
                "include_raw_content": False,
            },
            timeout=12,
        )
        response.raise_for_status()
        results = response.json().get("results", [])
    except Exception as e:
        debug["rejected_reason"] = f"Tavily request failed: {e}"
        return None, debug
    if not results:
        debug["rejected_reason"] = "no Tavily results"
        return None, debug
    source, source_debug = validate_tavily_source(results[0])
    source_debug["query"] = query
    return source, source_debug


def parse_ai_card_list(raw):
    cleaned = str(raw or "").strip()
    if not cleaned:
        return []
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start >= 0 and end > start:
            parsed = json.loads(cleaned[start : end + 1])
        else:
            raise
    if isinstance(parsed, dict):
        parsed = parsed.get("cards") or parsed.get("goals") or []
    return parsed if isinstance(parsed, list) else []


def normalize_ai_goal_card(card, target_month, location="", budget=0.0):
    raw_card = dict(card or {})
    estimated_cost = parse_goal_card_cost(raw_card.get("estimated_cost"))
    if estimated_cost is None:
        estimated_cost = 0.0
    monthly_savings = parse_goal_card_cost(raw_card.get("monthly_savings"))
    if monthly_savings is None:
        monthly_savings = calculate_monthly_savings_from_cost(estimated_cost, target_month)
    ways = raw_card.get("ways_to_afford_it", [])
    if isinstance(ways, str):
        ways = [ways]
    search_query = purchasable_search_query(raw_card, location, budget)
    normalized = {
        "title": str(raw_card.get("title") or "Goal").strip(),
        "category": str(raw_card.get("category") or "Goal").strip(),
        "estimated_cost": float(estimated_cost or 0.0),
        "monthly_savings": monthly_savings,
        "description": str(raw_card.get("description") or raw_card.get("why_match") or "").strip(),
        "ways_to_afford_it": [str(item).strip() for item in ways if str(item).strip()][:3],
        "search_query": search_query,
        "source_title": "",
        "source_url": "",
        "source_type": "no_source",
        "source_badge": "Estimated price",
        "source_mode": "Estimated price",
        "generated_by": "AI",
    }
    live_link, source_debug = tavily_link_for_card(normalized, location, budget)
    normalized["source_debug"] = source_debug
    if live_link:
        normalized.update(live_link)
        source_type = normalized.get("source_type", "pricing_reference")
        source_price = normalized.get("source_price")
        if source_type in {"verified_booking_page", "verified_product_page"} and source_price:
            ai_estimate = float(normalized.get("estimated_cost", 0.0) or 0.0)
            if ai_estimate <= 0 or abs(float(source_price) - ai_estimate) / max(ai_estimate, 1.0) > 0.25:
                normalized["estimated_cost"] = float(source_price)
                normalized["monthly_savings"] = calculate_monthly_savings_from_cost(float(source_price), target_month)
        elif source_price:
            ai_estimate = float(normalized.get("estimated_cost", 0.0) or 0.0)
            if ai_estimate > 0 and abs(float(source_price) - ai_estimate) / max(ai_estimate, 1.0) > 0.25:
                normalized["source_type"] = "inspiration_only"
        normalized["source_badge"] = source_badge(normalized.get("source_type"))
        normalized["source_mode"] = normalized["source_badge"]
    return normalized


def parse_discovery_target_date(value):
    text = str(value or "").strip()
    try:
        return datetime.date.fromisoformat(text[:10])
    except Exception:
        pass
    for fmt in ("%B", "%b"):
        try:
            month_num = datetime.datetime.strptime(text.split()[0], fmt).month
            year = today.year if month_num >= today.month else today.year + 1
            return datetime.date(year, month_num, 1)
        except Exception:
            continue
    return today + datetime.timedelta(days=120)



def render_goal_discovery():
    st.markdown("**Goal Discovery**")
    st.caption("BYABLE_BRANDING_LOADED")
    st.caption("Tell Byable what you are into. Catalog suggestions always load first; live links are optional.")

    input_cols = st.columns([1.4, 1.0, 0.8, 0.8])
    interests = input_cols[0].text_input(
        "Interests",
        value=st.session_state.get("discovery_interests", ""),
        placeholder="gaming, Japan, fitness, fashion",
        key="discovery_interests",
    )
    location = input_cols[1].text_input(
        "Location",
        value=st.session_state.get("discovery_location", ""),
        placeholder="Los Angeles, online, anywhere",
        key="discovery_location",
    )
    budget_range = input_cols[2].text_input(
        "Budget",
        value=st.session_state.get("discovery_budget_range", ""),
        placeholder="$1,500",
        key="discovery_budget_range",
    )
    target_month = input_cols[3].text_input(
        "Target month",
        value=st.session_state.get("discovery_target_month", ""),
        placeholder="September",
        key="discovery_target_month",
    )
    preference = st.selectbox(
        "Preference",
        ["surprise me", "local", "online", "travel", "product", "event"],
        key="discovery_preference",
    )

    target_budget = parse_clean_discovery_budget(budget_range)
    catalog_goals = select_clean_goal_cards(interests, target_budget)
    discovery_key = "clean_goal_discovery:" + ai_coach_cache_key(
        {
            "interests": interests,
            "location": location,
            "budget": target_budget,
            "target_month": str(target_month or ""),
            "preference": preference,
        }
    )
    current_goal_source = (
        st.session_state.get("goal_source", "")
        if st.session_state.get("goal_cards_key") == discovery_key
        else ""
    )
    selected_goals = []
    if current_goal_source in {"AI personalized", "Catalog fallback"}:
        selected_goals = st.session_state.get("goal_cards", []) or []
    matched_categories = detected_goal_categories(interests)
    matched_keywords = detected_goal_keywords(interests)
    fallback_reason = ""
    if str(interests or "").strip() and not matched_categories and "surprise" not in str(interests or "").lower():
        fallback_reason = "No matching catalog category found."
    elif matched_categories and not selected_goals:
        fallback_reason = "Matching category found, but no catalog cards have valid source links."

    discovery_payload = {
        "interests": interests,
        "location": location,
        "budget": target_budget,
        "target_month": str(target_month or ""),
        "preference": preference,
    }
    ai_result = st.session_state.get(f"{discovery_key}_ai_result")
    ai_cards_active = False
    if not selected_goals and isinstance(ai_result, dict) and len(ai_result.get("valid_cards", [])) >= 3:
        selected_goals = ai_result["valid_cards"][:5]
        ai_cards_active = True
    if selected_goals and current_goal_source.startswith("AI personalized"):
        ai_cards_active = True

    refreshed_goals = st.session_state.get(f"{discovery_key}_refreshed_goals")
    if isinstance(refreshed_goals, list) and len(refreshed_goals) >= 3:
        selected_goals = refreshed_goals
        ai_cards_active = any(goal.get("generated_by") == "AI" for goal in refreshed_goals)

    if DEV_MODE:
        with st.expander("Goal Discovery debug", expanded=False):
            st.caption("Pipeline: clean deterministic catalog")
            st.caption(f"CATALOG_CARD_COUNT: {len(selected_goals)}")
            st.caption(f"TAVILY_KEY_DETECTED: {'Yes' if get_tavily_api_key() else 'No'}")
            st.caption(f"OPENAI_KEY_DETECTED: {'Yes' if get_openai_api_key() else 'No'}")
            st.caption(f"TARGET_BUDGET: {money(target_budget)}")
            st.json(
                {
                    "matched_keywords": matched_keywords,
                    "matched_category": matched_categories,
                    "fallback_reason": fallback_reason,
                }
            )
            if ai_result:
                st.json(ai_result)

    st.markdown("#### Suggested goals")
    action_cols = st.columns([1, 1, 2])
    if action_cols[0].button("Generate ideas", type="primary"):
        client = OpenAI(api_key=st.secrets.get("OPENAI_API_KEY"))
        prompt = f"""
        Return ONLY valid JSON.
        Generate 5 goal ideas for interest: {interests}
        Location: {location}
        Budget: {budget_range}
        Target month: {target_month}
        Preference: {preference}

        Every card must include:
        title, category, estimated_cost, monthly_savings, description, ways_to_afford_it, search_query.
        Do not include source_url or source_title. Byable will find live links separately.
        Make search_query target purchasable or bookable pages:
        - products: "{{goal}} buy price under {budget_range}"
        - classes: "{{goal}} registration price"
        - events: "{{goal}} tickets price {location}"
        - travel: "{{goal}} package price"
        - subscriptions: "{{goal}} membership price"

        Format exactly as a JSON array:
        [
          {{
            "title": "Beginner scuba certification",
            "category": "Scuba diving",
            "estimated_cost": 600,
            "monthly_savings": 150,
            "description": "Get certified and start diving safely.",
            "ways_to_afford_it": ["Save weekly", "Rent gear first"],
            "search_query": "beginner scuba certification {location} price"
          }}
        ]
        """

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.4,
            )
            raw = response.choices[0].message.content
            if DEV_MODE:
                st.code(raw)
            parsed_cards = parse_ai_card_list(raw)
            cards = [
                normalize_ai_goal_card(card, target_month, location=location, budget=target_budget)
                for card in parsed_cards[:5]
            ]
            if not cards:
                raise ValueError("OpenAI returned no goal cards.")
            st.session_state["goal_cards"] = cards
            st.session_state["goal_source"] = "AI personalized"
            st.session_state["goal_cards_key"] = discovery_key
            selected_goals = cards
            ai_cards_active = True

        except Exception as e:
            if DEV_MODE:
                st.exception(e)
            fallback_cards = hard_rule_goal_cards(interests)
            if fallback_cards is None:
                fallback_cards = [dict(goal, source_mode="Catalog fallback") for goal in catalog_goals]
            st.session_state["goal_cards"] = fallback_cards or []
            st.session_state["goal_source"] = "Catalog fallback" if fallback_cards else "AI failed"
            st.session_state["goal_cards_key"] = discovery_key
            selected_goals = st.session_state["goal_cards"]
            ai_cards_active = False
    if action_cols[1].button("Refresh live links", key=f"refresh_clean_links_{discovery_key}"):
        refreshed = []
        for goal in selected_goals:
            updated = dict(goal)
            live_link, source_debug = tavily_link_for_card(goal, location, target_budget)
            updated["source_debug"] = source_debug
            if live_link:
                updated.update(live_link)
                updated["last_checked"] = today.isoformat()
                updated["source_badge"] = source_badge(updated.get("source_type"))
                updated["source_mode"] = updated["source_badge"]
            refreshed.append(updated)
        if refreshed:
            st.session_state["goal_cards"] = refreshed
            st.session_state["goal_source"] = "AI personalized"
            st.session_state["goal_cards_key"] = discovery_key
        st.session_state[f"{discovery_key}_refreshed_goals"] = refreshed
        st.rerun()

    hard_rule_cards = hard_rule_goal_cards(interests)
    active_goal_source = (
        st.session_state.get("goal_source", "")
        if st.session_state.get("goal_cards_key") == discovery_key
        else current_goal_source
    )
    if (
        hard_rule_cards is not None
        and not ai_cards_active
        and active_goal_source == "Catalog fallback"
    ):
        selected_goals = hard_rule_cards

    if active_goal_source:
        action_cols[2].caption(f"Source: {display_source_label(active_goal_source)}. Each card shows its own source badge.")
    else:
        action_cols[2].caption("Each card shows its own source badge.")

    if not selected_goals:
        if not active_goal_source:
            st.info("Click Generate ideas to ask AI for personalized goal cards.")
            return
        st.info("No matching goal templates yet. Try gaming, concerts, fitness, travel, tech, photography, or rock climbing.")
        return

    rows = [selected_goals[:3], selected_goals[3:]]
    card_idx = 0
    for row in rows:
        card_cols = st.columns(len(row))
        for col, idea in zip(card_cols, row):
            with col:
                idea = dict(idea)
                if idea.get("generated_by") != "AI" and not valid_catalog_source(idea):
                    continue
                monthly = idea.get("monthly_savings")
                if monthly in {None, ""}:
                    monthly = calculate_monthly_savings_from_cost(idea.get("estimated_cost"), target_month)
                target_date = parse_discovery_target_date(target_month)
                with st.container(border=True):
                    st.markdown(f"**{idea.get('title', 'Goal')}**")
                    st.caption(str(idea.get("category", "goal")).title())
                    metric_cols = st.columns(2)
                    metric_cols[0].metric("Estimated cost", money(idea.get("estimated_cost")))
                    metric_cols[1].metric("Save monthly", money(monthly))
                    st.caption(f"Target: {target_date.strftime('%B %Y')}")
                    source_title = idea.get("source_title") or "Source needed"
                    source_label = idea.get("source_badge") or idea.get("source_mode", "Catalog fallback")
                    st.caption(f"{display_source_label(source_label)} · {source_title}")
                    if idea.get("description"):
                        st.caption(idea["description"])
                    elif idea.get("why_match"):
                        st.caption(idea["why_match"])
                    ways = idea.get("ways_to_afford_it", []) or []
                    if ways:
                        st.markdown("**Ways to afford it**")
                        for way in ways[:2]:
                            st.caption(f"- {way}")
                    link_url = idea.get("source_url")
                    action_cols = st.columns(2)
                    if link_url:
                        action_cols[0].link_button("View source", link_url, width="stretch")
                    else:
                        search_url = f"https://www.google.com/search?q={quote_plus(str(idea.get('search_query') or idea.get('title') or ''))}"
                        action_cols[0].link_button("Search this goal", search_url, width="stretch")
                    if DEV_MODE and idea.get("source_debug"):
                        with st.expander("Source debug", expanded=False):
                            st.json(idea["source_debug"])
                    if action_cols[1].button("Use this goal", key=f"use_clean_goal_{discovery_key}_{card_idx}"):
                        selected_date = target_date
                        st.session_state.goal_input_name = idea.get("title", "Goal")
                        st.session_state.goal_input_cost = float(idea.get("estimated_cost", 0.0) or 0.0)
                        st.session_state.goal_input_date = selected_date
                        try:
                            st.session_state.goal_plan = build_goal_plan(
                                st.session_state.goal_input_name,
                                st.session_state.goal_input_cost,
                                selected_date,
                                False,
                            )
                        except Exception as e:
                            st.error("Could not send this goal into the planner.")
                            if DEV_MODE:
                                st.code(str(e))
                            return
                        st.success("Goal sent to the planner. Byable will use your budget math to check affordability.")
                        st.rerun()
                card_idx += 1


def render_goal_ai_coach_panel(plan, budget_summary):
    if DEV_MODE:
        st.caption("AI_COACH_VERSION_2_LOADED")
    st.markdown("**AI Coach**")
    st.caption("Optional guidance based on the current affordability plan. Byable keeps the budget math as the source of truth.")
    budget_allocations = plan.get("budget_allocations", {}) or {}
    roles = ensure_category_roles()
    category_budget_rows = [
        {
            "category": category,
            "future_budget": round(float(budget_allocations.get(category, 0.0)), 2),
            "role": roles.get(category, category_role(category)),
        }
        for category in sorted(set(BUDGET_CATEGORIES) | set(budget_allocations.keys()))
    ]
    monthly_income = float(budget_summary.get("income", 0.0) or 0.0)
    planned_future_spending = sum(float(value) for value in budget_allocations.values())
    if planned_future_spending <= 0:
        planned_future_spending = float(budget_summary.get("essential_spending", 0.0) or 0.0) + float(
            budget_summary.get("flexible_spending_limit", 0.0) or 0.0
        )
    available_for_goals = monthly_income - planned_future_spending
    required_monthly_savings = float(plan.get("monthly_needed", 0.0))
    plan_gap = available_for_goals - required_monthly_savings
    confidence_low = bool(
        plan.get("goalAnalysis", {})
        .get("simulationSummary", {})
        .get("projection_confidence", "")
        .lower()
        in {"low", "limited"}
    )
    coach_payload = {
        "goal_name": plan.get("goal_name", "your goal"),
        "goal_cost": round(float(plan.get("goal_cost", 0.0)), 2),
        "target_date": canonical_target_date(plan.get("target_date", today)).isoformat(),
        "monthly_income": round(monthly_income, 2),
        "planned_future_spending": round(planned_future_spending, 2),
        "available_for_goals": round(available_for_goals, 2),
        "required_monthly_savings": round(required_monthly_savings, 2),
        "monthly_surplus_or_shortfall": round(plan_gap, 2),
        "goal_status_from_lantern": "on track" if plan_gap >= 0 else "short",
        "protected_cuts_enabled": bool(plan.get("allow_protected", False)),
        "transaction_confidence_low": confidence_low,
        "category_budgets_and_roles": category_budget_rows,
    }
    coach_key = "goal:" + ai_coach_cache_key(coach_payload)
    ai_coach_cache = st.session_state.setdefault("ai_coach_cache", {})
    openai_api_key = get_openai_api_key()
    if DEV_MODE:
        show_ai_key_detection(openai_api_key)
    if not openai_api_key:
        show_missing_ai_key_sources()
        st.button("Generate AI coaching plan", disabled=True)
        return
    if st.button("Generate AI coaching plan"):
        if coach_key not in ai_coach_cache:
            try:
                with st.spinner("Generating AI coaching plan..."):
                    ai_coach_cache[coach_key] = generate_goal_ai_coaching_plan(openai_api_key, coach_payload)
            except Exception as e:
                ai_coach_cache[coach_key] = {
                    "success": True,
                    "error": f"AI coaching plan could not be generated: {e}",
                    "raw_response": "",
                    "raw_text_length": 0,
                    "parse_succeeded": False,
                    "summary": "Byable could not reach AI coaching, so this fallback uses the current budget math only.",
                    "recommended_actions": [
                        "Review the largest flexible category before changing protected spending.",
                        "Adjust one planned future budget number and check whether the goal moves on track.",
                        "Try generating AI coaching again after the API call is healthy.",
                    ],
                    "risk_warning": "AI coaching was unavailable; budget calculations above are still deterministic.",
                    "next_best_step": "Use the Budget Planner numbers to make one flexible tradeoff.",
                }
                st.error(ai_coach_cache[coach_key]["error"])
                show_ai_debug_response("")
        st.session_state.active_goal_ai_coach_key = coach_key
    if st.session_state.get("active_goal_ai_coach_key") == coach_key and coach_key in ai_coach_cache:
        advice = ai_coach_cache[coach_key]
        if advice.get("error"):
            st.error(advice["error"])
            if advice.get("raw_response"):
                show_ai_debug_response(advice.get("raw_response", ""))
        if DEV_MODE:
            st.caption(
                "API key detected: Yes · "
                f"OpenAI text length > 0: {'Yes' if int(advice.get('raw_text_length', 0)) > 0 else 'No'} · "
                f"JSON parse succeeded: {'Yes' if advice.get('parse_succeeded') else 'No'}"
            )
        st.write(advice["summary"])
        st.markdown("**Recommended actions**")
        for idx, action in enumerate(advice["recommended_actions"][:3], start=1):
            st.write(f"{idx}. {action}")
        if advice.get("risk_warning"):
            st.warning(advice["risk_warning"])
        if advice.get("next_best_step"):
            st.info(f"Next best step: {advice['next_best_step']}")


def detected_savings_text(value):
    value = float(value)
    if value >= 0:
        return f"freed up {money(value)}"
    return f"overspent baseline by {money(abs(value))}"


def behavior_delta_label(value):
    return "Saved toward goal this week" if float(value) >= 0 else "Extra spending vs normal"


def behavior_delta_value(value):
    return money(abs(float(value)))


def pace_delta_label(value):
    return "Ahead weekly" if float(value) >= 0 else "Still needed weekly"


def pace_delta_value(value):
    return money(abs(float(value)))


def simulation_debug_rows(plan):
    analysis = plan["goalAnalysis"]
    return [
        {"Metric": "activeSimulation", "Value": analysis["activeSimulation"]},
        {"Metric": "baselineWeeklyFlexibleSpend", "Value": money(analysis["baselineWeeklyFlexibleSpend"])},
        {"Metric": "currentWeekFlexibleSpend", "Value": money(analysis["currentWeekFlexibleSpend"])},
        {"Metric": "behaviorDelta", "Value": signed_money(analysis["behaviorDelta"])},
        {"Metric": "savedTowardGoalThisWeek", "Value": money(analysis["savedTowardGoalThisWeek"])},
        {"Metric": "weeklyGoalNeed", "Value": money(analysis["weeklyGoalNeed"])},
        {"Metric": "behaviorGap", "Value": signed_money(analysis["behaviorGap"])},
        {"Metric": "savingsGap", "Value": signed_money(analysis["savingsGap"])},
        {"Metric": "remaining", "Value": money(analysis["remaining"])},
        {"Metric": "behaviorProjectedDate", "Value": projected_date_label(analysis["behaviorProjectedDate"])},
        {"Metric": "projectedDate", "Value": projected_date_label(analysis["projectedDate"])},
        {"Metric": "behaviorTrajectoryStatus", "Value": analysis["behaviorTrajectoryStatus"]},
        {"Metric": "savingsTrajectoryStatus", "Value": analysis["savingsTrajectoryStatus"]},
        {"Metric": "numberOfSimulationTransactions", "Value": str(analysis["numberOfSimulationTransactions"])},
    ]


def simulation_validation_errors(plan):
    analysis = plan["goalAnalysis"]
    errors = []
    scenarios = {
        str(row["Scenario"]).lower().split()[0]: row
        for row in analysis.get("validation_scenarios", [])
    }
    good = scenarios.get("good", {}).get("Behavior delta")
    average = scenarios.get("average", {}).get("Behavior delta")
    overspending = scenarios.get("overspending", {}).get("Behavior delta")
    good_date = scenarios.get("good", {}).get("Projected date")
    average_date = scenarios.get("average", {}).get("Projected date")
    overspending_date = scenarios.get("overspending", {}).get("Projected date")
    if good is not None and good <= 0:
        errors.append("Good week behaviorDelta must be positive.")
    if average is not None and abs(float(average)) > 1:
        errors.append("Average week behaviorDelta must be near zero.")
    if overspending is not None and overspending >= 0:
        errors.append("Overspending week behaviorDelta must be negative.")
    if good_date and average_date and good_date > average_date:
        errors.append("Good week projected date must be earlier than average.")
    if overspending_date and average_date and overspending_date < average_date:
        errors.append("Overspending projected date must be later than average.")
    debug_values = {
        "behaviorDelta": analysis["behaviorDelta"],
        "baselineWeeklyFlexibleSpend": analysis["baselineWeeklyFlexibleSpend"],
        "currentWeekFlexibleSpend": analysis["currentWeekFlexibleSpend"],
    }
    if abs(debug_values["behaviorDelta"] - (debug_values["baselineWeeklyFlexibleSpend"] - debug_values["currentWeekFlexibleSpend"])) > 0.01:
        errors.append("UI values do not match debug table behaviorDelta.")
    expected_remaining = max(0.0, float(plan["goal_cost"]) - float(analysis["progress_amount"]) - float(analysis["savedTowardGoalThisWeek"]))
    if abs(float(analysis["remaining"]) - expected_remaining) > 0.01:
        errors.append("Remaining does not reconcile with automatic savings.")
    return errors


def reconciliation_debug(plan):
    analysis = plan["goalAnalysis"]
    category_rows = analysis["category_deltas"]
    visible_total = sum(float(row.get("Estimated savings", 0.0)) for row in category_rows)
    detected_total = float(analysis["behaviorImprovement"])
    hidden = [
        row for row in category_rows
        if abs(float(row.get("Estimated savings", 0.0))) >= 0.01
        and row.get("Category") not in {visible.get("Category") for visible in top_behavior_rows(category_rows, limit=3)}
    ]
    return {
        "visible_total": visible_total,
        "detected_total": detected_total,
        "hidden": hidden,
        "baseline_total": float(analysis["baselineWeeklyFlexibleSpend"]),
        "current_total": float(analysis["currentWeekFlexibleSpend"]),
        "mismatch": abs(visible_total - detected_total) > 0.01,
    }


def category_totals_match_transactions(plan):
    transactions = load_demo_transactions_if_needed()
    tx_totals = {}
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount < 0:
            bucket = intelligence_bucket(tx)
            tx_totals[bucket] = tx_totals.get(bucket, 0.0) + abs(amount)
    displayed = {
        row["Category"]: float(row["Monthly spend"])
        for row in plan.get("category_intelligence", [])
    }
    keys = set(tx_totals) | set(displayed)
    mismatches = []
    for key in sorted(keys):
        if abs(tx_totals.get(key, 0.0) - displayed.get(key, 0.0)) > 0.01:
            mismatches.append((key, tx_totals.get(key, 0.0), displayed.get(key, 0.0)))
    return mismatches


def dining_streak(transactions, as_of):
    current_week_start, _ = week_bounds(as_of)
    weekly = {}
    for tx in transactions:
        if float(tx.get("amount", 0.0)) >= 0:
            continue
        if intelligence_bucket(tx) != "Restaurants / dining":
            continue
        d = parse_tx_date(tx)
        start, _ = week_bounds(d)
        if current_week_start - datetime.timedelta(days=35) <= start <= current_week_start:
            weekly[start] = weekly.get(start, 0.0) + abs(float(tx.get("amount", 0.0)))
    previous_values = [
        amount
        for start, amount in weekly.items()
        if current_week_start - datetime.timedelta(days=35) <= start < current_week_start
    ]
    baseline = sum(previous_values) / max(1, len(previous_values))
    if baseline <= 0:
        return 0
    streak = 0
    for offset in range(0, 6):
        start = current_week_start - datetime.timedelta(days=offset * 7)
        if weekly.get(start, 0.0) <= baseline * 0.90:
            streak += 1
        else:
            break
    return streak


def flexible_weekly_totals(transactions, as_of, weeks_back=8):
    current_week_start, _ = week_bounds(as_of)
    totals = {}
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        bucket = intelligence_bucket(tx)
        if bucket not in BEHAVIOR_TRACKED_CATEGORIES:
            continue
        tx_date = parse_tx_date(tx)
        week_start, _ = week_bounds(tx_date)
        if current_week_start - datetime.timedelta(days=7 * weeks_back) <= week_start <= current_week_start:
            totals[week_start] = totals.get(week_start, 0.0) + abs(amount)
    return totals


def savings_momentum(transactions, as_of):
    weekly = flexible_weekly_totals(transactions, as_of)
    current_week_start, _ = week_bounds(as_of)
    previous_values = [
        amount
        for week_start, amount in weekly.items()
        if current_week_start - datetime.timedelta(days=56) <= week_start < current_week_start
    ]
    baseline = sum(previous_values) / max(1, len(previous_values))
    streak = 0
    gained_total = 0.0
    for offset in range(0, 8):
        week_start = current_week_start - datetime.timedelta(days=offset * 7)
        saved = baseline - weekly.get(week_start, 0.0)
        if baseline > 0 and saved > 0:
            streak += 1
            gained_total += saved
        else:
            break
    return {
        "weekly_savings_streak": streak,
        "baseline_weekly_flexible": baseline,
        "current_week_flexible": weekly.get(current_week_start, 0.0),
        "recent_savings_total": max(0.0, gained_total),
    }


def recurring_spending_patterns(transactions, selected_month_start=None):
    selected_month_start = selected_month_start or month_start
    selected_month_end = month_bounds(selected_month_start)[1]
    grouped = {}
    for tx in transactions:
        amount = float(tx.get("amount", 0.0))
        if amount >= 0:
            continue
        tx_date = parse_tx_date(tx)
        if not (selected_month_start <= tx_date <= selected_month_end):
            continue
        merchant = str(tx.get("merchant", "")).strip() or "Unknown merchant"
        category = intelligence_bucket(tx)
        key = (merchant.lower(), category)
        current = grouped.setdefault(
            key,
            {"Merchant": merchant, "Category": category, "Transactions": 0, "Monthly total": 0.0},
        )
        current["Transactions"] += 1
        current["Monthly total"] += abs(amount)
    return sorted(
        [row for row in grouped.values() if row["Transactions"] >= 2],
        key=lambda row: row["Monthly total"],
        reverse=True,
    )


def goal_timeline_delta(projected_date, target_date):
    if not projected_date:
        return None
    return (projected_date - target_date).days


def timeline_insights(plan):
    analysis = plan["goalAnalysis"]
    insights = []
    weekly_target = max(1.0, float(analysis.get("weeklyTarget", 0.0)))
    saved = float(analysis.get("savedTowardGoalThisWeek", 0.0))
    projected_date = analysis.get("behaviorProjectedDate") or analysis.get("projectedDate")
    target_date = plan["target_date"]
    delta_days = goal_timeline_delta(projected_date, target_date)

    if float(analysis.get("gapVsTarget", 0.0)) >= 0:
        insights.append("You are ahead of pace.")
    elif delta_days is not None and delta_days > 0:
        insights.append(f"Your current pace finishes {delta_days} day{'s' if delta_days != 1 else ''} late.")
    else:
        insights.append("You are near target, but the plan still needs consistent weekly savings.")

    if saved > 0:
        days_moved = max(1, round(saved / weekly_target * 7))
        insights.append(f"This week's flexible-spending reduction moved your goal up about {days_moved} day{'s' if days_moved != 1 else ''}.")

    category_rows = analysis.get("category_deltas", [])
    positive = sorted(
        [row for row in category_rows if float(row.get("Estimated savings", 0.0)) > 1],
        key=lambda row: float(row.get("Estimated savings", 0.0)),
        reverse=True,
    )
    negative = sorted(
        [row for row in category_rows if float(row.get("Estimated savings", 0.0)) < -1],
        key=lambda row: float(row.get("Estimated savings", 0.0)),
    )
    if positive:
        row = positive[0]
        days = max(1, round(float(row["Estimated savings"]) / weekly_target * 7))
        insights.append(f"Reducing {row['Category'].lower()} moved your goal up about {days} day{'s' if days != 1 else ''}.")
    if negative:
        row = negative[0]
        insights.append(f"{row['Category']} is the biggest drag on your timeline.")
    if delta_days is not None and delta_days < 0:
        insights.append(f"Your current pace finishes {abs(delta_days)} day{'s' if abs(delta_days) != 1 else ''} early.")
    return insights[:5]


def affordability_status(plan):
    pace = realistic_pace_label(plan)
    if pace in {"Very achievable", "Achievable with consistency"}:
        return "Possible"
    if pace == "Tight timeline":
        return "Tight"
    return "Unrealistic without changes"


def render_goal_plan(plan):
    st.caption(f"Goal Command Center uses local transactions plus budget rules for {month_start.strftime('%B %Y')}.")
    target_label = plan["target_date"].strftime("%b %-d, %Y")
    analysis = plan["goalAnalysis"]
    behavior_status = analysis["behaviorTrajectoryStatus"]
    projected_date = analysis["projectedDate"]
    behavior_projected_date = analysis["behaviorProjectedDate"]
    behavior_pace_delta = analysis["behaviorGapVsTarget"]
    detected = analysis["behaviorImprovement"]
    saved_toward_goal = analysis["savedTowardGoalThisWeek"]
    remaining_after_week = analysis["remaining"]
    budget_summary = budget_summary_defaults(plan.get("budget", {}))
    weekly_flexible_limit = budget_summary["flexible_spending_limit"] * 12 / 52 if budget_summary["flexible_spending_limit"] > 0 else 0.0
    projection_delta_days = goal_timeline_delta(behavior_projected_date, plan["target_date"])
    momentum = plan.get("momentum", {}) or {}
    top_recommendations = plan.get("recommendations", [])[:3]
    progress_ratio = min(1.0, float(analysis.get("effective_progress_amount", 0.0)) / max(1.0, float(plan["goal_cost"])))
    if projection_delta_days is None:
        time_signal = "Needs momentum"
        time_caption = "Byable needs savings progress before it can estimate time gained or lost."
    elif projection_delta_days > 0:
        time_signal = f"{projection_delta_days} days late"
        time_caption = f"At this pace, {plan['goal_name']} lands after the target date."
    elif projection_delta_days < 0:
        time_signal = f"{abs(projection_delta_days)} days early"
        time_caption = f"Your current pace moves {plan['goal_name']} ahead of schedule."
    else:
        time_signal = "On date"
        time_caption = "Your current pace lines up with the target date."

    with st.container(border=True):
        header_cols = st.columns([1.6, 1.0, 1.0])
        header_cols[0].subheader("Goal Command Center")
        header_cols[1].write(f"Goal: **{plan['goal_name']}**")
        header_cols[2].write(f"Target: **{target_label}**")
        st.progress(progress_ratio)
        status_cols = st.columns(5)
        status_cols[0].metric("Status", behavior_status)
        status_cols[1].metric(
            "Current projection",
            projected_date_label(behavior_projected_date or projected_date),
            help="Estimated completion date if your current weekly savings pace continues.",
        )
        status_cols[2].metric("Time gained/lost", time_signal)
        status_cols[3].metric(
            "Weekly pace",
            f"{money(max(0.0, saved_toward_goal))}/week",
            help="Reduced flexible spending this week compared with your normal recent pace.",
        )
        if behavior_pace_delta >= 0:
            status_cols[4].metric(
                "Pace gap",
                f"{money(behavior_pace_delta)}/week ahead",
                help="Current weekly savings pace minus required weekly savings.",
            )
        else:
            status_cols[4].metric(
                "Pace gap",
                f"{money(abs(behavior_pace_delta))}/week needed",
                help="Required weekly savings minus the flexible-spending savings detected this week.",
            )
        st.caption(
            f"{money(plan['goal_cost'])} goal. {money(remaining_after_week)} remaining after saved progress and this week's detected savings. "
            f"Required pace is {money(analysis['weeklyTarget'])}/week. {time_caption}"
        )
        if weekly_flexible_limit > 0:
            st.caption(
                f"Budget rule context: flexible spending limit is {money(budget_summary['flexible_spending_limit'])}/month "
                f"or about {money(weekly_flexible_limit)}/week."
            )

    render_goal_ai_coach_panel(plan, budget_summary)

    previous_snapshot = st.session_state.pop("previous_goal_snapshot", None)
    simulated_scenario = st.session_state.pop("last_simulated_week", None)
    if simulated_scenario:
        scenario_label = simulated_scenario.replace("_", " ")
        if previous_snapshot:
            previous_gap = float(previous_snapshot.get("gap", 0.0))
            previous_date = previous_snapshot.get("projected_date")
            movement = "improved" if behavior_pace_delta > previous_gap else "worsened" if behavior_pace_delta < previous_gap else "stayed about the same"
            gap_message = f"from {signed_money(previous_gap)} to {signed_money(behavior_pace_delta)}"
            projection_message = f"from {projected_date_label(previous_date)} to {projected_date_label(behavior_projected_date)}"
            st.info(
                f"Simulated {scenario_label} week: your savings pace {movement} {gap_message}, "
                f"moving your projected completion {projection_message}."
            )
        else:
            st.info(f"Simulated {scenario_label} week: you {detected_savings_text(detected)} versus baseline.")

    insight_col, action_col = st.columns([1.0, 1.25])
    with insight_col:
        with st.container(border=True):
            st.subheader("AI insights")
            st.caption("Rules-based MVP insights. No external AI calls are used.")
            for insight in timeline_insights(plan)[:4]:
                st.write(f"- {insight}")
            st.caption(f"Projection confidence: {analysis['simulationSummary']['projection_confidence']}.")
            streak = int(momentum.get("weekly_savings_streak", 0))
            track_weeks = int(momentum.get("consecutive_weeks_on_track", 0))
            st.caption(
                f"Momentum: {streak} week{'s' if streak != 1 else ''} of savings momentum; "
                f"{track_weeks} consecutive week{'s' if track_weeks != 1 else ''} on track."
            )
    with action_col:
        with st.container(border=True):
            st.subheader("Recommended actions")
            if behavior_pace_delta < 0:
                st.caption(f"Close a {money(abs(behavior_pace_delta))}/week gap with the highest-impact flexible categories.")
            else:
                st.caption(f"Protect your {money(behavior_pace_delta)}/week pace advantage.")
            if top_recommendations:
                for row in top_recommendations:
                    action_cols = st.columns([1.2, 0.8])
                    action_cols[0].write(f"**{row['Category']}**")
                    action_cols[0].caption(row.get("Recommendation", row.get("Behavior change", "")))
                    action_cols[1].metric("Weekly lift", f"+{money(row['Recommended weekly cut'])}")
            else:
                st.info("Move the date out, lower the goal cost, or mark more categories as Flexible in Budget Planner.")

    sim_container, context_container = st.columns([1.0, 1.0])
    with sim_container:
        with st.container(border=True):
            st.subheader("Simulations")
            sim_cols = st.columns(3)
            scenarios = [
                ("Good week", "good"),
                ("Average week", "average"),
                ("Overspend", "overspending"),
            ]
            for col, (label, scenario) in zip(sim_cols, scenarios):
                if col.button(label, width="stretch"):
                    try:
                        st.session_state.previous_goal_snapshot = {
                            "gap": analysis["behaviorGapVsTarget"],
                            "projected_date": analysis["behaviorProjectedDate"],
                        }
                        api_simulate_week(scenario)
                        st.session_state.last_simulated_week = scenario
                        st.session_state.pop("goal_plan", None)
                        st.rerun()
                    except Exception as e:
                        st.error("Could not simulate this week.")
                        st.code(str(e))
            st.caption("Simulations show how one week of spending behavior changes the projected goal date.")
    with context_container:
        with st.container(border=True):
            st.subheader("This week")
            rows = analysis["category_deltas"]
            if rows:
                for row in rows[:5]:
                    st.write(f"- {savings_detection_sentence(row)}")
            else:
                st.write("No meaningful spending change detected yet this week.")
            st.caption(plan.get("what_this_changes", "This plan is based on the categories marked Flexible."))

    if not plan["realistic"]:
        simulation_rows = plan.get("date_simulations", [])
        if simulation_rows:
            first = simulation_rows[-1]
            st.info(
                f"Moving {plan['goal_name']} from {target_label} to {first['New target date']} lowers required weekly savings "
                f"from {money(plan['weekly_needed'])}/week to {money(first['Required weekly savings'])}/week."
            )

    with st.expander("Show planning details"):
        detail_cols = st.columns(2)
        with detail_cols[0]:
            st.markdown("**Recommended changes**")
            if plan["recommendations"]:
                detail_df = pd.DataFrame(plan["recommendations"])
                for col in ["Current weekly spend", "Recommended weekly cut"]:
                    detail_df[col] = detail_df[col].map(money)
                for col in ["Baseline spend", "Current spend", "Projected impact"]:
                    if col in detail_df.columns:
                        detail_df[col] = detail_df[col].map(money)
                visible_cols = [
                    "Category",
                    "Recommended weekly cut",
                    "Lifestyle impact",
                    "Baseline spend",
                    "Current spend",
                    "Projected impact",
                    "Protected categories",
                    "Why selected",
                ]
                st.dataframe(detail_df[[col for col in visible_cols if col in detail_df.columns]], width="stretch", hide_index=True)
        with detail_cols[1]:
            st.markdown("**Protected categories**")
            protected_rows = [
                {
                    "Category": category,
                    "Reason": PROTECTED_CATEGORY_LABELS.get(category, "essential"),
                    "Month-to-date": money(amount),
                }
                for category, amount in sorted(plan["protected"].items())
                if amount > 0
            ]
            if protected_rows:
                st.dataframe(pd.DataFrame(protected_rows), width="stretch", hide_index=True)
            else:
                st.write("No protected category spending found.")

    if show_legacy_tools:
        with st.expander("Simulation debug"):
            st.dataframe(pd.DataFrame(simulation_debug_rows(plan)), width="stretch", hide_index=True)
            validation_errors = simulation_validation_errors(plan)
            for error in validation_errors:
                st.error(error)
            reconciliation = reconciliation_debug(plan)
            recon_cols = st.columns(4)
            recon_cols[0].metric("Total visible category deltas", signed_money(reconciliation["visible_total"]))
            recon_cols[1].metric("Behavior delta total", signed_money(reconciliation["detected_total"]))
            recon_cols[2].metric("Baseline totals", money(reconciliation["baseline_total"]))
            recon_cols[3].metric("Current totals", money(reconciliation["current_total"]))
            if reconciliation["mismatch"]:
                st.warning("Analytics mismatch detected")
            hidden = reconciliation["hidden"]
            st.markdown("**Hidden contributing categories**")
            if hidden:
                st.dataframe(
                    pd.DataFrame(
                        [
                            {
                                "Category": row["Category"],
                                "Baseline weekly": money(row["Baseline weekly"]),
                                "Current weekly pace": money(row["Current weekly pace"]),
                                "Delta": signed_money(row["Estimated savings"]),
                            }
                            for row in hidden
                        ]
                    ),
                    width="stretch",
                    hide_index=True,
                )
            else:
                st.caption("None. All contributing category deltas are visible in Progress this week.")
            mismatches = category_totals_match_transactions(plan)
            if mismatches:
                st.warning("Displayed category totals do not match transaction-derived totals.")
                st.dataframe(
                    pd.DataFrame(
                        [
                            {
                                "Category": category,
                                "Transaction total": money(tx_total),
                                "Displayed total": money(displayed_total),
                            }
                            for category, tx_total, displayed_total in mismatches
                        ]
                    ),
                    width="stretch",
                    hide_index=True,
                )


st.sidebar.title("Byable")
st.sidebar.divider()
if st.sidebar.button("Load realistic transaction history", width="stretch"):
    try:
        result = api_load_realistic_transaction_history()
        st.session_state.pop("goal_plan", None)
        st.sidebar.success(f"Loaded {int(result.get('loaded', 0))} demo transactions.")
        st.rerun()
    except Exception as e:
        st.sidebar.error("Could not load demo history.")
        st.sidebar.code(str(e))

page = st.sidebar.radio(
    "Plan",
    [
        "Goal Command Center",
        "Spending Intelligence",
        "Demo",
        "Transaction History",
        "Budget Planner",
        "Saved Plans",
    ],
    label_visibility="collapsed",
)
show_legacy_tools = st.sidebar.checkbox("Show advanced legacy tools", value=False)

if page == "Goal Command Center":
    render_goal_discovery()
    st.divider()

    if not st.session_state.get("local_budget") or not st.session_state.get("local_transactions"):
        st.info(
            "Start with Budget Planner and Transaction History when you want the planner to use your own numbers. "
            "You can also load realistic demo history from the sidebar to see how the product works."
        )
    previous_plan_style = st.session_state.get("plan_style", "Balanced")
    setup_cols = st.columns([1, 2])
    plan_style = setup_cols[0].selectbox(
        "Plan style",
        ["Minimal lifestyle change", "Balanced", "Fastest possible"],
        index=["Minimal lifestyle change", "Balanced", "Fastest possible"].index(previous_plan_style)
        if previous_plan_style in ["Minimal lifestyle change", "Balanced", "Fastest possible"]
        else 1,
        help="Minimal keeps routines intact, Balanced uses realistic tradeoffs, Fastest possible uses the strongest approved cuts.",
    )
    setup_cols[1].caption("Category roles are managed in Budget Planner. The planner only recommends reductions in flexible categories.")
    if plan_style != previous_plan_style:
        st.session_state.plan_style = plan_style
        st.session_state.pop("goal_plan", None)
        st.rerun()
    st.session_state.plan_style = plan_style

    st.session_state.setdefault("goal_input_name", "Hawaii trip")
    st.session_state.setdefault("goal_input_cost", 1800.0)
    st.session_state.setdefault("goal_input_date", today + datetime.timedelta(days=90))

    with st.form("afford_goal_form"):
        goal_cols = st.columns([1.4, 0.8, 0.9])
        goal_name = goal_cols[0].text_input("Goal", key="goal_input_name")
        goal_cost = goal_cols[1].number_input(
            "Cost",
            min_value=1.0,
            step=25.0,
            format="%.2f",
            key="goal_input_cost",
        )
        target_date = goal_cols[2].date_input("Date", min_value=today, key="goal_input_date")
        allow_protected = False
        submitted_goal = st.form_submit_button("How can I afford this?", width="stretch")

    if submitted_goal or "goal_plan" not in st.session_state:
        try:
            st.session_state.goal_plan = build_goal_plan(goal_name, goal_cost, target_date, allow_protected)
        except Exception as e:
            st.error("Could not build the affordability plan.")
            st.code(str(e))

    plan = st.session_state.get("goal_plan")
    if plan:
        render_goal_plan(plan)
        if st.button("Save this plan"):
            try:
                api_save_goal(plan)
                st.success("Plan saved.")
            except Exception as e:
                st.error("Could not save plan.")
                st.code(str(e))

elif page == "Demo":
    render_lantern_demo_page()

elif page == "Transaction History":
    st.subheader("Transaction history")
    st.caption("Review and shape the transaction picture Byable uses. Categories are editable because the baseline is a suggestion, not truth.")

    with st.expander("Add a manual transaction"):
        with st.form("history_add_tx_form"):
            add_cols = st.columns([0.9, 1.2, 0.8, 1.0, 1.0])
            tx_type = add_cols[0].selectbox("Type", ["Spending", "Income"], index=0, key="history_add_type")
            tx_date = add_cols[1].date_input("Date", value=today, key="history_add_date")
            merchant = add_cols[2].text_input("Merchant", value="Neighborhood Cafe", key="history_add_merchant")
            amount = add_cols[3].number_input("Amount", min_value=0.0, value=12.00, step=0.50, format="%.2f", key="history_add_amount")
            category_options = ["Income"] if tx_type == "Income" else SIMPLE_BUDGET_CATEGORIES
            selected_category = add_cols[4].selectbox("Category", category_options, index=0, key="history_add_category")
            add_history_tx = st.form_submit_button("Add transaction")

        if add_history_tx:
            signed_amount = abs(float(amount)) if tx_type == "Income" else -abs(float(amount))
            category = "Income" if tx_type == "Income" else SIMPLE_TO_RAW_CATEGORY.get(selected_category, "Other")
            api_add_transaction(
                {
                    "date": tx_date.isoformat(),
                    "merchant": merchant.strip(),
                    "amount": signed_amount,
                    "category": category,
                    "user_id": st.session_state.user_id,
                }
            )
            st.session_state.pop("goal_plan", None)
            st.success("Transaction added.")

    try:
        load_demo_transactions_if_needed()
        all_transactions = api_get_all_transactions()
        newest_first = st.toggle("Newest first", value=True, key="history_newest_first")
        recurring_patterns = recurring_subscription_patterns(all_transactions)
        recurring_keys = {pattern["Key"] for pattern in recurring_patterns}
        visible_rows = []
        for idx, tx in enumerate(all_transactions):
            tx_date = parse_tx_date(tx)
            if not (month_start <= tx_date <= month_end):
                continue
            amount_value = float(tx.get("amount", 0.0))
            tx_type = "Income" if amount_value >= 0 or str(tx.get("category")) == "Income" else "Spending"
            confidence = "Income" if tx_type == "Income" else transaction_confidence(tx, recurring_keys)
            visible_rows.append(
                {
                    "row_id": idx,
                    "Date": tx_date,
                    "Merchant": str(tx.get("merchant", "")),
                    "Type": tx_type,
                    "Amount": abs(amount_value),
                    "Category": "Income" if tx_type == "Income" else simple_budget_category(tx.get("category", "Other")),
                    "Role": "income" if tx_type == "Income" else category_role(tx.get("category", "Other")),
                    "Confidence": confidence,
                    "Recurring": "Yes" if recurring_transaction_key(tx) in recurring_keys else "No",
                    "Why": categorization_explanation(tx),
                    "Source": transaction_source_label(tx),
                }
            )

        review_count = sum(
            1
            for row in visible_rows
            if row["Confidence"] in {"Review recommended", "Some transactions may need confirmation"}
        )
        trust_cols = st.columns(3)
        trust_cols[0].metric("Transactions to review", str(review_count))
        trust_cols[1].metric("Recurring monthly charges", str(len(recurring_patterns)))
        trust_cols[2].metric("Baseline trust", "Review recommended" if review_count else "Moderate confidence")

        if recurring_patterns:
            with st.expander("Recurring subscriptions detected"):
                st.caption("These look recurring based on merchant, amount, and timing.")
                for pattern in recurring_patterns[:6]:
                    st.write(f"**{pattern['Merchant']}** · {money(pattern['Typical amount'])}/month · {pattern['Category']}")

        st.subheader("Monthly category totals")
        month_transactions = sorted(
            [tx for tx in all_transactions if month_start <= parse_tx_date(tx) <= month_end],
            key=parse_tx_date,
            reverse=newest_first,
        )
        totals = simple_spending_totals(month_transactions)
        with st.expander("Detailed monthly totals"):
            if sum(totals.values()) > 0:
                total_rows = [
                    {
                        "Category": category,
                        "Role": simple_category_role(category),
                        "Monthly spending": amount,
                    }
                    for category, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True)
                    if amount > 0
                ]
                totals_df = pd.DataFrame(total_rows)
                totals_df["Monthly spending"] = totals_df["Monthly spending"].map(money)
                st.dataframe(totals_df, width="stretch", hide_index=True)
            else:
                st.info("No spending transactions for this month yet.")

        st.subheader("Transactions")
        if not visible_rows:
            st.write("No transactions found for the selected month.")
        else:
            visible_df = pd.DataFrame(visible_rows).sort_values("Date", ascending=not newest_first)
            display_df = visible_df.drop(columns=["row_id"])
            display_df["Amount"] = display_df["Amount"].map(money)
            st.dataframe(display_df, width="stretch", hide_index=True)
            with st.expander("Why were these categorized this way?"):
                st.caption("Review recommended rows before using the baseline for planning.")
                why_rows = display_df[["Merchant", "Category", "Confidence", "Recurring", "Why"]]
                st.dataframe(why_rows, width="stretch", hide_index=True)
            with st.expander("Review and edit transaction details"):
                st.caption("Manual editing is temporary for the MVP. With account sync, this becomes mostly recategorization.")
                remember_history_merchants = st.checkbox(
                    "Remember merchant corrections",
                    value=True,
                    key="history_remember_merchant_corrections",
                    help="Apply corrected categories to matching merchant names in future local transactions.",
                )
                edited_df = st.data_editor(
                    visible_df,
                    width="stretch",
                    hide_index=True,
                    disabled=["row_id", "Role", "Confidence", "Recurring", "Why", "Source"],
                    column_config={
                        "row_id": None,
                        "Date": st.column_config.DateColumn("Date"),
                        "Type": st.column_config.SelectboxColumn("Type", options=["Spending", "Income"]),
                        "Amount": st.column_config.NumberColumn("Amount", min_value=0.0, step=0.01, format="$%.2f"),
                        "Category": st.column_config.SelectboxColumn("Category", options=["Income"] + SIMPLE_BUDGET_CATEGORIES),
                    },
                    key="transaction_history_editor",
                )
                if st.button("Save transaction edits", type="primary"):
                    updated_transactions = list(all_transactions)
                    for _, row in edited_df.iterrows():
                        original_index = int(row["row_id"])
                        row_type = str(row["Type"])
                        selected_simple_category = str(row["Category"])
                        row_category = "Income" if row_type == "Income" else SIMPLE_TO_RAW_CATEGORY.get(selected_simple_category, "Other")
                        row_amount = abs(float(row["Amount"]))
                        signed_amount = row_amount if row_type == "Income" else -row_amount
                        updated = dict(updated_transactions[original_index])
                        if row_type != "Income" and remember_history_merchants:
                            remember_merchant_category(row["Merchant"], selected_simple_category)
                        updated.update(
                            {
                                "date": transaction_date_value(row["Date"]),
                                "merchant": str(row["Merchant"]).strip(),
                                "amount": signed_amount,
                                "category": row_category,
                                "source": "user",
                            }
                        )
                        updated_transactions[original_index] = updated
                    save_local_transaction_updates(updated_transactions)
                    st.success("Transactions updated.")
                    st.rerun()
        st.caption("Category roles are managed in Budget Planner.")
    except Exception as e:
        st.error("Could not load transactions.")
        st.code(str(e))

elif page == "Spending Intelligence":
    st.subheader("Spending Intelligence")
    st.caption("A single view of flexible spend, timeline drag, recurring patterns, and realistic cuts.")
    try:
        transactions = load_demo_transactions_if_needed()
        prev_start, prev_end = month_bounds(previous_month(month_start))
        previous_transactions = api_get_transactions(prev_start.isoformat(), prev_end.isoformat()).get("transactions", [])
        rows = build_category_intelligence(transactions, previous_transactions)
        if not rows:
            st.write("No spending found for this month.")
        else:
            total_spend = sum(float(row["Monthly spend"]) for row in rows)
            flexible_cut_total = sum(float(row["Suggested cut"]) for row in rows)
            savings_rows = [
                {
                    "Category": row["Category"],
                    "Potential savings": row["Suggested cut"],
                }
                for row in rows
                if row["Flexibility"] == "flexible" and row["Suggested cut"] > 0
            ]
            recurring = recurring_spending_patterns(transactions, month_start)
            drag_rows = sorted(
                [row for row in rows if row["Trend"] is not None and float(row["Trend"]) > 0],
                key=lambda row: float(row["Trend"]),
                reverse=True,
            )[:3]
            best_rows = sorted(
                [row for row in rows if row["Suggested cut"] > 0],
                key=lambda row: row["Suggested cut"],
                reverse=True,
            )[:5]
            top = st.columns(3)
            top[0].metric("Monthly spend", money(total_spend))
            top[1].metric("Flexible cut potential", money(flexible_cut_total))
            top[2].metric("Flexible categories", str(sum(1 for row in rows if row["Flexibility"] == "flexible")))

            chart_col, narrative_col = st.columns([1.25, 1.0])
            with chart_col:
                with st.container(border=True):
                    st.subheader("Acceleration opportunities")
                    if savings_rows:
                        st.bar_chart(pd.DataFrame(savings_rows).set_index("Category"))
                    else:
                        st.info("No flexible cut potential found under the current budget rules.")
            with narrative_col:
                with st.container(border=True):
                    st.subheader("Timeline drags")
                    if drag_rows:
                        for row in drag_rows:
                            st.write(
                                f"- **{row['Category']}** is up {money(row['Trend'])} versus last month, "
                                "which reduces goal acceleration unless another category comes down."
                            )
                    else:
                        st.write("No major month-over-month spending drags detected.")

                    if recurring:
                        st.markdown("**Recurring patterns**")
                        for pattern in recurring[:3]:
                            st.caption(
                                f"{pattern['Merchant']} appears {int(pattern['Transactions'])} times in "
                                f"{pattern['Category']} for {money(pattern['Monthly total'])} this month."
                            )

            st.subheader("Recommended cuts")
            if best_rows:
                cut_rows = []
                for row in best_rows:
                    cut_rows.append(
                        {
                            "Category": row["Category"],
                            "Role": row["Flexibility"].title(),
                            "Monthly spend": money(row["Monthly spend"]),
                            "Monthly opportunity": money(row["Suggested cut"]),
                            "Why it matters": row["Insight"],
                        }
                    )
                st.dataframe(pd.DataFrame(cut_rows), width="stretch", hide_index=True)
            else:
                st.info("Mark more categories as Flexible in Budget Planner to unlock cut recommendations.")

            with st.expander("Show category details"):
                display_rows = []
                for row in rows:
                    trend = row["Trend"]
                    trend_text = "No previous month"
                    if trend is not None:
                        if abs(float(trend)) < 0.01:
                            trend_text = "Flat"
                        else:
                            direction = "up" if trend > 0 else "down"
                            trend_text = f"{direction} {money(abs(trend))}"
                    display_rows.append(
                        {
                            "Category": row["Category"],
                            "Monthly spend": money(row["Monthly spend"]),
                            "Weekly avg": money(row["Weekly average"]),
                            "% of spend": f"{row['% of spend']:.1f}%",
                            "Trend": trend_text,
                            "Flexibility": row["Flexibility"],
                            "Suggested cut": money(row["Suggested cut"]),
                        }
                    )
                st.dataframe(pd.DataFrame(display_rows), width="stretch", hide_index=True)
    except Exception as e:
        st.error("Could not load spending intelligence.")
        st.code(str(e))

elif page == "Budget Planner":
    st.subheader("Budget Planner")
    st.caption("Use past spending as context, then create the future budget you plan to follow.")
    try:
        active_budget = api_get_budget_active()
    except Exception:
        active_budget = {"income_amount": 3200.0, "allocations": {}}
    active_budget_summary = budget_summary_defaults(active_budget)

    # Baseline = what happened. It is read-only and comes from transaction history.
    try:
        baseline_transactions = api_get_all_transactions()
        month_baseline_transactions = [
            tx for tx in baseline_transactions
            if month_start <= parse_tx_date(tx) <= month_end
        ]
    except Exception:
        baseline_transactions = []
        month_baseline_transactions = []
    baseline_totals = spending_totals_by_category(month_baseline_transactions)
    income_sources, detected_income = detect_income_sources(
        baseline_transactions,
        month_start,
        month_end,
        fallback_income=float(active_budget_summary["income"] or 0.0),
    )
    default_manual_income = float(active_budget_summary["income"] or detected_income or 3200.0)
    st.session_state.setdefault("planner_manual_income", default_manual_income)
    if detected_income > 0 and "planner_income_defaulted_to_detected" not in st.session_state:
        st.session_state.planner_use_detected_income = True
        st.session_state.planner_income_defaulted_to_detected = True
    st.session_state.setdefault("planner_use_detected_income", detected_income > 0)
    use_detected_income = st.toggle(
        "Use detected income",
        key="planner_use_detected_income",
        disabled=detected_income <= 0,
    )
    if use_detected_income and detected_income > 0:
        st.caption(f"Using detected income: {money(detected_income)}")
        manual_income = float(st.session_state.get("planner_manual_income", default_manual_income))
        income_amount = float(detected_income)
    else:
        manual_income = st.number_input(
            "Manual income override",
            min_value=0.0,
            step=100.0,
            key="planner_manual_income",
            help="Use this when paycheck detection is incomplete or your next month will be different.",
        )
        income_amount = float(manual_income)
    ensure_category_roles()

    budget_category_order = SIMPLE_BUDGET_CATEGORIES
    display_category_map = RAW_TO_SIMPLE_CATEGORY
    raw_categories_by_budget_category = {
        category: [
            raw_category
            for raw_category, budget_category in display_category_map.items()
            if budget_category == category
        ]
        for category in budget_category_order
    }
    role_rank = {"flexible": 0, "essential": 1, "protected": 2}
    budget_baselines = {category: 0.0 for category in budget_category_order}
    budget_roles = {category: "flexible" for category in budget_category_order}
    for raw_category in BUDGET_CATEGORIES:
        budget_category = display_category_map.get(raw_category, "Other")
        budget_baselines[budget_category] += float(baseline_totals.get(raw_category, 0.0))
        raw_role = category_role(raw_category)
        if role_rank[raw_role] > role_rank[budget_roles[budget_category]]:
            budget_roles[budget_category] = raw_role

    protected_categories = [category for category, role in budget_roles.items() if role == "protected"]
    essential_categories = [category for category, role in budget_roles.items() if role == "essential"]
    flexible_categories = [category for category, role in budget_roles.items() if role == "flexible"]
    protected_total = sum(float(budget_baselines.get(category, 0.0)) for category in protected_categories)
    essential_total = sum(float(budget_baselines.get(category, 0.0)) for category in essential_categories)
    protected_essential_baseline = protected_total + essential_total
    flexible_baseline_total = sum(float(budget_baselines.get(category, 0.0)) for category in flexible_categories)
    total_spending = protected_essential_baseline + flexible_baseline_total
    available_after_essentials = income_amount - protected_essential_baseline

    # Goal requirement = the savings pace needed to afford the active goal by its target date.
    active_goal = st.session_state.get("goal_plan", {}) or {}
    goal_name = str(active_goal.get("goal_name") or "your goal")
    goal_cost = float(active_goal.get("goal_cost", 0.0) or 0.0)
    goal_saved = float(active_goal.get("progress", 0.0) or 0.0)
    goal_target = canonical_target_date(active_goal.get("target_date", today + datetime.timedelta(days=90)))
    remaining_goal = max(0.0, goal_cost - goal_saved)
    weeks_until_goal = max(1.0, (goal_target - today).days / 7)
    required_weekly_goal_savings = float(active_goal.get("weekly_needed", 0.0) or 0.0)
    if required_weekly_goal_savings <= 0 and remaining_goal > 0:
        required_weekly_goal_savings = remaining_goal / weeks_until_goal
    required_monthly_goal_savings = required_weekly_goal_savings * 4.33

    initial_allocations = {}
    for category in budget_category_order:
        safe_category = category.lower().replace(" ", "_").replace("/", "_").replace("&", "and")
        input_key = f"future_budget_{month_start.isoformat()}_{safe_category}"
        st.session_state.setdefault(input_key, float(budget_baselines.get(category, 0.0)))
        initial_allocations[category] = float(st.session_state.get(input_key, 0.0))
    initial_future_budget_total = sum(initial_allocations.values())
    initial_available_for_goals = income_amount - initial_future_budget_total

    st.markdown("**Summary**")
    summary_cols = st.columns(4)
    summary_cols[0].metric("Monthly income", money(income_amount))
    summary_cols[1].metric("Planned future spending", money(initial_future_budget_total))
    summary_cols[2].metric("Available for goals", money(initial_available_for_goals))
    summary_cols[3].metric("Goal target date", goal_target.strftime("%b %-d, %Y"))
    st.caption("Byable helps you shape a plan: income minus planned future spending equals what is available for your goals.")
    st.info(f"{money(initial_available_for_goals)} is available for goals under your current plan.")

    recurring_patterns = recurring_subscription_patterns(baseline_transactions)
    recurring_keys = {pattern["Key"] for pattern in recurring_patterns}
    low_confidence_count = sum(
        1
        for tx in month_baseline_transactions
        if float(tx.get("amount", 0.0)) < 0
        and transaction_confidence(tx, recurring_keys) in {"Review recommended", "Some transactions may need confirmation"}
    )

    st.markdown("**Future budget editor**")
    st.caption("This is the core workspace. Start from your baseline, then shape the plan you actually want to follow.")
    st.caption("Protected = difficult to reduce • Essential = necessary spending • Flexible = easiest to adjust")
    role_counts = {
        "protected": sum(1 for role in budget_roles.values() if role == "protected"),
        "essential": sum(1 for role in budget_roles.values() if role == "essential"),
        "flexible": sum(1 for role in budget_roles.values() if role == "flexible"),
    }
    st.caption(
        f"{role_counts['flexible']} flexible categories • "
        f"{role_counts['essential']} essential • {role_counts['protected']} protected"
    )
    with st.expander("Category role controls"):
        st.caption("Each category has exactly one role. Protected categories are locked from cuts unless you unlock them below.")
        role_header = st.columns([1.5, 0.8, 2.1])
        role_header[0].caption("Category")
        role_header[1].caption("Current role")
        role_header[2].caption("Set role")
        for category in budget_category_order:
            current_role = budget_roles.get(category, "flexible")
            row_cols = st.columns([1.5, 0.8, 2.1])
            row_cols[0].write(category)
            row_cols[1].write(current_role.title())
            role_buttons = row_cols[2].columns(3)
            for role_idx, role in enumerate(CATEGORY_ROLE_OPTIONS):
                if role_buttons[role_idx].button(
                    role.title(),
                    key=f"planner_role_{category}_{role}",
                    type="primary" if current_role == role else "secondary",
                    width="stretch",
                ):
                    for raw_category in raw_categories_by_budget_category.get(category, []):
                        set_category_role(raw_category, role)
                    st.rerun()
    unlock_protected = st.checkbox(
        "Unlock protected categories",
        key="planner_unlock_protected",
        help="Protected categories cannot be cut unless this is enabled.",
    )
    if st.button("Reset all to baseline"):
        for category in budget_category_order:
            safe_category = category.lower().replace(" ", "_").replace("/", "_").replace("&", "and")
            st.session_state[f"future_budget_{month_start.isoformat()}_{safe_category}"] = float(
                budget_baselines.get(category, 0.0)
            )
        st.rerun()
    if st.button("Apply recommended cuts"):
        current_future_total = sum(
            float(st.session_state.get(
                f"future_budget_{month_start.isoformat()}_{category.lower().replace(' ', '_').replace('/', '_').replace('&', 'and')}",
                budget_baselines.get(category, 0.0),
            ))
            for category in budget_category_order
        )
        current_available_for_goal = income_amount - current_future_total
        amount_to_find = max(0.0, required_monthly_goal_savings - current_available_for_goal)
        remaining_to_cut = amount_to_find
        cut_total = 0.0
        flexible_cut_candidates = sorted(
            [
                (
                    category,
                    float(st.session_state.get(
                        f"future_budget_{month_start.isoformat()}_{category.lower().replace(' ', '_').replace('/', '_').replace('&', 'and')}",
                        budget_baselines.get(category, 0.0),
                    )),
                    float(budget_baselines.get(category, 0.0)),
                )
                for category in budget_category_order
                if budget_roles.get(category, "flexible") == "flexible"
            ],
            key=lambda item: item[1],
            reverse=True,
        )
        cut_details = []
        for category, current_amount, baseline_amount in flexible_cut_candidates:
            if remaining_to_cut <= 0:
                break
            safe_category = category.lower().replace(" ", "_").replace("/", "_").replace("&", "and")
            input_key = f"future_budget_{month_start.isoformat()}_{safe_category}"
            floor_amount = baseline_amount * 0.50
            available_cut = max(0.0, current_amount - floor_amount)
            cut_amount = min(available_cut, remaining_to_cut)
            if cut_amount <= 0:
                continue
            st.session_state[input_key] = max(floor_amount, current_amount - cut_amount)
            remaining_to_cut -= cut_amount
            cut_total += cut_amount
            cut_details.append((category, cut_amount))
        if cut_total > 0:
            changed_categories = [category for category, _ in cut_details]
            st.session_state.planner_recent_cut_categories = changed_categories
            if len(cut_details) == 1:
                category, amount = cut_details[0]
                st.session_state.planner_cut_message = f"Reduced {category} by {money(amount)} to keep the goal on track."
            else:
                detail_text = " and ".join(f"{category} by {money(amount)}" for category, amount in cut_details[:3])
                extra_count = max(0, len(cut_details) - 3)
                if extra_count:
                    detail_text += f" and {extra_count} more"
                st.session_state.planner_cut_message = f"Reduced {detail_text} to keep the goal on track."
        else:
            st.session_state.planner_recent_cut_categories = []
            st.session_state.planner_cut_message = "No additional flexible cuts are available under the 50% baseline floor."
        st.rerun()
    if st.session_state.get("planner_cut_message"):
        cut_message = st.session_state.pop("planner_cut_message")
        if cut_message.startswith("Reduced"):
            st.success(f"Recommendations applied. {cut_message}")
        else:
            st.caption(cut_message)

    # Future budget = the user's plan. It changes only through manual edits or explicit quick actions.
    allocations = {}
    category_rows = []
    header_cols = st.columns([1.25, 0.9, 1.0, 0.8, 1.35])
    header_cols[0].caption("Category")
    header_cols[1].caption("Current baseline")
    header_cols[2].caption("Planned future budget")
    header_cols[3].caption("Monthly change")
    header_cols[4].caption("Quick actions")
    for category in budget_category_order:
        baseline_amount = float(budget_baselines.get(category, 0.0))
        role = budget_roles.get(category, "flexible")
        safe_category = category.lower().replace(" ", "_").replace("/", "_").replace("&", "and")
        input_key = f"future_budget_{month_start.isoformat()}_{safe_category}"
        st.session_state.setdefault(input_key, baseline_amount)
        is_protected_locked = role == "protected" and not unlock_protected
        if is_protected_locked and float(st.session_state.get(input_key, 0.0)) < baseline_amount:
            st.session_state[input_key] = baseline_amount
        row_cols = st.columns([1.25, 0.9, 1.0, 0.8, 1.35])
        row_cols[0].write(f"**{category}**")
        row_cols[0].caption(f"{role.title()} · {role_microcopy(role)}")
        row_cols[1].write(money(baseline_amount))
        with row_cols[2]:
            allocations[category] = st.number_input(
                "My future budget",
                min_value=0.0,
                step=25.0,
                key=input_key,
                disabled=is_protected_locked,
                help="This is what you plan to spend going forward.",
                label_visibility="collapsed",
            )
        difference = float(allocations[category]) - baseline_amount
        row_cols[3].write(monthly_change_text(difference))
        action_cols = row_cols[4].columns(3)
        cut_disabled = is_protected_locked or baseline_amount <= 0
        if action_cols[0].button("Cut 10%", key=f"cut_10_{safe_category}", disabled=cut_disabled):
            st.session_state[input_key] = max(0.0, baseline_amount * 0.90)
            st.rerun()
        if action_cols[1].button("Cut 25%", key=f"cut_25_{safe_category}", disabled=cut_disabled):
            st.session_state[input_key] = max(0.0, baseline_amount * 0.75)
            st.rerun()
        if action_cols[2].button("Reset", key=f"reset_{safe_category}"):
            st.session_state[input_key] = baseline_amount
            st.rerun()
        category_rows.append(
            {
                "Category": category,
                "Role": role.title(),
                "Current baseline": money(baseline_amount),
                "My future budget": money(allocations[category]),
                "Monthly change": monthly_change_text(float(allocations[category]) - baseline_amount),
            }
        )
    with st.expander("Detailed budget table"):
        st.dataframe(pd.DataFrame(category_rows), width="stretch", hide_index=True)
    st.session_state.pop("planner_recent_cut_categories", None)

    # Goal impact = whether the user's future budget creates enough room for the target date.
    future_budget_total = sum(float(value) for value in allocations.values())
    monthly_available_for_goal = income_amount - future_budget_total
    surplus_or_shortfall = monthly_available_for_goal - required_monthly_goal_savings
    projected_affordability_date = None
    if monthly_available_for_goal > 0 and remaining_goal > 0:
        projected_weeks = remaining_goal / (monthly_available_for_goal / 4.33)
        projected_affordability_date = today + datetime.timedelta(days=round(projected_weeks * 7))
    elif remaining_goal <= 0:
        projected_affordability_date = today

    st.markdown("**Goal outcome**")
    if goal_cost > 0:
        st.caption(
            f"To afford {goal_name} by {goal_target.strftime('%b %-d, %Y')}, "
            f"you need about {money(required_monthly_goal_savings)}/month."
        )
    else:
        st.info("Build a goal in Goal Command Center first. Budget Planner will show how much room your future budget creates.")
    impact_cols = st.columns(4)
    plan_status = "On track" if surplus_or_shortfall >= 0 else "Needs a little more room"
    impact_cols[0].metric("Required monthly savings", money(required_monthly_goal_savings))
    impact_cols[1].metric("Available for goals", money(monthly_available_for_goal))
    impact_cols[2].metric("Projected affordability date", projected_date_label(projected_affordability_date))
    impact_cols[3].metric("Plan status", plan_status)
    affordability_progress = 1.0
    if required_monthly_goal_savings > 0:
        affordability_progress = max(0.0, min(1.0, monthly_available_for_goal / required_monthly_goal_savings))
    st.progress(affordability_progress)
    if surplus_or_shortfall >= 0:
        if goal_name and goal_name != "your goal":
            outcome_title = f"On track for {goal_name}"
        else:
            outcome_title = "On track for your goal"
        projected_text = projected_date_label(projected_affordability_date)
        outcome_detail = (
            f"Projected affordability date: {projected_text}."
            if surplus_or_shortfall < 1
            else f"Ahead by {money(surplus_or_shortfall)}/month. Projected affordability date: {projected_text}."
        )
    else:
        outcome_title = "A small adjustment gets this closer"
        outcome_detail = f"Find {money(abs(surplus_or_shortfall))}/month more to fully fund this goal."
    if surplus_or_shortfall >= 0:
        st.success(f"{outcome_title}\n\n{outcome_detail}")
    else:
        st.info(f"{outcome_title}\n\n{outcome_detail}")
    budget_insights = build_budget_insights(
        budget_baselines,
        allocations,
        budget_roles,
        income_amount,
        remaining_goal,
        monthly_available_for_goal,
        projected_affordability_date,
    )
    if budget_insights:
        st.markdown("**Budget insights**")
        for insight in budget_insights:
            st.caption(f"- {insight}")

    st.markdown("**AI Coach**")
    st.caption("Optional guidance based on the budget numbers already calculated above. Byable keeps the math here as the source of truth.")
    coach_category_table = [
        {
            "category": category,
            "baseline": round(float(budget_baselines.get(category, 0.0)), 2),
            "future_budget": round(float(allocations.get(category, 0.0)), 2),
            "monthly_change": round(float(allocations.get(category, 0.0)) - float(budget_baselines.get(category, 0.0)), 2),
            "role": budget_roles.get(category, "flexible"),
        }
        for category in budget_category_order
    ]
    coach_gap = float(monthly_available_for_goal) - float(required_monthly_goal_savings)
    coach_payload = {
        "monthly_income": round(float(income_amount), 2),
        "planned_future_spending": round(float(future_budget_total), 2),
        "available_for_goals": round(float(monthly_available_for_goal), 2),
        "goal_name": goal_name,
        "goal_cost": round(float(goal_cost), 2),
        "target_date": goal_target.isoformat(),
        "required_monthly_savings": round(float(required_monthly_goal_savings), 2),
        "monthly_surplus_or_shortfall": round(coach_gap, 2),
        "goal_status_from_lantern": "on track" if coach_gap >= 0 else "short",
        "protected_cuts_enabled": bool(unlock_protected),
        "transaction_confidence_low": bool(low_confidence_count),
        "category_baseline_and_future_budget_table": coach_category_table,
        "categories": {
            "protected": [category for category, role in budget_roles.items() if role == "protected"],
            "essential": [category for category, role in budget_roles.items() if role == "essential"],
            "flexible": [category for category, role in budget_roles.items() if role == "flexible"],
        },
    }
    coach_key = ai_coach_cache_key(coach_payload)
    ai_coach_cache = st.session_state.setdefault("ai_coach_cache", {})
    openai_api_key = get_openai_api_key()
    if DEV_MODE:
        show_ai_key_detection(openai_api_key)
    if not openai_api_key:
        show_missing_ai_key_sources()
        st.button("Generate AI coach advice", disabled=True)
    elif st.button("Generate AI coach advice"):
        if coach_key not in ai_coach_cache:
            try:
                with st.spinner("Generating coach advice..."):
                    ai_coach_cache[coach_key] = generate_ai_coach_advice(openai_api_key, coach_payload)
            except Exception as e:
                st.error("AI Coach could not generate advice right now.")
                st.code(str(e))
            if coach_key in ai_coach_cache and not ai_coach_cache[coach_key].get("success", True):
                st.error(ai_coach_cache[coach_key].get("error", "AI returned invalid structured data."))
                show_ai_debug_response(ai_coach_cache[coach_key].get("raw_response", ""))
        st.session_state.active_ai_coach_key = coach_key
    active_coach_key = st.session_state.get("active_ai_coach_key")
    if active_coach_key == coach_key and coach_key in ai_coach_cache:
        coach_advice = ai_coach_cache[coach_key]
        if not coach_advice.get("success", True):
            st.error(coach_advice.get("error", "AI returned invalid structured data."))
            show_ai_debug_response(coach_advice.get("raw_response", ""))
        else:
            st.write(f"**Goal status:** {coach_advice.get('status', 'Review the current plan.')}")
            st.write(coach_advice.get("summary", "This guidance uses Byable's current budget numbers."))
            st.markdown("**Recommended actions**")
            for idx, action in enumerate(coach_advice["recommended_actions"][:3], start=1):
                st.write(f"{idx}. {action}")
            watch = coach_advice.get("categories_to_watch") or []
            st.markdown("**Categories to watch**")
            st.write(", ".join(watch) if watch else "No specific categories flagged.")
            if coach_advice.get("confidence_warning"):
                st.warning(coach_advice["confidence_warning"])
    st.caption(
        f"{money(income_amount)} monthly income - {money(future_budget_total)} future budget "
        f"= {money(monthly_available_for_goal)} available for the goal."
    )

    save_budget = st.button("Save budget", type="primary", width="stretch")
    if save_budget:
        try:
            with st.spinner("Saving..."):
                future_protected_essential = sum(
                    float(allocations.get(category, 0.0))
                    for category, role in budget_roles.items()
                    if role in {"protected", "essential"}
                )
                future_flexible_budget = sum(
                    float(allocations.get(category, 0.0))
                    for category, role in budget_roles.items()
                    if role == "flexible"
                )
                api_save_budget(
                    "monthly",
                    income_amount,
                    allocations,
                    essential_spending=future_protected_essential,
                    flexible_spending_limit=future_flexible_budget,
                    protected_categories=[category for category, role in budget_roles.items() if role == "protected"],
                    reducible_categories=[category for category, role in budget_roles.items() if role == "flexible"],
                )
            if hasattr(st, "toast"):
                st.toast("Budget saved.", icon="✓")
            st.success("Budget saved.")
        except Exception as e:
            st.error("Could not save budget.")
            st.code(str(e))

    st.markdown("**Transaction trust & review**")
    st.caption("Transaction history is a starting point. Confirm anything that looks off when you want to refine the baseline.")
    trust_cols = st.columns(3)
    trust_cols[0].metric("Transactions to review", str(low_confidence_count))
    trust_cols[1].metric("Recurring monthly charges", str(len(recurring_patterns)))
    trust_cols[2].metric("Review needed", "Yes" if low_confidence_count else "No")
    if low_confidence_count:
        st.caption("Some transactions may need confirmation.")
    with st.expander("Income sources detected"):
        if income_sources:
            income_df = pd.DataFrame(
                [
                    {
                        "Merchant/source": source["merchant"],
                        "Cadence": source["cadence"],
                        "Detected monthly amount": money(source["detected_monthly_amount"]),
                    }
                    for source in income_sources
                ]
            )
            st.dataframe(income_df, width="stretch", hide_index=True)
        else:
            st.caption("No payroll or income-like deposits were detected for this month.")
    with st.expander("Detailed baseline table"):
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Category": category,
                        "Role": budget_roles.get(category, "flexible").title(),
                        "Current monthly spend": money(budget_baselines.get(category, 0.0)),
                    }
                    for category in budget_category_order
                ]
            ),
            width="stretch",
            hide_index=True,
        )
    if recurring_patterns:
        with st.expander("Recurring subscriptions detected"):
            st.caption("Recurring monthly charges are separated from one-time spending.")
            for pattern in recurring_patterns[:6]:
                st.write(f"**{pattern['Merchant']}** · {money(pattern['Typical amount'])}/month · {pattern['Category']}")
    else:
        with st.expander("Recurring subscriptions detected"):
            st.caption("No recurring monthly charges found for this month.")
    with st.expander("Review or recategorize transactions behind this baseline"):
        st.caption("Edits here update Transaction History too. This keeps the future budget grounded in verified transactions.")
        review_rows = []
        for idx, tx in enumerate(baseline_transactions):
            tx_date = parse_tx_date(tx)
            if not (month_start <= tx_date <= month_end) or float(tx.get("amount", 0.0)) >= 0:
                continue
            review_rows.append(
                {
                    "row_id": idx,
                    "Date": tx_date,
                    "Merchant": str(tx.get("merchant", "")),
                    "Amount": abs(float(tx.get("amount", 0.0))),
                    "Category": simple_budget_category(tx.get("category", "Other")),
                    "Confidence": transaction_confidence(tx, recurring_keys),
                    "Why": categorization_explanation(tx),
                }
            )
        if review_rows:
            review_df = pd.DataFrame(review_rows).sort_values("Date", ascending=False)
            remember_budget_merchants = st.checkbox(
                "Remember merchant corrections",
                value=True,
                key="budget_remember_merchant_corrections",
                help="Apply this category to matching merchant names in future local transactions.",
            )
            edited_review_df = st.data_editor(
                review_df,
                width="stretch",
                hide_index=True,
                disabled=["row_id", "Date", "Merchant", "Amount", "Confidence", "Why"],
                column_config={
                    "row_id": None,
                    "Date": st.column_config.DateColumn("Date"),
                    "Amount": st.column_config.NumberColumn("Amount", min_value=0.0, step=0.01, format="$%.2f"),
                    "Category": st.column_config.SelectboxColumn("Category", options=SIMPLE_BUDGET_CATEGORIES),
                },
                key="budget_transaction_review_editor",
            )
            if st.button("Save transaction categories", type="primary"):
                updated_transactions = list(baseline_transactions)
                for _, row in edited_review_df.iterrows():
                    original_index = int(row["row_id"])
                    updated = dict(updated_transactions[original_index])
                    if remember_budget_merchants:
                        remember_merchant_category(row["Merchant"], row["Category"])
                    updated["category"] = SIMPLE_TO_RAW_CATEGORY.get(str(row["Category"]), "Other")
                    updated["source"] = "user"
                    updated_transactions[original_index] = updated
                save_local_transaction_updates(updated_transactions)
                st.success("Transaction categories updated. Baseline will refresh with your verified categories.")
                st.rerun()
        else:
            st.caption("No spending transactions found for this month.")

elif page == "Saved Plans":
    st.subheader("Saved goals")
    st.caption("Automatic progress tracking compares this week's discretionary spending against your recent baseline.")
    try:
        all_transactions = api_get_all_transactions()
        if not all_transactions:
            load_demo_transactions_if_needed()
            all_transactions = api_get_all_transactions()
        summary_preferences = dict(ensure_flexibility_preferences())
        summary_analysis = calculate_goal_analysis(
            transactions=all_transactions,
            selected_month=month_start,
            active_simulation=None,
            goal_cost=1.0,
            goal_progress=0.0,
            target_date=today + datetime.timedelta(days=7),
            weekly_target=0.0,
            flexibility_preferences=summary_preferences,
        )
    except Exception:
        all_transactions = []
        summary_analysis = {"category_deltas": [], "behaviorImprovement": 0.0}

    detected_weekly_savings = float(summary_analysis["behaviorImprovement"])
    top_changes = summary_analysis["category_deltas"]
    with st.container(border=True):
        metric_cols = st.columns([1, 2])
        metric_cols[0].metric(behavior_delta_label(detected_weekly_savings), behavior_delta_value(detected_weekly_savings))
        with metric_cols[1]:
            if top_changes:
                for row in top_changes:
                    st.caption(savings_detection_sentence(row))
            else:
                st.caption("No meaningful spending change detected yet this week.")

    try:
        saved_goal_plans = api_get_goals()
    except Exception as e:
        saved_goal_plans = []
        st.error("Could not load saved goals.")
        st.code(str(e))
    if not saved_goal_plans:
        st.write("No saved plans yet. Build a plan on the main page and save it here.")
    else:
        for idx, saved_plan in enumerate(saved_goal_plans):
            with st.container(border=True):
                top = st.columns([1.4, 0.9, 0.9])
                top[0].markdown(f"**{saved_plan['goal_name']}**")
                top[1].write(f"Target: {money(saved_plan['target_amount'])}")
                top[2].write(f"By: {saved_plan['target_date']}")
                target_amount = float(saved_plan["target_amount"])
                target_date = datetime.datetime.strptime(saved_plan["target_date"], "%Y-%m-%d").date()
                weeks_left = max(1.0, (target_date - today).days / 7)
                saved_preferences = dict(ensure_flexibility_preferences())
                analysis = calculate_goal_analysis(
                    transactions=all_transactions,
                    selected_month=month_start,
                    active_simulation=None,
                    goal_cost=target_amount,
                    goal_progress=float(saved_plan.get("progress", 0.0)),
                    target_date=target_date,
                    weekly_target=float(saved_plan["weekly_needed"]),
                    flexibility_preferences=saved_preferences,
                )
                analysis = apply_budget_goal_progress(
                    analysis,
                    api_get_budget_active(),
                    all_transactions,
                    target_amount,
                    float(saved_plan.get("progress", 0.0)),
                    target_date,
                )
                st.progress(min(1.0, analysis["effective_progress_amount"] / max(1.0, target_amount)))
                goal_cols = st.columns(4)
                goal_cols[0].metric("Goal progress", money(analysis["effective_progress_amount"]))
                goal_cols[1].metric("Remaining", money(analysis["remaining"]))
                goal_cols[2].metric("Current projection", projected_date_label(analysis["projectedDate"]))
                goal_cols[3].metric("Weekly pace", money(analysis["savedTowardGoalThisWeek"]))
                if analysis["behaviorImprovement"] < 0:
                    st.caption(f"Spending is {money(abs(analysis['behaviorImprovement']))} above normal this week.")
                gap_text = (
                    f"{money(analysis['gapVsTarget'])}/week ahead"
                    if analysis["gapVsTarget"] >= 0
                    else f"{money(abs(analysis['gapVsTarget']))}/week needed"
                )
                st.caption(f"{analysis['trajectoryStatus']}. Weekly target: {money(analysis['weeklyTarget'])}. Pace gap: {gap_text}.")
                slowing = [row for row in analysis["category_deltas"] if row["Estimated savings"] < -1]
                successful = [row for row in analysis["category_deltas"] if row["Estimated savings"] > 1]
                if successful:
                    st.caption(f"{successful[0]['Category']} reductions are tracking successfully.")
                if slowing:
                    st.caption(f"{slowing[0]['Category']} spend is slowing goal progress.")
                if saved_plan.get("recommendations"):
                    with st.expander("Recommended actions"):
                        for row in saved_plan["recommendations"][:3]:
                            st.write(f"- {row.get('Recommendation', row['Category'])}")

if not show_legacy_tools:
    st.stop()


# -----------------------------
# Tabs
# -----------------------------
tab_budget, tab_insights, tab_report, tab_forecast = st.tabs(
    ["Budget", "Insights", "Budget Report", "Forecast"]
)


# ============================================================
# Budget tab
# ============================================================
with tab_budget:
    st.subheader("Saved Budget")

    col1, col2 = st.columns(2)

    with col1:
        if st.button("Load Saved Budget"):
            try:
                b = api_get_budget_active()
                st.session_state["saved_period"] = b.get("period")
                st.session_state["saved_income"] = b.get("income_amount")
                st.session_state["saved_allocs"] = b.get("allocations", {})
                st.success("✅ Loaded saved budget.")
                st.write(f"Period: **{b.get('period', '').title()}**")
                st.write(f"Income: **${float(b.get('income_amount', 0.0)):,.2f}**")
                allocs = b.get("allocations", {}) or {}
                if allocs:
                    alloc_df = pd.DataFrame(
                        [{"Category": k, "Budget": float(v)} for k, v in allocs.items()]
                    ).sort_values("Category")
                    alloc_df["Budget"] = alloc_df["Budget"].map(lambda x: f"${x:,.2f}")
                    st.dataframe(alloc_df, use_container_width=True)
            except Exception as e:
                st.warning("No saved budget found yet.")
                st.caption("Local fallback mode is active.")

    with col2:
        if st.button("Clear Loaded Budget"):
            st.session_state.pop("saved_period", None)
            st.session_state.pop("saved_income", None)
            st.session_state.pop("saved_allocs", None)
            st.success("Cleared loaded budget from UI state (DB unchanged).")

    st.divider()
    st.subheader("Budget Setup")

    budget_mode = "Monthly"
    period = "monthly"

    saved_income = st.session_state.get("saved_income")
    income_default = float(saved_income) if saved_income is not None else 3200.0

    income_amount = st.number_input(
        f"Your {budget_mode.lower()} take-home income ($)",
        min_value=0.0,
        value=income_default,
        step=100.0,
    )

    st.caption("Budgets below are suggested from income. Changes automatically flow into Savings.")
    st.subheader(f"Budgets ({budget_mode})")

    saved_allocs = st.session_state.get("saved_allocs", {})
    budgets = {}

    # Seed inputs once so Streamlit keeps them in sync
    for cat in SPEND_CATEGORIES:
        key = f"budget_{cat}"
        if key not in st.session_state:
            recommended = float(round(income_amount * RECOMMENDED_PCT.get(cat, 0.0), 2))
            st.session_state[key] = float(saved_allocs.get(cat, recommended))

    st.subheader("Category Budgets")
    cols = st.columns(3)
    for i, cat in enumerate(SPEND_CATEGORIES):
        with cols[i % 3]:
            budgets[cat] = st.number_input(
                f"{cat} budget ($)",
                min_value=0.0,
                value=float(st.session_state.get(f"budget_{cat}", 0.0)),
                step=10.0,
                key=f"budget_{cat}",
            )

    # Savings is the residual so reductions elsewhere flow here automatically
    other_total = sum(float(st.session_state.get(f"budget_{cat}", 0.0)) for cat in SPEND_CATEGORIES)
    savings_value = max(0.0, float(income_amount) - other_total)
    st.session_state["budget_Savings"] = float(round(savings_value, 2))

    st.subheader("Summary")
    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Income", f"${income_amount:,.2f}")
    with c2:
        st.metric("Allocated (excl. savings)", f"${other_total:,.2f}")
    with c3:
        st.metric("Savings", f"${st.session_state['budget_Savings']:,.2f}")

    if other_total > float(income_amount):
        st.warning("Your category budgets exceed income. Savings set to $0.")

    st.caption("Savings is auto-calculated as income minus all other category budgets.")
    budgets[SAVINGS_CATEGORY] = st.number_input(
        "Savings ($)",
        min_value=0.0,
        value=float(st.session_state.get("budget_Savings", 0.0)),
        step=10.0,
        key="budget_Savings",
        disabled=True,
    )

    if st.button("Save Budget"):
        try:
            out = api_save_budget(period, income_amount, budgets)
            st.session_state["saved_period"] = out.get("period")
            st.session_state["saved_income"] = out.get("income_amount")
            st.session_state["saved_allocs"] = out.get("allocations", {})
            st.success("✅ Budget saved.")
            st.write(f"Period: **{out.get('period', '').title()}**")
            st.write(f"Income: **${float(out.get('income_amount', 0.0)):,.2f}**")
            allocs = out.get("allocations", {}) or {}
            if allocs:
                alloc_df = pd.DataFrame(
                    [{"Category": k, "Budget": float(v)} for k, v in allocs.items()]
                ).sort_values("Category")
                alloc_df["Budget"] = alloc_df["Budget"].map(lambda x: f"${x:,.2f}")
                st.dataframe(alloc_df, use_container_width=True)
        except Exception as e:
            st.info("The optional coach backend is not available in this deployment.")


# ============================================================
# Insights tab
# ============================================================
with tab_insights:
    st.subheader("Insights + Trends")
    st.caption(f"Showing {month_start.strftime('%B %Y')}")

    if "insight_question" not in st.session_state:
        st.session_state.insight_question = ""
    if "insight_ask_now" not in st.session_state:
        st.session_state.insight_ask_now = False
    if "insights_status_key" not in st.session_state:
        st.session_state.insights_status_key = ""
    if "insights_status_line" not in st.session_state:
        st.session_state.insights_status_line = ""

    # Proactive status line (lightweight)
    status_key = f"{st.session_state.user_id}:{as_of_str}:monthly"
    if BASE_URL and st.session_state.insights_status_key != status_key:
        try:
            bundle_resp = requests.get(
                f"{BASE_URL}/insight_bundle",
                params={
                    "user_id": st.session_state.user_id,
                    "period": "monthly",
                    "as_of": as_of_str,
                },
                timeout=6,
            )
            if bundle_resp.ok:
                bundle = bundle_resp.json() or {}
                report = bundle.get("budget_report", {}) or {}
                over = report.get("over_budget", []) or []
                near = report.get("near_budget", []) or []

                if over:
                    st.session_state.insights_status_line = f"You're over budget in {len(over)} categories."
                elif near:
                    st.session_state.insights_status_line = "One thing needs attention this week."
                else:
                    st.session_state.insights_status_line = "Nothing urgent this month."
                st.session_state.insights_status_key = status_key
        except Exception:
            pass

    if st.session_state.insights_status_line:
        st.caption(st.session_state.insights_status_line)

    def set_insight_question(question: str):
        st.session_state.insight_question = question
        st.session_state.insight_ask_now = True

    beginner_mode = st.toggle("Beginner mode", value=True, key="insights_beginner_mode")
    st.text_input("Ask Insighta", key="insight_question")
    helper_text = (
        "I'll explain what's happening with your money and what matters most right now."
        if beginner_mode
        else "I analyze your transactions, find what changed, and help you decide what to do next."
    )
    st.caption(helper_text)

    cols = st.columns(4)
    cols[0].button(
        "Explain this month",
        on_click=set_insight_question,
        args=("Explain this month",),
    )
    cols[1].button(
        "Why is Food higher?",
        on_click=set_insight_question,
        args=("Why is Food higher?",),
    )
    cols[2].button(
        "What should I change this week?",
        on_click=set_insight_question,
        args=("What should I change this week?",),
    )

    afford_cols = st.columns([2, 1])
    afford_amount = afford_cols[0].number_input(
        "Amount ($)",
        min_value=0.0,
        step=5.0,
        value=25.0,
        key="afford_amount",
    )
    afford_cols[1].write("")
    afford_cols[1].button(
        "Can I afford $X?",
        on_click=set_insight_question,
        args=(f"Can I afford ${float(afford_amount):.2f}?",),
    )

    ask_clicked = st.button("Ask") or st.session_state.insight_ask_now
    if ask_clicked:
        st.session_state.insight_ask_now = False
        if not BASE_URL:
            st.subheader("Coach Response")
            st.write("Use the affordability planner above for local goal coaching. Optional conversational insights need a backend URL.")
            st.caption("The deployed MVP still works for transaction history, simulations, and goal affordability without FastAPI.")
            raise RuntimeError("Optional backend disabled")
        try:
            bundle_resp = requests.get(
                f"{BASE_URL}/insights_bundle",
                params={
                    "user_id": st.session_state.user_id,
                    "period": "monthly",
                    "as_of": as_of_str,
                },
                timeout=10,
            )
            if not bundle_resp.ok:
                show_http_error(bundle_resp)
                raise RuntimeError("GET /insights_bundle failed")

            bundle = bundle_resp.json()

            coach_resp = requests.post(
                f"{BASE_URL}/coach/respond",
                json={
                    "question": st.session_state.insight_question,
                    "beginner_mode": beginner_mode,
                    "bundle": bundle,
                },
                timeout=10,
            )
            if not coach_resp.ok:
                show_http_error(coach_resp)
                raise RuntimeError("POST /coach/respond failed")

            coach = coach_resp.json() or {}
            st.subheader("Coach Response")
            st.write(coach.get("headline", ""))
            why_items = coach.get("why", []) or []
            if why_items:
                st.markdown("**Why**")
                for item in why_items[:3]:
                    st.write(f"- {item}")
            action = coach.get("action", "")
            if action:
                st.markdown("**1 Action to Take**")
                st.write(action)
            data_note = coach.get("data_note", "")
            if data_note:
                st.caption(data_note)
        except Exception as e:
            st.info("Optional insight services are not available in this deployment.")

    insights_key = f"{st.session_state.user_id}:{as_of_str}:monthly:insights"
    if BASE_URL and st.session_state.get("insights_cache_key") != insights_key:
        try:
            resp = requests.get(
                f"{BASE_URL}/insights",
                params={"user_id": st.session_state.user_id, "period": "monthly", "as_of": as_of_str},
                timeout=10,
            )
            if not resp.ok:
                show_http_error(resp)
                raise RuntimeError("GET /insights failed")
            st.session_state.insights_cache = resp.json()
            st.session_state.insights_cache_key = insights_key

            t_resp = requests.get(
                f"{BASE_URL}/trends",
                params={"user_id": st.session_state.user_id, "period": "monthly", "as_of": as_of_str},
                timeout=10,
            )
            if not t_resp.ok:
                show_http_error(t_resp)
                raise RuntimeError("GET /trends failed")
            st.session_state.trends_cache = t_resp.json()
        except Exception as e:
            st.info("Optional forecast services are not available in this deployment.")

    insights = st.session_state.get("insights_cache", {})
    if insights:
        s = insights.get("summary", {})
        budget_income = float(insights.get("budget_income", 0.0))
        st.write(f"Income this month: ${budget_income:.2f}")
        st.write(f"Total spending: ${float(s.get('spending', 0.0)):.2f}")
        st.write(f"Net change: ${float(s.get('net', 0.0)):.2f}")

        st.write("Spending by category:")
        spend_map = insights.get("spending_by_category", {}) or {}
        if spend_map:
            spend_df = pd.DataFrame(
                [{"Category": k, "Spent": float(v)} for k, v in spend_map.items()]
            ).sort_values("Spent", ascending=False)
            spend_df["Spent"] = spend_df["Spent"].map(lambda x: f"${x:,.2f}")
            st.dataframe(spend_df, use_container_width=True)
        else:
            st.write("No spending by category yet.")

        msg = insights.get("coach_message", {})
        st.subheader("Coach Message")
        st.write(msg.get("net_msg", ""))
        st.write(msg.get("spending_msg", ""))
        st.write(msg.get("tip", ""))

        st.divider()
        st.subheader("Monthly Trends")

        t = st.session_state.get("trends_cache", {}) or {}
        st.write(t.get("message", ""))
        st.write(f"This month spending: ${float(t.get('this_period_spending', 0)):,.2f}")
        st.write(f"Last month spending: ${float(t.get('last_period_spending', 0)):,.2f}")

        spike_cat = t.get("biggest_spike_category")
        spike_amt = t.get("biggest_spike_amount", 0)
        if spike_cat:
            st.write(f"Biggest increase: {spike_cat} (+${spike_amt:.2f})")


# ============================================================
# Budget Report tab
# ============================================================
with tab_report:
    st.subheader("Budget Report (Month-to-date)")
    st.caption(f"Showing {month_start.strftime('%B %Y')}")
    report_period = "monthly"

    report_key = f"{st.session_state.user_id}:{as_of_str}:monthly:report"
    if st.session_state.get("report_cache_key") != report_key:
        try:
            as_of = as_of_str
            report = api_get_budget_report(report_period, as_of)
            st.session_state.report_cache = report
            st.session_state.report_cache_key = report_key
        except Exception as e:
            st.info("Budget report is unavailable in local fallback mode.")

    report = st.session_state.get("report_cache", {})
    rows = report.get("rows", [])

    if not rows:
        st.info("No saved budget found for this period. Save a budget first.")
    else:
        rep = pd.DataFrame(rows).rename(
            columns={
                "category": "Category",
                "budget": "Budget",
                "spent_ptd": "Spent (PTD)",
                "remaining": "Remaining",
                "pct_used": "% Used",
            }
        )

        rep_display = rep.copy()
        rep_display["Budget"] = rep_display["Budget"].map(lambda x: f"${float(x):,.0f}")
        rep_display["Spent (PTD)"] = rep_display["Spent (PTD)"].map(lambda x: f"${float(x):,.2f}")
        rep_display["Remaining"] = rep_display["Remaining"].map(lambda x: f"${float(x):,.2f}")
        rep_display["% Used"] = rep_display["% Used"].map(lambda x: f"{float(x):.0f}%")

        st.dataframe(rep_display, use_container_width=True)

        over = report.get("over_budget", [])
        near = report.get("near_budget", [])

        if over:
            st.error("Over budget: " + ", ".join(over))
        elif near:
            st.warning("Close to budget: " + ", ".join(near))
        else:
            st.success("Looking good — no categories near or over budget.")


# ============================================================
# Forecast tab
# ============================================================
with tab_forecast:
    st.subheader("Forecast (End of Month)")
    st.caption(f"Showing {month_start.strftime('%B %Y')}")
    forecast_period = "monthly"

    # --- starting balance (used for cash forecast)
    starting_balance = st.number_input(
        "Starting balance for this period ($)",
        value=0.0,
        step=50.0,
        key="starting_balance_forecast",
    )

    forecast_key = f"{st.session_state.user_id}:{as_of_str}:monthly:forecast:{float(starting_balance):.2f}"
    if st.session_state.get("forecast_cache_key") != forecast_key:
        try:
            as_of = as_of_str

            forecast = api_get_forecast(forecast_period, as_of)
            st.session_state.forecast_cache = forecast
            st.session_state.forecast_cache_key = forecast_key

            if BASE_URL:
                cash_resp = requests.get(
                    f"{BASE_URL}/forecast/cash",
                    params={
                        "user_id": st.session_state.user_id,
                        "period": forecast_period,
                        "as_of": as_of,
                        "starting_balance": float(starting_balance),
                    },
                    timeout=10,
                )
                if cash_resp.status_code != 200:
                    raise RuntimeError("Cash forecast request failed")
                st.session_state.cash_forecast_cache = cash_resp.json() or {}
            else:
                st.session_state.cash_forecast_cache = {}
        except Exception as e:
            st.info("Cash forecast is unavailable in local fallback mode.")

    forecast = st.session_state.get("forecast_cache", {}) or {}
    rows = forecast.get("rows", []) or []

    if not rows:
        st.info("No saved budget found for this period. Save a budget first.")
    else:
        st.subheader("Category Forecast")

        fdf = pd.DataFrame(rows).rename(
            columns={
                "category": "Category",
                "spent_to_date": "Spent (PTD)",
                "forecast_total": "Forecast Total",
                "budget": "Budget",
                "projected_over": "Projected Over",
            }
        )

        fdf_display = fdf.copy()
        for col in ["Spent (PTD)", "Forecast Total", "Budget", "Projected Over"]:
            if col in fdf_display.columns:
                fdf_display[col] = fdf_display[col].map(lambda x: f"${float(x):,.2f}")

        st.dataframe(fdf_display, use_container_width=True)

    st.divider()
    st.subheader("End-of-Period Cash Balance Forecast")

    cash = st.session_state.get("cash_forecast_cache", {}) or {}

    starting_balance_v = float(cash.get("starting_balance", 0.0))

    income_to_date = float(cash.get("income_to_date", 0.0))
    spending_to_date = float(cash.get("spending_to_date", 0.0))

    total_budget = float(cash.get("total_budget", 0.0))
    remaining_budget = float(cash.get("remaining_budget", 0.0))

    forecast_income_total = float(cash.get("forecast_income_total", 0.0))
    forecast_spending_total = float(cash.get("forecast_spending_total", 0.0))
    forecast_net_total = float(cash.get("forecast_net_total", 0.0))
    forecast_end_balance = float(cash.get("forecast_end_balance", 0.0))

    days_elapsed = int(cash.get("days_elapsed", 0))
    days_total = int(cash.get("days_total", 0))
    days_remaining = int(cash.get("days_remaining", 0))

    income_daily = float(cash.get("income_daily", 0.0))
    spend_daily_current = float(cash.get("spend_daily_current", 0.0))

    target_spend_daily_budget = float(cash.get("target_spend_daily_budget", 0.0))
    safe_to_spend_per_day_budget = float(cash.get("safe_to_spend_per_day_budget", 0.0))

    target_spend_to_date = target_spend_daily_budget * max(0, days_elapsed)
    above_pace_amount = spending_to_date - target_spend_to_date

    top_above_pace = cash.get("top_above_pace_categories", []) or []
    pace_series = cash.get("pace_series", []) or []

    if not top_above_pace and rows and days_total > 0 and above_pace_amount > 0:
        fallback = []
        for r in rows:
            budget = float(r.get("budget", 0.0))
            spent = float(r.get("spent_to_date", 0.0))
            pace_allowed = budget * (days_elapsed / days_total)
            above = spent - pace_allowed
            if above > 0:
                fallback.append(
                    {
                        "category": r.get("category", ""),
                        "above_pace": float(above),
                        "spent_to_date": float(spent),
                        "pace_allowed_to_date": float(pace_allowed),
                        "budget": float(budget),
                    }
                )
        fallback.sort(key=lambda x: x["above_pace"], reverse=True)
        top_above_pace = fallback[:2]

    summary_rows = [
        {"Metric": "Starting balance", "Value": starting_balance_v},
        {"Metric": "Income to date", "Value": income_to_date},
        {"Metric": "Spending to date", "Value": spending_to_date},
        {"Metric": "Total budget (period)", "Value": total_budget},
        {"Metric": "Remaining budget", "Value": remaining_budget},
        {"Metric": "Target pace (cumulative by today)", "Value": target_spend_to_date},
        {
            "Metric": "Top category above pace",
            "Value": float(top_above_pace[0]["above_pace"]) if top_above_pace else above_pace_amount,
        },
        {"Metric": "Safe to spend per day (rest of period)", "Value": safe_to_spend_per_day_budget},
        {"Metric": "Forecast income (total)", "Value": forecast_income_total},
        {"Metric": "Forecast spending (total)", "Value": forecast_spending_total},
        {"Metric": "Forecast net (total)", "Value": forecast_net_total},
        {"Metric": "Forecast end balance", "Value": forecast_end_balance},
    ]

    sdf = pd.DataFrame(summary_rows)
    sdf["Value"] = sdf["Value"].map(lambda x: f"${float(x):,.2f}")
    st.dataframe(sdf, use_container_width=True)

    st.caption(
        f"Budget pace uses {days_elapsed} of {days_total} days so far (cumulative target pace)."
    )

    # =========================
    # Pace chart (cumulative)
    # =========================
    st.divider()
    st.subheader("Cumulative Spend vs Target Pace")

    if pace_series:
        ps = pd.DataFrame(pace_series)
        # Expect: date, cum_spend, cum_target
        ps["date"] = pd.to_datetime(ps["date"], errors="coerce")
        ps = ps.dropna(subset=["date"]).sort_values("date")
        ps = ps.set_index("date")

        chart_df = ps[["cum_spend", "cum_target"]].copy()
        chart_df = chart_df.rename(columns={"cum_spend": "Actual (cumulative)", "cum_target": "Target (cumulative)"})
        st.line_chart(chart_df)
    else:
        st.info("No pace series available yet (save a budget and add some spending transactions).")

    # =========================
    # What this means + drivers
    # =========================
    st.divider()
    st.subheader("What this means")

    if total_budget <= 0:
        st.info(
            "Your total budget for this period is $0. Save a budget (with category allocations) to enable pace tracking and safe-to-spend guidance."
        )
    else:
        if above_pace_amount > 0:
            st.write(
                f"• Target pace so far: **${target_spend_to_date:,.2f}**\n"
                f"• Actual spending so far: **${spending_to_date:,.2f}**\n"
                f"• You are **${above_pace_amount:,.2f} above pace** right now.\n"
                f"• With **{days_remaining} days left**, your budget-based safe-to-spend is **${safe_to_spend_per_day_budget:,.2f}/day**."
            )
        else:
            st.write(
                f"• Target pace so far: **${target_spend_to_date:,.2f}**\n"
                f"• Actual spending so far: **${spending_to_date:,.2f}**\n"
                f"• You are **${abs(above_pace_amount):,.2f} under pace** right now.\n"
                f"• With **{days_remaining} days left**, your budget-based safe-to-spend is **${safe_to_spend_per_day_budget:,.2f}/day**."
            )

        st.caption(
            f"Current averages: income ≈ ${income_daily:,.2f}/day, spending ≈ ${spend_daily_current:,.2f}/day."
        )

        # Top 2 categories driving overspending (most above pace right now)
        st.subheader("Most above pace right now (Top 2)")

        if top_above_pace:
            driver_rows = []
            for item in top_above_pace[:2]:
                pace_allowed = item.get("pace_allowed_to_date", item.get("pace_allowed", 0.0))
                driver_rows.append(
                    {
                        "Category": str(item.get("category", "")),
                        "Above pace ($)": float(item.get("above_pace", 0.0)),
                        "Spent to date": float(item.get("spent_to_date", 0.0)),
                        "Allowed by pace (to date)": float(pace_allowed),
                        "Budget (period)": float(item.get("budget", 0.0)),
                    }
                )

            ddf = pd.DataFrame(driver_rows)
            for col in ["Above pace ($)", "Spent to date", "Allowed by pace (to date)", "Budget (period)"]:
                ddf[col] = ddf[col].map(lambda x: f"${float(x):,.2f}")
            st.dataframe(ddf, use_container_width=True)
        else:
            # This message is now truly meaningful: it means backend didn’t detect anything > pace.
            st.write("No categories are above pace right now.")

    # end-balance headline
    st.divider()
    if forecast_end_balance < 0:
        st.warning(f"Projected end balance: **-${abs(forecast_end_balance):,.2f}**")
    else:
        st.success(f"Projected end balance: **${forecast_end_balance:,.2f}**")
