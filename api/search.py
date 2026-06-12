"""
Vercel Python serverless function — /api/search
Calls Duffel server-side and returns ranked flight offers.
DUFFEL_API_KEY is read from Vercel environment variables and never sent to the browser.
"""

from __future__ import annotations

import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler
from typing import Any

import certifi
import requests

# ── constants ───────────────────────────────────────────────────────────────

DUFFEL_BASE_URL = "https://api.duffel.com"
DUFFEL_VERSION = "v2"
SANDBOX_AIRLINES: set[str] = {"duffel airways"}
SANDBOX_OWNER_IATA_CODES: set[str] = {"ZZ"}
ALLOWED_CABIN_CLASSES = ("economy", "premium_economy", "business", "first")
MAX_RESULTS = 10
MAX_TRAVELERS = 9
REQUEST_TIMEOUT = 25.0

# ── airline IATA lookup (longest-match-first to avoid substring false-matches) ──

_AIRLINE_IATA_MAP: dict[str, str] = {
    "swiss international air lines": "LX",
    "china eastern airlines": "MU",
    "china southern airlines": "CZ",
    "singapore airlines": "SQ",
    "malaysia airlines": "MH",
    "turkish airlines": "TK",
    "austrian airlines": "OS",
    "american airlines": "AA",
    "alaska airlines": "AS",
    "united airlines": "UA",
    "qatar airways": "QR",
    "british airways": "BA",
    "japan airlines": "JL",
    "virgin atlantic": "VS",
    "air new zealand": "NZ",
    "etihad airways": "EY",
    "garuda indonesia": "GA",
    "aegean airlines": "A3",
    "royal jordanian": "RJ",
    "tap air portugal": "TP",
    "thai airways": "TG",
    "korean air": "KE",
    "delta air lines": "DL",
    "all nippon airways": "NH",
    "jetblue airways": "B6",
    "southwest airlines": "WN",
    "air france": "AF",
    "air canada": "AC",
    "air china": "CA",
    "cathay pacific": "CX",
    "china eastern": "MU",
    "china southern": "CZ",
    "aer lingus": "EI",
    "lufthansa": "LH",
    "finnair": "AY",
    "iberia": "IB",
    "qantas": "QF",
    "emirates": "EK",
    "american": "AA",
    "etihad": "EY",
    "jetblue": "B6",
    "southwest": "WN",
    "singapore": "SQ",
    "malaysia": "MH",
    "garuda": "GA",
    "turkish": "TK",
    "aegean": "A3",
    "swiss": "LX",
    "united": "UA",
    "alaska": "AS",
    "delta": "DL",
    "qatar": "QR",
    "klm": "KL",
    "tap": "TP",
    "thai": "TG",
    "all nippon": "NH",
    "el al": "LY",
    "jal": "JL",
    "ana": "NH",
    "aal": "AA",
    "ual": "UA",
    "dal": "DL",
}
_AIRLINE_IATA_SORTED = sorted(_AIRLINE_IATA_MAP.items(), key=lambda x: -len(x[0]))


# ── utility helpers ──────────────────────────────────────────────────────────

def _airline_code(airline: str, flight_number: str) -> str:
    flight = str(flight_number or "").strip()
    if flight:
        code = "".join(c for c in flight.split()[0] if c.isalpha())[:3].upper()
        if code:
            return code
    airline_l = str(airline or "").lower()
    for name, code in _AIRLINE_IATA_SORTED:
        if name in airline_l:
            return code
    initials = "".join(w[0] for w in re.findall(r"[A-Za-z]+", str(airline or ""))[:2]).upper()
    return initials or "AIR"


def _time_from_iso(value: str | None) -> str:
    if not value:
        return "--:--"
    try:
        t = str(value).strip()
        if "T" in t:
            t = t.split("T")[1]
        return t[:5]
    except Exception:
        return "--:--"


