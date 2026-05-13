import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "finance.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys so budget_allocations can cascade delete properly
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # -----------------------------
    # Transactions table (existing)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            merchant TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT 'default'
        )
        """
    )
    # Ensure user_id column exists for older DBs
    cols = {row["name"] for row in cur.execute("PRAGMA table_info(transactions)").fetchall()}
    if "user_id" not in cols:
        cur.execute("ALTER TABLE transactions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'")

    # -----------------------------
    # Budgets tables (NEW)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            period TEXT NOT NULL CHECK(period IN ('weekly','monthly')),
            income_amount REAL NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS budget_allocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            budget_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
        )
        """
    )

    # Helpful indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_budget_alloc_budget_id ON budget_allocations(budget_id)")

    # Enforce only ONE active budget per (user_id, period)
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_active_budget_user_period
        ON budgets(user_id, period)
        WHERE is_active = 1
        """
    )

    # -----------------------------
    # Goal plans
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS goal_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            goal_name TEXT NOT NULL,
            target_amount REAL NOT NULL,
            target_date TEXT NOT NULL,
            progress REAL NOT NULL DEFAULT 0,
            weekly_needed REAL NOT NULL DEFAULT 0,
            monthly_needed REAL NOT NULL DEFAULT 0,
            realistic INTEGER NOT NULL DEFAULT 0,
            recommendations_json TEXT NOT NULL DEFAULT '[]',
            protected_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_goal_plans_user_id ON goal_plans(user_id)")

    # -----------------------------
    # Seed only if empty (existing)
    # -----------------------------
    cur.execute("SELECT COUNT(*) AS n FROM transactions")
    n = cur.fetchone()["n"]

    if n == 0:
        seed = [
            ("2025-12-20", "Target", -32.18, "Shopping", "default"),
            ("2025-12-21", "Chipotle", -12.45, "Food", "default"),
            ("2025-12-22", "Paycheck", 250.00, "Income", "default"),
            ("2025-12-23", "Netflix", -15.49, "Subscriptions", "default"),
        ]
        cur.executemany(
            "INSERT INTO transactions (date, merchant, amount, category, user_id) VALUES (?, ?, ?, ?, ?)",
            seed,
        )

    conn.commit()
    conn.close()
