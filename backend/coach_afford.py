from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional
import math
from datetime import datetime, timedelta

# -----------------------------
# Affordability thresholds
# -----------------------------
CRITICAL_END_BALANCE = -200.0
CRITICAL_SAFE_PER_DAY = -25.0
RISKY_END_BALANCE = 0.0
RISKY_SAFE_PER_DAY = 0.0
PACE_RISKY_RATIO = 1.10
PACE_CRITICAL_RATIO = 1.25
MATERIAL_IMPACT_DOLLARS = 100.0
MATERIAL_IMPACT_PERCENT = 0.05
SHORTFALL_SOON_DAYS = 7
HEALTHY_CUSHION = 500.0
COMFORT_BUFFER_RATIO = 0.20
PROTECTED_BALANCE = 0.0
TIGHT_UPPER_MULTIPLIER = 1.10

DECISION_LABELS = {
    "SAFE": "Yes — safe",
    "TIGHT": "Tight — proceed carefully",
    "NOT_RECOMMENDED": "Not recommended right now",
}


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        try:
            return int(float(value or 0))
        except (TypeError, ValueError):
            return 0


@dataclass
class AffordScenario:
    amount: float
    verdict: str  # YES_SAFE | YES_RISKY | NO_UNSAFE
    risk_level: str  # low | med | high (after)
    risk_level_before: str
    confidence: float
    before_end_balance: float
    after_end_balance: float
    before_safe_per_day: float
    after_safe_per_day: float
    days_remaining: int
    shortfall_days_before: Optional[int]
    shortfall_days_after: Optional[int]
    shortfall_date_before: Optional[str]
    shortfall_date_after: Optional[str]
    pace_ratio_before: float
    pace_ratio_after: float
    spend_daily_before: float
    spend_daily_after: float
    target_spend_daily: float
    material_impact: bool
    introduces_shortfall: bool
    shortfall_soon: bool
    critical_end_crossed: bool
    risk_worsened_to_high: bool
    top_above_pace_category: Optional[str]
    top_above_pace_amount: float
    path_back_amount: float
    path_back_days: int

    def to_dict(self) -> Dict[str, float | str | int]:
        return {
            "amount": float(self.amount),
            "verdict": self.verdict,
            "risk_level": self.risk_level,
            "risk_level_before": self.risk_level_before,
            "confidence": float(self.confidence),
            "before_end_balance": float(self.before_end_balance),
            "after_end_balance": float(self.after_end_balance),
            "before_safe_per_day": float(self.before_safe_per_day),
            "after_safe_per_day": float(self.after_safe_per_day),
            "days_remaining": int(self.days_remaining),
            "shortfall_days_before": self.shortfall_days_before,
            "shortfall_days_after": self.shortfall_days_after,
            "shortfall_date_before": self.shortfall_date_before,
            "shortfall_date_after": self.shortfall_date_after,
            "pace_ratio_before": float(self.pace_ratio_before),
            "pace_ratio_after": float(self.pace_ratio_after),
            "spend_daily_before": float(self.spend_daily_before),
            "spend_daily_after": float(self.spend_daily_after),
            "target_spend_daily": float(self.target_spend_daily),
            "material_impact": bool(self.material_impact),
            "introduces_shortfall": bool(self.introduces_shortfall),
            "shortfall_soon": bool(self.shortfall_soon),
            "critical_end_crossed": bool(self.critical_end_crossed),
            "risk_worsened_to_high": bool(self.risk_worsened_to_high),
            "top_above_pace_category": self.top_above_pace_category,
            "top_above_pace_amount": float(self.top_above_pace_amount),
            "path_back_amount": float(self.path_back_amount),
            "path_back_days": int(self.path_back_days),
        }


def _risk_level(end_balance: float, safe_per_day: float, pace_ratio: float) -> str:
    if (
        end_balance <= CRITICAL_END_BALANCE
        or safe_per_day <= CRITICAL_SAFE_PER_DAY
        or pace_ratio >= PACE_CRITICAL_RATIO
    ):
        return "high"
    if end_balance < RISKY_END_BALANCE or safe_per_day < RISKY_SAFE_PER_DAY or pace_ratio >= PACE_RISKY_RATIO:
        return "med"
    return "low"


