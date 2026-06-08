import html
import json
import os
import re
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

import certifi
import requests
import streamlit as st

from analytics import track_event, track_once

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(dotenv_path=None, **_kwargs):
        path = Path(dotenv_path or ".env")
        if not path.exists():
            return False
        for raw_line in path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        return True

ISO_DATE_FORMAT = "%Y-%m-%d"
DUFFEL_BASE_URL = "https://api.duffel.com"
DUFFEL_VERSION = "v2"
MAX_CITY_SEARCH_SECONDS = 12.0
FLIGHT_SEARCH_RATE_LIMIT_SECONDS = 8.0
AI_ADVISOR_RATE_LIMIT_SECONDS = 6.0
MAX_CITY_INPUT_LENGTH = 64
MAX_TRAVELERS = 9
SANDBOX_AIRLINES = {"duffel airways"}
SANDBOX_OWNER_IATA_CODES = {"ZZ"}
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALLOWED_CABIN_CLASSES = ("economy", "premium_economy", "business", "first")
CITY_INPUT_PATTERN = re.compile(r"^[A-Za-z][A-Za-z .,'-]{0,63}$")
TRAVELER_PRIORITIES = [
    "Lowest price",
    "Nonstop only",
    "Best arrival time",
    "Flexible changes",
    "Refundable fare",
    "More baggage included",
    "Shortest travel time",
    "Better airline",
    "Least airport stress",
]
DEFAULT_PRIORITIES = ["Lowest price", "Least airport stress"]
CITY_AIRPORTS = {
    "san francisco": {"label": "San Francisco", "airports": ["SFO"]},
    "sf": {"label": "San Francisco", "airports": ["SFO"]},
    "bay area": {"label": "San Francisco", "airports": ["SFO", "OAK", "SJC"]},
    "tokyo": {"label": "Tokyo", "airports": ["HND", "NRT"]},
    "new york": {"label": "New York", "airports": ["JFK", "LGA", "EWR"]},
    "nyc": {"label": "New York", "airports": ["JFK", "LGA", "EWR"]},
    "london": {"label": "London", "airports": ["LHR", "LGW", "LCY", "STN", "LTN"]},
    "los angeles": {"label": "Los Angeles", "airports": ["LAX", "BUR", "SNA", "ONT", "LGB"]},
    "la": {"label": "Los Angeles", "airports": ["LAX", "BUR", "SNA", "ONT", "LGB"]},
    "beijing": {"label": "Beijing", "airports": ["PEK", "PKX"]},
    "peking": {"label": "Beijing", "airports": ["PEK", "PKX"]},
    "chicago": {"label": "Chicago", "airports": ["ORD", "MDW"]},
    "washington dc": {"label": "Washington, DC", "airports": ["DCA", "IAD", "BWI"]},
    "dc": {"label": "Washington, DC", "airports": ["DCA", "IAD", "BWI"]},
    "paris": {"label": "Paris", "airports": ["CDG", "ORY"]},
    "seoul": {"label": "Seoul", "airports": ["ICN", "GMP"]},
    "osaka": {"label": "Osaka", "airports": ["KIX", "ITM"]},
    "kyoto": {"label": "Kyoto", "airports": ["KIX", "ITM"]},
    "shanghai": {"label": "Shanghai", "airports": ["PVG", "SHA"]},
    "hong kong": {"label": "Hong Kong", "airports": ["HKG"]},
    "taipei": {"label": "Taipei", "airports": ["TPE", "TSA"]},
    "bangkok": {"label": "Bangkok", "airports": ["BKK", "DMK"]},
    "singapore": {"label": "Singapore", "airports": ["SIN"]},
    "sydney": {"label": "Sydney", "airports": ["SYD"]},
    "melbourne": {"label": "Melbourne", "airports": ["MEL"]},
    "toronto": {"label": "Toronto", "airports": ["YYZ", "YTZ"]},
    "vancouver": {"label": "Vancouver", "airports": ["YVR"]},
    "mexico city": {"label": "Mexico City", "airports": ["MEX", "NLU"]},
    "madrid": {"label": "Madrid", "airports": ["MAD"]},
    "rome": {"label": "Rome", "airports": ["FCO", "CIA"]},
    "amsterdam": {"label": "Amsterdam", "airports": ["AMS"]},
    "frankfurt": {"label": "Frankfurt", "airports": ["FRA"]},
    "dubai": {"label": "Dubai", "airports": ["DXB", "DWC"]},
    "doha": {"label": "Doha", "airports": ["DOH"]},
    "istanbul": {"label": "Istanbul", "airports": ["IST", "SAW"]},
    "mumbai": {"label": "Mumbai", "airports": ["BOM"]},
    "delhi": {"label": "Delhi", "airports": ["DEL"]},
}
# Process-level cache for Duffel place resolutions so repeated renders don't
# re-call the API for the same city during the same server session.
_DUFFEL_PLACE_CACHE: dict = {}
DESTINATION_HERO_IMAGES = {
    "tokyo": "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=1800&q=80",
    "paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1800&q=80",
    "london": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1800&q=80",
    "new york": "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1800&q=80",
    "nyc": "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1800&q=80",
}

load_dotenv(dotenv_path=PROJECT_ROOT / ".env")


def _time_from_iso(value):
    if not value:
        return "--:--"
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%H:%M")
    except ValueError:
        return str(value)


def _date_time_label(value):
    if not value:
        return "Not available"
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%b %-d, %H:%M")
    except ValueError:
        return str(value)


def _duration_label(value):
    raw = str(value or "")
    if raw.startswith("P"):
        total_minutes = _duration_minutes(raw)
        if total_minutes:
            hours, minutes = divmod(total_minutes, 60)
            return f"{hours}h {minutes}m" if minutes else f"{hours}h"
    return raw


def _duration_minutes(value):
    raw = str(value or "")
    days = hours = minutes = 0
    if raw.startswith("P"):
        day_match = re.search(r"(\d+)D", raw)
        hour_match = re.search(r"(\d+)H", raw)
        minute_match = re.search(r"(\d+)M", raw)
        days = int(day_match.group(1)) if day_match else 0
        hours = int(hour_match.group(1)) if hour_match else 0
        minutes = int(minute_match.group(1)) if minute_match else 0
        return days * 1440 + hours * 60 + minutes
    hour_match = re.search(r"(\d+)\s*h", raw)
    minute_match = re.search(r"(\d+)\s*m", raw)
    hours = int(hour_match.group(1)) if hour_match else 0
    minutes = int(minute_match.group(1)) if minute_match else 0
    return hours * 60 + minutes


def _clock_minutes(value):
    try:
        parsed = datetime.strptime(str(value or ""), "%H:%M")
        return parsed.hour * 60 + parsed.minute
    except ValueError:
        return 12 * 60


def _median(values):
    cleaned = sorted(float(value) for value in values if value is not None)
    if not cleaned:
        return 0
    midpoint = len(cleaned) // 2
    if len(cleaned) % 2:
        return cleaned[midpoint]
    return (cleaned[midpoint - 1] + cleaned[midpoint]) / 2


