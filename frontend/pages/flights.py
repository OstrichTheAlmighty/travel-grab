import html
import json
import os
import re
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

import certifi
import requests
import streamlit as st

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
SANDBOX_AIRLINES = {"duffel airways"}
SANDBOX_OWNER_IATA_CODES = {"ZZ"}
PROJECT_ROOT = Path(__file__).resolve().parents[2]
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


def _airline_code(airline, flight_number):
    flight = str(flight_number or "").strip()
    if flight:
        return "".join([char for char in flight.split()[0] if char.isalpha()])[:3].upper() or "AIR"
    airline_l = str(airline or "").lower()
    if "japan" in airline_l:
        return "JL"
    if "ana" in airline_l or "all nippon" in airline_l:
        return "NH"
    if "united" in airline_l:
        return "UA"
    return "AIR"


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
    if status == "ok":
        return "No fares found"
    return "Duffel API error"


def _apply_flight_filters(offers, nonstop_only=False, max_price=None):
    filtered = list(offers)
    if nonstop_only:
        filtered = [offer for offer in filtered if int(offer.get("stops") or 0) == 0]
    if max_price is not None and float(max_price) > 0:
        filtered = [offer for offer in filtered if float(offer.get("price_total") or 0) <= float(max_price)]
    return filtered


def _sort_flights(offers, sort_mode):
    def price(offer):
        return float(offer.get("price_total") or 0)

    def duration(offer):
        return _duration_minutes(offer.get("duration"))

    def stops(offer):
        return int(offer.get("stops") or 0)

    if sort_mode == "Fastest":
        return sorted(offers, key=lambda offer: (duration(offer), price(offer), stops(offer)))
    if sort_mode == "Fewest stops":
        return sorted(offers, key=lambda offer: (stops(offer), price(offer), duration(offer)))
    if sort_mode == "Best overall":
        return sorted(offers, key=lambda offer: (price(offer) * 0.55) + (duration(offer) * 1.8) + (stops(offer) * 220))
    return sorted(offers, key=lambda offer: (price(offer), duration(offer), stops(offer)))


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
    fastest = min(offers, key=lambda offer: (_duration_minutes(offer.get("duration")) or 99999, float(offer.get("price_total") or 0)))
    fastest_price = float(fastest.get("price_total") or 0)
    if fastest_price > best_price:
        bullets.append(f"Saves {money_usd(fastest_price - best_price)} compared with the fastest option.")

    if int(best_offer.get("stops") or 0) == 0:
        bullets.append("Keeps the trip nonstop while avoiding connection risk.")

    best_arrival = _clock_minutes(best_offer.get("arrive_time"))
    if any(abs(_clock_minutes(offer.get("arrive_time")) - 15 * 60) > abs(best_arrival - 15 * 60) for offer in others):
        bullets.append("Has stronger timing than later or less convenient arrivals.")

    if _fare_flexibility_score(best_offer) >= max(_fare_flexibility_score(offer) for offer in others):
        bullets.append("Offers stronger or clearer flexibility than the other returned fares.")

    if _has_baggage(best_offer) and any(not _has_baggage(offer) for offer in others):
        bullets.append("Shows better baggage clarity than options with unclear baggage details.")

    score = recommendations.get(_flight_key(best_offer), {}).get("score")
    if score:
        bullets.append(f"Ranks highest for your selected priorities with an AI Score of {score}.")

    return bullets[:3] or ["Best fit because it balances your selected priorities better than the alternatives."]


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