def _duration_label(value: str | None) -> str:
    if not value:
        return ""
    try:
        raw = str(value or "").upper().lstrip("P")
        hours = minutes = 0
        m = re.search(r"(\d+)H", raw)
        if m:
            hours = int(m.group(1))
        m = re.search(r"(\d+)M", raw)
        if m:
            minutes = int(m.group(1))
        if not hours and not minutes:
            return ""
        if hours and minutes:
            return f"{hours}h {minutes:02d}m"
        if hours:
            return f"{hours}h"
        return f"{minutes}m"
    except Exception:
        return str(value)


def _duration_minutes(value: str | None) -> int:
    if not value:
        return 0
    try:
        raw = str(value or "").upper().lstrip("P")
        hours = minutes = 0
        m = re.search(r"(\d+)H", raw)
        if m:
            hours = int(m.group(1))
        m = re.search(r"(\d+)M", raw)
        if m:
            minutes = int(m.group(1))
        return hours * 60 + minutes
    except Exception:
        return 0


def _clock_minutes(time_str: str | None) -> int:
    """'14:35' → 875 (minutes since midnight)."""
    try:
        parts = str(time_str or "").strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 12 * 60


def _median(values: list[float]) -> float:
    s = sorted(v for v in values if v > 0)
    if not s:
        return 0.0
    mid = len(s) // 2
    return (s[mid - 1] + s[mid]) / 2 if len(s) % 2 == 0 else s[mid]


def _display_value(value: Any) -> str:
    if value is None:
        return "Not available"
    if isinstance(value, dict):
        return " ".join(str(v) for v in value.values() if v is not None) or "Not available"
    return str(value).strip() or "Not available"


def money_usd(value: Any) -> str:
    try:
        return f"${float(value or 0):,.0f}"
    except Exception:
        return "$0"


def _flight_key(offer: dict) -> str:
    return "|".join([
        str(offer.get("airline") or ""),
        str(offer.get("flight_number") or ""),
        str(offer.get("origin") or ""),
        str(offer.get("destination") or ""),
        str(offer.get("depart_time") or ""),
        str(offer.get("arrive_time") or ""),
        str(offer.get("price_total") or ""),
    ])


# ── Duffel normalization ─────────────────────────────────────────────────────

def _is_sandbox_offer(offer: dict) -> bool:
    owner = offer.get("owner") or {}
    owner_name = str(owner.get("name") or "").strip().lower()
    owner_iata = str(owner.get("iata_code") or "").strip().upper()
    if owner_name in SANDBOX_AIRLINES or owner_iata in SANDBOX_OWNER_IATA_CODES:
        return True
    for sl in offer.get("slices") or []:
        for seg in sl.get("segments") or []:
            mc = seg.get("marketing_carrier") or {}
            oc = seg.get("operating_carrier") or {}
            mn = str(mc.get("name") or "").strip()
            on_ = str(oc.get("name") or "").strip()
            if not mn and not on_:
                return True
            if {mn.lower(), on_.lower()} & SANDBOX_AIRLINES:
                return True
    return False


def _segment_cabin(segment: dict) -> str:
    for p in segment.get("passengers") or []:
        cabin = p.get("cabin_class_marketing_name") or p.get("cabin_class")
        if cabin:
            return str(cabin)
    return "Economy"


def _extract_baggage(offer: dict) -> str:
    labels: list[str] = []
    for sl in offer.get("slices") or []:
        for seg in sl.get("segments") or []:
            for p in seg.get("passengers") or []:
                for b in p.get("baggages") or []:
                    qty = b.get("quantity")
                    typ = b.get("type")
                    if qty and typ:
                        labels.append(f"{qty} {str(typ).replace('_', ' ')}")
    return ", ".join(dict.fromkeys(labels)) if labels else ""


def _fare_conditions(offer: dict) -> list[str]:
    conditions = offer.get("conditions") or {}
    if not isinstance(conditions, dict) or not conditions:
        return ["Not available"]
    out: list[str] = []
    for key, val in conditions.items():
        label = str(key).replace("_", " ").title()
        if isinstance(val, dict):
            allowed = val.get("allowed")
            penalty = val.get("penalty_amount")
            currency = val.get("penalty_currency")
            detail = "Allowed" if allowed is True else "Not allowed" if allowed is False else "Not available"
            if penalty and currency:
                detail = f"{detail} · penalty {penalty} {currency}"
            out.append(f"{label}: {detail}")
        else:
            out.append(f"{label}: {_display_value(val)}")
    return out or ["Not available"]


