import html
import json
import os
import re
import time

import certifi
import requests
import streamlit as st

from analytics import track_event, track_once


HOTEL_PREFERENCES = [
    "Food",
    "Nightlife",
    "Luxury",
    "Shopping",
    "Walkability",
    "Culture",
    "Family Friendly",
    "Lowest Price",
    "Relaxation",
]
DEFAULT_HOTEL_PREFERENCES = ["Food", "Shopping", "Walkability"]
GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_PLACES_FIELD_MASK = (
    "places.displayName,places.formattedAddress,places.location,"
    "places.rating,places.userRatingCount"
)
HOTEL_SEARCH_LIMIT = 8


MOCK_RECOMMENDATIONS = {
    "ginza": {
        "match_preferences": {"Food", "Shopping", "Walkability"},
        "neighborhood": {
            "name": "Ginza / Yurakucho",
            "score": 91,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Excellent restaurant and shopping density.",
                "Walkable streets with easy access to Tokyo Station.",
                "Polished base for a first Tokyo trip.",
            ],
            "cons": [
                "Higher nightly rates than Ueno or Asakusa.",
                "Less nightlife energy than Shinjuku or Shibuya.",
            ],
        },
        "hotel": {
            "name": "Mitsui Garden Hotel Ginza Premier",
            "area": "Ginza · shopping and dining core",
            "type": "Recommended hotel",
            "price": 268,
            "score": 89,
            "why": "Byable recommends this mock stay because it puts food, shopping, and walkability first without jumping to ultra-luxury pricing.",
            "tags": ["Food access", "Shopping", "Walkable"],
            "scores": {
                "Location Match": (9.2, "Strong fit for food, shopping, and walkable Tokyo days."),
                "Transit Access": (8.6, "Close enough to Ginza and Shimbashi lines for cross-city routing."),
                "Value": (8.1, "Pricier than Ueno, but cheaper than the luxury Ginza/Toranomon set."),
                "Room Quality": (8.4, "Mock profile assumes polished upper-midscale rooms."),
                "Safety": (9.0, "Central, well-lit business and shopping district."),
            },
        },
    },
    "nightlife": {
        "match_preferences": {"Nightlife"},
        "neighborhood": {
            "name": "Shinjuku / Shibuya",
            "score": 89,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Best Tokyo base for nightlife, late dining, and energy.",
                "Major rail access for day trips and cross-city plans.",
                "More evening options within walking distance.",
            ],
            "cons": [
                "Busier streets and stations can feel intense.",
                "Rooms can be smaller or louder near entertainment zones.",
            ],
        },
        "hotel": {
            "name": "JR Kyushu Hotel Blossom Shinjuku",
            "area": "Shinjuku · station access",
            "type": "Recommended hotel",
            "price": 286,
            "score": 87,
            "why": "Byable recommends this mock stay for nightlife-focused trips because it keeps late-night food and rail access close.",
            "tags": ["Nightlife", "Station access", "Central"],
            "scores": {
                "Location Match": (9.1, "Strong fit for nightlife and late dining."),
                "Transit Access": (9.0, "Shinjuku Station gives broad local and regional access."),
                "Value": (7.6, "Convenience raises the mock nightly rate."),
                "Room Quality": (8.1, "Mock profile assumes a reliable modern city hotel."),
                "Safety": (8.0, "Central and active, though busier late at night."),
            },
        },
    },
    "culture": {
        "match_preferences": {"Culture"},
        "neighborhood": {
            "name": "Asakusa / Ueno",
            "score": 88,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Close to temples, museums, parks, and older Tokyo streets.",
                "Better value than Ginza or Shinjuku.",
                "Good for slower cultural days.",
            ],
            "cons": [
                "Less polished nightlife and luxury hotel density.",
                "Some routes require transfers to west-side neighborhoods.",
            ],
        },
        "hotel": {
            "name": "Nohga Hotel Ueno Tokyo",
            "area": "Ueno · culture and transit",
            "type": "Recommended hotel",
            "price": 172,
            "score": 86,
            "why": "Byable recommends this mock stay because it prioritizes culture and value near Ueno museums and transit.",
            "tags": ["Culture", "Value", "Museums"],
            "scores": {
                "Location Match": (8.8, "Strong match for museums, parks, and older Tokyo sightseeing."),
                "Transit Access": (8.4, "Ueno gives useful JR and subway access."),
                "Value": (9.0, "Lower mock nightly rate than Ginza, Shinjuku, or Toranomon."),
                "Room Quality": (8.0, "Mock profile assumes design-forward upper-midscale rooms."),
                "Safety": (8.5, "Established sightseeing district with predictable transport."),
            },
        },
    },
    "luxury": {
        "match_preferences": {"Luxury"},
        "neighborhood": {
            "name": "Ginza / Toranomon",
            "score": 90,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Best fit for premium hotels, design, and polished dining.",
                "Strong access to Ginza, Tokyo Station, and central business districts.",
                "Feels elevated without leaving central Tokyo.",
            ],
            "cons": [
                "Highest nightly rates in this mock set.",
                "Less neighborhood texture than Ueno or Asakusa.",
            ],
        },
        "hotel": {
            "name": "The Tokyo Edition, Toranomon",
            "area": "Toranomon · skyline hotel",
            "type": "Recommended hotel",
            "price": 620,
            "score": 88,
            "why": "Byable recommends this mock stay for luxury-focused trips where the hotel experience matters as much as the neighborhood.",
            "tags": ["Luxury", "Design", "Skyline"],
            "scores": {
                "Location Match": (8.8, "Strong fit for premium dining, design hotels, and central access."),
                "Transit Access": (8.2, "Good central access, though not as frictionless as Shinjuku for rail-heavy days."),
                "Value": (6.8, "High mock nightly rate lowers value despite strong quality."),
                "Room Quality": (9.2, "Mock profile assumes the strongest room and design quality in this set."),
                "Safety": (9.1, "Polished central district with predictable business-area access."),
            },
        },
    },
    "price": {
        "match_preferences": {"Lowest Price"},
        "neighborhood": {
            "name": "Ueno / Asakusa",
            "score": 87,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Lowest mock hotel pricing among the recommended areas.",
                "Good cultural access without premium-neighborhood rates.",
                "Useful rail connections from Ueno.",
            ],
            "cons": [
                "Less central for Shibuya, Harajuku, and west-side nightlife.",
                "Fewer luxury hotel choices.",
            ],
        },
        "hotel": {
            "name": "Nohga Hotel Ueno Tokyo",
            "area": "Ueno · culture and transit",
            "type": "Recommended hotel",
            "price": 172,
            "score": 87,
            "why": "Byable recommends this mock stay because it keeps the nightly estimate low while preserving transit and neighborhood character.",
            "tags": ["Lowest price", "Culture", "Transit"],
            "scores": {
                "Location Match": (8.3, "Good fit if value and culture matter more than premium shopping."),
                "Transit Access": (8.4, "Ueno gives useful JR and subway connections."),
                "Value": (9.3, "Lowest recommended mock nightly rate in this prototype."),
                "Room Quality": (8.0, "Mock profile assumes solid design-hotel quality."),
                "Safety": (8.5, "Established visitor area with predictable transport access."),
            },
        },
    },
    "relaxation": {
        "match_preferences": {"Relaxation", "Family Friendly"},
        "neighborhood": {
            "name": "Tokyo Bay / Shiba",
            "score": 86,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Calmer base than Shinjuku or Shibuya.",
                "Better fit for slower mornings and family-friendly pacing.",
                "Useful access to Haneda-side routes.",
            ],
            "cons": [
                "Less dense for late-night food and nightlife.",
                "Some sightseeing days may require longer transit.",
            ],
        },
        "hotel": {
            "name": "Hotel The Celestine Tokyo Shiba",
            "area": "Shiba Park · near Daimon / Hamamatsucho",
            "type": "Recommended hotel",
            "price": 238,
            "score": 88,
            "why": "Byable recommends this mock stay because it gives a calmer Tokyo base while keeping useful transit access.",
            "tags": ["Relaxation", "Quiet base", "Transit access"],
            "scores": {
                "Location Match": (8.6, "Strong fit for a quieter Tokyo base with park access nearby."),
                "Transit Access": (8.9, "Daimon and Hamamatsucho help with Haneda access and Yamanote routing."),
                "Value": (8.4, "Moderate mock rate for a calmer, polished hotel profile."),
                "Room Quality": (8.4, "Mock profile assumes comfortable upper-midscale rooms."),
                "Safety": (9.0, "Calm business district profile with predictable late-evening access."),
            },
        },
    },
}