def _confidence(days_elapsed: int, days_total: int) -> float:
    if days_total <= 0:
        return 0.3
    ratio = max(0.0, min(1.0, days_elapsed / days_total))
    # cap confidence to avoid overclaiming
    return max(0.3, min(0.9, ratio))


def _shortfall_days(starting_balance: float, net_daily: float) -> Optional[int]:
    if net_daily >= 0:
        return None
    if starting_balance <= 0:
        return 0
    return int(math.ceil(starting_balance / abs(net_daily)))


def _shortfall_date(as_of: Optional[str], days: Optional[int]) -> Optional[str]:
    if not as_of or days is None:
        return None
    try:
        d = datetime.strptime(as_of, "%Y-%m-%d").date()
        return (d + timedelta(days=int(days))).isoformat()
    except Exception:
        return None


def simulate_afford(amount: float, cash: Dict[str, float]) -> AffordScenario:
    income_ahead = float(cash.get("forecast_income_total", 0.0)) - float(cash.get("income_to_date", 0.0))
    upcoming_expenses = float(cash.get("forecast_spending_total", 0.0)) - float(cash.get("spending_to_date", 0.0))
    before_end = income_ahead - upcoming_expenses
    before_safe = float(cash.get("safe_to_spend_per_day_budget", 0.0))
    days_remaining = _safe_int(cash.get("days_remaining", 0))
    days_elapsed = _safe_int(cash.get("days_elapsed", 0))
    days_total = _safe_int(cash.get("days_total", 0))
    as_of = str(cash.get("as_of", "")) or None

    spend_to_date = float(cash.get("spending_to_date", 0.0))
    spend_daily_before = float(cash.get("spend_daily_current", 0.0))
    target_spend_daily = float(cash.get("target_spend_daily_budget", 0.0))
    income_daily = float(cash.get("income_daily", 0.0))
    starting_balance = float(cash.get("starting_balance", 0.0))

    top_above = cash.get("top_above_pace_categories", []) or []
    top_cat = None
    top_amt = 0.0
    if top_above:
        top_cat = str(top_above[0].get("category", "")) or None
        top_amt = float(top_above[0].get("above_pace", 0.0))

    per_day_hit = (amount / days_remaining) if days_remaining > 0 else amount
    after_safe = before_safe - per_day_hit
    after_end = before_end - amount

    spend_to_date_after = spend_to_date + amount
    spend_daily_after = spend_to_date_after / max(1, days_elapsed)

    pace_ratio_before = (
        spend_daily_before / target_spend_daily if target_spend_daily > 0 else 0.0
    )
    pace_ratio_after = (
        spend_daily_after / target_spend_daily if target_spend_daily > 0 else 0.0
    )

    risk_before = _risk_level(before_end, before_safe, pace_ratio_before)
    risk_after = _risk_level(after_end, after_safe, pace_ratio_after)

    net_daily_before = income_daily - spend_daily_before
    net_daily_after = income_daily - spend_daily_after
    shortfall_days_before = _shortfall_days(starting_balance, net_daily_before)
    shortfall_days_after = _shortfall_days(starting_balance - amount, net_daily_after)

    shortfall_date_before = _shortfall_date(as_of, shortfall_days_before)
    shortfall_date_after = _shortfall_date(as_of, shortfall_days_after)

    introduces_shortfall = shortfall_days_before is None and shortfall_days_after is not None
    shortfall_soon = shortfall_days_after is not None and shortfall_days_after <= SHORTFALL_SOON_DAYS
    shortfall_into_window = shortfall_soon and (
        shortfall_days_before is None
        or shortfall_days_before > SHORTFALL_SOON_DAYS
        or (shortfall_days_before is not None and shortfall_days_after is not None and shortfall_days_after < shortfall_days_before)
    )

    critical_end_crossed = after_end <= CRITICAL_END_BALANCE and before_end > CRITICAL_END_BALANCE
    risk_worsened_to_high = risk_before in {"low", "med"} and risk_after == "high"

    material_impact = (
        amount >= MATERIAL_IMPACT_DOLLARS
        or (abs(amount) / max(1.0, abs(before_end))) >= MATERIAL_IMPACT_PERCENT
    )

    no_unsafe_trigger = (
        introduces_shortfall
        or shortfall_into_window
        or critical_end_crossed
        or risk_worsened_to_high
    )

    # Path-back heuristic for consistency rule
    recovery_to_safe = max(0.0, -after_safe) * max(1, days_remaining)
    recovery_to_critical_end = max(0.0, CRITICAL_END_BALANCE - after_end)
    required_recovery = max(amount, recovery_to_safe, recovery_to_critical_end)
    if days_remaining > 0:
        buffer = before_safe if before_safe > 0 else max(1.0, target_spend_daily * 0.2)
        path_back_days = int(math.ceil(required_recovery / max(1.0, buffer)))
    else:
        path_back_days = 0
    path_back_amount = required_recovery

    if no_unsafe_trigger and material_impact and not (path_back_days <= 2 or path_back_amount <= amount):
        verdict = "NO_UNSAFE"
    elif risk_after == "low":
        verdict = "YES_SAFE"
    else:
        verdict = "YES_RISKY"

    return AffordScenario(
        amount=amount,
        verdict=verdict,
        risk_level=risk_after,
        risk_level_before=risk_before,
        confidence=_confidence(days_elapsed, days_total),
        before_end_balance=before_end,
        after_end_balance=after_end,
        before_safe_per_day=before_safe,
        after_safe_per_day=after_safe,
        days_remaining=days_remaining,
        shortfall_days_before=shortfall_days_before,
        shortfall_days_after=shortfall_days_after,
        shortfall_date_before=shortfall_date_before,
        shortfall_date_after=shortfall_date_after,
        pace_ratio_before=pace_ratio_before,
        pace_ratio_after=pace_ratio_after,
        spend_daily_before=spend_daily_before,
        spend_daily_after=spend_daily_after,
        target_spend_daily=target_spend_daily,
        material_impact=material_impact,
        introduces_shortfall=introduces_shortfall,
        shortfall_soon=shortfall_soon,
        critical_end_crossed=critical_end_crossed,
        risk_worsened_to_high=risk_worsened_to_high,
        top_above_pace_category=top_cat,
        top_above_pace_amount=top_amt,
        path_back_amount=path_back_amount,
        path_back_days=path_back_days,
    )


