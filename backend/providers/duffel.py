from __future__ import annotations

import json
import os
import ssl
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DUFFEL_BASE_URL = "https://api.duffel.com"
DUFFEL_VERSION = "v2"
SANDBOX_AIRLINES = {"duffel airways"}
SANDBOX_OWNER_IATA_CODES = {"ZZ"}


def _debug_log(event: str, payload: Dict[str, Any]) -> None:
    """Print structured Duffel diagnostics without exposing API secrets."""
    try:
        print(f"[duffel] {event}: {json.dumps(payload, default=str)}", flush=True)
    except TypeError:
        print(f"[duffel] {event}: {payload}", flush=True)


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _read_env_file(path: Path, key: str) -> Optional[str]:
    """Read one key from a simple KEY=value .env file without logging secrets."""
    if not path.exists():
        return None
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            name, value = stripped.split("=", 1)
            if name.strip() == key:
                cleaned = value.strip().strip('"').strip("'")
                return cleaned or None
    except OSError:
        return None
    return None


def _looks_like_placeholder_secret(value: str) -> bool:
    normalized = str(value or "").strip().upper()
    return not normalized or normalized.startswith("PASTE_") or normalized.endswith("_HERE")


def get_duffel_api_key() -> Optional[str]:
    """Load Duffel API key from environment, backend/.env, or root .env."""
    env_key = os.environ.get("DUFFEL_API_KEY", "").strip()
    if env_key and not _looks_like_placeholder_secret(env_key):
        return env_key

    repo_root = Path(__file__).resolve().parents[2]
    for env_path in (repo_root / "backend" / ".env", repo_root / ".env"):
        file_key = _read_env_file(env_path, "DUFFEL_API_KEY")
        if file_key and not _looks_like_placeholder_secret(file_key):
            return file_key
    return None