ALTERNATIVE_HOTELS = [
    {
        "label": "Luxury alternative",
        "name": "The Tokyo Edition, Toranomon",
        "area": "Toranomon · skyline hotel",
        "price": 620,
        "score": 86,
        "why": "Best if the hotel itself should feel like a major part of the trip, but the nightly rate is much higher.",
        "tags": ["Luxury", "Design", "Skyline"],
    },
    {
        "label": "Best value alternative",
        "name": "Nohga Hotel Ueno Tokyo",
        "area": "Ueno · culture and transit",
        "price": 172,
        "score": 84,
        "why": "Lower mock rate with strong neighborhood character and good museum access, but less polished than the recommended pick.",
        "tags": ["Value", "Local feel", "Museums"],
    },
    {
        "label": "Best location alternative",
        "name": "JR Kyushu Hotel Blossom Shinjuku",
        "area": "Shinjuku · station access",
        "price": 286,
        "score": 85,
        "why": "Very convenient for train-heavy sightseeing, but the area can feel busier and less calm at night.",
        "tags": ["Station access", "Central", "Efficient"],
    },
]


def _money(value):
    if value is None:
        return "Not priced"
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return "Not priced"
        try:
            value = float(stripped)
        except ValueError:
            return html.escape(stripped)
    return f"${float(value):,.0f}"