def _airport_label(airport: dict) -> str:
    if not isinstance(airport, dict):
        return "Not available"
    code = airport.get("iata_code") or airport.get("id")
    name = airport.get("name")
    city = airport.get("city_name")
    label = code or name or city
    if label and name and name != label:
        return f"{label} · {name}"
    return label or "Not available"


def _layover_details(segments: list[dict]) -> list[dict]:
    out: list[dict] = []
    for i in range(max(0, len(segments) - 1)):
        cur, nxt = segments[i], segments[i + 1]
        out.append({
            "airport": _airport_label(cur.get("destination") or {}),
            "duration": _duration_label(None),  # approximate — not in segment
        })
    return out


def _segment_detail(seg: dict) -> dict:
    mc = seg.get("marketing_carrier") or {}
    fn = seg.get("marketing_carrier_flight_number")
    mc_code = mc.get("iata_code") or ""
    display_fn = f"{mc_code} {fn}".strip() if fn else mc_code
    origin = seg.get("origin") or {}
    dest = seg.get("destination") or {}
    return {
        "flight_number": display_fn or "Not available",
        "origin": _airport_label(origin),
        "destination": _airport_label(dest),
        "departure": str(seg.get("departing_at") or ""),
        "arrival": str(seg.get("arriving_at") or ""),
        "duration": _duration_label(seg.get("duration")),
        "cabin": _segment_cabin(seg),
        "aircraft": ((seg.get("aircraft") or {}).get("name") or "Not available"),
        "operating_carrier": ((seg.get("operating_carrier") or {}).get("name") or "Not available"),
    }


def _route_details(offer: dict) -> list[dict]:
    out: list[dict] = []
    for i, sl in enumerate(offer.get("slices") or []):
        segments = sl.get("segments") or []
        label = "Outbound" if i == 0 else "Return" if i == 1 else f"Leg {i+1}"
        out.append({
            "label": label,
            "origin": _airport_label(sl.get("origin") or {}),
            "destination": _airport_label(sl.get("destination") or {}),
            "duration": _duration_label(sl.get("duration")),
            "segments": [_segment_detail(s) for s in segments],
            "layovers": _layover_details(segments),
        })
    return out


def _normalize_duffel_offer(offer: dict) -> dict | None:
    slices = offer.get("slices") or []
    if not slices:
        return None
    first_slice = slices[0]
    segments = first_slice.get("segments") or []
    if not segments:
        return None
    first_seg = segments[0]
    last_seg = segments[-1]
    owner = offer.get("owner") or {}
    mc = first_seg.get("marketing_carrier") or {}
    airline = mc.get("name") or owner.get("name") or owner.get("iata_code")
    return {
        "airline": airline,
        "flight_number": (mc.get("iata_code") or "") + " " + (first_seg.get("marketing_carrier_flight_number") or ""),
        "origin": ((first_seg.get("origin") or {}).get("iata_code") or ""),
        "destination": ((last_seg.get("destination") or {}).get("iata_code") or ""),
        "departure_time": first_seg.get("departing_at"),
        "arrival_time": last_seg.get("arriving_at"),
        "duration": first_slice.get("duration"),
        "stops": max(0, len(segments) - 1),
        "cabin": _segment_cabin(segments[0]),
        "baggage": _extract_baggage(offer),
        "route_details": _route_details(offer),
        "fare_conditions": _fare_conditions(offer),
        "price": offer.get("total_amount"),
        "currency": offer.get("total_currency") or "USD",
    }