def _risk_label(risk: str) -> str:
    return "medium" if risk == "med" else risk


def _projected_balance_before_purchase(cash: Dict[str, float]) -> float:
    income_ahead = float(cash.get("forecast_income_total", 0.0)) - float(cash.get("income_to_date", 0.0))
    upcoming_expenses = float(cash.get("forecast_spending_total", 0.0)) - float(cash.get("spending_to_date", 0.0))
    return float(income_ahead - upcoming_expenses)


def _protected_balance_floor(projected_balance_before_purchase: float) -> float:
    return float(PROTECTED_BALANCE)


def max_safe_spend(cash: Dict[str, float]) -> float:
    projected_balance = _projected_balance_before_purchase(cash)
    comfort_buffer = float(cash.get("forecast_spending_total", 0.0)) - float(cash.get("spending_to_date", 0.0))
    comfort_buffer *= COMFORT_BUFFER_RATIO
    return round(projected_balance - comfort_buffer, 2)


def build_afford_reasons(
    s: AffordScenario,
    max_safe_spend_amount: float | None = None,
    verdict: str | None = None,
) -> list[str]:
    reasons = []
    balance_reason = (
        f"After spending ${s.amount:,.2f}, your projected end balance moves "
        f"${s.before_end_balance:,.2f} -> ${s.after_end_balance:,.2f}."
    )
    effective_verdict = str(verdict or s.verdict).strip().upper()

    if effective_verdict in {"YES_SAFE", "SAFE"}:
        reasons.append(balance_reason)
        reasons.append("This leaves a meaningful buffer after expenses.")
    elif effective_verdict in {"YES_RISKY", "TIGHT"}:
        reasons.append(balance_reason)
        reasons.append("This is slightly above your safe-to-spend limit and slightly reduces your buffer.")
    else:
        if s.after_end_balance < 0:
            reasons.append(balance_reason)
            reasons.append("This risks pushing your projected balance below zero.")
        elif max_safe_spend_amount is not None:
            reasons.append(
                f"This is materially above your safe-to-spend limit of ${float(max_safe_spend_amount):,.2f}."
            )
            reasons.append(balance_reason)
        else:
            reasons.append(balance_reason)
            reasons.append("This materially reduces your buffer.")

    return reasons[:2]