def _escape_list(items):
    return "".join(f"<li>{html.escape(str(item))}</li>" for item in items)


def _select_mock_recommendation(preferences):
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    if "Lowest Price" in selected:
        return MOCK_RECOMMENDATIONS["price"]
    if "Luxury" in selected:
        return MOCK_RECOMMENDATIONS["luxury"]
    if "Relaxation" in selected or "Family Friendly" in selected:
        return MOCK_RECOMMENDATIONS["relaxation"]
    if "Nightlife" in selected:
        return MOCK_RECOMMENDATIONS["nightlife"]
    if "Culture" in selected:
        return MOCK_RECOMMENDATIONS["culture"]
    if "Food" in selected or "Shopping" in selected:
        return MOCK_RECOMMENDATIONS["ginza"]
    return MOCK_RECOMMENDATIONS["ginza"]


def _google_places_api_key():
    try:
        value = st.secrets.get("GOOGLE_PLACES_API_KEY", "")
    except Exception:
        value = ""
    return str(value or os.getenv("GOOGLE_PLACES_API_KEY", "") or "").strip()


def _hotel_openai_api_key():
    try:
        value = st.secrets.get("OPENAI_API_KEY", "")
    except Exception:
        value = ""
    return str(value or os.getenv("OPENAI_API_KEY", "") or "").strip()


def _destination_city():
    search_params = st.session_state.get("flight_search_params") or st.session_state.get("last_flight_search") or {}
    city = str(search_params.get("destination_city") or search_params.get("to_city") or "Tokyo").strip()
    return city or "Tokyo"


def _clean_neighborhood_for_query(neighborhood_name):
    cleaned = re.sub(r"\s*/\s*", " ", str(neighborhood_name or "")).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or "central"


def _normalize_google_place(place):
    location = place.get("location") or {}
    display_name = place.get("displayName") or {}
    return {
        "name": str(display_name.get("text") or "Unnamed hotel").strip(),
        "rating": place.get("rating"),
        "review_count": place.get("userRatingCount"),
        "lat": location.get("latitude"),
        "lng": location.get("longitude"),
        "address": str(place.get("formattedAddress") or "").strip(),
        "source": "google_places",
    }


@st.cache_data(ttl=60 * 60 * 12, show_spinner=False)
def _search_google_places_hotels(api_key, destination_city, neighborhood_name):
    query_neighborhood = _clean_neighborhood_for_query(neighborhood_name)
    payload = {
        "textQuery": f"hotels in {query_neighborhood}, {destination_city}",
        "languageCode": "en",
        "maxResultCount": HOTEL_SEARCH_LIMIT,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
    }
    started = time.perf_counter()
    try:
        response = requests.post(
            GOOGLE_PLACES_TEXT_SEARCH_URL,
            headers=headers,
            json=payload,
            timeout=8,
            verify=certifi.where(),
        )
        response.raise_for_status()
        data = response.json()
        places = [_normalize_google_place(place) for place in data.get("places", [])]
        places = [place for place in places if place.get("name") and place.get("address")]
        return {
            "places": places,
            "error": "",
            "seconds": round(time.perf_counter() - started, 3),
        }
    except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
        return {
            "places": [],
            "error": str(exc),
            "seconds": round(time.perf_counter() - started, 3),
        }