def _normalize_duffel_flight(flight: dict, adults: int) -> dict | None:
    traveler_count = max(1, int(adults or 1))
    price = float(flight.get("price") or 0)
    airline = str(flight.get("airline") or "").strip()
    flight_number = str(flight.get("flight_number") or "").strip()
    if not airline or not flight_number or price <= 0:
        return None
    code = _airline_code(airline, flight_number)
    stops = int(flight.get("stops") or 0)
    return {
        "airline": airline,
        "airline_code": code,
        "flight_number": flight_number.strip(),
        "origin": flight.get("origin") or "",
        "destination": flight.get("destination") or "",
        "depart_time": _time_from_iso(flight.get("departure_time")),
        "arrive_time": _time_from_iso(flight.get("arrival_time")),
        "duration": _duration_label(flight.get("duration")),
        "stops": stops,
        "stop_label": "Non-stop" if stops == 0 else f"{stops} stop" if stops == 1 else f"{stops} stops",
        "cabin": flight.get("cabin") or "Economy",
        "baggage": flight.get("baggage") or "",
        "route_details": flight.get("route_details") or [],
        "fare_conditions": flight.get("fare_conditions") or ["Not available"],
        "price_total": price,
        "price_per_person": round(price / traveler_count, 2),
        "currency": flight.get("currency") or "USD",
    }


# ── scoring & ranking ────────────────────────────────────────────────────────

def _has_baggage(offer: dict) -> bool:
    return bool(str(offer.get("baggage") or "").strip())


def _fare_flexibility_score(offer: dict) -> float:
    conditions = " ".join(str(item).lower() for item in offer.get("fare_conditions") or [])
    score = 7
    if any(tok in conditions for tok in ("change: allowed", "refund: allowed", "allowed · penalty")):
        score += 4
    if "not allowed" in conditions:
        score -= 3
    if "not available" in conditions or not conditions.strip():
        score -= 1
    return max(0, min(10, score))


def _preference_weights(priorities: list[str] | None = None) -> dict[str, float]:
    selected = set(priorities or ["Lowest price", "Least airport stress"])
    w: dict[str, float] = {
        "price": 1.0, "duration": 1.0, "nonstop": 1.0,
        "baggage": 1.0, "arrival": 1.0, "flexibility": 1.0,
    }
    if "Lowest price" in selected:
        w["price"] += 3.5
    if "Nonstop only" in selected:
        w["nonstop"] += 4.0
    if "Best arrival time" in selected:
        w["arrival"] += 3.5
    if "Flexible changes" in selected:
        w["flexibility"] += 3.0
    if "Refundable fare" in selected:
        w["flexibility"] += 4.0
    if "More baggage included" in selected:
        w["baggage"] += 4.0
    if "Shortest travel time" in selected:
        w["duration"] += 4.0
    if "Better airline" in selected:
        w["baggage"] += 1.5
        w["arrival"] += 1.0
        w["flexibility"] += 1.0
    if "Least airport stress" in selected:
        w["nonstop"] += 3.0
        w["arrival"] += 1.5
    return w


def _score_components(offer: dict, min_price: float, max_price: float, min_dur: int, max_dur: int) -> dict[str, float]:
    price = float(offer.get("price_total") or 0)
    duration = _duration_minutes(offer.get("duration")) or 0
    price_span = max(max_price - min_price, 1)
    dur_span = max(max_dur - min_dur, 1)
    arrive = _clock_minutes(offer.get("arrive_time"))
    return {
        "price": max(0.0, min(1.0, 1 - (price - min_price) / price_span)),
        "duration": max(0.0, min(1.0, 1 - (duration - min_dur) / dur_span)),
        "nonstop": 1.0 if int(offer.get("stops") or 0) == 0 else max(0.0, 0.5 - int(offer.get("stops") or 0) * 0.2),
        "baggage": 1.0 if _has_baggage(offer) else 0.35,
        "arrival": 1.0 if 10 * 60 <= arrive <= 21 * 60 else 0.35,
        "flexibility": _fare_flexibility_score(offer) / 10,
    }


def _score_breakdown(components: dict) -> dict[str, float]:
    convenience = components["duration"] * 0.45 + components["nonstop"] * 0.35 + components["baggage"] * 0.20
    return {
        "Price": round(components["price"] * 10, 1),
        "Convenience": round(convenience * 10, 1),
        "Flexibility": round(components["flexibility"] * 10, 1),
        "Arrival timing": round(components["arrival"] * 10, 1),
    }