def load_flight_offers(origin, destination, departure_date, return_date, adults, cabin_class, max_results=5):
    api_key = _duffel_api_key()
    if not api_key:
        return [], False, {"status": "not_configured", "message": "Duffel API key not configured."}

    payload = {
        "data": {
            "slices": [
                {"origin": origin.upper(), "destination": destination.upper(), "departure_date": departure_date},
                {"origin": destination.upper(), "destination": origin.upper(), "departure_date": return_date},
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
        response = requests.post(
            f"{DUFFEL_BASE_URL}/air/offer_requests",
            json=payload,
            headers=headers,
            timeout=30,
            verify=certifi.where(),
        )
        response.raise_for_status()
        data = response.json().get("data") or {}
        raw_offers = data.get("offers") or []
        offers = [offer for offer in raw_offers if not _is_sandbox_offer(offer)]
        flights = [_normalize_duffel_offer(offer) for offer in offers[: max(1, int(max_results))]]
        if flights:
            normalized = [_normalize_duffel_flight(flight, adults) for flight in flights if flight]
            return [flight for flight in normalized if flight], True, {"status": "ok", "message": None, "offer_count": len(offers)}
        return [], False, {"status": "ok", "message": "No live fares found for these dates."}
    except requests.HTTPError as exc:
        try:
            error_payload = exc.response.json() if exc.response is not None else {}
            error_message = error_payload.get("errors", [{}])[0].get("message") or f"Duffel API error ({exc.response.status_code})."
        except (ValueError, json.JSONDecodeError, AttributeError):
            error_message = str(exc)
        return [], False, {"status": "error", "message": error_message}
    except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
        return [], False, {
            "status": "error",
            "message": str(exc),
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


def render_flight_details(offer, recommendation=None):
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
    terminal_summary = [item for item in terminals if _display_value(item) != "Not available"] or ["Not available"]

    recommendation = recommendation or {}
    if recommendation.get("why"):
        with st.container(border=True):
            st.markdown("##### Why this flight")
            st.write(recommendation["why"])

    breakdown = recommendation.get("breakdown") or {}
    if breakdown:
        with st.container(border=True):
            st.caption("AI reasoning breakdown")
            score_cols = st.columns(4)
            for col, (label, value) in zip(score_cols, breakdown.items()):
                with col:
                    st.caption(label)
                    st.markdown(f"**{value:.1f}**")

    st.markdown("##### Flight details")
    summary_cols = st.columns(3)
    with summary_cols[0]:
        with st.container(border=True):
            _render_label_value("Total travel time", offer.get("total_travel_time") or offer.get("duration"))
    with summary_cols[1]:
        with st.container(border=True):
            _render_label_value("Baggage", baggage)
    with summary_cols[2]:
        with st.container(border=True):
            _render_label_value("Cabin", offer.get("cabin"))

    summary_cols_b = st.columns(3)
    with summary_cols_b[0]:
        with st.container(border=True):
            _render_label_value("Operating carrier", operating_summary)
    with summary_cols_b[1]:
        with st.container(border=True):
            _render_label_value("Aircraft", aircraft_summary)
    with summary_cols_b[2]:
        with st.container(border=True):
            st.caption("Terminal information")
            for terminal in terminal_summary:
                st.write(_display_value(terminal))

    st.markdown("##### Route timeline")
    if not route_details:
        st.write("Route breakdown not available.")
        return

    if len(route_details) >= 2:
        route_cols = st.columns(2)
        for col, flight_slice in zip(route_cols, route_details[:2]):
            with col:
                _render_route_card(flight_slice)
        for flight_slice in route_details[2:]:
            _render_route_card(flight_slice)
    else:
        _render_route_card(route_details[0])

    with st.container(border=True):
        st.markdown("##### Fare rules")
        for condition in fare_conditions:
            st.caption(f"- {_display_value(condition)}")


def render():
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
            border: 0.5px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.025);
            border-radius: 12px;
            padding: 8px 12px 10px;
            margin-bottom: 0.35rem;
        }
        div[data-testid="stForm"] label {
            font-size: 0.78rem;
        }
        div[data-testid="stForm"] [data-testid="stVerticalBlock"] {
            gap: 0.35rem;
        }
        div[data-testid="stForm"] [data-testid="column"] {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
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
        .flight-summary-box,
        .flight-advisor-bullets {
            border: 1px solid rgba(129,140,248,0.18);
            border-radius: 18px;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.14), transparent 34%),
                rgba(255,255,255,0.035);
            padding: 16px 18px;
            margin: 10px 0 12px;
        }
        .flight-summary-title,
        .flight-advisor-title {
            color: rgba(255,255,255,0.62);
            font-size: 12px;
            font-weight: 850;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 7px;
        }
        .flight-summary-copy {
            color: rgba(255,255,255,0.88);
            font-size: 15px;
            line-height: 1.55;
        }
        .flight-advisor-bullets ul {
            margin: 0;
            padding-left: 1.1rem;
            color: rgba(255,255,255,0.76);
            font-size: 14px;
            line-height: 1.55;
        }
        .flight-advisor-bullets li {
            margin: 4px 0;
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
        .flight-rec-badge {
            padding: 4px 9px;
            color: #dbeafe;
            background: linear-gradient(135deg, rgba(99,102,241,0.28), rgba(14,165,233,0.13));
            border: 1px solid rgba(165,180,252,0.22);
        }
        .flight-score-pill {
            justify-content: flex-end;
            margin-left: auto;
            padding: 4px 8px;
            color: #c7d2fe;
            background: rgba(129,140,248,0.12);
            border: 1px solid rgba(129,140,248,0.20);
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
        .flight-card-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-top: 12px;
        }
        .flight-select-btn,
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
        .flight-select-btn {
            color: #c7d2fe !important;
            background: rgba(99,102,241,0.12);
            border: 1px solid rgba(129,140,248,0.38);
        }
        .flight-select-btn:hover {
            background: rgba(129,140,248,0.2);
            border-color: rgba(165,180,252,0.52);
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
        @media (max-width: 760px) {
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
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    search_state = st.session_state.setdefault(
        "flight_search",
        {
            "origin": "SFO",
            "destination": "HND",
            "departure_date": "2026-10-14",
            "return_date": "2026-10-24",
            "adults": 1,
            "cabin_class": "economy",
            "sort_mode": "Best overall",
            "nonstop_only": False,
            "max_price": 0.0,
        },
    )
    search_state["departure_date"] = _as_iso_date(search_state.get("departure_date") or "2026-10-14")
    search_state["return_date"] = _as_iso_date(search_state.get("return_date") or "2026-10-24")

    with st.form("flight_search_form"):
        st.caption("Duffel test mode — fares are API test fares, not final ticketed prices.")
        col_origin, col_destination, col_departure, col_return, col_adults, col_cabin, col_sort, col_submit = st.columns(
            [0.75, 0.75, 1, 1, 0.75, 1.1, 1.1, 0.9]
        )
        with col_origin:
            origin = st.text_input("Origin", value=search_state["origin"], max_chars=3).strip().upper()
        with col_destination:
            destination = st.text_input("Destination", value=search_state["destination"], max_chars=3).strip().upper()
        with col_departure:
            departure_date = st.text_input("Depart", value=search_state["departure_date"], help="Use YYYY-MM-DD.")
        with col_return:
            return_date = st.text_input("Return", value=search_state["return_date"], help="Use YYYY-MM-DD.")
        with col_adults:
            adults = st.number_input("Travelers", min_value=1, max_value=9, value=int(search_state["adults"]), step=1)
        with col_cabin:
            cabin_class = st.selectbox(
                "Cabin",
                ["economy", "premium_economy", "business", "first"],
                index=["economy", "premium_economy", "business", "first"].index(search_state["cabin_class"]),
                format_func=lambda value: value.replace("_", " ").title(),
            )
        with col_sort:
            sort_mode = st.selectbox(
                "Sort",
                ["Best overall", "Cheapest", "Fastest", "Fewest stops"],
                index=["Best overall", "Cheapest", "Fastest", "Fewest stops"].index(search_state.get("sort_mode", "Best overall")),
            )
        with col_submit:
            submitted = st.form_submit_button("Search flights", type="primary")

        filter_col_a, filter_col_b = st.columns([0.75, 1.25])
        with filter_col_a:
            nonstop_only = st.checkbox("Nonstop only", value=bool(search_state.get("nonstop_only", False)))
        with filter_col_b:
            max_price = st.number_input(
                "Max total price",
                min_value=0.0,
                value=float(search_state.get("max_price", 0.0)),
                step=50.0,
                help="Set to 0 for no max price.",
            )

    if submitted:
        departure_iso, departure_error = _validate_iso_date(departure_date, "Depart")
        return_iso, return_error = _validate_iso_date(return_date, "Return")
        if departure_error or return_error:
            st.session_state["flight_debug"] = {
                "status": "validation_error",
                "message": departure_error or return_error,
                "duffel_key_loaded": None,
            }
            st.error(departure_error or return_error)
            departure_iso = search_state["departure_date"]
            return_iso = search_state["return_date"]
        elif datetime.strptime(return_iso, ISO_DATE_FORMAT).date() < datetime.strptime(departure_iso, ISO_DATE_FORMAT).date():
            st.session_state["flight_debug"] = {
                "status": "validation_error",
                "message": "Return date must be on or after the departure date.",
                "duffel_key_loaded": None,
            }
            st.error("Return date must be on or after the departure date.")
            departure_iso = search_state["departure_date"]
            return_iso = search_state["return_date"]
        st.session_state["flight_search"] = {
            "origin": origin or "SFO",
            "destination": destination or "HND",
            "departure_date": departure_iso,
            "return_date": return_iso,
            "adults": int(adults),
            "cabin_class": cabin_class,
            "sort_mode": sort_mode,
            "nonstop_only": bool(nonstop_only),
            "max_price": float(max_price),
        }
        st.session_state["selected_flight_index"] = 0
        search_state = st.session_state["flight_search"]

    origin = str(search_state["origin"]).upper()
    destination = str(search_state["destination"]).upper()
    departure_iso = _as_iso_date(search_state["departure_date"])
    return_iso = _as_iso_date(search_state["return_date"])
    adults = int(search_state["adults"])
    cabin_class = str(search_state["cabin_class"])
    sort_mode = str(search_state.get("sort_mode", "Best overall"))
    nonstop_only = bool(search_state.get("nonstop_only", False))
    max_price = float(search_state.get("max_price", 0.0))
    departure_iso, departure_error = _validate_iso_date(departure_iso, "Depart")
    return_iso, return_error = _validate_iso_date(return_iso, "Return")
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
    else:
        with st.spinner("Fetching Duffel test fares..."):
            offers, live, debug_payload = load_flight_offers(origin, destination, departure_iso, return_iso, adults, cabin_class, 20)
    st.session_state["flight_debug"] = debug_payload
    offers = _sort_flights(_apply_flight_filters(offers, nonstop_only=nonstop_only, max_price=max_price), sort_mode)

    selected_index = min(int(st.session_state.get("selected_flight_index", 0)), max(0, len(offers) - 1))
    if offers and "selected_flight" not in st.session_state:
        st.session_state["selected_flight"] = {**offers[selected_index], "adults": adults}
    if not offers:
        st.session_state.pop("selected_flight", None)

    selected_key = _flight_key(st.session_state.get("selected_flight") or {})
    if offers:
        offer_keys = [_flight_key(offer) for offer in offers]
        query_key = st.query_params.get("flight_key", "")
        if isinstance(query_key, list):
            query_key = query_key[0] if query_key else ""
        if query_key in offer_keys:
            selected_index = offer_keys.index(query_key)
            st.session_state["selected_flight"] = {**offers[selected_index], "adults": adults}
            st.session_state["selected_flight_index"] = selected_index
        elif selected_key in offer_keys:
            selected_index = offer_keys.index(selected_key)
        else:
            selected_index = min(selected_index, len(offers) - 1)
            st.session_state["selected_flight"] = {**offers[selected_index], "adults": adults}
            st.session_state["selected_flight_index"] = selected_index
    else:
        st.session_state.pop("selected_flight", None)

    api_status = _api_status(debug_payload, live, offers)
    date_label = f"{departure_iso} → {return_iso}"
    traveler_label = f"{adults} {'traveler' if adults == 1 else 'travelers'}"
    pill_class = "" if offers else " warn"

    st.markdown("#### Flight options")
    st.markdown(
        f"""
        <div class="flight-status-row">
            <span class="flight-status-pill{pill_class}">{html.escape(api_status)}</span>
            <span class="flight-updated">Updated just now</span>
            <span class="flight-updated">{html.escape(origin)} → {html.escape(destination)} · {html.escape(date_label)} · {html.escape(traveler_label)}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if not offers:
        status = str((debug_payload or {}).get("status") or "").lower()
        if status == "not_configured":
            empty_title = "Duffel key missing"
            empty_message = "Duffel API key not configured."
        elif status == "ok":
            empty_title = "No fares found"
            empty_message = "No live fares found for these dates."
        else:
            empty_title = "Duffel API error"
            empty_message = (debug_payload or {}).get("message") or "Duffel is unavailable right now."
        st.info(f"{empty_title}: {empty_message}")
        return

    priority_selection = st.multiselect(
        "What matters most?",
        TRAVELER_PRIORITIES,
        default=st.session_state.get("flight_priorities", DEFAULT_PRIORITIES),
        help="Choose up to 3. These priorities influence deterministic scores and recommendations.",
    )
    if len(priority_selection) > 3:
        st.warning("Choose up to 3 priorities. Byable will use the first three selected.")
    priorities = (priority_selection or DEFAULT_PRIORITIES)[:3]
    st.session_state["flight_priorities"] = priorities

    visible_offers = offers[:5]
    recommendations = _recommendation_map(visible_offers, priorities)
    best_offer = max(visible_offers, key=lambda offer: recommendations.get(_flight_key(offer), {}).get("score", 0))
    best_rec = recommendations.get(_flight_key(best_offer), {})
    priority_text = ", ".join(priority.lower() for priority in priorities)
    st.markdown(
        f"""
        <div class="flight-summary-box">
            <div class="flight-summary-title">Recommended flight</div>
            <div class="flight-summary-copy">
                {html.escape(str(best_offer.get('airline') or 'This flight'))} is recommended because it best matches your priorities:
                {html.escape(priority_text)}. AI Score: {html.escape(str(best_rec.get('score', 'N/A')))}.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    advisor_bullets = "".join(
        f"<li>{html.escape(bullet)}</li>"
        for bullet in _why_over_others(best_offer, visible_offers, recommendations)
    )
    st.markdown(
        f"""
        <div class="flight-advisor-bullets">
            <div class="flight-advisor-title">Why this over other options</div>
            <ul>{advisor_bullets}</ul>
        </div>
        """,
        unsafe_allow_html=True,
    )

    for index, offer in enumerate(visible_offers):
        is_selected = index == selected_index
        is_recommended = _flight_key(offer) == _flight_key(best_offer)
        card_class = "flight-card-native"
        if is_selected:
            card_class += " selected"
        if is_recommended:
            card_class += " recommended"
        airline_code = html.escape(str(offer.get("airline_code") or "AIR")[:3].upper())
        flight_number = html.escape(_display_flight_number(offer))
        recommendation = recommendations.get(_flight_key(offer), {"label": "Best value", "score": 75, "why": "This balances price, routing, timing, and flexibility."})
        rec_label = html.escape(str(recommendation.get("label") or "Best value"))
        score = html.escape(str(recommendation.get("score") or 75))
        detail_chips = [
            "Round trip",
            html.escape(str(offer.get("cabin") or "Economy")),
            html.escape(str(offer.get("currency") or "USD")),
        ]
        if offer.get("baggage"):
            detail_chips.append(f"Baggage: {html.escape(str(offer.get('baggage')))}")
        chips_html = "".join(
            f'<span class="flight-chip{" primary" if chip == detail_chips[1] else ""}">{chip}</span>'
            for chip in detail_chips
            if chip
        )
        action_html = (
            '<span class="flight-selected-pill">Selected</span>'
            if is_selected
            else f'<a class="flight-select-btn" href="?flight_key={quote(_flight_key(offer), safe="")}">Select</a>'
        )
        st.markdown(
            f"""
            <div class="{card_class}">
                <div class="flight-card-top">
                    <div class="flight-airline-wrap">
                        <div class="flight-logo">{airline_code}</div>
                        <div>
                            <div class="flight-airline">{html.escape(str(offer.get('airline') or 'Airline'))}</div>
                            <div class="flight-number">{flight_number} · Duffel test fare</div>
                            <div class="flight-rec-badge">{rec_label}</div>
                        </div>
                    </div>
                    <div>
                        <div class="flight-price">{money_usd(offer.get('price_total'))}</div>
                        <div class="flight-price-sub">total · {html.escape(str(offer.get('currency') or 'USD'))}</div>
                        <div class="flight-score-pill">AI Score: {score}</div>
                    </div>
                </div>
                <div class="flight-route">
                    <div>
                        <div class="flight-time">{html.escape(str(offer.get('depart_time') or '--:--'))}</div>
                        <div class="flight-airport">{html.escape(str(offer.get('origin') or origin))}</div>
                    </div>
                    <div class="flight-middle">
                        <div class="flight-duration">{html.escape(str(offer.get('duration') or ''))}</div>
                        <div class="flight-duration-line"></div>
                        <div class="flight-stop-status">{html.escape(str(offer.get('stop_label') or ''))}</div>
                    </div>
                    <div style="text-align:right">
                        <div class="flight-time">{html.escape(str(offer.get('arrive_time') or '--:--'))}</div>
                        <div class="flight-airport">{html.escape(str(offer.get('destination') or destination))}</div>
                    </div>
                </div>
                <div class="flight-card-footer">
                    <div class="flight-chip-row">{chips_html}</div>
                    {action_html}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        with st.expander(f"View details · {flight_number}", expanded=False):
            render_flight_details(offer, recommendation)