def _fallback_places_from_mock(recommendation):
    hotels = [recommendation["hotel"], *ALTERNATIVE_HOTELS]
    output = []
    for hotel in hotels:
        output.append(
            {
                "name": hotel["name"],
                "rating": 4.4,
                "review_count": 850,
                "lat": None,
                "lng": None,
                "address": hotel.get("area", "Tokyo"),
                "source": "prototype_fallback",
                "mock_price": hotel.get("price"),
                "mock_tags": hotel.get("tags", []),
                "mock_why": hotel.get("why", ""),
            }
        )
    return output


def _rating_to_score(rating, default=7.4):
    try:
        numeric = float(rating)
    except (TypeError, ValueError):
        return default
    return max(5.8, min(9.6, numeric * 2))


def _review_confidence_bonus(review_count):
    try:
        count = int(review_count or 0)
    except (TypeError, ValueError):
        count = 0
    if count >= 1500:
        return 0.5
    if count >= 500:
        return 0.35
    if count >= 150:
        return 0.2
    return 0


def _preference_score_adjustments(preferences):
    selected = set(preferences or [])
    return {
        "location": 0.35 if {"Food", "Shopping", "Nightlife", "Culture", "Walkability"} & selected else 0.1,
        "transit": 0.25 if {"Walkability", "Culture", "Family Friendly"} & selected else 0.05,
        "value": 0.65 if "Lowest Price" in selected else 0.1,
        "room": 0.55 if {"Luxury", "Relaxation"} & selected else 0.1,
        "safety": 0.35 if {"Family Friendly", "Relaxation"} & selected else 0.15,
    }


def _score_live_hotel(place, recommendation, preferences, index=0):
    rating_score = _rating_to_score(place.get("rating"))
    review_bonus = _review_confidence_bonus(place.get("review_count"))
    adjustments = _preference_score_adjustments(preferences)
    neighborhood = recommendation["neighborhood"]["name"]
    is_google = place.get("source") == "google_places"

    location_score = min(9.7, 7.7 + adjustments["location"] + review_bonus + max(0, 0.25 - index * 0.03))
    transit_score = min(9.3, 7.4 + adjustments["transit"] + max(0, 0.25 - index * 0.04))
    value_score = min(9.2, 7.0 + adjustments["value"] + (0.3 if index > 1 else 0.05) + review_bonus / 2)
    room_score = min(9.5, rating_score - 0.2 + adjustments["room"])
    safety_score = min(9.5, 7.8 + adjustments["safety"] + review_bonus / 2)
    scores = {
        "Location Match": (
            round(location_score, 1),
            f"Matched to the Byable-selected {neighborhood} area using Google Places address data.",
        ),
        "Transit Access": (
            round(transit_score, 1),
            "Estimated from neighborhood centrality only; station-level transit data is not connected yet.",
        ),
        "Value": (
            round(value_score, 1),
            "Estimated from rating and review confidence only; live nightly rates are not connected yet.",
        ),
        "Room Quality": (
            round(room_score, 1),
            "Estimated from public Google rating signals, not room inventory or amenities.",
        ),
        "Safety": (
            round(safety_score, 1),
            "Estimated from neighborhood fit and review confidence; safety API data is not connected yet.",
        ),
    }
    overall = round(
        (
            scores["Location Match"][0] * 0.28
            + scores["Transit Access"][0] * 0.18
            + scores["Value"][0] * 0.18
            + scores["Room Quality"][0] * 0.22
            + scores["Safety"][0] * 0.14
        )
        * 10
    )
    tags = [
        "Google Places" if is_google else "Prototype fallback",
        f"{float(place.get('rating')):.1f} rating" if place.get("rating") else "Rating unavailable",
        f"{int(place.get('review_count')):,} reviews" if place.get("review_count") else "Reviews unavailable",
    ]
    return {
        "label": "",
        "type": "Recommended hotel",
        "name": place["name"],
        "area": place.get("address") or f"{neighborhood} · {recommendation['neighborhood']['name']}",
        "price": None if is_google else place.get("mock_price"),
        "score": int(max(70, min(97, overall))),
        "why": place.get("mock_why") or _deterministic_hotel_explanation(place, [], recommendation, preferences),
        "tags": tags,
        "scores": scores,
        "rating": place.get("rating"),
        "review_count": place.get("review_count"),
        "coordinates": {"lat": place.get("lat"), "lng": place.get("lng")},
        "source": place.get("source"),
    }


