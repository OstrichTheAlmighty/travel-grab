import datetime
import calendar
import traceback
import os
import json
import pandas as pd
import streamlit as st
import requests
import altair as alt
import re
from types import SimpleNamespace
from urllib.parse import urlparse

print("FRONTEND START", flush=True)

DEMO_LOCAL_ONLY = os.environ.get("DEMO_LOCAL_ONLY", "1").strip() != "0"
BASE_URL = os.environ.get("BACKEND_URL", "").rstrip("/")
BACKEND_TIMEOUT_SECONDS = 10
AI_EXPLANATION_TIMEOUT_SECONDS = 3

def run_app():
    legacy_user_id = str(st.session_state.get("user_id", "default")).strip() or "default"
    if "entered_user_id" not in st.session_state:
        st.session_state.entered_user_id = legacy_user_id
    if "site_page" not in st.session_state:
        st.session_state.site_page = "Home"
    if "demo_mode" not in st.session_state:
        st.session_state.demo_mode = False
    if "last_real_user_id" not in st.session_state:
        st.session_state.last_real_user_id = "default"
    if "debug_mode" not in st.session_state:
        st.session_state.debug_mode = False
    if "public_demo_bootstrapped" not in st.session_state:
        st.session_state.public_demo_bootstrapped = False
    
    st.set_page_config(page_title="AI Finance Coach", layout="wide")
    product_name = "AI Finance Coach"
    
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

    DEMO_USER_ID = "demo"

    def active_user_id() -> str:
        if st.session_state.get("demo_mode", False):
            return DEMO_USER_ID
        return str(st.session_state.get("entered_user_id", "default")).strip() or "default"

    st.sidebar.caption("Public demo")
    st.sidebar.caption("This experience uses sample transactions and a sample budget.")
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
    
    
    _local_backend_module = None

    def use_local_backend() -> bool:
        return bool(DEMO_LOCAL_ONLY or st.session_state.get("demo_mode", False))

    def get_local_backend():
        nonlocal _local_backend_module
        if _local_backend_module is None:
            from backend import main as backend_main
            _local_backend_module = backend_main
        return _local_backend_module

    def _ensure_http_backend_url():
        if not BASE_URL:
            raise RuntimeError("BACKEND_URL is required when DEMO_LOCAL_ONLY=0.")

    def _run_local_without_external_http(callable_obj, *call_args, **call_kwargs):
        backend = get_local_backend()
        original_generate_ai = getattr(backend, "generate_ai_explanation", None)
        original_api_key = os.environ.get("GOOGLE_API_KEY")
        try:
            if hasattr(backend, "generate_ai_explanation"):
                backend.generate_ai_explanation = lambda prompt: None
            os.environ.pop("GOOGLE_API_KEY", None)
            return callable_obj(*call_args, **call_kwargs)
        finally:
            if original_generate_ai is not None:
                backend.generate_ai_explanation = original_generate_ai
            if original_api_key is None:
                os.environ.pop("GOOGLE_API_KEY", None)
            else:
                os.environ["GOOGLE_API_KEY"] = original_api_key

    class LocalBackendResponse:
        def __init__(self, *, method: str, url: str, status_code: int, data=None, text: str = ""):
            self.status_code = int(status_code)
            self.ok = 200 <= self.status_code < 300
            self._data = data
            self.text = text or (json.dumps(data, default=str) if data is not None else "")
            self.reason = "OK" if self.ok else "ERROR"
            self.request = SimpleNamespace(method=method, url=url)

        def json(self):
            return self._data

    def _local_backend_call(method: str, url: str, *, params=None, payload=None):
        backend = get_local_backend()
        path = urlparse(url).path
        params = dict(params or {})
        payload = dict(payload or {})

        try:
            if method == "GET" and path == "/transactions":
                data = backend.transactions(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    start=params.get("start"),
                    end=params.get("end"),
                )
            elif method == "POST" and path == "/transactions":
                data = backend.add_transaction(backend.NewTransaction(**payload))
            elif method == "DELETE" and path == "/transactions":
                data = backend.clear_transactions(user_id=params.get("user_id", backend.USER_DEFAULT))
            elif method == "POST" and path == "/transactions/sample-month":
                data = backend.load_sample_month(backend.SampleMonthIn(**payload))
            elif method == "GET" and path == "/budget/active":
                data = backend.budget_active(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    period=params.get("period"),
                )
            elif method == "POST" and path == "/budget":
                data = backend.budget_upsert(backend.BudgetUpsertIn(**payload))
            elif method == "GET" and path == "/budget/report":
                data = backend.budget_report(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    period=params.get("period", "weekly"),
                    as_of=params.get("as_of"),
                )
            elif method == "GET" and path == "/forecast/eop":
                data = backend.forecast_eop(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    period=params.get("period", "monthly"),
                    as_of=params.get("as_of"),
                )
            elif method == "GET" and path == "/forecast/cash":
                data = backend.forecast_cash(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    period=params.get("period", "monthly"),
                    as_of=params.get("as_of"),
                    starting_balance=float(params.get("starting_balance", 0.0) or 0.0),
                )
            elif method == "GET" and path == "/insights":
                data = backend.insights(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    period=params.get("period", "monthly"),
                    as_of=params.get("as_of"),
                )
            elif method == "GET" and path == "/trends":
                data = backend.trends(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    period=params.get("period", "monthly"),
                    as_of=params.get("as_of"),
                )
            elif method == "GET" and path in {"/insights_bundle", "/insight_bundle"}:
                data = backend.insights_bundle(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    period=params.get("period", "monthly"),
                    as_of=params.get("as_of"),
                )
            elif method == "GET" and path == "/explain/category":
                data = backend.explain_category(
                    user_id=params.get("user_id", backend.USER_DEFAULT),
                    category=params.get("category", ""),
                    period=params.get("period", "monthly"),
                    as_of=params.get("as_of"),
                )
            elif method == "POST" and path == "/coach/respond":
                data = _run_local_without_external_http(backend.coach_respond, payload)
            elif method == "POST" and path == "/afford":
                data = _run_local_without_external_http(
                    backend.afford,
                    backend.AffordRequest(**payload),
                )
            elif method == "GET" and path == "/health":
                data = backend.health()
            else:
                return LocalBackendResponse(
                    method=method,
                    url=url,
                    status_code=404,
                    data={"detail": f"Unsupported local backend route: {method} {path}"},
                )

            return LocalBackendResponse(method=method, url=url, status_code=200, data=data)
        except Exception as e:
            print(
                "LOCAL BACKEND ERROR:",
                {"method": method, "path": path, "error": str(e)},
                flush=True,
            )
            return LocalBackendResponse(
                method=method,
                url=url,
                status_code=500,
                data={"detail": str(e)},
                text=traceback.format_exc(),
            )

    # -----------------------------
    # Debug helpers
    # -----------------------------
    def show_http_error(resp):
        st.error(f"HTTP {resp.status_code} — {resp.request.method} {resp.request.url}")
        try:
            st.json(resp.json())
        except Exception:
            st.code(resp.text)
    
    
    def backend_get(*args, **kwargs):
        kwargs.setdefault("timeout", BACKEND_TIMEOUT_SECONDS)
        print("BEFORE BACKEND CALL", flush=True)
        if use_local_backend():
            response = _local_backend_call(
                "GET",
                args[0],
                params=kwargs.get("params"),
            )
        else:
            _ensure_http_backend_url()
            response = requests.get(*args, **kwargs)
        print("AFTER BACKEND CALL", flush=True)
        return response
    
    
    def backend_post(*args, **kwargs):
        kwargs.setdefault("timeout", BACKEND_TIMEOUT_SECONDS)
        print("BEFORE BACKEND CALL", flush=True)
        if use_local_backend():
            response = _local_backend_call(
                "POST",
                args[0],
                payload=kwargs.get("json"),
            )
        else:
            _ensure_http_backend_url()
            response = requests.post(*args, **kwargs)
        print("AFTER BACKEND CALL", flush=True)
        return response
    
    
    def backend_delete(*args, **kwargs):
        kwargs.setdefault("timeout", BACKEND_TIMEOUT_SECONDS)
        print("BEFORE BACKEND CALL", flush=True)
        if use_local_backend():
            response = _local_backend_call(
                "DELETE",
                args[0],
                params=kwargs.get("params"),
            )
        else:
            _ensure_http_backend_url()
            response = requests.delete(*args, **kwargs)
        print("AFTER BACKEND CALL", flush=True)
        return response
    
    
    def api_get_budget_active():
        r = backend_get(
            f"{BASE_URL}/budget/active",
            params={"user_id": active_user_id()},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("GET /budget/active failed")
        return r.json()
    
    
    def api_save_budget(period, income_amount, allocations, *, show_errors: bool = True):
        payload = {
            "user_id": active_user_id(),
            "period": period,
            "income_amount": float(income_amount),
            "allocations": {k: float(v) for k, v in allocations.items()},
        }
        r = backend_post(f"{BASE_URL}/budget", json=payload, timeout=10)
        if not r.ok:
            if show_errors:
                show_http_error(r)
            raise RuntimeError("POST /budget failed")
        return r.json()
    
    
    def api_get_budget_report(period, as_of):
        r = backend_get(
            f"{BASE_URL}/budget/report",
            params={"user_id": active_user_id(), "period": period, "as_of": as_of},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("GET /budget/report failed")
        return r.json()
    
    
    def api_get_forecast(period, as_of):
        r = backend_get(
            f"{BASE_URL}/forecast/eop",
            params={"user_id": active_user_id(), "period": period, "as_of": as_of},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("GET /forecast/eop failed")
        return r.json()
    
    
    def api_get_transactions(start, end):
        r = backend_get(
            f"{BASE_URL}/transactions",
            params={"user_id": active_user_id(), "start": start, "end": end},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("GET /transactions failed")
        return r.json()
    
    
    def api_clear_transactions():
        r = backend_delete(
            f"{BASE_URL}/transactions",
            params={"user_id": active_user_id()},
            timeout=10,
        )
        if not r.ok:
            show_http_error(r)
            raise RuntimeError("DELETE /transactions failed")
        return r.json()


    def api_load_sample_month(as_of, *, show_errors: bool = True):
        r = backend_post(
            f"{BASE_URL}/transactions/sample-month",
            json={"user_id": active_user_id(), "as_of": as_of},
            timeout=10,
        )
        if not r.ok:
            if show_errors:
                show_http_error(r)
            raise RuntimeError("POST /transactions/sample-month failed")
        return r.json()
    
    
    def reset_data_caches():
        for key in [
            "tx_cache",
            "tx_cache_key",
            "insights_cache",
            "insights_cache_key",
            "insights_bundle_cache",
            "insights_bundle_cache_key",
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

    DEMO_BUDGET = {
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

    def activate_demo_mode(force: bool = False, *, show_errors: bool = True):
        entered_user = str(st.session_state.get("entered_user_id", "default")).strip() or "default"
        if entered_user != DEMO_USER_ID:
            st.session_state.last_real_user_id = entered_user
        st.session_state.demo_mode = True
        st.session_state.site_page = "Demo"
        demo_key = f"{DEMO_USER_ID}:{as_of_str}:monthly"
        if not force and st.session_state.get("demo_ready_key") == demo_key:
            return None

        api_save_budget("monthly", 3200.0, DEMO_BUDGET, show_errors=show_errors)
        out = api_load_sample_month(as_of_str, show_errors=show_errors)
        reset_data_caches()
        st.session_state.demo_ready_key = demo_key
        return int(out.get("loaded", 0))

    def deactivate_demo_mode():
        st.session_state.demo_mode = False
        reset_data_caches()

    if not st.session_state.get("public_demo_bootstrapped", False):
        landing_page = str(st.session_state.get("site_page", "Home")).strip() or "Home"
        st.session_state.public_demo_bootstrapped = True
        st.session_state.demo_mode = True
        try:
            activate_demo_mode(force=True, show_errors=False)
        except Exception:
            traceback.print_exc()
            st.session_state.demo_ready_key = ""
            reset_data_caches()
        st.session_state.site_page = landing_page

    def render_page_intro(title: str, subtitle: str):
        st.markdown(f"## {title}")
        st.caption(subtitle)

    def render_shell_footer():
        st.divider()
        foot_cols = st.columns([1, 1, 4])
        if foot_cols[0].button("Privacy", key="footer_privacy", use_container_width=True):
            st.session_state.site_page = "Privacy"
            st.rerun()
        if foot_cols[1].button("Feedback / About", key="footer_about", use_container_width=True):
            st.session_state.site_page = "Feedback / About"
            st.rerun()

    st.markdown(
        """
        <style>
        .block-container {
            max-width: 1180px;
            padding-top: 1.4rem;
            padding-bottom: 3rem;
        }
        div[data-testid="stButton"] > button {
            border-radius: 999px;
            border: 1px solid #d7dadd;
            padding: 0.55rem 1rem;
            font-weight: 600;
        }
        .product-shell {
            padding: 1rem 0 0.25rem 0;
        }
        .product-brand {
            font-size: 0.9rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #cbd5e1;
            margin-bottom: 0.35rem;
        }
        .product-title {
            font-size: 2.4rem;
            line-height: 1.05;
            font-weight: 700;
            color: #f8fafc;
            margin-bottom: 0.35rem;
        }
        .product-subtitle {
            color: #dbe4f0;
            max-width: 52rem;
            margin-bottom: 1rem;
        }
        .product-card {
            border: 1px solid rgba(148, 163, 184, 0.28);
            border-radius: 18px;
            padding: 1.1rem 1.15rem;
            background: rgba(15, 23, 42, 0.72);
            min-height: 100%;
        }
        .product-card h4 {
            margin: 0 0 0.35rem 0;
            color: #f8fafc;
        }
        .product-card p {
            margin: 0;
            color: #dbe4f0;
        }
        .demo-banner {
            border: 1px solid rgba(96, 165, 250, 0.35);
            background: rgba(30, 41, 59, 0.78);
            border-radius: 16px;
            padding: 0.8rem 0.95rem;
            margin: 0.25rem 0 1rem 0;
            color: #dbeafe;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    current_page = str(st.session_state.get("site_page", "Home")).strip() or "Home"
    allowed_pages = {"Home", "Demo", "Privacy", "Feedback / About"}
    if current_page not in allowed_pages:
        current_page = "Home"
        st.session_state.site_page = "Home"
    nav_pages = ["Home", "Demo"]

    st.markdown(
        f"""
        <div class="product-shell">
            <div class="product-brand">{product_name}</div>
            <div class="product-title">Money guidance that feels product-ready, not spreadsheet-heavy.</div>
            <div class="product-subtitle">
                Understand where your cash is going, decide what you can safely buy, and stay on pace without connecting a real bank account.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    nav_cols = st.columns([1.0, 1.0, 5.0])
    for idx, page_name in enumerate(nav_pages):
        button_type = "primary" if current_page == page_name else "secondary"
        if nav_cols[idx].button(page_name, key=f"nav_{page_name}", type=button_type, use_container_width=True):
            st.session_state.site_page = page_name
            st.rerun()

    if st.session_state.get("demo_mode", False):
        st.markdown(
            """
            <div class="demo-banner">
                Public demo: you're viewing sample transactions, sample budgets, and simulated coaching only.
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.caption(f"Demo profile: `{DEMO_USER_ID}`")

    if current_page == "Home":
        hero_cols = st.columns([1.2, 1.0])
        with hero_cols[0]:
            render_page_intro(
                "Know what you can afford before you spend.",
                "Explore affordability guidance, spending insights, budget tracking, and forecasting using sample data.",
            )
            primary_cols = st.columns([1, 1.2, 2.8])
            if primary_cols[0].button("Try the demo", key="home_try_demo", type="primary", use_container_width=True):
                loaded = activate_demo_mode(force=True)
                st.session_state.site_page = "Demo"
                if loaded:
                    st.session_state.home_demo_message = f"Loaded {loaded} sample transactions for the demo."
                st.rerun()
            if primary_cols[1].button("See how it works", key="home_how_it_works", use_container_width=True):
                st.session_state.show_how_it_works = not bool(st.session_state.get("show_how_it_works", False))
            if st.session_state.get("home_demo_message"):
                st.success(st.session_state.pop("home_demo_message"))

            if st.session_state.get("show_how_it_works", False):
                step_cols = st.columns(3)
                step_cols[0].markdown(
                    "<div class='product-card'><h4>1. Load the demo</h4><p>Start with healthy sample data so you can explore the product without connecting anything.</p></div>",
                    unsafe_allow_html=True,
                )
                step_cols[1].markdown(
                    "<div class='product-card'><h4>2. Ask real questions</h4><p>Use affordability and category coaching to see what your current month can support.</p></div>",
                    unsafe_allow_html=True,
                )
                step_cols[2].markdown(
                    "<div class='product-card'><h4>3. Stay on track</h4><p>Set category budgets, monitor pace, and keep your spending buffer intact.</p></div>",
                    unsafe_allow_html=True,
                )

        with hero_cols[1]:
            st.markdown(
                """
                <div class="product-card">
                    <h4>What you can do here</h4>
                    <p>Check a purchase before you buy it, understand why a category is rising, and see whether you're still on budget this month.</p>
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.write("")
            st.markdown(
                """
                <div class="product-card">
                    <h4>Built for public demo use</h4>
                    <p>This shareable version uses sample data only. Every result stays tied to the same deterministic math already in the app.</p>
                </div>
                """,
                unsafe_allow_html=True,
            )

        st.divider()
        with st.expander("Privacy", expanded=False):
            st.write("No bank connection is enabled yet. Demo mode uses sample data only, and local testing stays inside this app workspace.")
        with st.expander("Feedback / About", expanded=False):
            st.write("AI Finance Coach is a local product shell around the existing affordability, insights, and budget coaching tools.")
            st.write("Feedback placeholder: add the flows you want users to trust first, then connect real accounts later.")
        return

    if current_page == "Privacy":
        render_page_intro("Privacy", "A simple placeholder while the product is still in local demo mode.")
        st.write("No live bank connection is enabled yet.")
        st.write("Demo mode loads sample data only.")
        st.write("This app currently operates as a local product prototype.")
        render_shell_footer()
        return

    if current_page == "Feedback / About":
        render_page_intro("Feedback / About", "A lightweight placeholder section for product context.")
        st.write("This product combines affordability coaching, spending insights, and budget tracking in one workspace.")
        st.write("The current focus is making the experience clear and trustworthy before adding account connection.")
        render_shell_footer()
        return

    if current_page == "Demo":
        render_page_intro(
            "Demo workspace",
            "Explore the full product using sample transactions and a sample monthly budget.",
        )
        if st.session_state.get("home_demo_message"):
            st.success(st.session_state.pop("home_demo_message"))
        if not st.session_state.get("demo_mode", False):
            if st.button("Start demo mode", key="demo_start", type="primary"):
                loaded = activate_demo_mode(force=True)
                if loaded:
                    st.success(f"Loaded {loaded} sample transactions for the demo.")
                st.rerun()
        elif st.button("Refresh demo data", key="demo_refresh"):
            loaded = activate_demo_mode(force=True)
            if loaded:
                st.success(f"Reloaded {loaded} sample transactions.")
            st.rerun()
    
    
    # -----------------------------
    # Tabs
    # -----------------------------
    print("BEFORE RENDER", flush=True)
    show_demo_workspace = current_page == "Demo"

    if show_demo_workspace:
        tab_tx, tab_afford, tab_insights, tab_budget, tab_forecast = st.tabs(
            ["Transactions", "Can I afford this?", "Spending Insights", "Budget", "Forecast"]
        )
    else:
        tab_tx = tab_afford = tab_insights = tab_budget = tab_forecast = None
    
    # ============================================================
    # Transactions tab
    # ============================================================
    if show_demo_workspace:
        with tab_tx:
            st.subheader("Transactions")
            st.caption(f"Showing {month_start.strftime('%B %Y')}")

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
                        "user_id": active_user_id(),
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
                    loaded = activate_demo_mode(force=True)
                    if loaded:
                        st.success(f"✅ Loaded {loaded} sample transactions for testing.")
                    else:
                        st.success("✅ Demo data is already loaded.")
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

            tx_key = f"{active_user_id()}:{month_start.isoformat()}:{as_of_str}:tx"
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
        if "selected_insight_action" not in st.session_state:
            st.session_state.selected_insight_action = ""
        if "insight_result_source" not in st.session_state:
            st.session_state.insight_result_source = ""
        if "last_insights_mode" not in st.session_state:
            st.session_state.last_insights_mode = ""
        if "insights_status_key" not in st.session_state:
            st.session_state.insights_status_key = ""
        if "insights_status_line" not in st.session_state:
            st.session_state.insights_status_line = ""
        if "insights_bundle_cache_key" not in st.session_state:
            st.session_state.insights_bundle_cache_key = ""
        if "insights_bundle_cache" not in st.session_state:
            st.session_state.insights_bundle_cache = {}
        if "insight_result" not in st.session_state:
            st.session_state.insight_result = {}

        def _load_monthly_bundle() -> dict:
            bundle_key = f"{active_user_id()}:{as_of_str}:monthly:bundle"
            if st.session_state.get("insights_bundle_cache_key") != bundle_key:
                try:
                    bundle_resp = backend_get(
                        f"{BASE_URL}/insight_bundle",
                        params={
                            "user_id": active_user_id(),
                            "period": "monthly",
                            "as_of": as_of_str,
                        },
                        timeout=6,
                    )
                    if bundle_resp.ok:
                        st.session_state.insights_bundle_cache = bundle_resp.json() or {}
                        st.session_state.insights_bundle_cache_key = bundle_key
                except Exception:
                    pass
            return st.session_state.get("insights_bundle_cache", {}) or {}

        # Proactive status line (lightweight)
        status_key = f"{active_user_id()}:{as_of_str}:monthly"
        if st.session_state.insights_status_key != status_key:
            try:
                bundle = _load_monthly_bundle()
                report = bundle.get("budget_report", {}) or {}
                cash = bundle.get("cash_forecast", {}) or {}
                over = report.get("over_budget", []) or []
                near = report.get("near_budget", []) or []
                top_above = cash.get("top_above_pace_categories", []) or []

                if over:
                    st.session_state.insights_status_line = f"You're over budget in {len(over)} categories."
                elif near or top_above:
                    st.session_state.insights_status_line = "One thing needs attention this week."
                else:
                    st.session_state.insights_status_line = "Nothing urgent this month."
                st.session_state.insights_status_key = status_key
            except Exception:
                pass
    
        if st.session_state.insights_status_line:
            st.caption(st.session_state.insights_status_line)

        beginner_mode = st.toggle("Beginner mode", value=True, key="insights_beginner_mode")
        st.caption(
            "Beginner mode keeps guidance shorter and simpler."
            if beginner_mode
            else "Analytical mode shows more pace, budget, and forecast detail."
        )
        debug_mode = bool(st.session_state.get("debug_mode", False))
    
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

        def _budget_status_meta(pct_used: float, *, projected_total: float | None = None, budget_amount: float = 0.0) -> tuple[str, str]:
            pct = float(pct_used or 0.0)
            projected = float(projected_total or 0.0)
            budget = float(budget_amount or 0.0)
            if budget > 0 and (pct > 100.0 or projected > budget):
                return "off_track", "off-track"
            if pct >= 70.0 or (budget > 0 and projected >= budget * 0.9):
                return "tight", "tight"
            return "healthy", "healthy"

        def _bundle_budget_row_map(bundle: dict) -> dict[str, dict]:
            report = bundle.get("budget_report", {}) or {}
            rows = report.get("rows", []) or []
            return {
                str(row.get("category", "")).strip(): row
                for row in rows
                if str(row.get("category", "")).strip()
            }

        def _compute_spending_driver(bundle: dict) -> dict | None:
            spending_by_category = bundle.get("spending_by_category", {}) or {}
            if not spending_by_category:
                return None

            row_map = _bundle_budget_row_map(bundle)
            candidate_rows = [row for row in row_map.values() if float((row or {}).get("budget", 0.0) or 0.0) > 0]
            has_budget_data = bool(candidate_rows)
            days_elapsed = max(1, (as_of_date - month_start).days + 1)
            days_total = max(days_elapsed, (month_end - month_start).days + 1)

            candidates: list[dict] = []
            for raw_category, raw_total in spending_by_category.items():
                category_name = str(raw_category).strip()
                current_total = float(raw_total or 0.0)
                if not category_name or current_total <= 0:
                    continue

                row = row_map.get(category_name, {})
                budget_amount = float((row or {}).get("budget", 0.0) or 0.0)
                pct_used = float((row or {}).get("pct_used", 0.0) or 0.0)
                projected_total = _projected_category_total(current_total)
                pace_allowed = budget_amount * (days_elapsed / days_total) if budget_amount > 0 else 0.0
                above_pace = current_total - pace_allowed if budget_amount > 0 else 0.0
                forecast_ratio = (projected_total / budget_amount) if budget_amount > 0 else 0.0
                pace_ratio = (current_total / pace_allowed) if pace_allowed > 0 else (1.0 if budget_amount > 0 else 0.0)
                status_key, status_label = _budget_status_meta(
                    pct_used,
                    projected_total=projected_total,
                    budget_amount=budget_amount,
                )
                severity = {"healthy": 0, "tight": 1, "off_track": 2}.get(status_key, 0)
                concern_score = float(current_total)
                if budget_amount > 0:
                    concern_score = (
                        severity * 10.0
                        + max(forecast_ratio, pct_used / 100.0) * 4.0
                        + max(0.0, pace_ratio - 1.0) * 2.0
                        + max(0.0, above_pace / max(budget_amount, 1.0))
                    )

                candidates.append(
                    {
                        "category": category_name,
                        "current_total": current_total,
                        "row": row,
                        "budget_amount": budget_amount,
                        "pct_used": pct_used,
                        "projected_total": projected_total,
                        "pace_allowed": pace_allowed,
                        "above_pace": above_pace,
                        "forecast_ratio": forecast_ratio,
                        "pace_ratio": pace_ratio,
                        "status_key": status_key,
                        "status_label": status_label,
                        "severity": severity,
                        "concern_score": concern_score,
                    }
                )

            if not candidates:
                return None

            if has_budget_data and any(float(item.get("budget_amount", 0.0) or 0.0) > 0 for item in candidates):
                ranked = [item for item in candidates if float(item.get("budget_amount", 0.0) or 0.0) > 0]
                ranked.sort(
                    key=lambda item: (
                        int(item.get("severity", 0)),
                        float(item.get("concern_score", 0.0)),
                        float(item.get("forecast_ratio", 0.0)),
                        float(item.get("pct_used", 0.0)),
                        float(item.get("current_total", 0.0)),
                    ),
                    reverse=True,
                )
                selection_mode = "budget"
            else:
                ranked = sorted(
                    candidates,
                    key=lambda item: float(item.get("current_total", 0.0)),
                    reverse=True,
                )
                selection_mode = "spend"

            leader = dict(ranked[0])
            runner_up = ranked[1] if len(ranked) > 1 else None
            leader["selection_mode"] = selection_mode
            leader["runner_up_category"] = str((runner_up or {}).get("category", "")).strip()
            leader["runner_up_total"] = float((runner_up or {}).get("current_total", 0.0) or 0.0)
            leader["gap_to_runner_up"] = float(leader.get("current_total", 0.0) or 0.0) - float(
                (runner_up or {}).get("current_total", 0.0) or 0.0
            )
            return leader

        def _build_monthly_summary(bundle: dict) -> dict:
            cash = bundle.get("cash_forecast", {}) or {}
            report = bundle.get("budget_report", {}) or {}
            driver = _compute_spending_driver(bundle)
            over = report.get("over_budget", []) or []
            near = report.get("near_budget", []) or []
            top_above = cash.get("top_above_pace_categories", []) or []
            forecast_end = float(cash.get("forecast_end_balance", 0.0) or 0.0)
            safe_per_day = float(cash.get("safe_to_spend_per_day_budget", 0.0) or 0.0)
            days_remaining = int(cash.get("days_remaining", 0) or 0)

            if forecast_end < 0 or over:
                on_track_line = (
                    "Not quite. Your current pace is likely to create pressure before month-end."
                    if beginner_mode
                    else f"Not quite. You're projected to end the month at {_fmt_money(forecast_end)}, and at least one category is already over budget."
                )
            elif near or top_above:
                on_track_line = (
                    "Mostly, but the month is getting tight."
                    if beginner_mode
                    else f"Mostly. You're still projected positive at {_fmt_money(forecast_end)}, but one category is starting to squeeze the rest of the month."
                )
            else:
                on_track_line = (
                    "Yes. This month still looks on track."
                    if beginner_mode
                    else f"Yes. You're projected to finish around {_fmt_money(forecast_end)} with about {_fmt_money(safe_per_day)}/day of safe room left."
                )

            if driver:
                category_name = str(driver.get("category", "")).strip()
                current_total = float(driver.get("current_total", 0.0) or 0.0)
                budget_amount = float(driver.get("budget_amount", 0.0) or 0.0)
                pct_used = float(driver.get("pct_used", 0.0) or 0.0)
                above_pace = float(driver.get("above_pace", 0.0) or 0.0)
                runner_up_category = str(driver.get("runner_up_category", "")).strip()
                runner_up_total = float(driver.get("runner_up_total", 0.0) or 0.0)
                selection_mode = str(driver.get("selection_mode", "spend")).strip()

                if selection_mode == "budget" and budget_amount > 0 and above_pace > 0:
                    focus_line = (
                        f"The category to watch right now is {category_name}. It's running ahead of plan."
                        if beginner_mode
                        else f"The category to watch right now is {category_name}: you've spent {_fmt_money(current_total)}, it's about {_fmt_money(above_pace)} above pace, and it's at {pct_used:.0f}% of its {_fmt_money(budget_amount)} budget."
                    )
                elif selection_mode == "budget" and budget_amount > 0:
                    focus_line = (
                        f"The category to watch right now is {category_name}. It's taking the biggest share of its budget."
                        if beginner_mode
                        else f"The category to watch right now is {category_name}: you've spent {_fmt_money(current_total)}, or {pct_used:.0f}% of its {_fmt_money(budget_amount)} budget, which is the most concerning budget position this month."
                    )
                elif runner_up_category:
                    focus_line = (
                        f"The category to watch right now is {category_name}. It's your biggest spending category so far."
                        if beginner_mode
                        else f"The category to watch right now is {category_name}: you've spent {_fmt_money(current_total)} there so far versus {_fmt_money(runner_up_total)} in {runner_up_category}."
                    )
                else:
                    focus_line = (
                        f"The category to watch right now is {category_name}."
                        if beginner_mode
                        else f"The category to watch right now is {category_name} at {_fmt_money(current_total)} spent so far."
                    )
            else:
                focus_line = "Not enough data yet to determine what's driving your spending."

            if forecast_end < 0:
                urgent_line = (
                    "Yes. The current pace could leave you short before the month ends."
                    if beginner_mode
                    else f"Yes. Your projected end balance is {_fmt_money(forecast_end)}, so the current pace is not sustainable."
                )
            elif over:
                labels = ", ".join(over[:2])
                urgent_line = (
                    f"Yes. {labels} needs attention now."
                    if beginner_mode
                    else f"Yes. {labels} {'is' if len(over[:2]) == 1 else 'are'} already over budget and should be the first correction."
                )
            elif near or top_above:
                urgent_line = (
                    "Not urgent, but one category is getting close to the line."
                    if beginner_mode
                    else f"Nothing is broken yet, but you only have {days_remaining} days left and one category is already tightening the plan."
                )
            else:
                urgent_line = "No. Nothing urgent stands out right now."

            return {
                "on_track_line": on_track_line,
                "focus_line": focus_line,
                "urgent_line": urgent_line,
            }

        def _render_monthly_summary(bundle: dict):
            if not bundle:
                return
            summary = _build_monthly_summary(bundle)
            st.subheader("This month at a glance")
            col1, col2, col3 = st.columns(3)
            with col1:
                st.caption("On track?")
                st.write(summary.get("on_track_line", ""))
            with col2:
                st.caption("What matters most?")
                st.write(summary.get("focus_line", ""))
            with col3:
                st.caption("Anything urgent?")
                st.write(summary.get("urgent_line", ""))
    
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
            cache_key = f"{active_user_id()}:{as_of_str}:{int(beginner_mode)}:category_safe_to_spend"
            if st.session_state.get("category_safe_to_spend_key") == cache_key:
                cached_value = st.session_state.get("category_safe_to_spend")
                return None if cached_value is None else float(cached_value)

            safe_to_spend = None
            cash_context = None
            afford_breakdown_key = str(st.session_state.get("afford_breakdown_key", "")).strip()
            afford_breakdown_data = st.session_state.get("afford_breakdown_data") or {}
            breakdown_key = f"{active_user_id()}:{as_of_str}:cash_breakdown"
            if afford_breakdown_data and afford_breakdown_key == breakdown_key:
                cash_context = afford_breakdown_data
            else:
                try:
                    cash_resp = backend_get(
                        f"{BASE_URL}/forecast/cash",
                        params={
                            "user_id": active_user_id(),
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

        def _category_budget_pace_line(category: str, current_total: float) -> str:
            bundle = _load_monthly_bundle()
            row = _bundle_budget_row_map(bundle).get(str(category).strip(), {})
            budget_amount = float((row or {}).get("budget", 0.0) or 0.0)
            pct_used = float((row or {}).get("pct_used", 0.0) or 0.0)
            if budget_amount <= 0:
                return ""

            days_elapsed = max(1, (as_of_date - month_start).days + 1)
            days_total = max(days_elapsed, (month_end - month_start).days + 1)
            projected_total = float(current_total) / float(days_elapsed) * float(days_total)
            status_key, status_label = _budget_status_meta(
                pct_used,
                projected_total=projected_total,
                budget_amount=budget_amount,
            )

            if status_key == "off_track":
                return (
                    f"Budget pace: {category} looks off-track. You've used {pct_used:.0f}% of your "
                    f"{_fmt_money(budget_amount)} budget, and this pace points to about {_fmt_money(projected_total)} for the month."
                )
            if status_key == "tight":
                return (
                    f"Budget pace: {category} looks tight. You've used {pct_used:.0f}% of your "
                    f"{_fmt_money(budget_amount)} budget, and this pace points to about {_fmt_money(projected_total)} for the month."
                )
            return (
                f"Budget pace: {category} looks healthy. You've used {pct_used:.0f}% of your "
                f"{_fmt_money(budget_amount)} budget so far."
            )

        def _category_spend_evaluation(category_spend: float, safe_to_spend: float | None) -> tuple[str, float | None]:
            if safe_to_spend is None or safe_to_spend <= 0:
                return "neutral", None

            percent_of_safe = float(category_spend) / float(safe_to_spend)
            if percent_of_safe < 0.10:
                return "low", percent_of_safe
            if percent_of_safe <= 0.30:
                return "medium", percent_of_safe
            return "high", percent_of_safe

        def _category_action_heading(spend_level: str) -> str:
            if spend_level == "high":
                return "How to improve this"
            return "Keep it on track"

        def _category_monthly_projection_line(current_total: float) -> str:
            days_elapsed = max(1, (as_of_date - month_start).days + 1)
            days_total = max(days_elapsed, (month_end - month_start).days + 1)
            projected_total = float(current_total)
            if days_elapsed > 0:
                projected_total = float(current_total) / float(days_elapsed) * float(days_total)
            return f"At this pace, you'll spend about {_fmt_money(projected_total)} this month."

        def _category_remaining_safe_line(current_total: float, safe_to_spend: float | None) -> str:
            if safe_to_spend is None or safe_to_spend <= 0:
                return ""

            healthy_cap = float(safe_to_spend) * 0.30
            remaining_safe = healthy_cap - float(current_total)
            if remaining_safe > 0:
                return f"You could spend about {_fmt_money(remaining_safe)} more this month and still stay in a healthy range."
            return "You've already exceeded a typical healthy range for this category."

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
                        "This is still reasonable, and keeping it around the current pace would keep this category on track."
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
                        "This still looks manageable, and staying near the current pace would keep this category on track."
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
                        "This is reasonable, and pausing before the next nonessential purchase would help keep it on track."
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
                        "The main focus here is just to watch for bill changes rather than trying to cut this category much."
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
                            "This is reasonable, and planning the next trip before you shop would help keep it on track."
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
                        "This is manageable, and staying near the current pace would keep it on track."
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
                    "This still looks reasonable, and maintaining the current pace would keep it on track."
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
            budget_pace_line = _category_budget_pace_line(category, current_total)
            if budget_pace_line:
                st.caption(budget_pace_line)
            st.caption(_category_buffer_impact_line(category, current_total=current_total, safe_to_spend=safe_to_spend))
            st.caption(_category_monthly_projection_line(current_total))
            remaining_safe_line = _category_remaining_safe_line(current_total, safe_to_spend)
            if remaining_safe_line:
                st.caption(remaining_safe_line)
            st.write(f"**{_category_action_heading(spend_level)}**")
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

                if budget_pace_line:
                    st.write(budget_pace_line)

                if top_merchants:
                    st.write("Biggest contributors")
                    for merchant in top_merchants:
                        st.write(
                            f"- {merchant.get('merchant', 'Unknown')}: "
                            f"{_fmt_signed_money(float(merchant.get('dollar_change', 0.0)))}"
                        )

        def _load_financial_overview():
            insights_key = f"{active_user_id()}:{as_of_str}:monthly:insights"
            if st.session_state.get("insights_cache_key") != insights_key:
                try:
                    resp = backend_get(
                        f"{BASE_URL}/insights",
                        params={"user_id": active_user_id(), "period": "monthly", "as_of": as_of_str},
                        timeout=10,
                    )
                    if not resp.ok:
                        show_http_error(resp)
                        raise RuntimeError("GET /insights failed")
                    st.session_state.insights_cache = resp.json()
                    st.session_state.insights_cache_key = insights_key

                    t_resp = backend_get(
                        f"{BASE_URL}/trends",
                        params={"user_id": active_user_id(), "period": "monthly", "as_of": as_of_str},
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

        def _load_category_explanation_data(category: str, *, show_errors: bool = False) -> dict:
            category_name = str(category).strip()
            explain_key = f"{active_user_id()}:{category_name}:{as_of_str}:monthly"
            if st.session_state.get("category_explanation_key") == explain_key:
                return st.session_state.get("category_explanation") or {}

            try:
                resp = backend_get(
                    f"{BASE_URL}/explain/category",
                    params={
                        "user_id": active_user_id(),
                        "category": category_name,
                        "period": "monthly",
                        "as_of": as_of_str,
                    },
                    timeout=10,
                )
                if not resp.ok:
                    if show_errors:
                        show_http_error(resp)
                    raise RuntimeError("GET /explain/category failed")
                st.session_state.category_explanation = resp.json() or {}
                st.session_state.category_explanation_key = explain_key
                return st.session_state.category_explanation
            except Exception as e:
                if show_errors:
                    st.code(str(e))
                return {}

        def _match_category_in_question(question: str) -> str:
            q_lower = str(question or "").lower()
            for category_name in SPEND_CATEGORIES:
                if category_name.lower() in q_lower:
                    return category_name
            return ""

        def _projected_category_total(current_total: float) -> float:
            days_elapsed = max(1, (as_of_date - month_start).days + 1)
            days_total = max(days_elapsed, (month_end - month_start).days + 1)
            return float(current_total) / float(days_elapsed) * float(days_total)

        def _category_budget_snapshot(bundle: dict, category: str, category_resp: dict) -> dict:
            row = _bundle_budget_row_map(bundle).get(str(category).strip(), {})
            current_total = float(category_resp.get("current_month_total", 0.0) or 0.0)
            budget_amount = float((row or {}).get("budget", 0.0) or 0.0)
            pct_used = float((row or {}).get("pct_used", 0.0) or 0.0)
            remaining_amount = float((row or {}).get("remaining", budget_amount - current_total) or 0.0)
            projected_total = _projected_category_total(current_total)
            status_key, status_label = _budget_status_meta(
                pct_used,
                projected_total=projected_total,
                budget_amount=budget_amount,
            )
            above_pace_amount = 0.0
            for item in (bundle.get("cash_forecast", {}) or {}).get("top_above_pace_categories", []) or []:
                if str(item.get("category", "")).strip() == str(category).strip():
                    above_pace_amount = float(item.get("above_pace", 0.0) or 0.0)
                    break
            return {
                "row": row,
                "budget_amount": budget_amount,
                "pct_used": pct_used,
                "remaining_amount": remaining_amount,
                "projected_total": projected_total,
                "status_key": status_key,
                "status_label": status_label,
                "above_pace_amount": above_pace_amount,
            }

        def _estimated_action_impact(category: str, category_resp: dict, snapshot: dict) -> float:
            avg_spend = float(category_resp.get("current_avg_spend", 0.0) or 0.0)
            budget_amount = float(snapshot.get("budget_amount", 0.0) or 0.0)
            current_total = float(category_resp.get("current_month_total", 0.0) or 0.0)
            above_pace_amount = float(snapshot.get("above_pace_amount", 0.0) or 0.0)
            base = max(abs(above_pace_amount), avg_spend, budget_amount * 0.08, current_total * 0.15, 15.0)
            if category in {"Food", "Dining", "Shopping"}:
                base = max(base, 25.0)
            if category in {"Entertainment", "Groceries"}:
                base = max(base, 20.0)
            if category == "Transportation":
                base = max(base, 15.0)
            return round(min(60.0, base), 2)

        def _category_recommendation(category: str, category_resp: dict, snapshot: dict) -> str:
            status_key = str(snapshot.get("status_key", "healthy")).strip()
            impact_amount = _estimated_action_impact(category, category_resp, snapshot)
            if category in {"Food", "Dining"}:
                if status_key == "healthy":
                    return "Keep restaurant spending near the current pace this week."
                if status_key == "tight":
                    return f"Keep restaurant spending to one lower-cost meal this week. Estimated impact: about {_fmt_money(impact_amount)}."
                return f"Reduce one or two restaurant meals this week. Estimated impact: about {_fmt_money(impact_amount)}."
            if category == "Groceries":
                if status_key == "healthy":
                    return "Keep your next grocery trip close to your usual size."
                if status_key == "tight":
                    return f"Plan one tighter grocery trip this week. Estimated impact: about {_fmt_money(impact_amount)}."
                return f"Tighten your next grocery trip or switch one trip to a lower-cost store. Estimated impact: about {_fmt_money(impact_amount)}."
            if category == "Entertainment":
                if status_key == "healthy":
                    return "Entertainment looks manageable right now, so avoid adding extra impulse plans this week."
                if status_key == "tight":
                    return f"Skip one lower-value entertainment purchase this week. Estimated impact: about {_fmt_money(impact_amount)}."
                return f"Cut one entertainment purchase this week. Estimated impact: about {_fmt_money(impact_amount)}."
            if category == "Shopping":
                if status_key == "healthy":
                    return "Keep nonessential shopping paused until the next purchase really matters."
                if status_key == "tight":
                    return f"Delay one nonessential purchase this week. Estimated impact: about {_fmt_money(impact_amount)}."
                return f"Pause one nonessential purchase this week. Estimated impact: about {_fmt_money(impact_amount)}."
            if category == "Transportation":
                if status_key == "healthy":
                    return "Transportation looks manageable right now; keep the current pace if you can."
                if status_key == "tight":
                    return f"Combine a few trips or cut one low-value ride this week. Estimated impact: about {_fmt_money(impact_amount)}."
                return f"Trim one or two low-value rides this week. Estimated impact: about {_fmt_money(impact_amount)}."
            if category in {"Bills", "Rent", "Utilities", "Insurance"}:
                return "This category looks mostly fixed, so focus any weekly changes on more flexible spending."
            if status_key == "healthy":
                return f"{category} looks healthy so far; keep the current pace steady this week."
            if status_key == "tight":
                return f"Trim one lower-value {category.lower()} purchase this week. Estimated impact: about {_fmt_money(impact_amount)}."
            return f"Cut one or two lower-value {category.lower()} purchases this week. Estimated impact: about {_fmt_money(impact_amount)}."

        def _priority_category_from_bundle(bundle: dict) -> str:
            driver = _compute_spending_driver(bundle)
            if not driver:
                return ""
            return str(driver.get("category", "")).strip()

        def _actionability_weight(category: str) -> float:
            category_name = str(category).strip()
            if category_name in {"Food", "Dining", "Entertainment", "Shopping", "Travel"}:
                return 3.0
            if category_name in {"Groceries", "Transportation", "Subscriptions", "Other"}:
                return 2.0
            if category_name in {"Bills", "Rent", "Utilities", "Insurance", "Health", "Education"}:
                return 0.0
            return 1.0

        def _rank_actionable_categories(bundle: dict) -> list[dict]:
            spending_by_category = bundle.get("spending_by_category", {}) or {}
            if not spending_by_category:
                return []

            row_map = _bundle_budget_row_map(bundle)
            total_spending = sum(max(0.0, float(value or 0.0)) for value in spending_by_category.values())
            above_pace_map = {
                str(item.get("category", "")).strip(): float(item.get("above_pace", 0.0) or 0.0)
                for item in (bundle.get("cash_forecast", {}) or {}).get("top_above_pace_categories", []) or []
                if str(item.get("category", "")).strip()
            }

            ranked: list[dict] = []
            for raw_category, raw_total in spending_by_category.items():
                category_name = str(raw_category).strip()
                current_total = float(raw_total or 0.0)
                if not category_name or current_total <= 0:
                    continue

                flexibility = _actionability_weight(category_name)
                if flexibility <= 0:
                    continue

                row = row_map.get(category_name, {})
                budget_amount = float((row or {}).get("budget", 0.0) or 0.0)
                pct_used = float((row or {}).get("pct_used", 0.0) or 0.0)
                projected_total = _projected_category_total(current_total)
                above_pace = float(above_pace_map.get(category_name, 0.0) or 0.0)
                forecast_ratio = (projected_total / budget_amount) if budget_amount > 0 else 0.0
                status_key, _ = _budget_status_meta(
                    pct_used,
                    projected_total=projected_total,
                    budget_amount=budget_amount,
                )
                severity = {"healthy": 0, "tight": 1, "off_track": 2}.get(status_key, 0)
                materiality_ratio = current_total / max(total_spending, 1.0)

                score = flexibility * 10.0 + severity * 5.0 + materiality_ratio * 4.0
                if budget_amount > 0:
                    score += max(forecast_ratio, pct_used / 100.0) * 3.0
                    score += max(0.0, above_pace / max(budget_amount, 1.0)) * 2.0
                else:
                    score += min(current_total / 50.0, 4.0)

                ranked.append(
                    {
                        "category": category_name,
                        "score": score,
                        "current_total": current_total,
                        "budget_amount": budget_amount,
                        "pct_used": pct_used,
                        "projected_total": projected_total,
                        "above_pace": above_pace,
                        "status_key": status_key,
                        "materiality_ratio": materiality_ratio,
                    }
                )

            ranked.sort(
                key=lambda item: (
                    float(item.get("score", 0.0)),
                    float(item.get("projected_total", 0.0)),
                    float(item.get("current_total", 0.0)),
                ),
                reverse=True,
            )
            return ranked

        def _best_actionable_category(bundle: dict) -> dict | None:
            ranked = _rank_actionable_categories(bundle)
            if not ranked:
                return None
            return ranked[0]

        def _is_hard_to_change_category(category: str) -> bool:
            return _actionability_weight(category) <= 0.0

        def _build_focus_shift_context(bundle: dict) -> dict:
            driver = _compute_spending_driver(bundle)
            actionable = _best_actionable_category(bundle)
            if not driver:
                return {}

            important_category = str(driver.get("category", "")).strip()
            current_total = float(driver.get("current_total", 0.0) or 0.0)
            budget_amount = float(driver.get("budget_amount", 0.0) or 0.0)
            pct_used = float(driver.get("pct_used", 0.0) or 0.0)
            above_pace = float(driver.get("above_pace", 0.0) or 0.0)
            selection_mode = str(driver.get("selection_mode", "spend")).strip()

            if selection_mode == "budget" and budget_amount > 0 and above_pace > 0:
                insight_line = (
                    f"{important_category} matters most right now because you've spent {_fmt_money(current_total)} there and it's running ahead of plan."
                    if beginner_mode
                    else f"{important_category} matters most right now because it's about {_fmt_money(above_pace)} above pace and already at {pct_used:.0f}% of its {_fmt_money(budget_amount)} budget."
                )
            elif selection_mode == "budget" and budget_amount > 0:
                insight_line = (
                    f"{important_category} matters most right now because you've already used {pct_used:.0f}% of its budget."
                    if beginner_mode
                    else f"{important_category} matters most right now because you've spent {_fmt_money(current_total)}, or {pct_used:.0f}% of its {_fmt_money(budget_amount)} budget."
                )
            else:
                insight_line = (
                    f"{important_category} matters most right now because you've spent {_fmt_money(current_total)} there so far."
                    if beginner_mode
                    else f"{important_category} matters most right now because you've spent {_fmt_money(current_total)} there so far."
                )

            actionable_category = str((actionable or {}).get("category", "")).strip()
            actionable_recommendation = ""
            if actionable_category:
                actionable_resp = _load_category_explanation_data(actionable_category)
                actionable_snapshot = _category_budget_snapshot(bundle, actionable_category, actionable_resp) if actionable_resp else {}
                if actionable_resp and actionable_snapshot:
                    actionable_recommendation = _category_recommendation(
                        actionable_category,
                        actionable_resp,
                        actionable_snapshot,
                    )

            constraint_line = ""
            shift_line = ""
            if actionable_category and actionable_category != important_category:
                if _is_hard_to_change_category(important_category):
                    constraint_line = (
                        f"However, {important_category} is mostly fixed and harder to adjust in the short term."
                    )
                else:
                    constraint_line = (
                        f"However, {important_category} is not the easiest place to make a quick change this week."
                    )
                shift_line = (
                    f"For this week, your best opportunity to improve is in {actionable_category} spending."
                )
            elif actionable_category:
                shift_line = (
                    f"For this week, your best opportunity to improve is in {actionable_category} spending."
                )
            elif _is_hard_to_change_category(important_category):
                constraint_line = (
                    f"However, {important_category} is mostly fixed and harder to adjust in the short term."
                )
                shift_line = "For this week, the easiest changes will come from your more flexible spending."

            return {
                "important_category": important_category,
                "actionable_category": actionable_category,
                "insight_line": insight_line,
                "constraint_line": constraint_line,
                "shift_line": shift_line,
                "actionable_recommendation": actionable_recommendation,
            }

        def _build_spending_driver_answer_block(bundle: dict) -> dict:
            driver = _compute_spending_driver(bundle)
            focus_context = _build_focus_shift_context(bundle)
            if not driver:
                return {
                    "label": "What's driving my spending?",
                    "headline": "Not enough data yet to determine what's driving your spending.",
                    "bullets": ["Add more transaction data or switch to a month with activity to see a clear category driver."],
                    "recommendation": "Add more transaction data or switch to a month with activity.",
                }

            category_name = str(driver.get("category", "")).strip()
            category_answer = _build_category_answer_block(category_name, bundle)
            category_resp = _load_category_explanation_data(category_name)
            snapshot = _category_budget_snapshot(bundle, category_name, category_resp) if category_resp else {}
            current_total = float(category_resp.get("current_month_total", 0.0) or 0.0)
            budget_amount = float(snapshot.get("budget_amount", 0.0) or 0.0)
            projected_total = float(snapshot.get("projected_total", 0.0) or 0.0)

            if budget_amount > 0 and projected_total > 0:
                outlook_line = (
                    f"At this pace, {category_name} should finish around {_fmt_money(projected_total)} this month."
                )
            else:
                outlook_line = ""

            extra_bullets = [str(focus_context.get("insight_line", "")).strip()]
            constraint_line = str(focus_context.get("constraint_line", "")).strip()
            shift_line = str(focus_context.get("shift_line", "")).strip()
            if constraint_line:
                extra_bullets.append(constraint_line)
            if shift_line:
                extra_bullets.append(shift_line)
            if outlook_line:
                extra_bullets.append(outlook_line)

            existing_bullets = [str(item).strip() for item in (category_answer.get("bullets", []) or []) if str(item).strip()]
            bullet_limit = 3 if beginner_mode else 4
            merged_bullets: list[str] = []
            for item in extra_bullets + existing_bullets:
                if item and item not in merged_bullets:
                    merged_bullets.append(item)

            recommendation = (
                str(focus_context.get("actionable_recommendation", "")).strip()
                or str(category_answer.get("recommendation", "")).strip()
            )

            return {
                "label": "What's driving my spending?",
                "headline": (
                    f"{category_name} is driving your spending right now."
                    if beginner_mode
                    else f"{category_name} is the key spending driver this month."
                ),
                "bullets": merged_bullets[:bullet_limit],
                "recommendation": recommendation,
            }

        def _build_month_answer_block(bundle: dict) -> dict:
            summary = bundle.get("summary", {}) or {}
            trends = bundle.get("trends", {}) or {}
            cash = bundle.get("cash_forecast", {}) or {}
            report = bundle.get("budget_report", {}) or {}
            overview = _build_monthly_summary(bundle)
            focus_context = _build_focus_shift_context(bundle)
            priority_category = _priority_category_from_bundle(bundle)
            category_resp = _load_category_explanation_data(priority_category) if priority_category else {}
            snapshot = _category_budget_snapshot(bundle, priority_category, category_resp) if category_resp else {}
            trend_this = float(trends.get("this_period_spending", 0.0) or 0.0)
            trend_last = float(trends.get("last_period_spending", 0.0) or 0.0)
            trend_delta = trend_this - trend_last
            trend_pct = (trend_delta / trend_last * 100.0) if trend_last > 0 else None
            forecast_end = float(cash.get("forecast_end_balance", 0.0) or 0.0)
            safe_per_day = float(cash.get("safe_to_spend_per_day_budget", 0.0) or 0.0)
            days_remaining = int(cash.get("days_remaining", 0) or 0)
            over = report.get("over_budget", []) or []
            near = report.get("near_budget", []) or []

            if forecast_end < 0 or over:
                headline = "This month needs attention." if beginner_mode else "Monthly outlook: off track."
            elif near or (cash.get("top_above_pace_categories", []) or []):
                headline = "This month is getting tight." if beginner_mode else "Monthly outlook: tightening."
            else:
                headline = "This month looks on track." if beginner_mode else "Monthly outlook: on track."

            bullets = []
            if beginner_mode:
                bullets.append(
                    f"You've spent {_fmt_money(float(summary.get('spending', 0.0) or 0.0))} so far, and the month still looks manageable."
                )
                bullets.append(
                    f"If this pace holds, you're on track to finish with about {_fmt_money(forecast_end)}."
                )
                bullets.append(overview.get("focus_line", ""))
                if trend_pct is not None:
                    direction = "higher" if trend_delta > 0 else "lower" if trend_delta < 0 else "about the same"
                    if direction == "about the same":
                        bullets.append("Spending is about the same as last month.")
                    else:
                        bullets.append(f"Spending is {direction} than last month so far.")
            else:
                bullets.append(
                    f"Income is {_fmt_money(float(summary.get('income', 0.0) or 0.0))}, spending is {_fmt_money(float(summary.get('spending', 0.0) or 0.0))}, and net is {_fmt_signed_money(float(summary.get('net', 0.0) or 0.0))}."
                )
                bullets.append(
                    f"Forecast end balance is {_fmt_money(forecast_end)} with about {_fmt_money(safe_per_day)}/day of safe room across the next {days_remaining} days."
                )
                bullets.append(overview.get("focus_line", ""))
                if trend_pct is not None:
                    bullets.append(
                        f"Spending is {_fmt_signed_money(trend_delta)} ({trend_pct:+.1f}%) vs last month so far."
                    )
                else:
                    bullets.append(overview.get("urgent_line", ""))

            constraint_line = str(focus_context.get("constraint_line", "")).strip()
            shift_line = str(focus_context.get("shift_line", "")).strip()
            if constraint_line:
                bullets.append(constraint_line)
            if shift_line:
                bullets.append(shift_line)

            recommendation = "Keep discretionary spending near the current pace this week."
            actionable_recommendation = str(focus_context.get("actionable_recommendation", "")).strip()
            if actionable_recommendation:
                recommendation = actionable_recommendation
            elif priority_category and category_resp and snapshot:
                recommendation = _category_recommendation(priority_category, category_resp, snapshot)
            return {
                "label": "Explain this month",
                "headline": headline,
                "bullets": [item for item in bullets if str(item).strip()][: 3 if beginner_mode else 4],
                "recommendation": recommendation,
            }

        def _build_category_answer_block(category: str, bundle: dict) -> dict:
            category_name = str(category).strip() or "Food"
            category_resp = _load_category_explanation_data(category_name)
            if not category_resp:
                return {
                    "label": f"What's driving {category_name}?",
                    "headline": f"I couldn't load {category_name} yet.",
                    "bullets": ["Try the category drilldown again once the current month data is available."],
                    "recommendation": "Use the category selector below to retry.",
                }

            snapshot = _category_budget_snapshot(bundle, category_name, category_resp)
            current_total = float(category_resp.get("current_month_total", 0.0) or 0.0)
            current_tx_count = int(category_resp.get("current_transaction_count", 0) or 0)
            current_avg_spend = float(category_resp.get("current_avg_spend", 0.0) or 0.0)
            percent_change = category_resp.get("percent_change")
            dollar_change = float(category_resp.get("dollar_change", 0.0) or 0.0)
            merchant_names = _join_category_merchants(category_resp.get("top_merchants", []) or [])
            status_key = str(snapshot.get("status_key", "healthy")).strip()
            status_display = {
                "healthy": "healthy",
                "tight": "tight",
                "off_track": "off-track",
            }.get(status_key, "healthy")

            headline = (
                f"{category_name} looks {status_display} right now."
                if beginner_mode
                else f"{category_name} drilldown: {status_display} vs plan."
            )

            bullets = []
            if beginner_mode:
                bullets.append(
                    f"You've spent {_fmt_money(current_total)} on {category_name} across {current_tx_count} purchases this month."
                )
                if merchant_names:
                    bullets.append(f"Most of it came from {merchant_names}.")
                if float(snapshot.get("budget_amount", 0.0) or 0.0) > 0:
                    bullets.append(
                        f"At this pace, {category_name} should finish around {_fmt_money(float(snapshot.get('projected_total', 0.0) or 0.0))} on a {_fmt_money(float(snapshot.get('budget_amount', 0.0) or 0.0))} budget."
                    )
                elif percent_change is not None:
                    bullets.append(f"That's {_fmt_signed_money(dollar_change)} vs last month.")
            else:
                bullets.append(
                    f"You've spent {_fmt_money(current_total)} across {current_tx_count} purchases, averaging {_fmt_money(current_avg_spend)} each."
                )
                if merchant_names:
                    bullets.append(f"Top merchants: {merchant_names}.")
                bullets.append(_category_budget_pace_line(category_name, current_total))
                if percent_change is not None:
                    bullets.append(
                        f"Month over month, {category_name} is {_fmt_signed_money(dollar_change)} ({float(percent_change):+.1f}%)."
                    )
                else:
                    bullets.append(_category_buffer_impact_line(category_name, current_total=current_total, safe_to_spend=_load_category_safe_to_spend()))

            return {
                "label": f"What's driving {category_name}?",
                "headline": headline,
                "bullets": [item for item in bullets if str(item).strip()][: 3 if beginner_mode else 4],
                "recommendation": _category_recommendation(category_name, category_resp, snapshot),
            }

        def _build_weekly_change_answer_block(bundle: dict) -> dict:
            driver = _compute_spending_driver(bundle)
            focus_context = _build_focus_shift_context(bundle)
            driver_category = str((driver or {}).get("category", "")).strip()
            actionable_ranked = _rank_actionable_categories(bundle)
            candidates = [str(item.get("category", "")).strip() for item in actionable_ranked if str(item.get("category", "")).strip()]

            if not candidates and driver_category:
                candidates = [driver_category]

            bullets = []
            recommendation = "Keep discretionary spending near the current pace this week."
            insight_line = str(focus_context.get("insight_line", "")).strip()
            constraint_line = str(focus_context.get("constraint_line", "")).strip()
            shift_line = str(focus_context.get("shift_line", "")).strip()
            if insight_line:
                bullets.append(insight_line)
            if constraint_line:
                bullets.append(constraint_line)
            if shift_line:
                bullets.append(shift_line)
            for category_name in candidates[: (2 if beginner_mode else 3)]:
                category_resp = _load_category_explanation_data(category_name)
                if not category_resp:
                    continue
                snapshot = _category_budget_snapshot(bundle, category_name, category_resp)
                impact_amount = _estimated_action_impact(category_name, category_resp, snapshot)
                current_total = float(category_resp.get("current_month_total", 0.0) or 0.0)
                tx_count = int(category_resp.get("current_transaction_count", 0) or 0)
                projected_total = float(snapshot.get("projected_total", 0.0) or 0.0)
                budget_amount = float(snapshot.get("budget_amount", 0.0) or 0.0)

                if beginner_mode:
                    if category_name in {"Food", "Dining"}:
                        line = f"Food is easy to adjust quickly. One fewer restaurant meal this week would likely protect about {_fmt_money(impact_amount)}."
                    elif category_name == "Groceries":
                        line = f"Keeping your next grocery trip a little tighter would likely protect about {_fmt_money(impact_amount)}."
                    elif category_name == "Transportation":
                        line = f"Combining a few trips this week would likely protect about {_fmt_money(impact_amount)}."
                    else:
                        line = f"{category_name}: one small adjustment this week would likely protect about {_fmt_money(impact_amount)}."
                else:
                    if budget_amount > 0:
                        line = (
                            f"{category_name}: {_fmt_money(current_total)} spent so far, pacing to about {_fmt_money(projected_total)} "
                            f"on a {_fmt_money(budget_amount)} budget. Estimated impact from one small change this week: {_fmt_money(impact_amount)}."
                        )
                    else:
                        line = (
                            f"{category_name}: {_fmt_money(current_total)} spent across {tx_count} purchases so far. "
                            f"A smaller week here would likely protect about {_fmt_money(impact_amount)}."
                        )
                bullets.append(line)
                if recommendation == "Keep discretionary spending near the current pace this week.":
                    recommendation = _category_recommendation(category_name, category_resp, snapshot)

            actionable_recommendation = str(focus_context.get("actionable_recommendation", "")).strip()
            if actionable_recommendation:
                recommendation = actionable_recommendation

            if not bullets:
                bullets = ["Nothing urgent stands out in the current month data."]

            headline = (
                "Here are the best changes to make this week."
                if beginner_mode
                else "This week's highest-leverage moves"
            )
            return {
                "label": "What should I change this week?",
                "headline": headline,
                "bullets": bullets[: 3 if beginner_mode else 4],
                "recommendation": recommendation,
            }

        def _fallback_question_answer(question: str) -> dict:
            return {
                "label": "Ask Insighta",
                "headline": "I can answer the most useful money questions directly from this month's data.",
                "bullets": [
                    "Try: Explain this month",
                    "Try: What's driving my spending?",
                    "Try: What should I change this week?",
                ],
                "recommendation": "Use one of those prompts, or ask: Am I on track? or What am I overspending on?",
            }

        def _is_spending_driver_question(question: str) -> bool:
            q_lower = str(question or "").lower()
            driver_phrases = [
                "what's driving my spending",
                "what is driving my spending",
                "what category is highest",
                "where am i spending the most",
                "where am i spending most",
                "what is my highest category",
                "what's my highest category",
                "what matters most right now",
            ]
            if any(phrase in q_lower for phrase in driver_phrases):
                return True
            return "driving" in q_lower and "spending" in q_lower

        def _build_insight_answer_for_question(question: str, bundle: dict) -> dict:
            q = str(question or "").strip()
            q_lower = q.lower()
            category_name = _match_category_in_question(q)
            if not q:
                return _fallback_question_answer(q)
            if "explain" in q_lower and "month" in q_lower:
                return _build_month_answer_block(bundle)
            if "on track" in q_lower:
                return _build_month_answer_block(bundle)
            if "overspending" in q_lower or "over spending" in q_lower or "over budget" in q_lower:
                return _build_weekly_change_answer_block(bundle)
            if _is_spending_driver_question(q):
                return _build_spending_driver_answer_block(bundle)
            if category_name and any(token in q_lower for token in {"driving", "higher", "behind"}):
                return _build_category_answer_block(category_name, bundle)
            if "change" in q_lower and "week" in q_lower:
                return _build_weekly_change_answer_block(bundle)
            if category_name:
                return _build_category_answer_block(category_name, bundle)
            return _fallback_question_answer(q)

        def _render_insight_result_block(answer: dict):
            if not answer:
                return
            with st.container(border=True):
                st.caption(str(answer.get("label", "Insight")).strip())
                headline = str(answer.get("headline", "")).strip()
                if headline:
                    st.write(f"**{headline}**")
                for bullet in [str(item).strip() for item in (answer.get("bullets", []) or []) if str(item).strip()][:4]:
                    st.write(f"- {bullet}")
                recommendation = str(answer.get("recommendation", "")).strip()
                if recommendation:
                    st.write("Recommendation")
                    st.write(recommendation)

        def _submit_typed_insight():
            st.session_state.selected_insight_action = ""
            st.session_state.insight_result_source = "typed"
            st.session_state.insight_ask_now = True

        def _queue_insight_action(action: str):
            st.session_state.selected_insight_action = str(action).strip()
            st.session_state.insight_result_source = "quick_action"
            st.session_state.insight_ask_now = True

        st.text_input(
            "Ask Insighta",
            key="insight_question",
            placeholder="Try: explain this month, what's driving my spending?, am I on track?",
            on_change=_submit_typed_insight,
        )
        helper_text = (
            "Ask about the month, a category, or what to change this week."
            if beginner_mode
            else "Ask for a month summary, a category drilldown, or weekly coaching tied to your forecast and budget pace."
        )
        st.caption(helper_text)

        monthly_bundle = _load_monthly_bundle()
        if monthly_bundle:
            _render_monthly_summary(monthly_bundle)

        button_cols = st.columns(3)
        button_cols[0].button(
            "Explain this month",
            use_container_width=True,
            on_click=_queue_insight_action,
            args=("Explain this month",),
        )
        button_cols[1].button(
            "What's driving my spending?",
            use_container_width=True,
            on_click=_queue_insight_action,
            args=("What's driving my spending?",),
        )
        button_cols[2].button(
            "What should I change this week?",
            use_container_width=True,
            on_click=_queue_insight_action,
            args=("What should I change this week?",),
        )

        if st.session_state.insight_ask_now:
            st.session_state.insight_ask_now = False
            effective_question = (
                str(st.session_state.get("selected_insight_action", "")).strip()
                or str(st.session_state.get("insight_question", "")).strip()
            )
            st.session_state.insight_result = _build_insight_answer_for_question(
                effective_question,
                monthly_bundle or {},
            )

        _render_insight_result_block(st.session_state.get("insight_result") or {})
    
        st.subheader("What's driving this category?")
        explain_category = st.selectbox("Category", SPEND_CATEGORIES, key="insights_explain_category")
        if st.button("Explain this category"):
            st.session_state.last_insights_mode = "coach"
            _load_category_explanation_data(explain_category, show_errors=True)
    
        explain_key = f"{active_user_id()}:{explain_category}:{as_of_str}:monthly"
        if st.session_state.get("category_explanation_key") == explain_key:
            category_explanation = st.session_state.get("category_explanation") or {}
            if category_explanation:
                _render_category_explanation(category_explanation)
    
        insights, trends = _load_financial_overview()
        if insights:
            with st.expander("Financial overview", expanded=False):
                _render_financial_overview(insights, trends)

    with tab_afford:
        st.subheader("Can I afford this?")
        st.caption(f"Showing {month_start.strftime('%B %Y')}")
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
            "user_id": active_user_id(),
            "period": "monthly",
            "as_of": afford_as_of,
            "amount": amount,
            "beginner_mode": beginner_mode,
        }
        afford_key = f"{active_user_id()}:{afford_as_of}:{amount:.2f}:{int(beginner_mode)}:afford"
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

        breakdown_key = f"{active_user_id()}:{afford_as_of}:cash_breakdown"
        if st.session_state.get("afford_breakdown_key") != breakdown_key:
            try:
                cash_resp = backend_get(
                    f"{BASE_URL}/forecast/cash",
                    params={
                        "user_id": active_user_id(),
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
    
    
    # ============================================================
    # Budget Report tab
    # ============================================================
    with tab_budget:
        st.divider()
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
    
        report_key = f"{active_user_id()}:{as_of_str}:monthly:report"
        if st.session_state.get("report_cache_key") != report_key:
            try:
                as_of = as_of_str
                report = api_get_budget_report(report_period, as_of)
                st.session_state.report_cache = report
                st.session_state.report_cache_key = report_key
            except Exception as e:
                st.code(str(e))
    
        tx_key = f"{active_user_id()}:{month_start.isoformat()}:{as_of_str}:tx"
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
    
        forecast_key = f"{active_user_id()}:{as_of_str}:monthly:forecast:{float(starting_balance):.2f}"
        if st.session_state.get("forecast_cache_key") != forecast_key:
            try:
                as_of = as_of_str
    
                forecast = api_get_forecast(forecast_period, as_of)
                st.session_state.forecast_cache = forecast
                st.session_state.forecast_cache_key = forecast_key
    
                cash_resp = backend_get(
                    f"{BASE_URL}/forecast/cash",
                    params={
                        "user_id": active_user_id(),
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

    if current_page in {"Demo", "Spending Insights", "Can I afford this?", "Budget"}:
        render_shell_footer()

def main():
    try:
        run_app()
    except Exception as e:
        traceback.print_exc()
        st.error(f"Frontend error: {e}")


if __name__ == "__main__":
    main()
