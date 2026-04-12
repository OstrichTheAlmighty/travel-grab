import datetime
import calendar
import traceback
import pandas as pd
import streamlit as st
import requests
import altair as alt
import re

print("FRONTEND START", flush=True)

BASE_URL = "http://127.0.0.1:8000"
BACKEND_TIMEOUT_SECONDS = 10
AI_EXPLANATION_TIMEOUT_SECONDS = 3

def run_app():
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
    st.sidebar.checkbox("Debug mode", value=False, key="debug_mode")
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

    DEFAULT_MONTHLY_CATEGORY_BUDGETS = {
        "Bills": 1300.0,
        "Groceries": 300.0,
        "Food": 180.0,
        "Transportation": 120.0,
        "Entertainment": 120.0,
        "Shopping": 120.0,
        "Subscriptions": 60.0,
        "Health": 100.0,
        "Education": 100.0,
        "Other": 80.0,
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
    
    
    def backend_get(*args, **kwargs):
        kwargs.setdefault("timeout", BACKEND_TIMEOUT_SECONDS)
        print("BEFORE BACKEND CALL", flush=True)
        response = requests.get(*args, **kwargs)
        print("AFTER BACKEND CALL", flush=True)
        return response
    
    
    def backend_post(*args, **kwargs):
        kwargs.setdefault("timeout", BACKEND_TIMEOUT_SECONDS)
        print("BEFORE BACKEND CALL", flush=True)
        response = requests.post(*args, **kwargs)
        print("AFTER BACKEND CALL", flush=True)
        return response
    
    
    def backend_delete(*args, **kwargs):
        kwargs.setdefault("timeout", BACKEND_TIMEOUT_SECONDS)
        print("BEFORE BACKEND CALL", flush=True)
        response = requests.delete(*args, **kwargs)
        print("AFTER BACKEND CALL", flush=True)
        return response
    
    
    def api_get_budget_active():
        r = backend_get(
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
        r = backend_post(f"{BASE_URL}/budget", json=payload, timeout=10)
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("POST /budget failed")
        return r.json()
    
    
    def api_get_budget_report(period, as_of):
        r = backend_get(
            f"{BASE_URL}/budget/report",
            params={"user_id": st.session_state.user_id, "period": period, "as_of": as_of},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("GET /budget/report failed")
        return r.json()
    
    
    def api_get_forecast(period, as_of):
        r = backend_get(
            f"{BASE_URL}/forecast/eop",
            params={"user_id": st.session_state.user_id, "period": period, "as_of": as_of},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("GET /forecast/eop failed")
        return r.json()
    
    
    def api_get_transactions(start, end):
        r = backend_get(
            f"{BASE_URL}/transactions",
            params={"user_id": st.session_state.user_id, "start": start, "end": end},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("GET /transactions failed")
        return r.json()
    
    
    def api_clear_transactions():
        r = backend_delete(
            f"{BASE_URL}/transactions",
            params={"user_id": st.session_state.user_id},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("DELETE /transactions failed")
        return r.json()


    def api_load_sample_month(as_of):
        r = backend_post(
            f"{BASE_URL}/transactions/sample-month",
            json={"user_id": st.session_state.user_id, "as_of": as_of},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("POST /transactions/sample-month failed")
        return r.json()
    
    
    def reset_data_caches():
        for key in [
            "tx_cache",
            "tx_cache_key",
            "insights_cache",
            "insights_cache_key",
            "trends_cache",
            "report_cache",
            "report_cache_key",
            "forecast_cache",
            "forecast_cache_key",
            "cash_forecast_cache",
            "category_explanation",
            "category_explanation_key",
            "last_insights_mode",
            "insights_status_key",
            "insights_status_line",
            "afford_live_data",
            "afford_live_error",
            "afford_live_key",
            "afford_breakdown_data",
            "afford_breakdown_key",
            "category_safe_to_spend",
            "category_safe_to_spend_key",
        ]:
            st.session_state.pop(key, None)
    
    
    # -----------------------------
    # Tabs
    # -----------------------------
    print("BEFORE RENDER", flush=True)
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
                resp = backend_post(f"{BASE_URL}/transactions", json=payload, timeout=10)
                if not resp.ok:
                    show_http_error(resp)
                    raise RuntimeError("POST /transactions failed")
                reset_data_caches()
                st.success("✅ Transaction added!")
            except Exception as e:
                st.code(str(e))

        action_cols = st.columns(2)
        if action_cols[0].button("Load healthy sample month"):
            try:
                demo_budget = {
                    "Bills": 1300.0,
                    "Groceries": 300.0,
                    "Food": 180.0,
                    "Transportation": 120.0,
                    "Entertainment": 120.0,
                    "Subscriptions": 0.0,
                    "Health": 0.0,
                    "Education": 0.0,
                    "Shopping": 0.0,
                    "Other": 80.0,
                    "Savings": 0.0,
                }
                api_save_budget("monthly", 3200.0, demo_budget)
                out = api_load_sample_month(as_of_str)

                reset_data_caches()
                st.success(f"✅ Loaded {int(out.get('loaded', 0))} sample transactions for testing.")
            except Exception as e:
                st.code(str(e))
    
        if action_cols[1].button("Clear all transactions"):
            try:
                out = api_clear_transactions()
                reset_data_caches()
                st.success(f"✅ Cleared {int(out.get('deleted', 0))} transactions.")
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
            st.dataframe(show_df, width="stretch")
    
    
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
                        st.dataframe(alloc_df, width="stretch")
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
                reset_data_caches()
                st.success("✅ Budget saved.")
                st.write(f"Period: **{out.get('period', '').title()}**")
                st.write(f"Income: **${float(out.get('income_amount', 0.0)):,.2f}**")
                allocs = out.get("allocations", {}) or {}
                if allocs:
                    alloc_df = pd.DataFrame(
                        [{"Category": k, "Budget": float(v)} for k, v in allocs.items()]
                    ).sort_values("Category")
                    alloc_df["Budget"] = alloc_df["Budget"].map(lambda x: f"${x:,.2f}")
                    st.dataframe(alloc_df, width="stretch")
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
        if "last_insights_mode" not in st.session_state:
            st.session_state.last_insights_mode = ""
        if "insights_status_key" not in st.session_state:
            st.session_state.insights_status_key = ""
        if "insights_status_line" not in st.session_state:
            st.session_state.insights_status_line = ""
    
        # Proactive status line (lightweight)
        status_key = f"{st.session_state.user_id}:{as_of_str}:monthly"
        if st.session_state.insights_status_key != status_key:
            try:
                bundle_resp = backend_get(
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
    
        beginner_mode = st.toggle("Beginner mode", value=True, key="insights_beginner_mode")
        debug_mode = bool(st.session_state.get("debug_mode", False))
        def _set_question(q: str):
            st.session_state.insight_question = q
            st.session_state.insight_ask_now = True
    
        def _parse_amount_from_text(text: str):
            m = re.search(r"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", text or "")
            if not m:
                return None
            try:
                return float(m.group(1).replace(",", ""))
            except Exception:
                return None
    
        def _fmt_money(value: float) -> str:
            return f"${value:,.2f}"

        def _fmt_signed_money(value: float) -> str:
            amount = abs(float(value))
            if value < 0:
                return f"-${amount:,.2f}"
            return f"${amount:,.2f}"
    
        def is_unsafe(verdict_text_or_enum: str) -> bool:
            v = (verdict_text_or_enum or "").strip().upper()
            return v in {"NO_UNSAFE", "NOT RECOMMENDED RIGHT NOW"}

        def _affordability_state(resp: dict) -> str:
            state = str(resp.get("decision_state", "")).strip().upper()
            if state in {"SAFE", "TIGHT", "NOT_RECOMMENDED"}:
                return state

            verdict = str(resp.get("verdict", "")).strip().upper()
            if verdict == "YES_SAFE":
                return "SAFE"
            if verdict == "YES_RISKY":
                return "TIGHT"
            return "NOT_RECOMMENDED"

        def _affordability_support_sentence(resp: dict) -> str:
            state = _affordability_state(resp)
            fallback = {
                "SAFE": "You're comfortably within your safe range after this.",
                "TIGHT": "This puts you right near your limit and leaves only a small buffer.",
                "NOT_RECOMMENDED": "This goes beyond what your plan safely supports.",
            }

            coach_explanation = str(resp.get("answer", "") or resp.get("coach_explanation", "")).strip()
            if not coach_explanation:
                coach_explanation, _ = _render_coach_affordability_explanation(resp)

            cleaned = " ".join(str(coach_explanation or "").split())
            patterns = [
                r"^Yes\s*[—-]\s*safe\.?\s*",
                r"^Safe\.?\s*",
                r"^Tight\s*[—-]\s*proceed carefully\.?\s*",
                r"^No\s*[—-]\s*not recommended\.?\s*",
                r"^Not recommended(?: right now)?\.?\s*",
            ]
            for pattern in patterns:
                cleaned = re.sub(pattern, "", cleaned, count=1, flags=re.IGNORECASE)

            cleaned = cleaned.strip()
            if cleaned and "balance" not in cleaned.lower():
                return cleaned

            return fallback[state]

        def _affordability_purchase_context(resp: dict) -> str:
            decision_state = _affordability_state(resp)
            amount = max(0.0, float(resp.get("amount", 0.0) or 0.0))
            max_safe = max(0.0, float(resp.get("max_safe_spend", 0.0) or 0.0))
            remaining_safe = max_safe - amount
            remaining_display = _fmt_signed_money(remaining_safe)

            if max_safe <= 0:
                if decision_state == "NOT_RECOMMENDED":
                    return "This goes beyond your current safe-to-spend room and pushes your buffer lower."
                return ""

            usage_pct = (amount / max_safe) * 100.0 if max_safe > 0 else 0.0
            if amount < max_safe * 0.10:
                return (
                    f"This uses about {usage_pct:.0f}% of your safe-to-spend room and has minimal impact on your plan."
                )
            if amount < max_safe * 0.50:
                return f"Buffer remaining after purchase: {remaining_display}."
            if decision_state == "NOT_RECOMMENDED":
                overage = max(0.0, amount - max_safe)
                if overage > 0:
                    return f"This goes about {_fmt_money(overage)} beyond your safe-to-spend room and pushes your buffer lower."
                return "This meaningfully reduces your buffer and pushes your plan off track."
            if decision_state == "TIGHT":
                return (
                    f"This uses about {usage_pct:.0f}% of your safe-to-spend room and leaves only a small buffer."
                )
            return f"This uses about {usage_pct:.0f}% of your safe-to-spend room and meaningfully reduces your buffer."

        def _affordability_timing_line(resp: dict) -> str:
            decision_state = _affordability_state(resp)
            days_remaining = resp.get("days_remaining")
            safety_runway_days = resp.get("safety_runway_days")
            window_days = None
            if decision_state == "SAFE":
                try:
                    window_days = int(safety_runway_days) if safety_runway_days is not None else None
                except Exception:
                    window_days = None
                if window_days is None:
                    try:
                        window_days = int(days_remaining) if days_remaining is not None else None
                    except Exception:
                        window_days = None
                if window_days is not None and window_days > 0:
                    return f"You're on track for ~{window_days} more days."
                return ""

            try:
                if safety_runway_days is not None:
                    window_days = int(safety_runway_days)
            except Exception:
                window_days = None
            if window_days is None:
                try:
                    window_days = int(days_remaining) if days_remaining is not None else None
                except Exception:
                    window_days = None
            if window_days is not None and window_days > 0:
                return f"This may tighten your next ~{window_days} days."
            return ""

        def _affordability_path_to_yes(resp: dict) -> str:
            if _affordability_state(resp) != "NOT_RECOMMENDED":
                return ""

            path_back = resp.get("path_back") or {}
            amount = max(0.0, float(path_back.get("amount", 0.0) or 0.0))
            days = max(0, int(path_back.get("days", 0) or 0))
            category = str(path_back.get("category", "") or "").strip()

            if category and amount > 0:
                spend_action = f"trim {category} by about {_fmt_money(amount)}"
            elif amount > 0 and days > 0:
                spend_action = f"reduce daily spending by about {_fmt_money(amount / max(1, days))}"
            elif amount > 0:
                spend_action = f"reduce other spending by about {_fmt_money(amount)}"
            else:
                spend_action = "reduce other spending"

            if days > 0:
                return f"Wait ~{days} days or until your next income, {spend_action}, or skip similar purchases for now."
            return f"Wait until your next income, {spend_action}, or skip similar purchases for now."

        def _affordability_limit_comparison(resp: dict) -> str:
            max_safe = max(0.0, float(resp.get("max_safe_spend", 0.0) or 0.0))
            amount = max(0.0, float(resp.get("amount", 0.0) or 0.0))
            difference = abs(max_safe - amount)

            if amount < max_safe:
                return f"This is {_fmt_money(difference)} below your safe-to-spend limit."
            if amount > max_safe:
                return f"This is {_fmt_money(difference)} above your safe-to-spend limit."
            return "This is exactly at your safe-to-spend limit."

        def _render_afford_response(resp: dict, cash_breakdown: dict | None = None):
            verdict_map = {
                "SAFE": "Safe",
                "TIGHT": "Tight — proceed carefully",
                "NOT_RECOMMENDED": "Not recommended",
            }

            decision_state = _affordability_state(resp)
            verdict_text = verdict_map.get(decision_state, "Tight — proceed carefully")
            st.write(verdict_text)
            support_sentence = _affordability_support_sentence(resp)
            if support_sentence:
                st.write(support_sentence)

            context_line = _affordability_purchase_context(resp)
            if context_line:
                st.write(context_line)

            max_safe = float(resp.get("max_safe_spend", 0.0))
            amount = max(0.0, float(resp.get("amount", 0.0) or 0.0))
            remaining_safe = max_safe - amount
            protected_balance = float(resp.get("protected_balance", resp.get("safe_threshold", 0.0)))
            projected_before = float(
                resp.get("projected_balance_before_purchase", resp.get("before_end_balance", 0.0))
            )
            projected_after = float(
                resp.get("projected_balance_after_purchase", resp.get("after_end_balance", 0.0))
            )

            st.write(f"Projected balance before purchase: {_fmt_money(projected_before)}")
            st.write(f"Projected balance after purchase: {_fmt_money(projected_after)}")
            st.write(f"Safe to spend: {_fmt_money(max_safe)}")
            if decision_state != "SAFE":
                st.write(f"Protected balance: {_fmt_money(protected_balance)}")
            st.write(_affordability_limit_comparison(resp))

            breakdown_days_remaining = resp.get("days_remaining")
            upcoming_expenses = None
            income_ahead = None
            if cash_breakdown:
                try:
                    upcoming_expenses = max(
                        0.0,
                        float(cash_breakdown.get("forecast_spending_total", 0.0)) - float(cash_breakdown.get("spending_to_date", 0.0)),
                    )
                    income_ahead = max(
                        0.0,
                        float(cash_breakdown.get("forecast_income_total", 0.0)) - float(cash_breakdown.get("income_to_date", 0.0)),
                    )
                    breakdown_days_remaining = cash_breakdown.get("days_remaining", breakdown_days_remaining)
                except Exception:
                    upcoming_expenses = None
                    income_ahead = None

            with st.expander("Safe to spend details ⓘ", expanded=False):
                st.write(f"Buffer remaining after purchase: {_fmt_signed_money(remaining_safe)}")
                if upcoming_expenses is not None:
                    st.write(f"Upcoming expenses: {_fmt_money(upcoming_expenses)}")
                if income_ahead is not None:
                    st.write(f"Income ahead: {_fmt_money(income_ahead)}")
                if breakdown_days_remaining is not None:
                    try:
                        st.write(f"Days remaining: {int(breakdown_days_remaining)}")
                    except Exception:
                        pass

            timing_line = _affordability_timing_line(resp)
            if decision_state == "SAFE":
                if timing_line:
                    st.write(timing_line)
            else:
                with st.expander("Protected balance details ⓘ", expanded=False):
                    st.write("This is the balance your plan is trying to protect.")
                    st.write("Dropping below it means less room for upcoming expenses.")
                if timing_line:
                    st.write(timing_line)

            if decision_state == "NOT_RECOMMENDED":
                path_to_yes = _affordability_path_to_yes(resp)
                if path_to_yes:
                    st.write(f"Path to Yes: {path_to_yes}")
            elif decision_state == "TIGHT":
                tight_guidance = str(resp.get("tight_guidance", "")).strip() or "Consider waiting or trimming other spending."
                st.write(tight_guidance)

        def _render_coach_affordability_explanation(resp: dict):
            verdict = str(resp.get("verdict", "")).strip()
            if verdict == "NO_UNSAFE":
                verdict = "NO"

            try:
                live_amount = float(resp.get("amount", 0.0))
                coach_resp = backend_post(
                    f"{BASE_URL}/coach/respond",
                    json={
                        "question_type": "affordability",
                        "amount": live_amount,
                        "decision_state": _affordability_state(resp),
                        "verdict": verdict,
                        "before_balance": float(resp.get("before_end_balance", 0.0)),
                        "after_balance": float(resp.get("after_end_balance", 0.0)),
                        "max_safe_spend": float(resp.get("max_safe_spend", 0.0)),
                    },
                    timeout=AI_EXPLANATION_TIMEOUT_SECONDS,
                )
                if not coach_resp.ok:
                    return "", ""

                coach_response = coach_resp.json() or {}
                answer = str(coach_response.get("answer", "")).strip()
                source = str(coach_response.get("source", "")).strip().lower()
                return answer, source
            except Exception:
                return "", ""

        def _render_optional_affordability_explanation(resp: dict):
            coach_explanation = str(resp.get("answer", "") or resp.get("coach_explanation", "")).strip()
            if not coach_explanation:
                coach_explanation, _ = _render_coach_affordability_explanation(resp)
            if not coach_explanation:
                st.write("AI explanation unavailable — using standard logic.")
                return

            st.write(coach_explanation)

        def _load_category_safe_to_spend() -> float | None:
            cache_key = f"{st.session_state.user_id}:{as_of_str}:{int(beginner_mode)}:category_safe_to_spend"
            if st.session_state.get("category_safe_to_spend_key") == cache_key:
                cached_value = st.session_state.get("category_safe_to_spend")
                return None if cached_value is None else float(cached_value)

            safe_to_spend = None
            cash_context = None
            afford_breakdown_key = str(st.session_state.get("afford_breakdown_key", "")).strip()
            afford_breakdown_data = st.session_state.get("afford_breakdown_data") or {}
            breakdown_key = f"{st.session_state.user_id}:{as_of_str}:cash_breakdown"
            if afford_breakdown_data and afford_breakdown_key == breakdown_key:
                cash_context = afford_breakdown_data
            else:
                try:
                    cash_resp = backend_get(
                        f"{BASE_URL}/forecast/cash",
                        params={
                            "user_id": st.session_state.user_id,
                            "period": "monthly",
                            "as_of": as_of_str,
                            "starting_balance": 0.0,
                        },
                        timeout=6,
                    )
                    if cash_resp.ok:
                        cash_context = cash_resp.json() or {}
                except Exception:
                    cash_context = None

            if cash_context:
                try:
                    income_ahead = float(cash_context.get("forecast_income_total", 0.0)) - float(cash_context.get("income_to_date", 0.0))
                    upcoming_expenses = float(cash_context.get("forecast_spending_total", 0.0)) - float(cash_context.get("spending_to_date", 0.0))
                    projected_balance_before_purchase = income_ahead - upcoming_expenses
                    safe_to_spend = round(projected_balance_before_purchase - (upcoming_expenses * 0.20), 2)
                except Exception:
                    safe_to_spend = None

            st.session_state.category_safe_to_spend = safe_to_spend
            st.session_state.category_safe_to_spend_key = cache_key
            return safe_to_spend

        def _category_spend_evaluation(category_spend: float, safe_to_spend: float | None) -> tuple[str, float | None]:
            if safe_to_spend is None or safe_to_spend <= 0:
                return "neutral", None

            percent_of_safe = float(category_spend) / float(safe_to_spend)
            if percent_of_safe < 0.10:
                return "low", percent_of_safe
            if percent_of_safe <= 0.30:
                return "medium", percent_of_safe
            return "high", percent_of_safe

        def _category_interpretation_line(
            category: str,
            *,
            has_previous_data: bool,
            current_total: float,
            previous_total: float,
            spend_level: str,
        ) -> str:
            category_name = str(category).strip()
            fixed_essential = {"Bills", "Rent", "Utilities", "Insurance"}
            discretionary = {"Food", "Entertainment", "Shopping", "Dining"}
            mixed = {"Groceries", "Transportation"}

            if spend_level == "low":
                if category_name in fixed_essential:
                    return "This category looks manageable right now and well within a healthy range."
                return "Your spending here is currently low and well within a healthy range."
            if spend_level == "medium":
                if category_name in fixed_essential:
                    return "This category looks reasonable for this point in the month."
                return "This category is reasonable but worth keeping an eye on."

            if category_name in fixed_essential:
                return "Most of this category looks fixed and essential."
            if category_name in discretionary:
                return "This category is taking a meaningful share of your spending room and is easier to adjust."
            if category_name in mixed:
                return "This category is partly necessary, and the pace here matters."
            if has_previous_data and previous_total > 0 and abs(current_total - previous_total) <= previous_total * 0.2:
                return "This category is stable and likely to recur month to month."
            return "This category can vary month to month."

        def _category_affordability_line(category: str) -> str:
            category_name = str(category).strip()
            fixed_essential = {"Bills", "Rent", "Utilities", "Insurance"}
            discretionary = {"Food", "Entertainment", "Shopping", "Dining"}
            mixed = {"Groceries", "Transportation"}

            if category_name in fixed_essential:
                return "Because most of this is fixed, it limits what you can safely spend elsewhere."
            if category_name in discretionary:
                return "This spending reduces your available buffer for the rest of the month."
            if category_name in mixed:
                return "If this runs high, it can tighten your buffer for the rest of the month."
            return "Changes here can affect how much buffer you have left for the rest of the month."

        def _join_category_merchants(top_merchants: list[dict], limit: int = 2) -> str:
            names = [str(item.get("merchant", "")).strip() for item in top_merchants[:limit] if str(item.get("merchant", "")).strip()]
            if not names:
                return ""
            if len(names) == 1:
                return names[0]
            return f"{names[0]} and {names[1]}"

        def _category_pattern_insight(category: str, *, top_merchants: list[dict], current_tx_count: int, current_avg_spend: float) -> str:
            category_name = str(category).strip()
            merchant_names = _join_category_merchants(top_merchants)

            if category_name in {"Food", "Dining"}:
                if merchant_names:
                    return f"Most of this comes from restaurant purchases at {merchant_names}, which tend to add up quickly."
                return "Most of this appears to come from restaurant spending, which tends to build up faster than expected."
            if category_name == "Bills":
                if merchant_names:
                    return f"Most of this is tied to recurring bills like {merchant_names}, so it is likely to show up again next month."
                return "Most of this looks recurring, so it is likely to show up again next month."
            if category_name in {"Utilities", "Rent", "Insurance"}:
                return "This looks driven by recurring essentials rather than one-off spending."
            if category_name == "Entertainment":
                if current_tx_count >= 3:
                    return "This looks spread across several discretionary purchases, which can quietly build up over the month."
                return "This looks driven by discretionary spending, which is usually easier to adjust."
            if category_name == "Shopping":
                return "This looks like optional spending rather than a recurring obligation, which gives you more control over it."
            if category_name == "Groceries":
                return "This looks like necessary spending, but the pace of purchases still matters over the month."
            if category_name == "Transportation":
                return "Transportation tends to feel essential day to day, but repeated smaller trips can still add up."
            if current_tx_count > 0 and current_avg_spend > 0:
                return f"This category is being shaped by about {_fmt_money(current_avg_spend)} per purchase on average."
            return "This category can meaningfully affect how much room you have left for the month."

        def _category_buffer_impact_line(category: str, *, current_total: float, safe_to_spend: float | None) -> str:
            category_name = str(category).strip()
            discretionary = {"Food", "Dining", "Entertainment"}
            fixed_essential = {"Bills", "Rent", "Utilities", "Insurance"}
            mixed = {"Groceries", "Transportation"}
            spend_level, percent_of_safe = _category_spend_evaluation(current_total, safe_to_spend)

            if percent_of_safe is not None:
                percent_text = f", about {percent_of_safe * 100:.0f}% of your safe-to-spend room"
                if spend_level == "low":
                    return (
                        f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month"
                        f"{percent_text}, which is still a healthy range."
                    )
                if spend_level == "medium":
                    return (
                        f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month"
                        f"{percent_text}, so it is worth keeping an eye on."
                    )
                if category_name in fixed_essential:
                    return (
                        f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month"
                        f"{percent_text}, and because most of it is fixed it limits what you can safely spend elsewhere."
                    )
                return (
                    f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month"
                    f"{percent_text}, so it is taking a meaningful share of your buffer."
                )

            if category_name in fixed_essential:
                return f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month, and most of it is hard to avoid."
            if category_name in discretionary:
                return f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month."
            if category_name in mixed:
                return f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month, so the pace here matters."
            return f"This has reduced your available buffer by {_fmt_money(current_total)} so far this month."

        def _category_coaching_line(
            category: str,
            *,
            has_previous_data: bool,
            current_total: float,
            previous_total: float,
            current_tx_count: int,
            current_avg_spend: float,
            safe_to_spend: float | None,
        ) -> str:
            category_name = str(category).strip()
            fixed_essential = {"Bills", "Rent", "Utilities", "Insurance"}
            mixed = {"Groceries", "Transportation"}
            spend_level, _ = _category_spend_evaluation(current_total, safe_to_spend)

            if category_name == "Food" or category_name == "Dining":
                if spend_level == "low":
                    return (
                        f"You've made {current_tx_count} restaurant purchases so far and spent {_fmt_money(current_total)}. "
                        "That is still within a healthy range, so the main goal is just to keep the current pace steady."
                    )
                if spend_level == "medium":
                    return (
                        f"You've made {current_tx_count} restaurant purchases so far and spent {_fmt_money(current_total)}. "
                        "This is still reasonable, but keeping it to roughly the current pace would help protect your buffer."
                    )
                if has_previous_data and current_total > previous_total:
                    return (
                        f"You've made {current_tx_count} restaurant purchases so far and spent {_fmt_money(current_total)}. "
                        "Reducing that pace by one or two meals this week or swapping in a lower-cost option would help rebuild your buffer."
                    )
                return (
                    f"You've spent {_fmt_money(current_total)} across {current_tx_count} restaurant purchases so far. "
                    "Keeping the next one or two meals lower-cost would help keep this category in check."
                )
            if category_name == "Entertainment":
                if spend_level == "low":
                    return (
                        f"You're averaging about {_fmt_money(current_avg_spend)} per entertainment purchase. "
                        "This is still in a healthy range, so no major change is needed if the current pace holds."
                    )
                if spend_level == "medium":
                    return (
                        f"You're averaging about {_fmt_money(current_avg_spend)} per entertainment purchase. "
                        "This still looks manageable, but choosing a lower-cost plan for the next outing would protect more buffer."
                    )
                return (
                    f"You're averaging about {_fmt_money(current_avg_spend)} per entertainment purchase. "
                    "Skipping one outing or choosing a lower-cost plan this week would free up more buffer quickly."
                )
            if category_name == "Shopping":
                if spend_level == "low":
                    return (
                        f"You've spent {_fmt_money(current_total)} here so far. "
                        "This is still within a healthy range, so the best move is simply to keep impulse purchases in check."
                    )
                if spend_level == "medium":
                    return (
                        f"You've spent {_fmt_money(current_total)} here so far. "
                        "This is reasonable, but delaying the next nonessential purchase would help keep more room in your buffer."
                    )
                return (
                    f"You've spent {_fmt_money(current_total)} here so far. "
                    "Delaying one nonessential purchase before buying again is the simplest way to protect more buffer."
                )
            if category_name in fixed_essential:
                if spend_level == "low":
                    return (
                        f"You've already spent {_fmt_money(current_total)} here, and it still looks well contained. "
                        "This category does not need attention right now unless the bill changes."
                    )
                if spend_level == "medium":
                    return (
                        f"You've already spent {_fmt_money(current_total)} here, and it looks reasonable for a mostly fixed cost. "
                        "If you want extra room, review one bill or provider rather than trying to cut this category much."
                    )
                return (
                    f"You've already spent {_fmt_money(current_total)} here, and most of it looks fixed. "
                    "Focus on optimizing one bill or provider rather than trying to cut this category much."
                )
            if category_name in mixed:
                if category_name == "Groceries":
                    if spend_level == "low":
                        return (
                            f"You've made {current_tx_count} grocery trips averaging about {_fmt_money(current_avg_spend)} each. "
                            "That is still in a healthy range, so this is more about maintaining the current pace than cutting back."
                        )
                    if spend_level == "medium":
                        return (
                            f"You've made {current_tx_count} grocery trips averaging about {_fmt_money(current_avg_spend)} each. "
                            "This is reasonable, but tightening one trip or shifting a few items to a lower-cost store would preserve more buffer."
                        )
                    return (
                        f"You've made {current_tx_count} grocery trips averaging about {_fmt_money(current_avg_spend)} each. "
                        "Planning one tighter trip or shifting a few items to a lower-cost store would create some room without cutting essentials."
                    )
                if spend_level == "low":
                    return (
                        f"You're averaging about {_fmt_money(current_avg_spend)} per transportation purchase. "
                        "This is still within a healthy range, so no major adjustment is needed right now."
                    )
                if spend_level == "medium":
                    return (
                        f"You're averaging about {_fmt_money(current_avg_spend)} per transportation purchase. "
                        "This is manageable, but combining a few trips would help protect more buffer."
                    )
                return (
                    f"You're averaging about {_fmt_money(current_avg_spend)} per transportation purchase. "
                    "Combining trips or trimming a few low-value rides would be the most practical adjustment here."
                )
            if spend_level == "low":
                return (
                    f"You've spent {_fmt_money(current_total)} in this category so far. "
                    "That is still within a healthy range, so the goal is just to keep the current pace steady."
                )
            if spend_level == "medium":
                return (
                    f"You've spent {_fmt_money(current_total)} in this category so far. "
                    "This still looks reasonable, but keeping a close eye on the next few purchases would help protect your buffer."
                )
            return (
                f"You've spent {_fmt_money(current_total)} in this category so far. "
                "Cutting one or two lower-value purchases is the simplest place to start."
            )

        def _render_category_explanation(resp: dict):
            category = str(resp.get("category", "")).strip() or "This category"
            explanation = str(resp.get("explanation", "")).strip()
            has_previous_data = bool(resp.get("has_previous_data", False))
            if explanation:
                st.write(explanation)
            else:
                st.write(f"No comparison summary is available for {category}.")

            current_total = float(resp.get("current_month_total", 0.0))
            previous_total = float(resp.get("previous_month_total", 0.0))
            dollar_change = float(resp.get("dollar_change", current_total - previous_total))
            percent_change = resp.get("percent_change")
            current_tx_count = int(resp.get("current_transaction_count", 0))
            previous_tx_count = int(resp.get("previous_transaction_count", 0))
            current_avg_spend = float(resp.get("current_avg_spend", 0.0))
            previous_avg_spend = float(resp.get("previous_avg_spend", 0.0))
            top_merchants = resp.get("top_merchants", []) or []
            safe_to_spend = _load_category_safe_to_spend()
            spend_level, _ = _category_spend_evaluation(current_total, safe_to_spend)

            st.caption(
                _category_interpretation_line(
                    category,
                    has_previous_data=has_previous_data,
                    current_total=current_total,
                    previous_total=previous_total,
                    spend_level=spend_level,
                )
            )
            st.caption(
                _category_pattern_insight(
                    category,
                    top_merchants=top_merchants,
                    current_tx_count=current_tx_count,
                    current_avg_spend=current_avg_spend,
                )
            )
            st.caption(_category_buffer_impact_line(category, current_total=current_total, safe_to_spend=safe_to_spend))
            st.write("**How to improve this**")
            st.write(
                _category_coaching_line(
                    category,
                    has_previous_data=has_previous_data,
                    current_total=current_total,
                    previous_total=previous_total,
                    current_tx_count=current_tx_count,
                    current_avg_spend=current_avg_spend,
                    safe_to_spend=safe_to_spend,
                )
            )

            with st.expander("Details", expanded=False):
                st.write(f"Spent this month: {_fmt_money(current_total)}")
                if has_previous_data:
                    st.write(f"Spent last month: {_fmt_money(previous_total)}")
                else:
                    st.write("Spent last month: No previous month data yet.")

                if has_previous_data:
                    if percent_change is None:
                        st.write(f"Change vs last month: {_fmt_signed_money(dollar_change)}")
                    else:
                        st.write(
                            f"Change vs last month: {_fmt_signed_money(dollar_change)} ({float(percent_change):+.1f}%)"
                        )

                if has_previous_data:
                    if current_tx_count == previous_tx_count:
                        st.write(f"You made {current_tx_count} transactions this month, the same as last month.")
                    elif current_tx_count > previous_tx_count:
                        st.write(
                            f"You made {current_tx_count} transactions this month, up from {previous_tx_count} last month."
                        )
                    else:
                        st.write(
                            f"You made {current_tx_count} transactions this month, down from {previous_tx_count} last month."
                        )
                else:
                    st.write(f"You made {current_tx_count} transactions this month.")

                if has_previous_data:
                    st.write(
                        f"Average transaction size: {_fmt_money(current_avg_spend)} "
                        f"vs {_fmt_money(previous_avg_spend)} last month"
                    )
                else:
                    st.write(f"Average transaction size: {_fmt_money(current_avg_spend)}")

                if top_merchants:
                    st.write("Biggest contributors")
                    for merchant in top_merchants:
                        st.write(
                            f"- {merchant.get('merchant', 'Unknown')}: "
                            f"{_fmt_signed_money(float(merchant.get('dollar_change', 0.0)))}"
                        )

        def _load_financial_overview():
            insights_key = f"{st.session_state.user_id}:{as_of_str}:monthly:insights"
            if st.session_state.get("insights_cache_key") != insights_key:
                try:
                    resp = backend_get(
                        f"{BASE_URL}/insights",
                        params={"user_id": st.session_state.user_id, "period": "monthly", "as_of": as_of_str},
                        timeout=10,
                    )
                    if not resp.ok:
                        show_http_error(resp)
                        raise RuntimeError("GET /insights failed")
                    st.session_state.insights_cache = resp.json()
                    st.session_state.insights_cache_key = insights_key

                    t_resp = backend_get(
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

            return (
                st.session_state.get("insights_cache", {}) or {},
                st.session_state.get("trends_cache", {}) or {},
            )

        def _render_financial_overview(insights: dict, trends: dict):
            if not insights:
                return

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
                st.dataframe(spend_df, width="stretch")
            else:
                st.write("No spending by category yet.")

            msg = insights.get("coach_message", {})
            st.write("Coach message")
            st.write(msg.get("net_msg", ""))
            st.write(msg.get("spending_msg", ""))
            st.write(msg.get("tip", ""))

            st.write("Monthly trends")
            st.write(trends.get("message", ""))
            st.write(f"This month spending: ${float(trends.get('this_period_spending', 0)):,.2f}")
            st.write(f"Last month spending: ${float(trends.get('last_period_spending', 0)):,.2f}")

            spike_cat = trends.get("biggest_spike_category")
            spike_amt = trends.get("biggest_spike_amount", 0)
            if spike_cat:
                st.write(f"Biggest increase: {spike_cat} (+${spike_amt:.2f})")
    
        st.text_input("Ask Insighta", key="insight_question")
        helper_text = (
            "I'll explain what's happening with your money and what matters most right now."
            if beginner_mode
            else "I analyze your transactions, find what changed, and help you decide what to do next."
        )
        st.caption(helper_text)
    
        cols = st.columns(4)
        cols[0].button("Explain this month", on_click=_set_question, args=("Explain this month",))
        cols[1].button("What's driving Food?", on_click=_set_question, args=("What's driving Food?",))
        cols[2].button("What should I change this week?", on_click=_set_question, args=("What should I change this week?",))
    
        st.subheader("What's driving this category?")
        explain_category = st.selectbox("Category", SPEND_CATEGORIES, key="insights_explain_category")
        if st.button("Explain this category"):
            try:
                st.session_state.last_insights_mode = "coach"
                resp = backend_get(
                    f"{BASE_URL}/explain/category",
                    params={
                        "user_id": st.session_state.user_id,
                        "category": explain_category,
                        "period": "monthly",
                        "as_of": as_of_str,
                    },
                    timeout=10,
                )
                if not resp.ok:
                    show_http_error(resp)
                    raise RuntimeError("GET /explain/category failed")
                else:
                    st.session_state.category_explanation = resp.json() or {}
                    st.session_state.category_explanation_key = (
                        f"{st.session_state.user_id}:{explain_category}:{as_of_str}:monthly"
                    )
            except Exception as e:
                st.code(str(e))
    
        explain_key = f"{st.session_state.user_id}:{explain_category}:{as_of_str}:monthly"
        if st.session_state.get("category_explanation_key") == explain_key:
            category_explanation = st.session_state.get("category_explanation") or {}
            if category_explanation:
                _render_category_explanation(category_explanation)
    
        st.divider()
        st.subheader("Can I afford this?")
        afford_cols = st.columns([2, 1])
        afford_amount = afford_cols[0].number_input(
            "Amount ($)",
            min_value=1.0,
            step=5.0,
            value=25.0,
            key="afford_amount",
        )
        wait_days = int(
            afford_cols[1].number_input(
                "Wait (days)",
                min_value=0,
                max_value=7,
                step=1,
                value=0,
                key="afford_wait_days",
            )
        )

        amount = float(afford_amount)
        afford_as_of_date = min(month_end, as_of_date + datetime.timedelta(days=wait_days))
        afford_as_of = afford_as_of_date.isoformat()
        afford_url = f"{BASE_URL}/afford"
        afford_payload = {
            "user_id": st.session_state.user_id,
            "period": "monthly",
            "as_of": afford_as_of,
            "amount": amount,
            "beginner_mode": beginner_mode,
        }
        afford_key = f"{st.session_state.user_id}:{afford_as_of}:{amount:.2f}:{int(beginner_mode)}:afford"
        if st.session_state.get("afford_live_key") != afford_key:
            try:
                afford_resp = backend_post(afford_url, json=afford_payload, timeout=10)
                if not afford_resp.ok:
                    raise RuntimeError("POST /afford failed")
                st.session_state.afford_live_data = afford_resp.json() or {}
                st.session_state.afford_live_error = ""
                st.session_state.afford_live_key = afford_key
            except Exception as e:
                st.session_state.afford_live_data = {}
                st.session_state.afford_live_error = str(e)
                st.session_state.afford_live_key = afford_key

        breakdown_key = f"{st.session_state.user_id}:{afford_as_of}:cash_breakdown"
        if st.session_state.get("afford_breakdown_key") != breakdown_key:
            try:
                cash_resp = backend_get(
                    f"{BASE_URL}/forecast/cash",
                    params={
                        "user_id": st.session_state.user_id,
                        "period": "monthly",
                        "as_of": afford_as_of,
                        "starting_balance": 0.0,
                    },
                    timeout=8,
                )
                if cash_resp.ok:
                    st.session_state.afford_breakdown_data = cash_resp.json() or {}
                else:
                    st.session_state.afford_breakdown_data = {}
                st.session_state.afford_breakdown_key = breakdown_key
            except Exception:
                st.session_state.afford_breakdown_data = {}
                st.session_state.afford_breakdown_key = breakdown_key

        afford_data = st.session_state.get("afford_live_data") or {}
        afford_error = st.session_state.get("afford_live_error", "")
        afford_breakdown = st.session_state.get("afford_breakdown_data") or {}
        if afford_data:
            _render_afford_response(afford_data, cash_breakdown=afford_breakdown)
        elif afford_error:
            st.code(afford_error)
    
        ask_clicked = st.session_state.insight_ask_now
        if ask_clicked:
            st.session_state.insight_ask_now = False
            try:
                question = st.session_state.insight_question or ""
                parsed_amount = _parse_amount_from_text(question) if "afford" in question.lower() else None
                if parsed_amount is not None:
                    st.session_state.last_insights_mode = "afford"
                    afford_url = f"{BASE_URL}/afford"
                    afford_payload = {
                        "user_id": st.session_state.user_id,
                        "period": "monthly",
                        "as_of": as_of_str,
                        "amount": float(parsed_amount),
                        "beginner_mode": beginner_mode,
                    }
                    afford_resp = backend_post(afford_url, json=afford_payload, timeout=10)
                    if not afford_resp.ok:
                        show_http_error(afford_resp)
                        raise RuntimeError("POST /afford failed")

                    afford_data = afford_resp.json() or {}
                    _render_afford_response(afford_data)
                else:
                    st.session_state.last_insights_mode = "coach"
                    bundle_resp = backend_get(
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
    
                    coach_resp = backend_post(
                        f"{BASE_URL}/coach/respond",
                        json={
                            "question": question,
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
                        st.write("Why:")
                        for item in why_items[:2]:
                            st.write(f"- {item}")
                    impact = coach.get("impact", "")
                    if impact:
                        st.write("Impact:")
                        st.write(impact)
                    next_step = coach.get("next_step", "")
                    if next_step:
                        st.write("Next step:")
                        st.write(next_step)
                    data_note = coach.get("data_note", "")
                    if data_note:
                        st.write(data_note)
            except Exception as e:
                st.code(str(e))
    
        insights, trends = _load_financial_overview()
        if insights:
            with st.expander("Financial overview", expanded=False):
                _render_financial_overview(insights, trends)
    
    
    # ============================================================
    # Budget Report tab
    # ============================================================
    with tab_report:
        st.subheader("Am I on track?")
        st.caption(f"Showing {month_start.strftime('%B %Y')}")
        report_period = "monthly"

        def _budget_status(pct_used: float) -> str:
            if pct_used < 70.0:
                return "On track"
            if pct_used <= 100.0:
                return "Getting close"
            return "Over budget"

        def _budget_coaching_message(status: str) -> str:
            if status == "On track":
                return "You're comfortably within your plan here."
            if status == "Getting close":
                return "You're approaching your budget—worth keeping an eye on."
            return "You've exceeded your budget here—consider adjusting spending."
    
        report_key = f"{st.session_state.user_id}:{as_of_str}:monthly:report"
        if st.session_state.get("report_cache_key") != report_key:
            try:
                as_of = as_of_str
                report = api_get_budget_report(report_period, as_of)
                st.session_state.report_cache = report
                st.session_state.report_cache_key = report_key
            except Exception as e:
                st.code(str(e))
    
        tx_key = f"{st.session_state.user_id}:{month_start.isoformat()}:{as_of_str}:tx"
        if st.session_state.get("tx_cache_key") != tx_key:
            try:
                data = api_get_transactions(month_start.isoformat(), as_of_str)
                st.session_state.tx_cache = data.get("transactions", [])
                st.session_state.tx_cache_key = tx_key
            except Exception as e:
                st.code(str(e))

        report = st.session_state.get("report_cache", {}) or {}
        saved_rows = report.get("rows", []) or []
        tx_rows = st.session_state.get("tx_cache", []) or []

        spend_by_category = {cat: 0.0 for cat in SPEND_CATEGORIES}
        for tx in tx_rows:
            category = str(tx.get("category", "")).strip()
            if category in spend_by_category and category != "Income":
                spend_by_category[category] += abs(float(tx.get("amount", 0.0) or 0.0))

        budget_map = DEFAULT_MONTHLY_CATEGORY_BUDGETS.copy()
        report_map = {}
        for row in saved_rows:
            category = str(row.get("category", "")).strip()
            if category in SPEND_CATEGORIES:
                report_map[category] = row
                budget_map[category] = float(row.get("budget", budget_map.get(category, 0.0)))

        if not saved_rows:
            st.caption("Using default monthly category budgets until you save your own budget.")

        tracking_rows = []
        for category in SPEND_CATEGORIES:
            budget_amount = float(budget_map.get(category, 0.0))
            report_row = report_map.get(category, {})
            spent_amount = float(report_row.get("spent_ptd", spend_by_category.get(category, 0.0)))
            pct_used = (spent_amount / budget_amount * 100.0) if budget_amount > 0 else 0.0
            status = _budget_status(pct_used)
            tracking_rows.append(
                {
                    "Category": category,
                    "Budget": budget_amount,
                    "Spent this month": spent_amount,
                    "% Used": pct_used,
                    "Status": status,
                    "Coach": _budget_coaching_message(status),
                }
            )

        tracking_df = pd.DataFrame(tracking_rows).sort_values("% Used", ascending=False)
        tracking_display = tracking_df.copy()
        tracking_display["Budget"] = tracking_display["Budget"].map(lambda x: f"${float(x):,.2f}")
        tracking_display["Spent this month"] = tracking_display["Spent this month"].map(lambda x: f"${float(x):,.2f}")
        tracking_display["% Used"] = tracking_display["% Used"].map(lambda x: f"{float(x):.0f}%")
        st.dataframe(tracking_display, width="stretch")

        over_budget = tracking_df[tracking_df["Status"] == "Over budget"]["Category"].tolist()
        getting_close = tracking_df[tracking_df["Status"] == "Getting close"]["Category"].tolist()

        if over_budget:
            st.error("Over budget: " + ", ".join(over_budget))
        elif getting_close:
            st.warning("Getting close: " + ", ".join(getting_close))
        else:
            st.success("You're on track across all categories right now.")
    
    
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
    
                cash_resp = backend_get(
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
    
            st.dataframe(fdf_display, width="stretch")
    
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
            {"Metric": "Target pace (cumulative by today)", "Value": target_spend_to_date},
            {"Metric": "Safe to spend per day (rest of period)", "Value": safe_to_spend_per_day_budget},
            {"Metric": "Forecast spending (total)", "Value": forecast_spending_total},
            {"Metric": "Forecast end balance", "Value": forecast_end_balance},
        ]
    
        sdf = pd.DataFrame(summary_rows)
        sdf["Value"] = sdf["Value"].map(lambda x: f"${float(x):,.2f}")
        st.dataframe(sdf, width="stretch")
    
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
            ps["date"] = ps["date"].dt.normalize()
            ps = ps.set_index("date")
            ps = ps.groupby(level=0).last().sort_index()
    
            chart_df = ps[["cum_spend", "cum_target"]].copy().reset_index()
            chart_df = chart_df.rename(columns={"cum_spend": "Actual (cumulative)", "cum_target": "Target (cumulative)"})
            chart_long = chart_df.melt("date", var_name="Series", value_name="Amount")
    
            chart = (
                alt.Chart(chart_long)
                .mark_line()
                .encode(
                    x=alt.X("date:T", title="Date", timeUnit="yearmonthdate"),
                    y=alt.Y("Amount:Q", title="Amount"),
                    color=alt.Color("Series:N", title=None),
                )
            )
            st.altair_chart(chart, width="stretch")
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
                msg = (
                    f"Target pace so far: ${target_spend_to_date:,.2f}. "
                    f"Actual spending so far: ${spending_to_date:,.2f}. "
                    f"You are ${above_pace_amount:,.2f} above pace right now. "
                    f"With {days_remaining} days left, your budget-based safe-to-spend is "
                    f"${safe_to_spend_per_day_budget:,.2f}/day."
                )
            else:
                msg = (
                    f"Target pace so far: ${target_spend_to_date:,.2f}. "
                    f"Actual spending so far: ${spending_to_date:,.2f}. "
                    f"You are ${abs(above_pace_amount):,.2f} under pace right now. "
                    f"With {days_remaining} days left, your budget-based safe-to-spend is "
                    f"${safe_to_spend_per_day_budget:,.2f}/day."
                )
    
            st.markdown(f"<div style='color: inherit;'>{msg}</div>", unsafe_allow_html=True)
            st.markdown(
                f"<div style='color: inherit;'>Current averages: income ≈ ${income_daily:,.2f}/day, "
                f"spending ≈ ${spend_daily_current:,.2f}/day.</div>",
                unsafe_allow_html=True,
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
                st.dataframe(ddf, width="stretch")
            else:
                st.write("No categories are above pace right now.")
    
        # end-balance headline
        st.divider()
        if forecast_end_balance < 0:
            st.warning(f"Projected end balance: **-${abs(forecast_end_balance):,.2f}**")
        else:
            st.success(f"Projected end balance: **${forecast_end_balance:,.2f}**")

try:
    run_app()
except Exception as e:
    traceback.print_exc()
    st.error(f"Frontend error: {e}")