def _ai_score_map(offers: list[dict]) -> dict[str, dict]:
    if not offers:
        return {}
    prices = [float(o.get("price_total") or 0) for o in offers if float(o.get("price_total") or 0) > 0] or [1.0]
    durations = [_duration_minutes(o.get("duration")) for o in offers if _duration_minutes(o.get("duration")) > 0] or [1]
    min_p, max_p = min(prices), max(prices)
    min_d, max_d = min(durations), max(durations)
    weights = _preference_weights()
    out: dict[str, dict] = {}
    for o in offers:
        comps = _score_components(o, min_p, max_p, min_d, max_d)
        weighted = sum(comps[k] * weights[k] for k in weights)
        score = round(max(45, min(99, 50 + weighted * 49)))
        out[_flight_key(o)] = {"score": score, "breakdown": _score_breakdown(comps)}
    return out


def _arrival_timing_label(offer: dict) -> str:
    arrival = _clock_minutes(offer.get("arrive_time"))
    if 11 * 60 <= arrival < 17 * 60:
        return "Great"
    if 6 * 60 <= arrival < 11 * 60:
        return "Good"
    if 17 * 60 <= arrival < 22 * 60:
        return "Okay"
    return "Bad"


def _city_access_level(airport_code: str) -> str:
    levels = {
        "HND": "Easy", "NRT": "Moderate", "LGA": "Easy", "EWR": "Moderate", "JFK": "Moderate",
        "SFO": "Easy", "OAK": "Moderate", "SJC": "Moderate", "KIX": "Moderate", "ITM": "Easy",
        "LHR": "Easy", "LGW": "Moderate", "LCY": "Easy", "CDG": "Moderate", "ORY": "Moderate",
    }
    return levels.get(str(airport_code or "").upper(), "Unknown")


def _aircraft_comfort(offer: dict) -> str:
    values: list[str] = []
    for sl in offer.get("route_details") or []:
        for seg in sl.get("segments") or []:
            a = str(seg.get("aircraft") or "Not available").strip()
            if a and a != "Not available":
                values.append(a)
    if not values:
        return "Unknown"
    text = " ".join(values).upper()
    if any(c in text for c in ("A350", "B787", "787", "A380")):
        return "Excellent"
    if any(c in text for c in ("A330", "B777", "777", "B767", "767")):
        return "Good"
    if any(c in text for c in ("A321", "A320", "B737", "737")):
        return "Fair"
    if any(c in text for c in ("E17", "E19", "CRJ", "ERJ", "RJ")):
        return "Basic"
    return "Unknown"


def _jet_lag_label(offer: dict) -> str:
    zone_offsets: dict[str, int] = {
        "SFO": -8, "OAK": -8, "SJC": -8, "LAX": -8, "BUR": -8, "SNA": -8,
        "JFK": -5, "LGA": -5, "EWR": -5, "ORD": -6, "MDW": -6, "DCA": -5, "IAD": -5, "BWI": -5,
        "HND": 9, "NRT": 9, "KIX": 9, "ITM": 9, "ICN": 9, "GMP": 9,
        "LHR": 0, "LGW": 0, "LCY": 0, "STN": 0, "CDG": 1, "ORY": 1,
        "BKK": 7, "DMK": 7, "SIN": 8, "SYD": 10, "MEL": 10, "NBO": 3,
        "DXB": 4, "DOH": 3, "AUH": 4, "IST": 3, "CAI": 2,
    }
    orig = str(offer.get("origin") or "").upper()
    dest = str(offer.get("destination") or "").upper()
    if orig not in zone_offsets or dest not in zone_offsets:
        return "Unknown"
    raw = abs(zone_offsets[dest] - zone_offsets[orig])
    shift = min(raw, 24 - raw)
    if shift >= 9:
        return "Very High"
    if shift >= 6:
        return "High"
    if shift >= 3:
        return "Moderate"
    return "Low"


