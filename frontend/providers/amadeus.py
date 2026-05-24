import os
import time
from datetime import datetime

import requests


AMADEUS_BASE_URL = "https://test.api.amadeus.com"
_TOKEN_CACHE = {"access_token": None, "expires_at": 0}


def get_amadeus_token():
    """Return an Amadeus Self-Service access token, or None when unavailable."""
    client_id = os.environ.get("AMADEUS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("AMADEUS_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        return None

    now = int(time.time())
    if _TOKEN_CACHE["access_token"] and _TOKEN_CACHE["expires_at"] > now + 60:
        return _TOKEN_CACHE["access_token"]

    try:
        response = requests.post(
            f"{AMADEUS_BASE_URL}/v1/security/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=12,
        )
        response.raise_for_status()
        payload = response.json()
        token = payload.get("access_token")
        if not token:
            return None
        _TOKEN_CACHE["access_token"] = token
        _TOKEN_CACHE["expires_at"] = now + int(payload.get("expires_in", 0) or 0)
        return token
    except requests.RequestException:
        return None


def _carrier_name(code, dictionaries):
    carriers = (dictionaries or {}).get("carriers", {}) or {}
    return carriers.get(code, code or "Airline")


def _format_time(value):
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%H:%M")
    except ValueError:
        return str(value)[11:16] if len(str(value)) >= 16 else str(value)


def _duration_label(duration):
    text = str(duration or "").replace("PT", "")
    hours = "0"
    minutes = "00"
    if "H" in text:
        hours, text = text.split("H", 1)
    if "M" in text:
        minutes = text.split("M", 1)[0]
    return f"{hours}h {minutes.zfill(2)}m"


def _normalize_offer(offer, dictionaries, adults):
    itineraries = offer.get("itineraries", []) or []
    outbound = itineraries[0] if itineraries else {}
    segments = outbound.get("segments", []) or []
    first_segment = segments[0] if segments else {}
    last_segment = segments[-1] if segments else {}
    carrier_code = first_segment.get("carrierCode", "")
    flight_number = f"{carrier_code} {first_segment.get('number', '')}".strip()
    price = offer.get("price", {}) or {}
    total = float(price.get("grandTotal") or price.get("total") or 0.0)
    currency = price.get("currency", "USD")
    cabin = ""
    try:
        cabin = (
            offer.get("travelerPricings", [])[0]
            .get("fareDetailsBySegment", [])[0]
            .get("cabin", "")
            .replace("_", " ")
            .title()
        )
    except (IndexError, AttributeError):
        cabin = "Economy"

    stops = max(0, len(segments) - 1)
    return {
        "id": offer.get("id", ""),
        "airline": _carrier_name(carrier_code, dictionaries),
        "airline_code": carrier_code,
        "flight_number": flight_number,
        "origin": first_segment.get("departure", {}).get("iataCode", ""),
        "destination": last_segment.get("arrival", {}).get("iataCode", ""),
        "depart_time": _format_time(first_segment.get("departure", {}).get("at")),
        "arrive_time": _format_time(last_segment.get("arrival", {}).get("at")),
        "duration": _duration_label(outbound.get("duration")),
        "stops": stops,
        "stop_label": "Non-stop" if stops == 0 else f"{stops} stop" if stops == 1 else f"{stops} stops",
        "cabin": cabin,
        "price_total": total,
        "price_per_person": total / max(1, int(adults or 1)),
        "currency": currency,
        "source": "amadeus",
    }


def search_flight_offers(origin, destination, departure_date, return_date, adults, max_results=5):
    """Search Amadeus test flight offers and return normalized flight options.

    The function never raises for missing credentials or API failures; callers can
    fall back to deterministic demo data when an empty list is returned.
    """
    token = get_amadeus_token()
    if not token:
        return []

    params = {
        "originLocationCode": str(origin or "").upper(),
        "destinationLocationCode": str(destination or "").upper(),
        "departureDate": str(departure_date),
        "adults": int(adults or 1),
        "max": int(max_results or 5),
        "currencyCode": "USD",
    }
    if return_date:
        params["returnDate"] = str(return_date)

    try:
        response = requests.get(
            f"{AMADEUS_BASE_URL}/v2/shopping/flight-offers",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
        dictionaries = payload.get("dictionaries", {}) or {}
        offers = payload.get("data", []) or []
        return [_normalize_offer(offer, dictionaries, adults) for offer in offers[:max_results]]
    except (requests.RequestException, ValueError, TypeError):
        return []
