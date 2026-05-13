import datetime
import calendar
import pandas as pd
import streamlit as st
import requests

BASE_URL = "http://127.0.0.1:8000"
if "user_id" not in st.session_state:
    st.session_state.user_id = "default"

st.set_page_config(page_title="AI Finance Coach", layout="wide")
st.title("AI Finance Coach")

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