def _rank_hotels(places, recommendation, preferences):
    deduped = []
    seen_names = set()
    for place in places:
        name_key = str(place.get("name") or "").strip().lower()
        if not name_key or name_key in seen_names:
            continue
        seen_names.add(name_key)
        deduped.append(place)
    scored = [_score_live_hotel(place, recommendation, preferences, index=index) for index, place in enumerate(deduped)]
    return sorted(scored, key=lambda hotel: hotel["score"], reverse=True)


def _pick_alternative_hotels(ranked_hotels):
    candidates = list(ranked_hotels[1:])
    selected = []
    selected_names = set()
    selectors = [
        ("Luxury alternative", "Room Quality"),
        ("Best value alternative", "Value"),
        ("Best location alternative", "Location Match"),
    ]
    for label, score_key in selectors:
        remaining = [hotel for hotel in candidates if hotel["name"] not in selected_names]
        if not remaining:
            break
        best = max(remaining, key=lambda hotel: hotel.get("scores", {}).get(score_key, (0, ""))[0])
        best = dict(best)
        best["label"] = label
        best["type"] = label
        selected.append(best)
        selected_names.add(best["name"])
    for hotel in candidates:
        if len(selected) >= 3:
            break
        if hotel["name"] in selected_names:
            continue
        fallback = dict(hotel)
        fallback["label"] = "Alternative hotel"
        fallback["type"] = "Alternative hotel"
        selected.append(fallback)
        selected_names.add(fallback["name"])
    return selected[:3]


def _deterministic_hotel_explanation(hotel_or_place, alternatives, recommendation, preferences):
    name = hotel_or_place.get("name", "This hotel")
    neighborhood = recommendation["neighborhood"]["name"]
    preference_text = ", ".join((preferences or DEFAULT_HOTEL_PREFERENCES)[:3])
    rating = hotel_or_place.get("rating")
    review_count = hotel_or_place.get("review_count")
    rating_part = ""
    if rating:
        rating_part = f" It has a {float(rating):.1f} Google rating"
        if review_count:
            rating_part += f" across {int(review_count):,} reviews"
        rating_part += "."
    tradeoff = "The main tradeoff is that Byable does not have live nightly rates or booking inventory connected yet."
    if alternatives:
        tradeoff = f"Compared with alternatives like {alternatives[0]['name']}, it ranks higher on Byable's location and review-confidence signals."
    return (
        f"Byable recommends {name} because it fits the {neighborhood} stay strategy and your priorities: "
        f"{preference_text}.{rating_part} {tradeoff}"
    )


def _hotel_ai_cache_key(hotel, alternatives, recommendation, preferences, destination_city):
    payload = {
        "hotel": hotel.get("name"),
        "alternatives": [alt.get("name") for alt in alternatives[:3]],
        "neighborhood": recommendation["neighborhood"]["name"],
        "preferences": list(preferences or []),
        "destination": destination_city,
    }
    return json.dumps(payload, sort_keys=True, default=str)


