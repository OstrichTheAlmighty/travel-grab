import html
import json
import os
import re
from datetime import date, datetime
from pathlib import Path

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

load_dotenv(dotenv_path=PROJECT_ROOT / ".env")


def _time_from_iso(value):
    if not value:
        return "--:--"
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%H:%M")
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
        "stops": stops,
        "stop_label": "Non-stop" if stops == 0 else f"{stops} stop" if stops == 1 else f"{stops} stops",
        "cabin": flight.get("cabin") or "Economy",
        "baggage": flight.get("baggage") or "",
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


def render():
    selected_flight = st.session_state.get("selected_flight")
    if isinstance(selected_flight, dict) and selected_flight.get("source") != "duffel":
        st.session_state.pop("selected_flight", None)

    st.markdown(
        """
        <style>
        div[data-testid="stForm"] {
            border: 0.5px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.025);
            border-radius: 14px;
            padding: 12px 16px 16px;
        }
        .flight-status-row {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            margin: 8px 0 18px;
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
            min-height: 286px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.025);
            padding: 16px;
            transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
        }
        .flight-card-native:hover {
            border-color: rgba(99,102,241,0.34);
            background: rgba(99,102,241,0.045);
            transform: translateY(-1px);
        }
        .flight-card-native.selected {
            border-color: rgba(99,102,241,0.58);
            background: rgba(99,102,241,0.08);
        }
        .flight-card-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
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
        .flight-price {
            color: #a5b4fc;
            font-size: 24px;
            font-weight: 900;
            letter-spacing: -0.5px;
            text-align: right;
        }
        .flight-price-sub {
            color: rgba(255,255,255,0.36);
            font-size: 11px;
            text-align: right;
        }
        .flight-route {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 0;
            border-top: 1px solid rgba(255,255,255,0.06);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            margin-bottom: 12px;
        }
        .flight-time {
            color: #fff;
            font-size: 20px;
            font-weight: 900;
        }
        .flight-airport {
            color: rgba(255,255,255,0.38);
            font-size: 12px;
            margin-top: 2px;
        }
        .flight-middle {
            flex: 1;
            text-align: center;
            color: rgba(255,255,255,0.38);
            font-size: 11px;
            line-height: 1.5;
        }
        .flight-chip-row {
            display: flex;
            gap: 7px;
            flex-wrap: wrap;
            margin-bottom: 12px;
        }
        .flight-chip {
            padding: 4px 8px;
            border-radius: 7px;
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.58);
            font-size: 11px;
            font-weight: 650;
        }
        .flight-chip.primary {
            background: rgba(99,102,241,0.13);
            color: #c7d2fe;
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
        col_origin, col_destination, col_departure, col_return = st.columns(4)
        with col_origin:
            origin = st.text_input("Origin", value=search_state["origin"], max_chars=3).strip().upper()
        with col_destination:
            destination = st.text_input("Destination", value=search_state["destination"], max_chars=3).strip().upper()
        with col_departure:
            departure_date = st.text_input("Depart", value=search_state["departure_date"], help="Use YYYY-MM-DD.")
        with col_return:
            return_date = st.text_input("Return", value=search_state["return_date"], help="Use YYYY-MM-DD.")

        col_adults, col_cabin, col_sort, col_submit = st.columns([1, 1.5, 1.5, 1])
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

        filter_col_a, filter_col_b = st.columns([1, 1])
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
        if selected_key in offer_keys:
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

    st.markdown("### Flight options")
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

    for index, offer in enumerate(offers[:5]):
        is_selected = index == selected_index
        card_class = "flight-card-native selected" if is_selected else "flight-card-native"
        detail_chips = [
            html.escape(str(offer.get("stop_label") or "")),
            html.escape(str(offer.get("duration") or "")),
            html.escape(str(offer.get("cabin") or "Economy")),
            html.escape(str(offer.get("currency") or "USD")),
        ]
        if offer.get("baggage"):
            detail_chips.append(f"Baggage: {html.escape(str(offer.get('baggage')))}")
        chips_html = "".join(
            f'<span class="flight-chip{" primary" if chip == detail_chips[2] else ""}">{chip}</span>'
            for chip in detail_chips
            if chip
        )
        st.markdown(
            f"""
            <div class="{card_class}">
                <div class="flight-card-top">
                    <div>
                        <div class="flight-airline">{html.escape(str(offer.get('airline') or 'Airline'))}</div>
                        <div class="flight-number">{html.escape(str(offer.get('flight_number') or 'Flight'))} · Provider: Duffel</div>
                    </div>
                    <div>
                        <div class="flight-price">{money_usd(offer.get('price_total'))}</div>
                        <div class="flight-price-sub">total · {html.escape(str(offer.get('currency') or 'USD'))}</div>
                    </div>
                </div>
                <div class="flight-route">
                    <div>
                        <div class="flight-time">{html.escape(str(offer.get('depart_time') or '--:--'))}</div>
                        <div class="flight-airport">{html.escape(str(offer.get('origin') or origin))}</div>
                    </div>
                    <div class="flight-middle">
                        <div>{html.escape(str(offer.get('duration') or ''))}</div>
                        <div>{html.escape(str(offer.get('stop_label') or ''))}</div>
                    </div>
                    <div style="text-align:right">
                        <div class="flight-time">{html.escape(str(offer.get('arrive_time') or '--:--'))}</div>
                        <div class="flight-airport">{html.escape(str(offer.get('destination') or destination))}</div>
                    </div>
                </div>
                <div class="flight-chip-row">{chips_html}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if st.button("Selected" if is_selected else "Select", key=f"select_flight_{index}_{_flight_key(offer)}", type="primary" if is_selected else "secondary"):
            st.session_state["selected_flight_index"] = index
            st.session_state["selected_flight"] = {**offer, "adults": adults}
            st.rerun()
