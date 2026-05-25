import html
import json
import os
import re
from datetime import date, datetime
from pathlib import Path

import certifi
import requests
import streamlit as st
import streamlit.components.v1 as components

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

_TABLER = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
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
        return "Live Duffel results"
    status = str((payload or {}).get("status") or "").lower()
    if status == "ok":
        return "No fares found"
    return "Duffel unavailable"


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


def airline_logo_class(code):
    code = str(code or "").upper()
    if code == "JL":
        return "al-jal"
    if code == "NH":
        return "al-ana"
    return "al-ua"


def flight_cards_html(offers, live, selected_index, adults):
    cards = []
    for index, offer in enumerate(offers[:5]):
        selected = " selected" if index == selected_index else ""
        label = "Live fare"
        label_class = "fc-label-best" if index == 0 else "fc-label-cheap" if index == 1 else "fc-label-fast"
        confidence = "Duffel test fare"
        cards.append(
            f"""
      <div class="flight-card{selected}" onclick="selectCard(this,'flight')">
        <div class="fc-top">
          <span class="fc-label {label_class}">{html.escape(label)}</span>
          <div class="fc-confidence"><i class="ti ti-shield-check" aria-hidden="true"></i>{html.escape(confidence)}</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo {airline_logo_class(offer.get('airline_code'))}">{html.escape(str(offer.get('airline_code') or 'AIR')[:3])}</div>
          <div class="airline-info">
            <div class="airline-name">{html.escape(str(offer.get('airline') or 'Airline'))}</div>
            <div class="airline-flight">{html.escape(str(offer.get('flight_number') or 'Flight'))}</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">{html.escape(str(offer.get('depart_time') or '--:--'))}</div>
            <div class="fc-ap">{html.escape(str(offer.get('origin') or 'SFO'))}</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">{html.escape(str(offer.get('duration') or ''))}</div>
            <div class="fc-arr-stop">{html.escape(str(offer.get('stop_label') or ''))}</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">{html.escape(str(offer.get('arrive_time') or '--:--'))}</div>
            <div class="fc-ap">{html.escape(str(offer.get('destination') or 'HND'))}</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail detail-chip-prem">{html.escape(str(offer.get('cabin') or 'Economy'))}</span>
          <span class="fc-detail detail-chip">Round trip</span>
          <span class="fc-detail detail-chip">{html.escape(str(adults))} {"traveler" if int(adults) == 1 else "travelers"}</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">per person</div>
            <div><span class="fc-price" style="color:#a5b4fc">{money_usd(offer.get('price_per_person'))}</span><span class="fc-price-pp">RT</span></div>
          </div>
          <div class="fc-select-btn">{"Selected" if index == selected_index else "Select"}</div>
        </div>
      </div>
            """
        )
    return "\n".join(cards)


def empty_state_html(status_text, message):
    return f"""
    <div class="empty-state">
      <div class="empty-icon"><i class="ti ti-plane-off" aria-hidden="true"></i></div>
      <div class="empty-title">{html.escape(status_text)}</div>
      <div class="empty-copy">{html.escape(message)}</div>
    </div>
    """