def _redacted_headers(api_key: str) -> Dict[str, Any]:
    return {
        "Authorization": "Bearer <redacted>" if api_key else None,
        "Authorization_present": bool(api_key),
        "Authorization_token_length": len(api_key or ""),
        "Duffel-Version": DUFFEL_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _format_money(amount: Any, currency: str) -> str:
    try:
        return f"{currency} {float(amount):,.2f}"
    except (TypeError, ValueError):
        return f"{currency} {amount}" if amount is not None else currency


def _segment_summary(segment: Dict[str, Any]) -> Dict[str, Any]:
    origin = segment.get("origin") or {}
    destination = segment.get("destination") or {}
    marketing_carrier = segment.get("marketing_carrier") or {}
    operating_carrier = segment.get("operating_carrier") or {}
    aircraft = segment.get("aircraft") or {}
    return {
        "origin": origin.get("iata_code") or origin.get("id"),
        "destination": destination.get("iata_code") or destination.get("id"),
        "departure_at": segment.get("departing_at"),
        "arrival_at": segment.get("arriving_at"),
        "marketing_carrier": marketing_carrier.get("name") or marketing_carrier.get("iata_code"),
        "operating_carrier": operating_carrier.get("name") or operating_carrier.get("iata_code"),
        "flight_number": segment.get("marketing_carrier_flight_number"),
        "aircraft": aircraft.get("name") or aircraft.get("iata_code"),
        "duration": segment.get("duration"),
    }


def _segment_cabin(segment: Dict[str, Any]) -> str:
    passengers = segment.get("passengers") or []
    if passengers:
        cabin = passengers[0].get("cabin_class_marketing_name") or passengers[0].get("cabin_class")
        if cabin:
            return str(cabin)
    return "Economy"


def _normalize_offer(offer: Dict[str, Any]) -> Dict[str, Any]:
    slices = offer.get("slices") or []
    first_slice = slices[0] if slices else {}
    segments = first_slice.get("segments") or []
    first_segment = segments[0] if segments else {}
    last_segment = segments[-1] if segments else {}
    first_summary = _segment_summary(first_segment) if first_segment else {}
    last_summary = _segment_summary(last_segment) if last_segment else {}
    owner = offer.get("owner") or {}
    total_amount = offer.get("total_amount")
    total_currency = offer.get("total_currency") or "USD"
    airline = first_summary.get("marketing_carrier") or owner.get("name") or owner.get("iata_code")
    flight_number = first_summary.get("flight_number")

    return {
        "id": offer.get("id"),
        "source": "duffel",
        "provider": "Duffel",
        "airline": airline,
        "flight_number": flight_number,
        "origin": first_summary.get("origin"),
        "destination": last_summary.get("destination"),
        "departure_time": first_summary.get("departure_at"),
        "arrival_time": last_summary.get("arrival_at"),
        "duration": first_slice.get("duration"),
        "stops": max(0, len(segments) - 1),
        "cabin": _segment_cabin(first_segment),
        "price": total_amount,
        "currency": total_currency,
        "owner": owner.get("name") or owner.get("iata_code"),
        "total_amount": total_amount,
        "total_currency": total_currency,
        "total_display": _format_money(total_amount, total_currency),
        "expires_at": offer.get("expires_at"),
        "payment_required_by": offer.get("payment_required_by"),
        "slice_duration": first_slice.get("duration"),
        "segments": [_segment_summary(segment) for segment in segments],
    }


def _is_sandbox_offer(offer: Dict[str, Any]) -> bool:
    owner = offer.get("owner") or {}
    owner_name = str(owner.get("name") or "").strip().lower()
    owner_iata = str(owner.get("iata_code") or "").strip().upper()
    if owner_name in SANDBOX_AIRLINES:
        return True
    if owner_iata in SANDBOX_OWNER_IATA_CODES:
        return True
    for flight_slice in offer.get("slices") or []:
        for segment in flight_slice.get("segments") or []:
            marketing_carrier = segment.get("marketing_carrier") or {}
            operating_carrier = segment.get("operating_carrier") or {}
            marketing_name = str(marketing_carrier.get("name") or "").strip()
            operating_name = str(operating_carrier.get("name") or "").strip()
            if not marketing_name and not operating_name:
                return True
            carrier_names = {
                marketing_name.lower(),
                operating_name.lower(),
            }
            if carrier_names & SANDBOX_AIRLINES:
                return True
    return False


def search_flight_offers(
    origin: str,
    destination: str,
    departure_date: str | date,
    return_date: Optional[str | date] = None,
    adults: int = 1,
    max_results: int = 5,
    cabin_class: str = "economy",
) -> Dict[str, Any]:
    """Search Duffel flight offers and return normalized results.

    This is intentionally backend-only and deterministic in shape. It never
    exposes the API key and returns a structured fallback status on failures.
    """
    api_key = get_duffel_api_key()
    if not api_key:
        debug = {
            "duffel_key_loaded": False,
            "request_payload": None,
            "request_headers": _redacted_headers(""),
            "response_status_code": None,
            "response_body": None,
            "raw_offer_count": 0,
            "filtered_offer_count": 0,
            "normalized_offer_count": 0,
            "filtered_sandbox_count": 0,
        }
        _debug_log("not_configured", debug)
        return {
            "status": "not_configured",
            "source": "duffel",
            "message": "DUFFEL_API_KEY is not configured.",
            "debug": debug,
            "offers": [],
        }

    departure = departure_date.isoformat() if isinstance(departure_date, date) else str(departure_date)
    slices: List[Dict[str, str]] = [
        {
            "origin": origin.upper(),
            "destination": destination.upper(),
            "departure_date": departure,
        }
    ]
    if return_date:
        returning = return_date.isoformat() if isinstance(return_date, date) else str(return_date)
        slices.append(
            {
                "origin": destination.upper(),
                "destination": origin.upper(),
                "departure_date": returning,
            }
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
    debug = {
        "duffel_key_loaded": True,
        "request_payload": payload,
        "request_headers": _redacted_headers(api_key),
        "response_status_code": None,
        "response_body": None,
        "raw_offer_count": 0,
        "filtered_offer_count": 0,
        "normalized_offer_count": 0,
        "filtered_sandbox_count": 0,
        "parse_error": None,
    }
    _debug_log("request", debug)

    try:
        request = Request(
            f"{DUFFEL_BASE_URL}/air/offer_requests",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urlopen(request, timeout=30, context=_ssl_context()) as response:
            debug["response_status_code"] = response.status
            body = response.read().decode("utf-8")
        debug["response_body"] = body
        parsed = json.loads(body)
        data = parsed.get("data") or {}
        raw_offers = data.get("offers") or []
        offers = [offer for offer in raw_offers if not _is_sandbox_offer(offer)]
        debug["raw_offer_count"] = len(raw_offers)
        debug["filtered_offer_count"] = len(offers)
        debug["filtered_sandbox_count"] = len(raw_offers) - len(offers)
        normalized = [_normalize_offer(offer) for offer in offers[: max(1, int(max_results))]]
        debug["normalized_offer_count"] = len(normalized)
        _debug_log("response", debug)
        message = None
        if not raw_offers:
            message = "Duffel sandbox returned no fares for this route."
        elif not offers:
            message = "Duffel sandbox returned only filtered test-carrier fares for this route."
        return {
            "status": "ok",
            "source": "duffel",
            "message": message,
            "origin": origin.upper(),
            "destination": destination.upper(),
            "departure_date": departure,
            "return_date": slices[1]["departure_date"] if len(slices) > 1 else None,
            "offer_request_id": data.get("id"),
            "offer_count": len(offers),
            "raw_offer_count": len(raw_offers),
            "filtered_sandbox_count": len(raw_offers) - len(offers),
            "debug": debug,
            "offers": normalized,
        }
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        debug["response_status_code"] = exc.code
        debug["response_body"] = error_body
        _debug_log("http_error", debug)
        return {
            "status": "error",
            "source": "duffel",
            "message": "Duffel flight search failed.",
            "status_code": exc.code,
            "details": _safe_error_details(error_body),
            "debug": debug,
            "offers": [],
        }
    except URLError as exc:
        debug["parse_error"] = str(exc.reason)
        _debug_log("url_error", debug)
        return {
            "status": "error",
            "source": "duffel",
            "message": "Duffel flight search request failed.",
            "details": str(exc.reason),
            "debug": debug,
            "offers": [],
        }
    except ValueError as exc:
        debug["parse_error"] = str(exc)
        _debug_log("parse_error", debug)
        return {
            "status": "error",
            "source": "duffel",
            "message": "Duffel returned a non-JSON response.",
            "debug": debug,
            "offers": [],
        }


def _safe_error_details(response_text: str) -> Any:
    try:
        return json.loads(response_text)
    except ValueError:
        return response_text[:500]