def _duration_between(start, end):
    try:
        start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return "Not available"
    minutes = max(0, int((end_dt - start_dt).total_seconds() // 60))
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m" if mins else f"{hours}h"


def _display_value(value):
    if value is None:
        return "Not available"
    text = str(value).strip()
    return text if text else "Not available"


def _openai_api_key():
    try:
        value = st.secrets.get("OPENAI_API_KEY", "")
    except Exception:
        value = ""
    return str(value or os.getenv("OPENAI_API_KEY", "") or "").strip()


def _ai_status():
    openai_key_loaded = bool(_openai_api_key())
    try:
        import openai  # noqa: F401
        openai_import = True
    except Exception:
        openai_import = False
    reasons = []
    if not openai_key_loaded:
        reasons.append("OPENAI_API_KEY missing")
    if not openai_import:
        reasons.append("openai package import failed")
    return {
        "openai_key_loaded": openai_key_loaded,
        "openai_import": openai_import,
        "advisor_copy_enabled": openai_key_loaded and openai_import,
        "reason": ", ".join(reasons) if reasons else "enabled",
    }


def _print_ai_status():
    status = _ai_status()
    print(
        "BYABLE AI STATUS:\n"
        f"OPENAI_API_KEY loaded: {str(status['openai_key_loaded']).lower()}\n"
        f"openai import available: {str(status['openai_import']).lower()}\n"
        f"AI advisor copy enabled: {str(status['advisor_copy_enabled']).lower()}\n"
        f"reason: {status['reason']}"
    )


def _run_ai_setup_check_once():
    if st.session_state.get("byable_ai_status_v2_printed"):
        return
    _print_ai_status()
    st.session_state["byable_ai_status_v2_printed"] = True


def _log_ai_attempt(flight_id, model, input_fields):
    print(
        "BYABLE AI ATTEMPT:\n"
        f"flight_id: {flight_id}\n"
        f"model: {model}\n"
        f"input fields: {', '.join(str(field) for field in input_fields)}"
    )


def _log_ai_success(flight_id, seconds):
    print(
        "BYABLE AI SUCCESS:\n"
        f"flight_id: {flight_id}\n"
        f"seconds: {seconds:.2f}"
    )


def _log_ai_failed(reason):
    print(
        "BYABLE AI FAILED:\n"
        f"reason: {reason}"
    )


def _resolve_city_airports(value):
    raw = str(value or "").strip()
    normalized = re.sub(r"\s+", " ", raw.lower())
    if normalized in CITY_AIRPORTS:
        entry = CITY_AIRPORTS[normalized]
        return entry["label"], list(entry["airports"])
    if re.fullmatch(r"[A-Za-z]{3}", raw):
        code = raw.upper()
        return code, [code]
    label = raw.title() if raw else "San Francisco"
    fallback_code = raw.upper()[:3] if raw else "SFO"
    return label, [fallback_code]


def _city_resolution_known(value):
    raw = str(value or "").strip()
    normalized = re.sub(r"\s+", " ", raw.lower())
    return normalized in CITY_AIRPORTS or bool(re.fullmatch(r"[A-Za-z]{3}", raw))


def _airport_codes_text(airports):
    return "/".join(str(code).upper() for code in airports if code)


def _airport_resolution_label(origin_airports, destination_airports, return_origin_airports=None, open_jaw=False):
    outbound = f"{_airport_codes_text(origin_airports)} → {_airport_codes_text(destination_airports)}"
    if not open_jaw:
        return outbound
    return f"{outbound} · {_airport_codes_text(return_origin_airports or destination_airports)} → {_airport_codes_text(origin_airports)}"


def _clean_city_input(value):
    """Normalize public city input before using it in search payloads or logs."""
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return text[:MAX_CITY_INPUT_LENGTH]


def _validate_city_input(value, label):
    """Allow common city names and IATA codes while rejecting unexpected input."""
    text = _clean_city_input(value)
    if not text:
        return None, f"{label} is required."
    if len(str(value or "").strip()) > MAX_CITY_INPUT_LENGTH:
        return None, f"{label} must be {MAX_CITY_INPUT_LENGTH} characters or fewer."
    if re.fullmatch(r"[A-Za-z]{3}", text):
        return text.upper(), None
    if not CITY_INPUT_PATTERN.fullmatch(text):
        return None, f"{label} can only include letters, spaces, apostrophes, hyphens, periods, and commas."
    return text, None


def _validate_traveler_count(value):
    """Keep traveler count in Duffel's expected public-search range."""
    try:
        count = int(value)
    except (TypeError, ValueError):
        return None, "Travelers must be a whole number."
    if count < 1 or count > MAX_TRAVELERS:
        return None, f"Travelers must be between 1 and {MAX_TRAVELERS}."
    return count, None


def _validate_cabin_class(value):
    """Reject stale or tampered cabin values before calling Duffel."""
    cabin = str(value or "").strip().lower()
    if cabin not in ALLOWED_CABIN_CLASSES:
        return None, "Cabin must be Economy, Premium Economy, Business, or First."
    return cabin, None


def _validate_priorities(values):
    """Accept only known plain-language priority labels and cap selection size."""
    allowed = []
    for value in values or []:
        if value in TRAVELER_PRIORITIES and value not in allowed:
            allowed.append(value)
    return (allowed or list(DEFAULT_PRIORITIES))[:3]


def _rate_limit_action(state_key, interval_seconds):
    """Lightweight per-session rate limiting for expensive external calls."""
    now = time.monotonic()
    last_called = float(st.session_state.get(state_key) or 0)
    remaining = interval_seconds - (now - last_called)
    if remaining > 0:
        return False, remaining
    st.session_state[state_key] = now
    return True, 0.0


def _destination_hero_image(city):
    normalized = re.sub(r"\s+", " ", str(city or "").strip().lower())
    return DESTINATION_HERO_IMAGES.get(normalized)


def _airport_combo_label(city_label, airports):
    airport_text = ", ".join(airports[:4])
    return f"{city_label} ({airport_text})"


def _airport_search_combinations(origin_airports, destination_airports, return_origin_airports, max_attempts=None):
    combinations = []
    for origin_index, origin_airport in enumerate(origin_airports):
        for destination_index, destination_airport in enumerate(destination_airports):
            if origin_airport == destination_airport:
                continue
            for return_index, return_origin_airport in enumerate(return_origin_airports):
                if return_origin_airport == origin_airport:
                    continue
                same_destination_return = return_origin_airport == destination_airport
                combinations.append(
                    (
                        (
                            origin_index + destination_index + return_index,
                            0 if same_destination_return else 1,
                            origin_index,
                            destination_index,
                            return_index,
                        ),
                        origin_airport,
                        destination_airport,
                        return_origin_airport,
                    )
                )
    combinations.sort(key=lambda item: item[0])
    resolved = [(origin, destination, return_origin) for _rank, origin, destination, return_origin in combinations]
    if max_attempts is None:
        return resolved
    return resolved[:max_attempts]


def _airline_code(airline, flight_number):
    flight = str(flight_number or "").strip()
    if flight:
        code = "".join([char for char in flight.split()[0] if char.isalpha()])[:3].upper()
        if code:
            return code
    airline_l = str(airline or "").lower()
    known_codes = {
        "american": "AA",
        "british airways": "BA",
        "japan airlines": "JL",
        "all nippon": "NH",
        "ana": "NH",
        "united": "UA",
        "delta": "DL",
        "alaska": "AS",
        "jetblue": "B6",
        "southwest": "WN",
        "air canada": "AC",
        "lufthansa": "LH",
        "air france": "AF",
        "klm": "KL",
        "emirates": "EK",
        "qatar": "QR",
        "singapore": "SQ",
        "korean air": "KE",
    }
    for name, code in known_codes.items():
        if name in airline_l:
            return code
    if "japan" in airline_l:
        return "JL"
    if "ana" in airline_l or "all nippon" in airline_l:
        return "NH"
    if "united" in airline_l:
        return "UA"
    initials = "".join(word[0] for word in re.findall(r"[A-Za-z]+", str(airline or ""))[:2]).upper()
    return initials or "AIR"


def _normalize_duffel_flight(flight, adults):
    traveler_count = max(1, int(adults or 1))
    stops = int(flight.get("stops") or 0)
    price = float(flight.get("price") or 0)
    airline = str(flight.get("airline") or "").strip()
    flight_number = str(flight.get("flight_number") or "").strip()
    if not airline or not flight_number or price <= 0:
        return None
    code = _airline_code(airline, flight_number)
    return {
        "airline": airline,
        "airline_code": code,
        "flight_number": flight_number,
        "origin": flight.get("origin") or "SFO",
        "destination": flight.get("destination") or "HND",
        "depart_time": _time_from_iso(flight.get("departure_time")),
        "arrive_time": _time_from_iso(flight.get("arrival_time")),
        "duration": _duration_label(flight.get("duration")),
        "total_travel_time": _duration_label(flight.get("duration")),
        "stops": stops,
        "stop_label": "Non-stop" if stops == 0 else f"{stops} stop" if stops == 1 else f"{stops} stops",
        "cabin": flight.get("cabin") or "Economy",
        "baggage": flight.get("baggage") or "",
        "route_details": flight.get("route_details") or [],
        "fare_conditions": flight.get("fare_conditions") or ["Not available"],
        "price_total": price,
        "price_per_person": price / traveler_count,
        "currency": flight.get("currency") or "USD",
        "provider": "Duffel",
        "source": "duffel",
    }


def _as_iso_date(value):
    if isinstance(value, date):
        return value.isoformat()
    raw = str(value or "").strip()
    for fmt in (ISO_DATE_FORMAT, "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return raw


def _validate_iso_date(value, label):
    raw = _as_iso_date(value)
    try:
        parsed = datetime.strptime(raw, ISO_DATE_FORMAT).date()
    except ValueError:
        return None, f"{label} must be in YYYY-MM-DD format."
    return parsed.isoformat(), None


def _api_status(payload, live, offers):
    if live and offers:
        return "Live Duffel test fares"
    status = str((payload or {}).get("status") or "").lower()
    if status == "not_configured":
        return "Duffel key missing"
    if status == "idle":
        return "Ready to search"
    if status == "ok":
        return "No fares found"
    return "Duffel API error"


def _apply_flight_filters(offers, nonstop_only=False):
    filtered = list(offers)
    if nonstop_only:
        filtered = [offer for offer in filtered if int(offer.get("stops") or 0) == 0]
    return filtered


def _fare_flexibility_score(offer):
    conditions = " ".join(str(item).lower() for item in offer.get("fare_conditions") or [])
    score = 7
    if any(token in conditions for token in ("change: allowed", "refund: allowed", "allowed · penalty")):
        score += 4
    if "not allowed" in conditions:
        score -= 3
    if "not available" in conditions or not conditions.strip():
        score -= 1
    return max(0, min(10, score))


def _has_baggage(offer):
    return bool(str(offer.get("baggage") or "").strip())


def _preference_weights(priorities):
    selected = set(priorities or DEFAULT_PRIORITIES)
    weights = {
        "price": 1.0,
        "duration": 1.0,
        "nonstop": 1.0,
        "baggage": 1.0,
        "arrival": 1.0,
        "flexibility": 1.0,
    }
    if "Lowest price" in selected:
        weights["price"] += 3.5
    if "Nonstop only" in selected:
        weights["nonstop"] += 4.0
    if "Best arrival time" in selected:
        weights["arrival"] += 3.5
    if "Flexible changes" in selected:
        weights["flexibility"] += 3.0
    if "Refundable fare" in selected:
        weights["flexibility"] += 4.0
    if "More baggage included" in selected:
        weights["baggage"] += 4.0
    if "Shortest travel time" in selected:
        weights["duration"] += 4.0
    if "Better airline" in selected:
        weights["baggage"] += 1.5
        weights["arrival"] += 1.0
        weights["flexibility"] += 1.0
    if "Least airport stress" in selected:
        weights["nonstop"] += 3.0
        weights["arrival"] += 1.5
    total = sum(weights.values()) or 1
    return {key: value / total for key, value in weights.items()}


def _score_components(offer, min_price, max_price, min_duration, max_duration):
    price = float(offer.get("price_total") or 0)
    duration = _duration_minutes(offer.get("duration")) or 0
    price_span = max(max_price - min_price, 1)
    duration_span = max(max_duration - min_duration, 1)
    return {
        "price": max(0, min(1, 1 - ((price - min_price) / price_span))),
        "duration": max(0, min(1, 1 - ((duration - min_duration) / duration_span))),
        "nonstop": 1 if int(offer.get("stops") or 0) == 0 else max(0, 0.5 - int(offer.get("stops") or 0) * 0.2),
        "baggage": 1 if _has_baggage(offer) else 0.35,
        "arrival": 1 if 10 * 60 <= _clock_minutes(offer.get("arrive_time")) <= 21 * 60 else 0.35,
        "flexibility": _fare_flexibility_score(offer) / 10,
    }


def _score_breakdown(components):
    convenience = (components["duration"] * 0.45) + (components["nonstop"] * 0.35) + (components["baggage"] * 0.20)
    return {
        "Price": round(components["price"] * 10, 1),
        "Convenience": round(convenience * 10, 1),
        "Flexibility": round(components["flexibility"] * 10, 1),
        "Arrival timing": round(components["arrival"] * 10, 1),
    }


def _ai_score_detail_breakdown(offer, offers):
    visible = list(offers or [])

    def price(item):
        return float(item.get("price_total") or 0)

    def duration(item):
        return _duration_minutes(item.get("duration")) or 0

    prices = [price(item) for item in visible if price(item) > 0] or [price(offer) or 1]
    durations = [duration(item) for item in visible if duration(item) > 0] or [duration(offer) or 1]
    min_price, max_price = min(prices), max(prices)
    min_duration, max_duration = min(durations), max(durations)
    components = _score_components(offer, min_price, max_price, min_duration, max_duration)
    offer_price = price(offer)
    offer_duration = duration(offer)
    stops = int(offer.get("stops") or 0)

    price_delta = offer_price - min_price
    if price_delta <= 0:
        price_explanation = "Lowest visible fare in the current results."
    else:
        price_explanation = f"{money_usd(price_delta)} above the lowest visible fare."

    comfort_label, aircraft_name, aircraft_note = _aircraft_comfort_details(offer)
    comfort_scores = {"Excellent": 9.2, "Good": 7.6, "Fair": 5.7, "Basic": 4.2, "Unknown": 3.0}
    comfort_explanation = aircraft_note
    if aircraft_name:
        comfort_explanation = f"{comfort_explanation}"

    arrival_label = _arrival_timing_label(offer)
    arrival_scores = {"Great": 9.0, "Good": 7.6, "Okay": 5.5, "Bad": 3.0}
    arrival_explanations = {
        "Great": "Afternoon arrival is easier for starting the trip.",
        "Good": "Morning arrival gives more usable arrival-day time.",
        "Okay": "Evening arrival leaves less useful time on arrival day.",
        "Bad": "Late-night arrival can make the first day harder.",
    }

    destination = str(offer.get("destination") or "").upper()
    city_access = _city_access_level(destination)
    access_scores = {"Easy": 9.0, "Moderate": 6.6, "Hard": 3.8, "Unknown": 4.5}
    if city_access == "Unknown":
        access_explanation = "City access data is limited for this arrival airport."
    else:
        access_explanation = f"{destination} is rated {city_access.lower()} for typical city access."

    duration_delta = offer_duration - min_duration
    if duration_delta <= 0:
        duration_explanation = "Fastest visible travel time in the current results."
    else:
        hours, minutes = divmod(int(duration_delta), 60)
        delta_label = f"{hours}h {minutes}m" if hours and minutes else f"{hours}h" if hours else f"{minutes}m"
        duration_explanation = f"{delta_label} longer than the fastest visible option."

    connection_score = 10.0 if stops == 0 else max(2.0, 7.0 - stops * 2.0)
    connection_explanation = (
        "Nonstop routing has the lowest connection risk."
        if stops == 0
        else f"{stops} connection{'s' if stops != 1 else ''} add timing and misconnect risk."
    )

    return [
        ("Price Value", round(components["price"] * 10, 1), price_explanation),
        ("Comfort", round(comfort_scores.get(comfort_label, 3.0), 1), comfort_explanation),
        ("Arrival Time", round(arrival_scores.get(arrival_label, 4.5), 1), arrival_explanations.get(arrival_label, "Arrival timing data is limited.")),
        ("Airport Access", round(access_scores.get(city_access, 4.5), 1), access_explanation),
        ("Travel Time", round(components["duration"] * 10, 1), duration_explanation),
        ("Connection Risk", round(connection_score, 1), connection_explanation),
    ]


def _score_not_perfect_reasons(offer, offers):
    visible = list(offers or [])
    reasons = []

    offer_price = float(offer.get("price_total") or 0)
    visible_prices = [float(item.get("price_total") or 0) for item in visible if float(item.get("price_total") or 0) > 0]
    if visible_prices and offer_price > min(visible_prices):
        reasons.append(f"{money_usd(offer_price - min(visible_prices))} above the cheapest visible fare.")

    if int(offer.get("stops") or 0) > 0:
        reasons.append("Connection risk from at least one stop.")

    arrival_label = _arrival_timing_label(offer)
    if arrival_label in ("Okay", "Bad"):
        reasons.append(f"{arrival_label.lower()} arrival at {offer.get('arrive_time') or 'the listed arrival time'}.")

    comfort_label, aircraft_name, _aircraft_note = _aircraft_comfort_details(offer)
    if comfort_label == "Unknown":
        reasons.append("Aircraft type unavailable.")
    elif comfort_label in ("Fair", "Basic"):
        reasons.append(f"Aircraft comfort estimate is {comfort_label.lower()} based on {aircraft_name or 'aircraft type'}.")

    offer_duration = _duration_minutes(offer.get("duration")) or 0
    visible_durations = [_duration_minutes(item.get("duration")) or 0 for item in visible]
    visible_durations = [duration for duration in visible_durations if duration > 0]
    if visible_durations and offer_duration > min(visible_durations):
        duration_delta = offer_duration - min(visible_durations)
        hours, minutes = divmod(int(duration_delta), 60)
        delta_label = f"{hours}h {minutes}m" if hours and minutes else f"{hours}h" if hours else f"{minutes}m"
        reasons.append(f"{delta_label} longer than the fastest visible option.")

    return reasons[:2]


def _safe_score_breakdown_row(row):
    def text_value(value):
        if isinstance(value, dict):
            return " ".join(str(item) for item in value.values() if item is not None)
        if isinstance(value, (list, tuple, set)):
            return " ".join(str(item) for item in value if item is not None)
        return str(value or "")

    if isinstance(row, dict):
        name = text_value(row.get("label") or row.get("name") or row.get("category") or "Score")
        raw_score = row.get("score") if row.get("score") is not None else row.get("value")
        explanation = row.get("explanation") or row.get("note") or row.get("details") or ""
    elif isinstance(row, (list, tuple)):
        parts = list(row)
        name = text_value(parts[0] if len(parts) > 0 else "Score")
        raw_score = parts[1] if len(parts) > 1 else 0
        explanation = parts[2] if len(parts) > 2 else ""
    else:
        name = "Score"
        raw_score = 0
        explanation = row

    try:
        score_value = float(raw_score)
    except (TypeError, ValueError):
        score_value = 0.0

    if isinstance(explanation, (list, tuple, set)):
        explanation_html = "<ul>" + "".join(f"<li>{html.escape(text_value(item))}</li>" for item in explanation if text_value(item)) + "</ul>"
    elif isinstance(explanation, dict):
        explanation_html = html.escape(text_value(explanation))
    else:
        explanation_html = html.escape(text_value(explanation))

    return name or "Score", max(0.0, min(10.0, score_value)), explanation_html


def _safe_html_parts(parts):
    output = []
    for part in parts:
        if part is None:
            continue
        if isinstance(part, (list, tuple, set)):
            output.extend(_safe_html_parts(part))
        elif isinstance(part, dict):
            output.append(" ".join(str(value) for value in part.values() if value is not None))
        else:
            output.append(str(part))
    return output


def _ai_score_map(offers, priorities):
    if not offers:
        return {}

    def price(offer):
        return float(offer.get("price_total") or 0)

    def duration(offer):
        return _duration_minutes(offer.get("duration")) or 0

    prices = [price(offer) for offer in offers if price(offer) > 0] or [1]
    durations = [duration(offer) for offer in offers if duration(offer) > 0] or [1]
    min_price, max_price = min(prices), max(prices)
    min_duration, max_duration = min(durations), max(durations)
    weights = _preference_weights(priorities)
    scores = {}
    for offer in offers:
        components = _score_components(offer, min_price, max_price, min_duration, max_duration)
        weighted = sum(components[key] * weights[key] for key in weights)
        score = round(max(45, min(99, 50 + weighted * 49)))
        scores[_flight_key(offer)] = {
            "score": score,
            "breakdown": _score_breakdown(components),
        }
    return scores


def _recommendation_map(offers, priorities):
    if not offers:
        return {}

    def price(offer):
        return float(offer.get("price_total") or 0)

    def duration(offer):
        return _duration_minutes(offer.get("duration")) or 99999

    def stops(offer):
        return int(offer.get("stops") or 0)

    prices = [price(offer) for offer in offers]
    durations = [duration(offer) for offer in offers]
    median_price = _median(prices)
    median_duration = _median(durations)
    score_data = _ai_score_map(offers, priorities)
    cheapest = min(offers, key=lambda offer: (price(offer), duration(offer), stops(offer)))
    fastest = min(offers, key=lambda offer: (duration(offer), price(offer), stops(offer)))
    earliest_good_arrival = min(offers, key=lambda offer: (abs(_clock_minutes(offer.get("arrive_time")) - 15 * 60), price(offer)))
    flexible = max(offers, key=lambda offer: (_fare_flexibility_score(offer), -price(offer)))
    baggage_options = [offer for offer in offers if _has_baggage(offer)]
    baggage = min(baggage_options, key=lambda offer: (price(offer), duration(offer))) if baggage_options else None
    nonstop_options = [offer for offer in offers if stops(offer) == 0]
    cheapest_nonstop = min(nonstop_options, key=lambda offer: (price(offer), duration(offer))) if nonstop_options else None
    best_overall = max(offers, key=lambda offer: score_data.get(_flight_key(offer), {}).get("score", 0))

    recommendations = {}
    for offer in offers:
        key = _flight_key(offer)
        label = "Best value"
        why = "This balances price, routing, timing, and flexibility better than most options."
        if cheapest_nonstop and key == _flight_key(cheapest_nonstop):
            label = "Cheapest nonstop"
            why = "This keeps the trip nonstop while staying closest to the lowest fare."
        elif key == _flight_key(fastest):
            label = "Fastest arrival"
            why = f"This has the strongest timing profile with a total travel time of {_display_value(offer.get('duration'))}."
        elif key == _flight_key(flexible):
            label = "Most flexible"
            why = "This is the better fit if change or refund flexibility matters."
        elif baggage and key == _flight_key(baggage):
            label = "Best baggage"
            why = "This stands out because baggage information is clearer than many alternatives."
        elif key == _flight_key(best_overall):
            label = "Best overall"
            why = "This is recommended because it best matches your selected priorities."
        elif key == _flight_key(cheapest):
            label = "Best value"
            why = f"This keeps the fare near the lowest live result at {money_usd(price(offer))}."
        elif key == _flight_key(earliest_good_arrival):
            label = "Fastest arrival"
            why = "This has one of the cleaner arrival times for the route."

        if price(offer) <= median_price and duration(offer) <= median_duration:
            why = f"{why} It also stays efficient on both price and travel time."
        recommendations[key] = {
            **score_data.get(key, {"score": 75, "breakdown": {}}),
            "label": label,
            "why": why,
        }
    return recommendations


def _why_over_others(best_offer, offers, recommendations):
    others = [offer for offer in offers if _flight_key(offer) != _flight_key(best_offer)]
    if not others:
        return ["This is the only returned live fare for these search parameters."]

    bullets = []
    best_price = float(best_offer.get("price_total") or 0)
    cheapest = min(offers, key=lambda offer: (float(offer.get("price_total") or 999999), _duration_minutes(offer.get("duration")) or 999999))
    cheapest_price = float(cheapest.get("price_total") or 0)
    if cheapest_price and best_price and _flight_key(cheapest) != _flight_key(best_offer):
        bullets.append(f"{money_usd(best_price - cheapest_price)} more than the cheapest visible fare.")
    elif cheapest_price and best_price:
        bullets.append(f"{money_usd(best_price)} matches the lowest visible fare.")

    fastest = min(offers, key=lambda offer: (_duration_minutes(offer.get("duration")) or 99999, float(offer.get("price_total") or 0)))
    fastest_price = float(fastest.get("price_total") or 0)
    if fastest_price > best_price:
        bullets.append(f"Saves {money_usd(fastest_price - best_price)} compared with the fastest option.")

    best_duration = _duration_minutes(best_offer.get("duration")) or 0
    fastest_duration = _duration_minutes(fastest.get("duration")) or 0
    if fastest_duration and best_duration and _flight_key(fastest) != _flight_key(best_offer):
        duration_delta = best_duration - fastest_duration
        if duration_delta > 0:
            hours, minutes = divmod(int(duration_delta), 60)
            delta_label = f"{hours}h {minutes}m" if hours and minutes else f"{hours}h" if hours else f"{minutes}m"
            bullets.append(f"{delta_label} longer than the fastest visible option.")

    if int(best_offer.get("stops") or 0) == 0:
        connecting_options = [offer for offer in others if int(offer.get("stops") or 0) > 0]
        if connecting_options:
            bullets.append(f"Nonstop while {len(connecting_options)} visible option{'s' if len(connecting_options) != 1 else ''} require a connection.")

    best_arrival = _clock_minutes(best_offer.get("arrive_time"))
    weaker_arrivals = [
        offer for offer in others
        if abs(_clock_minutes(offer.get("arrive_time")) - 15 * 60) > abs(best_arrival - 15 * 60)
    ]
    if weaker_arrivals:
        comparison = weaker_arrivals[0]
        arrival_delta = abs(_clock_minutes(comparison.get("arrive_time")) - best_arrival)
        hours, minutes = divmod(int(arrival_delta), 60)
        delta_label = f"{hours}h {minutes}m" if hours and minutes else f"{hours}h" if hours else f"{minutes}m"
        bullets.append(f"Arrival time is {delta_label} apart from {comparison.get('airline') or 'another option'} at {comparison.get('arrive_time') or 'an alternate time'}.")

    best_baggage = str(best_offer.get("baggage") or "").strip()
    weaker_baggage_options = [offer for offer in others if best_baggage and not str(offer.get("baggage") or "").strip()]
    if weaker_baggage_options:
        bullets.append(f"Baggage is listed as {best_baggage}; {len(weaker_baggage_options)} visible option{'s' if len(weaker_baggage_options) != 1 else ''} do not show baggage details.")

    best_destination = str(best_offer.get("destination") or "").upper()
    best_access = _city_access_level(best_destination)
    if best_access in ("Easy", "Moderate"):
        harder_access_options = [
            offer for offer in others
            if _city_access_level(str(offer.get("destination") or "").upper()) not in (best_access, "Unknown")
        ]
        if harder_access_options:
            bullets.append(f"{best_destination} city access is rated {best_access}; at least one alternative arrives at a harder-access airport.")

    score = recommendations.get(_flight_key(best_offer), {}).get("score")
    if score:
        bullets.append(f"Ranks highest for your selected priorities with an AI Score of {score}.")

    return bullets[:3] or ["Only returned option with enough fare, route, and timing data to compare."]


def _minutes_delta_label(minutes):
    minutes = int(abs(minutes or 0))
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"


def _price_delta_text(selected, recommended):
    selected_price = float(selected.get("price_total") or 0)
    recommended_price = float(recommended.get("price_total") or 0)
    if not selected_price or not recommended_price:
        return ""
    delta = selected_price - recommended_price
    if abs(delta) < 1:
        return "Same listed fare as #1."
    if delta < 0:
        return f"{money_usd(abs(delta))} cheaper than #1."
    return f"{money_usd(delta)} more than #1."


def _duration_delta_text(selected, recommended):
    selected_duration = _duration_minutes(selected.get("duration")) or 0
    recommended_duration = _duration_minutes(recommended.get("duration")) or 0
    if not selected_duration or not recommended_duration:
        return ""
    delta = selected_duration - recommended_duration
    if abs(delta) < 10:
        return "Nearly the same travel time as #1."
    if delta < 0:
        return f"{_minutes_delta_label(delta)} faster than #1."
    return f"{_minutes_delta_label(delta)} longer than #1."


def _arrival_delta_text(selected, recommended):
    selected_arrival = _clock_minutes(selected.get("arrive_time"))
    recommended_arrival = _clock_minutes(recommended.get("arrive_time"))
    delta = selected_arrival - recommended_arrival
    if abs(delta) < 15:
        return "Nearly the same arrival time as #1."
    direction = "later" if delta > 0 else "earlier"
    return f"Arrives {_minutes_delta_label(delta)} {direction} than #1."


def _baggage_comparison_text(selected, recommended):
    selected_baggage = str(selected.get("baggage") or "").strip()
    recommended_baggage = str(recommended.get("baggage") or "").strip()
    if selected_baggage and not recommended_baggage:
        return "Shows baggage details while #1 does not."
    if recommended_baggage and not selected_baggage:
        return "#1 shows baggage details while this fare does not."
    if selected_baggage and recommended_baggage and selected_baggage != recommended_baggage:
        return f"Baggage differs: this shows {selected_baggage}; #1 shows {recommended_baggage}."
    return ""


def _comparison_lists(selected, recommended, offers=None):
    selected_price = float(selected.get("price_total") or 0)
    recommended_price = float(recommended.get("price_total") or 0)
    selected_duration = _duration_minutes(selected.get("duration")) or 0
    recommended_duration = _duration_minutes(recommended.get("duration")) or 0
    selected_stops = int(selected.get("stops") or 0)
    recommended_stops = int(recommended.get("stops") or 0)
    selected_impact = _trip_impact(selected, offers)
    recommended_impact = _trip_impact(recommended, offers)

    advantages = []
    lower_reasons = []
    if selected_price and recommended_price:
        delta = selected_price - recommended_price
        if delta < -1:
            advantages.append(f"{money_usd(abs(delta))} cheaper than #1.")
        elif delta > 1:
            lower_reasons.append(f"{money_usd(delta)} higher fare than the top pick.")
    if selected_duration and recommended_duration:
        duration_delta = selected_duration - recommended_duration
        if duration_delta < -10:
            advantages.append(f"{_minutes_delta_label(duration_delta)} faster than #1.")
        elif duration_delta > 10:
            lower_reasons.append(f"{_minutes_delta_label(duration_delta)} longer travel time than the top pick.")
    if selected_stops < recommended_stops:
        advantages.append(f"{recommended_stops - selected_stops} fewer stop{'s' if recommended_stops - selected_stops != 1 else ''} than #1.")
    elif selected_stops > recommended_stops:
        lower_reasons.append(f"{selected_stops - recommended_stops} more stop{'s' if selected_stops - recommended_stops != 1 else ''} than the top pick.")
    if selected_impact.get("city_access") == "Easy" and recommended_impact.get("city_access") != "Easy":
        advantages.append("Easier city access airport than #1.")
    elif recommended_impact.get("city_access") == "Easy" and selected_impact.get("city_access") != "Easy":
        lower_reasons.append("Weaker city access airport than the top pick.")
    selected_comfort = selected_impact.get("aircraft_comfort")
    recommended_comfort = recommended_impact.get("aircraft_comfort")
    comfort_rank = {"Unknown": 0, "Basic": 1, "Fair": 2, "Good": 3, "Excellent": 4}
    if comfort_rank.get(selected_comfort, 0) > comfort_rank.get(recommended_comfort, 0):
        advantages.append(f"Stronger aircraft comfort estimate: {selected_comfort} vs {recommended_comfort}.")
    elif comfort_rank.get(selected_comfort, 0) < comfort_rank.get(recommended_comfort, 0):
        lower_reasons.append(f"Lower aircraft comfort estimate: {selected_comfort} vs {recommended_comfort}.")
    baggage_text = _baggage_comparison_text(selected, recommended)
    if baggage_text:
        if baggage_text.startswith("#1"):
            lower_reasons.append("Weaker baggage visibility than the top pick.")
        else:
            advantages.append(baggage_text)
    arrival_text = _arrival_delta_text(selected, recommended)
    if selected_impact.get("arrival_timing") in {"Great", "Good"} and recommended_impact.get("arrival_timing") in {"Okay", "Bad"}:
        advantages.append(f"Better arrival timing: {selected_impact['arrival_timing']} vs {recommended_impact['arrival_timing']}.")
    elif selected_impact.get("arrival_timing") in {"Okay", "Bad"} and recommended_impact.get("arrival_timing") in {"Great", "Good"}:
        lower_reasons.append(f"Worse arrival timing: {selected_impact['arrival_timing']} vs {recommended_impact['arrival_timing']}.")
    elif arrival_text and "same" not in arrival_text.lower():
        if "later" in arrival_text.lower():
            lower_reasons.append(arrival_text.replace("#1", "the top pick"))
        else:
            advantages.append(arrival_text)

    selected_fatigue = selected_impact.get("travel_fatigue")
    recommended_fatigue = recommended_impact.get("travel_fatigue")
    fatigue_rank = {"Low": 1, "Moderate": 2, "High": 3, "Very High": 4}
    if fatigue_rank.get(selected_fatigue, 0) > fatigue_rank.get(recommended_fatigue, 0):
        lower_reasons.append(f"Higher trip difficulty: fatigue is {selected_fatigue} vs {recommended_fatigue}.")
    elif fatigue_rank.get(selected_fatigue, 0) < fatigue_rank.get(recommended_fatigue, 0):
        advantages.append(f"Lower travel fatigue: {selected_fatigue} vs {recommended_fatigue}.")

    dedup_advantages = []
    for item in advantages:
        if item and item not in dedup_advantages:
            dedup_advantages.append(item)
    dedup_lower_reasons = []
    for item in lower_reasons:
        if item and item not in dedup_lower_reasons:
            dedup_lower_reasons.append(item)
    if not dedup_lower_reasons:
        fallback_reason = _first_rank_tiebreaker(selected, recommended, offers)
        dedup_lower_reasons.append(
            f"This is also a strong option. Byable ranked the other flight slightly higher because {fallback_reason}."
        )
    return {
        "advantages": dedup_advantages[:2] or ["Comparable on the main visible flight data."],
        "lower_reasons": dedup_lower_reasons[:2],
    }


def _first_rank_tiebreaker(selected, recommended, offers=None):
    recommended_impact = _trip_impact(recommended, offers)
    selected_impact = _trip_impact(selected, offers)
    if int(recommended.get("stops") or 0) < int(selected.get("stops") or 0):
        return "it has fewer stops"
    if (_duration_minutes(recommended.get("duration")) or 0) < (_duration_minutes(selected.get("duration")) or 0):
        return "it has shorter travel time"
    if recommended_impact.get("arrival_timing") in {"Great", "Good"} and selected_impact.get("arrival_timing") in {"Okay", "Bad"}:
        return "it has cleaner arrival timing"
    if recommended_impact.get("city_access") == "Easy" and selected_impact.get("city_access") != "Easy":
        return "it uses an easier city-access airport"
    if recommended_impact.get("travel_fatigue") in {"Low", "Moderate"} and selected_impact.get("travel_fatigue") in {"High", "Very High"}:
        return "it has lower overall travel fatigue"
    return "it has a slightly better overall balance of timing, stops, and trip difficulty"


def _why_number_one_lists(recommended, offers, recommendation_bullets=None):
    positives = []
    for bullet in recommendation_bullets or []:
        text = str(bullet or "").strip()
        if text and text not in positives:
            positives.append(text)
    if int(recommended.get("stops") or 0) == 0:
        positives.append("Nonstop routing avoids connection risk.")
    if _is_lowest_priced(recommended, offers):
        positives.append(f"Lowest listed fare in the visible results at {money_usd(recommended.get('price_total'))}.")
    if _is_among_fastest(recommended, offers):
        positives.append(f"Among the fastest visible options at {_display_value(recommended.get('duration'))}.")
    impact = _trip_impact(recommended, offers)
    if impact.get("city_access") == "Easy":
        positives.append(f"{recommended.get('destination')} has easier city access than many alternative airports.")
    if impact.get("aircraft_comfort") in {"Excellent", "Good"}:
        positives.append(f"{impact.get('aircraft_comfort')} aircraft comfort estimate based on {impact.get('aircraft_type') or 'aircraft type'}.")
    deduped = []
    for item in positives:
        if item and item not in deduped:
            deduped.append(item)
    tradeoffs = _watch_out_copy(recommended, offers)
    meaningful_tradeoff = next(
        (item for item in tradeoffs if "no major downside" not in str(item).lower()),
        "No major downside compared with similar options.",
    )
    return {"reasons": deduped[:3], "tradeoff": meaningful_tradeoff}


def _card_badges(offer, offers, recommendations):
    if not offers:
        return []

    def price(item):
        return float(item.get("price_total") or 0)

    def duration(item):
        return _duration_minutes(item.get("duration")) or 99999

    def stops(item):
        return int(item.get("stops") or 0)

    key = _flight_key(offer)
    badges = []

    best_overall = max(offers, key=lambda item: recommendations.get(_flight_key(item), {}).get("score", 0))
    cheapest = min(offers, key=lambda item: (price(item), duration(item), stops(item)))
    fastest = min(offers, key=lambda item: (duration(item), price(item), stops(item)))
    nonstop_options = [item for item in offers if stops(item) == 0]
    cheapest_nonstop = min(nonstop_options, key=lambda item: (price(item), duration(item))) if nonstop_options else None
    baggage_options = [item for item in offers if _has_baggage(item)]
    best_baggage = min(baggage_options, key=lambda item: (price(item), duration(item))) if baggage_options else None
    most_flexible = max(offers, key=lambda item: (_fare_flexibility_score(item), -price(item)))

    if key == _flight_key(best_overall):
        badges.append("Best overall")
    if cheapest_nonstop and key == _flight_key(cheapest_nonstop):
        badges.append("Cheapest nonstop")
    elif key == _flight_key(cheapest):
        badges.append("Cheapest")
    if key == _flight_key(fastest):
        badges.append("Fastest arrival")
    elif stops(offer) == 0:
        badges.append("Nonstop pick")
    if best_baggage and key == _flight_key(best_baggage):
        badges.append("Best baggage")
    if key == _flight_key(most_flexible):
        badges.append("Most flexible")

    deduped = []
    for badge in badges:
        if badge not in deduped:
            deduped.append(badge)
    return deduped[:2]


def _search_params_key(search_state, return_origin_city):
    return {
        "origin_city": str(search_state.get("origin_city") or ""),
        "destination_city": str(search_state.get("destination_city") or ""),
        "return_mode": str(search_state.get("return_mode") or "Same as destination"),
        "return_origin_city": str(return_origin_city or ""),
        "departure_date": str(search_state.get("departure_date") or ""),
        "return_date": str(search_state.get("return_date") or ""),
        "adults": int(search_state.get("adults") or 1),
        "cabin_class": str(search_state.get("cabin_class") or "economy"),
    }


def _arrival_timing_label(offer):
    arrival = _clock_minutes(offer.get("arrive_time"))
    if 11 * 60 <= arrival < 17 * 60:
        return "Great"
    if 6 * 60 <= arrival < 11 * 60:
        return "Good"
    if 17 * 60 <= arrival < 22 * 60:
        return "Okay"
    return "Bad"


def _time_zone_delta_estimate(offer):
    origin = str(offer.get("origin") or "").upper()
    destination = str(offer.get("destination") or "").upper()
    zone_offsets = {
        "SFO": -8, "OAK": -8, "SJC": -8, "LAX": -8, "BUR": -8, "SNA": -8, "ONT": -8, "LGB": -8,
        "JFK": -5, "LGA": -5, "EWR": -5, "ORD": -6, "MDW": -6, "DCA": -5, "IAD": -5, "BWI": -5,
        "HND": 9, "NRT": 9, "KIX": 9, "ITM": 9, "ICN": 9, "GMP": 9,
        "LHR": 0, "LGW": 0, "LCY": 0, "STN": 0, "LTN": 0, "CDG": 1, "ORY": 1,
        "BKK": 7, "DMK": 7, "SIN": 8, "SYD": 10,
    }
    if origin not in zone_offsets or destination not in zone_offsets:
        return 0
    return abs(zone_offsets[destination] - zone_offsets[origin])


def _timezone_shift_details(offer):
    origin = str(offer.get("origin") or "").upper()
    destination = str(offer.get("destination") or "").upper()
    zone_offsets = {
        "SFO": -8, "OAK": -8, "SJC": -8, "LAX": -8, "BUR": -8, "SNA": -8, "ONT": -8, "LGB": -8,
        "JFK": -5, "LGA": -5, "EWR": -5, "ORD": -6, "MDW": -6, "DCA": -5, "IAD": -5, "BWI": -5,
        "HND": 9, "NRT": 9, "KIX": 9, "ITM": 9, "ICN": 9, "GMP": 9,
        "LHR": 0, "LGW": 0, "LCY": 0, "STN": 0, "LTN": 0, "CDG": 1, "ORY": 1,
        "BKK": 7, "DMK": 7, "SIN": 8, "SYD": 10,
    }
    if origin not in zone_offsets or destination not in zone_offsets:
        return {"shift": 0, "adjusted_shift": 0, "direction": "unknown"}
    raw_delta = zone_offsets[destination] - zone_offsets[origin]
    absolute_delta = abs(raw_delta)
    effective_shift = min(absolute_delta, 24 - absolute_delta)
    if absolute_delta <= 12:
        direction = "eastbound" if raw_delta > 0 else "westbound"
    else:
        direction = "westbound" if raw_delta > 0 else "eastbound"
    adjustment = 0.75 if direction == "eastbound" else -0.5 if direction == "westbound" else 0
    adjusted_shift = max(0, effective_shift + adjustment)
    return {
        "shift": round(effective_shift, 1),
        "adjusted_shift": round(adjusted_shift, 1),
        "direction": direction,
    }


def _jet_lag_impact(offer):
    shift = _timezone_shift_details(offer)["adjusted_shift"]
    if shift >= 9:
        return "Very High"
    if shift >= 6:
        return "High"
    if shift >= 3:
        return "Moderate"
    return "Low"


def _layover_minutes(offer):
    total = 0
    for flight_slice in offer.get("route_details") or []:
        for layover in flight_slice.get("layovers") or []:
            total += _duration_minutes(layover.get("duration")) or 0
    return total


def _travel_fatigue_details(offer):
    duration = _duration_minutes(offer.get("duration")) or 0
    stops = int(offer.get("stops") or 0)
    layover_minutes = _layover_minutes(offer)
    departure = _clock_minutes(offer.get("depart_time"))
    arrival = _clock_minutes(offer.get("arrive_time"))
    arrival_timing = _arrival_timing_label(offer)
    cabin = str(offer.get("cabin") or "").lower()
    aircraft_comfort, _aircraft_name, _aircraft_note = _aircraft_comfort_details(offer)

    fatigue_score = 0.0
    if duration >= 20 * 60:
        fatigue_score += 3.2
    elif duration >= 14 * 60:
        fatigue_score += 2.35
    elif duration >= 9 * 60:
        fatigue_score += 1.35
    elif duration >= 5 * 60:
        fatigue_score += 0.55

    fatigue_score += min(3.0, stops * 1.15)
    if layover_minutes >= 6 * 60:
        fatigue_score += 1.4
    elif layover_minutes >= 3 * 60:
        fatigue_score += 0.75
    elif layover_minutes and layover_minutes < 60:
        fatigue_score += 0.55

    if departure < 6 * 60:
        fatigue_score += 0.8
    elif departure >= 22 * 60:
        fatigue_score += 0.5

    if arrival_timing == "Bad":
        fatigue_score += 1.35
    elif arrival_timing == "Okay":
        fatigue_score += 0.45
    elif arrival < 8 * 60 and duration >= 9 * 60:
        fatigue_score += 0.9

    if cabin in {"business", "first"}:
        fatigue_score -= 0.9
    elif cabin == "premium_economy":
        fatigue_score -= 0.35
    elif cabin == "economy" and duration >= 9 * 60:
        fatigue_score += 0.45

    if aircraft_comfort == "Excellent":
        fatigue_score -= 0.35
    elif aircraft_comfort == "Good":
        fatigue_score -= 0.15
    elif aircraft_comfort in {"Fair", "Basic"} and duration >= 8 * 60:
        fatigue_score += 0.45
    elif aircraft_comfort == "Unknown":
        fatigue_score += 0.2

    if fatigue_score >= 5.6:
        label = "Very High"
    elif fatigue_score >= 3.5:
        label = "High"
    elif fatigue_score >= 1.6:
        label = "Moderate"
    else:
        label = "Low"
    return {
        "label": label,
        "score": round(max(0, fatigue_score), 1),
        "layover_minutes": layover_minutes,
        "duration_minutes": duration,
    }


def _city_access_level(airport_code):
    levels = {
        "HND": "Easy", "NRT": "Moderate", "LGA": "Easy", "EWR": "Moderate", "JFK": "Moderate",
        "SFO": "Easy", "OAK": "Moderate", "SJC": "Moderate", "KIX": "Moderate", "ITM": "Easy",
        "LHR": "Easy", "LGW": "Moderate", "LCY": "Easy", "CDG": "Moderate", "ORY": "Moderate",
    }
    return levels.get(str(airport_code or "").upper(), "Unknown")


def _aircraft_values(offer):
    values = []
    for flight_slice in offer.get("route_details") or []:
        for segment in flight_slice.get("segments") or []:
            aircraft = _display_value(segment.get("aircraft"))
            if aircraft != "Not available":
                values.append(aircraft)
    return list(dict.fromkeys(values))


def _aircraft_comfort_details(offer):
    aircraft_values = _aircraft_values(offer)
    if not aircraft_values:
        return "Unknown", "", "Aircraft type is unavailable, so comfort is harder to estimate."
    aircraft_text = " ".join(aircraft_values).upper()
    if any(code in aircraft_text for code in ("A350", "B787", "787", "A380")):
        matched = next((value for value in aircraft_values if any(code in value.upper() for code in ("A350", "B787", "787", "A380"))), aircraft_values[0])
        return "Excellent", matched, f"{matched} is a modern widebody aircraft; comfort is estimated from aircraft type only."
    if any(code in aircraft_text for code in ("A330", "B777", "777", "B767", "767")):
        matched = next((value for value in aircraft_values if any(code in value.upper() for code in ("A330", "B777", "777", "B767", "767"))), aircraft_values[0])
        return "Good", matched, f"{matched} is a widebody aircraft generally considered comfortable for long-haul routes; comfort is estimated from aircraft type only."
    if any(code in aircraft_text for code in ("A321", "A320", "B737", "737")):
        matched = next((value for value in aircraft_values if any(code in value.upper() for code in ("A321", "A320", "B737", "737"))), aircraft_values[0])
        return "Fair", matched, f"{matched} is a narrowbody aircraft, which can feel more cramped on longer flights; comfort is estimated from aircraft type only."
    if any(code in aircraft_text for code in ("E17", "E19", "CRJ", "ERJ", "RJ")):
        matched = next((value for value in aircraft_values if any(code in value.upper() for code in ("E17", "E19", "CRJ", "ERJ", "RJ"))), aircraft_values[0])
        return "Basic", matched, f"{matched} is a regional aircraft; comfort is estimated from aircraft type only."
    return "Basic", aircraft_values[0], f"Aircraft comfort is estimated from aircraft type only: {aircraft_values[0]}."


def _is_lowest_priced(offer, offers):
    prices = [float(item.get("price_total") or 0) for item in (offers or []) if float(item.get("price_total") or 0) > 0]
    offer_price = float(offer.get("price_total") or 0)
    return bool(prices and offer_price > 0 and offer_price == min(prices))


def _is_among_fastest(offer, offers):
    durations = [_duration_minutes(item.get("duration")) for item in (offers or [])]
    durations = [duration for duration in durations if duration and duration > 0]
    offer_duration = _duration_minutes(offer.get("duration")) or 0
    return bool(durations and offer_duration > 0 and offer_duration <= min(durations) + 30)


def _trip_impact(offer, offers=None):
    arrival_timing = _arrival_timing_label(offer)
    jet_lag = _jet_lag_impact(offer)
    timezone_details = _timezone_shift_details(offer)
    travel_fatigue = _travel_fatigue_details(offer)
    destination = str(offer.get("destination") or "").upper()
    city_access = _city_access_level(destination)
    aircraft_comfort, aircraft_name, aircraft_note = _aircraft_comfort_details(offer)
    reasons = []
    arrival = _clock_minutes(offer.get("arrive_time"))
    if 11 * 60 <= arrival < 17 * 60:
        reasons.append("Arrives in the afternoon, which is easier for starting the trip")
    elif 6 * 60 <= arrival < 11 * 60:
        reasons.append("Arrives in the morning, giving you more usable time on arrival day")
    elif 17 * 60 <= arrival < 22 * 60:
        reasons.append("Arrives in the evening, so arrival day is mostly travel")
    else:
        reasons.append("Arrives late at night, which can make the first day harder")
    stops = int(offer.get("stops") or 0)
    if stops == 0:
        reasons.append("Nonstop route")
    else:
        reasons.append(f"{stops} stop route")
    if _is_among_fastest(offer, offers):
        reasons.append(f"Among the fastest visible options at {_display_value(offer.get('duration'))}")
    elif offers:
        reasons.append(f"Longer travel time than the fastest visible option")
    if _is_lowest_priced(offer, offers):
        reasons.append(f"Lowest fare in the current results at {money_usd(offer.get('price_total'))}")
    elif stops == 0:
        nonstop_offers = [item for item in (offers or []) if int(item.get("stops") or 0) == 0]
        if nonstop_offers:
            nonstop_prices = [float(item.get("price_total") or 0) for item in nonstop_offers if float(item.get("price_total") or 0) > 0]
            offer_price = float(offer.get("price_total") or 0)
            if nonstop_prices and offer_price > 0 and offer_price <= min(nonstop_prices) * 1.05:
                reasons.append("Best value among nonstop options")
    if _has_baggage(offer):
        reasons.append("Baggage details are available for this fare")
    if aircraft_comfort in {"Excellent", "Good", "Fair"}:
        reasons.append(aircraft_note)
    elif aircraft_comfort == "Unknown":
        reasons.append("Aircraft type is unknown, so comfort is harder to judge")
    shift = timezone_details.get("shift", 0)
    direction = timezone_details.get("direction", "unknown")
    if jet_lag in {"Moderate", "High", "Very High"} and shift:
        direction_note = f" {direction}" if direction in {"eastbound", "westbound"} else ""
        reasons.append(f"{jet_lag} jet lag from roughly a {shift:g}-hour{direction_note} body-clock shift")
    elif shift:
        reasons.append(f"Low jet lag because the effective timezone shift is about {shift:g} hours")

    fatigue_parts = []
    duration_label = _display_value(offer.get("duration"))
    if travel_fatigue["duration_minutes"] >= 9 * 60:
        fatigue_parts.append(f"{duration_label} travel time")
    stops = int(offer.get("stops") or 0)
    if stops:
        fatigue_parts.append(f"{stops} stop{'s' if stops != 1 else ''}")
    if travel_fatigue["layover_minutes"]:
        hours, minutes = divmod(int(travel_fatigue["layover_minutes"]), 60)
        layover_label = f"{hours}h {minutes}m" if hours and minutes else f"{hours}h" if hours else f"{minutes}m"
        fatigue_parts.append(f"{layover_label} layover time")
    if arrival_timing in {"Okay", "Bad"}:
        fatigue_parts.append(f"{arrival_timing.lower()} arrival timing")
    if str(offer.get("cabin") or "").lower() == "economy" and travel_fatigue["duration_minutes"] >= 9 * 60:
        fatigue_parts.append("economy cabin on a long-haul route")
    if fatigue_parts:
        reasons.append(f"{travel_fatigue['label']} travel fatigue from " + ", ".join(fatigue_parts[:3]))
    airport_notes = {
        "HND": "Haneda is close to central Tokyo",
        "NRT": "Narita often needs a longer transfer into Tokyo",
        "LGA": "LaGuardia is convenient for many New York trips",
        "EWR": "Newark can work well depending on where you stay",
        "SFO": "SFO is strong for Bay Area international routes",
        "KIX": "Kansai is the main international gateway for Osaka and Kyoto",
        "ITM": "Itami is convenient for Osaka and Kyoto domestic connections",
    }
    if destination in airport_notes:
        reasons.append(airport_notes[destination])
    deduped = []
    for reason in reasons:
        if reason and reason not in deduped:
            deduped.append(reason)
    return {
        "arrival_timing": arrival_timing,
        "jet_lag": jet_lag,
        "timezone_shift": timezone_details.get("shift", 0),
        "timezone_direction": timezone_details.get("direction", "unknown"),
        "travel_fatigue": travel_fatigue["label"],
        "travel_fatigue_score": travel_fatigue["score"],
        "city_access": city_access,
        "aircraft_comfort": aircraft_comfort,
        "aircraft_type": aircraft_name,
        "reasons": deduped,
    }


def _watch_out_copy(offer, offers=None):
    stops = int(offer.get("stops") or 0)
    duration = _duration_minutes(offer.get("duration")) or 0
    durations = [_duration_minutes(item.get("duration")) for item in (offers or [])]
    durations = [item for item in durations if item and item > 0]
    price = float(offer.get("price_total") or 0)
    prices = [float(item.get("price_total") or 0) for item in (offers or []) if float(item.get("price_total") or 0) > 0]
    arrival_timing = _arrival_timing_label(offer)
    concerns = []

    if durations and duration and duration > min(durations) + 180:
        concerns.append(f"Long {_display_value(offer.get('duration'))} travel time makes this harder than faster options.")
    if stops > 0:
        concerns.append("A connection adds more timing risk and travel fatigue.")
    if arrival_timing == "Bad":
        concerns.append("Arrives late at night, which could make the first day harder.")
    elif arrival_timing == "Okay":
        concerns.append("Evening arrival leaves less useful time on arrival day.")
    if prices and price and price > min(prices) * 1.25:
        concerns.append("Higher price with limited benefit over cheaper visible options.")
    if not _has_baggage(offer):
        concerns.append("Baggage details are not clear in this test fare.")
    aircraft_comfort, _aircraft_name, _aircraft_note = _aircraft_comfort_details(offer)
    if aircraft_comfort == "Unknown":
        concerns.append("Aircraft type is unavailable, so comfort is harder to judge.")
    elif aircraft_comfort in {"Basic", "Fair"} and duration >= 8 * 60:
        concerns.append("Narrowbody or basic aircraft may feel less comfortable on a long flight.")

    return concerns[:2] or ["No major downside compared with similar options."]


def _clean_watch_out_items(items, offer, offers=None):
    cleaned = []
    generic_terms = ("jet lag", "time zone", "time zones", "crosses many")
    for item in items or []:
        text = str(item or "").strip()
        if not text:
            continue
        lower = text.lower()
        if any(term in lower for term in generic_terms):
            continue
        cleaned.append(text)
    return cleaned[:2] or _watch_out_copy(offer, offers)


def _watch_out_chip_text(offer, offers=None):
    stops = int(offer.get("stops") or 0)
    if stops > 0:
        return f"{stops} stop{'s' if stops != 1 else ''}"

    duration = _duration_minutes(offer.get("duration")) or 0
    durations = [_duration_minutes(item.get("duration")) for item in (offers or [])]
    durations = [item for item in durations if item and item > 0]
    if durations and duration and duration > min(durations) + 180:
        return f"{_duration_label(offer.get('duration'))} travel time"

    aircraft_comfort, _aircraft_name, _aircraft_note = _aircraft_comfort_details(offer)
    if aircraft_comfort == "Unknown":
        return "aircraft unknown"

    arrival_timing = _arrival_timing_label(offer)
    if arrival_timing == "Bad":
        return "late-night arrival"

    price = float(offer.get("price_total") or 0)
    prices = [float(item.get("price_total") or 0) for item in (offers or []) if float(item.get("price_total") or 0) > 0]
    if prices and price and price > min(prices) * 1.25:
        return "higher price"

    if not _has_baggage(offer):
        return "baggage unclear"

    return ""


def _ai_advisor_cache_key(flight, selected_priorities, comparison_context):
    payload = {
        "flight_id": _flight_key(flight),
        "priorities": list(selected_priorities or []),
        "search_params": (comparison_context or {}).get("search_params") or {},
    }
    return json.dumps(payload, sort_keys=True, default=str)


def _ai_flight_summary(offer, recommendations=None):
    recommendation = (recommendations or {}).get(_flight_key(offer), {})
    impact = _trip_impact(offer)
    return {
        "flight_id": _flight_key(offer),
        "airline": offer.get("airline"),
        "flight_number": _display_flight_number(offer),
        "price": offer.get("price_total"),
        "currency": offer.get("currency"),
        "duration": offer.get("duration"),
        "stops": offer.get("stops"),
        "origin_airport": offer.get("origin"),
        "destination_airport": offer.get("destination"),
        "departure_time": offer.get("depart_time"),
        "arrival_time": offer.get("arrive_time"),
        "baggage": offer.get("baggage"),
        "ai_score": recommendation.get("score"),
        "recommendation_label": recommendation.get("label"),
        "arrival_timing_label": impact.get("arrival_timing"),
        "jet_lag_label": impact.get("jet_lag"),
        "timezone_shift_hours": impact.get("timezone_shift"),
        "timezone_direction": impact.get("timezone_direction"),
        "travel_fatigue_label": impact.get("travel_fatigue"),
        "city_access_label": impact.get("city_access"),
        "aircraft_comfort_label": impact.get("aircraft_comfort"),
        "aircraft_type": impact.get("aircraft_type"),
    }


def _ai_comparison_deltas(recommended, alternatives):
    rows = []
    rec_price = float((recommended or {}).get("price") or 0)
    rec_duration = _duration_minutes((recommended or {}).get("duration")) or 0
    rec_stops = int((recommended or {}).get("stops") or 0)
    rec_arrival = _clock_minutes((recommended or {}).get("arrival_time"))
    rec_baggage = str((recommended or {}).get("baggage") or "").strip() or "Not available"

    for alternative in alternatives or []:
        alt_price = float((alternative or {}).get("price") or 0)
        alt_duration = _duration_minutes((alternative or {}).get("duration")) or 0
        alt_stops = int((alternative or {}).get("stops") or 0)
        alt_arrival = _clock_minutes((alternative or {}).get("arrival_time"))
        alt_baggage = str((alternative or {}).get("baggage") or "").strip() or "Not available"
        rows.append(
            {
                "alternative": {
                    "airline": alternative.get("airline"),
                    "flight_number": alternative.get("flight_number"),
                    "price": alternative.get("price"),
                    "duration": alternative.get("duration"),
                    "stops": alternative.get("stops"),
                    "arrival_time": alternative.get("arrival_time"),
                    "baggage": alternative.get("baggage"),
                    "destination_airport": alternative.get("destination_airport"),
                    "ai_score": alternative.get("ai_score"),
                },
                "price_difference_vs_recommended": (
                    f"recommended is ${abs(rec_price - alt_price):.0f} {'cheaper' if rec_price < alt_price else 'more expensive'}"
                    if rec_price and alt_price and rec_price != alt_price
                    else "same or unavailable"
                ),
                "duration_difference_vs_recommended": (
                    f"recommended is {abs(rec_duration - alt_duration)} minutes {'shorter' if rec_duration < alt_duration else 'longer'}"
                    if rec_duration and alt_duration and rec_duration != alt_duration
                    else "same or unavailable"
                ),
                "stop_difference_vs_recommended": (
                    f"recommended has {abs(rec_stops - alt_stops)} fewer stop(s)"
                    if rec_stops < alt_stops
                    else f"recommended has {abs(rec_stops - alt_stops)} more stop(s)"
                    if rec_stops > alt_stops
                    else "same stops"
                ),
                "arrival_difference_vs_recommended": (
                    f"recommended arrives {abs(rec_arrival - alt_arrival)} minutes {'earlier' if rec_arrival < alt_arrival else 'later'}"
                    if rec_arrival and alt_arrival and rec_arrival != alt_arrival
                    else "same or unavailable"
                ),
                "baggage_difference_vs_recommended": (
                    "same or unavailable" if rec_baggage == alt_baggage else f"recommended baggage: {rec_baggage}; alternative baggage: {alt_baggage}"
                ),
            }
        )
    return rows


def generate_ai_advisor_copy(flight, trip_impact, selected_priorities, comparison_context):
    status = _ai_status()
    if not status["advisor_copy_enabled"]:
        _log_ai_failed(status["reason"])
        return None

    cache = st.session_state.setdefault("flight_ai_advisor_copy_cache", {})
    cache_key = _ai_advisor_cache_key(flight, selected_priorities, comparison_context)
    flight_id = _flight_key(flight)
    if cache_key in cache:
        print(f"[Byable Flights] AI advisor copy cache hit for {flight_id}")
        return cache[cache_key]

    # Security/cost guard: rate-limit uncached AI advisor requests per session.
    ai_allowed, ai_wait = _rate_limit_action("flight_ai_advisor_rate_limit", AI_ADVISOR_RATE_LIMIT_SECONDS)
    if not ai_allowed:
        _log_ai_failed(f"AI advisor rate limited; retry in {ai_wait:.1f}s")
        return None

    model = "gpt-4o-mini"
    top_ranked_flights = list((comparison_context or {}).get("top_ranked_flights") or [])
    recommended_summary_payload = (comparison_context or {}).get("recommended_flight")
    comparison_deltas = _ai_comparison_deltas(recommended_summary_payload, top_ranked_flights[1:4])
    prompt_payload = {
        "airline": flight.get("airline"),
        "price": flight.get("price_total"),
        "currency": flight.get("currency"),
        "duration": flight.get("duration"),
        "stops": flight.get("stops"),
        "origin_airport": flight.get("origin"),
        "destination_airport": flight.get("destination"),
        "arrival_time": flight.get("arrive_time"),
        "return_route": (comparison_context or {}).get("return_route"),
        "baggage": flight.get("baggage"),
        "arrival_timing_label": (trip_impact or {}).get("arrival_timing"),
        "jet_lag_label": (trip_impact or {}).get("jet_lag"),
        "timezone_shift_hours": (trip_impact or {}).get("timezone_shift"),
        "timezone_direction": (trip_impact or {}).get("timezone_direction"),
        "travel_fatigue_label": (trip_impact or {}).get("travel_fatigue"),
        "city_access_label": (trip_impact or {}).get("city_access"),
        "aircraft_comfort_label": (trip_impact or {}).get("aircraft_comfort"),
        "aircraft_type": (trip_impact or {}).get("aircraft_type"),
        "selected_priorities": list(selected_priorities or []),
        "is_cheapest": bool((comparison_context or {}).get("is_cheapest")),
        "is_fastest": bool((comparison_context or {}).get("is_fastest")),
        "is_nonstop": int(flight.get("stops") or 0) == 0,
        "is_recommended": True,
        "deterministic_why": list((trip_impact or {}).get("reasons") or []),
        "advisor_comparison_bullets": list((comparison_context or {}).get("why_over_options") or [])[:3],
        "recommended_flight": (comparison_context or {}).get("recommended_flight"),
        "next_best_alternative": (comparison_context or {}).get("next_best_alternative"),
        "third_best_alternative": (comparison_context or {}).get("third_best_alternative"),
        "fourth_best_alternative": (comparison_context or {}).get("fourth_best_alternative"),
        "cheapest_flight": (comparison_context or {}).get("cheapest_flight"),
        "fastest_flight": (comparison_context or {}).get("fastest_flight"),
        "top_ranked_flights": top_ranked_flights,
        "comparison_deltas_vs_top_alternatives": comparison_deltas,
    }
    _log_ai_attempt(flight_id, model, prompt_payload.keys())
    print(
        "BYABLE AI ALTERNATIVE FLIGHT DATA:\n"
        f"{json.dumps({'recommended_flight': prompt_payload.get('recommended_flight'), 'alternatives': prompt_payload.get('top_ranked_flights', [])[1:4]}, indent=2, default=str)}"
    )
    started = time.perf_counter()
    try:
        from openai import OpenAI

        system = (
            "You are a travel advisor. Return valid JSON only. "
            "Use only the provided facts. Do not invent amenities, policies, airport transfer times, "
            "seat quality, delay data, prices, flight times, baggage, or airport facts. "
            "Be concise and practical. Do not use percentages. Do not say 'as an AI'. "
            "Avoid generic travel language. Never call a flight the cheapest option unless is_cheapest is true. "
            "Use 'cheapest nonstop' or 'best value among nonstop options' when that is more accurate."
        )
        user = (
            "Do NOT describe the selected flight in isolation. Compare the recommended flight against the top "
            "alternative flights and explain why it was selected. You must explicitly reference concrete "
            "differences when they exist: price differences, duration differences, stop differences, baggage "
            "differences, and arrival timing differences. Use exact dollar differences and duration differences "
            "from comparison_deltas_vs_top_alternatives when available. If an alternative is cheaper, faster, "
            "has fewer stops, has better baggage, or has better arrival timing, say that plainly and explain why "
            "the recommended flight still wins or whether the tradeoff is small. If two flights are nearly "
            "identical, explicitly say so and explain the specific tiebreaker. Avoid restating facts already "
            "visible on the card unless you are comparing them to another flight. Avoid generic phrases like "
            "'convenient' or 'good value' unless the same sentence includes a concrete price, duration, stop, "
            "baggage, airport, or arrival-time comparison. Use the user's selected priorities to explain the "
            "decision. Also provide a short watch_out downside for the recommended flight. Watch_out must be a "
            "specific tradeoff compared with visible alternatives, such as a connection, longer duration, weaker "
            "baggage, unavailable aircraft type, late-night arrival, or higher price than similar options. Do not "
            "include generic long-haul warnings about time zones or jet lag. If there is no major downside, say: "
            "No major downside compared with similar options. "
            "Return exactly this JSON shape: "
            '{"recommended_summary":"...","why_this":["...","...","..."],'
            '"trip_impact_why":["...","..."],"watch_out":["..."],"modal_summary":"..."}\n\n'
            f"Facts:\n{json.dumps(prompt_payload, ensure_ascii=True, default=str)}"
        )
        print(f"BYABLE AI FULL PROMPT:\nSYSTEM:\n{system}\nUSER:\n{user}")
        client = OpenAI(api_key=_openai_api_key())
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.25,
            timeout=6,
        )
        raw_text = ""
        if getattr(response, "choices", None):
            raw_text = str(getattr(response.choices[0].message, "content", "") or "").strip()
        if not raw_text:
            _log_ai_failed("OpenAI returned empty content")
            cache[cache_key] = None
            return None
        print(f"BYABLE AI RAW RESPONSE:\n{raw_text}")
        parsed = json.loads(raw_text)
        ai_copy = {
            "recommended_summary": str(parsed.get("recommended_summary") or "").strip(),
            "why_this": [str(item).strip() for item in (parsed.get("why_this") or []) if str(item).strip()][:3],
            "trip_impact_why": [str(item).strip() for item in (parsed.get("trip_impact_why") or []) if str(item).strip()][:2],
            "watch_out": [str(item).strip() for item in (parsed.get("watch_out") or []) if str(item).strip()][:2],
            "modal_summary": str(parsed.get("modal_summary") or "").strip(),
        }
        if not ai_copy["recommended_summary"] or not ai_copy["modal_summary"]:
            _log_ai_failed("OpenAI returned incomplete JSON")
            cache[cache_key] = None
            return None
        cache[cache_key] = ai_copy
        _log_ai_success(flight_id, time.perf_counter() - started)
        return ai_copy
    except TimeoutError:
        print("BYABLE AI TIMEOUT - using fallback")
        cache[cache_key] = None
        return None
    except Exception as exc:
        if "timeout" in str(exc).lower() or "timed out" in str(exc).lower():
            print("BYABLE AI TIMEOUT - using fallback")
            cache[cache_key] = None
            return None
        _log_ai_failed(str(exc))
        cache[cache_key] = None
        return None


def _recommendation_summary(best_offer, recommendation, priorities):
    if not best_offer:
        return ""
    airline = str(best_offer.get("airline") or "This flight")
    selected = [str(priority).lower() for priority in (priorities or DEFAULT_PRIORITIES)[:3]]
    priority_text = ", ".join(selected) if selected else "your selected priorities"
    score = (recommendation or {}).get("score", "N/A")
    label = str((recommendation or {}).get("label") or "Best value")
    stop_context = "nonstop routing" if int(best_offer.get("stops") or 0) == 0 else "a manageable routing"
    return (
        f"{airline} is the {label.lower()} because it best matches your priorities: "
        f"{priority_text}. It combines {stop_context}, timing, and fare quality with an AI Score of {score}."
    )


def _rank_flight_results(offers, priorities):
    filtered_offers = list(offers or [])
    start = time.perf_counter()
    recommendations = _recommendation_map(filtered_offers, priorities)
    ranked = sorted(
        filtered_offers,
        key=lambda offer: recommendations.get(_flight_key(offer), {}).get("score", 0),
        reverse=True,
    )
    best_offer = ranked[0] if ranked else None
    why_over_options = _why_over_others(best_offer, ranked[:5], recommendations) if best_offer else []
    best_recommendation = recommendations.get(_flight_key(best_offer), {}) if best_offer else {}
    ranking_time = time.perf_counter() - start
    print(f"[Byable Flights] ranking_time={ranking_time:.3f}s offers={len(filtered_offers)}")
    return {
        "ranked_flights": ranked,
        "recommendations": recommendations,
        "recommended_flight_id": _flight_key(best_offer) if best_offer else "",
        "recommendation_summary": _recommendation_summary(best_offer, best_recommendation, priorities),
        "why_over_options": why_over_options,
        "selected_priorities": list(priorities or DEFAULT_PRIORITIES),
        "timing": {"rank": ranking_time},
    }


def _trip_impact_summary(offer, recommendation):
    label = str((recommendation or {}).get("label") or "Best value")
    price = float(offer.get("price_total") or 0)
    stops = int(offer.get("stops") or 0)
    parts = []
    if stops == 0:
        parts.append("nonstop travel")
    if label in {"Fastest arrival", "Best overall"}:
        parts.append(f"{offer.get('arrive_time') or 'the listed'} arrival")
    if label in {"Most flexible", "Best overall"}:
        parts.append("listed fare-rule data")
    if label == "Best baggage":
        parts.append(str(offer.get("baggage") or "listed baggage details"))
    strength = " and ".join(parts[:2]) if parts else f"{money_usd(price)} fare and {_display_value(offer.get('duration'))} travel time"
    downside = "The main tradeoff is comparing this fare against the cheapest returned option."
    if label in {"Cheapest", "Cheapest nonstop", "Best value"}:
        downside = "The main tradeoff is checking whether the timing works for your trip rhythm."
    if price <= 0:
        downside = "The main tradeoff is limited fare detail from this test result."
    return f"This is a strong option if you care about {strength}. {downside}"


def _city_access_note(offer):
    destination = str(offer.get("destination") or "").upper()
    origin = str(offer.get("origin") or "").upper()
    airport_notes = {
        "HND": "Arrives at Haneda, which is usually more convenient for central Tokyo than Narita.",
        "NRT": "Arrives at Narita, which can be better for some fares but usually means a longer transfer into central Tokyo.",
        "LHR": "Heathrow has strong international connections and broad transit options into London.",
        "LGW": "Gatwick can offer good value, though the transfer into central London may take longer.",
        "LCY": "London City is convenient for central London but usually has fewer long-haul options.",
        "JFK": "JFK has broad international coverage and multiple transit options into New York.",
        "LGA": "LaGuardia is convenient for many New York trips but is more domestic-focused.",
        "EWR": "Newark can be convenient for Manhattan and New Jersey depending on where you are staying.",
        "SFO": "SFO is the Bay Area's strongest international airport for long-haul routes.",
        "OAK": "Oakland can be convenient for East Bay travelers, though long-haul options are more limited.",
        "SJC": "San Jose can reduce airport stress for South Bay travelers when flights are available.",
        "KIX": "Kansai International is the main international airport for Osaka and Kyoto-area trips.",
        "ITM": "Itami is convenient for domestic Japan connections near Osaka and Kyoto.",
        "CDG": "Charles de Gaulle has the broadest international coverage for Paris.",
        "ORY": "Orly can be convenient for some Paris trips, especially intra-Europe routes.",
    }
    return airport_notes.get(destination) or airport_notes.get(origin) or "City access data is limited for this route."


def _return_route_text(offer, return_mode, origin_label, destination_label, return_origin_label):
    if return_mode == "Different city":
        return f"Return route: {return_origin_label} → {origin_label}"
    return f"Return route: {destination_label} → {origin_label}"


def _tradeoff_bullets(offer, recommendation):
    label = str((recommendation or {}).get("label") or "Best value")
    stops = int(offer.get("stops") or 0)
    bullets = []
    if stops == 0:
        bullets.append("Does well: keeps the trip simple with nonstop routing.")
    elif stops == 1:
        bullets.append("Does well: keeps the route manageable with one connection.")
    else:
        bullets.append("Does well: offers another live fare option for this route.")

    if label in {"Cheapest", "Cheapest nonstop", "Best value"}:
        bullets.append("You give up: timing or flexibility may be less polished than higher-scoring options.")
    elif label == "Fastest arrival":
        bullets.append("You give up: the fastest timing may cost more than slower alternatives.")
    elif label == "Most flexible":
        bullets.append("You give up: flexibility can come with a higher fare.")
    else:
        bullets.append("You give up: it may not win every single category, even if it balances them well.")

    if stops == 0:
        bullets.append("Best for: travelers who want the simplest route and less airport stress.")
    else:
        bullets.append("Best for: travelers who can tolerate a connection to keep more options open.")
    return bullets


def _flight_key(offer):
    return "|".join(
        [
            str(offer.get("airline") or ""),
            str(offer.get("flight_number") or ""),
            str(offer.get("origin") or ""),
            str(offer.get("destination") or ""),
            str(offer.get("depart_time") or offer.get("departure_time") or ""),
            str(offer.get("arrive_time") or offer.get("arrival_time") or ""),
            str(offer.get("price_total") or offer.get("price") or ""),
            str(offer.get("airport_pair") or ""),
            str(offer.get("return_airport_pair") or ""),
        ]
    )


def _display_flight_number(offer):
    raw_number = str(offer.get("flight_number") or "").strip().upper()
    airline_code = str(offer.get("airline_code") or "").strip().upper()
    if not raw_number:
        return airline_code or "Flight"
    if any(char.isalpha() for char in raw_number):
        return " ".join(raw_number.split())
    return f"{airline_code} {raw_number}".strip()


def _offer_ai_score(offer):
    """Read the latest deterministic AI score for an offer from ranking cache."""
    flight_id = _flight_key(offer)
    ranking_output = (st.session_state.get("flight_ranking_cache") or {}).get("ranking_output") or {}
    recommendations = ranking_output.get("recommendations") or {}
    score = (recommendations.get(flight_id) or {}).get("score")
    if score is not None:
        return score
    return offer.get("ai_score")


def _set_selected_flight(flight_id, offer, adults, index):
    st.session_state["selected_flight_id"] = flight_id
    st.session_state["selected_flight"] = {**offer, "adults": adults}
    st.session_state["selected_flight_index"] = index
    track_event(
        "flight_selected",
        {
            "flight_id": flight_id,
            "airline": offer.get("airline"),
            "flight_number": offer.get("flight_number"),
            "ai_score": _offer_ai_score(offer),
            "price": offer.get("price_total"),
            "currency": offer.get("currency"),
            "duration": offer.get("duration"),
            "stops": offer.get("stops"),
            "provider": offer.get("provider") or offer.get("source"),
        },
    )


def _render_byable_feedback_form(offer, recommendation, origin_city, destination_city, priorities, has_flight_results):
    """Collect optional page-level feedback without affecting search, AI, or ranking."""
    flight_id = _flight_key(offer or {}) or "no_flight"
    thanks_key = "byable_feedback_thanks"
    st.markdown("##### Help improve Byable")
    st.caption("What felt confusing, missing, or untrustworthy?")
    with st.form("byable_feedback_form", clear_on_submit=True):
        usefulness_rating = st.selectbox(
            "How useful is Byable so far?",
            ["Not useful yet", "Somewhat useful", "Very useful"],
            index=1,
            key="byable_feedback_usefulness_rating",
        )
        feedback_text = st.text_area(
            "Feedback",
            placeholder="Tell us what felt confusing, missing, or untrustworthy…",
            max_chars=1200,
            key="byable_feedback_text",
        )
        submitted = st.form_submit_button("Send feedback")
    if submitted:
        event_name = "byable_feedback_submitted"
        print("BYABLE FEEDBACK SUBMIT CLICKED", flush=True)
        sent = track_event(
            event_name,
            {
                "usefulness_rating": usefulness_rating,
                "feedback_text": str(feedback_text or "").strip(),
                "current_page": str(st.session_state.get("page") or "flights"),
                "origin_city": origin_city,
                "destination_city": destination_city,
                "selected_priorities": list(priorities or []),
                "has_flight_results": bool(has_flight_results),
                "recommended_airline": (offer or {}).get("airline"),
                "recommended_price": (offer or {}).get("price_total"),
                "recommended_ai_score": (recommendation or {}).get("score"),
                "recommended_duration": (offer or {}).get("duration"),
                "recommended_stops": (offer or {}).get("stops"),
                "flight_id": flight_id,
            },
        )
        print("BYABLE FEEDBACK SUBMITTED", flush=True)
        if sent:
            print(f"POSTHOG EVENT SENT: {event_name}", flush=True)
        else:
            print(f"POSTHOG EVENT FAILED: {event_name}", flush=True)
        st.session_state[thanks_key] = True
    if st.session_state.get(thanks_key):
        st.success("Thanks — this helps us improve Byable.")


def _duffel_api_key():
    try:
        secret_key = st.secrets.get("DUFFEL_API_KEY", "")
    except Exception:
        secret_key = ""
    return str(secret_key or os.getenv("DUFFEL_API_KEY", "")).strip()


def _segment_summary(segment):
    origin = segment.get("origin") or {}
    destination = segment.get("destination") or {}
    marketing_carrier = segment.get("marketing_carrier") or {}
    operating_carrier = segment.get("operating_carrier") or {}
    return {
        "origin": origin.get("iata_code") or origin.get("id"),
        "destination": destination.get("iata_code") or destination.get("id"),
        "departure_at": segment.get("departing_at"),
        "arrival_at": segment.get("arriving_at"),
        "marketing_carrier": marketing_carrier.get("name") or marketing_carrier.get("iata_code"),
        "operating_carrier": operating_carrier.get("name") or operating_carrier.get("iata_code"),
        "flight_number": segment.get("marketing_carrier_flight_number"),
        "duration": segment.get("duration"),
    }


def _airport_label(airport):
    if not isinstance(airport, dict):
        return "Not available"
    code = airport.get("iata_code") or airport.get("id")
    name = airport.get("name")
    city = airport.get("city_name")
    label = code or name or city
    if label and name and name != label:
        return f"{label} · {name}"
    return label or "Not available"


def _terminal_label(segment, side):
    airport = segment.get(side) or {}
    direct_keys = [f"{side}_terminal", f"{side}_gate"]
    for key in direct_keys:
        if segment.get(key):
            return segment.get(key)
    for key in ("terminal", "gate"):
        if airport.get(key):
            return airport.get(key)
    return "Not available"


def _aircraft_label(segment):
    aircraft = segment.get("aircraft") or {}
    return aircraft.get("name") or aircraft.get("iata_code") or segment.get("aircraft_name") or "Not available"


def _segment_detail(segment):
    marketing_carrier = segment.get("marketing_carrier") or {}
    operating_carrier = segment.get("operating_carrier") or {}
    flight_number = segment.get("marketing_carrier_flight_number")
    marketing_code = marketing_carrier.get("iata_code") or ""
    display_flight = f"{marketing_code} {flight_number}".strip() if flight_number else marketing_code
    return {
        "flight_number": display_flight or "Not available",
        "origin": _airport_label(segment.get("origin") or {}),
        "destination": _airport_label(segment.get("destination") or {}),
        "departure": _date_time_label(segment.get("departing_at")),
        "arrival": _date_time_label(segment.get("arriving_at")),
        "duration": _duration_label(segment.get("duration")) or "Not available",
        "aircraft": _aircraft_label(segment),
        "cabin": _segment_cabin(segment),
        "operating_carrier": operating_carrier.get("name") or operating_carrier.get("iata_code") or "Not available",
        "marketing_carrier": marketing_carrier.get("name") or marketing_carrier.get("iata_code") or "Not available",
        "departure_terminal": _terminal_label(segment, "origin"),
        "arrival_terminal": _terminal_label(segment, "destination"),
    }


def _layover_details(segments):
    layovers = []
    for index in range(max(0, len(segments) - 1)):
        current_segment = segments[index]
        next_segment = segments[index + 1]
        airport = _airport_label(current_segment.get("destination") or {})
        layovers.append(
            {
                "airport": airport,
                "duration": _duration_between(current_segment.get("arriving_at"), next_segment.get("departing_at")),
            }
        )
    return layovers


def _fare_conditions(offer):
    conditions = offer.get("conditions") or {}
    if not isinstance(conditions, dict) or not conditions:
        return ["Not available"]
    labels = []
    for key, value in conditions.items():
        label = str(key).replace("_", " ").title()
        if isinstance(value, dict):
            allowed = value.get("allowed")
            penalty = value.get("penalty_amount")
            currency = value.get("penalty_currency")
            detail = "Allowed" if allowed is True else "Not allowed" if allowed is False else "Not available"
            if penalty and currency:
                detail = f"{detail} · penalty {penalty} {currency}"
            labels.append(f"{label}: {detail}")
        else:
            labels.append(f"{label}: {_display_value(value)}")
    return labels or ["Not available"]


def _route_details(offer):
    details = []
    for index, flight_slice in enumerate(offer.get("slices") or []):
        segments = flight_slice.get("segments") or []
        details.append(
            {
                "label": "Outbound" if index == 0 else "Return" if index == 1 else f"Slice {index + 1}",
                "origin": _airport_label(flight_slice.get("origin") or {}),
                "destination": _airport_label(flight_slice.get("destination") or {}),
                "duration": _duration_label(flight_slice.get("duration")) or "Not available",
                "segments": [_segment_detail(segment) for segment in segments],
                "layovers": _layover_details(segments),
            }
        )
    return details


def _segment_cabin(segment):
    passengers = segment.get("passengers") or []
    if passengers:
        cabin = passengers[0].get("cabin_class_marketing_name") or passengers[0].get("cabin_class")
        if cabin:
            return str(cabin)
    return "Economy"


def _extract_baggage(offer):
    baggage_labels = []
    for flight_slice in offer.get("slices") or []:
        for segment in flight_slice.get("segments") or []:
            for passenger in segment.get("passengers") or []:
                for baggage in passenger.get("baggages") or []:
                    quantity = baggage.get("quantity")
                    baggage_type = baggage.get("type")
                    if quantity and baggage_type:
                        baggage_labels.append(f"{quantity} {str(baggage_type).replace('_', ' ')}")
    if baggage_labels:
        return ", ".join(dict.fromkeys(baggage_labels))
    return ""


def _is_sandbox_offer(offer):
    owner = offer.get("owner") or {}
    owner_name = str(owner.get("name") or "").strip().lower()
    owner_iata = str(owner.get("iata_code") or "").strip().upper()
    if owner_name in SANDBOX_AIRLINES or owner_iata in SANDBOX_OWNER_IATA_CODES:
        return True
    for flight_slice in offer.get("slices") or []:
        for segment in flight_slice.get("segments") or []:
            marketing_carrier = segment.get("marketing_carrier") or {}
            operating_carrier = segment.get("operating_carrier") or {}
            marketing_name = str(marketing_carrier.get("name") or "").strip()
            operating_name = str(operating_carrier.get("name") or "").strip()
            if not marketing_name and not operating_name:
                return True
            if {marketing_name.lower(), operating_name.lower()} & SANDBOX_AIRLINES:
                return True
    return False


def _normalize_duffel_offer(offer):
    slices = offer.get("slices") or []
    first_slice = slices[0] if slices else {}
    segments = first_slice.get("segments") or []
    if not segments:
        return None
    first_summary = _segment_summary(segments[0])
    last_summary = _segment_summary(segments[-1])
    owner = offer.get("owner") or {}
    airline = first_summary.get("marketing_carrier") or owner.get("name") or owner.get("iata_code")
    return {
        "airline": airline,
        "flight_number": first_summary.get("flight_number"),
        "origin": first_summary.get("origin"),
        "destination": last_summary.get("destination"),
        "departure_time": first_summary.get("departure_at"),
        "arrival_time": last_summary.get("arrival_at"),
        "duration": first_slice.get("duration"),
        "stops": max(0, len(segments) - 1),
        "cabin": _segment_cabin(segments[0]),
        "baggage": _extract_baggage(offer),
        "route_details": _route_details(offer),
        "fare_conditions": _fare_conditions(offer),
        "price": offer.get("total_amount"),
        "currency": offer.get("total_currency") or "USD",
        "provider": "Duffel",
        "source": "duffel",
    }


def load_flight_offers(origin, destination, departure_date, return_date, adults, cabin_class, max_results=5, return_origin=None, request_timeout=12.0):
    api_key = _duffel_api_key()
    if not api_key:
        return [], False, {"status": "not_configured", "message": "Duffel API key not configured."}

    return_origin = (return_origin or destination).upper()
    payload = {
        "data": {
            "slices": [
                {"origin": origin.upper(), "destination": destination.upper(), "departure_date": departure_date},
                {"origin": return_origin, "destination": origin.upper(), "departure_date": return_date},
            ],
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
        request_start = time.perf_counter()
        response = requests.post(
            f"{DUFFEL_BASE_URL}/air/offer_requests",
            json=payload,
            headers=headers,
            timeout=max(1.0, float(request_timeout)),
            verify=certifi.where(),
        )
        request_time = time.perf_counter() - request_start
        response.raise_for_status()
        data = response.json().get("data") or {}
        raw_offers = data.get("offers") or []
        normalize_start = time.perf_counter()
        offers = [offer for offer in raw_offers if not _is_sandbox_offer(offer)]
        flights = [_normalize_duffel_offer(offer) for offer in offers[: max(1, int(max_results))]]
        normalization_time = time.perf_counter() - normalize_start
        print(
            "[Byable Flights] "
            f"duffel_request_time={request_time:.3f}s "
            f"normalization_time={normalization_time:.3f}s "
            f"raw_offers={len(raw_offers)} usable_offers={len(offers)}"
        )
        if flights:
            normalized = [_normalize_duffel_flight(flight, adults) for flight in flights if flight]
            return [flight for flight in normalized if flight], True, {
                "status": "ok",
                "message": None,
                "offer_count": len(offers),
                "timing": {"duffel": request_time, "normalize": normalization_time},
            }
        return [], False, {
            "status": "ok",
            "message": "No live fares found for these dates.",
            "timing": {"duffel": request_time, "normalize": normalization_time},
        }
    except requests.HTTPError as exc:
        try:
            error_payload = exc.response.json() if exc.response is not None else {}
            error_message = error_payload.get("errors", [{}])[0].get("message") or f"Duffel API error ({exc.response.status_code})."
        except (ValueError, json.JSONDecodeError, AttributeError):
            error_message = str(exc)
        return [], False, {"status": "error", "message": error_message, "timing": {"duffel": 0.0, "normalize": 0.0}}
    except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
        return [], False, {
            "status": "error",
            "message": str(exc),
            "timing": {"duffel": 0.0, "normalize": 0.0},
        }


def _duffel_place_suggestions(query: str) -> list:
    """Call GET /places/suggestions?query=... and return the raw data list."""
    api_key = _duffel_api_key()
    if not api_key:
        return []
    try:
        response = requests.get(
            f"{DUFFEL_BASE_URL}/places/suggestions",
            params={"query": query},
            headers={
                "Authorization": f"Bearer {api_key}",
                "Duffel-Version": DUFFEL_VERSION,
                "Accept": "application/json",
            },
            timeout=5.0,
            verify=certifi.where(),
        )
        response.raise_for_status()
        return response.json().get("data") or []
    except Exception as exc:
        print(f"[Byable] Duffel places error for {query!r}: {exc}", flush=True)
        return []


def _best_place_result(suggestions: list):
    """
    Extract (label, [iata_codes]) from Duffel place suggestions.
    City results are preferred; airport results are the fallback.
    Returns None when nothing usable is found.
    """
    for item in suggestions:
        if item.get("type") == "city":
            label = str(item.get("name") or "").strip()
            city_code = str(item.get("iata_city_code") or "").strip().upper()
            if label and city_code:
                return label, [city_code]
            # iata_city_code missing — pull individual airport codes
            codes = [
                str(a.get("iata_code") or "").upper()
                for a in (item.get("airports") or [])
                if a.get("iata_code")
            ]
            if label and codes:
                return label, codes
    for item in suggestions:
        if item.get("type") == "airport":
            label = str(item.get("city_name") or item.get("name") or "").strip()
            code = str(item.get("iata_code") or "").strip().upper()
            if label and code:
                return label, [code]
    return None


def _duffel_resolve_city(query: str):
    """
    Resolve a free-text city name via Duffel Places Suggestions.
    Returns (label, [iata_codes]) or None.  Results are cached process-wide.
    """
    normalized = re.sub(r"\s+", " ", str(query or "").strip().lower())
    if not normalized:
        return None
    if normalized in _DUFFEL_PLACE_CACHE:
        return _DUFFEL_PLACE_CACHE[normalized]
    suggestions = _duffel_place_suggestions(query.strip())
    result = _best_place_result(suggestions) if suggestions else None
    _DUFFEL_PLACE_CACHE[normalized] = result
    if result:
        print(f"[Byable] Duffel resolved {query!r} → {result[1]} ({result[0]})", flush=True)
    else:
        print(f"[Byable] Duffel could not resolve {query!r}", flush=True)
    return result


def _resolve_city_airports_with_duffel(value: str):
    """
    Full city resolution for search: IATA code → local map → Duffel API → fallback.
    Returns (label, [iata_codes], source) where source is one of:
      "iata_code", "map", "duffel", "fallback".
    Only "fallback" means the result is unreliable.
    """
    raw = str(value or "").strip()
    normalized = re.sub(r"\s+", " ", raw.lower())
    # 1. Direct 3-letter IATA code — use as-is
    if re.fullmatch(r"[A-Za-z]{3}", raw):
        code = raw.upper()
        return code, [code], "iata_code"
    # 2. Local map (instant, no API)
    if normalized in CITY_AIRPORTS:
        entry = CITY_AIRPORTS[normalized]
        return entry["label"], list(entry["airports"]), "map"
    # 3. Duffel Places Suggestions API
    duffel_result = _duffel_resolve_city(raw)
    if duffel_result:
        label, codes = duffel_result
        return label, codes, "duffel"
    # 4. Last-resort fallback — raw[:3] — explicitly marked unreliable
    label = raw.title() if raw else "Unknown"
    fallback_code = raw.upper()[:3] if raw else "UNK"
    print(f"[Byable] Resolution fallback used: {raw!r} → {fallback_code!r}", flush=True)
    return label, [fallback_code], "fallback"


def load_city_flight_offers(origin_city, destination_city, departure_date, return_date, adults, cabin_class, max_results=20, return_origin_city=None):
    city_search_start = time.perf_counter()
    origin_label, origin_airports, origin_source = _resolve_city_airports_with_duffel(origin_city)
    destination_label, destination_airports, destination_source = _resolve_city_airports_with_duffel(destination_city)
    return_origin_label, return_origin_airports, return_origin_source = _resolve_city_airports_with_duffel(return_origin_city or destination_city)
    resolution_known = {
        "origin": origin_source != "fallback",
        "destination": destination_source != "fallback",
        "return_origin": return_origin_source != "fallback",
    }
    resolution_source = {
        "origin": origin_source,
        "destination": destination_source,
        "return_origin": return_origin_source,
    }
    searched_airport_label = _airport_resolution_label(
        origin_airports,
        destination_airports,
        return_origin_airports,
        open_jaw=bool(return_origin_city and str(return_origin_city).strip().lower() != str(destination_city).strip().lower()),
    )
    if not _duffel_api_key():
        print(
            "[Byable Flights] "
            f"city_search_time={time.perf_counter() - city_search_start:.3f}s "
            "combined_offers=0 key_missing=True "
            f"searched_airports={searched_airport_label}"
        )
        return [], False, {
            "status": "not_configured",
            "message": "Duffel API key not configured.",
            "searched_origin_airports": origin_airports,
            "searched_destination_airports": destination_airports,
            "searched_return_origin_airports": return_origin_airports,
            "searched_airport_label": searched_airport_label,
            "resolution_known": resolution_known,
            "resolution_source": resolution_source,
            "origin_label": origin_label,
            "destination_label": destination_label,
            "return_origin_label": return_origin_label,
            "messages": [],
        }
    combined = []
    messages = []
    live_any = False
    seen = set()
    timing = {"duffel": 0.0, "normalize": 0.0}
    combinations = _airport_search_combinations(origin_airports, destination_airports, return_origin_airports)
    attempts = 0
    deadline = city_search_start + MAX_CITY_SEARCH_SECONDS

    def remaining_search_seconds():
        return max(0.0, deadline - time.perf_counter())

    for origin_airport, destination_airport, return_origin_airport in combinations:
        remaining = remaining_search_seconds()
        if remaining <= 1.0:
            messages.append("Flight search stopped after the 12 second search limit.")
            break
        attempts += 1
        print(
            "[Byable Flights] "
            f"duffel_airport_search origin={origin_airport} "
            f"destination={destination_airport} "
            f"return_origin={return_origin_airport}"
        )
        offers, live, payload = load_flight_offers(
            origin_airport,
            destination_airport,
            departure_date,
            return_date,
            adults,
            cabin_class,
            max_results=max_results,
            return_origin=return_origin_airport,
            request_timeout=min(remaining, MAX_CITY_SEARCH_SECONDS),
        )
        payload_timing = payload.get("timing") or {}
        timing["duffel"] += float(payload_timing.get("duffel") or 0)
        timing["normalize"] += float(payload_timing.get("normalize") or 0)
        live_any = live_any or live
        if payload.get("message"):
            messages.append(f"{origin_airport}->{destination_airport}/{return_origin_airport}->{origin_airport}: {payload.get('message')}")
        for offer in offers:
            offer["origin_city"] = origin_label
            offer["destination_city"] = destination_label
            offer["return_origin_city"] = return_origin_label
            offer["airport_pair"] = f"{origin_airport} → {destination_airport}"
            offer["return_airport_pair"] = f"{return_origin_airport} → {origin_airport}"
            key = _flight_key(offer)
            if key not in seen:
                seen.add(key)
                combined.append(offer)
        if len(combined) >= max_results:
            break

    status = "ok" if combined or live_any else "not_configured" if not _duffel_api_key() else "ok"
    fallback_used = not all(resolution_known.values())
    if combined:
        message = None
    elif not fallback_used:
        message = (
            "No live fares found for these dates. "
            f"Searched: {searched_airport_label}. "
            "Try changing the date, destination airport, or cabin."
        )
    else:
        # Duffel could not resolve at least one city — raw[:3] fallback was used
        failed = [k for k, v in resolution_known.items() if not v]
        message = (
            "No live fares found. "
            f"Byable could not resolve {', '.join(failed)} to a known airport code "
            f"and searched a best-guess code instead: {searched_airport_label}. "
            "Try entering a known city name or a 3-letter IATA code."
        )
    if not _duffel_api_key():
        message = "Duffel API key not configured."
    print(
        "[Byable Flights] "
        f"city_search_time={time.perf_counter() - city_search_start:.3f}s "
        f"combined_offers={len(combined)} "
        f"origin_airports={len(origin_airports)} "
        f"destination_airports={len(destination_airports)} "
        f"return_airports={len(return_origin_airports)} "
        f"attempts={attempts} "
        f"searched_airports={searched_airport_label} "
        f"resolution_sources={resolution_source}"
    )
    return combined[:max_results], bool(combined and live_any), {
        "status": status,
        "message": message,
        "timing": {
            "duffel": timing["duffel"],
            "normalize": timing["normalize"],
            "city_search": time.perf_counter() - city_search_start,
            "attempts": attempts,
        },
        "searched_origin_airports": origin_airports,
        "searched_destination_airports": destination_airports,
        "searched_return_origin_airports": return_origin_airports,
        "searched_airport_label": searched_airport_label,
        "resolution_known": resolution_known,
        "resolution_source": resolution_source,
        "origin_label": origin_label,
        "destination_label": destination_label,
        "return_origin_label": return_origin_label,
        "messages": messages[:5],
    }


def money_usd(value):
    return f"${float(value or 0):,.0f}"


def _unique_summary(values):
    cleaned = [_display_value(value) for value in values if _display_value(value) != "Not available"]
    return ", ".join(dict.fromkeys(cleaned)) if cleaned else "Not available"


def _render_label_value(label, value):
    st.caption(label)
    st.write(_display_value(value))


def _render_compact_segment(segment):
    route_cols = st.columns([1.3, 0.45, 1.3])
    with route_cols[0]:
        st.caption("Depart")
        st.markdown(f"**{_display_value(segment.get('origin'))}**")
        st.caption(_display_value(segment.get("departure")))
        st.caption(f"Terminal: {_display_value(segment.get('departure_terminal'))}")
    with route_cols[1]:
        st.caption(_display_value(segment.get("flight_number")))
        st.markdown("**→**")
        st.caption(_display_value(segment.get("duration")))
    with route_cols[2]:
        st.caption("Arrive")
        st.markdown(f"**{_display_value(segment.get('destination'))}**")
        st.caption(_display_value(segment.get("arrival")))
        st.caption(f"Terminal: {_display_value(segment.get('arrival_terminal'))}")

    st.caption(
        " · ".join(
            [
                f"Aircraft: {_display_value(segment.get('aircraft'))}",
                f"Cabin: {_display_value(segment.get('cabin'))}",
                f"Carrier: {_display_value(segment.get('operating_carrier'))}",
            ]
        )
    )


def _render_route_card(flight_slice):
    layovers = flight_slice.get("layovers") or []
    with st.container(border=True):
        st.markdown(f"##### {_display_value(flight_slice.get('label'))}")
        st.caption(
            f"{_display_value(flight_slice.get('origin'))} → "
            f"{_display_value(flight_slice.get('destination'))} · "
            f"{_display_value(flight_slice.get('duration'))}"
        )
        for segment_index, segment in enumerate(flight_slice.get("segments") or []):
            _render_compact_segment(segment)
            if segment_index < len(layovers):
                layover = layovers[segment_index]
                st.caption(
                    f"Layover: {_display_value(layover.get('airport'))} · "
                    f"{_display_value(layover.get('duration'))}"
                )
            if segment_index < len((flight_slice.get("segments") or [])) - 1:
                st.divider()


def _route_terminal_summary(flight_slice):
    segments = flight_slice.get("segments") or []
    if not segments:
        return "Terminal info not available"
    first_segment = segments[0]
    last_segment = segments[-1]
    origin = _display_value(first_segment.get("origin"))
    destination = _display_value(last_segment.get("destination"))
    departure_terminal = _display_value(first_segment.get("departure_terminal"))
    arrival_terminal = _display_value(last_segment.get("arrival_terminal"))
    if departure_terminal == "Not available" and arrival_terminal == "Not available":
        return "Terminal info not available"
    return f"{origin} {departure_terminal} -> {destination} {arrival_terminal}"


def _route_time_summary(flight_slice):
    segments = flight_slice.get("segments") or []
    if not segments:
        return "Times not available"
    first_segment = segments[0]
    last_segment = segments[-1]
    return f"{_display_value(first_segment.get('departure'))} -> {_display_value(last_segment.get('arrival'))}"


def _fare_flexibility_label(fare_conditions):
    text = " ".join(str(item).lower() for item in fare_conditions or [])
    if "refund: allowed" in text or "change: allowed" in text:
        return "Flexible"
    if "not allowed" in text:
        return "Limited"
    return "Not available"


def _render_compact_route_summary(flight_slice):
    segments = flight_slice.get("segments") or []
    route = (
        f"{_display_value(flight_slice.get('origin'))} -> "
        f"{_display_value(flight_slice.get('destination'))}"
    )
    st.markdown(f"**{_display_value(flight_slice.get('label'))}**")
    st.caption(route)
    st.write(_route_time_summary(flight_slice))
    details = [
        f"Duration: {_display_value(flight_slice.get('duration'))}",
        _route_terminal_summary(flight_slice),
    ]
    if len(segments) > 1:
        details.append(f"{len(segments) - 1} layover{'s' if len(segments) > 2 else ''}")
    else:
        details.append("Nonstop")
    st.caption(" · ".join(details))


def render_flight_details(offer, recommendation=None, return_mode="Same as destination", origin_label="", destination_label="", return_origin_label=""):
    route_details = offer.get("route_details") or []
    fare_conditions = offer.get("fare_conditions") or ["Not available"]
    baggage = offer.get("baggage") or "Not available"
    operating_carriers = []
    aircraft_types = []
    terminals = []
    for flight_slice in route_details:
        for segment in flight_slice.get("segments") or []:
            operating_carriers.append(segment.get("operating_carrier") or "Not available")
            aircraft_types.append(segment.get("aircraft") or "Not available")
            terminals.append(
                f"{segment.get('origin', 'Not available')}: {segment.get('departure_terminal', 'Not available')} → "
                f"{segment.get('destination', 'Not available')}: {segment.get('arrival_terminal', 'Not available')}"
            )
    operating_summary = _unique_summary(operating_carriers)
    aircraft_summary = _unique_summary(aircraft_types)

    recommendation = recommendation or {}
    with st.container(border=True):
        st.markdown("##### Trip impact summary")
        st.write(_trip_impact_summary(offer, recommendation))

    if recommendation.get("why"):
        with st.container(border=True):
            st.markdown("##### Why this flight")
            st.write(recommendation["why"])

    breakdown = recommendation.get("breakdown") or {}
    if breakdown:
        score_text = " · ".join(
            f"{'Timing' if label == 'Arrival timing' else label} {float(value):.1f}"
            for label, value in breakdown.items()
        )
        st.caption(f"AI reasoning: {score_text}")

    st.markdown("##### Advisor notes")
    note_cols = st.columns(2)
    with note_cols[0]:
        st.caption("Airport notes")
        st.markdown(f"**{_city_access_note(offer)}**")
    with note_cols[1]:
        st.caption("Return logic")
        st.markdown(f"**{_return_route_text(offer, return_mode, origin_label, destination_label, return_origin_label)}**")

    st.caption("Tradeoff summary")
    for bullet in _tradeoff_bullets(offer, recommendation):
        st.caption(f"- {bullet}")

    st.markdown("##### Quick details")
    detail_items = [
        ("Total travel time", offer.get("total_travel_time") or offer.get("duration")),
        ("Baggage", baggage),
        ("Cabin", offer.get("cabin")),
        ("Carrier", operating_summary),
        ("Aircraft", aircraft_summary),
        ("Fare flexibility", _fare_flexibility_label(fare_conditions)),
    ]
    detail_cols = st.columns(3)
    for index, (label, value) in enumerate(detail_items):
        with detail_cols[index % 3]:
            st.caption(label)
            st.markdown(f"**{_display_value(value)}**")

    st.markdown("##### Compact route timeline")
    if not route_details:
        st.write("Route breakdown not available.")
        return

    if len(route_details) >= 2:
        route_cols = st.columns(2)
        for col, flight_slice in zip(route_cols, route_details[:2]):
            with col:
                with st.container(border=True):
                    _render_compact_route_summary(flight_slice)
        for flight_slice in route_details[2:]:
            with st.container(border=True):
                _render_compact_route_summary(flight_slice)
    else:
        with st.container(border=True):
            _render_compact_route_summary(route_details[0])

    with st.container(border=True):
        st.markdown("##### Fare rules")
        available_conditions = [
            _display_value(condition)
            for condition in fare_conditions
            if _display_value(condition) != "Not available"
        ]
        if not available_conditions:
            st.caption("Fare rules not available for this test fare.")
        else:
            for condition in available_conditions:
                st.caption(f"- {condition}")


def _modal_route_line(flight_slice):
    segments = flight_slice.get("segments") or []
    if not segments:
        return f"{_display_value(flight_slice.get('label'))}: route details not available"
    first_segment = segments[0]
    last_segment = segments[-1]
    stops = max(0, len(segments) - 1)
    stop_label = "Nonstop" if stops == 0 else f"{stops} stop" if stops == 1 else f"{stops} stops"
    return (
        f"{_display_value(flight_slice.get('label'))}: "
        f"{_display_value(first_segment.get('origin'))} → {_display_value(last_segment.get('destination'))} · "
        f"{_display_value(first_segment.get('departure'))} → {_display_value(last_segment.get('arrival'))} · "
        f"{_display_value(flight_slice.get('duration'))} · {stop_label}"
    )


def render_flight_details_modal(offer, recommendation=None, return_mode="Same as destination", origin_label="", destination_label="", return_origin_label=""):
    recommendation = recommendation or {}
    ai_copy = recommendation.get("ai_advisor_copy") or {}
    route_details = offer.get("route_details") or []
    fare_conditions = offer.get("fare_conditions") or ["Not available"]
    operating_carriers = []
    aircraft_types = []
    for flight_slice in route_details:
        for segment in flight_slice.get("segments") or []:
            operating_carriers.append(segment.get("operating_carrier") or "Not available")
            aircraft_types.append(segment.get("aircraft") or "Not available")

    st.markdown("#### Advisor summary")
    st.write(ai_copy.get("modal_summary") or _trip_impact_summary(offer, recommendation))

    fact_line = " · ".join(
        [
            f"Duration: {_display_value(offer.get('total_travel_time') or offer.get('duration'))}",
            f"Baggage: {_display_value(offer.get('baggage') or 'Not available')}",
            f"Cabin: {_display_value(offer.get('cabin'))}",
            f"Carrier: {_unique_summary(operating_carriers)}",
            f"Flexibility: {_fare_flexibility_label(fare_conditions)}",
        ]
    )
    st.caption(fact_line)

    st.markdown("#### Route")
    if return_mode == "Different city":
        st.caption(f"Open-jaw return · {return_origin_label} → {origin_label}")
    else:
        st.caption(f"Return route · {destination_label} → {origin_label}")
    if route_details:
        for flight_slice in route_details[:2]:
            st.markdown(f"**{_modal_route_line(flight_slice)}**")
    else:
        st.caption("Route details not available for this test fare.")

    aircraft_summary = _unique_summary(aircraft_types)
    if aircraft_summary != "Not available":
        st.caption(f"Aircraft: {aircraft_summary}")

    st.markdown("#### Fare rules")
    available_conditions = [
        _display_value(condition)
        for condition in fare_conditions
        if _display_value(condition) != "Not available"
    ]
    if available_conditions:
        for condition in available_conditions[:4]:
            st.caption(f"- {condition}")
    else:
        st.caption("Fare rules not available for this test fare.")


def render_flight_comparison_modal(selected_offer, recommended_offer, offers, recommendation_bullets=None):
    selected_is_recommended = _flight_key(selected_offer) == _flight_key(recommended_offer)
    if selected_is_recommended:
        result = _why_number_one_lists(recommended_offer, offers, recommendation_bullets)
        st.markdown("#### Why Byable picked this")
        st.caption("Ranked #1 because:")
        for reason in result["reasons"][:3]:
            st.markdown(f"✓ {reason}")
        st.caption("Main tradeoff:")
        st.markdown(f"• {result['tradeoff']}")
        return

    comparison = _comparison_lists(selected_offer, recommended_offer, offers)
    st.markdown("#### Why this was not picked")
    st.caption("Why it could be good:")
    for advantage in comparison["advantages"][:2]:
        st.markdown(f"✓ {advantage}")
    st.caption("Why Byable ranked it lower:")
    for reason in comparison["lower_reasons"][:2]:
        st.markdown(f"• {reason}")


def render():
    render_start = time.perf_counter()
    _run_ai_setup_check_once()
    selected_flight = st.session_state.get("selected_flight")
    if isinstance(selected_flight, dict) and selected_flight.get("source") != "duffel":
        st.session_state.pop("selected_flight", None)

    st.markdown(
        """
        <style>
        .block-container {
            padding-top: 1.25rem !important;
        }
        div[data-testid="stForm"] {
            border: 1px solid rgba(129,140,248,0.18);
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.13), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018)),
                rgba(7,9,15,0.92);
            border-radius: 18px;
            padding: 16px 18px 14px;
            margin-bottom: 0.75rem;
            box-shadow: 0 18px 48px rgba(0,0,0,0.16);
        }
        .flight-search-shell {
            padding: 0 0 4px;
            margin-bottom: 8px;
        }
        .flight-search-title {
            color: #fff;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: -0.2px;
            margin-bottom: 2px;
        }
        .flight-search-subtitle {
            color: rgba(255,255,255,0.52);
            font-size: 13px;
            line-height: 1.45;
            margin-bottom: 12px;
        }
        .flight-search-submit-spacer {
            height: 1.48rem;
        }
        .flight-return-toggle [role="radiogroup"] {
            opacity: 0.86;
        }
        div[data-testid="stButton"] > button[kind="primary"],
        div[data-testid="stButton"] > button[data-testid="baseButton-primary"] {
            border: 1px solid rgba(196,181,253,0.46) !important;
            border-radius: 13px !important;
            background:
                radial-gradient(circle at top left, rgba(255,255,255,0.20), transparent 32%),
                linear-gradient(135deg, #8b5cf6 0%, #6366f1 52%, #4f46e5 100%) !important;
            color: #ffffff !important;
            box-shadow: 0 12px 30px rgba(99,102,241,0.32), 0 0 0 1px rgba(255,255,255,0.06) inset !important;
            font-weight: 850 !important;
            letter-spacing: -0.01em !important;
            transition: transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease !important;
        }
        div[data-testid="stButton"] > button[kind="primary"]::before,
        div[data-testid="stButton"] > button[data-testid="baseButton-primary"]::before {
            content: "⌕";
            margin-right: 7px;
            font-weight: 900;
            color: rgba(255,255,255,0.92);
        }
        div[data-testid="stButton"] > button[kind="primary"]:hover,
        div[data-testid="stButton"] > button[data-testid="baseButton-primary"]:hover {
            filter: brightness(1.08) saturate(1.05) !important;
            transform: translateY(-1px);
            box-shadow: 0 16px 38px rgba(99,102,241,0.42), 0 0 0 1px rgba(255,255,255,0.10) inset !important;
        }
        div[data-testid="stButton"] > button[kind="primary"]:active,
        div[data-testid="stButton"] > button[data-testid="baseButton-primary"]:active {
            transform: translateY(0);
            filter: brightness(0.98) !important;
        }
        div[data-testid="stButton"] > button:not([kind="primary"]),
        div[data-testid="stButton"] > button[data-testid="baseButton-secondary"] {
            background: rgba(255,255,255,0.045) !important;
            color: rgba(248,250,252,0.92) !important;
            border: 1px solid rgba(255,255,255,0.13) !important;
            -webkit-text-fill-color: rgba(248,250,252,0.92) !important;
        }
        div[data-testid="stButton"] > button:not([kind="primary"]) p,
        div[data-testid="stButton"] > button[data-testid="baseButton-secondary"] p {
            color: inherit !important;
            -webkit-text-fill-color: inherit !important;
        }
        div[data-testid="stButton"] > button:disabled {
            background: rgba(124,110,247,0.16) !important;
            color: #ffffff !important;
            border-color: rgba(168,156,247,0.34) !important;
            opacity: 1 !important;
            -webkit-text-fill-color: #ffffff !important;
        }
        @media (prefers-color-scheme: light) {
            div[data-testid="stButton"] > button,
            div[data-testid="stButton"] > button:not([kind="primary"]),
            div[data-testid="stButton"] > button[data-testid="baseButton-secondary"] {
                background: rgba(255,255,255,0.045) !important;
                color: rgba(248,250,252,0.92) !important;
                border-color: rgba(255,255,255,0.13) !important;
                -webkit-text-fill-color: rgba(248,250,252,0.92) !important;
            }
            div[data-testid="stButton"] > button p {
                color: inherit !important;
                -webkit-text-fill-color: inherit !important;
            }
            div[data-testid="stButton"] > button:disabled {
                background: rgba(124,110,247,0.16) !important;
                color: #ffffff !important;
                border-color: rgba(168,156,247,0.34) !important;
                -webkit-text-fill-color: #ffffff !important;
            }
            div[data-testid="stForm"] input,
            div[data-testid="stForm"] textarea,
            div[data-testid="stForm"] [data-baseweb="input"],
            div[data-testid="stForm"] [data-baseweb="base-input"],
            div[data-testid="stForm"] [data-baseweb="select"],
            div[data-testid="stForm"] [data-baseweb="select"] > div,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] input,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="input"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="base-input"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"] > div {
                background: rgba(7,9,15,0.88) !important;
                color: rgba(248,250,252,0.94) !important;
                border-color: rgba(255,255,255,0.13) !important;
                -webkit-text-fill-color: rgba(248,250,252,0.94) !important;
            }
            div[data-testid="stForm"] label,
            div[data-testid="stForm"] [role="radiogroup"] label,
            div[data-testid="stForm"] div[data-testid="stCheckbox"] label,
            div[data-testid="stForm"] div[data-testid="stRadio"] label,
            div[data-testid="stForm"] div[data-testid="stMultiSelect"] label,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] label,
            div[data-testid="stForm"] [data-testid="stWidgetLabel"],
            div[data-testid="stForm"] [data-testid="stWidgetLabel"] span,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-testid="stWidgetLabel"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-testid="stWidgetLabel"] span {
                color: rgba(226,232,240,0.72) !important;
                -webkit-text-fill-color: rgba(226,232,240,0.72) !important;
            }
            .flight-status-row,
            .flight-status-row span,
            .flight-updated,
            .flight-search-subtitle {
                color: rgba(226,232,240,0.66) !important;
                -webkit-text-fill-color: rgba(226,232,240,0.66) !important;
            }
        }
        div[data-testid="stForm"] label {
            font-size: 0.78rem;
            color: rgba(255,255,255,0.68) !important;
            -webkit-text-fill-color: rgba(255,255,255,0.68) !important;
            font-weight: 800;
            letter-spacing: 0.01em;
        }
        div[data-testid="stForm"] [data-testid="stWidgetLabel"],
        div[data-testid="stForm"] [data-testid="stWidgetLabel"] span,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-testid="stWidgetLabel"],
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-testid="stWidgetLabel"] span {
            color: rgba(226,232,240,0.74) !important;
            -webkit-text-fill-color: rgba(226,232,240,0.74) !important;
        }
        div[data-testid="stForm"] input,
        div[data-testid="stForm"] textarea,
        div[data-testid="stForm"] [data-baseweb="input"],
        div[data-testid="stForm"] [data-baseweb="base-input"],
        div[data-testid="stForm"] [data-baseweb="select"],
        div[data-testid="stForm"] [data-baseweb="select"] > div,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] input,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] textarea,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="input"],
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="base-input"],
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"],
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"] > div {
            background: rgba(7,9,15,0.88) !important;
            color: rgba(248,250,252,0.94) !important;
            border-color: rgba(255,255,255,0.13) !important;
            -webkit-text-fill-color: rgba(248,250,252,0.94) !important;
        }
        div[data-testid="stForm"] input::placeholder,
        div[data-testid="stForm"] textarea::placeholder,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] input::placeholder,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] textarea::placeholder {
            color: rgba(226,232,240,0.44) !important;
            -webkit-text-fill-color: rgba(226,232,240,0.44) !important;
            opacity: 1 !important;
        }
        div[data-testid="stForm"] [data-baseweb="select"] span,
        div[data-testid="stForm"] [data-baseweb="select"] div,
        div[data-testid="stForm"] [data-baseweb="tag"] span,
        div[data-testid="stForm"] [data-baseweb="tag"] div,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"] span,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"] div,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="tag"] span,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="tag"] div {
            color: rgba(248,250,252,0.92) !important;
            -webkit-text-fill-color: rgba(248,250,252,0.92) !important;
        }
        div[data-testid="stForm"] [data-baseweb="tag"],
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="tag"] {
            background: rgba(124,58,237,0.22) !important;
            border: 1px solid rgba(168,156,247,0.30) !important;
        }
        div[data-testid="stForm"] [data-baseweb="select"] svg,
        div[data-testid="stForm"] [data-baseweb="tag"] svg,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"] svg,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="tag"] svg {
            color: rgba(248,250,252,0.82) !important;
            fill: rgba(248,250,252,0.82) !important;
        }
        div[data-testid="stForm"] [role="radiogroup"] label,
        div[data-testid="stForm"] div[data-testid="stCheckbox"] label,
        div[data-testid="stForm"] div[data-testid="stRadio"] label,
        div[data-testid="stForm"] div[data-testid="stMultiSelect"] label,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [role="radiogroup"] label,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] div[data-testid="stCheckbox"] label,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] div[data-testid="stRadio"] label,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] div[data-testid="stMultiSelect"] label {
            color: rgba(226,232,240,0.72) !important;
            -webkit-text-fill-color: rgba(226,232,240,0.72) !important;
        }
        div[data-testid="stForm"] [role="radiogroup"] label span,
        div[data-testid="stForm"] div[data-testid="stCheckbox"] label span,
        div[data-testid="stForm"] div[data-testid="stRadio"] label span,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [role="radiogroup"] label span,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] div[data-testid="stCheckbox"] label span,
        div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] div[data-testid="stRadio"] label span {
            color: rgba(226,232,240,0.72) !important;
            -webkit-text-fill-color: rgba(226,232,240,0.72) !important;
        }
        div[data-baseweb="popover"],
        div[data-baseweb="popover"] ul,
        div[data-baseweb="popover"] li {
            background: #0b0f17 !important;
            color: rgba(248,250,252,0.94) !important;
            -webkit-text-fill-color: rgba(248,250,252,0.94) !important;
        }
        .flight-status-row,
        .flight-status-row span,
        .flight-updated {
            color: rgba(226,232,240,0.66) !important;
            -webkit-text-fill-color: rgba(226,232,240,0.66) !important;
        }
        div[data-testid="stForm"] [data-testid="stVerticalBlock"] {
            gap: 0.55rem;
        }
        div[data-testid="stForm"] [data-testid="column"] {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
        }
        div[data-testid="stForm"] [data-testid="stCaptionContainer"] {
            color: rgba(255,255,255,0.48);
            font-size: 12px;
        }
        .flight-destination-hero {
            position: relative;
            min-height: 255px;
            border-radius: 24px;
            overflow: hidden;
            border: 1px solid rgba(165,180,252,0.18);
            background-position: center;
            background-size: cover;
            margin: 14px 0 18px;
            box-shadow: 0 28px 70px rgba(0,0,0,0.30);
        }
        .flight-destination-hero::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
                radial-gradient(circle at 18% 18%, rgba(129,140,248,0.30), transparent 32%),
                linear-gradient(90deg, rgba(5,7,13,0.88) 0%, rgba(5,7,13,0.58) 46%, rgba(5,7,13,0.28) 100%),
                linear-gradient(0deg, rgba(5,7,13,0.55), rgba(5,7,13,0.10));
        }
        .flight-destination-hero-content {
            position: relative;
            z-index: 1;
            min-height: 255px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            padding: 28px;
        }
        .flight-destination-kicker {
            width: fit-content;
            border: 1px solid rgba(196,181,253,0.28);
            background: rgba(99,102,241,0.16);
            color: rgba(224,231,255,0.92);
            border-radius: 999px;
            padding: 7px 11px;
            font-size: 11px;
            font-weight: 850;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 12px;
            backdrop-filter: blur(10px);
        }
        .flight-destination-title {
            color: #fff;
            font-size: clamp(2rem, 4vw, 3.8rem);
            font-weight: 950;
            letter-spacing: -0.055em;
            line-height: 0.95;
            margin-bottom: 12px;
            text-shadow: 0 18px 42px rgba(0,0,0,0.36);
        }
        .flight-destination-route {
            color: rgba(255,255,255,0.84);
            font-size: 1rem;
            font-weight: 780;
            margin-bottom: 14px;
        }
        .flight-destination-meta {
            display: flex;
            gap: 9px;
            flex-wrap: wrap;
        }
        .flight-destination-meta span {
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.13);
            background: rgba(7,9,15,0.44);
            color: rgba(255,255,255,0.76);
            padding: 7px 11px;
            font-size: 12px;
            font-weight: 750;
            backdrop-filter: blur(10px);
        }
        .flight-destination-hero.no-image::after {
            content: "";
            position: absolute;
            right: 28px;
            top: 34px;
            width: min(34vw, 360px);
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(196,181,253,0.60), transparent);
            opacity: 0.78;
        }
        .flight-destination-route-graphic {
            display: none;
        }
        .flight-destination-hero.no-image .flight-destination-route-graphic {
            position: absolute;
            right: 28px;
            top: 42px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: rgba(224,231,255,0.78);
            font-size: 12px;
            font-weight: 850;
            letter-spacing: 0.02em;
        }
        .flight-destination-plane {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            border-radius: 999px;
            border: 1px solid rgba(196,181,253,0.30);
            background: rgba(15,23,42,0.46);
            box-shadow: 0 16px 36px rgba(0,0,0,0.22), 0 0 24px rgba(129,140,248,0.20);
            backdrop-filter: blur(10px);
        }
        .flight-destination-insights {
            display: none;
        }
        .flight-destination-hero.no-image .flight-destination-insights {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .flight-destination-insights span {
            border-radius: 999px;
            border: 1px solid rgba(196,181,253,0.18);
            background: rgba(255,255,255,0.055);
            color: rgba(255,255,255,0.70);
            padding: 6px 10px;
            font-size: 11px;
            font-weight: 780;
            backdrop-filter: blur(10px);
        }
        div[data-testid="stVerticalBlockBorderWrapper"] {
            border: 1px solid rgba(129,140,248,0.16) !important;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.10), transparent 30%),
                linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.016)),
                rgba(7,9,15,0.90) !important;
            border-radius: 18px !important;
            box-shadow: 0 16px 42px rgba(0,0,0,0.12);
        }
        .flight-status-row {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            margin: 2px 0 12px;
        }
        .flight-status-pill {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 6px 12px;
            border-radius: 999px;
            background: rgba(52,211,153,0.10);
            border: 1px solid rgba(52,211,153,0.24);
            color: #34d399;
            font-size: 12px;
            font-weight: 800;
        }
        .flight-status-pill.warn {
            background: rgba(251,191,36,0.10);
            border-color: rgba(251,191,36,0.24);
            color: #fbbf24;
        }
        .flight-updated {
            color: rgba(255,255,255,0.42);
            font-size: 12px;
        }
        .flight-presearch-card {
            border-radius: 20px;
            border: 1px solid rgba(165,180,252,0.22);
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.15), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.018)),
                rgba(7,9,15,0.92);
            padding: 22px;
            margin: 4px 0 12px;
            box-shadow: 0 18px 52px rgba(0,0,0,0.18);
        }
        .flight-presearch-kicker {
            color: rgba(199,210,254,0.82);
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .flight-presearch-title {
            color: rgba(255,255,255,0.96);
            font-size: 1.18rem;
            font-weight: 850;
            margin-bottom: 6px;
        }
        .flight-presearch-subtitle {
            color: rgba(255,255,255,0.62);
            font-size: 0.94rem;
            line-height: 1.55;
            max-width: 680px;
            margin-bottom: 16px;
        }
        .flight-presearch-benefits {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .flight-presearch-benefit {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.10);
            background: rgba(255,255,255,0.045);
            color: rgba(255,255,255,0.78);
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 750;
        }
        .flight-presearch-dot {
            width: 7px;
            height: 7px;
            border-radius: 999px;
            background: linear-gradient(135deg, #a5b4fc, #34d399);
            box-shadow: 0 0 16px rgba(129,140,248,0.42);
        }
        .flight-loading-card {
            border-radius: 18px;
            border: 1px solid rgba(165,180,252,0.18);
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.16), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018)),
                rgba(7,9,15,0.92);
            padding: 18px 20px;
            margin: 8px 0 16px;
            box-shadow: 0 18px 48px rgba(0,0,0,0.18);
        }
        .flight-loading-title {
            color: rgba(255,255,255,0.94);
            font-size: 1rem;
            font-weight: 900;
            margin-bottom: 10px;
        }
        .flight-loading-steps {
            display: grid;
            gap: 8px;
        }
        .flight-loading-step {
            display: flex;
            align-items: center;
            gap: 10px;
            color: rgba(255,255,255,0.68);
            font-size: 13px;
            font-weight: 720;
        }
        .flight-loading-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #a5b4fc;
            box-shadow: 0 0 18px rgba(129,140,248,0.48);
            animation: byablePulse 1.35s ease-in-out infinite;
        }
        .flight-loading-step:nth-child(2) .flight-loading-dot {
            animation-delay: 0.18s;
        }
        .flight-loading-step:nth-child(3) .flight-loading-dot {
            animation-delay: 0.36s;
        }
        @keyframes byablePulse {
            0%, 100% { opacity: 0.42; transform: scale(0.88); }
            50% { opacity: 1; transform: scale(1.18); }
        }
        .flight-card-native {
            width: 100%;
            border-radius: 18px;
            border: 1px solid rgba(255,255,255,0.09);
            background:
                linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018)),
                rgba(7,9,15,0.92);
            padding: 16px 18px;
            margin: 0 0 10px;
            box-shadow: 0 14px 36px rgba(0,0,0,0.14);
            transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .flight-card-native:hover {
            border-color: rgba(99,102,241,0.34);
            background: rgba(99,102,241,0.045);
            transform: translateY(-1px);
            box-shadow: 0 22px 54px rgba(0,0,0,0.22);
        }
        .flight-card-native.selected {
            border-color: rgba(129,140,248,0.72);
            background:
                radial-gradient(circle at top right, rgba(99,102,241,0.18), transparent 34%),
                linear-gradient(145deg, rgba(99,102,241,0.12), rgba(255,255,255,0.024));
            box-shadow: 0 0 0 1px rgba(129,140,248,0.18), 0 24px 60px rgba(49,46,129,0.26);
        }
        .flight-card-native.recommended {
            border-color: rgba(165,180,252,0.36);
            box-shadow: 0 18px 54px rgba(49,46,129,0.18);
        }
        .flight-card-native.compact {
            padding: 12px 14px;
        }
        .flight-card-native.compact .flight-card-top {
            margin-bottom: 8px;
        }
        .flight-card-native.compact .flight-route {
            margin-bottom: 8px;
        }
        .flight-card-native.compact .flight-card-footer {
            margin-top: 8px;
        }
        .flight-impact-inline {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin: 8px 0;
            color: rgba(255,255,255,0.62);
            font-size: 12px;
            line-height: 1.3;
        }
        .flight-impact-inline span {
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.035);
            border-radius: 999px;
            padding: 5px 8px;
            white-space: nowrap;
        }
        .flight-impact-inline strong {
            color: rgba(255,255,255,0.88);
        }
        .flight-card-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 12px;
        }
        .flight-airline-wrap {
            display: flex;
            align-items: center;
            gap: 13px;
            min-width: 0;
        }
        .flight-logo {
            width: 38px;
            height: 38px;
            border-radius: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            background: linear-gradient(145deg, rgba(129,140,248,0.22), rgba(56,189,248,0.09));
            border: 1px solid rgba(255,255,255,0.12);
            color: #e0e7ff;
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.6px;
        }
        .flight-airline {
            color: #fff;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.3;
        }
        .flight-number {
            color: rgba(255,255,255,0.42);
            font-size: 12px;
            margin-top: 2px;
        }
        .flight-rec-badge,
        .flight-score-pill {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 850;
            margin-top: 7px;
        }
        .flight-rec-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-top: 7px;
        }
        .flight-byable-recommended-label {
            display: inline-flex;
            width: fit-content;
            border-radius: 999px;
            border: 1px solid rgba(196,181,253,0.32);
            background: linear-gradient(135deg, rgba(139,92,246,0.28), rgba(99,102,241,0.12));
            color: rgba(238,242,255,0.94);
            padding: 4px 9px;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .flight-rec-badge {
            padding: 4px 9px;
            color: #dbeafe;
            background: linear-gradient(135deg, rgba(99,102,241,0.28), rgba(14,165,233,0.13));
            border: 1px solid rgba(165,180,252,0.22);
            margin-top: 0;
        }
        .flight-score-pill {
            justify-content: flex-end;
            margin-left: auto;
            padding: 4px 8px;
            color: #c7d2fe;
            background: rgba(129,140,248,0.12);
            border: 1px solid rgba(129,140,248,0.20);
        }
        .flight-score-breakdown-panel {
            border: 1px solid rgba(129,140,248,0.16);
            border-radius: 16px;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.10), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.016)),
                rgba(7,9,15,0.90);
            padding: 13px 14px;
            margin: -2px 0 14px;
            box-shadow: 0 16px 42px rgba(0,0,0,0.14);
        }
        .flight-score-breakdown-title {
            color: rgba(224,231,255,0.92);
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 9px;
        }
        .flight-score-breakdown-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
        }
        .flight-score-breakdown-row {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 13px;
            background: rgba(255,255,255,0.035);
            padding: 10px 11px;
        }
        .flight-score-breakdown-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 5px;
        }
        .flight-score-breakdown-name {
            color: rgba(255,255,255,0.84);
            font-size: 12px;
            font-weight: 850;
        }
        .flight-score-breakdown-score {
            color: #a5b4fc;
            font-size: 12px;
            font-weight: 950;
            white-space: nowrap;
        }
        .flight-score-breakdown-note {
            color: rgba(255,255,255,0.52);
            font-size: 11px;
            line-height: 1.35;
        }
        .flight-price {
            color: #a5b4fc;
            font-size: 27px;
            font-weight: 900;
            letter-spacing: -0.8px;
            text-align: right;
            line-height: 1;
        }
        .flight-price-sub {
            color: rgba(255,255,255,0.36);
            font-size: 11px;
            text-align: right;
            margin-top: 5px;
        }
        .flight-route {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 12px 0;
            border-top: 1px solid rgba(255,255,255,0.06);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            margin-bottom: 11px;
        }
        .flight-time {
            color: #fff;
            font-size: 32px;
            font-weight: 900;
            letter-spacing: -1px;
            line-height: 1;
        }
        .flight-airport {
            color: rgba(255,255,255,0.48);
            font-size: 13px;
            font-weight: 700;
            margin-top: 6px;
        }
        .flight-middle {
            flex: 1;
            text-align: center;
            color: rgba(255,255,255,0.42);
            font-size: 12px;
            line-height: 1.5;
            min-width: 120px;
        }
        .flight-duration {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            color: rgba(255,255,255,0.7);
            font-size: 12px;
            font-weight: 800;
        }
        .flight-duration-line {
            width: 100%;
            height: 1px;
            margin: 6px 0 5px;
            background: linear-gradient(90deg, transparent, rgba(129,140,248,0.52), transparent);
        }
        .flight-stop-status {
            display: inline-flex;
            padding: 4px 9px;
            border-radius: 999px;
            background: rgba(52,211,153,0.1);
            border: 1px solid rgba(52,211,153,0.2);
            color: #6ee7b7;
            font-size: 11px;
            font-weight: 800;
        }
        .flight-chip-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .flight-chip {
            padding: 5px 9px;
            border-radius: 999px;
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.58);
            font-size: 12px;
            font-weight: 700;
        }
        .flight-chip.primary {
            background: rgba(99,102,241,0.13);
            color: #c7d2fe;
        }
        .flight-chip.warning {
            background: rgba(251,191,36,0.09);
            border: 1px solid rgba(251,191,36,0.16);
            color: rgba(253,230,138,0.86);
        }
        .flight-card-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-top: 12px;
        }
        .flight-card-recommendation {
            border: 1px solid rgba(129,140,248,0.18);
            border-radius: 14px;
            background: rgba(99,102,241,0.075);
            padding: 9px 12px;
            margin: 0 0 8px;
        }
        .flight-card-recommendation.compact {
            background: rgba(255,255,255,0.032);
            border-color: rgba(255,255,255,0.08);
            padding: 9px 11px;
        }
        .flight-card-recommendation.compact .flight-card-rec-list {
            font-size: 11px;
            line-height: 1.35;
            color: rgba(255,255,255,0.56);
        }
        .flight-card-recommendation.compact .flight-card-rec-kicker.why {
            margin-top: 6px;
            color: rgba(255,255,255,0.44);
        }
        .flight-card-rec-kicker {
            color: #c7d2fe;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .flight-card-rec-kicker.why {
            margin-top: 6px;
        }
        .flight-card-rec-copy {
            color: rgba(255,255,255,0.86);
            font-size: 12px;
            line-height: 1.35;
            margin-bottom: 4px;
        }
        .flight-card-impact-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
            gap: 5px 10px;
            color: rgba(255,255,255,0.72);
            font-size: 11px;
            line-height: 1.25;
            margin-top: 7px;
        }
        .flight-card-impact-grid span {
            color: rgba(255,255,255,0.48);
        }
        .flight-card-impact-grid strong {
            color: rgba(255,255,255,0.90);
        }
        .flight-card-rec-list {
            color: rgba(255,255,255,0.66);
            font-size: 11px;
            line-height: 1.35;
            margin: 0;
            padding-left: 1rem;
        }
        .flight-card-actions {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .flight-selected-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 92px;
            padding: 8px 14px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 850;
            text-decoration: none !important;
            white-space: nowrap;
        }
        .flight-selected-pill {
            color: #e0e7ff;
            background: rgba(99,102,241,0.25);
            border: 1px solid rgba(165,180,252,0.54);
        }
        .flight-selected-pill::before {
            content: "✓";
            margin-right: 7px;
            color: #86efac;
            font-weight: 950;
        }
        div[data-testid="stExpander"] {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            background: rgba(255,255,255,0.022);
            margin: -2px 0 14px;
            overflow: hidden;
            transition: border-color 0.18s ease, background 0.18s ease;
        }
        div[data-testid="stExpander"]:hover {
            border-color: rgba(129,140,248,0.22);
            background: rgba(255,255,255,0.032);
        }
        @media (max-width: 768px) {
            html,
            body,
            [data-testid="stAppViewContainer"],
            .block-container {
                overflow-x: hidden !important;
                max-width: 100vw !important;
            }
            .block-container {
                padding-top: 0.4rem !important;
            }
            div[data-testid="stVerticalBlock"] {
                gap: 0.45rem !important;
            }
            div[data-testid="stForm"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] {
                border-radius: 15px !important;
                padding: 11px 12px 10px !important;
                margin-bottom: 0.45rem !important;
            }
            .flight-search-shell {
                margin-bottom: 4px !important;
                padding-bottom: 0 !important;
            }
            .flight-search-title {
                font-size: 15px !important;
                margin-bottom: 0 !important;
            }
            .flight-search-subtitle {
                font-size: 11.5px !important;
                line-height: 1.3 !important;
                margin-bottom: 7px !important;
            }
            .flight-search-submit-spacer {
                display: none !important;
                height: 0 !important;
            }
            div[data-testid="stForm"] [data-testid="stHorizontalBlock"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-testid="stHorizontalBlock"] {
                display: block !important;
            }
            div[data-testid="stForm"] [data-testid="column"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-testid="column"] {
                width: 100% !important;
                min-width: 100% !important;
                max-width: 100% !important;
                padding: 0 !important;
                margin-bottom: 7px !important;
            }
            div[data-testid="stForm"] label,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] label {
                font-size: 11px !important;
                line-height: 1.15 !important;
                margin-bottom: 3px !important;
            }
            div[data-testid="stForm"] input,
            div[data-testid="stForm"] textarea,
            div[data-testid="stForm"] [data-baseweb="input"] input,
            div[data-testid="stForm"] [data-baseweb="select"] > div,
            div[data-testid="stForm"] [data-baseweb="base-input"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] input,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"] > div {
                min-height: 36px !important;
                height: 36px !important;
                font-size: 13px !important;
                border-radius: 10px !important;
            }
            div[data-testid="stNumberInput"] button {
                min-height: 32px !important;
                height: 32px !important;
            }
            div[data-testid="stForm"] div[data-testid="stButton"] > button,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] div[data-testid="stButton"] > button {
                min-height: 40px !important;
                height: 40px !important;
                width: 100% !important;
                border-radius: 12px !important;
                font-size: 13px !important;
            }
            .flight-return-toggle {
                margin-top: 0 !important;
            }
            .flight-return-toggle [role="radiogroup"] {
                gap: 4px !important;
                flex-wrap: wrap !important;
            }
            .flight-return-toggle label {
                font-size: 11px !important;
            }
            div[data-testid="stCheckbox"] label,
            div[data-testid="stMultiSelect"] label {
                font-size: 11px !important;
            }
            div[data-testid="stMultiSelect"] [data-baseweb="select"] {
                min-height: 36px !important;
                font-size: 12px !important;
            }
            .flight-status-row {
                gap: 6px !important;
                margin-bottom: 8px !important;
            }
            .flight-status-pill,
            .flight-updated {
                font-size: 10.5px !important;
                line-height: 1.25 !important;
            }
            h4,
            div[data-testid="stMarkdownContainer"] h4 {
                margin-top: 0.45rem !important;
                margin-bottom: 0.35rem !important;
            }
            .flight-destination-hero,
            .flight-destination-hero-content {
                min-height: 190px;
            }
            .flight-destination-hero-content {
                padding: 16px;
            }
            .flight-destination-hero {
                margin: 8px 0 10px;
            }
            .flight-destination-hero.no-image::after,
            .flight-destination-hero.no-image .flight-destination-route-graphic {
                display: none;
            }
            .flight-card-native {
                padding: 16px;
            }
            .flight-card-top {
                align-items: stretch;
                flex-direction: column;
            }
            .flight-price,
            .flight-price-sub {
                text-align: left;
            }
            .flight-route {
                gap: 10px;
            }
            .flight-time {
                font-size: 28px;
            }
            .flight-middle {
                min-width: 92px;
            }
            .flight-card-footer {
                align-items: flex-start;
                flex-direction: column;
                padding-right: 0;
                min-height: 0;
            }
            .flight-card-impact-grid {
                grid-template-columns: 1fr;
            }
            .flight-score-breakdown-grid {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 480px) {
            div[data-testid="stForm"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] {
                padding: 10px !important;
                border-radius: 14px !important;
            }
            .flight-search-title {
                font-size: 14px !important;
            }
            .flight-search-subtitle {
                font-size: 11px !important;
            }
            div[data-testid="stForm"] input,
            div[data-testid="stForm"] [data-baseweb="select"] > div,
            div[data-testid="stForm"] [data-baseweb="base-input"],
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] input,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] [data-baseweb="select"] > div {
                min-height: 34px !important;
                height: 34px !important;
                font-size: 12px !important;
            }
            div[data-testid="stForm"] div[data-testid="stButton"] > button,
            div[data-testid="stElementContainer"] > div[data-testid="stVerticalBlockBorderWrapper"] div[data-testid="stButton"] > button {
                min-height: 38px !important;
                height: 38px !important;
            }
            .flight-destination-hero,
            .flight-destination-hero-content {
                min-height: 170px;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    search_state = st.session_state.setdefault(
        "flight_search",
        {
            "origin_city": "San Francisco",
            "destination_city": "Tokyo",
            "departure_date": "2026-10-14",
            "return_date": "2026-10-24",
            "adults": 1,
            "cabin_class": "economy",
            "nonstop_only": False,
            "return_mode": "Same as destination",
            "return_origin_city": "Tokyo",
            "priorities": DEFAULT_PRIORITIES,
        },
    )
    if "origin_city" not in search_state:
        search_state["origin_city"] = search_state.get("origin", "San Francisco")
    if "destination_city" not in search_state:
        search_state["destination_city"] = search_state.get("destination", "Tokyo")
    if "return_mode" not in search_state:
        search_state["return_mode"] = "Same as destination"
    if "return_origin_city" not in search_state:
        search_state["return_origin_city"] = search_state.get("destination_city", "Tokyo")
    search_state["departure_date"] = _as_iso_date(search_state.get("departure_date") or "2026-10-14")
    search_state["return_date"] = _as_iso_date(search_state.get("return_date") or "2026-10-24")
    safe_adults_default, _adult_default_error = _validate_traveler_count(search_state.get("adults", 1))
    safe_cabin_default, _cabin_default_error = _validate_cabin_class(search_state.get("cabin_class", "economy"))
    safe_adults_default = safe_adults_default or 1
    safe_cabin_default = safe_cabin_default or "economy"
    feedback_cache = st.session_state.get("flight_results_cache") or {}
    feedback_offers = list(feedback_cache.get("ranked_flights") or feedback_cache.get("raw_offers") or [])
    feedback_offer = feedback_offers[0] if feedback_offers else None
    feedback_ranking = feedback_cache.get("ranking_output") or {}
    feedback_recommendations = feedback_ranking.get("recommendations") or {}
    feedback_recommendation = (
        feedback_recommendations.get(_flight_key(feedback_offer), {})
        if feedback_offer
        else {}
    )
    feedback_priorities = _validate_priorities(
        st.session_state.get("flight_priority_selector")
        or search_state.get("priorities")
        or st.session_state.get("flight_priorities")
        or DEFAULT_PRIORITIES
    )
    _render_byable_feedback_form(
        feedback_offer,
        feedback_recommendation,
        _clean_city_input(search_state.get("origin_city") or "San Francisco") or "San Francisco",
        _clean_city_input(search_state.get("destination_city") or "Tokyo") or "Tokyo",
        feedback_priorities,
        bool(feedback_offers),
    )

    with st.container(border=True):
        st.markdown(
            """
            <div class="flight-search-shell">
                <div class="flight-search-title">Find your flight</div>
                <div class="flight-search-subtitle">Search by city. Byable checks nearby airports automatically.</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        col_origin, col_destination, col_departure, col_return, col_adults, col_cabin, col_submit = st.columns(
            [1.25, 1.25, 1, 1, 0.8, 1.05, 0.95]
        )
        with col_origin:
            origin_city = st.text_input("From city", value=search_state["origin_city"], placeholder="San Francisco")
        with col_destination:
            destination_city = st.text_input("To city", value=search_state["destination_city"], placeholder="Tokyo")
        with col_departure:
            departure_date = st.text_input("Depart date", value=search_state["departure_date"], help="Use YYYY-MM-DD.")
        with col_return:
            return_date = st.text_input("Return date", value=search_state["return_date"], help="Use YYYY-MM-DD.")
        with col_adults:
            adults = st.number_input("Travelers", min_value=1, max_value=MAX_TRAVELERS, value=safe_adults_default, step=1)
        with col_cabin:
            cabin_class = st.selectbox(
                "Cabin",
                list(ALLOWED_CABIN_CLASSES),
                index=list(ALLOWED_CABIN_CLASSES).index(safe_cabin_default),
                format_func=lambda value: value.replace("_", " ").title(),
            )
        with col_submit:
            st.markdown('<div class="flight-search-submit-spacer"></div>', unsafe_allow_html=True)
            submitted = st.button("Search flights", type="primary")

        st.markdown('<div class="flight-return-toggle">', unsafe_allow_html=True)
        return_mode = st.radio(
            "Returning from a different city?",
            ["Same as destination", "Different city"],
            index=0 if search_state.get("return_mode", "Same as destination") == "Same as destination" else 1,
            horizontal=True,
        )
        st.markdown("</div>", unsafe_allow_html=True)
        if return_mode == "Different city":
            return_origin_city = st.text_input(
                "Return from city",
                value=search_state.get("return_origin_city") or destination_city,
                placeholder="Osaka",
            )
        else:
            return_origin_city = destination_city

        nonstop_only = st.checkbox("Nonstop only", value=bool(search_state.get("nonstop_only", False)))
        priority_selection = st.multiselect(
            "What matters most?",
            TRAVELER_PRIORITIES,
            default=[
                priority
                for priority in (
                    st.session_state.get("flight_priority_selector")
                    or search_state.get("priorities")
                    or st.session_state.get("flight_priorities")
                    or DEFAULT_PRIORITIES
                )
                if priority in TRAVELER_PRIORITIES
            ][:3],
            key="flight_priority_selector",
            help="Choose up to 3. These priorities rank results and shape recommendations.",
        )
        if len(priority_selection) > 3:
            st.warning("Choose up to 3 priorities. Byable will use the first three selected.")
        selected_priorities_from_form = _validate_priorities(priority_selection or DEFAULT_PRIORITIES)
        priority_key = tuple(selected_priorities_from_form)
        if st.session_state.get("_last_tracked_flight_priorities") != priority_key:
            track_event("priority_selected", {"priorities": list(selected_priorities_from_form)})
            st.session_state["_last_tracked_flight_priorities"] = priority_key

    if submitted:
        _print_ai_status()
        click_props = {
            "origin_city": str(origin_city or "").strip(),
            "destination_city": str(destination_city or "").strip(),
            "depart_date": str(departure_date or "").strip(),
            "return_date": str(return_date or "").strip(),
            "travelers": int(adults or 0),
            "cabin": str(cabin_class or "").strip(),
            "selected_priorities": list(selected_priorities_from_form),
        }
        track_event("flight_search_clicked", click_props)
        validation_errors = []
        rate_limit_error = None
        origin_city_clean, origin_error = _validate_city_input(origin_city, "From city")
        destination_city_clean, destination_error = _validate_city_input(destination_city, "To city")
        if return_mode == "Same as destination":
            return_origin_city_clean = destination_city_clean
            return_error_city = None
        else:
            return_origin_city_clean, return_error_city = _validate_city_input(return_origin_city, "Return from city")
        adults_clean, adults_error = _validate_traveler_count(adults)
        cabin_class_clean, cabin_error = _validate_cabin_class(cabin_class)
        departure_iso, departure_error = _validate_iso_date(departure_date, "Depart")
        return_iso, return_error = _validate_iso_date(return_date, "Return")
        validation_errors.extend(
            error
            for error in (
                origin_error,
                destination_error,
                return_error_city,
                adults_error,
                cabin_error,
                departure_error,
                return_error,
            )
            if error
        )
        if not validation_errors and datetime.strptime(return_iso, ISO_DATE_FORMAT).date() < datetime.strptime(departure_iso, ISO_DATE_FORMAT).date():
            validation_errors.append("Return date must be on or after the departure date.")
        if not validation_errors:
            search_allowed, search_wait = _rate_limit_action("flight_search_rate_limit", FLIGHT_SEARCH_RATE_LIMIT_SECONDS)
            if not search_allowed:
                rate_limit_error = f"Please wait {search_wait:.0f}s before searching again."
        if validation_errors or rate_limit_error:
            message = validation_errors[0] if validation_errors else rate_limit_error
            if validation_errors:
                track_event(
                    "flight_search_validation_failed",
                    {
                        "validation_error": message,
                        "origin_city": click_props["origin_city"],
                        "destination_city": click_props["destination_city"],
                        "depart_date": click_props["depart_date"],
                        "return_date": click_props["return_date"],
                        "travelers": click_props["travelers"],
                        "cabin": click_props["cabin"],
                    },
                )
            else:
                track_event(
                    "flight_search_rate_limited",
                    {
                        "origin_city": click_props["origin_city"],
                        "destination_city": click_props["destination_city"],
                        "depart_date": click_props["depart_date"],
                        "return_date": click_props["return_date"],
                        "travelers": click_props["travelers"],
                        "cabin": click_props["cabin"],
                        "selected_priorities": click_props["selected_priorities"],
                        "rate_limit_seconds": FLIGHT_SEARCH_RATE_LIMIT_SECONDS,
                    },
                )
            st.session_state["flight_debug"] = {
                "status": "validation_error",
                "message": message,
                "duffel_key_loaded": None,
            }
            st.error(message)
            submitted = False
        else:
            selected_priorities = selected_priorities_from_form
            st.session_state["flight_search"] = {
                "origin_city": origin_city_clean,
                "destination_city": destination_city_clean,
                "departure_date": departure_iso,
                "return_date": return_iso,
                "adults": adults_clean,
                "cabin_class": cabin_class_clean,
                "nonstop_only": bool(nonstop_only),
                "return_mode": return_mode,
                "return_origin_city": return_origin_city_clean or destination_city_clean,
                "priorities": selected_priorities,
            }
            st.session_state["trip_destination"] = destination_city_clean
            st.session_state["selected_flight_index"] = 0
            st.session_state["show_more_flights"] = False
            search_state = st.session_state["flight_search"]
            track_event(
                "flight_search_started",
                {
                    "origin_city": search_state["origin_city"],
                    "destination_city": search_state["destination_city"],
                    "return_origin_city": search_state["return_origin_city"],
                    "return_mode": search_state["return_mode"],
                    "departure_date": search_state["departure_date"],
                    "return_date": search_state["return_date"],
                    "adults": search_state["adults"],
                    "cabin_class": search_state["cabin_class"],
                    "nonstop_only": search_state["nonstop_only"],
                    "priorities": search_state["priorities"],
                },
            )

    origin_city = _clean_city_input(search_state.get("origin_city") or "San Francisco") or "San Francisco"
    destination_city = _clean_city_input(search_state.get("destination_city") or "Tokyo") or "Tokyo"
    return_mode = str(search_state.get("return_mode") or "Same as destination")
    if return_mode not in ("Same as destination", "Different city"):
        return_mode = "Same as destination"
    return_origin_city = _clean_city_input(search_state.get("return_origin_city") or destination_city) or destination_city
    if return_mode == "Same as destination":
        return_origin_city = destination_city
    origin_label, origin_airports = _resolve_city_airports(origin_city)
    destination_label, destination_airports = _resolve_city_airports(destination_city)
    return_origin_label, return_origin_airports = _resolve_city_airports(return_origin_city)
    departure_iso = _as_iso_date(search_state["departure_date"])
    return_iso = _as_iso_date(search_state["return_date"])
    adults, _adults_error = _validate_traveler_count(search_state.get("adults", 1))
    adults = adults or 1
    cabin_class, _cabin_error = _validate_cabin_class(search_state.get("cabin_class", "economy"))
    cabin_class = cabin_class or "economy"
    priorities = _validate_priorities(
        st.session_state.get("flight_priority_selector")
        or search_state.get("priorities")
        or st.session_state.get("flight_priorities")
        or DEFAULT_PRIORITIES
    )
    nonstop_only = bool(search_state.get("nonstop_only", False))
    departure_iso, departure_error = _validate_iso_date(departure_iso, "Depart")
    return_iso, return_error = _validate_iso_date(return_iso, "Return")
    active_search_params = _search_params_key(search_state, return_origin_city)
    cache = st.session_state.get("flight_results_cache") or {}
    cached_search_params = cache.get("search_params")
    perf_timings = {"duffel": 0.0, "normalize": 0.0, "rank": 0.0, "recommendation": 0.0, "details": 0.0}
    search_to_results_start = time.perf_counter() if submitted else None
    if departure_error or return_error:
        debug_payload = {
            "status": "validation_error",
            "message": departure_error or return_error,
            "duffel_key_loaded": None,
        }
        offers, live = [], False
    elif datetime.strptime(return_iso, ISO_DATE_FORMAT).date() < datetime.strptime(departure_iso, ISO_DATE_FORMAT).date():
        debug_payload = {
            "status": "validation_error",
            "message": "Return date must be on or after the departure date.",
            "duffel_key_loaded": None,
        }
        offers, live = [], False
    elif not submitted:
        if cached_search_params == active_search_params:
            offers = list(cache.get("raw_offers") or [])
            live = bool(cache.get("live"))
            debug_payload = cache.get("debug_payload") or {"status": "ok", "message": None}
        else:
            offers, live = [], False
            debug_payload = {"status": "idle", "message": "Search flights to see live fares."}
    else:
        loading_placeholder = st.empty()
        loading_placeholder.markdown(
            """
            <h4 style="margin-bottom: 10px;">Flight options</h4>
            <div class="flight-loading-card">
                <div class="flight-loading-title">Searching live fares</div>
                <div class="flight-loading-steps">
                    <div class="flight-loading-step"><span class="flight-loading-dot"></span>Searching live fares</div>
                    <div class="flight-loading-step"><span class="flight-loading-dot"></span>Ranking flights against your priorities</div>
                    <div class="flight-loading-step"><span class="flight-loading-dot"></span>Building Byable recommendation</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        search_start = time.perf_counter()
        offers, live, debug_payload = load_city_flight_offers(
            origin_city,
            destination_city,
            departure_iso,
            return_iso,
            adults,
            cabin_class,
            20,
            return_origin_city=return_origin_city,
        )
        print(f"[Byable Flights] duffel_search_time={time.perf_counter() - search_start:.3f}s offers={len(offers)}")
        debug_timing = debug_payload.get("timing") or {}
        perf_timings["duffel"] = float(debug_timing.get("duffel") or 0)
        perf_timings["normalize"] = float(debug_timing.get("normalize") or 0)
        if offers:
            track_event(
                "flight_search_completed",
                {
                    "origin_city": origin_city,
                    "destination_city": destination_city,
                    "return_origin_city": return_origin_city,
                    "offer_count": len(offers),
                    "live": bool(live),
                    "duffel_seconds": perf_timings["duffel"],
                    "normalize_seconds": perf_timings["normalize"],
                    "attempts": (debug_payload.get("timing") or {}).get("attempts"),
                },
            )
        else:
            track_event(
                "flight_search_no_fares",
                {
                    "origin_city": origin_city,
                    "destination_city": destination_city,
                    "return_origin_city": return_origin_city,
                    "status": (debug_payload or {}).get("status"),
                    "message": (debug_payload or {}).get("message"),
                    "attempts": (debug_payload.get("timing") or {}).get("attempts"),
                },
            )
            track_event(
                "no_fares_found",
                {
                    "origin": origin_city,
                    "destination": destination_city,
                    "return_origin_city": return_origin_city,
                    "status": (debug_payload or {}).get("status"),
                },
            )
        loading_placeholder.empty()
        st.session_state["flight_results_cache"] = {
            "search_params": active_search_params,
            "raw_offers": list(offers),
            "normalized_flights": list(offers),
            "live": bool(live),
            "debug_payload": debug_payload,
            "search_timestamp": datetime.now().isoformat(timespec="seconds"),
            "perf_timings": dict(perf_timings),
        }
    st.session_state["flight_debug"] = debug_payload
    filtered_offers = _apply_flight_filters(offers, nonstop_only=nonstop_only)
    ranking_cache = st.session_state.get("flight_ranking_cache") or {}
    ranking_params = {
        "search_params": active_search_params,
        "priorities": list(priorities),
        "nonstop_only": bool(nonstop_only),
        "offer_ids": [_flight_key(offer) for offer in filtered_offers],
    }
    if ranking_cache.get("ranking_params") == ranking_params:
        ranking_output = ranking_cache.get("ranking_output") or {}
    else:
        ranking_output = _rank_flight_results(filtered_offers, priorities)
        perf_timings["rank"] = float((ranking_output.get("timing") or {}).get("rank") or 0)
        st.session_state["flight_ranking_cache"] = {
            "ranking_params": ranking_params,
            "ranking_output": ranking_output,
        }
    offers = list(ranking_output.get("ranked_flights") or [])
    if "flight_results_cache" in st.session_state:
        st.session_state["flight_results_cache"]["ranked_flights"] = list(offers)
        st.session_state["flight_results_cache"]["selected_priorities"] = list(priorities)
        st.session_state["flight_results_cache"]["recommended_flight_id"] = ranking_output.get("recommended_flight_id", "")
        st.session_state["flight_results_cache"]["recommendation_summary"] = ranking_output.get("recommendation_summary", "")
        st.session_state["flight_results_cache"]["why_over_options"] = list(ranking_output.get("why_over_options") or [])
        st.session_state["flight_results_cache"]["ranking_output"] = ranking_output

    selected_index = min(int(st.session_state.get("selected_flight_index", 0)), max(0, len(offers) - 1))
    if offers and "selected_flight" not in st.session_state:
        st.session_state["selected_flight"] = {**offers[selected_index], "adults": adults}
    if not offers:
        st.session_state.pop("selected_flight", None)

    selected_key = st.session_state.get("selected_flight_id") or _flight_key(st.session_state.get("selected_flight") or {})
    if offers:
        offer_keys = [_flight_key(offer) for offer in offers]
        if selected_key in offer_keys:
            selected_index = offer_keys.index(selected_key)
            st.session_state["selected_flight"] = {**offers[selected_index], "adults": adults}
            st.session_state["selected_flight_index"] = selected_index
            st.session_state["selected_flight_id"] = selected_key
        else:
            selected_index = min(selected_index, len(offers) - 1)
            st.session_state["selected_flight"] = {**offers[selected_index], "adults": adults}
            st.session_state["selected_flight_index"] = selected_index
            st.session_state["selected_flight_id"] = _flight_key(offers[selected_index])
    else:
        st.session_state.pop("selected_flight", None)

    api_status = _api_status(debug_payload, live, offers)
    date_label = f"{departure_iso} → {return_iso}"
    traveler_label = f"{adults} {'traveler' if adults == 1 else 'travelers'}"
    pill_class = "" if offers else " warn"
    if return_mode == "Different city":
        route_label = f"{origin_label} → {destination_label} · {return_origin_label} → {origin_label}"
    else:
        route_label = f"{origin_label} → {destination_label} → {origin_label}"
    airport_resolution_label = (
        (debug_payload or {}).get("searched_airport_label")
        or _airport_resolution_label(
            origin_airports,
            destination_airports,
            return_origin_airports,
            open_jaw=return_mode == "Different city",
        )
    )
    has_searched_for_current_route = submitted or cached_search_params == active_search_params
    if has_searched_for_current_route and offers:
        display_route = f"{origin_label} → {destination_label}"
        hero_image = _destination_hero_image(destination_label)
        hero_class = "flight-destination-hero" if hero_image else "flight-destination-hero no-image"
        hero_style = (
            f"background-image: url('{html.escape(hero_image)}');"
            if hero_image
            else "background-image: radial-gradient(circle at top left, rgba(129,140,248,0.30), transparent 36%), linear-gradient(135deg, rgba(15,23,42,0.96), rgba(49,46,129,0.55));"
        )
        cabin_label = cabin_class.replace("_", " ").title()
        st.markdown(
            f"""
            <section class="{hero_class}" style="{hero_style}">
                <div class="flight-destination-hero-content">
                    <div class="flight-destination-route-graphic">
                        <span>{html.escape(origin_label)}</span>
                        <span class="flight-destination-plane">✈</span>
                        <span>{html.escape(destination_label)}</span>
                    </div>
                    <div class="flight-destination-kicker">Your trip starts here</div>
                    <div class="flight-destination-title">{html.escape(destination_label)}</div>
                    <div class="flight-destination-route">{html.escape(display_route)}</div>
                    <div class="flight-destination-meta">
                        <span>{html.escape(departure_iso)} → {html.escape(return_iso)}</span>
                        <span>{html.escape(traveler_label)}</span>
                        <span>{html.escape(cabin_label)}</span>
                    </div>
                    <div class="flight-destination-insights">
                        <span>City-based search</span>
                        <span>AI-ranked flights</span>
                        <span>Comfort + airport insights</span>
                    </div>
                </div>
            </section>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("#### Flight options")
    st.markdown(
        f"""
        <div class="flight-status-row">
            <span class="flight-status-pill{pill_class}">{html.escape(api_status)}</span>
            <span class="flight-updated">Updated just now</span>
            <span class="flight-updated">{html.escape(route_label)} · Searched airports/cities: {html.escape(airport_resolution_label)} · {html.escape(date_label)} · {html.escape(traveler_label)}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if not offers:
        status = str((debug_payload or {}).get("status") or "").lower()
        if status == "not_configured":
            empty_title = "Duffel key missing"
            empty_message = "Duffel API key not configured."
        elif status == "idle":
            st.markdown(
                """
                <div class="flight-presearch-card">
                    <div class="flight-presearch-kicker">Before you search</div>
                    <div class="flight-presearch-title">Ready to find smarter flights</div>
                    <div class="flight-presearch-subtitle">
                        Search live fares and Byable will explain the tradeoffs, not just list options.
                    </div>
                    <div class="flight-presearch-benefits">
                        <span class="flight-presearch-benefit"><span class="flight-presearch-dot"></span>Real-time fares</span>
                        <span class="flight-presearch-benefit"><span class="flight-presearch-dot"></span>AI flight reasoning</span>
                        <span class="flight-presearch-benefit"><span class="flight-presearch-dot"></span>Airport + comfort insights</span>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            empty_title = ""
            empty_message = ""
        elif status == "ok":
            empty_title = "No fares found"
            empty_message = (
                (debug_payload or {}).get("message")
                or "No live fares found for these dates. Try changing the date, destination airport, or cabin."
            )
        else:
            empty_title = "Duffel API error"
            empty_message = (debug_payload or {}).get("message") or "Duffel is unavailable right now."
        if empty_title:
            st.info(f"{empty_title}: {empty_message}")
        total_time = time.perf_counter() - search_to_results_start if search_to_results_start else 0
        cached_perf = (st.session_state.get("flight_results_cache") or {}).get("perf_timings") or {}
        print(
            "BYABLE PERF:\n"
            f"Duffel search: {float(cached_perf.get('duffel') or perf_timings['duffel']):.2f}s\n"
            f"Normalize: {float(cached_perf.get('normalize') or perf_timings['normalize']):.2f}s\n"
            f"Rank: {perf_timings['rank']:.2f}s\n"
            f"Recommendation: 0.00s\n"
            f"Details: 0.00s\n"
            f"Total: {total_time:.2f}s"
        )
        return

    priority_selection = st.session_state.get("flight_priority_selector") or priorities
    selected_priorities = _validate_priorities(priority_selection or DEFAULT_PRIORITIES)
    if selected_priorities != priorities:
        priorities = selected_priorities
        filtered_offers = _apply_flight_filters(list((st.session_state.get("flight_results_cache") or {}).get("raw_offers") or []), nonstop_only=nonstop_only)
        ranking_output = _rank_flight_results(filtered_offers, priorities)
        perf_timings["rank"] = float((ranking_output.get("timing") or {}).get("rank") or 0)
        st.session_state["flight_ranking_cache"] = {
            "ranking_params": {
                "search_params": active_search_params,
                "priorities": list(priorities),
                "nonstop_only": bool(nonstop_only),
                "offer_ids": [_flight_key(offer) for offer in filtered_offers],
            },
            "ranking_output": ranking_output,
        }
        offers = list(ranking_output.get("ranked_flights") or [])
        if "flight_results_cache" in st.session_state:
            st.session_state["flight_results_cache"]["ranked_flights"] = list(offers)
            st.session_state["flight_results_cache"]["selected_priorities"] = list(priorities)
            st.session_state["flight_results_cache"]["recommended_flight_id"] = ranking_output.get("recommended_flight_id", "")
            st.session_state["flight_results_cache"]["recommendation_summary"] = ranking_output.get("recommendation_summary", "")
            st.session_state["flight_results_cache"]["why_over_options"] = list(ranking_output.get("why_over_options") or [])
            st.session_state["flight_results_cache"]["ranking_output"] = ranking_output
    st.session_state["flight_priorities"] = priorities
    search_state["priorities"] = priorities

    show_more_flights = bool(st.session_state.get("show_more_flights"))
    visible_offers = offers if show_more_flights else offers[:8]
    recommendation_start = time.perf_counter()
    recommendations = ranking_output.get("recommendations") or _recommendation_map(visible_offers, priorities)
    best_offer = max(visible_offers, key=lambda offer: recommendations.get(_flight_key(offer), {}).get("score", 0))
    best_rec = recommendations.get(_flight_key(best_offer), {})
    recommendation_summary = (
        ranking_output.get("recommendation_summary")
        or _recommendation_summary(best_offer, best_rec, priorities)
    )
    perf_timings["recommendation"] = time.perf_counter() - recommendation_start
    advisor_bullets = ranking_output.get("why_over_options") or _why_over_others(best_offer, visible_offers, recommendations)
    best_impact = _trip_impact(best_offer, visible_offers)
    visible_prices = [float(offer.get("price_total") or 0) for offer in visible_offers if float(offer.get("price_total") or 0) > 0]
    visible_durations = [_duration_minutes(offer.get("duration")) for offer in visible_offers]
    visible_durations = [duration for duration in visible_durations if duration and duration > 0]
    best_price = float(best_offer.get("price_total") or 0)
    best_duration = _duration_minutes(best_offer.get("duration")) or 0
    cheapest_offer = min(
        visible_offers,
        key=lambda offer: (float(offer.get("price_total") or 999999), _duration_minutes(offer.get("duration")) or 999999),
    )
    fastest_offer = min(
        visible_offers,
        key=lambda offer: (_duration_minutes(offer.get("duration")) or 999999, float(offer.get("price_total") or 999999)),
    )
    top_ranked_summaries = [_ai_flight_summary(offer, recommendations) for offer in visible_offers[:4]]
    ai_comparison_context = {
        "search_params": active_search_params,
        "why_over_options": advisor_bullets,
        "is_cheapest": _is_lowest_priced(best_offer, visible_offers),
        "is_fastest": bool(visible_durations and best_duration > 0 and best_duration <= min(visible_durations) + 30),
        "return_route": (
            f"{return_origin_label} -> {origin_label}"
            if return_mode == "Different city"
            else f"{destination_label} -> {origin_label}"
        ),
        "recommended_flight": _ai_flight_summary(best_offer, recommendations),
        "next_best_alternative": top_ranked_summaries[1] if len(top_ranked_summaries) > 1 else None,
        "third_best_alternative": top_ranked_summaries[2] if len(top_ranked_summaries) > 2 else None,
        "fourth_best_alternative": top_ranked_summaries[3] if len(top_ranked_summaries) > 3 else None,
        "cheapest_flight": _ai_flight_summary(cheapest_offer, recommendations),
        "fastest_flight": _ai_flight_summary(fastest_offer, recommendations),
        "top_ranked_flights": top_ranked_summaries,
    }
    ai_advisor_copy = generate_ai_advisor_copy(best_offer, best_impact, priorities, ai_comparison_context)
    if ai_advisor_copy:
        recommendation_summary = ai_advisor_copy.get("recommended_summary") or recommendation_summary
        advisor_bullets = ai_advisor_copy.get("why_this") or advisor_bullets
        if _flight_key(best_offer) in recommendations:
            recommendations[_flight_key(best_offer)] = {
                **recommendations[_flight_key(best_offer)],
                "ai_advisor_copy": ai_advisor_copy,
            }
    track_once(
        "ai_recommendation_loaded",
        key=f"ai_recommendation_loaded_{active_search_params}_{_flight_key(best_offer)}",
        properties={
            "flight_id": _flight_key(best_offer),
            "airline": best_offer.get("airline"),
            "flight_number": best_offer.get("flight_number"),
            "score": best_rec.get("score"),
            "ai_copy_used": bool(ai_advisor_copy),
            "offer_count": len(visible_offers),
        },
    )
    detail_modal_key = st.session_state.get("selected_flight_for_details", "")

    for index, offer in enumerate(visible_offers):
        is_selected = index == selected_index
        is_recommended = _flight_key(offer) == _flight_key(best_offer)
        card_class = "flight-card-native"
        if is_selected:
            card_class += " selected"
        if is_recommended:
            card_class += " recommended"
        else:
            card_class += " compact"
        airline_code = html.escape(str(offer.get("airline_code") or "AIR")[:3].upper())
        flight_number = html.escape(_display_flight_number(offer))
        recommendation = recommendations.get(_flight_key(offer), {"label": "Best value", "score": 75, "why": "This balances price, routing, timing, and flexibility."})
        badge_html = "".join(
            f'<span class="flight-rec-badge">{html.escape(badge)}</span>'
            for badge in _card_badges(offer, visible_offers, recommendations)
        )
        if not badge_html:
            badge_html = f'<span class="flight-rec-badge">{html.escape(str(recommendation.get("label") or "Best value"))}</span>'
        byable_recommended_label = (
            '<div class="flight-byable-recommended-label">Recommended by Byable</div>'
            if is_recommended
            else ""
        )
        score = html.escape(str(recommendation.get("score") or 75))
        if return_mode == "Different city":
            airport_context = (
                f"Outbound: {origin_label} → {destination_label} · "
                f"Return: {return_origin_label} → {origin_label}"
            )
        else:
            airport_context = f"{origin_label} → {destination_label}"
        cabin_chip = html.escape(str(offer.get("cabin") or "Economy"))
        detail_chips = [
            "Round trip",
            html.escape(airport_context),
            cabin_chip,
            html.escape(str(offer.get("currency") or "USD")),
        ]
        if return_mode == "Different city":
            detail_chips.insert(1, "Open-jaw return")
        if offer.get("baggage"):
            detail_chips.append(f"Baggage: {html.escape(str(offer.get('baggage')))}")
        chips_html = "".join(
            f'<span class="flight-chip{" primary" if chip == cabin_chip else ""}">{chip}</span>'
            for chip in detail_chips
            if chip
        )
        if not is_recommended:
            warning_chip = _watch_out_chip_text(offer, visible_offers)
            if warning_chip:
                chips_html += f'<span class="flight-chip warning">Watch out: {html.escape(warning_chip)}</span>'
        impact = _trip_impact(offer, visible_offers)
        impact_rows = [
            ("Arrival Timing", impact["arrival_timing"]),
            ("Jet lag", impact["jet_lag"]),
            ("Fatigue", impact["travel_fatigue"]),
        ]
        if impact.get("city_access"):
            impact_rows.append(("City Access", impact["city_access"]))
        if impact.get("aircraft_comfort"):
            aircraft_type = impact.get("aircraft_type")
            aircraft_value = impact["aircraft_comfort"]
            if aircraft_type:
                aircraft_value = f'{aircraft_value}<br><span>({html.escape(str(aircraft_type))})</span>'
            impact_rows.append(("Aircraft Comfort Estimate", aircraft_value))
        impact_html = "".join(
            f'<div><span>{html.escape(label)}:</span> <strong>{value if label == "Aircraft Comfort Estimate" else html.escape(value)}</strong></div>'
            for label, value in impact_rows
        )
        aircraft_inline = impact.get("aircraft_comfort") or "Unknown"
        impact_inline_html = "".join(
            [
                '<div class="flight-impact-inline">',
                f'<span>Arrival: <strong>{html.escape(str(impact["arrival_timing"]))}</strong></span>',
                f'<span>Jet lag: <strong>{html.escape(str(impact["jet_lag"]))}</strong></span>',
                f'<span>Fatigue: <strong>{html.escape(str(impact["travel_fatigue"]))}</strong></span>',
                f'<span>City access: <strong>{html.escape(str(impact.get("city_access") or "Unknown"))}</strong></span>',
                f'<span>Comfort: <strong>{html.escape(str(aircraft_inline))}</strong></span>',
                "</div>",
            ]
        )
        impact_reason_source = (
            (recommendation.get("ai_advisor_copy") or {}).get("trip_impact_why")
            if is_recommended
            else None
        )
        comfort_reason = next(
            (
                reason
                for reason in impact["reasons"]
                if any(term in reason.lower() for term in ("comfort", "widebody", "narrowbody", "aircraft type"))
            ),
            "",
        )
        jet_lag_reason = next(
            (
                reason
                for reason in impact["reasons"]
                if any(term in reason.lower() for term in ("jet lag", "body-clock", "timezone"))
            ),
            "",
        )
        fatigue_reason = next(
            (
                reason
                for reason in impact["reasons"]
                if "travel fatigue" in reason.lower()
            ),
            "",
        )
        priority_reasons = [reason for reason in (jet_lag_reason, fatigue_reason, comfort_reason) if reason]
        fallback_reasons = priority_reasons + [
            reason for reason in impact["reasons"] if reason not in priority_reasons
        ]
        if impact_reason_source:
            source_terms = " ".join(str(reason).lower() for reason in impact_reason_source)
            if jet_lag_reason and not any(term in source_terms for term in ("jet lag", "body-clock", "timezone")):
                impact_reason_source = [jet_lag_reason] + list(impact_reason_source)
            source_terms = " ".join(str(reason).lower() for reason in impact_reason_source)
            if fatigue_reason and "travel fatigue" not in source_terms:
                impact_reason_source = [fatigue_reason] + list(impact_reason_source)
            source_terms = " ".join(str(reason).lower() for reason in impact_reason_source)
            if comfort_reason and not any(term in source_terms for term in ("comfort", "widebody", "narrowbody", "aircraft type")):
                impact_reason_source = [comfort_reason] + list(impact_reason_source)
        impact_reason_source = impact_reason_source or fallback_reasons
        impact_reason_limit = 3 if is_recommended else 2
        impact_bullets = "".join(
            f"<li>{html.escape(bullet)}</li>"
            for bullet in impact_reason_source[:impact_reason_limit]
        )
        if is_recommended:
            trip_impact_html = ""
        else:
            trip_impact_html = impact_inline_html
        watch_out_source = (
            (recommendation.get("ai_advisor_copy") or {}).get("watch_out")
            if is_recommended
            else None
        ) or _watch_out_copy(offer, visible_offers)
        watch_out_source = _clean_watch_out_items(watch_out_source, offer, visible_offers)
        watch_out_items = "".join(
            f"<li>{html.escape(item)}</li>"
            for item in watch_out_source[:2]
        )
        watch_out_html = ""
        meaningful_watch_out = [
            item for item in watch_out_source[:2]
            if "no major downside" not in str(item).lower()
        ]
        if is_recommended and meaningful_watch_out:
            watch_out_items = "".join(
                f"<li>{html.escape(item)}</li>"
                for item in meaningful_watch_out
            )
            watch_out_html = "".join(
                [
                    '<div class="flight-card-recommendation compact">',
                    '<div class="flight-card-rec-kicker">Watch out</div>',
                    f'<ul class="flight-card-rec-list">{watch_out_items}</ul>',
                    "</div>",
                ]
            )
        recommendation_html = ""
        if is_recommended:
            bullet_html = "".join(
                f"<li>{html.escape(bullet)}</li>"
                for bullet in advisor_bullets[:3]
            )
            trip_impact_bullet_html = "".join(
                f"<li>{html.escape(bullet)}</li>"
                for bullet in impact_reason_source[:2]
                if bullet
            )
            recommendation_html = "".join(
                [
                    '<div class="flight-card-recommendation">',
                    '<div class="flight-card-rec-kicker">Recommended flight</div>',
                    f'<div class="flight-card-rec-copy">{html.escape(recommendation_summary)}</div>',
                    '<div class="flight-card-rec-kicker why">Why this</div>',
                    f'<ul class="flight-card-rec-list">{bullet_html}</ul>',
                    f'<div class="flight-card-impact-grid">{impact_html}</div>',
                    f'<ul class="flight-card-rec-list">{trip_impact_bullet_html}</ul>' if trip_impact_bullet_html else "",
                    "</div>",
                ]
            )
        card_html = "".join(
            [
                f'<div class="{card_class}">',
                '<div class="flight-card-top">',
                '<div class="flight-airline-wrap">',
                f'<div class="flight-logo">{airline_code}</div>',
                "<div>",
                byable_recommended_label,
                f'<div class="flight-airline">{html.escape(str(offer.get("airline") or "Airline"))}</div>',
                f'<div class="flight-number">{flight_number} · Duffel test fare</div>',
                f'<div class="flight-rec-row">{badge_html}</div>',
                "</div>",
                "</div>",
                "<div>",
                f'<div class="flight-price">{money_usd(offer.get("price_total"))}</div>',
                f'<div class="flight-price-sub">total · {html.escape(str(offer.get("currency") or "USD"))}</div>',
                f'<div class="flight-score-pill">AI Score: {score}</div>',
                "</div>",
                "</div>",
                '<div class="flight-route">',
                "<div>",
                f'<div class="flight-time">{html.escape(str(offer.get("depart_time") or "--:--"))}</div>',
                f'<div class="flight-airport">{html.escape(str(offer.get("origin") or origin_airports[0]))}</div>',
                "</div>",
                '<div class="flight-middle">',
                f'<div class="flight-duration">{html.escape(str(offer.get("duration") or ""))}</div>',
                '<div class="flight-duration-line"></div>',
                f'<div class="flight-stop-status">{html.escape(str(offer.get("stop_label") or ""))}</div>',
                "</div>",
                '<div style="text-align:right">',
                f'<div class="flight-time">{html.escape(str(offer.get("arrive_time") or "--:--"))}</div>',
                f'<div class="flight-airport">{html.escape(str(offer.get("destination") or destination_airports[0]))}</div>',
                "</div>",
                "</div>",
                recommendation_html,
                trip_impact_html,
                watch_out_html,
                '<div class="flight-card-footer">',
                f'<div class="flight-chip-row">{chips_html}</div>',
                '<div class="flight-card-actions"></div>',
                "</div>",
                "</div>",
            ]
        )
        st.markdown(card_html, unsafe_allow_html=True)
        action_button_cols = st.columns([1, 0.16, 0.16, 0.16, 0.20])
        with action_button_cols[1]:
            flight_id = _flight_key(offer)
            comparison_label = "Why #1?" if is_recommended else "Why not?"
            if st.button(comparison_label, key=f"compare_number_one_{index}_{flight_id}"):
                st.session_state["selected_flight_for_comparison"] = flight_id
                event_name = "why_number_one_clicked" if is_recommended else "why_not_clicked"
                duration_difference = (_duration_minutes(offer.get("duration")) or 0) - (_duration_minutes(best_offer.get("duration")) or 0)
                stops_difference = int(offer.get("stops") or 0) - int(best_offer.get("stops") or 0)
                track_event(
                    event_name,
                    {
                        "selected_airline": offer.get("airline"),
                        "selected_flight_number": _display_flight_number(offer),
                        "selected_price": offer.get("price_total"),
                        "selected_duration": offer.get("duration"),
                        "selected_stops": offer.get("stops"),
                        "recommended_airline": best_offer.get("airline"),
                        "recommended_flight_number": _display_flight_number(best_offer),
                        "recommended_price": best_offer.get("price_total"),
                        "recommended_duration": best_offer.get("duration"),
                        "recommended_stops": best_offer.get("stops"),
                        "price_difference": float(offer.get("price_total") or 0) - float(best_offer.get("price_total") or 0),
                        "duration_difference": duration_difference,
                        "stops_difference": stops_difference,
                    },
                )
                st.rerun()
        with action_button_cols[2]:
            flight_id = _flight_key(offer)
            if st.button(f"AI Score: {score}", key=f"score_breakdown_{index}_{flight_id}"):
                st.session_state["selected_flight_for_score_breakdown"] = flight_id
                track_event(
                    "ai_score_clicked",
                    {
                        "flight_id": flight_id,
                        "airline": offer.get("airline"),
                        "flight_number": offer.get("flight_number"),
                        "ai_score": recommendation.get("score"),
                    },
                )
                st.rerun()
        with action_button_cols[3]:
            flight_id = _flight_key(offer)
            if is_selected:
                st.button("Selected", key=f"selected_{index}_{flight_id}", disabled=True)
            else:
                st.button(
                    "Select",
                    key=f"select_{index}_{flight_id}",
                    on_click=_set_selected_flight,
                    args=(flight_id, offer, adults, index),
                )
        with action_button_cols[4]:
            if st.button("View details", key=f"details_{index}_{_flight_key(offer)}"):
                detail_flight_id = _flight_key(offer)
                st.session_state["selected_flight_for_details"] = detail_flight_id
                track_event(
                    "view_details_clicked",
                    {
                        "flight_id": detail_flight_id,
                        "airline": offer.get("airline"),
                        "flight_number": offer.get("flight_number"),
                        "ai_score": recommendation.get("score"),
                        "price": offer.get("price_total"),
                        "currency": offer.get("currency"),
                    },
                )
                st.rerun()

    if len(offers) > 8 and not show_more_flights:
        more_count = len(offers) - 8
        if st.button(f"Show more flights ({more_count})", key="show_more_flights_button"):
            st.session_state["show_more_flights"] = True
            st.rerun()

    score_detail_offer = None
    score_modal_key = st.session_state.get("selected_flight_for_score_breakdown", "")
    if score_modal_key:
        for offer in offers:
            if _flight_key(offer) == score_modal_key:
                score_detail_offer = offer
                break
    if score_detail_offer:
        def _show_score_breakdown_content():
            breakdown_rows = _ai_score_detail_breakdown(score_detail_offer, offers)
            score_data = (recommendations.get(_flight_key(score_detail_offer)) or {})
            score_value = float(score_data.get("score") or score_detail_offer.get("ai_score") or 0)
            not_perfect_reasons = _score_not_perfect_reasons(score_detail_offer, offers) if score_value < 100 else []
            not_perfect_html = ""
            if not_perfect_reasons:
                not_perfect_html = "".join(
                    [
                        '<div class="flight-card-rec-kicker why">Why this is not a perfect score</div>',
                        '<ul class="flight-card-rec-list">',
                        "".join(f"<li>{html.escape(reason)}</li>" for reason in not_perfect_reasons),
                        "</ul>",
                    ]
                )
            breakdown_html = "".join(
                _safe_html_parts(
                    [
                        [
                            '<div class="flight-score-breakdown-row">',
                            '<div class="flight-score-breakdown-top">',
                            f'<span class="flight-score-breakdown-name">{html.escape(name)}</span>',
                            f'<span class="flight-score-breakdown-score">{score_value:.1f}/10</span>',
                            "</div>",
                            f'<div class="flight-score-breakdown-note">{explanation_html}</div>',
                            "</div>",
                        ]
                        for name, score_value, explanation_html in (_safe_score_breakdown_row(row) for row in breakdown_rows)
                    ]
                )
            )
            st.markdown(
                "".join(
                    [
                        '<div class="flight-score-breakdown-panel">',
                        '<div class="flight-score-breakdown-title">AI Score breakdown</div>',
                        not_perfect_html,
                        f'<div class="flight-score-breakdown-grid">{breakdown_html}</div>',
                        "</div>",
                    ]
                ),
                unsafe_allow_html=True,
            )
            if st.button("Close AI Score", key="close_ai_score_breakdown"):
                st.session_state.pop("selected_flight_for_score_breakdown", None)
                st.rerun()

        if hasattr(st, "dialog"):
            @st.dialog(f"{_display_flight_number(score_detail_offer)} AI Score")
            def _flight_score_dialog():
                _show_score_breakdown_content()

            _flight_score_dialog()
        else:
            with st.container(border=True):
                st.markdown(f"### {_display_flight_number(score_detail_offer)} AI Score")
                _show_score_breakdown_content()

    comparison_offer = None
    comparison_modal_key = st.session_state.get("selected_flight_for_comparison", "")
    if comparison_modal_key:
        for offer in offers:
            if _flight_key(offer) == comparison_modal_key:
                comparison_offer = offer
                break
    if comparison_offer:
        def _show_comparison_content():
            render_flight_comparison_modal(comparison_offer, best_offer, visible_offers, advisor_bullets)
            if st.button("Close", key="close_flight_comparison"):
                st.session_state.pop("selected_flight_for_comparison", None)
                st.rerun()

        comparison_title = (
            "Why Byable picked this"
            if _flight_key(comparison_offer) == _flight_key(best_offer)
            else "Why this was not picked"
        )
        if hasattr(st, "dialog"):
            @st.dialog(comparison_title)
            def _flight_comparison_dialog():
                _show_comparison_content()

            _flight_comparison_dialog()
        else:
            with st.container(border=True):
                _show_comparison_content()

    detail_offer = None
    if detail_modal_key:
        for offer in visible_offers:
            if _flight_key(offer) == detail_modal_key:
                detail_offer = offer
                break
    if detail_offer:
        detail_rec = recommendations.get(_flight_key(detail_offer), {})

        def _show_detail_content():
            details_start = time.perf_counter()
            render_flight_details_modal(detail_offer, detail_rec, return_mode, origin_label, destination_label, return_origin_label)
            if st.button("Close details", key="close_flight_details"):
                st.session_state.pop("selected_flight_for_details", None)
                st.rerun()
            perf_timings["details"] += time.perf_counter() - details_start

        if hasattr(st, "dialog"):
            @st.dialog(f"{_display_flight_number(detail_offer)} details")
            def _flight_detail_dialog():
                _show_detail_content()

            _flight_detail_dialog()
        else:
            with st.container(border=True):
                st.markdown(f"### {_display_flight_number(detail_offer)} details")
                _show_detail_content()

    cached_perf = (st.session_state.get("flight_results_cache") or {}).get("perf_timings") or {}
    total_time = time.perf_counter() - search_to_results_start if search_to_results_start else time.perf_counter() - render_start
    print(
        "BYABLE PERF:\n"
        f"Duffel search: {float(cached_perf.get('duffel') or perf_timings['duffel']):.2f}s\n"
        f"Normalize: {float(cached_perf.get('normalize') or perf_timings['normalize']):.2f}s\n"
        f"Rank: {perf_timings['rank']:.2f}s\n"
        f"Recommendation: {perf_timings['recommendation']:.2f}s\n"
        f"Details: {perf_timings['details']:.2f}s\n"
        f"Total: {total_time:.2f}s"
    )
    print(f"[Byable Flights] render_time={time.perf_counter() - render_start:.3f}s")