def _generate_hotel_ai_explanation(hotel, alternatives, recommendation, preferences, destination_city):
    cache = st.session_state.setdefault("hotel_ai_explanation_cache", {})
    cache_key = _hotel_ai_cache_key(hotel, alternatives, recommendation, preferences, destination_city)
    if cache_key in cache:
        return cache[cache_key]
    api_key = _hotel_openai_api_key()
    if not api_key:
        fallback = _deterministic_hotel_explanation(hotel, alternatives, recommendation, preferences)
        cache[cache_key] = fallback
        return fallback
    try:
        from openai import OpenAI

        alt_payload = [
            {
                "name": alt.get("name"),
                "score": alt.get("score"),
                "rating": alt.get("rating"),
                "review_count": alt.get("review_count"),
                "address": alt.get("area"),
            }
            for alt in alternatives[:3]
        ]
        payload = {
            "destination_city": destination_city,
            "selected_neighborhood": recommendation["neighborhood"]["name"],
            "selected_preferences": list(preferences or []),
            "recommended_hotel": {
                "name": hotel.get("name"),
                "score": hotel.get("score"),
                "rating": hotel.get("rating"),
                "review_count": hotel.get("review_count"),
                "address": hotel.get("area"),
                "score_breakdown": hotel.get("scores"),
                "source": hotel.get("source"),
            },
            "alternatives": alt_payload,
        }
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Byable, a premium travel advisor. Return JSON only. "
                        "Use only the provided hotel facts. Do not invent prices, booking availability, amenities, "
                        "room types, safety claims, transit times, or neighborhood facts. Be concise."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Explain why the recommended hotel was selected and the main tradeoff versus alternatives. "
                        "Mention Google rating/review count when useful. If live nightly rates are unavailable, say so plainly. "
                        'Return {"why":"..."}.\n\n'
                        f"Facts:\n{json.dumps(payload, ensure_ascii=True, default=str)}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.25,
            timeout=6,
        )
        raw_text = str(response.choices[0].message.content or "").strip()
        parsed = json.loads(raw_text)
        explanation = str(parsed.get("why") or "").strip()
        if not explanation:
            explanation = _deterministic_hotel_explanation(hotel, alternatives, recommendation, preferences)
        cache[cache_key] = explanation
        return explanation
    except Exception:
        fallback = _deterministic_hotel_explanation(hotel, alternatives, recommendation, preferences)
        cache[cache_key] = fallback
        return fallback