def render():
    selected_flight = st.session_state.get("selected_flight")
    if isinstance(selected_flight, dict) and selected_flight.get("source") != "duffel":
        st.session_state.pop("selected_flight", None)

    st.caption(f"DUFFEL_API_KEY loaded: {bool(_duffel_api_key())}")

    st.markdown(
        """
        <style>
        div[data-testid="stForm"] {
            border: 0.5px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.025);
            border-radius: 14px;
            padding: 12px 16px 16px;
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

    api_status = _api_status(debug_payload, live, offers)
    badge = api_status
    subtitle = "Duffel test mode — fares are API test fares, not final ticketed prices."
    if offers:
        cards = flight_cards_html(offers, live, selected_index, adults)
    else:
        empty_message = (debug_payload or {}).get("message") or "No live fares found for these dates."
        cards = empty_state_html(api_status, empty_message)
    date_label = f"{departure_iso} → {return_iso}"
    traveler_label = f"{adults} {'traveler' if adults == 1 else 'travelers'}"
    page = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="{_TABLER}">
<style>
html,body{{margin:0;padding:0;background:#07090f;}}
*{{box-sizing:border-box;margin:0;padding:0}}
.fs{{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 60px}}
.fs-header{{padding:28px 32px 0}}
.fs-eyebrow{{font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:8px}}
.fs-title{{font-size:28px;font-weight:800;letter-spacing:-0.8px;color:#fff;margin-bottom:6px}}
.fs-meta{{display:flex;align-items:center;gap:10px;flex-wrap:wrap}}
.fs-meta-item{{display:flex;align-items:center;gap:5px;font-size:13px;color:rgba(255,255,255,0.4)}}
.section{{padding:28px 32px 0}}
.sec-header{{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:16px;flex-wrap:wrap}}
.sec-title{{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700}}
.sec-sub{{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;line-height:1.5}}
.source-badge{{font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(52,211,153,0.1);border:0.5px solid rgba(52,211,153,0.25);color:#34d399}}
.source-badge.unavailable{{background:rgba(251,191,36,0.1);border-color:rgba(251,191,36,0.25);color:#fbbf24}}
.route-vis{{display:flex;align-items:center;gap:0;padding:16px 20px;border-radius:14px;background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.07);margin-bottom:20px}}
.rv-city{{min-width:0}} .rv-code{{font-size:28px;font-weight:800;letter-spacing:-1px;color:#fff}} .rv-name{{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px}}
.rv-mid{{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 16px}} .rv-line{{width:100%;height:1px;background:rgba(255,255,255,0.1);position:relative}} .rv-plane{{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#07090f;padding:0 6px;font-size:14px;color:#818cf8}} .rv-dur{{font-size:11px;color:rgba(255,255,255,0.3);margin-top:10px}}
.flights-scroll{{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}}
.flights-scroll::-webkit-scrollbar{{height:3px}} .flights-scroll::-webkit-scrollbar-track{{background:rgba(255,255,255,0.04);border-radius:2px}} .flights-scroll::-webkit-scrollbar-thumb{{background:rgba(99,102,241,0.4);border-radius:2px}}
.flight-card{{flex:0 0 300px;border-radius:14px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.025);padding:16px;cursor:pointer;transition:border-color 0.15s,background 0.15s;position:relative}}
.flight-card:hover{{border-color:rgba(99,102,241,0.3);background:rgba(99,102,241,0.04)}} .flight-card.selected{{border-color:rgba(99,102,241,0.5);background:rgba(99,102,241,0.07)}}
.fc-top{{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px}} .fc-label{{font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 8px;border-radius:5px;white-space:normal}} .fc-label-cheap{{background:rgba(52,211,153,0.12);color:#34d399}} .fc-label-fast{{background:rgba(56,189,248,0.12);color:#38bdf8}} .fc-label-best{{background:rgba(99,102,241,0.15);color:#a5b4fc}} .fc-confidence{{display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.3);white-space:normal}}
.airline-row{{display:flex;align-items:center;gap:8px;margin-bottom:12px}} .airline-logo{{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;letter-spacing:0.3px;flex-shrink:0}} .al-jal{{background:#8b0000;color:#fca5a5}} .al-ana{{background:#003087;color:#93c5fd}} .al-ua{{background:#162b5c;color:#bfdbfe}} .airline-info{{flex:1;min-width:0}} .airline-name{{font-size:13px;font-weight:600}} .airline-flight{{font-size:11px;color:rgba(255,255,255,0.3)}}
.fc-times{{display:flex;align-items:center;gap:0;margin-bottom:10px}} .fc-t{{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#fff}} .fc-ap{{font-size:11px;color:rgba(255,255,255,0.3);margin-top:1px}} .fc-arrow{{flex:1;display:flex;flex-direction:column;align-items:center;padding:0 10px;padding-top:4px}} .fc-arr-line{{width:100%;height:0.5px;background:rgba(255,255,255,0.1)}} .fc-arr-dur{{font-size:10px;color:rgba(255,255,255,0.25);margin-top:3px;white-space:normal}} .fc-arr-stop{{font-size:10px;color:rgba(56,189,248,0.7)}}
.fc-details{{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}} .fc-detail{{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}} .detail-chip{{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.45)}} .detail-chip-prem{{background:rgba(99,102,241,0.1);color:#c7d2fe}}
.fc-bottom{{display:flex;align-items:flex-end;justify-content:space-between;border-top:0.5px solid rgba(255,255,255,0.06);padding-top:10px}} .fc-price-label{{font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:2px}} .fc-price{{font-size:22px;font-weight:800;letter-spacing:-0.5px}} .fc-price-pp{{font-size:11px;color:rgba(255,255,255,0.3);margin-left:2px}} .fc-select-btn{{font-size:11px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer;border:0.5px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.12);color:#a5b4fc}}
.empty-state{{width:100%;border-radius:16px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.025);padding:34px 24px;text-align:center}}
.empty-icon{{width:42px;height:42px;margin:0 auto 12px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:rgba(251,191,36,0.1);color:#fbbf24;font-size:20px}}
.empty-title{{font-size:16px;font-weight:800;color:#fff;margin-bottom:6px}}
.empty-copy{{font-size:13px;line-height:1.5;color:rgba(255,255,255,0.42);max-width:420px;margin:0 auto}}
@media(max-width:720px){{.route-vis{{flex-direction:column;align-items:flex-start;gap:12px}}.rv-mid{{width:100%;padding:0}}.flight-card{{flex-basis:86vw}}}}
</style>
</head>
<body>
<div class="fs">
  <div class="fs-header">
    <div class="fs-eyebrow">Flights</div>
    <div class="fs-title">Flight options</div>
    <div class="fs-meta">
      <div class="fs-meta-item"><i class="ti ti-calendar" aria-hidden="true"></i>{html.escape(date_label)}</div>
      <span style="color:rgba(255,255,255,0.12)">·</span>
      <div class="fs-meta-item"><i class="ti ti-users" aria-hidden="true"></i>{html.escape(traveler_label)}</div>
      <span style="color:rgba(255,255,255,0.12)">·</span>
      <div class="fs-meta-item"><i class="ti ti-map-pin" aria-hidden="true"></i>{html.escape(origin)} → {html.escape(destination)}</div>
    </div>
  </div>
  <div class="section">
    <div class="sec-header">
      <div>
        <div class="sec-title" style="color:#fff"><i class="ti ti-plane" style="color:#818cf8" aria-hidden="true"></i>Round-trip flight search</div>
        <div class="sec-sub">{html.escape(subtitle)}</div>
      </div>
      <span class="source-badge {'unavailable' if not offers else ''}">{html.escape(badge)}</span>
    </div>
    <div class="route-vis">
      <div class="rv-city"><div class="rv-code">{html.escape(origin)}</div><div class="rv-name">Origin</div></div>
      <div class="rv-mid"><div class="rv-line"><div class="rv-plane"><i class="ti ti-plane" aria-hidden="true"></i></div></div><div class="rv-dur">Round-trip · {html.escape(traveler_label)}</div></div>
      <div class="rv-city" style="text-align:right"><div class="rv-code">{html.escape(destination)}</div><div class="rv-name">Destination</div></div>
    </div>
    <div class="flights-scroll">{cards}</div>
  </div>
</div>
<script>
function selectCard(card, group){{
  var cards=card.closest('.flights-scroll').querySelectorAll('.flight-card');
  cards.forEach(function(c){{
    c.classList.remove('selected');
    var btn=c.querySelector('.fc-select-btn');
    if(btn) btn.textContent='Select';
  }});
  card.classList.add('selected');
  var selBtn=card.querySelector('.fc-select-btn');
  if(selBtn) selBtn.textContent='Selected';
}}
</script>
</body>
</html>"""
    components.html(page, height=980, scrolling=False)

    if offers:
        options = [
            f"{offer.get('airline')} {offer.get('flight_number')} · {offer.get('depart_time')} → {offer.get('arrive_time')} · {money_usd(offer.get('price_total'))} total"
            for offer in offers
        ]
        selected_option = st.radio(
            "Use this flight in Overview",
            options=list(range(len(options))),
            index=selected_index,
            format_func=lambda idx: options[idx],
            horizontal=False,
        )
        if selected_option != selected_index:
            st.session_state["selected_flight_index"] = int(selected_option)
            selected_index = int(selected_option)
        selected_flight = {**offers[selected_index], "adults": adults}
        st.session_state["selected_flight"] = selected_flight
        st.success(
            f"Overview flight cost updated to {money_usd(selected_flight.get('price_total'))} "
            f"for {selected_flight.get('airline')} {selected_flight.get('flight_number')}."
        )