def _travel_fatigue_label(offer: dict) -> str:
    dur = _duration_minutes(offer.get("duration")) or 0
    stops = int(offer.get("stops") or 0)
    score = 0.0
    if dur >= 20 * 60:
        score += 3.2
    elif dur >= 14 * 60:
        score += 2.35
    elif dur >= 9 * 60:
        score += 1.35
    elif dur >= 5 * 60:
        score += 0.55
    score += min(3.0, stops * 1.15)
    if _arrival_timing_label(offer) == "Bad":
        score += 1.35
    elif _arrival_timing_label(offer) == "Okay":
        score += 0.45
    cabin = str(offer.get("cabin") or "").lower()
    if cabin in {"business", "first"}:
        score -= 0.9
    elif cabin == "premium_economy":
        score -= 0.35
    if score >= 5.6:
        return "Very High"
    if score >= 3.5:
        return "High"
    if score >= 1.6:
        return "Moderate"
    return "Low"


def _why_over_others(best: dict, offers: list[dict], recs: dict[str, dict]) -> list[str]:
    others = [o for o in offers if _flight_key(o) != _flight_key(best)]
    if not others:
        return ["Only returned live fare for these parameters."]
    bullets: list[str] = []
    best_price = float(best.get("price_total") or 0)
    cheapest = min(offers, key=lambda o: float(o.get("price_total") or 999999))
    cheapest_price = float(cheapest.get("price_total") or 0)
    if cheapest_price and best_price:
        if _flight_key(cheapest) != _flight_key(best):
            bullets.append(f"{money_usd(best_price - cheapest_price)} more than the cheapest visible fare.")
        else:
            bullets.append(f"{money_usd(best_price)} matches the lowest visible fare.")
    fastest = min(offers, key=lambda o: (_duration_minutes(o.get("duration")) or 99999, float(o.get("price_total") or 0)))
    fastest_price = float(fastest.get("price_total") or 0)
    if fastest_price > best_price:
        bullets.append(f"Saves {money_usd(fastest_price - best_price)} compared with the fastest option.")
    best_dur = _duration_minutes(best.get("duration")) or 0
    fastest_dur = _duration_minutes(fastest.get("duration")) or 0
    if fastest_dur and best_dur and _flight_key(fastest) != _flight_key(best):
        delta = best_dur - fastest_dur
        if delta > 0:
            h, m = divmod(int(delta), 60)
            dl = f"{h}h {m}m" if h and m else f"{h}h" if h else f"{m}m"
            bullets.append(f"{dl} longer than the fastest visible option.")
    if int(best.get("stops") or 0) == 0:
        connecting = [o for o in others if int(o.get("stops") or 0) > 0]
        if connecting:
            n = len(connecting)
            bullets.append(f"Nonstop while {n} visible option{'s' if n != 1 else ''} require a connection.")
    score = recs.get(_flight_key(best), {}).get("score")
    if score:
        bullets.append(f"Ranks highest for selected priorities with an AI Score of {score}.")
    return bullets[:3] or ["Best balance of price, routing, and timing from live results."]