def _inject_hotel_styles():
    st.markdown(
        """
        <style>
        .hotel-page-shell {
            color: #e5e7eb;
        }
        .hotel-kicker {
            color: rgba(199,210,254,0.82);
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 7px;
        }
        .hotel-title {
            color: #fff;
            font-size: 28px;
            font-weight: 900;
            letter-spacing: -0.8px;
            margin-bottom: 5px;
        }
        .hotel-subtitle {
            color: rgba(255,255,255,0.56);
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 18px;
        }
        .hotel-card {
            border: 1px solid rgba(129,140,248,0.18);
            border-radius: 18px;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.13), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018)),
                rgba(7,9,15,0.92);
            padding: 17px 18px;
            margin-bottom: 14px;
            box-shadow: 0 18px 48px rgba(0,0,0,0.16);
        }
        .hotel-card.recommended {
            border-color: rgba(196,181,253,0.28);
            box-shadow: 0 18px 62px rgba(99,102,241,0.12);
        }
        .hotel-card.alt {
            padding: 14px 15px;
            margin-bottom: 11px;
            background:
                linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015)),
                rgba(7,9,15,0.88);
        }
        .hotel-card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 12px;
        }
        .hotel-name {
            color: #fff;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: -0.2px;
            line-height: 1.25;
        }
        .hotel-area {
            color: rgba(255,255,255,0.44);
            font-size: 12px;
            margin-top: 4px;
        }
        .hotel-score {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border-radius: 999px;
            padding: 5px 10px;
            color: #c7d2fe;
            background: rgba(129,140,248,0.12);
            border: 1px solid rgba(129,140,248,0.22);
            font-size: 12px;
            font-weight: 900;
        }
        .hotel-price {
            color: #fff;
            font-size: 25px;
            font-weight: 950;
            letter-spacing: -0.8px;
            text-align: right;
        }
        .hotel-price-sub {
            color: rgba(255,255,255,0.40);
            font-size: 11px;
            text-align: right;
        }
        .hotel-copy {
            color: rgba(255,255,255,0.72);
            font-size: 13px;
            line-height: 1.48;
            margin-bottom: 11px;
        }
        .hotel-section-label {
            color: #c7d2fe;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            margin: 10px 0 6px;
        }
        .hotel-list {
            color: rgba(255,255,255,0.62);
            font-size: 12px;
            line-height: 1.45;
            margin: 0;
            padding-left: 1rem;
        }
        .hotel-chip-row {
            display: flex;
            gap: 7px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .hotel-chip {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.10);
            background: rgba(255,255,255,0.045);
            color: rgba(255,255,255,0.66);
            padding: 4px 9px;
            font-size: 11px;
            font-weight: 750;
        }
        .hotel-chip.primary {
            color: #dbeafe;
            background: linear-gradient(135deg, rgba(99,102,241,0.25), rgba(14,165,233,0.11));
            border-color: rgba(165,180,252,0.20);
        }
        div[data-testid="stMultiSelect"] [data-baseweb="select"] > div {
            border: 1px solid rgba(129,140,248,0.18) !important;
            background: rgba(15,23,42,0.86) !important;
            border-radius: 14px !important;
            color: rgba(255,255,255,0.88) !important;
        }
        div[data-testid="stMultiSelect"] span,
        div[data-testid="stMultiSelect"] div {
            color: rgba(255,255,255,0.86) !important;
        }
        div[data-testid="stMultiSelect"] [data-baseweb="tag"] {
            background: rgba(99,102,241,0.20) !important;
            border: 1px solid rgba(165,180,252,0.20) !important;
        }
        .hotel-score-panel {
            border: 1px solid rgba(129,140,248,0.16);
            border-radius: 16px;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.10), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.016)),
                rgba(7,9,15,0.90);
            padding: 13px 14px;
        }
        .hotel-score-row {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 13px;
            background: rgba(255,255,255,0.035);
            padding: 10px 11px;
            margin-bottom: 9px;
        }
        .hotel-score-row-top {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            color: rgba(255,255,255,0.86);
            font-size: 12px;
            font-weight: 850;
            margin-bottom: 5px;
        }
        .hotel-score-note {
            color: rgba(255,255,255,0.52);
            font-size: 12px;
            line-height: 1.45;
        }
        @media (max-width: 760px) {
            .hotel-card-top {
                flex-direction: column;
            }
            .hotel-price,
            .hotel-price-sub {
                text-align: left;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _score_badge(score):
    return f'<span class="hotel-score">AI Score: {int(score)}</span>'


def _chips(tags, primary_first=False):
    output = []
    for index, tag in enumerate(tags):
        css = "hotel-chip primary" if primary_first and index == 0 else "hotel-chip"
        output.append(f'<span class="{css}">{html.escape(str(tag))}</span>')
    return "".join(output)


def _render_preferences():
    with st.container(border=True):
        st.markdown(
            """
            <div class="hotel-kicker">Hotel preferences</div>
            <div class="hotel-name">What's most important for this trip?</div>
            <div class="hotel-area">Pick the signals Byable should use to choose the neighborhood and score live hotel results.</div>
            """,
            unsafe_allow_html=True,
        )
        selected = st.multiselect(
            "Hotel priorities",
            HOTEL_PREFERENCES,
            default=st.session_state.get("hotel_preferences", DEFAULT_HOTEL_PREFERENCES),
            key="hotel_preferences",
            label_visibility="collapsed",
        )
    return selected or DEFAULT_HOTEL_PREFERENCES


def _render_neighborhood_card(recommendation, preferences):
    neighborhood = recommendation["neighborhood"]
    preference_text = ", ".join(preferences[:4])
    st.markdown(
        f"""
        <div class="hotel-card recommended">
            <div class="hotel-card-top">
                <div>
                    <div class="hotel-kicker">Recommended neighborhood</div>
                    <div class="hotel-name">{html.escape(neighborhood["name"])}</div>
                    <div class="hotel-area">Byable-selected area · used for live hotel search</div>
                </div>
                {_score_badge(neighborhood["score"])}
            </div>
            <div class="hotel-copy">{html.escape(neighborhood["why"])}</div>
            <div class="hotel-chip-row">{_chips([f'Matches: {preference_text}', 'Neighborhood Match score'], primary_first=True)}</div>
            <div class="hotel-section-label">Pros</div>
            <ul class="hotel-list">{_escape_list(neighborhood["pros"])}</ul>
            <div class="hotel-section-label">Cons</div>
            <ul class="hotel-list">{_escape_list(neighborhood["cons"])}</ul>
            <div class="hotel-chip-row">
                {_chips(["Central", "Transit-friendly", "Dining access"], primary_first=True)}
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_hotel_card(hotel, recommended=False):
    card_class = "hotel-card recommended" if recommended else "hotel-card alt"
    price_sub = "per night · rates not connected" if hotel.get("price") is None else "per night"
    st.markdown(
        f"""
        <div class="{card_class}">
            <div class="hotel-card-top">
                <div>
                    <div class="hotel-kicker">{html.escape(hotel["type"] if recommended else hotel["label"])}</div>
                    <div class="hotel-name">{html.escape(hotel["name"])}</div>
                    <div class="hotel-area">{html.escape(hotel["area"])}</div>
                </div>
                <div>
                    <div class="hotel-price">{_money(hotel["price"])}</div>
                    <div class="hotel-price-sub">{price_sub}</div>
                    {_score_badge(hotel["score"])}
                </div>
            </div>
            <div class="hotel-copy">{html.escape(hotel["why"])}</div>
            <div class="hotel-chip-row">{_chips(hotel["tags"], primary_first=True)}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_score_modal(hotel):
    def _content():
        st.markdown("#### Hotel AI Score")
        st.caption(hotel["name"])
        for label, (score, note) in hotel["scores"].items():
            with st.container(border=True):
                row_cols = st.columns([0.72, 0.28])
                with row_cols[0]:
                    st.markdown(f"**{label}**")
                with row_cols[1]:
                    st.markdown(f"**{float(score):.1f}/10**")
                st.caption(note)
        if st.button("Close AI Score", key="close_hotel_score"):
            st.session_state.pop("hotel_score_modal_open", None)
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog("Hotel AI Score")
        def _dialog():
            _content()

        _dialog()
    else:
        with st.container(border=True):
            _content()


def render():
    track_once("page_viewed", key="hotels_page_viewed", properties={"page_name": "hotels"})
    _inject_hotel_styles()
    destination_city = _destination_city()
    st.markdown(
        f"""
        <div class="hotel-page-shell">
            <div class="hotel-kicker">Hotels</div>
            <div class="hotel-title">Where to stay in {html.escape(destination_city)}</div>
            <div class="hotel-subtitle">
                Live hotel discovery using Google Places when configured. Byable scores location fit, review signals,
                and neighborhood strategy; booking links and nightly rate APIs are not connected yet.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    selected_preferences = _render_preferences()
    recommendation = _select_mock_recommendation(selected_preferences)
    google_key = _google_places_api_key()
    places_status = {"places": [], "error": "", "seconds": 0}
    if google_key:
        places_status = _search_google_places_hotels(
            google_key,
            destination_city,
            recommendation["neighborhood"]["name"],
        )
    if places_status.get("places"):
        hotel_places = places_status["places"]
        data_note = f"Live Google Places results · {len(hotel_places)} hotels found"
    else:
        hotel_places = _fallback_places_from_mock(recommendation)
        data_note = (
            "Google Places key not configured; showing prototype fallback hotels"
            if not google_key
            else "Google Places returned no usable hotels; showing prototype fallback hotels"
        )
    ranked_hotels = _rank_hotels(hotel_places, recommendation, selected_preferences)
    recommended_hotel = ranked_hotels[0]
    alternative_hotels = _pick_alternative_hotels(ranked_hotels)
    recommended_hotel["why"] = _generate_hotel_ai_explanation(
        recommended_hotel,
        alternative_hotels,
        recommendation,
        selected_preferences,
        destination_city,
    )

    st.caption(data_note)
    _render_neighborhood_card(recommendation, selected_preferences)

    _render_hotel_card(recommended_hotel, recommended=True)
    action_cols = st.columns([1, 0.24])
    with action_cols[1]:
        if st.button("AI Score", key="recommended_hotel_score"):
            st.session_state["hotel_score_modal_open"] = True
            track_event(
                "hotel_selected",
                {
                    "hotel": recommended_hotel["name"],
                    "price": recommended_hotel["price"],
                    "ai_score": recommended_hotel["score"],
                    "interaction": "score_opened",
                },
            )
            st.rerun()

    st.markdown(
        '<div class="hotel-kicker" style="margin-top:18px">Alternative hotels</div>',
        unsafe_allow_html=True,
    )
    for hotel in alternative_hotels:
        _render_hotel_card(hotel)

    if st.session_state.get("hotel_score_modal_open"):
        _render_score_modal(recommended_hotel)
