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
CITY_AIRPORTS = {
    "san francisco": {"label": "San Francisco", "airports": ["SFO", "OAK", "SJC"]},
    "sf": {"label": "San Francisco", "airports": ["SFO", "OAK", "SJC"]},
    "bay area": {"label": "San Francisco", "airports": ["SFO", "OAK", "SJC"]},
    "tokyo": {"label": "Tokyo", "airports": ["HND", "NRT"]},
    "new york": {"label": "New York", "airports": ["JFK", "LGA", "EWR"]},
    "nyc": {"label": "New York", "airports": ["JFK", "LGA", "EWR"]},
    "london": {"label": "London", "airports": ["LHR", "LGW", "LCY", "STN", "LTN"]},
    "los angeles": {"label": "Los Angeles", "airports": ["LAX", "BUR", "SNA", "ONT", "LGB"]},
    "la": {"label": "Los Angeles", "airports": ["LAX", "BUR", "SNA", "ONT", "LGB"]},
    "chicago": {"label": "Chicago", "airports": ["ORD", "MDW"]},
    "washington dc": {"label": "Washington, DC", "airports": ["DCA", "IAD", "BWI"]},
    "dc": {"label": "Washington, DC", "airports": ["DCA", "IAD", "BWI"]},
    "paris": {"label": "Paris", "airports": ["CDG", "ORY"]},
    "seoul": {"label": "Seoul", "airports": ["ICN", "GMP"]},
    "osaka": {"label": "Osaka", "airports": ["KIX", "ITM"]},
    "kyoto": {"label": "Kyoto", "airports": ["KIX", "ITM"]},
    "bangkok": {"label": "Bangkok", "airports": ["BKK", "DMK"]},
    "singapore": {"label": "Singapore", "airports": ["SIN"]},
    "sydney": {"label": "Sydney", "airports": ["SYD"]},
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


def _airport_combo_label(city_label, airports):
    airport_text = ", ".join(airports[:4])
    return f"{city_label} ({airport_text})"


def _airport_search_combinations(origin_airports, destination_airports, return_origin_airports, max_attempts=4):
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
    return [(origin, destination, return_origin) for _rank, origin, destination, return_origin in combinations[:max_attempts]]


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


def _jet_lag_impact(offer):
    zones_crossed = _time_zone_delta_estimate(offer)
    arrival_timing = _arrival_timing_label(offer)
    if zones_crossed >= 8 or arrival_timing == "Bad":
        return "High"
    if zones_crossed >= 4 or arrival_timing == "Okay":
        return "Moderate"
    return "Low"


def _airport_convenience_level(airport_code):
    levels = {
        "HND": "High", "NRT": "Medium", "LGA": "High", "EWR": "Medium", "JFK": "Medium",
        "SFO": "High", "OAK": "Medium", "SJC": "Medium", "KIX": "Medium", "ITM": "High",
        "LHR": "High", "LGW": "Medium", "LCY": "High", "CDG": "Medium", "ORY": "Medium",
    }
    return levels.get(str(airport_code or "").upper())


def _trip_impact(offer):
    arrival_timing = _arrival_timing_label(offer)
    jet_lag = _jet_lag_impact(offer)
    zones_crossed = _time_zone_delta_estimate(offer)
    destination = str(offer.get("destination") or "").upper()
    airport_convenience = _airport_convenience_level(destination)
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
    if int(offer.get("stops") or 0) == 0:
        reasons.append("Nonstop route")
    else:
        reasons.append(f"{int(offer.get('stops') or 0)} stop route")
    if jet_lag in {"Moderate", "High"}:
        if zones_crossed >= 8:
            reasons.append("High jet lag impact because this route crosses many time zones")
        elif arrival_timing == "Bad":
            reasons.append("Late arrival may make jet lag harder to manage")
        elif arrival_timing == "Great":
            reasons.append("Afternoon arrival helps reduce jet lag disruption")
        else:
            reasons.append("Moderate jet lag impact from the time change and arrival timing")
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
    return {
        "arrival_timing": arrival_timing,
        "jet_lag": jet_lag,
        "airport_convenience": airport_convenience,
        "reasons": reasons[:3],
    }


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
        parts.append("predictable timing")
    if label in {"Most flexible", "Best overall"}:
        parts.append("clearer flexibility")
    if label == "Best baggage":
        parts.append("baggage clarity")
    strength = " and ".join(parts[:2]) if parts else "a balanced route"
    downside = "The main tradeoff is that it may not be the absolute cheapest fare returned."
    if label in {"Cheapest", "Cheapest nonstop", "Best value"}:
        downside = "The main tradeoff is checking whether the timing works for your trip rhythm."
    if price <= 0:
        downside = "The main tradeoff is limited fare detail from this test result."
    return f"This is a strong option if you care about {strength}. {downside}"


def _airport_convenience_note(offer):
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
    return airport_notes.get(destination) or airport_notes.get(origin) or "Airport convenience data is limited for this route."


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


def _set_selected_flight(flight_id, offer, adults, index):
    st.session_state["selected_flight_id"] = flight_id
    st.session_state["selected_flight"] = {**offer, "adults": adults}
    st.session_state["selected_flight_index"] = index


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


def load_flight_offers(origin, destination, departure_date, return_date, adults, cabin_class, max_results=5, return_origin=None):
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
            timeout=30,
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


def load_city_flight_offers(origin_city, destination_city, departure_date, return_date, adults, cabin_class, max_results=20, return_origin_city=None):
    city_search_start = time.perf_counter()
    origin_label, origin_airports = _resolve_city_airports(origin_city)
    destination_label, destination_airports = _resolve_city_airports(destination_city)
    return_origin_label, return_origin_airports = _resolve_city_airports(return_origin_city or destination_city)
    if not _duffel_api_key():
        print(
            "[Byable Flights] "
            f"city_search_time={time.perf_counter() - city_search_start:.3f}s "
            "combined_offers=0 key_missing=True"
        )
        return [], False, {
            "status": "not_configured",
            "message": "Duffel API key not configured.",
            "searched_origin_airports": origin_airports,
            "searched_destination_airports": destination_airports,
            "searched_return_origin_airports": return_origin_airports,
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
    combinations = _airport_search_combinations(origin_airports, destination_airports, return_origin_airports, max_attempts=4)

    for origin_airport, destination_airport, return_origin_airport in combinations:
        offers, live, payload = load_flight_offers(
            origin_airport,
            destination_airport,
            departure_date,
            return_date,
            adults,
            cabin_class,
            max_results=5,
            return_origin=return_origin_airport,
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
    message = None if combined else "No live fares found for these dates."
    if not _duffel_api_key():
        message = "Duffel API key not configured."
    print(
        "[Byable Flights] "
        f"city_search_time={time.perf_counter() - city_search_start:.3f}s "
        f"combined_offers={len(combined)} "
        f"origin_airports={len(origin_airports)} "
        f"destination_airports={len(destination_airports)} "
        f"return_airports={len(return_origin_airports)} "
        f"attempts={len(combinations)}"
    )
    return combined[:max_results], bool(combined and live_any), {
        "status": status,
        "message": message,
        "timing": {
            "duffel": timing["duffel"],
            "normalize": timing["normalize"],
            "city_search": time.perf_counter() - city_search_start,
            "attempts": len(combinations),
        },
        "searched_origin_airports": origin_airports,
        "searched_destination_airports": destination_airports,
        "searched_return_origin_airports": return_origin_airports,
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
        st.markdown(f"**{_airport_convenience_note(offer)}**")
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
    route_details = offer.get("route_details") or []
    fare_conditions = offer.get("fare_conditions") or ["Not available"]
    operating_carriers = []
    aircraft_types = []
    for flight_slice in route_details:
        for segment in flight_slice.get("segments") or []:
            operating_carriers.append(segment.get("operating_carrier") or "Not available")
            aircraft_types.append(segment.get("aircraft") or "Not available")

    st.markdown("#### Advisor summary")
    st.write(_trip_impact_summary(offer, recommendation))

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


def render():
    render_start = time.perf_counter()
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
        .flight-route-preview-pill {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            max-width: 100%;
            padding: 6px 11px;
            border-radius: 999px;
            background: rgba(255,255,255,0.055);
            border: 1px solid rgba(255,255,255,0.10);
            color: rgba(255,255,255,0.58);
            font-size: 12px;
            font-weight: 750;
            margin-top: 7px;
        }
        .flight-return-toggle [role="radiogroup"] {
            opacity: 0.86;
        }
        div[data-testid="stForm"] label {
            font-size: 0.78rem;
            color: rgba(255,255,255,0.68) !important;
            font-weight: 800;
            letter-spacing: 0.01em;
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
        .flight-rec-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-top: 7px;
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
        .flight-card-recommendation {
            border: 1px solid rgba(129,140,248,0.18);
            border-radius: 14px;
            background: rgba(99,102,241,0.075);
            padding: 11px 13px;
            margin: 0 0 10px;
        }
        .flight-card-recommendation.compact {
            background: rgba(255,255,255,0.032);
            border-color: rgba(255,255,255,0.08);
            padding: 9px 11px;
        }
        .flight-card-recommendation.compact .flight-card-rec-list {
            display: none;
        }
        .flight-card-recommendation.compact .flight-card-rec-kicker.why {
            display: none;
        }
        .flight-card-rec-kicker {
            color: #c7d2fe;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        .flight-card-rec-kicker.why {
            margin-top: 8px;
        }
        .flight-card-rec-copy {
            color: rgba(255,255,255,0.86);
            font-size: 13px;
            line-height: 1.45;
            margin-bottom: 5px;
        }
        .flight-card-impact-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px 12px;
            color: rgba(255,255,255,0.72);
            font-size: 12px;
            line-height: 1.35;
        }
        .flight-card-impact-grid span {
            color: rgba(255,255,255,0.48);
        }
        .flight-card-impact-grid strong {
            color: rgba(255,255,255,0.90);
        }
        .flight-card-rec-list {
            color: rgba(255,255,255,0.66);
            font-size: 12px;
            line-height: 1.45;
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
            .flight-card-impact-grid {
                grid-template-columns: 1fr;
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
            adults = st.number_input("Travelers", min_value=1, max_value=9, value=int(search_state["adults"]), step=1)
        with col_cabin:
            cabin_class = st.selectbox(
                "Cabin",
                ["economy", "premium_economy", "business", "first"],
                index=["economy", "premium_economy", "business", "first"].index(search_state["cabin_class"]),
                format_func=lambda value: value.replace("_", " ").title(),
            )
        with col_submit:
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

        origin_preview_label, origin_preview_airports = _resolve_city_airports(origin_city)
        destination_preview_label, destination_preview_airports = _resolve_city_airports(destination_city)
        return_preview_label, _return_preview_airports = _resolve_city_airports(return_origin_city)
        if return_mode == "Different city":
            search_preview = f"Searching {origin_preview_label} → {destination_preview_label} · {return_preview_label} → {origin_preview_label}"
        else:
            search_preview = f"Searching {origin_preview_label} → {destination_preview_label} → {origin_preview_label}"
        st.markdown(
            f'<div class="flight-route-preview-pill">Searching: {html.escape(search_preview.replace("Searching ", ""))}</div>',
            unsafe_allow_html=True,
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
        selected_priorities = (search_state.get("priorities") or st.session_state.get("flight_priorities", DEFAULT_PRIORITIES))[:3]
        st.session_state["flight_search"] = {
            "origin_city": origin_city.strip() or "San Francisco",
            "destination_city": destination_city.strip() or "Tokyo",
            "departure_date": departure_iso,
            "return_date": return_iso,
            "adults": int(adults),
            "cabin_class": cabin_class,
            "nonstop_only": bool(nonstop_only),
            "return_mode": return_mode,
            "return_origin_city": return_origin_city.strip() or destination_city.strip() or "Tokyo",
            "priorities": selected_priorities,
        }
        st.session_state["selected_flight_index"] = 0
        search_state = st.session_state["flight_search"]

    origin_city = str(search_state.get("origin_city") or "San Francisco")
    destination_city = str(search_state.get("destination_city") or "Tokyo")
    return_mode = str(search_state.get("return_mode") or "Same as destination")
    return_origin_city = str(search_state.get("return_origin_city") or destination_city)
    if return_mode == "Same as destination":
        return_origin_city = destination_city
    origin_label, origin_airports = _resolve_city_airports(origin_city)
    destination_label, destination_airports = _resolve_city_airports(destination_city)
    return_origin_label, return_origin_airports = _resolve_city_airports(return_origin_city)
    departure_iso = _as_iso_date(search_state["departure_date"])
    return_iso = _as_iso_date(search_state["return_date"])
    adults = int(search_state["adults"])
    cabin_class = str(search_state["cabin_class"])
    priorities = (
        st.session_state.get("flight_priority_selector")
        or search_state.get("priorities")
        or st.session_state.get("flight_priorities")
        or DEFAULT_PRIORITIES
    )[:3]
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
        with st.spinner("Searching nearby airports..."):
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

    st.markdown("#### Flight options")
    st.markdown(
        f"""
        <div class="flight-status-row">
            <span class="flight-status-pill{pill_class}">{html.escape(api_status)}</span>
            <span class="flight-updated">Updated just now</span>
            <span class="flight-updated">{html.escape(route_label)} · {html.escape(date_label)} · {html.escape(traveler_label)}</span>
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
            empty_title = "Ready when you are"
            empty_message = "Search flights to see live fares."
        elif status == "ok":
            empty_title = "No fares found"
            empty_message = "No live fares found for these dates."
        else:
            empty_title = "Duffel API error"
            empty_message = (debug_payload or {}).get("message") or "Duffel is unavailable right now."
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

    priority_selection = st.multiselect(
        "What matters most?",
        TRAVELER_PRIORITIES,
        default=[priority for priority in priorities if priority in TRAVELER_PRIORITIES][:3],
        key="flight_priority_selector",
        help="Choose up to 3. These priorities rank results and shape recommendations.",
    )
    if len(priority_selection) > 3:
        st.warning("Choose up to 3 priorities. Byable will use the first three selected.")
    selected_priorities = (priority_selection or DEFAULT_PRIORITIES)[:3]
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

    visible_offers = offers[:5]
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
    detail_modal_key = st.session_state.get("selected_flight_for_details", "")

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
        badge_html = "".join(
            f'<span class="flight-rec-badge">{html.escape(badge)}</span>'
            for badge in _card_badges(offer, visible_offers, recommendations)
        )
        if not badge_html:
            badge_html = f'<span class="flight-rec-badge">{html.escape(str(recommendation.get("label") or "Best value"))}</span>'
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
        impact = _trip_impact(offer)
        impact_rows = [
            ("Arrival Timing", impact["arrival_timing"]),
            ("Jet Lag Impact", impact["jet_lag"]),
        ]
        if impact.get("airport_convenience"):
            impact_rows.append(("Airport Convenience", impact["airport_convenience"]))
        impact_html = "".join(
            f'<div><span>{html.escape(label)}:</span> <strong>{html.escape(value)}</strong></div>'
            for label, value in impact_rows
        )
        impact_bullets = "".join(
            f"<li>{html.escape(bullet)}</li>"
            for bullet in impact["reasons"][:3]
        )
        impact_class = "flight-card-recommendation" if is_recommended else "flight-card-recommendation compact"
        trip_impact_html = "".join(
            [
                f'<div class="{impact_class}">',
                '<div class="flight-card-rec-kicker">Trip Impact</div>',
                f'<div class="flight-card-impact-grid">{impact_html}</div>',
                '<div class="flight-card-rec-kicker why">Why?</div>',
                f'<ul class="flight-card-rec-list">{impact_bullets}</ul>',
                "</div>",
            ]
        )
        recommendation_html = ""
        if is_recommended:
            bullet_html = "".join(
                f"<li>{html.escape(bullet)}</li>"
                for bullet in advisor_bullets[:3]
            )
            recommendation_html = "".join(
                [
                    '<div class="flight-card-recommendation">',
                    '<div class="flight-card-rec-kicker">Recommended flight</div>',
                    f'<div class="flight-card-rec-copy">{html.escape(recommendation_summary)}</div>',
                    '<div class="flight-card-rec-kicker why">Why this</div>',
                    f'<ul class="flight-card-rec-list">{bullet_html}</ul>',
                    "</div>",
                ]
            )
        action_html = '<span class="flight-selected-pill">Selected</span>' if is_selected else ""
        card_html = "".join(
            [
                f'<div class="{card_class}">',
                '<div class="flight-card-top">',
                '<div class="flight-airline-wrap">',
                f'<div class="flight-logo">{airline_code}</div>',
                "<div>",
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
                '<div class="flight-card-footer">',
                f'<div class="flight-chip-row">{chips_html}</div>',
                f'<div class="flight-card-actions">{action_html}</div>',
                "</div>",
                "</div>",
            ]
        )
        st.markdown(card_html, unsafe_allow_html=True)
        action_button_cols = st.columns([1, 0.16, 0.20])
        with action_button_cols[1]:
            flight_id = _flight_key(offer)
            if not is_selected:
                st.button(
                    "Select",
                    key=f"select_{index}_{flight_id}",
                    on_click=_set_selected_flight,
                    args=(flight_id, offer, adults, index),
                )
        with action_button_cols[2]:
            if st.button("View details", key=f"details_{index}_{_flight_key(offer)}"):
                st.session_state["selected_flight_for_details"] = _flight_key(offer)
                st.rerun()

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