def _recommendation_map(offers: list[dict]) -> dict[str, dict]:
    if not offers:
        return {}
    score_data = _ai_score_map(offers)
    prices = [float(o.get("price_total") or 0) for o in offers]
    durations = [_duration_minutes(o.get("duration")) or 99999 for o in offers]
    median_price = _median(prices)
    median_duration = _median(durations)
    cheapest = min(offers, key=lambda o: (float(o.get("price_total") or 999999), _duration_minutes(o.get("duration")) or 999999))
    fastest = min(offers, key=lambda o: (_duration_minutes(o.get("duration")) or 99999, float(o.get("price_total") or 0)))
    best_overall = max(offers, key=lambda o: score_data.get(_flight_key(o), {}).get("score", 0))
    nonstop_options = [o for o in offers if int(o.get("stops") or 0) == 0]
    cheapest_nonstop = min(nonstop_options, key=lambda o: float(o.get("price_total") or 999999)) if nonstop_options else None
    baggage_options = [o for o in offers if _has_baggage(o)]
    baggage_best = min(baggage_options, key=lambda o: float(o.get("price_total") or 999999)) if baggage_options else None
    flexible_best = max(offers, key=lambda o: (_fare_flexibility_score(o), -float(o.get("price_total") or 0)))

    recs: dict[str, dict] = {}
    for o in offers:
        key = _flight_key(o)
        label = "Best value"
        why = "This balances price, routing, timing, and flexibility better than most options."
        if cheapest_nonstop and key == _flight_key(cheapest_nonstop):
            label = "Cheapest nonstop"
            why = "This keeps the trip nonstop while staying closest to the lowest fare."
        elif key == _flight_key(fastest):
            label = "Fastest"
            why = f"Shortest total travel time at {_duration_label(o.get('duration'))}."
        elif key == _flight_key(flexible_best):
            label = "Most flexible"
            why = "Best fit if change or refund flexibility matters."
        elif baggage_best and key == _flight_key(baggage_best):
            label = "Best baggage"
            why = "Baggage is clearer than most alternatives here."
        elif key == _flight_key(best_overall):
            label = "Best overall"
            why = "Best match for selected priorities across all factors."
        elif key == _flight_key(cheapest):
            label = "Best value"
            why = f"Lowest visible fare at {money_usd(float(o.get('price_total') or 0))}."
        if float(o.get("price_total") or 0) <= median_price and (_duration_minutes(o.get("duration")) or 99999) <= median_duration:
            why = f"{why} Efficient on both price and travel time."
        recs[key] = {**score_data.get(key, {"score": 75, "breakdown": {}}), "label": label, "why": why}
    return recs


# ── Duffel search ────────────────────────────────────────────────────────────

def _duffel_api_key() -> str:
    return str(os.getenv("DUFFEL_API_KEY", "")).strip()


