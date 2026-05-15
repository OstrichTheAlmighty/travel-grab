import datetime
import calendar
import pandas as pd
import streamlit as st
import requests
from affordability_engine import calculateGoalTrajectory

BASE_URL = "http://127.0.0.1:8000"
if "user_id" not in st.session_state:
    st.session_state.user_id = "default"

st.set_page_config(page_title="How can I afford this?", layout="wide")
st.markdown(
    """
    <style>
    .stApp {
        background: #0f1218;
        color: #f4f7fb;
    }
    section[data-testid="stSidebar"] {
        background: #151923;
    }
    div[data-testid="stMetric"] {
        background: #171c27;
        border: 1px solid #2b3342;
        border-radius: 8px;
        padding: 14px 16px;
        min-width: 0;
        overflow: visible;
    }
    div[data-testid="stMetric"] > div {
        min-width: 0;
    }
    div[data-testid="stMetricValue"] {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: normal;
        line-height: 1.15;
    }
    div[data-testid="stMetricValue"] > div {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        line-height: 1.15;
    }
    div[data-testid="stMetricLabel"] {
        white-space: normal;
        overflow-wrap: anywhere;
    }
    </style>
    """,
    unsafe_allow_html=True,
)
st.title("How can I afford this?")

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
    r = requests.get(
        f"{BASE_URL}/budget/active",
        params={"user_id": st.session_state.user_id},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("GET /budget/active failed")
    return r.json()


def api_save_budget(period, income_amount, allocations):
    payload = {
        "user_id": st.session_state.user_id,
        "period": period,
        "income_amount": float(income_amount),
        "allocations": {k: float(v) for k, v in allocations.items()},
    }
    r = requests.post(f"{BASE_URL}/budget", json=payload, timeout=10)
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("POST /budget failed")
    return r.json()


def api_get_budget_report(period, as_of):
    r = requests.get(
        f"{BASE_URL}/budget/report",
        params={"user_id": st.session_state.user_id, "period": period, "as_of": as_of},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("GET /budget/report failed")
    return r.json()


def api_get_forecast(period, as_of):
    r = requests.get(
        f"{BASE_URL}/forecast/eop",
        params={"user_id": st.session_state.user_id, "period": period, "as_of": as_of},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("GET /forecast/eop failed")
    return r.json()


def api_get_transactions(start, end):
    r = requests.get(
        f"{BASE_URL}/transactions",
        params={"user_id": st.session_state.user_id, "start": start, "end": end},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("GET /transactions failed")
    return r.json()


def api_get_goals():
    r = requests.get(f"{BASE_URL}/goals", params={"user_id": st.session_state.user_id}, timeout=10)
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("GET /goals failed")
    return r.json().get("goals", [])


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
    r = requests.post(f"{BASE_URL}/goals", json=payload, timeout=10)
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("POST /goals failed")
    return r.json().get("goal", {})


def api_update_goal_progress(goal_id, progress):
    r = requests.patch(
        f"{BASE_URL}/goals/{int(goal_id)}/progress",
        json={"progress": float(progress)},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("PATCH /goals/{goal_id}/progress failed")
    return r.json().get("goal", {})


def api_load_realistic_transaction_history():
    r = requests.post(
        f"{BASE_URL}/transactions/sample-month",
        json={"user_id": st.session_state.user_id, "as_of": as_of_str},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("POST /transactions/sample-month failed")
    return r.json()


def api_simulate_week(scenario):
    r = requests.post(
        f"{BASE_URL}/transactions/simulate-week",
        json={"user_id": st.session_state.user_id, "as_of": as_of_str, "scenario": scenario},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("POST /transactions/simulate-week failed")
    return r.json()


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
PROTECTED_CATEGORIES = {"Bills", SAVINGS_CATEGORY}
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
        r = requests.post(
            f"{BASE_URL}/transactions/sample-month",
            json={"user_id": st.session_state.user_id, "as_of": as_of_str},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("POST /transactions/sample-month failed")
        return api_get_transactions(month_start.isoformat(), as_of_str).get("transactions", [])

    all_data = requests.get(
        f"{BASE_URL}/transactions",
        params={"user_id": st.session_state.user_id},
        timeout=10,
    )
    if not all_data.ok:
        show_http_error(all_data)
        raise RuntimeError("GET /transactions failed")
    transactions = all_data.json().get("transactions", [])
    if transactions:
        return transactions

    r = requests.post(
        f"{BASE_URL}/transactions/sample-month",
        json={"user_id": st.session_state.user_id, "as_of": as_of_str},
        timeout=10,
    )
    if not r.ok:
        show_http_error(r)
        raise RuntimeError("POST /transactions/sample-month failed")
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
    if category_name in {"Rent / bills", "Bills", SAVINGS_CATEGORY}:
        return "protected"
    if category_name in {"Groceries", "Transportation", "Health", "Education"}:
        return "semi-flexible"
    return "flexible"


def category_cut_rate(category_name):
    for rule in FLEXIBLE_CUT_RULES.values():
        if category_name == rule["label"]:
            return float(rule["max_cut_pct"])
    if category_flexibility(category_name) == "semi-flexible":
        return 0.08
    return 0.0


def category_priority(category_name):
    for rule in FLEXIBLE_CUT_RULES.values():
        if category_name == rule["label"]:
            return int(rule["priority"])
    if category_name == "Transportation":
        return 7
    if category_flexibility(category_name) == "semi-flexible":
        return 50
    return 99


def default_flexibility_preferences():
    preferences = {}
    for group_name, categories in PREFERENCE_CATEGORY_GROUPS.items():
        for key, label in categories:
            flexible_default = group_name == "Flexible by default"
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
    if category_name in REALISM_CAPS:
        return REALISM_CAPS[category_name][style]
    if category_flexibility(category_name) == "semi-flexible":
        return {"Minimal lifestyle change": 0.05, "Balanced": 0.08, "Fastest possible": 0.12}[style]
    if category_flexibility(category_name) == "protected":
        return {"Minimal lifestyle change": 0.02, "Balanced": 0.04, "Fastest possible": 0.06}[style]
    return {"Minimal lifestyle change": 0.15, "Balanced": 0.25, "Fastest possible": 0.35}[style]


def preference_adjusted_cut_rate(category_name, preferences=None, plan_style="Balanced"):
    pref = preference_for_category(category_name, preferences)
    if not pref.get("enabled", False):
        return 0.0
    base_rate = category_cut_rate(category_name)
    if base_rate <= 0 and category_flexibility(category_name) in {"protected", "semi-flexible"}:
        base_rate = 0.05 if category_flexibility(category_name) == "protected" else 0.08
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
        return "Protected by default. The planner avoids this unless you explicitly allow it."
    pct = (suggested_cut / monthly_spend * 100) if monthly_spend > 0 else 0
    if category_name == "Coffee":
        return f"Reducing coffee by {pct:.0f}% frees up {money(suggested_cut)}/month without touching essentials."
    if category_name == "Restaurants / dining":
        return f"Dining is a strong tradeoff lever; a {pct:.0f}% cut saves {money(suggested_cut)}/month."
    if category_name == "Subscriptions":
        return f"Canceling or pausing low-use subscriptions could save about {money(suggested_cut)}/month."
    if category_name in {"Entertainment", "Shopping", "Other discretionary"}:
        return f"This is flexible spending. A realistic trim could redirect {money(suggested_cut)}/month toward a goal."
    return f"This is semi-flexible. Small changes could save {money(suggested_cut)}/month, but avoid aggressive cuts."


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


SIMULATION_MULTIPLIERS = {
    "good": {
        "Coffee": 0.60,
        "Restaurants / dining": 0.65,
        "Shopping": 0.70,
        "Entertainment": 0.75,
        "Subscriptions": 1.00,
        "Other discretionary": 1.00,
        "Transportation": 1.00,
    },
    "average": {
        "Coffee": 1.00,
        "Restaurants / dining": 1.00,
        "Shopping": 1.00,
        "Entertainment": 1.00,
        "Subscriptions": 1.00,
        "Other discretionary": 1.00,
        "Transportation": 1.00,
    },
    "overspending": {
        "Coffee": 1.20,
        "Restaurants / dining": 1.40,
        "Shopping": 1.50,
        "Entertainment": 1.35,
        "Subscriptions": 1.00,
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
        return f"This plan mainly changes {primary}, including protected areas you explicitly approved."
    return f"This plan mainly reduces {primary} while avoiding essentials."


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
        rec["Protected categories"] = "Rent / bills, Groceries, Transportation, Savings, Health"
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

    if remaining > 0.5:
        protected_weekly = {k: v / weeks_elapsed for k, v in protected.items()}
        for category, amount in sorted(protected_weekly.items(), key=lambda item: item[1], reverse=True):
            if category == "Income":
                continue
            display_category = "Rent / bills" if category == "Bills" else category
            pref = preference_for_category(display_category, preferences)
            if not pref.get("enabled", False):
                continue
            capacity = amount * preference_adjusted_cut_rate(display_category, preferences, plan_style)
            cut = min(remaining, capacity)
            if cut >= 1:
                recommendations.append(
                    {
                        "Category": f"{display_category} (protected)",
                        "Current weekly spend": amount,
                        "Recommended weekly cut": cut,
                        "Why selected": "Only included because you explicitly approved this protected category.",
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
        if flexibility == "protected" and not allow_protected and not pref.get("enabled", False):
            continue
        if flexibility == "semi-flexible" and name != "Aggressive" and pref.get("aggressiveness") != "Aggressive cuts":
            continue
        strategy_style = canonical_plan_style(name)
        cut_rate = preference_adjusted_cut_rate(row["Category"], preferences, strategy_style) * style_multiplier
        if flexibility == "semi-flexible":
            cut_rate = min(cut_rate, 0.10)
        if flexibility == "protected":
            cut_rate = min(cut_rate, 0.08)
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
    return f"${float(value):,.2f}"


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
    preferences = {k: dict(v) for k, v in ensure_flexibility_preferences().items()}
    if allow_protected:
        for label in ["Rent / bills", "Groceries", "Transportation", "Savings", "Health"]:
            if label in preferences:
                preferences[label]["enabled"] = True
                preferences[label].setdefault("aggressiveness", "Light cuts")
    transactions = load_demo_transactions_if_needed()
    all_tx_resp = requests.get(
        f"{BASE_URL}/transactions",
        params={"user_id": st.session_state.user_id},
        timeout=10,
    )
    all_transactions = all_tx_resp.json().get("transactions", []) if all_tx_resp.ok else transactions
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


def affordability_status(plan):
    pace = realistic_pace_label(plan)
    if pace in {"Very achievable", "Achievable with consistency"}:
        return "Possible"
    if pace == "Tight timeline":
        return "Tight"
    return "Unrealistic without changes"


def render_goal_plan(plan):
    st.caption(f"Using local transactions plus monthly budget guardrails for {month_start.strftime('%B %Y')}.")
    target_label = plan["target_date"].strftime("%b %-d, %Y")
    analysis = plan["goalAnalysis"]
    status = analysis["savingsTrajectoryStatus"]
    behavior_status = analysis["behaviorTrajectoryStatus"]
    pace = behavior_status
    adjustment = lifestyle_adjustment_label(plan)
    projected_date = analysis["projectedDate"]
    behavior_projected_date = analysis["behaviorProjectedDate"]
    pace_delta = analysis["gapVsTarget"]
    behavior_pace_delta = analysis["behaviorGapVsTarget"]
    detected = analysis["behaviorImprovement"]
    saved_toward_goal = analysis["savedTowardGoalThisWeek"]
    remaining_after_week = analysis["remaining"]
    top_recommendations = plan.get("recommendations", [])[:3]
    top_categories = [str(row.get("Category", "")).replace(" (protected)", "") for row in top_recommendations]
    if top_categories:
        action_text = ", ".join(top_categories[:-1]) + (f", and {top_categories[-1]}" if len(top_categories) > 1 else top_categories[0])
        answer = f"You need {money(analysis['weeklyTarget'])}/week to stay on pace. This week, reduced discretionary spending saved {money(saved_toward_goal)} toward {plan['goal_name']}."
    else:
        answer = f"You need {money(analysis['weeklyTarget'])}/week to stay on pace. This week, reduced discretionary spending saved {money(saved_toward_goal)} toward {plan['goal_name']}."

    with st.container(border=True):
        st.subheader("Goal status")
        cols = st.columns([1.2, 0.9, 1.0, 0.9])
        cols[0].write(f"Goal: **{plan['goal_name']}**")
        cols[1].write(f"Cost: **{money(plan['goal_cost'])}**")
        cols[2].write(f"Target date: **{target_label}**")
        cols[3].write(f"Status: **{status}**")
        st.metric("Need to save", f"{money(analysis['weeklyTarget'])}/week")
        detail_cols = st.columns(4)
        detail_cols[0].metric(behavior_delta_label(detected), behavior_delta_value(detected))
        detail_cols[1].metric("Weekly savings pace", money(max(0.0, detected)))
        detail_cols[2].metric(pace_delta_label(pace_delta), pace_delta_value(pace_delta))
        detail_cols[3].metric("Remaining", money(remaining_after_week))
        st.write(answer)
        secondary_cols = st.columns(3)
        secondary_cols[0].metric("Savings pace", behavior_status)
        secondary_cols[1].metric("Goal progress", status)
        secondary_cols[2].metric("Current projection", projected_date_label(projected_date))
        st.caption(
            f"Approved categories can realistically free up about {money(plan.get('preference_capacity_monthly', 0.0))}/month. "
            "For this MVP, reduced discretionary spending is automatically counted toward the goal."
        )
        if detected < 0:
            st.caption(f"Spending ran {money(abs(detected))} above normal this week, so the plan needs more savings next week.")

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

    st.subheader("Simulate my week")
    sim_cols = st.columns(3)
    scenarios = [
        ("Simulate good week", "good"),
        ("Simulate average week", "average"),
        ("Simulate overspending week", "overspending"),
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

    with st.container(border=True):
        st.subheader("Savings trajectory")
        trajectory_cols = st.columns(3)
        trajectory_cols[0].metric("Trajectory", behavior_status)
        if behavior_pace_delta >= 0:
            trajectory_cols[1].metric("Ahead weekly", f"{money(behavior_pace_delta)}/week")
        else:
            trajectory_cols[1].metric("Still needed weekly", f"{money(abs(behavior_pace_delta))}/week")
        if behavior_projected_date:
            delta_days = (behavior_projected_date - plan["target_date"]).days
            trajectory_cols[2].metric("Current projection", projected_date_label(behavior_projected_date))
            if delta_days > 0:
                st.caption(f"At your current pace, you would reach this goal {delta_days} days after the target date.")
            elif delta_days < 0:
                st.caption(f"At your current pace, you would reach this goal {abs(delta_days)} days before the target date.")
            else:
                st.caption("Near target.")
        else:
            trajectory_cols[2].metric("Current projection", "Needs momentum")
            st.caption("The projection will update once the app detects savings or approved plan changes.")
        st.caption("This projection assumes reduced discretionary spending continues to count toward the goal.")
        st.caption(f"Projection confidence: {analysis['simulationSummary']['projection_confidence']}.")
        streak = int(plan.get("dining_streak", 0))
        if streak > 0:
            st.caption(f"You have stayed under your restaurant baseline for {streak} week{'s' if streak != 1 else ''}.")

    st.subheader("What should I do this week?")
    if behavior_pace_delta < 0:
        st.caption(f"You still need about {money(abs(behavior_pace_delta))}/week. These actions can improve your savings pace.")
    else:
        st.caption(f"You are {money(behavior_pace_delta)}/week ahead. These actions help protect that progress.")
    if top_recommendations:
        card_cols = st.columns(min(3, len(top_recommendations)))
        for idx, row in enumerate(top_recommendations):
            with card_cols[idx % len(card_cols)]:
                with st.container(border=True):
                    st.markdown(f"**{row['Category']}**")
                    st.metric(row.get("Action", "Estimated weekly savings"), f"+{money(row['Recommended weekly cut'])}/week")
                    st.caption(row.get("Lifestyle impact", "moderate impact"))
                    st.write(row.get("Recommendation", row.get("Behavior change", "")))
                    st.caption(row.get("Timeline impact", "This improves your goal timeline."))
        recommended_categories = {str(row.get("Category", "")).replace(" (protected)", "") for row in top_recommendations}
        contributing_rows = [
            row for row in analysis["category_deltas"]
            if abs(float(row.get("Estimated savings", 0.0))) >= 1
            and row.get("Category") not in recommended_categories
        ]
        if contributing_rows:
            with st.expander("Other behavior affecting this goal"):
                for row in contributing_rows:
                    st.write(f"- {savings_detection_sentence(row)}")
    else:
        st.info("This week, the clearest action is to move the date out or approve more flexible categories.")

    st.subheader("What this changes")
    st.write(plan.get("what_this_changes", "This plan is based on the categories you approved."))
    if plan.get("plan_style") == "Minimal lifestyle change":
        st.caption("This keeps your routine mostly intact, but may require more time.")
    elif plan.get("plan_style") == "Fastest possible":
        st.caption("This moves faster, but asks for more noticeable lifestyle changes.")
    else:
        st.caption("This balances speed with realistic behavior changes.")

    st.subheader("Progress this week")
    if analysis:
        progress_cols = st.columns([0.9, 0.9, 0.9, 1.6])
        progress_cols[0].metric("Target this week", money(analysis["weeklyTarget"]))
        progress_cols[1].metric(behavior_delta_label(detected), behavior_delta_value(detected))
        progress_cols[2].metric(pace_delta_label(behavior_pace_delta), pace_delta_value(behavior_pace_delta))
        rows = analysis["category_deltas"]
        with progress_cols[3]:
            if rows:
                for row in rows:
                    st.write(f"- {savings_detection_sentence(row)}")
            else:
                st.write("No meaningful spending change detected yet this week.")

    if not plan["realistic"]:
        simulation_rows = plan.get("date_simulations", [])
        if simulation_rows:
            first = simulation_rows[-1]
            st.info(
                f"Moving {plan['goal_name']} from {target_label} to {first['New target date']} lowers required weekly savings "
                f"from {money(plan['weekly_needed'])}/week to {money(first['Required weekly savings'])}/week."
            )

    flexible_rows = [
        row for row in plan.get("category_intelligence", [])
        if row["Flexibility"] == "flexible" and row["Monthly spend"] > 0
    ]
    if flexible_rows:
        st.subheader("Where your flexible spending is going this week")
        overview_df = pd.DataFrame(
            {
                "Category": [row["Category"] for row in flexible_rows],
                "Potential savings": [float(row["Suggested cut"]) for row in flexible_rows],
            }
        ).set_index("Category")
        st.bar_chart(overview_df)

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
        "How can I afford this?",
        "Transactions",
        "Transaction History",
        "Spending by Category",
        "Budget",
        "Goals / Saved Plans",
    ],
    label_visibility="collapsed",
)
show_legacy_tools = st.sidebar.checkbox("Show advanced legacy tools", value=False)

if page == "How can I afford this?":
    previous_plan_style = st.session_state.get("plan_style", "Balanced")
    setup_cols = st.columns([1.2, 1, 1.6])
    if setup_cols[0].button("Choose what I’m willing to cut", width="stretch"):
        flexibility_preferences_dialog()
    plan_style = setup_cols[1].selectbox(
        "Plan style",
        ["Minimal lifestyle change", "Balanced", "Fastest possible"],
        index=["Minimal lifestyle change", "Balanced", "Fastest possible"].index(previous_plan_style)
        if previous_plan_style in ["Minimal lifestyle change", "Balanced", "Fastest possible"]
        else 1,
        help="Minimal keeps routines intact, Balanced uses realistic tradeoffs, Fastest possible uses the strongest approved cuts.",
    )
    setup_cols[2].caption("You stay in control. The planner only recommends reductions in categories you approve.")
    if plan_style != previous_plan_style:
        st.session_state.plan_style = plan_style
        st.session_state.pop("goal_plan", None)
        st.rerun()
    st.session_state.plan_style = plan_style

    with st.form("afford_goal_form"):
        goal_cols = st.columns([1.4, 0.8, 0.9, 1.0])
        goal_name = goal_cols[0].text_input("Goal", value="Hawaii trip")
        goal_cost = goal_cols[1].number_input("Cost", min_value=1.0, value=1800.0, step=25.0, format="%.2f")
        target_date = goal_cols[2].date_input("Date", value=today + datetime.timedelta(days=90), min_value=today)
        allow_protected = goal_cols[3].checkbox(
            "Allow protected cuts",
            value=False,
            help="Protected categories include rent, bills, savings, and essentials.",
        )
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

elif page == "Transactions":
    st.subheader("Add transaction")
    with st.form("focused_add_tx_form"):
        tx_type = st.segmented_control("Type", ["Spending", "Income"], default="Spending")
        tx_date = st.date_input("Date", value=today)
        merchant = st.text_input("Merchant", value="Neighborhood Cafe")
        amount = st.number_input("Amount", value=12.00, step=0.50, format="%.2f")
        category_options = ["Income"] if tx_type == "Income" else SPEND_CATEGORIES
        category = st.selectbox("Category", category_options, index=0)
        add_tx = st.form_submit_button("Add transaction")
    if add_tx:
        signed_amount = abs(float(amount)) if tx_type == "Income" else -abs(float(amount))
        resp = requests.post(
            f"{BASE_URL}/transactions",
            json={
                "date": tx_date.isoformat(),
                "merchant": merchant.strip(),
                "amount": signed_amount,
                "category": category,
                "user_id": st.session_state.user_id,
            },
            timeout=10,
        )
        if resp.ok:
            st.success("Transaction added.")
            st.session_state.pop("goal_plan", None)
        else:
            show_http_error(resp)

elif page == "Transaction History":
    st.subheader("Transaction history")
    try:
        load_demo_transactions_if_needed()
        history_start = month_bounds(previous_month(month_start))[0]
        transactions = api_get_transactions(history_start.isoformat(), as_of_str).get("transactions", [])
        df = pd.DataFrame(transactions)
        if df.empty:
            st.write("No transactions found.")
        else:
            df["source_label"] = [transaction_source_label(tx) for tx in transactions]
            df["amount"] = df["amount"].map(money)
            display_cols = ["date", "merchant", "amount", "category", "source_label"]
            if "raw_category" in df.columns:
                display_cols.append("raw_category")
            st.dataframe(
                df[display_cols].rename(
                    columns={
                        "date": "Date",
                        "merchant": "Merchant",
                        "amount": "Amount",
                        "category": "Category",
                        "source_label": "Source",
                        "raw_category": "Raw category",
                    }
                ),
                width="stretch",
                hide_index=True,
            )
    except Exception as e:
        st.error("Could not load transactions.")
        st.code(str(e))

elif page == "Spending by Category":
    st.subheader("Spending by category")
    st.caption("What should I actually do this week? Focus on the flexible categories with the clearest savings potential.")
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
            top = st.columns(3)
            top[0].metric("Monthly spend", money(total_spend))
            top[1].metric("Suggested cut potential", money(flexible_cut_total))
            top[2].metric("Flexible categories", str(sum(1 for row in rows if row["Flexibility"] == "flexible")))

            savings_rows = [
                {
                    "Category": row["Category"],
                    "Potential savings": row["Suggested cut"],
                }
                for row in rows
                if row["Flexibility"] == "flexible" and row["Suggested cut"] > 0
            ]
            if savings_rows:
                st.subheader("Potential savings by category")
                st.bar_chart(pd.DataFrame(savings_rows).set_index("Category"))

            st.subheader("Best next moves")
            best_rows = sorted(
                [row for row in rows if row["Suggested cut"] > 0],
                key=lambda row: row["Suggested cut"],
                reverse=True,
            )[:5]
            card_cols = st.columns(min(3, max(1, len(best_rows))))
            for idx, row in enumerate(best_rows):
                with card_cols[idx % len(card_cols)]:
                    with st.container(border=True):
                        st.markdown(f"**{row['Category']}**")
                        st.metric("Monthly opportunity", money(row["Suggested cut"]))
                        st.caption(row["Flexibility"])
                        st.write(row["Insight"])

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

elif page == "Budget":
    st.subheader("Budget guardrails")
    st.caption("Budgets help the planner understand what should be protected before suggesting tradeoffs.")
    try:
        active_budget = api_get_budget_active()
    except Exception:
        active_budget = {"income_amount": 3200.0, "allocations": {}}
    with st.form("focused_budget_form"):
        income_amount = st.number_input("Monthly income", min_value=0.0, value=float(active_budget.get("income_amount", 3200.0)), step=100.0)
        allocations = {}
        cols = st.columns(2)
        for idx, category in enumerate(BUDGET_CATEGORIES):
            default_amount = float((active_budget.get("allocations", {}) or {}).get(category, 0.0))
            with cols[idx % 2]:
                allocations[category] = st.number_input(category, min_value=0.0, value=default_amount, step=25.0, key=f"focused_budget_{category}")
        save_budget = st.form_submit_button("Save budget")
    if save_budget:
        try:
            api_save_budget("monthly", income_amount, allocations)
            st.success("Budget saved.")
            st.session_state.pop("goal_plan", None)
        except Exception as e:
            st.error("Could not save budget.")
            st.code(str(e))

elif page == "Goals / Saved Plans":
    st.subheader("Saved goals")
    st.caption("Automatic progress tracking compares this week's discretionary spending against your recent baseline.")
    try:
        all_tx_resp = requests.get(
            f"{BASE_URL}/transactions",
            params={"user_id": st.session_state.user_id},
            timeout=10,
        )
        all_transactions = all_tx_resp.json().get("transactions", []) if all_tx_resp.ok else []
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
                st.progress(min(1.0, analysis["effective_progress_amount"] / max(1.0, target_amount)))
                goal_cols = st.columns(5)
                goal_cols[0].metric("Goal progress", money(analysis["effective_progress_amount"]))
                goal_cols[1].metric("Remaining", money(analysis["remaining"]))
                goal_cols[2].metric("Weekly target", money(analysis["weeklyTarget"]))
                goal_cols[3].metric("Saved this week", money(analysis["savedTowardGoalThisWeek"]))
                goal_cols[4].metric("Savings pace", analysis["trajectoryStatus"])
                if analysis["behaviorImprovement"] < 0:
                    st.caption(f"Spending is {money(abs(analysis['behaviorImprovement']))} above normal this week.")
                if analysis["gapVsTarget"] >= 0:
                    st.success(f"{analysis['trajectoryStatus']}: ahead of this week's pace by {money(analysis['gapVsTarget'])}.")
                else:
                    st.warning(f"{analysis['trajectoryStatus']}: still needs {money(abs(analysis['gapVsTarget']))}/week.")
                st.caption(f"Projected date: {projected_date_label(analysis['projectedDate'])}.")
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
tab_tx, tab_budget, tab_insights, tab_report, tab_forecast = st.tabs(
    ["Transactions", "Budget", "Insights", "Budget Report", "Forecast"]
)

# ============================================================
# Transactions tab
# ============================================================
with tab_tx:
    st.subheader("Add a Transaction")

    with st.form("add_tx_form"):
        tx_type = st.selectbox("Transaction type", ["Spending", "Income"], index=0)
        date = st.date_input("Date", value=datetime.date.today())
        merchant = st.text_input("Merchant", value="Starbucks")
        amount = st.number_input(
            "Amount ($)",
            value=6.75,
            step=0.01,
            format="%.2f",
        )
        if tx_type == "Income":
            category = st.selectbox("Category", ["Income"], index=0)
        else:
            category = st.selectbox("Category", SPEND_CATEGORIES, index=0)
        submitted = st.form_submit_button("Add Transaction")

    if submitted:
        try:
            signed_amount = float(amount)
            if tx_type == "Spending":
                signed_amount = -abs(signed_amount)
            else:
                signed_amount = abs(signed_amount)
            payload = {
                "date": str(date),
                "merchant": merchant.strip(),
                "amount": signed_amount,
                "category": category,
                "user_id": st.session_state.user_id,
            }
            resp = requests.post(f"{BASE_URL}/transactions", json=payload, timeout=10)
            if not resp.ok:
                show_http_error(resp)
                raise RuntimeError("POST /transactions failed")
            st.success("✅ Transaction added!")
        except Exception as e:
            st.code(str(e))

    st.divider()
    st.subheader("Transactions")
    st.caption(f"Showing {month_start.strftime('%B %Y')}")

    tx_key = f"{st.session_state.user_id}:{month_start.isoformat()}:{as_of_str}:tx"
    if st.session_state.get("tx_cache_key") != tx_key:
        try:
            data = api_get_transactions(month_start.isoformat(), as_of_str)
            st.session_state.tx_cache = data.get("transactions", [])
            st.session_state.tx_cache_key = tx_key
        except Exception as e:
            st.code(str(e))

    transactions = st.session_state.get("tx_cache", [])
    df = pd.DataFrame(transactions)

    if df.empty:
        st.write("No transactions found yet.")
    else:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df["amount_num"] = pd.to_numeric(df["amount"], errors="coerce").abs()
        df["amount"] = df["amount_num"].map(lambda x: f"${x:,.2f}" if pd.notna(x) else "")

        df["date"] = df["date"].dt.strftime("%B %d, %Y")
        df = df.rename(columns={"date": "Date", "merchant": "Merchant", "amount": "Amount", "category": "Category"})

        categories = ["All"] + sorted(df["Category"].dropna().unique().tolist())
        chosen_cat = st.selectbox("Category filter", categories, index=0, key="tx_cat_filter")
        if chosen_cat != "All":
            df = df[df["Category"] == chosen_cat]

        df = df.sort_values("Date", ascending=False)
        show_df = df[["Date", "Merchant", "Amount", "Category"]]
        st.dataframe(show_df, use_container_width=True)


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
                st.code(str(e))

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
            st.code(str(e))


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
    if st.session_state.insights_status_key != status_key:
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
            st.code(str(e))

    insights_key = f"{st.session_state.user_id}:{as_of_str}:monthly:insights"
    if st.session_state.get("insights_cache_key") != insights_key:
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
            st.code(str(e))

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
            st.code(str(e))

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
                st.error("❌ Could not load cash forecast")
                st.code(f"{cash_resp.status_code} {cash_resp.reason}\n\n{cash_resp.text}")
                raise RuntimeError("Cash forecast request failed")
            st.session_state.cash_forecast_cache = cash_resp.json() or {}
        except Exception as e:
            st.code(str(e))

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