def _decision_state_meta(
    *,
    legacy_verdict: str,
    before_end_balance: float,
    after_end_balance: float,
    max_safe_spend_amount: float,
) -> Dict[str, float | str]:
    safe_threshold = _protected_balance_floor(before_end_balance)
    safe_buffer = float(after_end_balance) - safe_threshold
    tight_band = max(0.0, float(max_safe_spend_amount) * (TIGHT_UPPER_MULTIPLIER - 1.0))
    legacy_key = str(legacy_verdict or "").strip().upper()

    # Keep protected balance for display/debugging, but let the original
    # affordability verdict drive the 3-state experience.
    if legacy_key == "NO_UNSAFE":
        decision_state = "NOT_RECOMMENDED"
    elif legacy_key == "YES_RISKY":
        decision_state = "TIGHT"
    else:
        decision_state = "SAFE"

    return {
        "decision_state": decision_state,
        "decision_label": DECISION_LABELS[decision_state],
        "safe_threshold": float(safe_threshold),
        "protected_balance": float(safe_threshold),
        "safe_buffer": float(safe_buffer),
        "safe_buffer_band": float(tight_band),
    }


def _build_path_back(s: AffordScenario) -> Dict[str, object] | None:
    if s.verdict == "YES_SAFE":
        return None

    if s.top_above_pace_category and s.top_above_pace_amount > 0:
        reduce_by = max(s.path_back_amount, s.top_above_pace_amount)
        return {
            "message": (
                f"Reduce {s.top_above_pace_category} spending by about ${reduce_by:,.2f} to safely afford this."
            ),
            "amount": float(reduce_by),
            "days": 0,
            "category": s.top_above_pace_category,
        }

    if s.days_remaining > 0:
        pause_days = max(1, s.path_back_days)
        return {
            "message": f"Wait ~{pause_days} days or reduce spending to safely afford this.",
            "amount": float(s.path_back_amount),
            "days": int(pause_days),
            "category": None,
        }

    return {
        "message": (
            f"Reduce spending by about ${s.path_back_amount:,.2f} to safely afford this."
        ),
        "amount": float(s.path_back_amount),
        "days": 0,
        "category": None,
    }