def load_flight_offers(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: str | None,
    adults: int,
    cabin_class: str,
    trip_type: str = "roundtrip",
) -> tuple[list[dict], bool, dict]:
    api_key = _duffel_api_key()
    if not api_key:
        return [], False, {"status": "not_configured", "message": "Flight search is temporarily unavailable."}

    slices: list[dict] = [
        {"origin": origin.upper(), "destination": destination.upper(), "departure_date": departure_date}
    ]
    if trip_type == "roundtrip" and return_date:
        slices.append(
            {"origin": destination.upper(), "destination": origin.upper(), "departure_date": return_date}
        )

    payload = {
        "data": {
            "slices": slices,
            "passengers": [{"type": "adult"} for _ in range(max(1, int(adults)))],
            "cabin_class": cabin_class,
        }
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Duffel-Version": DUFFEL_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        t0 = time.perf_counter()
        resp = requests.post(
            f"{DUFFEL_BASE_URL}/air/offer_requests",
            json=payload,
            headers=headers,
            timeout=REQUEST_TIMEOUT,
            verify=certifi.where(),
        )
        elapsed = time.perf_counter() - t0
        resp.raise_for_status()
        data = resp.json().get("data") or {}
        raw_offers = data.get("offers") or []
        live_offers = [o for o in raw_offers if not _is_sandbox_offer(o)]
        candidates = [_normalize_duffel_offer(o) for o in live_offers[:MAX_RESULTS]]
        normalized_raw = [c for c in candidates if c]
        normalized = [_normalize_duffel_flight(f, adults) for f in normalized_raw]
        offers = [f for f in normalized if f]
        meta = {
            "status": "ok" if offers else "empty",
            "message": None if offers else "No live fares found for these dates. Try different dates or airports.",
            "raw_count": len(raw_offers),
            "live_count": len(live_offers),
            "offer_count": len(offers),
            "duffel_ms": round(elapsed * 1000),
        }
        return offers, bool(offers), meta
    except requests.HTTPError as exc:
        try:
            err = exc.response.json()
            msg = (err.get("errors") or [{}])[0].get("message") or f"Duffel API error ({exc.response.status_code})."
        except Exception:
            msg = str(exc)
        return [], False, {"status": "error", "message": msg}
    except Exception as exc:
        return [], False, {"status": "error", "message": f"Search failed: {str(exc)[:200]}"}


# ── request validation ───────────────────────────────────────────────────────

def _validate_request(body: dict) -> tuple[dict | None, str | None]:
    origin = str(body.get("origin") or "").strip().upper()
    destination = str(body.get("destination") or "").strip().upper()
    departure_date = str(body.get("departure_date") or "").strip()
    return_date = str(body.get("return_date") or "").strip() or None
    adults_raw = body.get("adults", 1)
    cabin_class = str(body.get("cabin_class") or "economy").strip().lower()
    trip_type = str(body.get("trip_type") or "roundtrip").strip().lower()

    if not re.fullmatch(r"[A-Z]{3}", origin):
        return None, "Invalid origin airport code."
    if not re.fullmatch(r"[A-Z]{3}", destination):
        return None, "Invalid destination airport code."
    if origin == destination:
        return None, "Origin and destination must be different."
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", departure_date):
        return None, "Invalid departure date format (YYYY-MM-DD)."
    if trip_type == "roundtrip":
        if not return_date:
            return None, "Return date is required for round trips."
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", return_date):
            return None, "Invalid return date format (YYYY-MM-DD)."
        if return_date < departure_date:
            return None, "Return date must be on or after departure date."
    try:
        adults = max(1, min(MAX_TRAVELERS, int(adults_raw)))
    except (TypeError, ValueError):
        adults = 1
    if cabin_class not in ALLOWED_CABIN_CLASSES:
        cabin_class = "economy"
    if trip_type not in ("roundtrip", "oneway"):
        trip_type = "roundtrip"

    return {
        "origin": origin,
        "destination": destination,
        "departure_date": departure_date,
        "return_date": return_date,
        "adults": adults,
        "cabin_class": cabin_class,
        "trip_type": trip_type,
    }, None


# ── HTTP handler ─────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:  # silence default logging
        pass

    def _send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length)
            body = json.loads(raw) if raw else {}
        except Exception:
            self._send_json(400, {"status": "error", "message": "Invalid JSON body."})
            return

        params, err = _validate_request(body)
        if err:
            self._send_json(400, {"status": "validation_error", "message": err})
            return

        offers, live, meta = load_flight_offers(
            origin=params["origin"],
            destination=params["destination"],
            departure_date=params["departure_date"],
            return_date=params["return_date"],
            adults=params["adults"],
            cabin_class=params["cabin_class"],
            trip_type=params["trip_type"],
        )

        if meta.get("status") == "not_configured":
            self._send_json(503, {"status": "not_configured", "message": meta.get("message", "")})
            return

        if meta.get("status") == "error":
            self._send_json(502, {"status": "error", "message": meta.get("message", "Search failed.")})
            return

        if not offers:
            self._send_json(200, {
                "status": "empty",
                "message": meta.get("message", "No flights found."),
                "offers": [],
            })
            return

        # Rank and annotate
        recs = _recommendation_map(offers)
        best_key = max(recs, key=lambda k: recs[k].get("score", 0))
        enriched: list[dict] = []
        for o in offers:
            key = _flight_key(o)
            rec = recs.get(key, {})
            is_rec = key == best_key
            bullets = _why_over_others(o, offers, recs) if is_rec else []
            enriched.append({
                **o,
                "ai_score": rec.get("score", 75),
                "score_breakdown": rec.get("breakdown", {}),
                "recommendation_label": rec.get("label", "Best value"),
                "recommendation_why": rec.get("why", ""),
                "recommendation_bullets": bullets,
                "is_recommended": is_rec,
                "arrival_timing": _arrival_timing_label(o),
                "jet_lag": _jet_lag_label(o),
                "travel_fatigue": _travel_fatigue_label(o),
                "city_access": _city_access_level(str(o.get("destination") or "")),
                "aircraft_comfort": _aircraft_comfort(o),
            })

        # Sort: recommended first, then by score desc
        enriched.sort(key=lambda o: (0 if o["is_recommended"] else 1, -o["ai_score"]))

        self._send_json(200, {
            "status": "ok",
            "offers": enriched,
            "meta": {
                "origin": params["origin"],
                "destination": params["destination"],
                "trip_type": params["trip_type"],
                "cabin_class": params["cabin_class"],
                "adults": params["adults"],
                **{k: v for k, v in meta.items() if k != "status"},
            },
        })
