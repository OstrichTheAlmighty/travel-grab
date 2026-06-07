import html
import streamlit as st

from analytics import track_event, track_once
from places_hotels import google_places_key_configured, search_hotels_with_google_places


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
NEIGHBORHOOD_TO_RECOMMENDATION = {
    "Ginza / Yurakucho": "ginza",
    "Shinjuku / Shibuya": "nightlife",
    "Ueno / Asakusa": "price",
    "Ginza / Toranomon": "luxury",
    "Tokyo Bay / Shiba": "relaxation",
}


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
            "why": "Byable recommends this stay because it puts food, shopping, and walkability first without jumping to ultra-luxury pricing.",
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
            "why": "Byable recommends this stay for nightlife-focused trips because it keeps late-night food and rail access close.",
            "tags": ["Nightlife", "Station access", "Central"],
            "scores": {
                "Location Match": (9.1, "Strong fit for nightlife and late dining."),
                "Transit Access": (9.0, "Shinjuku Station gives broad local and regional access."),
                "Value": (7.6, "Convenience raises the estimated nightly rate."),
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
            "why": "Byable recommends this stay because it prioritizes culture and value near Ueno museums and transit.",
            "tags": ["Culture", "Value", "Museums"],
            "scores": {
                "Location Match": (8.8, "Strong match for museums, parks, and older Tokyo sightseeing."),
                "Transit Access": (8.4, "Ueno gives useful JR and subway access."),
                "Value": (9.0, "Lower estimated nightly rate than Ginza, Shinjuku, or Toranomon."),
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
                "Highest nightly rates in this recommended set.",
                "Less neighborhood texture than Ueno or Asakusa.",
            ],
        },
        "hotel": {
            "name": "The Tokyo Edition, Toranomon",
            "area": "Toranomon · skyline hotel",
            "type": "Recommended hotel",
            "price": 620,
            "score": 88,
            "why": "Byable recommends this stay for luxury-focused trips where the hotel experience matters as much as the neighborhood.",
            "tags": ["Luxury", "Design", "Skyline"],
            "scores": {
                "Location Match": (8.8, "Strong fit for premium dining, design hotels, and central access."),
                "Transit Access": (8.2, "Good central access, though not as frictionless as Shinjuku for rail-heavy days."),
                "Value": (6.8, "High estimated nightly rate lowers value despite strong quality."),
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
                "Lowest hotel pricing among the recommended areas.",
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
            "why": "Byable recommends this stay because it keeps the nightly estimate low while preserving transit and neighborhood character.",
            "tags": ["Lowest price", "Culture", "Transit"],
            "scores": {
                "Location Match": (8.3, "Good fit if value and culture matter more than premium shopping."),
                "Transit Access": (8.4, "Ueno gives useful JR and subway connections."),
                "Value": (9.3, "Lowest recommended estimated nightly rate in this recommendation set."),
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
            "why": "Byable recommends this stay because it gives a calmer Tokyo base while keeping useful transit access.",
            "tags": ["Relaxation", "Quiet base", "Transit access"],
            "scores": {
                "Location Match": (8.6, "Strong fit for a quieter Tokyo base with park access nearby."),
                "Transit Access": (8.9, "Daimon and Hamamatsucho help with Haneda access and Yamanote routing."),
                "Value": (8.4, "Moderate estimated rate for a calmer, polished hotel profile."),
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
        "why": "Lower estimated rate with strong neighborhood character and good museum access, but less polished than the recommended pick.",
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


NEIGHBORHOOD_PROFILES = [
    {
        "name": "Ginza / Yurakucho",
        "best_for": "Food, shopping, polished first-trip convenience",
        "preference_tags": {"Food", "Shopping", "Walkability", "Luxury"},
        "base_score": 8.7,
        "convenience": 9.0,
        "value": 7.1,
        "tradeoff": "More expensive and calmer at night than Shinjuku or Shibuya.",
        "good_fit": [
            "Restaurants, department stores, and polished streets close together.",
            "Easy Tokyo Station, Ginza, and Shimbashi access for first-time days.",
        ],
    },
    {
        "name": "Shinjuku / Shibuya",
        "best_for": "Nightlife, energy, late dining, station access",
        "preference_tags": {"Nightlife", "Food", "Shopping", "Walkability"},
        "base_score": 8.5,
        "convenience": 9.3,
        "value": 7.4,
        "tradeoff": "Busier streets and stations can feel less relaxing.",
        "good_fit": [
            "Late dining, nightlife, and after-dark energy.",
            "Major station access for cross-city sightseeing.",
        ],
    },
    {
        "name": "Ueno / Asakusa",
        "best_for": "Culture, museums, temples, lower nightly rates",
        "preference_tags": {"Culture", "Lowest Price", "Family Friendly"},
        "base_score": 8.2,
        "convenience": 8.2,
        "value": 9.2,
        "tradeoff": "Less central for west-side nightlife, luxury, and shopping.",
        "good_fit": [
            "Museums, temples, parks, and older Tokyo atmosphere.",
            "Usually better hotel value than Shinjuku/Shibuya.",
        ],
    },
    {
        "name": "Ginza / Toranomon",
        "best_for": "Luxury, design hotels, premium dining",
        "preference_tags": {"Luxury", "Food", "Relaxation"},
        "base_score": 8.4,
        "convenience": 8.3,
        "value": 6.6,
        "tradeoff": "Highest rates and less neighborhood texture than Ueno or Asakusa.",
        "good_fit": [
            "Premium hotels, design-forward stays, and polished dining.",
            "A calmer luxury base than Shinjuku/Shibuya.",
        ],
    },
    {
        "name": "Tokyo Bay / Shiba",
        "best_for": "Relaxation, family pacing, quieter evenings",
        "preference_tags": {"Relaxation", "Family Friendly"},
        "base_score": 7.9,
        "convenience": 8.1,
        "value": 8.0,
        "tradeoff": "Less dense for nightlife, food hopping, and shopping.",
        "good_fit": [
            "Slower mornings, calmer evenings, and family-friendly pacing.",
            "Useful Haneda-side routing and quieter hotel areas.",
        ],
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


def _rating_text(hotel):
    rating = hotel.get("rating")
    try:
        return f"{float(rating):.1f} ★" if rating else ""
    except (TypeError, ValueError):
        return ""


def _review_count_text(hotel):
    try:
        count = int(hotel.get("review_count") or 0)
    except (TypeError, ValueError):
        count = 0
    return f"{count:,} reviews" if count else "Reviews unavailable"


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


def _destination_city():
    search_params = st.session_state.get("flight_search_params") or st.session_state.get("last_flight_search") or {}
    city = str(search_params.get("destination_city") or search_params.get("to_city") or "Tokyo").strip()
    return city or "Tokyo"


HOTEL_FACTOR_PROFILES = {
    "Mitsui Garden Hotel Ginza Premier": {
        "Location Match": (9.3, "Strong fit for Ginza food, shopping, and walkable first-trip days."),
        "Transit Access": (8.7, "Useful Ginza/Shimbashi/Tokyo Station access without needing a car."),
        "Value": (7.8, "Pricier than Ueno, but less expensive than luxury Ginza/Toranomon hotels."),
        "Room Quality": (8.4, "Upper-midscale profile with polished rooms and skyline-oriented positioning."),
        "Safety": (9.1, "Central, well-lit shopping and business district profile."),
        "preference_tags": {"Food", "Shopping", "Walkability"},
    },
    "JR Kyushu Hotel Blossom Shinjuku": {
        "Location Match": (8.8, "Best fit for nightlife, late dining, and west-side Tokyo energy."),
        "Transit Access": (9.3, "Shinjuku Station gives the strongest rail access in this recommended set."),
        "Value": (7.5, "Convenience raises the nightly rate versus Ueno or Asakusa."),
        "Room Quality": (8.2, "Reliable modern city-hotel profile."),
        "Safety": (8.0, "Central and active, though the area can feel busier late at night."),
        "preference_tags": {"Nightlife", "Walkability"},
    },
    "Nohga Hotel Ueno Tokyo": {
        "Location Match": (8.4, "Strong fit for museums, parks, older Tokyo, and slower cultural days."),
        "Transit Access": (8.5, "Ueno gives useful JR and subway connections across Tokyo."),
        "Value": (9.3, "Lowest estimated nightly rate among the core Byable options."),
        "Room Quality": (8.1, "Solid design-hotel profile without luxury pricing."),
        "Safety": (8.5, "Established visitor area with predictable transport access."),
        "preference_tags": {"Culture", "Lowest Price", "Walkability"},
    },
    "The Tokyo Edition, Toranomon": {
        "Location Match": (8.7, "Strong fit for premium dining, design hotels, and polished central Tokyo."),
        "Transit Access": (8.1, "Central, but less frictionless than Shinjuku for rail-heavy sightseeing."),
        "Value": (6.5, "Highest estimated nightly rate lowers value despite strong quality."),
        "Room Quality": (9.5, "Strongest luxury and room-quality profile in this set."),
        "Safety": (9.2, "Polished central business district with predictable access."),
        "preference_tags": {"Luxury", "Food", "Relaxation"},
    },
    "Hotel The Celestine Tokyo Shiba": {
        "Location Match": (8.2, "Best for a calmer base near parks and Haneda-side routing."),
        "Transit Access": (8.8, "Daimon and Hamamatsucho support useful airport and Yamanote access."),
        "Value": (8.4, "Moderate estimated rate for a quieter, polished hotel profile."),
        "Room Quality": (8.5, "Comfortable upper-midscale profile."),
        "Safety": (9.0, "Calm business district profile with predictable late-evening access."),
        "preference_tags": {"Relaxation", "Family Friendly"},
    },
}


def _base_mock_hotels():
    hotels = []
    seen = set()
    for recommendation in MOCK_RECOMMENDATIONS.values():
        hotel = dict(recommendation["hotel"])
        if hotel["name"] not in seen:
            hotels.append(hotel)
            seen.add(hotel["name"])
    for hotel in ALTERNATIVE_HOTELS:
        if hotel["name"] not in seen:
            item = dict(hotel)
            item.setdefault("type", item.get("label", "Alternative hotel"))
            hotels.append(item)
            seen.add(item["name"])
    return hotels


def _trip_fit_factor(hotel_name, preferences):
    profile = HOTEL_FACTOR_PROFILES.get(hotel_name, {})
    tags = set(profile.get("preference_tags") or [])
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    if not selected:
        return 7.2, "Neutral fit because no hotel preferences were selected."
    matches = sorted(tags & selected)
    ratio = len(matches) / max(1, min(len(selected), 3))
    score = round(max(6.2, min(9.7, 6.4 + ratio * 3.0)), 1)
    if matches:
        note = f"Matches selected priorities: {', '.join(matches[:3])}."
    else:
        note = "Less directly aligned with the selected hotel priorities."
    return score, note


def _score_mock_hotel(hotel, preferences):
    profile = HOTEL_FACTOR_PROFILES.get(hotel["name"], {})
    scores = {
        key: profile.get(key, (7.5, "Byable score based on current stay assumptions."))
        for key in ("Location Match", "Transit Access", "Value", "Room Quality", "Safety")
    }
    scores["Trip Fit"] = _trip_fit_factor(hotel["name"], preferences)
    weighted = (
        scores["Location Match"][0] * 0.22
        + scores["Transit Access"][0] * 0.15
        + scores["Value"][0] * 0.17
        + scores["Room Quality"][0] * 0.17
        + scores["Safety"][0] * 0.11
        + scores["Trip Fit"][0] * 0.18
    )
    scored = dict(hotel)
    scored["scores"] = scores
    scored["score"] = int(round(weighted * 10))
    scored["trip_fit"] = scores["Trip Fit"][0]
    scored["type"] = scored.get("type") or "Recommended hotel"
    scored["tags"] = scored.get("tags") or sorted(profile.get("preference_tags") or [])[:3]
    return scored


def _price_level_label(price_level):
    labels = {
        "PRICE_LEVEL_FREE": "Free",
        "PRICE_LEVEL_INEXPENSIVE": "Lower price",
        "PRICE_LEVEL_MODERATE": "Moderate price",
        "PRICE_LEVEL_EXPENSIVE": "Higher price",
        "PRICE_LEVEL_VERY_EXPENSIVE": "Premium price",
    }
    return labels.get(str(price_level or ""), "Price unavailable")


def _price_level_value_score(price_level):
    scores = {
        "PRICE_LEVEL_FREE": 9.5,
        "PRICE_LEVEL_INEXPENSIVE": 9.2,
        "PRICE_LEVEL_MODERATE": 8.1,
        "PRICE_LEVEL_EXPENSIVE": 6.8,
        "PRICE_LEVEL_VERY_EXPENSIVE": 5.8,
    }
    return scores.get(str(price_level or ""), 7.7)


def _review_count_bonus(review_count):
    try:
        count = int(review_count or 0)
    except (TypeError, ValueError):
        count = 0
    if count >= 2000:
        return 0.6
    if count >= 750:
        return 0.4
    if count >= 200:
        return 0.25
    return 0


def _rating_quality_score(rating, review_count):
    try:
        rating_value = float(rating or 0)
    except (TypeError, ValueError):
        rating_value = 0
    if rating_value <= 0:
        return 7.2
    return round(max(6.2, min(9.7, rating_value * 2 + _review_count_bonus(review_count))), 1)


def _neighborhood_safety_score(scored_neighborhood):
    safety_scores = {
        "Ginza / Yurakucho": 9.1,
        "Shinjuku / Shibuya": 8.0,
        "Ueno / Asakusa": 8.5,
        "Ginza / Toranomon": 9.2,
        "Tokyo Bay / Shiba": 9.0,
    }
    return safety_scores.get(scored_neighborhood.get("name"), 8.4)


def _live_trip_fit_score(hotel, scored_neighborhood, preferences):
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    neighborhood_tags = set(scored_neighborhood.get("preference_tags") or [])
    matches = selected & neighborhood_tags
    score = 6.5 + min(2.4, len(matches) * 0.8)
    price_level = str(hotel.get("price_level") or "")
    if "Lowest Price" in selected and price_level in {"PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"}:
        score += 0.6
    if "Luxury" in selected and price_level in {"PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"}:
        score += 0.5
    if {"Food", "Shopping", "Walkability"} & selected and scored_neighborhood.get("name") in {"Ginza / Yurakucho", "Shinjuku / Shibuya"}:
        score += 0.35
    return round(max(6.0, min(9.6, score)), 1)


def _score_google_hotel(hotel, preferences, scored_neighborhood):
    neighborhood_name = scored_neighborhood["name"]
    neighborhood_match = round(max(6.8, min(9.7, scored_neighborhood["score"] / 10)), 1)
    transit = round(float(scored_neighborhood.get("convenience") or 8.0), 1)
    safety = round(_neighborhood_safety_score(scored_neighborhood), 1)
    value = round(_price_level_value_score(hotel.get("price_level")), 1)
    room = _rating_quality_score(hotel.get("rating"), hotel.get("review_count"))
    trip_fit = _live_trip_fit_score(hotel, scored_neighborhood, preferences)
    scores = {
        "Location Match": (
            neighborhood_match,
            f"Matched to the selected {neighborhood_name} stay area.",
        ),
        "Transit Access": (
            transit,
            "Based on the selected neighborhood's transit and walkability profile.",
        ),
        "Value": (
            value,
            f"Based on Google Places price level: {_price_level_label(hotel.get('price_level'))}.",
        ),
        "Room Quality": (
            room,
            f"Based on Google rating {hotel.get('rating') or 'unavailable'} and {int(hotel.get('review_count') or 0):,} reviews.",
        ),
        "Safety": (
            safety,
            "Based on the selected neighborhood's current safety profile.",
        ),
        "Trip Fit": (
            trip_fit,
            "Based on selected hotel preferences and neighborhood alignment.",
        ),
    }
    weighted = (
        scores["Location Match"][0] * 0.22
        + scores["Transit Access"][0] * 0.15
        + scores["Value"][0] * 0.17
        + scores["Room Quality"][0] * 0.17
        + scores["Safety"][0] * 0.11
        + scores["Trip Fit"][0] * 0.18
    )
    tags = [
        f"{float(hotel.get('rating')):.1f} rating" if hotel.get("rating") else "Rating unavailable",
        f"{int(hotel.get('review_count') or 0):,} reviews" if hotel.get("review_count") else "Reviews unavailable",
    ]
    price_label = _price_level_label(hotel.get("price_level"))
    if price_label != "Price unavailable":
        tags.append(price_label)
    return {
        "name": hotel["name"],
        "area": hotel.get("address") or neighborhood_name,
        "type": "Recommended hotel",
        "label": "Alternative hotel",
        "price": None,
        "price_subtitle": "Google price level",
        "score": int(round(weighted * 10)),
        "trip_fit": trip_fit,
        "why": "",
        "tags": tags,
        "scores": scores,
        "rating": hotel.get("rating"),
        "review_count": hotel.get("review_count"),
        "lat": hotel.get("lat"),
        "lng": hotel.get("lng"),
        "price_level": hotel.get("price_level"),
        "source": "google_places",
    }


def _rank_google_hotels(google_hotels, preferences, scored_neighborhood):
    scored = [_score_google_hotel(hotel, preferences, scored_neighborhood) for hotel in google_hotels]
    return sorted(scored, key=lambda hotel: hotel["score"], reverse=True)


def _rank_mock_hotels(preferences):
    ranked = [_score_mock_hotel(hotel, preferences) for hotel in _base_mock_hotels()]
    return sorted(ranked, key=lambda hotel: hotel["score"], reverse=True)


def _hotel_recommendation_copy(hotel, preferences):
    preference_text = ", ".join((preferences or DEFAULT_HOTEL_PREFERENCES)[:3])
    rating = _rating_text(hotel)
    rating_text = " Public Google reviews add confidence in the stay." if rating else ""
    return (
        f"Byable recommends this stay because it gives you a practical base for {preference_text} without making the hotel decision feel complicated."
        f"{rating_text}"
    )


def _hotel_pick_bullets(hotel, recommended_neighborhood, preferences):
    neighborhood_name = recommended_neighborhood.get("name") or "the selected neighborhood"
    preference_text = ", ".join((preferences or DEFAULT_HOTEL_PREFERENCES)[:3])
    bullets = []

    neighborhood_benefits = {
        "Ginza / Yurakucho": "Convenient base for restaurants, shopping, Tokyo Station, and polished first-time days.",
        "Shinjuku / Shibuya": "Convenient base for food, shopping, nightlife, and rail-heavy day trips.",
        "Ueno / Asakusa": "Good base for museums, temples, parks, and traditional Tokyo atmosphere.",
        "Ginza / Toranomon": "Upscale base for premium dining, design hotels, and quieter evenings.",
        "Tokyo Bay / Shiba": "Calmer base for slower mornings, family pacing, and Haneda-side routing.",
    }
    bullets.append(
        neighborhood_benefits.get(
            neighborhood_name,
            f"Convenient base in {neighborhood_name} for your planned Tokyo stay.",
        )
    )

    rating = _rating_text(hotel)
    if rating:
        bullets.append("Strong public Google review signal for the overall stay experience.")
    else:
        bullets.append("Keeps the stay recommendation focused on location and trip needs while live review details are limited.")

    if {"Food", "Shopping", "Walkability"} & set(preferences or []):
        bullets.append("Useful for food, shopping, and walkable days without over-planning transit.")
    elif "Culture" in set(preferences or []):
        bullets.append("Helpful base for cultural sightseeing without needing a complicated hotel strategy.")
    elif "Luxury" in set(preferences or []):
        bullets.append("Better aligned with a polished, premium stay experience.")
    elif "Lowest Price" in set(preferences or []):
        bullets.append("Keeps the hotel choice oriented around value instead of unnecessary upgrades.")
    else:
        bullets.append(f"Matches your selected priorities: {preference_text}.")

    address = str(hotel.get("area") or "")
    if address and neighborhood_name.split(" / ")[0] in address:
        bullets.append(f"Located in the area Byable selected for this trip: {neighborhood_name}.")

    return bullets[:4]


def _hotel_identity_profile(hotel, recommended_hotel=None, recommended=False):
    name = str(hotel.get("name") or "")
    name_key = name.lower()
    area = str(hotel.get("area") or "").lower()
    label = str(hotel.get("label") or hotel.get("type") or "").lower()
    tags = {str(tag).lower() for tag in hotel.get("tags") or []}
    best_for = []

    def add_best(label):
        if label and label not in best_for:
            best_for.append(label)

    known_profiles = [
        (
            "the knot",
            [
                "Stylish design hotel experience",
                "Trendy social atmosphere",
                "Younger travelers",
            ],
            "Slightly weaker comfort and cleanliness confidence than the recommended pick.",
        ),
        (
            "gracery",
            [
                "Central Shinjuku location",
                "Famous Godzilla attraction",
                "Easy nightlife access",
            ],
            "Smaller average room experience than more comfort-focused options.",
        ),
        (
            "mitsui garden",
            [
                "Polished high-floor city hotel feel",
                "Food and shopping access around Ginza",
                "First-time Tokyo travelers who want an easy base",
            ],
            "Less nightlife energy than Shinjuku/Shibuya.",
        ),
        (
            "jr kyushu",
            [
                "Short-hop access to Shinjuku Station",
                "Train-heavy sightseeing days",
                "Travelers who want nightlife nearby but a hotel that stays practical",
            ],
            "Busier surroundings than calmer hotel areas.",
        ),
        (
            "nohga",
            [
                "Museums, parks, and older Tokyo streets",
                "Better hotel value than Ginza or Toranomon",
                "Travelers who prefer a quieter local feel",
            ],
            "Less polished and less central for shopping-heavy trips.",
        ),
        (
            "edition",
            [
                "Luxury hotel atmosphere",
                "Design-forward stay experience",
                "Premium dining and quieter evenings",
            ],
            "Higher price profile than most other options.",
        ),
        (
            "celestine",
            [
                "Calmer evenings away from the busiest districts",
                "Travelers prioritizing hotel atmosphere",
                "Haneda-side routing and slower mornings",
            ],
            "Less useful for nightlife and dense shopping days.",
        ),
    ]
    for needle, strengths, tradeoff in known_profiles:
        if needle in name_key:
            return {"best_for": strengths[:3], "tradeoff": tradeoff}

    if "shinjuku" in area or "shinjuku" in name_key:
        add_best("Central Shinjuku location")
        add_best("Nightlife and late dining access")
    if "ginza" in area or "ginza" in name_key:
        add_best("Food and shopping access")
        add_best("Polished first-time Tokyo base")
    if "ueno" in area or "asakusa" in area or "ueno" in name_key or "asakusa" in name_key:
        add_best("Culture-focused sightseeing")
        add_best("Better value than central luxury areas")
    if "toranomon" in area or "roppongi" in area or "toranomon" in name_key:
        add_best("Upscale central Tokyo base")
        add_best("Premium dining access")
    if "tokyo bay" in area or "shiba" in area or "shiba" in name_key:
        add_best("Calmer hotel surroundings")
        add_best("Family-friendly pacing")
    if {"lower price", "moderate price", "value"} & tags:
        add_best("Travelers trying to keep nightly cost controlled")
    if "premium price" in tags or "higher price" in tags:
        add_best("Travelers who want the hotel to feel like part of the trip")

    rating = _hotel_numeric_value(hotel, "rating")
    review_count = _hotel_numeric_value(hotel, "review_count")
    if "luxury" in label:
        add_best("Travelers prioritizing amenities and atmosphere")
    elif "value" in label:
        add_best("Travelers who want a practical stay without overpaying")
    elif "location" in label:
        add_best("Travelers who want to minimize transit friction")
    elif rating and rating >= 4.4:
        add_best("Travelers who rely heavily on guest review confidence")
    elif review_count and review_count >= 1000:
        add_best("Travelers who prefer a widely reviewed hotel")
    if not best_for:
        area_label = str(hotel.get("area") or "Tokyo").split("·")[0].strip() or "Tokyo"
        add_best(f"Travelers looking specifically around {area_label}")
        add_best("People who want a hotel with public Google review visibility")

    tradeoff = "Live rate and room details still need verification before booking."
    if recommended_hotel and not recommended:
        rec_rating = _hotel_numeric_value(recommended_hotel, "rating")
        if rating and rec_rating and rating < rec_rating - 0.2:
            tradeoff = "Weaker public rating signal than the recommended hotel."
        elif review_count and _hotel_numeric_value(recommended_hotel, "review_count") and review_count < _hotel_numeric_value(recommended_hotel, "review_count") * 0.5:
            tradeoff = "Fewer public reviews, so confidence is lower."
        elif "premium price" in tags or "higher price" in tags:
            tradeoff = "Likely pricier without enough extra benefit for this trip."
        elif "shinjuku" in area and "shinjuku" not in str(recommended_hotel.get("area") or "").lower():
            tradeoff = "Busier surroundings than the recommended hotel area."
        else:
            tradeoff = "Less clearly aligned with the recommended neighborhood strategy."
    elif recommended:
        tradeoff = "Still verify live nightly rates and room type before booking."

    return {"best_for": best_for[:3], "tradeoff": tradeoff}


def _label_hotel_alternatives(alternatives):
    candidates = [dict(hotel) for hotel in alternatives[:3]]
    label_rules = [
        (
            "Luxury alternative",
            lambda hotel: (
                (_hotel_factor_score(hotel, "Room Quality") or 0) * 1.2
                + (_hotel_numeric_value(hotel, "price_level") or 0) * 0.6
            ),
        ),
        (
            "Best value alternative",
            lambda hotel: (
                (_hotel_factor_score(hotel, "Value") or 0) * 1.4
                + (0.4 if (_hotel_numeric_value(hotel, "price_level") or 0) <= 2 else 0)
            ),
        ),
        (
            "Best location alternative",
            lambda hotel: (
                (_hotel_factor_score(hotel, "Location Match") or 0)
                + (_hotel_factor_score(hotel, "Transit Access") or 0)
            ),
        ),
    ]
    output = []
    used_ids = set()
    for label, scorer in label_rules:
        remaining = [
            (index, hotel)
            for index, hotel in enumerate(candidates)
            if index not in used_ids
        ]
        if not remaining:
            break
        selected_index, selected_hotel = max(remaining, key=lambda item: scorer(item[1]))
        used_ids.add(selected_index)
        hotel = dict(selected_hotel)
        item = dict(hotel)
        item["label"] = label
        item["type"] = label
        output.append(item)
    for index, hotel in enumerate(candidates):
        if index in used_ids:
            continue
        item = dict(hotel)
        item["label"] = "Alternative hotel"
        item["type"] = "Alternative hotel"
        output.append(item)
    return output


def _normalize_key_fragment(value):
    raw = str(value or "").strip().lower()
    output = []
    previous_dash = False
    for char in raw:
        if char.isalnum():
            output.append(char)
            previous_dash = False
        elif not previous_dash:
            output.append("-")
            previous_dash = True
    return "".join(output).strip("-")[:72]


def _stable_hotel_identifier(hotel, index):
    google_id = hotel.get("google_place_id") or hotel.get("place_id") or hotel.get("id")
    if google_id:
        key_base = f"google-{google_id}"
    else:
        key_base = f"{hotel.get('name') or 'hotel'}-{index}"
    return _normalize_key_fragment(key_base) or f"hotel-{index}"


def _assign_hotel_identifiers(hotels):
    for index, hotel in enumerate(hotels):
        hotel["_hotel_key"] = _stable_hotel_identifier(hotel, index)
    return hotels


def _set_hotel_active_modal(modal_type, hotel_key):
    st.session_state["hotel_active_modal"] = {
        "type": modal_type,
        "hotel_key": hotel_key,
    }


def _clear_hotel_active_modal():
    st.session_state.pop("hotel_active_modal", None)


def _hotel_factor_score(hotel, factor):
    scores = hotel.get("scores") or {}
    try:
        return float(scores.get(factor, (0, ""))[0])
    except (TypeError, ValueError, IndexError):
        return None


def _hotel_numeric_value(hotel, key):
    try:
        value = hotel.get(key)
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _hotel_comparison_rows(hotel, recommended_hotel):
    rows = []

    def add_row(label, selected, recommended, value_format, meaningful_delta):
        if selected is None or recommended is None:
            return
        delta = round(float(selected) - float(recommended), 1)
        rows.append(
            {
                "label": label,
                "selected": selected,
                "recommended": recommended,
                "delta": delta,
                "value": value_format,
                "meaningful_delta": meaningful_delta,
            }
        )

    add_row(
        "Google rating",
        _hotel_numeric_value(hotel, "rating"),
        _hotel_numeric_value(recommended_hotel, "rating"),
        lambda value: f"{float(value):.1f}/5",
        0.2,
    )
    add_row(
        "Review count",
        _hotel_numeric_value(hotel, "review_count"),
        _hotel_numeric_value(recommended_hotel, "review_count"),
        lambda value: f"{int(value):,}",
        150,
    )
    add_row(
        "Neighborhood score",
        _hotel_factor_score(hotel, "Location Match"),
        _hotel_factor_score(recommended_hotel, "Location Match"),
        lambda value: f"{float(value):.1f}/10",
        0.3,
    )
    add_row(
        "Stay score",
        _hotel_numeric_value(hotel, "score"),
        _hotel_numeric_value(recommended_hotel, "score"),
        lambda value: f"{int(round(float(value)))}",
        3,
    )
    for label, factor in (
        ("Room quality score", "Room Quality"),
        ("Transit score", "Transit Access"),
        ("Value score", "Value"),
        ("Safety score", "Safety"),
        ("Trip Fit", "Trip Fit"),
    ):
        add_row(
            label,
            _hotel_factor_score(hotel, factor),
            _hotel_factor_score(recommended_hotel, factor),
            lambda value: f"{float(value):.1f}/10",
            0.3,
        )
    return rows


def _hotel_delta_phrase(row, lower=True):
    delta = abs(float(row["delta"]))
    label = row["label"].lower()
    if row["label"] == "Stay score":
        amount = f"{int(round(delta))} points"
    elif row["label"] == "Review count":
        amount = f"{int(round(delta)):,} reviews"
    else:
        amount = f"{delta:.1f} points"
    direction = "lower" if lower else "higher"
    return f"{amount} {direction} on {label}"


def _comparison_row_by_label(rows, label):
    for row in rows:
        if row["label"] == label:
            return row
    return None


def _hotel_why_not_lists(hotel, recommended_hotel):
    name_key = str(hotel.get("name") or "").lower()
    area = str(hotel.get("area") or "").lower()
    label = str(hotel.get("label") or hotel.get("type") or "").lower()
    identity = _hotel_identity_profile(hotel, recommended_hotel=recommended_hotel)
    advantages = list(identity.get("best_for") or [])[:3]
    drawbacks = []

    if "gracery" in name_key:
        advantages = [
            "To stay in the heart of Kabukicho nightlife",
            "Easy access to restaurants and entertainment",
            "The iconic Godzilla-themed location",
        ]
        drawbacks = [
            "Busier and noisier surroundings",
            "Less comfort-focused than the recommended pick",
        ]
        take = "Choose this if nightlife and being in the middle of the action matter more than a quieter hotel experience."
    elif "the knot" in name_key:
        advantages = [
            "Modern design-forward hotel",
            "Trendier social atmosphere",
            "Popular with younger travelers",
        ]
        drawbacks = [
            "Slightly weaker comfort and cleanliness signal",
            "Less polished overall stay experience",
        ]
        take = "Choose this if style and atmosphere matter more than maximizing comfort."
    elif "edition" in name_key or "luxury" in label or "toranomon" in area:
        advantages = [
            "A more premium hotel atmosphere",
            "Design-forward stay experience",
            "Quieter upscale evenings than Shinjuku",
        ]
        drawbacks = [
            "Higher nightly-rate profile",
            "Less useful if nightlife and fast rail movement matter most",
        ]
        take = "Choose this if the hotel experience itself matters more than value or late-night convenience."
    elif "nohga" in name_key or "ueno" in area or "asakusa" in area or "value" in label:
        advantages = [
            "Museums, parks, and older Tokyo atmosphere",
            "Usually better hotel value than Ginza or Toranomon",
            "A quieter local-feeling base",
        ]
        drawbacks = [
            "Less convenient for nightlife and shopping-heavy days",
            "Less polished than a premium central hotel",
        ]
        take = "Choose this if culture and value matter more than shopping access or a polished first-trip base."
    elif "jr kyushu" in name_key or "shinjuku" in area or "location" in label:
        advantages = [
            "Quick access to Shinjuku Station",
            "Easy restaurants and late-night food nearby",
            "Practical base for train-heavy sightseeing",
        ]
        drawbacks = [
            "Busier station-area surroundings",
            "Less calm than quieter hotel neighborhoods",
        ]
        take = "Choose this if transit access and being close to Shinjuku energy matter more than a calmer stay."
    elif "celestine" in name_key or "shiba" in area or "tokyo bay" in area:
        advantages = [
            "Calmer evenings away from the busiest districts",
            "A more hotel-focused atmosphere",
            "Useful Haneda-side routing",
        ]
        drawbacks = [
            "Less ideal for nightlife or shopping-heavy days",
            "Farther from the densest west-side food and entertainment areas",
        ]
        take = "Choose this if slower mornings and a quieter base matter more than being near Tokyo's busiest districts."
    else:
        if not advantages:
            advantages = [
                "A straightforward Tokyo hotel base",
                "A familiar option with public listing visibility",
            ]
        if "ginza" in area:
            drawbacks.append("Less nightlife-focused than Shinjuku options")
            take = "Choose this if food, shopping, and polished streets matter more than nightlife."
        elif "shinjuku" in area:
            drawbacks.append("Busier surroundings than calmer hotel districts")
            take = "Choose this if you want action and convenience more than a quiet hotel atmosphere."
        elif "ueno" in area or "asakusa" in area:
            drawbacks.append("Less convenient for shopping-heavy or nightlife-focused days")
            take = "Choose this if older Tokyo atmosphere and value matter most."
        else:
            drawbacks.append("Less distinctive for this trip than the recommended hotel")
            take = "Choose this if its location or atmosphere fits your personal style better than the recommended pick."

    return {
        "summary": take,
        "advantages": advantages[:3],
        "drawbacks": drawbacks[:2],
    }


def _score_neighborhood(profile, preferences):
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    tags = set(profile.get("preference_tags") or [])
    matches = sorted(selected & tags)
    match_ratio = len(matches) / max(1, min(len(selected), 3))
    preference_score = 6.2 + match_ratio * 3.1
    score_10 = (
        profile["base_score"] * 0.32
        + preference_score * 0.34
        + profile["convenience"] * 0.20
        + profile["value"] * 0.14
    )
    score = int(round(max(72, min(96, score_10 * 10))))
    return {
        **profile,
        "score": score,
        "matched_preferences": matches,
    }


def _rank_neighborhoods(preferences):
    ranked = [_score_neighborhood(profile, preferences) for profile in NEIGHBORHOOD_PROFILES]
    return sorted(ranked, key=lambda item: item["score"], reverse=True)


def _recommendation_for_neighborhood(scored_neighborhood):
    key = NEIGHBORHOOD_TO_RECOMMENDATION.get(scored_neighborhood["name"], "ginza")
    return MOCK_RECOMMENDATIONS[key]


def _neighborhood_pick_bullets(scored_neighborhood, alternatives, preferences):
    preference_text = ", ".join(scored_neighborhood.get("matched_preferences") or (preferences or DEFAULT_HOTEL_PREFERENCES)[:2])
    bullets = [
        f"Matches your selected priorities: {preference_text}.",
        f"Convenience score is {float(scored_neighborhood['convenience']):.1f}/10 for transit and walkable trip days.",
    ]
    if alternatives:
        strongest_alternative = alternatives[0]
        bullets.append(
            f"Tradeoff: {strongest_alternative['name']} is better for {strongest_alternative['best_for'].lower()}, but {scored_neighborhood['name']} fits your current priorities better."
        )
    else:
        bullets.append(f"Tradeoff: {scored_neighborhood['tradeoff']}")
    return bullets[:3]


def _neighborhood_tradeoff_bullets(neighborhood, recommended_neighborhood):
    name = neighborhood.get("name", "")
    recommended_name = recommended_neighborhood.get("name", "")
    selected = set(st.session_state.get("hotel_preferences") or DEFAULT_HOTEL_PREFERENCES)
    bullets = []
    if "Nightlife" in selected and "Nightlife" not in set(neighborhood.get("preference_tags") or []):
        bullets.append("Less nightlife and late dining.")
    if {"Food", "Shopping", "Walkability"} & selected and name not in {"Ginza / Yurakucho", "Shinjuku / Shibuya"}:
        bullets.append("Less ideal for shopping-heavy, first-time Tokyo days.")
    if "Culture" in selected and "Culture" not in set(neighborhood.get("preference_tags") or []):
        bullets.append("Fewer temples, museums, and older Tokyo sights nearby.")
    if "Luxury" in selected and "Luxury" not in set(neighborhood.get("preference_tags") or []):
        bullets.append("Fewer premium hotels and polished dining clusters.")
    if "Relaxation" in selected and "Relaxation" not in set(neighborhood.get("preference_tags") or []):
        bullets.append("Busier evenings and less calm hotel surroundings.")
    if "Lowest Price" in selected and "Lowest Price" not in set(neighborhood.get("preference_tags") or []):
        bullets.append("Usually weaker hotel value than Ueno/Asakusa.")
    if not bullets:
        bullets.append(neighborhood.get("tradeoff") or f"{recommended_name} fits the current trip profile better.")
    return bullets[:2]


def _neighborhood_why_not_lists(neighborhood, recommended_neighborhood):
    advantages = list(neighborhood.get("good_fit") or [])[:2]
    drawbacks = _neighborhood_tradeoff_bullets(neighborhood, recommended_neighborhood)
    selected_preferences = st.session_state.get("hotel_preferences") or DEFAULT_HOTEL_PREFERENCES
    preference_text = ", ".join(selected_preferences[:3])
    take = f"Because you selected {preference_text}, {recommended_neighborhood['name']} is a stronger base for this trip."
    return {
        "advantages": advantages[:2] or [f"Good for {neighborhood['best_for'].lower()}."],
        "drawbacks": drawbacks[:2],
        "take": take,
    }


def _select_alternative_neighborhoods(ranked_neighborhoods, recommended_neighborhood):
    preferred_names = ["Shinjuku / Shibuya", "Ueno / Asakusa", "Ginza / Toranomon"]
    selected = []
    used = {recommended_neighborhood["name"]}
    by_name = {item["name"]: item for item in ranked_neighborhoods}
    for name in preferred_names:
        if name in by_name and name not in used:
            selected.append(by_name[name])
            used.add(name)
    for item in ranked_neighborhoods:
        if len(selected) >= 3:
            break
        if item["name"] not in used:
            selected.append(item)
            used.add(item["name"])
    return selected[:3]


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
            border-color: rgba(196,181,253,0.44);
            background:
                radial-gradient(circle at top left, rgba(139,92,246,0.22), transparent 36%),
                linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02)),
                rgba(8,10,18,0.96);
            box-shadow: 0 22px 74px rgba(99,102,241,0.20);
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
        .neighborhood-best-for {
            color: rgba(255,255,255,0.66);
            font-size: 12px;
            line-height: 1.4;
            margin-top: 5px;
        }
        .neighborhood-best-for strong {
            color: rgba(255,255,255,0.88);
            font-weight: 900;
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
        .hotel-rating-signal {
            color: #fff;
            font-size: 25px;
            font-weight: 950;
            letter-spacing: -0.5px;
            text-align: right;
        }
        .hotel-review-signal {
            color: rgba(255,255,255,0.48);
            font-size: 11px;
            font-weight: 750;
            text-align: right;
            margin-bottom: 6px;
        }
        .hotel-price-chip {
            display: inline-flex;
            justify-content: center;
            white-space: nowrap;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.10);
            background: rgba(255,255,255,0.045);
            color: rgba(255,255,255,0.62);
            padding: 4px 8px;
            font-size: 10px;
            font-weight: 850;
            margin-bottom: 7px;
        }
        .hotel-copy {
            color: rgba(255,255,255,0.72);
            font-size: 13px;
            line-height: 1.48;
            margin-bottom: 11px;
        }
        .hotel-factor-strip {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: center;
            border: 1px solid rgba(129,140,248,0.14);
            border-radius: 13px;
            background: rgba(99,102,241,0.065);
            color: rgba(255,255,255,0.66);
            font-size: 12px;
            font-weight: 800;
            padding: 8px 10px;
            margin: 8px 0 10px;
        }
        .hotel-factor-strip strong {
            color: #c7d2fe;
            font-size: 13px;
            font-weight: 950;
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
        .hotel-recommended-label {
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
            .hotel-price-sub,
            .hotel-rating-signal,
            .hotel-review-signal {
                text-align: left;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _score_badge(score, label="Stay Score"):
    return f'<span class="hotel-score">{html.escape(label)}: {int(score)}</span>'


def _chips(tags, primary_first=False):
    output = []
    for index, tag in enumerate(tags):
        css = "hotel-chip primary" if primary_first and index == 0 else "hotel-chip"
        output.append(f'<span class="{css}">{html.escape(str(tag))}</span>')
    return "".join(output)


def _neighborhood_tags(neighborhood):
    best_for = str(neighborhood.get("best_for") or "").lower()
    preference_tags = set(neighborhood.get("preference_tags") or [])
    tags = []

    def add(condition, label):
        if condition and label not in tags:
            tags.append(label)

    add("Culture" in preference_tags or any(word in best_for for word in ("culture", "museum", "temple")), "🏛 Culture")
    add("Food" in preference_tags or any(word in best_for for word in ("food", "dining", "restaurant")), "🍜 Food")
    add("Shopping" in preference_tags or "shopping" in best_for, "🛍 Shopping")
    add("Nightlife" in preference_tags or any(word in best_for for word in ("nightlife", "late")), "🌃 Nightlife")
    add("Luxury" in preference_tags or any(word in best_for for word in ("luxury", "premium", "design")), "💎 Luxury")
    add("Lowest Price" in preference_tags or any(word in best_for for word in ("lower", "value", "budget")), "💰 Value")
    add(
        float(neighborhood.get("convenience") or 0) >= 8.5
        or any(word in best_for for word in ("station", "transit", "access")),
        "🚇 Transit",
    )
    return tags[:3]


def _neighborhood_recommendation_line(neighborhood):
    name = neighborhood.get("name", "")
    lines = {
        "Ueno / Asakusa": "Choose this if you want traditional Tokyo and better hotel value over nightlife.",
        "Ginza / Toranomon": "Choose this if you want an upscale, quieter Tokyo base.",
        "Ginza / Yurakucho": "Choose this if you want food, shopping, and convenience without the intensity of Shinjuku.",
        "Shinjuku / Shibuya": "Choose this if you want nightlife, late dining, and the most energetic Tokyo base.",
        "Tokyo Bay / Shiba": "Choose this if you want calmer evenings, family pacing, and easier Haneda-side routing.",
    }
    return lines.get(name, f"Choose this if you want {str(neighborhood.get('best_for') or 'this stay style').lower()}.")


def _hotel_card_signal_html(hotel):
    if hotel.get("price") is not None:
        price_sub = hotel.get("price_subtitle") or "estimated nightly rate"
        return "".join(
            [
                f'<div class="hotel-price">{_money(hotel["price"])}</div>',
                f'<div class="hotel-price-sub">{html.escape(price_sub)}</div>',
                _score_badge(hotel["score"]),
            ]
        )

    rating = _rating_text(hotel)
    if rating:
        return "".join(
            [
                f'<div class="hotel-rating-signal">{html.escape(rating)}</div>',
                f'<div class="hotel-review-signal">{html.escape(_review_count_text(hotel))}</div>',
                '<div class="hotel-price-chip">Price unavailable</div>',
                _score_badge(hotel["score"]),
            ]
        )

    return "".join(
        [
            '<div class="hotel-price-chip">Price unavailable</div>',
            _score_badge(hotel["score"]),
        ]
    )


def _render_preferences():
    with st.container(border=True):
        st.markdown(
            """
            <div class="hotel-kicker">Hotel preferences</div>
            <div class="hotel-name">What's most important for this trip?</div>
            <div class="hotel-area">Pick the signals Byable should use to rank the Tokyo hotel set.</div>
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


def _render_neighborhood_card(recommendation, preferences, scored_neighborhood, alternative_neighborhoods):
    neighborhood = recommendation["neighborhood"]
    best_for = scored_neighborhood.get("best_for") or neighborhood.get("best_for") or "This trip"
    pick_bullets = _escape_list(_neighborhood_pick_bullets(scored_neighborhood, alternative_neighborhoods, preferences))
    st.markdown(
        f"""
        <div class="hotel-card recommended">
            <div class="hotel-card-top">
                <div>
                    <div class="hotel-kicker">Recommended neighborhood</div>
                    <div class="hotel-name">{html.escape(neighborhood["name"])}</div>
                    <div class="neighborhood-best-for"><strong>Best for:</strong> {html.escape(best_for)}</div>
                    <div class="hotel-area">{html.escape(_neighborhood_recommendation_line(scored_neighborhood))}</div>
                </div>
                {_score_badge(scored_neighborhood["score"], "Match")}
            </div>
            <div class="hotel-copy">{html.escape(neighborhood["why"])}</div>
            <div class="hotel-chip-row">{_chips(_neighborhood_tags(scored_neighborhood), primary_first=True)}</div>
            <div class="hotel-section-label">Why Byable picked this neighborhood</div>
            <ul class="hotel-list">{pick_bullets}</ul>
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


def _render_neighborhood_alt_card(neighborhood):
    st.markdown(
        f"""
        <div class="hotel-card alt">
            <div class="hotel-card-top">
                <div>
                    <div class="hotel-kicker">Alternative neighborhood</div>
                    <div class="hotel-name">{html.escape(neighborhood["name"])}</div>
                    <div class="neighborhood-best-for"><strong>Best for:</strong> {html.escape(neighborhood["best_for"])}</div>
                    <div class="hotel-area">{html.escape(_neighborhood_recommendation_line(neighborhood))}</div>
                </div>
                {_score_badge(neighborhood["score"], "Match")}
            </div>
            <div class="hotel-chip-row">{_chips(_neighborhood_tags(neighborhood), primary_first=True)}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_hotel_card(hotel, recommended=False, recommended_hotel=None):
    card_class = "hotel-card recommended" if recommended else "hotel-card alt"
    identity_profile = _hotel_identity_profile(
        hotel,
        recommended_hotel=recommended_hotel,
        recommended=recommended,
    )
    identity_html = "".join(
        [
            '<div class="hotel-section-label">Best for</div>',
            f'<ul class="hotel-list">{_escape_list(identity_profile["best_for"][:3])}</ul>',
            '<div class="hotel-section-label">Tradeoff</div>',
            f'<ul class="hotel-list">{_escape_list([identity_profile["tradeoff"]])}</ul>',
        ]
    )
    stay_score_html = ""
    if recommended and hotel.get("overall_stay_score") is not None:
        stay_score_html = "".join(
            [
                '<div class="hotel-factor-strip">',
                f'<span>Neighborhood Match <strong>{int(hotel.get("neighborhood_match_score") or 0)}</strong></span>',
                f'<span>Stay Score <strong>{int(hotel.get("score") or 0)}</strong></span>',
                f'<span>Overall Match <strong>{int(hotel.get("overall_stay_score") or 0)}</strong></span>',
                "</div>",
            ]
        )
    recommended_label = '<div class="hotel-recommended-label">Recommended by Byable</div>' if recommended else ""
    pick_bullets = ""
    if recommended and hotel.get("pick_bullets"):
        pick_bullets = "".join(
            [
                '<div class="hotel-section-label">Why Byable picked this hotel</div>',
                f'<ul class="hotel-list">{_escape_list(hotel["pick_bullets"][:4])}</ul>',
            ]
        )
    card_html = "".join(
        [
            f'<div class="{card_class}">',
            '<div class="hotel-card-top">',
            "<div>",
            recommended_label,
            f'<div class="hotel-kicker">{html.escape(hotel["type"] if recommended else hotel["label"])}</div>',
            f'<div class="hotel-name">{html.escape(hotel["name"])}</div>',
            f'<div class="hotel-area">{html.escape(hotel["area"])}</div>',
            "</div>",
            "<div>",
            _hotel_card_signal_html(hotel),
            "</div>",
            "</div>",
            f'<div class="hotel-copy">{html.escape(hotel["why"])}</div>',
            identity_html,
            pick_bullets,
            stay_score_html,
            f'<div class="hotel-chip-row">{_chips(hotel["tags"], primary_first=True)}</div>',
            "</div>",
        ]
    )
    st.markdown(card_html, unsafe_allow_html=True)


def _render_score_modal(hotel):
    def _content():
        st.markdown("#### Stay Score breakdown")
        st.caption(hotel["name"])
        for label, (score, note) in hotel["scores"].items():
            with st.container(border=True):
                row_cols = st.columns([0.72, 0.28])
                with row_cols[0]:
                    st.markdown(f"**{label}**")
                with row_cols[1]:
                    st.markdown(f"**{float(score):.1f}/10**")
                st.caption(note)
        if st.button("Close Stay Score", key=f"close_hotel_score_{hotel.get('_hotel_key', 'active')}"):
            _clear_hotel_active_modal()
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog("Stay Score")
        def _dialog():
            _content()

        _dialog()
    else:
        with st.container(border=True):
            _content()


def _render_why_not_modal(hotel, recommended_hotel):
    comparison = _hotel_why_not_lists(hotel, recommended_hotel)

    def _content():
        st.markdown("**Good if you want**")
        for advantage in comparison["advantages"][:3]:
            st.markdown(f"✓ {advantage}")

        st.markdown("**Tradeoffs**")
        for drawback in comparison["drawbacks"][:2]:
            st.markdown(f"• {drawback}")

        st.markdown("**Byable's take**")
        st.markdown(comparison["summary"])

        if st.button("Close", key=f"close_hotel_why_not_{hotel.get('_hotel_key', 'active')}"):
            _clear_hotel_active_modal()
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog(f"Why not {hotel['name']}?")
        def _dialog():
            _content()

        _dialog()
    else:
        with st.container(border=True):
            st.markdown(f"#### Why not {hotel['name']}?")
            _content()


def _render_neighborhood_why_not_modal(neighborhood, recommended_neighborhood):
    comparison = _neighborhood_why_not_lists(neighborhood, recommended_neighborhood)

    def _content():
        st.markdown("**Good if you want**")
        for advantage in comparison["advantages"][:2]:
            st.markdown(f"✓ {advantage}")
        st.markdown("**Tradeoffs**")
        for drawback in comparison["drawbacks"][:2]:
            st.markdown(f"• {drawback}")
        st.markdown("**Byable's take**")
        st.caption(comparison["take"])
        if st.button("Close", key="close_neighborhood_why_not"):
            st.session_state.pop("neighborhood_why_not_modal_open", None)
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog(f"Why not {neighborhood['name']}?")
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
                Byable ranks stays by neighborhood fit, transit access, value, room quality, safety, and trip fit.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    selected_preferences = _render_preferences()
    preference_signature = tuple(selected_preferences)
    previous_preference_signature = st.session_state.get("hotel_preferences_last_tracked")
    if previous_preference_signature is None:
        st.session_state["hotel_preferences_last_tracked"] = preference_signature
    elif tuple(previous_preference_signature) != preference_signature:
        track_event(
            "hotel_preferences_changed",
            {
                "preferences": list(selected_preferences),
                "preference_count": len(selected_preferences),
            },
        )
        st.session_state["hotel_preferences_last_tracked"] = preference_signature

    ranked_neighborhoods = _rank_neighborhoods(selected_preferences)
    recommended_neighborhood = ranked_neighborhoods[0]
    alternative_neighborhoods = _select_alternative_neighborhoods(ranked_neighborhoods, recommended_neighborhood)
    recommendation = _recommendation_for_neighborhood(recommended_neighborhood)
    google_hotels = search_hotels_with_google_places(
        destination_city,
        neighborhood=recommended_neighborhood["name"],
        limit=10,
    )
    live_hotel_data_used = bool(google_hotels)
    print(f"HOTELS DATA SOURCE: {'google_places' if live_hotel_data_used else 'mock_fallback'}")
    if not live_hotel_data_used:
        fallback_reason = (
            "GOOGLE_PLACES_API_KEY not configured"
            if not google_places_key_configured()
            else "Google Places returned 0 hotels or request failed"
        )
        print(f"HOTELS FALLBACK USED: {fallback_reason}")
    ranked_hotels = (
        _rank_google_hotels(google_hotels, selected_preferences, recommended_neighborhood)
        if live_hotel_data_used
        else _rank_mock_hotels(selected_preferences)
    )
    recommended_hotel = ranked_hotels[0]
    alternative_hotels = _label_hotel_alternatives(ranked_hotels[1:4])
    recommended_hotel["why"] = _hotel_recommendation_copy(recommended_hotel, selected_preferences)
    recommended_hotel["pick_bullets"] = _hotel_pick_bullets(
        recommended_hotel,
        recommended_neighborhood,
        selected_preferences,
    )
    recommended_hotel["neighborhood_match_score"] = recommended_neighborhood["score"]
    recommended_hotel["overall_stay_score"] = round(recommended_neighborhood["score"] * 0.60 + recommended_hotel["score"] * 0.40)
    all_hotels = _assign_hotel_identifiers([recommended_hotel, *alternative_hotels])
    recommended_hotel = all_hotels[0]
    alternative_hotels = all_hotels[1:]
    hotels_by_key = {hotel["_hotel_key"]: hotel for hotel in all_hotels}
    neighborhoods_by_name = {
        neighborhood["name"]: neighborhood
        for neighborhood in [recommended_neighborhood, *alternative_neighborhoods]
    }

    _render_neighborhood_card(recommendation, selected_preferences, recommended_neighborhood, alternative_neighborhoods)

    st.markdown(
        '<div class="hotel-kicker" style="margin-top:18px">Alternative neighborhoods</div>',
        unsafe_allow_html=True,
    )
    for neighborhood in alternative_neighborhoods:
        _render_neighborhood_alt_card(neighborhood)
        action_cols = st.columns([1, 0.18])
        with action_cols[1]:
            if st.button("Why not?", key=f"neighborhood_why_not_{neighborhood['name']}"):
                st.session_state["neighborhood_why_not_modal_open"] = neighborhood["name"]
                track_event(
                    "hotel_neighborhood_why_not_clicked",
                    {
                        "neighborhood": neighborhood["name"],
                        "recommended_neighborhood": recommended_neighborhood["name"],
                        "match_score": neighborhood["score"],
                        "recommended_match_score": recommended_neighborhood["score"],
                        "preferences": list(selected_preferences),
                    },
                )
                st.rerun()

    if live_hotel_data_used:
        st.caption("Live Google Places hotel data")

    _render_hotel_card(
        recommended_hotel,
        recommended=True,
        recommended_hotel=recommended_hotel,
    )
    action_cols = st.columns([1, 0.24])
    with action_cols[1]:
        if st.button("Stay Score", key=f"hotel_stay_score_{recommended_hotel['_hotel_key']}"):
            _set_hotel_active_modal("stay_score", recommended_hotel["_hotel_key"])
            track_event(
                "hotel_ai_score_clicked",
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
        _render_hotel_card(hotel, recommended_hotel=recommended_hotel)
        action_cols = st.columns([1, 0.18, 0.18])
        with action_cols[1]:
            if st.button("Stay Score", key=f"hotel_stay_score_{hotel['_hotel_key']}"):
                _set_hotel_active_modal("stay_score", hotel["_hotel_key"])
                track_event(
                    "hotel_ai_score_clicked",
                    {
                        "hotel": hotel["name"],
                        "price": hotel["price"],
                        "ai_score": hotel["score"],
                        "interaction": "score_opened",
                    },
                )
                st.rerun()
        with action_cols[2]:
            if st.button("Why not?", key=f"hotel_why_not_{hotel['_hotel_key']}"):
                _set_hotel_active_modal("why_not", hotel["_hotel_key"])
                st.rerun()

    active_modal = st.session_state.get("hotel_active_modal") or {}
    active_modal_type = active_modal.get("type")
    active_hotel_key = active_modal.get("hotel_key")
    active_hotel = hotels_by_key.get(active_hotel_key)
    if active_hotel and active_modal_type == "stay_score":
        _render_score_modal(active_hotel)
    elif active_hotel and active_modal_type == "why_not":
        _render_why_not_modal(active_hotel, recommended_hotel)

    why_not_neighborhood_name = st.session_state.get("neighborhood_why_not_modal_open")
    if why_not_neighborhood_name and why_not_neighborhood_name in neighborhoods_by_name:
        _render_neighborhood_why_not_modal(neighborhoods_by_name[why_not_neighborhood_name], recommended_neighborhood)