def build_afford_response(s: AffordScenario, max_safe_spend_amount: float) -> Dict[str, object]:
    remaining_safe = float(max_safe_spend_amount) - float(s.amount)
    decision = {
        "amount": float(s.amount),
        "verdict": s.verdict,
        "risk_level": _risk_label(s.risk_level),
        "before_end_balance": float(s.before_end_balance),
        "after_end_balance": float(s.after_end_balance),
        "delta_end_balance": float(s.after_end_balance - s.before_end_balance),
        "safe_to_spend_per_day": float(s.after_safe_per_day),
        "remaining_safe_to_spend": float(remaining_safe),
        "days_remaining": int(s.days_remaining),
        "max_safe_spend": float(max_safe_spend_amount),
        "path_back": _build_path_back(s),
        "shortfall_days": s.shortfall_days_after,
    }
    decision = finalize_affordability_decision(decision)
    if str(decision.get("verdict", "")).strip().upper() == "NO_UNSAFE":
        protected_balance = _protected_balance_floor(float(decision.get("before_end_balance", s.before_end_balance)))
        after_end_balance = float(decision.get("after_end_balance", s.after_end_balance))
        shortfall_amount = max(
            0.0,
            float(decision.get("amount", s.amount)) - float(decision.get("max_safe_spend", max_safe_spend_amount)),
            protected_balance - after_end_balance,
        )
        decision["path_back"] = {
            "message": f"Wait until your next income or reduce spending by about ${shortfall_amount:,.2f} to get back within your safe-to-spend limit.",
            "amount": float(shortfall_amount),
            "days": 0,
            "category": None,
        }
    legacy_verdict = str(decision.get("verdict", s.verdict))
    state_meta = _decision_state_meta(
        legacy_verdict=legacy_verdict,
        before_end_balance=float(decision.get("before_end_balance", s.before_end_balance)),
        after_end_balance=float(decision.get("after_end_balance", s.after_end_balance)),
        max_safe_spend_amount=float(decision.get("max_safe_spend", max_safe_spend_amount)),
    )
    decision.update(state_meta)
    if state_meta["decision_state"] != "NOT_RECOMMENDED":
        decision["path_back"] = None
    decision["tight_guidance"] = (
        "Consider waiting or trimming other spending."
        if state_meta["decision_state"] == "TIGHT"
        else None
    )
    decision["safety_runway_days"] = (
        int(s.shortfall_days_after) if s.shortfall_days_after is not None and int(s.shortfall_days_after) > 0 else None
    )
    decision["reasons"] = build_afford_reasons(
        s,
        max_safe_spend_amount=max_safe_spend_amount,
        verdict=str(decision.get("decision_state", legacy_verdict)),
    )
    return decision


def finalize_affordability_decision(decision: Dict[str, object]) -> Dict[str, object]:
    amount = float(decision.get("amount", 0.0))
    max_safe = float(decision.get("max_safe_spend", 0.0))
    before_end = float(decision.get("before_end_balance", 0.0))
    after_end = float(decision.get("after_end_balance", 0.0))
    protected_balance = _protected_balance_floor(before_end)
    tight_upper_bound = max_safe * TIGHT_UPPER_MULTIPLIER

    if after_end < protected_balance:
        decision["verdict"] = "NO_UNSAFE"
    elif amount > tight_upper_bound:
        decision["verdict"] = "NO_UNSAFE"
    elif amount > max_safe:
        decision["verdict"] = "YES_RISKY"
    else:
        decision["verdict"] = "YES_SAFE"
    decision["protected_balance"] = float(protected_balance)
    decision["safe_buffer_band"] = float(tight_upper_bound - max_safe)

    return decision


def format_afford_response(
    s: AffordScenario,
    beginner_mode: bool,
    max_safe_spend_amount: float | None = None,
) -> Dict[str, object]:
    verdict_map = {
        "YES_SAFE": "Yes — safe",
        "YES_RISKY": "Tight — proceed carefully",
        "NO_UNSAFE": "Not recommended right now",
    }
    headline = verdict_map.get(s.verdict, "Tight — proceed carefully")

    reasons = build_afford_reasons(s, max_safe_spend_amount=max_safe_spend_amount)
    if s.pace_ratio_after >= PACE_RISKY_RATIO:
        reasons.append("You’re already above your pace target.")

    why = reasons[:1] if beginner_mode else reasons[:2]
    impact = (
        f"End balance ${s.before_end_balance:,.2f} -> ${s.after_end_balance:,.2f} "
        f"(−${s.amount:,.2f})."
    )

    next_step = ""
    if s.verdict != "YES_SAFE":
        path_back = _build_path_back(s) or {}
        next_step = path_back.get("message", "")

    return {
        "headline": headline,
        "why": why[:2],
        "impact": impact,
        "next_step": next_step,
    }
