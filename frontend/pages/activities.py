import html as _html
import os
import base64
import time

import certifi
import requests
import streamlit as st

from analytics import track_event, track_once


CATEGORIES = ["All", "Food", "Nightlife", "Culture", "Adventure", "Nature", "Luxury", "Hidden gems", "Free"]
GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_PLACES_ACTIVITY_FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.location",
        "places.priceLevel",
        "places.types",
        "places.currentOpeningHours.openNow",
        "places.photos",
    ]
)
GOOGLE_PLACE_DETAILS_FIELD_MASK = ",".join(
    [
        "id",
        "displayName",
        "formattedAddress",
        "rating",
        "userRatingCount",
        "regularOpeningHours.weekdayDescriptions",
        "currentOpeningHours.openNow",
        "websiteUri",
        "googleMapsUri",
        "photos",
        "editorialSummary",
        "reviews",
    ]
)
ACTIVITY_DETAILS_MAX_SECONDS = 4.5
ACTIVITY_PLACE_DETAILS_TIMEOUT = 3.0
ACTIVITY_PHOTO_TIMEOUT = 1.6
ACTIVITY_TRIPADVISOR_TIMEOUT = 1.2

GOOGLE_ACTIVITY_SEARCHES = [
    ("tourist attractions", "Culture", ["Popular", "Sightseeing", "Landmarks"]),
    ("museums", "Culture", ["Museums", "History", "Indoor"]),
    ("parks", "Nature", ["Parks", "Outdoors", "Scenic"]),
    ("outdoor activities", "Adventure", ["Active", "Outdoors", "Explore"]),
    ("viewpoints", "Adventure", ["Viewpoints", "Scenic", "Explore"]),
    ("bike tours", "Adventure", ["Active", "Tours", "Outdoors"]),
    ("shopping", "Shopping", ["Shopping", "Browse", "City walk"]),
    ("nightlife", "Nightlife", ["After dark", "Bars", "Music"]),
    ("restaurants", "Food", ["Dining", "Local flavor", "Restaurants"]),
    ("landmarks", "Culture", ["Landmarks", "Architecture", "First visit"]),
    ("free things to do", "Free", ["Free", "Walking", "Budget-friendly"]),
    ("public squares viewpoints markets free museums", "Free", ["Free", "Public spaces", "Budget-friendly"]),
    ("hidden gems local favorites less touristy", "Hidden gems", ["Local", "Less crowded", "Side streets"]),
]

GOOGLE_TO_BYABLE_CATEGORY = {
    "Shopping": "Luxury",
}


def _destination_city():
    explicit = st.session_state.get("trip_destination")
    if explicit:
        return str(explicit).strip() or "Tokyo"
    search_params = st.session_state.get("flight_search") or {}
    city = str(search_params.get("destination_city") or "Tokyo").strip()
    st.session_state["trip_destination"] = city or "Tokyo"
    return city or "Tokyo"


def _google_places_api_key():
    try:
        secret_key = st.secrets.get("GOOGLE_PLACES_API_KEY", "")
    except Exception:
        secret_key = ""
    return str(secret_key or os.environ.get("GOOGLE_PLACES_API_KEY", "") or "").strip()


def _tripadvisor_api_key():
    try:
        secret_key = st.secrets.get("TRIPADVISOR_API_KEY", "")
    except Exception:
        secret_key = ""
    return str(secret_key or os.environ.get("TRIPADVISOR_API_KEY", "") or "").strip()


def _google_price_label(price_level):
    value = str(price_level or "").strip()
    labels = {
        "PRICE_LEVEL_FREE": "Free",
        "PRICE_LEVEL_INEXPENSIVE": "Budget",
        "PRICE_LEVEL_MODERATE": "Moderate",
        "PRICE_LEVEL_EXPENSIVE": "Pricey",
        "PRICE_LEVEL_VERY_EXPENSIVE": "Splurge",
    }
    return labels.get(value, "Check locally")


def _activity_duration_for_google(category, types):
    type_text = " ".join(str(item).lower() for item in (types or []))
    if category == "Food":
        return "1 – 2 hrs"
    if category == "Nightlife":
        return "2 – 3 hrs"
    if "museum" in type_text:
        return "1.5 – 2.5 hrs"
    if category == "Nature":
        return "1 – 2 hrs"
    return "1 – 2 hrs"


def _google_activity_badge(category, price):
    if price == "Free":
        return "free"
    if category == "Free":
        return "free"
    if category == "Nightlife":
        return "night"
    if category == "Nature":
        return "gem"
    if category == "Luxury":
        return "splurge"
    if category == "Culture":
        return "first_day"
    if category == "Food":
        return "popular"
    return "gem"


def _infer_google_activity_category(search_label, types):
    text = f"{search_label} {' '.join(str(item) for item in (types or []))}".lower()
    checks = [
        ("Food", ("restaurant", "food", "coffee", "cafe", "bakery", "market", "dining", "meal")),
        ("Nightlife", ("nightlife", "bar", "jazz", "club", "music", "cocktail", "pub")),
        ("Adventure", ("adventure", "outdoor", "viewpoint", "hiking", "bike", "bicycle", "kayak", "tour", "trail")),
        ("Nature", ("park", "garden", "nature", "botanical", "waterfront")),
        ("Free", ("free", "church", "public square", "plaza", "viewpoint", "market")),
        ("Hidden gems", ("hidden", "local", "less touristy", "neighborhood")),
        ("Luxury", ("shopping", "spa", "luxury", "boutique", "designer", "mall")),
        ("Culture", ("museum", "landmark", "tourist_attraction", "art", "gallery", "historic", "monument", "church")),
    ]
    for category, keywords in checks:
        if any(keyword in text for keyword in keywords):
            return category
    return GOOGLE_TO_BYABLE_CATEGORY.get(search_label.title(), "Hidden gems")


def _opening_status(place):
    hours = place.get("currentOpeningHours") or {}
    if "openNow" not in hours:
        return ""
    return "Open now" if hours.get("openNow") else "Closed now"


def _activity_why_go(search_label, destination):
    label = str(search_label or "activity").lower()
    if any(term in label for term in ("museum", "landmark", "tourist attraction")):
        return f"A useful anchor stop for understanding {destination}'s culture, history, or city layout."
    if any(term in label for term in ("restaurant", "food", "coffee")):
        return f"A food-focused stop that helps you sample the local scene in {destination}."
    if any(term in label for term in ("nightlife", "jazz", "bar", "music")):
        return "Best when you want the evening to have a clear destination instead of wandering randomly."
    if any(term in label for term in ("park", "viewpoint", "outdoor", "bike")):
        return f"A good way to add fresh air, views, or movement to a {destination} day."
    if any(term in label for term in ("shopping", "luxury")):
        return "Useful when you want browsing, design, or polished city time between bigger sights."
    if any(term in label for term in ("hidden", "local", "less touristy")):
        return "Adds a more local-feeling stop beyond the obvious headline attractions."
    if "free" in label:
        return "Keeps the day flexible without adding ticket pressure."
    return f"A specific place to consider while planning activities in {destination}."


def _activity_place_description(name, destination, search_label, rating_text, opening_status):
    parts = [_activity_why_go(search_label, destination)]
    if rating_text:
        parts.append(rating_text)
    if opening_status:
        parts.append(opening_status)
    return " ".join(parts).strip()


def _normalize_google_activity(place, destination, search_label, category, default_tags):
    display_name = place.get("displayName") or {}
    location = place.get("location") or {}
    photos = place.get("photos") or []
    place_id = str(place.get("id") or "").strip()
    name = str(display_name.get("text") or "").strip()
    address = str(place.get("formattedAddress") or "").strip()
    if not name:
        return None

    types = place.get("types") or []
    byable_category = _infer_google_activity_category(search_label, types) if category == "Search" else GOOGLE_TO_BYABLE_CATEGORY.get(category, category)
    if byable_category not in CATEGORIES:
        byable_category = "Hidden gems"
    price = _google_price_label(place.get("priceLevel"))
    if byable_category == "Free" and price == "Check locally":
        price = "Free"
    rating = place.get("rating")
    review_count = place.get("userRatingCount")
    opening_status = _opening_status(place)
    rating_text = ""
    if rating:
        rating_text = f"{float(rating):.1f} ★"
        if review_count:
            rating_text += f" · {int(review_count):,} reviews"
    tags = list(dict.fromkeys([*default_tags, search_label.title(), opening_status]))[:5]
    neighborhood = address.split(",")[0].strip() if address else destination
    activity_id = f"google_{place_id or _slug(destination)}_{_slug(name)}_{_slug(address)}"
    description = _activity_place_description(name, destination, search_label, rating_text, opening_status)
    photo_names = [
        str(photo.get("name") or "").strip()
        for photo in photos[:5]
        if str(photo.get("name") or "").strip()
    ]

    return {
        "id": activity_id,
        "title": name,
        "category": byable_category if byable_category in CATEGORIES else "Hidden gems",
        "subcategory": search_label.title(),
        "neighborhood": neighborhood,
        "description": description,
        "duration": _activity_duration_for_google(byable_category, types),
        "price": price,
        "price_usd": rating_text,
        "tags": tags,
        "badge": _google_activity_badge(byable_category, price),
        "rating": rating,
        "review_count": review_count,
        "place_id": place_id,
        "address": address,
        "opening_status": opening_status,
        "photo_names": photo_names,
        "lat": location.get("latitude"),
        "lng": location.get("longitude"),
        "source": "google_places",
        "details": {
            "strengths": [
                _activity_why_go(search_label, destination),
                rating_text or "Check current reviews before adding it to the day.",
                f"Located around {neighborhood}.",
            ],
            "tradeoffs": [
                "Opening hours, ticket requirements, and crowd levels can change.",
                "Verify ticket rules or reservation requirements before going.",
            ],
            "best_time": opening_status or "Check current hours before adding this to a specific day.",
            "booking_notes": "Book separately if tickets or reservations are required.",
            "nearby": [address or f"Other stops in {destination}", f"More {search_label} nearby"],
        },
    }


def _google_activity_dedupe_key(activity):
    place_id = str(activity.get("place_id") or "").strip()
    if place_id:
        return ("place_id", place_id)
    return (
        "name_address",
        _slug(activity.get("title")),
        _slug(activity.get("address") or activity.get("neighborhood")),
    )


def _merge_activity_lists(*activity_lists, limit=120):
    merged = {}
    for activity_list in activity_lists:
        for activity in activity_list or []:
            key = _google_activity_dedupe_key(activity)
            if key in merged:
                existing_tags = merged[key].get("tags") or []
                merged[key]["tags"] = list(dict.fromkeys([*existing_tags, *activity.get("tags", [])]))[:6]
                continue
            merged[key] = activity
    return list(merged.values())[:limit]


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def _search_google_places_activity_query(destination, query, search_label, category, tags, limit=10):
    api_key = _google_places_api_key()
    clean_destination = str(destination or "").strip()
    clean_query = str(query or "").strip()
    if not api_key or not clean_destination or not clean_query:
        return []

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": GOOGLE_PLACES_ACTIVITY_FIELD_MASK,
    }
    max_results = max(1, min(int(limit or 10), 20))
    payload = {
        "textQuery": clean_query,
        "languageCode": "en",
        "maxResultCount": max_results,
    }
    try:
        response = requests.post(
            GOOGLE_PLACES_TEXT_SEARCH_URL,
            headers=headers,
            json=payload,
            timeout=8,
            verify=certifi.where(),
        )
        response.raise_for_status()
        places = response.json().get("places") or []
    except (requests.RequestException, ValueError) as exc:
        print(f"ACTIVITIES GOOGLE PLACES FAILED: {clean_query} - {exc}")
        return []

    activities = []
    for place in places:
        activity = _normalize_google_activity(place, clean_destination, search_label, category, tags)
        if activity:
            activities.append(activity)
    print(f"ACTIVITIES GOOGLE PLACES QUERY: {clean_query} RESULTS: {len(activities)}")
    return activities


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def _search_google_places_activities(destination, per_query_limit=12):
    clean_destination = str(destination or "").strip()
    if not clean_destination:
        return []

    batches = []
    for search_label, category, tags in GOOGLE_ACTIVITY_SEARCHES:
        query = f"{search_label} in {clean_destination}"
        batches.append(
            _search_google_places_activity_query(
                clean_destination,
                query,
                search_label,
                category,
                tags,
                limit=per_query_limit,
            )
        )
    return _merge_activity_lists(*batches, limit=120)


def _search_google_places_for_user_query(destination, query, limit=20):
    clean_destination = str(destination or "").strip()
    clean_query = str(query or "").strip()
    if len(clean_query) < 2:
        return []
    return _search_google_places_activity_query(
        clean_destination,
        f"{clean_query} in {clean_destination}",
        clean_query,
        "Search",
        ["Search result"],
        limit=limit,
    )


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def _google_place_photo_data_uri(photo_name, max_width_px=700):
    api_key = _google_places_api_key()
    clean_photo_name = str(photo_name or "").strip()
    if not api_key or not clean_photo_name:
        return ""
    start = time.perf_counter()
    try:
        response = requests.get(
            f"https://places.googleapis.com/v1/{clean_photo_name}/media",
            params={"key": api_key, "maxWidthPx": int(max_width_px or 700)},
            timeout=ACTIVITY_PHOTO_TIMEOUT,
            verify=certifi.where(),
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"ACTIVITIES PHOTO API FAILED: seconds={time.perf_counter() - start:.3f} reason={exc}", flush=True)
        return ""
    print(f"ACTIVITIES PHOTO API: seconds={time.perf_counter() - start:.3f}", flush=True)
    content_type = response.headers.get("Content-Type", "image/jpeg")
    if not str(content_type).startswith("image/"):
        return ""
    encoded = base64.b64encode(response.content).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _normalize_google_review(review):
    text = review.get("text") or {}
    original_text = review.get("originalText") or {}
    review_text = str(text.get("text") or original_text.get("text") or "").strip()
    if not review_text:
        return None
    return {
        "text": review_text,
        "rating": review.get("rating"),
        "author": str((review.get("authorAttribution") or {}).get("displayName") or "").strip(),
    }


def _normalize_place_details(payload):
    display_name = payload.get("displayName") or {}
    photos = payload.get("photos") or []
    reviews = [
        normalized
        for normalized in (_normalize_google_review(review) for review in (payload.get("reviews") or [])[:5])
        if normalized
    ]
    regular_hours = payload.get("regularOpeningHours") or {}
    editorial_summary = payload.get("editorialSummary") or {}
    return {
        "place_id": str(payload.get("id") or "").strip(),
        "title": str(display_name.get("text") or "").strip(),
        "address": str(payload.get("formattedAddress") or "").strip(),
        "rating": payload.get("rating"),
        "review_count": payload.get("userRatingCount"),
        "opening_status": _opening_status(payload),
        "hours_summary": list(regular_hours.get("weekdayDescriptions") or [])[:3],
        "website_uri": str(payload.get("websiteUri") or "").strip(),
        "google_maps_uri": str(payload.get("googleMapsUri") or "").strip(),
        "editorial_summary": str(editorial_summary.get("text") or "").strip(),
        "photo_names": [
            str(photo.get("name") or "").strip()
            for photo in photos[:8]
            if str(photo.get("name") or "").strip()
        ],
        "google_reviews": reviews,
    }


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def _get_google_place_details(place_id):
    api_key = _google_places_api_key()
    clean_place_id = str(place_id or "").strip()
    if not api_key or not clean_place_id:
        return {}
    start = time.perf_counter()
    try:
        response = requests.get(
            f"https://places.googleapis.com/v1/places/{clean_place_id}",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
            },
            timeout=ACTIVITY_PLACE_DETAILS_TIMEOUT,
            verify=certifi.where(),
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"ACTIVITIES PLACE DETAILS FAILED: place_id={clean_place_id} seconds={time.perf_counter() - start:.3f} reason={exc}", flush=True)
        return {}
    print(f"ACTIVITIES PLACE DETAILS API: place_id={clean_place_id} seconds={time.perf_counter() - start:.3f}", flush=True)
    return _normalize_place_details(payload)


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def _tripadvisor_search_activity(activity_name, destination):
    api_key = _tripadvisor_api_key()
    clean_name = str(activity_name or "").strip()
    clean_destination = str(destination or "").strip()
    if not api_key or not clean_name or not clean_destination:
        return {}
    headers = {"accept": "application/json"}
    params = {
        "key": api_key,
        "searchQuery": f"{clean_name} {clean_destination}",
        "category": "attractions",
        "language": "en",
    }
    try:
        response = requests.get(
            "https://api.content.tripadvisor.com/api/v1/location/search",
            params=params,
            headers=headers,
            timeout=ACTIVITY_TRIPADVISOR_TIMEOUT,
            verify=certifi.where(),
        )
        response.raise_for_status()
        data = response.json().get("data") or []
    except (requests.RequestException, ValueError) as exc:
        print(f"ACTIVITIES TRIPADVISOR SEARCH FAILED: {clean_name} - {exc}")
        return {}
    if not data:
        return {}
    first = data[0]
    result_name = str(first.get("name") or "").strip()
    if _slug(clean_name) and _slug(result_name) and _slug(clean_name) not in _slug(result_name) and _slug(result_name) not in _slug(clean_name):
        return {}
    return {
        "location_id": str(first.get("location_id") or "").strip(),
        "name": result_name,
    }


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def _tripadvisor_activity_details(location_id):
    api_key = _tripadvisor_api_key()
    clean_location_id = str(location_id or "").strip()
    if not api_key or not clean_location_id:
        return {}
    headers = {"accept": "application/json"}
    common_params = {"key": api_key, "language": "en", "currency": "USD"}
    try:
        details_response = requests.get(
            f"https://api.content.tripadvisor.com/api/v1/location/{clean_location_id}/details",
            params=common_params,
            headers=headers,
            timeout=ACTIVITY_TRIPADVISOR_TIMEOUT,
            verify=certifi.where(),
        )
        details_response.raise_for_status()
        details = details_response.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"ACTIVITIES TRIPADVISOR DETAILS FAILED: {clean_location_id} - {exc}")
        return {}

    reviews = []
    try:
        reviews_response = requests.get(
            f"https://api.content.tripadvisor.com/api/v1/location/{clean_location_id}/reviews",
            params={"key": api_key, "language": "en"},
            headers=headers,
            timeout=ACTIVITY_TRIPADVISOR_TIMEOUT,
            verify=certifi.where(),
        )
        reviews_response.raise_for_status()
        review_data = reviews_response.json().get("data") or []
        for review in review_data[:3]:
            text = str(review.get("text") or review.get("title") or "").strip()
            if text:
                reviews.append(text)
    except (requests.RequestException, ValueError) as exc:
        print(f"ACTIVITIES TRIPADVISOR REVIEWS FAILED: {clean_location_id} - {exc}")

    return {
        "rating": details.get("rating"),
        "review_count": details.get("num_reviews"),
        "web_url": str(details.get("web_url") or "").strip(),
        "reviews": reviews,
    }


def _tripadvisor_enrichment(activity, destination):
    match = _tripadvisor_search_activity(activity.get("title"), destination)
    if not match.get("location_id"):
        return {}
    details = _tripadvisor_activity_details(match["location_id"])
    if not details:
        return {}
    details["name"] = match.get("name") or activity.get("title")
    return details


def _activity_cache_get(cache_name, key):
    start = time.perf_counter()
    cache = st.session_state.setdefault(cache_name, {})
    value = cache.get(str(key))
    print(
        f"ACTIVITIES CACHE READ: cache={cache_name} key_present={bool(value)} seconds={time.perf_counter() - start:.4f}",
        flush=True,
    )
    return value


def _activity_cache_set(cache_name, key, value):
    start = time.perf_counter()
    cache = st.session_state.setdefault(cache_name, {})
    cache[str(key)] = value
    print(
        f"ACTIVITIES CACHE WRITE: cache={cache_name} seconds={time.perf_counter() - start:.4f}",
        flush=True,
    )
    return value


def _place_details_cached(place_id):
    clean_place_id = str(place_id or "").strip()
    if not clean_place_id:
        return {}
    cached = _activity_cache_get("activities_place_details_cache", clean_place_id)
    if cached is not None:
        return cached
    details = _get_google_place_details(clean_place_id)
    return _activity_cache_set("activities_place_details_cache", clean_place_id, details)


def _photo_uri_cached(photo_name, max_width_px=700, fetch_if_missing=True, deadline=None):
    clean_photo_name = str(photo_name or "").strip()
    if not clean_photo_name:
        return ""
    cache_key = f"{clean_photo_name}:{int(max_width_px or 700)}"
    cached = _activity_cache_get("activities_photo_cache", cache_key)
    if cached:
        return cached
    generic_cached = _activity_cache_get("activities_photo_cache", clean_photo_name)
    if generic_cached:
        return generic_cached
    if not fetch_if_missing:
        print("ACTIVITIES PHOTO SKIPPED: cache_miss list_render", flush=True)
        return ""
    if deadline is not None and time.perf_counter() + 0.4 > deadline:
        print("ACTIVITIES PHOTO SKIPPED: deadline", flush=True)
        return ""
    uri = _google_place_photo_data_uri(clean_photo_name, max_width_px=max_width_px)
    if uri:
        _activity_cache_set("activities_photo_cache", cache_key, uri)
        _activity_cache_set("activities_photo_cache", clean_photo_name, uri)
    return uri


def _tripadvisor_enrichment_cached(activity, destination, deadline=None):
    cache_key = f"{_slug(destination)}:{_slug(activity.get('title'))}"
    cached = _activity_cache_get("activities_tripadvisor_cache", cache_key)
    if cached is not None:
        return cached
    if deadline is not None:
        print("ACTIVITIES TRIPADVISOR SKIPPED: cold_cache_details_budget", flush=True)
        return {}
    start = time.perf_counter()
    enrichment = _tripadvisor_enrichment(activity, destination)
    print(f"ACTIVITIES TRIPADVISOR ENRICHMENT: seconds={time.perf_counter() - start:.3f}", flush=True)
    return _activity_cache_set("activities_tripadvisor_cache", cache_key, enrichment)

_CAT_COLORS = {
    "Food":         ("#fdba74", "rgba(251,146,60,.12)",  "rgba(251,146,60,.35)"),
    "Nightlife":    ("#c4b5fd", "rgba(139,92,246,.12)",  "rgba(139,92,246,.35)"),
    "Culture":      ("#c7d2fe", "rgba(99,102,241,.14)",  "rgba(99,102,241,.38)"),
    "Adventure":    ("#fca5a5", "rgba(239,68,68,.10)",   "rgba(239,68,68,.28)"),
    "Nature":       ("#6ee7b7", "rgba(52,211,153,.10)",  "rgba(52,211,153,.28)"),
    "Luxury":       ("#fde68a", "rgba(251,191,36,.10)",  "rgba(251,191,36,.28)"),
    "Hidden gems":  ("#34d399", "rgba(52,211,153,.12)",  "rgba(52,211,153,.30)"),
    "Free":         ("#34d399", "rgba(52,211,153,.10)",  "rgba(52,211,153,.25)"),
}

_BADGE_META = {
    "popular":   ("Popular",             "rgba(239,68,68,.14)",   "#fca5a5", "rgba(239,68,68,.25)"),
    "gem":       ("Hidden gem",          "rgba(52,211,153,.16)",  "#34d399", "rgba(52,211,153,.28)"),
    "booking":   ("Needs booking",       "rgba(99,102,241,.16)",  "#a5b4fc", "rgba(99,102,241,.28)"),
    "night":     ("Best at night",       "rgba(139,92,246,.16)",  "#c4b5fd", "rgba(139,92,246,.28)"),
    "free":      ("Free",                "rgba(52,211,153,.12)",  "#34d399", "rgba(52,211,153,.20)"),
    "splurge":   ("Worth the splurge",   "rgba(251,191,36,.14)",  "#fbbf24", "rgba(251,191,36,.28)"),
    "first_day": ("Good for first day",  "rgba(99,102,241,.13)",  "#c7d2fe", "rgba(99,102,241,.26)"),
    "near_hotel":("Near hotel",          "rgba(52,211,153,.12)",  "#6ee7b7", "rgba(52,211,153,.22)"),
}

_DESTINATION_ACTIVITY_PROFILES = {
    "paris": {
        "display": "Paris",
        "locations": {
            "Food": ["Le Marais", "Saint-Germain", "Rue Cler"],
            "Nightlife": ["Oberkampf", "Pigalle", "Canal Saint-Martin"],
            "Culture": ["Louvre / Tuileries", "Île de la Cité", "Montmartre"],
            "Adventure": ["Seine riverfront", "Bois de Boulogne", "Latin Quarter"],
            "Nature": ["Luxembourg Gardens", "Buttes-Chaumont", "Tuileries Garden"],
            "Luxury": ["Place Vendôme", "Avenue Montaigne", "Saint-Honoré"],
            "Hidden gems": ["Passage des Panoramas", "Canal Saint-Martin", "Belleville"],
            "Free": ["Montmartre", "Seine riverbanks", "Père Lachaise"],
        },
        "specific": {
            "Food": ["Le Marais food walk", "Saint-Germain pastry crawl", "Rue Cler market tasting"],
            "Nightlife": ["Oberkampf cocktail crawl", "Pigalle jazz night", "Canal Saint-Martin wine bars"],
            "Culture": ["Louvre highlights route", "Sainte-Chapelle and Île de la Cité", "Montmartre artists walk"],
            "Adventure": ["Seine bike ride", "Latin Quarter treasure walk", "Bois de Boulogne rowboat afternoon"],
            "Nature": ["Luxembourg Gardens picnic", "Buttes-Chaumont sunset walk", "Tuileries slow morning"],
            "Luxury": ["Place Vendôme window-shopping", "Avenue Montaigne fashion loop", "Saint-Honoré perfume atelier"],
            "Hidden gems": ["Covered passages wander", "Belleville street art route", "Canal Saint-Martin side streets"],
            "Free": ["Montmartre sunrise viewpoint", "Seine riverbank stroll", "Père Lachaise cemetery walk"],
        },
    },
    "seoul": {
        "display": "Seoul",
        "locations": {
            "Food": ["Gwangjang Market", "Mangwon Market", "Myeongdong"],
            "Nightlife": ["Hongdae", "Itaewon", "Euljiro"],
            "Culture": ["Gyeongbokgung", "Bukchon Hanok Village", "Insadong"],
            "Adventure": ["Bukhansan", "Han River", "Seongsu"],
            "Nature": ["Namsan", "Seoul Forest", "Hangang Park"],
            "Luxury": ["Cheongdam", "Apgujeong", "Lotte World Tower"],
            "Hidden gems": ["Ikseon-dong", "Seochon", "Euljiro alleys"],
            "Free": ["Cheonggyecheon", "Namsan trail", "Bukchon viewpoints"],
        },
        "specific": {
            "Food": ["Gwangjang Market tasting route", "Mangwon Market snack crawl", "Myeongdong street food loop"],
            "Nightlife": ["Hongdae live music night", "Itaewon cocktail crawl", "Euljiro hidden bar route"],
            "Culture": ["Gyeongbokgung palace morning", "Bukchon hanok village walk", "Insadong craft street loop"],
            "Adventure": ["Bukhansan half-day hike", "Han River bike ride", "Seongsu design district crawl"],
            "Nature": ["Namsan sunset walk", "Seoul Forest picnic", "Hangang Park evening stroll"],
            "Luxury": ["Cheongdam boutique afternoon", "Apgujeong beauty and café route", "Lotte World Tower observatory"],
            "Hidden gems": ["Ikseon-dong alley cafés", "Seochon local shops", "Euljiro printing alley walk"],
            "Free": ["Cheonggyecheon stream walk", "Namsan city-view trail", "Bukchon photo viewpoints"],
        },
    },
    "tokyo": {
        "display": "Tokyo",
        "locations": {
            "Food": ["Tsukiji", "Shinjuku", "Ginza"],
            "Nightlife": ["Golden Gai", "Shibuya", "Ebisu"],
            "Culture": ["Asakusa", "Ueno", "Roppongi"],
            "Adventure": ["Akihabara", "Odaiba", "Kichijoji"],
            "Nature": ["Meiji Shrine", "Shinjuku Gyoen", "Yoyogi Park"],
            "Luxury": ["Ginza", "Aoyama", "Azabudai Hills"],
            "Hidden gems": ["Yanaka", "Kagurazaka", "Nakameguro"],
            "Free": ["Imperial Palace", "Harajuku", "Sumida River"],
        },
        "specific": {
            "Food": ["Tsukiji outer market breakfast", "Shinjuku ramen crawl", "Ginza depachika tasting"],
            "Nightlife": ["Golden Gai tiny bars", "Shibuya listening bars", "Ebisu izakaya night"],
            "Culture": ["Senso-ji and Asakusa lanes", "Ueno museum morning", "Roppongi art triangle"],
            "Adventure": ["Akihabara electronics walk", "Odaiba bayfront loop", "Kichijoji side-street crawl"],
            "Nature": ["Meiji Shrine sunrise walk", "Shinjuku Gyoen garden break", "Yoyogi Park picnic"],
            "Luxury": ["Ginza design and dining loop", "Aoyama architecture walk", "Azabudai Hills art afternoon"],
            "Hidden gems": ["Yanaka old Tokyo walk", "Kagurazaka backstreets", "Nakameguro canal cafés"],
            "Free": ["Imperial Palace outer gardens", "Harajuku people-watching loop", "Sumida River evening walk"],
        },
    },
}


_GENERIC_LOCATIONS = {
    "Food": ["central market", "old town", "restaurant district"],
    "Nightlife": ["downtown", "music district", "late-night quarter"],
    "Culture": ["historic center", "museum district", "old quarter"],
    "Adventure": ["riverfront", "hillside district", "bike route"],
    "Nature": ["city park", "waterfront", "botanical garden"],
    "Luxury": ["design district", "premium shopping street", "hotel quarter"],
    "Hidden gems": ["local neighborhood", "side-street district", "creative quarter"],
    "Free": ["public square", "viewpoint route", "waterfront walk"],
}


_CATEGORY_TAGS = {
    "Food": ["Dining", "Local flavor", "Markets"],
    "Nightlife": ["After dark", "Bars", "Music"],
    "Culture": ["Museums", "History", "Architecture"],
    "Adventure": ["Active", "Outdoors", "Explore"],
    "Nature": ["Parks", "Slow travel", "Scenic"],
    "Luxury": ["Premium", "Design", "Splurge"],
    "Hidden gems": ["Local", "Less crowded", "Side streets"],
    "Free": ["Free", "Walking", "Budget-friendly"],
}


_CATEGORY_BADGES = {
    "Food": "popular",
    "Nightlife": "night",
    "Culture": "first_day",
    "Adventure": "popular",
    "Nature": "gem",
    "Luxury": "splurge",
    "Hidden gems": "gem",
    "Free": "free",
}


_CATEGORY_DURATIONS = {
    "Food": ["1.5 hrs", "2 hrs", "2.5 hrs"],
    "Nightlife": ["2 hrs", "3 hrs", "2 – 4 hrs"],
    "Culture": ["1.5 hrs", "2 hrs", "Half day"],
    "Adventure": ["2 hrs", "3 hrs", "Half day"],
    "Nature": ["1 hr", "1.5 hrs", "2 hrs"],
    "Luxury": ["1.5 hrs", "2 hrs", "Half day"],
    "Hidden gems": ["1.5 hrs", "2 hrs", "2.5 hrs"],
    "Free": ["1 hr", "1.5 hrs", "2 hrs"],
}


def _slug(text):
    cleaned = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(text))
    return "_".join(part for part in cleaned.split("_") if part)


def _profile_for_destination(destination):
    key = str(destination or "").strip().lower()
    return _DESTINATION_ACTIVITY_PROFILES.get(key)


def _activity_title(destination, category, index, location):
    profile = _profile_for_destination(destination)
    specific = (profile or {}).get("specific", {}).get(category, [])
    if index < len(specific):
        return specific[index]

    destination = str(destination or "your destination").strip() or "your destination"
    generic_titles = {
        "Food": [
            f"{destination} food walk",
            f"{location.title()} market tasting",
            f"{destination} café and dessert crawl",
        ],
        "Nightlife": [
            f"{destination} cocktail crawl",
            f"{location.title()} live music night",
            f"{destination} late-night bites route",
        ],
        "Culture": [
            f"{destination} museum highlights",
            f"{location.title()} history walk",
            f"{destination} architecture loop",
        ],
        "Adventure": [
            f"{destination} bike route",
            f"{location.title()} active afternoon",
            f"{destination} viewpoint walk",
        ],
        "Nature": [
            f"{destination} garden break",
            f"{location.title()} scenic walk",
            f"{destination} sunset outdoors",
        ],
        "Luxury": [
            f"{destination} design district afternoon",
            f"{location.title()} premium shopping loop",
            f"{destination} polished dining night",
        ],
        "Hidden gems": [
            f"{destination} local side streets",
            f"{location.title()} hidden cafés",
            f"{destination} creative neighborhood walk",
        ],
        "Free": [
            f"{destination} free viewpoint walk",
            f"{location.title()} public-space route",
            f"{destination} no-ticket highlights",
        ],
    }
    return generic_titles[category][index % 3]


def _activity_description(destination, category, location):
    destination = str(destination or "your destination").strip() or "your destination"
    descriptions = {
        "Food": f"Sample the food scene around {location} with a flexible route built for browsing, snacking, and easy detours.",
        "Nightlife": f"An evening route through {location} for bars, music, late dining, and people-watching without overplanning the night.",
        "Culture": f"A focused culture stop in {location} that works well as a first-pass introduction to {destination}.",
        "Adventure": f"An active way to explore {location}, built around movement, views, and a stronger sense of the city layout.",
        "Nature": f"A calmer outdoor break in {location} when you want fresh air and a lower-effort reset between bigger sights.",
        "Luxury": f"A polished {destination} experience around {location}, with premium shopping, dining, or design-led stops.",
        "Hidden gems": f"A less obvious pocket of {location} that gives the day more local texture than the headline sights.",
        "Free": f"A no-ticket activity around {location} that keeps the day flexible while still feeling specific to {destination}.",
    }
    return descriptions[category]


def _activity_details(destination, category, location, title):
    destination = str(destination or "your destination").strip() or "your destination"
    strengths = {
        "Food": [
            f"Good way to understand {destination} through everyday eating.",
            f"Works well before or after another stop near {location}.",
            "Easy to scale up or down depending on appetite and timing.",
        ],
        "Nightlife": [
            "Best when you want atmosphere rather than a fixed reservation.",
            f"Keeps the evening concentrated around {location}.",
            "Easy to stop early or extend if the area is working for you.",
        ],
        "Culture": [
            f"Useful anchor activity for understanding {destination}.",
            "Pairs well with a slower neighborhood walk afterward.",
            "Good option when weather makes outdoor plans less reliable.",
        ],
        "Adventure": [
            "Adds momentum to the day without becoming a full excursion.",
            f"Helps you see more of {location} than a single attraction would.",
            "Better for travelers who want the city to feel active.",
        ],
        "Nature": [
            "Good reset between denser sightseeing blocks.",
            "Low-pressure option when the itinerary needs breathing room.",
            f"Shows a quieter side of {destination}.",
        ],
        "Luxury": [
            "Best when you want the day to feel polished and unhurried.",
            f"Concentrates premium stops around {location}.",
            "Good fit for a special dinner, shopping, or design-focused afternoon.",
        ],
        "Hidden gems": [
            "Adds a more local-feeling stop to the itinerary.",
            "Good counterweight to crowded headline attractions.",
            "Works well for travelers who like wandering with a purpose.",
        ],
        "Free": [
            "Keeps the day flexible and budget-friendly.",
            "Easy to pair with a nearby café, market, or museum.",
            f"Still gives you a place-specific sense of {destination}.",
        ],
    }
    tradeoffs = {
        "Food": ["Peak meal times can mean waits.", "Some stops may be cash-preferred or walk-up only."],
        "Nightlife": ["Best after dark, so it may not suit early starts.", "Noise and crowds vary by night."],
        "Culture": ["Popular sites can feel crowded midday.", "May need advance tickets for major museums."],
        "Adventure": ["Weather can change the experience.", "Requires more walking or transit than a single-site visit."],
        "Nature": ["Less compelling in bad weather.", "Seasonality can affect how scenic it feels."],
        "Luxury": ["Costs can rise quickly.", "Reservations may be needed for the best version."],
        "Hidden gems": ["Less structured than a landmark visit.", "Some shops or cafés may have limited hours."],
        "Free": ["Can feel lighter than a booked experience.", "Best with a nearby backup plan."],
    }
    best_time = {
        "Food": "Late morning or early evening, depending on whether you want markets or dinner energy.",
        "Nightlife": "After 8pm, when the area starts to feel alive.",
        "Culture": "Morning for fewer crowds, especially at headline museums or historic sites.",
        "Adventure": "Morning or late afternoon, when light and temperatures are easier.",
        "Nature": "Morning for quieter paths, late afternoon for softer light.",
        "Luxury": "Late afternoon into dinner, when shopping and dining pair naturally.",
        "Hidden gems": "Late morning, when independent shops and cafés are more likely to be open.",
        "Free": "Anytime, but golden hour usually makes the route feel stronger.",
    }
    booking_notes = {
        "Food": "Book only if this becomes a formal tour. Otherwise keep it flexible.",
        "Nightlife": "No booking needed for most casual stops; reserve for cocktail bars or live music.",
        "Culture": "Check ticket rules before going; major museums may require timed entry.",
        "Adventure": "Check weather and transit before committing.",
        "Nature": "No booking needed unless pairing with a guided walk.",
        "Luxury": "Reserve restaurants, workshops, or spa-style stops in advance.",
        "Hidden gems": "Check opening days because smaller places often keep irregular hours.",
        "Free": "No booking needed.",
    }
    return {
        "strengths": strengths[category],
        "tradeoffs": tradeoffs[category],
        "best_time": best_time[category],
        "booking_notes": booking_notes[category],
        "nearby": [f"Other stops around {location}", f"Easy add-on elsewhere in {destination}"],
    }


def _demo_activities_for_destination(destination: str):
    destination = str(destination or "Tokyo").strip() or "Tokyo"
    profile = _profile_for_destination(destination)
    display_destination = (profile or {}).get("display", destination)
    locations_by_category = (profile or {}).get("locations", _GENERIC_LOCATIONS)
    activities = []

    for category in CATEGORIES:
        if category == "All":
            continue
        locations = locations_by_category.get(category) or _GENERIC_LOCATIONS[category]
        for index in range(3):
            location = locations[index % len(locations)]
            title = _activity_title(display_destination, category, index, location)
            price = "Free" if category == "Free" else ("Varies" if category in {"Food", "Nightlife", "Luxury"} else "Check locally")
            price_usd = "" if price in {"Free", "Check locally"} else "estimate"
            activity_id = f"{_slug(display_destination)}_{_slug(category)}_{index + 1}_{_slug(title)}"
            activities.append(
                {
                    "id": activity_id,
                    "title": title,
                    "category": category,
                    "subcategory": category,
                    "neighborhood": location,
                    "description": _activity_description(display_destination, category, location),
                    "duration": _CATEGORY_DURATIONS[category][index % 3],
                    "price": price,
                    "price_usd": price_usd,
                    "tags": _CATEGORY_TAGS[category],
                    "badge": _CATEGORY_BADGES[category],
                    "details": _activity_details(display_destination, category, location, title),
                }
            )

    return activities


def get_activities_for_destination(destination: str):
    destination = str(destination or "Tokyo").strip() or "Tokyo"
    cache_key = _slug(destination)
    cached_payload = st.session_state.get("activities_results_cache") or {}
    cached = cached_payload.get(cache_key)
    if cached and not (cached.get("source") == "demo_fallback" and _google_places_api_key()):
        st.session_state["activities_data_source"] = cached.get("source", "demo_fallback")
        activities = cached.get("activities") or _demo_activities_for_destination(destination)
        st.session_state["activities_results"] = activities
        return activities

    google_activities = _search_google_places_activities(destination, per_query_limit=15)
    if google_activities:
        payload = {
            "source": "google_places",
            "activities": google_activities,
        }
        cached_payload[cache_key] = payload
        st.session_state["activities_results_cache"] = cached_payload
        st.session_state["activities_data_source"] = "google_places"
        st.session_state["activities_last_destination"] = destination
        st.session_state["activities_results"] = google_activities
        return google_activities

    fallback = _demo_activities_for_destination(destination)
    payload = {
        "source": "demo_fallback",
        "activities": fallback,
    }
    cached_payload[cache_key] = payload
    st.session_state["activities_results_cache"] = cached_payload
    st.session_state["activities_data_source"] = "demo_fallback"
    st.session_state["activities_last_destination"] = destination
    st.session_state["activities_results"] = fallback
    print(f"ACTIVITIES FALLBACK USED: no Google Places results for {destination}")
    return fallback


def _inject_styles():
    st.markdown(
        """
        <style>
        .ac-page-header { color: #e4e6f0; margin-bottom: 4px; }
        .ac-kicker {
            font-size: 11px; font-weight: 600; letter-spacing: .8px;
            text-transform: uppercase; color: rgba(255,255,255,.3); margin-bottom: 8px;
        }
        .ac-page-title {
            font-size: 28px; font-weight: 800; letter-spacing: -.8px;
            color: #fff; margin-bottom: 4px;
        }
        .ac-page-sub {
            font-size: 13px; color: rgba(255,255,255,.38);
            line-height: 1.5; margin-bottom: 16px;
        }
        .ac-card {
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 14px;
            background: linear-gradient(145deg, rgba(255,255,255,.04), rgba(255,255,255,.015)),
                        rgba(7,9,15,.92);
            padding: 13px 15px 11px;
            margin-bottom: 4px;
            overflow: hidden;
        }
        .ac-card-photo {
            height: clamp(140px, 18vw, 176px);
            max-height: 176px;
            margin: -13px -15px 12px;
            background-size: cover;
            background-position: center;
            border-bottom: 1px solid rgba(255,255,255,.08);
        }
        .ac-card.ac-saved {
            border-color: rgba(52,211,153,.30);
            background: linear-gradient(145deg, rgba(52,211,153,.04), rgba(255,255,255,.015)),
                        rgba(7,9,15,.94);
        }
        .ac-card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 8px;
        }
        .ac-card-left { flex: 1; min-width: 0; }
        .ac-card-right { flex-shrink: 0; text-align: right; }
        .ac-cat-badge-row {
            display: flex; align-items: center; gap: 6px;
            flex-wrap: wrap; margin-bottom: 4px;
        }
        .ac-cat-label {
            font-size: 10px; font-weight: 600; letter-spacing: .5px;
            text-transform: uppercase;
        }
        .ac-badge {
            font-size: 9px; font-weight: 700; letter-spacing: .4px;
            text-transform: uppercase; padding: 3px 7px; border-radius: 5px;
        }
        .ac-title {
            font-size: 14px; font-weight: 700; line-height: 1.3;
            color: #f1f5f9; margin-bottom: 4px;
        }
        .ac-desc {
            font-size: 12px; color: rgba(255,255,255,.48);
            line-height: 1.45;
        }
        .ac-price-main {
            font-size: 14px; font-weight: 700;
        }
        .ac-price-sub {
            font-size: 10px; color: rgba(255,255,255,.32); font-weight: 400;
        }
        .ac-meta-row {
            display: flex; gap: 12px; flex-wrap: wrap;
            margin-bottom: 7px;
        }
        .ac-meta-item {
            font-size: 11px; color: rgba(255,255,255,.38);
            display: flex; align-items: center; gap: 3px;
        }
        .ac-tags-row { display: flex; gap: 5px; flex-wrap: wrap; }
        .ac-tag {
            font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 500;
        }
        .ac-result-count {
            font-size: 12px; color: rgba(255,255,255,.3); margin-bottom: 10px;
        }
        .ac-saved-panel {
            border: 1px solid rgba(52,211,153,.22);
            border-radius: 16px;
            background: linear-gradient(145deg, rgba(52,211,153,.04), rgba(255,255,255,.015)),
                        rgba(7,9,15,.94);
            padding: 16px 18px;
            margin-top: 8px;
        }
        .ac-saved-title {
            font-size: 13px; font-weight: 700; color: #6ee7b7;
            letter-spacing: .06em; text-transform: uppercase;
            font-size: 10px; margin-bottom: 10px;
        }
        .ac-saved-item {
            font-size: 13px; color: rgba(255,255,255,.75);
            padding: 5px 0;
            border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .ac-photo-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin: 8px 0 12px;
        }
        .ac-modal-hero {
            height: 260px;
            max-height: 260px;
            border-radius: 14px;
            background-size: cover;
            background-position: center;
            border: 1px solid rgba(255,255,255,.08);
            margin-bottom: 8px;
        }
        .ac-photo-thumb {
            height: 72px;
            border-radius: 10px;
            background-size: cover;
            background-position: center;
            border: 1px solid rgba(255,255,255,.08);
        }
        .ac-link-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .ac-inline-link {
            color: #c4b5fd !important;
            font-size: 13px;
            text-decoration: none;
            border: 1px solid rgba(196,181,253,.24);
            border-radius: 8px;
            padding: 5px 8px;
            background: rgba(139,92,246,.08);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _activity_search_text(activity):
    return " ".join(
        [
            str(activity.get("title") or ""),
            str(activity.get("category") or ""),
            str(activity.get("subcategory") or ""),
            str(activity.get("neighborhood") or ""),
            str(activity.get("description") or ""),
            str(activity.get("address") or ""),
            " ".join(str(tag) for tag in activity.get("tags") or []),
        ]
    ).lower()


def _activity_matches_category(activity, category):
    if not category or category == "All":
        return True
    text = _activity_search_text(activity)
    if category == "Free":
        free_terms = ("free", "park", "church", "viewpoint", "public square", "plaza", "market", "garden")
        return str(activity.get("price", "")).lower() == "free" or any(term in text for term in free_terms)
    if category == "Adventure":
        adventure_terms = ("adventure", "outdoor", "viewpoint", "tour", "bike", "bicycle", "hiking", "kayak", "trail", "active")
        return activity.get("category") == "Adventure" or any(term in text for term in adventure_terms)
    if category == "Hidden gems":
        hidden_terms = ("hidden", "local", "less touristy", "neighborhood", "side street", "favorite", "gem")
        return activity.get("category") == "Hidden gems" or any(term in text for term in hidden_terms)
    return activity.get("category") == category


def _filter_activities(activities, query, category):
    result = activities
    if category and category != "All":
        result = [a for a in result if _activity_matches_category(a, category)]
    if query:
        q = query.lower()
        result = [
            a for a in result
            if q in _activity_search_text(a)
        ]
    return result


def _suggested_searches_for_empty(destination, category):
    destination = str(destination or "your destination").strip() or "your destination"
    suggestions = {
        "Adventure": ["viewpoints", "bike tours", "outdoor activities", "walking tours"],
        "Hidden gems": ["hidden gems", "local favorites", "less touristy places", "neighborhood cafés"],
        "Free": ["free things to do", "parks", "churches", "public squares", "viewpoints"],
        "Food": ["coffee", "food markets", "restaurants", "dessert"],
        "Nightlife": ["jazz", "cocktail bars", "live music", "nightlife"],
        "Culture": ["museums", "landmarks", "galleries", "historic sites"],
        "Nature": ["parks", "gardens", "waterfront walks", "scenic viewpoints"],
        "Luxury": ["shopping", "spa", "fine dining", "design district"],
    }
    terms = suggestions.get(category or "All", ["museums", "restaurants", "parks", "landmarks"])
    return [f"{term} in {destination}" for term in terms[:4]]


def _badge_html(badge_key):
    if not badge_key or badge_key not in _BADGE_META:
        return ""
    label, bg, color, border = _BADGE_META[badge_key]
    return (
        f'<span class="ac-badge" style="background:{bg};color:{color};'
        f'border:0.5px solid {border}">{_html.escape(label)}</span>'
    )


def _render_activity_card(activity, is_saved):
    cat = activity.get("category", "")
    cat_color, cat_bg, _ = _CAT_COLORS.get(cat, ("#a5b4fc", "rgba(99,102,241,.1)", ""))
    badge_html = _badge_html(activity.get("badge"))
    tags_html = "".join(
        f'<span class="ac-tag" style="background:{cat_bg};color:{cat_color}">{_html.escape(str(t))}</span>'
        for t in activity.get("tags", [])[:3]
    )
    price = activity.get("price", "")
    price_usd = activity.get("price_usd", "")
    badge = activity.get("badge", "")
    if price.lower() == "free":
        price_color = "#34d399"
    elif badge == "splurge":
        price_color = "#fbbf24"
    else:
        price_color = "rgba(255,255,255,.88)"

    price_usd_html = (
        f'<div class="ac-price-sub">{_html.escape(price_usd)}</div>' if price_usd else ""
    )
    saved_class = " ac-saved" if is_saved else ""
    photo_uri = ""
    photo_names = activity.get("photo_names") or []
    if photo_names:
        photo_uri = _photo_uri_cached(photo_names[0], max_width_px=560, fetch_if_missing=False)
    photo_html = (
        f'<div class="ac-card-photo" style="background-image:linear-gradient(180deg,rgba(3,7,18,.04),rgba(3,7,18,.42)),url({_html.escape(photo_uri)})"></div>'
        if photo_uri
        else ""
    )

    card_html = "".join([
        f'<div class="ac-card{saved_class}">',
        photo_html,
        '<div class="ac-card-top">',
        '<div class="ac-card-left">',
        '<div class="ac-cat-badge-row">',
        f'<span class="ac-cat-label" style="color:{cat_color}">{_html.escape(cat)}</span>',
        badge_html,
        '</div>',
        f'<div class="ac-title">{_html.escape(activity["title"])}</div>',
        f'<div class="ac-desc">{_html.escape(activity.get("description", ""))}</div>',
        '</div>',
        '<div class="ac-card-right">',
        f'<div class="ac-price-main" style="color:{price_color}">{_html.escape(price)}</div>',
        price_usd_html,
        '</div>',
        '</div>',
        '<div class="ac-meta-row">',
        f'<span class="ac-meta-item">⏱ {_html.escape(activity.get("duration", ""))}</span>',
        f'<span class="ac-meta-item">\U0001f4cd {_html.escape(activity.get("neighborhood", ""))}</span>',
        '</div>',
        f'<div class="ac-tags-row">{tags_html}</div>',
        '</div>',
    ])
    st.markdown(card_html, unsafe_allow_html=True)


def _activity_with_details(activity, deadline=None):
    start = time.perf_counter()
    enriched = dict(activity or {})
    place_details = _place_details_cached(enriched.get("place_id"))
    if place_details:
        for key, value in place_details.items():
            if value not in ("", None, [], {}):
                if key == "title" and enriched.get("title"):
                    continue
                if key == "photo_names":
                    enriched[key] = list(dict.fromkeys([*(value or []), *(enriched.get("photo_names") or [])]))
                else:
                    enriched[key] = value
    destination = _destination_city()
    print(f"ACTIVITIES DETAILS MERGE: seconds={time.perf_counter() - start:.3f}", flush=True)
    tripadvisor = _tripadvisor_enrichment_cached(enriched, destination, deadline=deadline)
    if tripadvisor:
        enriched["tripadvisor"] = tripadvisor
    return enriched


def _rating_line(activity):
    pieces = []
    if activity.get("rating"):
        pieces.append(f"{float(activity['rating']):.1f} ★")
    if activity.get("review_count"):
        pieces.append(f"{int(activity['review_count']):,} Google reviews")
    tripadvisor = activity.get("tripadvisor") or {}
    if tripadvisor.get("rating"):
        ta_piece = f"{tripadvisor['rating']} Tripadvisor"
        if tripadvisor.get("review_count"):
            ta_piece += f" · {tripadvisor['review_count']} reviews"
        pieces.append(ta_piece)
    return " · ".join(str(piece) for piece in pieces if piece)


def _activity_review_snippets(activity):
    snippets = []
    for review in (activity.get("google_reviews") or [])[:3]:
        text = str(review.get("text") or "").strip()
        if text:
            snippets.append(text)
    tripadvisor = activity.get("tripadvisor") or {}
    for text in (tripadvisor.get("reviews") or [])[:3]:
        clean = str(text or "").strip()
        if clean:
            snippets.append(clean)
    output = []
    seen = set()
    for snippet in snippets:
        normalized = _slug(snippet[:80])
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        output.append(snippet)
        if len(output) >= 3:
            break
    return output


def _compact_unique_items(items, limit=2):
    output = []
    seen = set()
    blocked = (
        "star",
        "rating",
        "review",
        "located around",
        "google places",
        "opening hours",
        "ticket requirements",
        "crowd levels can change",
        "book separately",
        "live availability",
    )
    for item in items or []:
        text = str(item or "").strip()
        if not text:
            continue
        lower = text.lower()
        if any(phrase in lower for phrase in blocked):
            continue
        key = _slug(lower[:90])
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(text.rstrip(".") + ".")
        if len(output) >= limit:
            break
    return output


def _activity_why_go_items(activity):
    destination = _destination_city()
    category = activity.get("category") or activity.get("subcategory") or "activity"
    summary = str(activity.get("editorial_summary") or "").strip()
    items = []
    if summary:
        items.append(summary)
    items.append(_activity_why_go(activity.get("subcategory") or category, destination))
    if activity.get("rating") and activity.get("review_count"):
        items.append(f"Well-reviewed enough to compare confidently: {float(activity['rating']):.1f} ★ from {int(activity['review_count']):,} Google reviews.")
    return _compact_unique_items(items, 2)


def _activity_know_items(activity):
    details = activity.get("details") or {}
    items = []
    hours = _activity_hours_summary(activity)
    if hours and "not available" not in hours.lower():
        items.append(hours)
    items.extend(details.get("tradeoffs") or [])
    if activity.get("website_uri") or activity.get("google_maps_uri"):
        items.append("Check current hours, ticket rules, or reservation requirements before going.")
    return _compact_unique_items(items, 2) or ["Check current hours before building this into a specific day."]


def _activity_pair_items(activity):
    details = activity.get("details") or {}
    nearby = []
    for item in details.get("nearby") or []:
        text = str(item or "").strip()
        if text and text != activity.get("address"):
            nearby.append(text)
    neighborhood = activity.get("neighborhood")
    category = activity.get("category")
    if neighborhood:
        nearby.append(f"Another stop near {neighborhood}.")
    if category == "Food":
        nearby.append("Pair with a nearby market, café, or evening walk.")
    elif category == "Culture":
        nearby.append("Pair with a slower neighborhood walk afterward.")
    elif category in {"Nature", "Adventure"}:
        nearby.append("Pair with a café or casual meal nearby.")
    else:
        nearby.append("Pair with another nearby saved activity.")
    return _compact_unique_items(nearby, 2)


def _activity_hours_summary(activity):
    if activity.get("opening_status"):
        return activity["opening_status"]
    hours = activity.get("hours_summary") or []
    if hours:
        return " · ".join(str(item) for item in hours[:2])
    return "Hours not available in Google Places."


def _activity_links_html(activity):
    links = []
    if activity.get("google_maps_uri"):
        links.append(("Google Maps", activity["google_maps_uri"]))
    if activity.get("website_uri"):
        links.append(("Website", activity["website_uri"]))
    tripadvisor = activity.get("tripadvisor") or {}
    if tripadvisor.get("web_url"):
        links.append(("Tripadvisor", tripadvisor["web_url"]))
    if not links:
        return ""
    return "".join(
        [
            '<div class="ac-link-row">',
            *[
                f'<a class="ac-inline-link" href="{_html.escape(url)}" target="_blank" rel="noopener noreferrer">{_html.escape(label)}</a>'
                for label, url in links
                if str(url).startswith("http")
            ],
            "</div>",
        ]
    )


def _render_activity_photos(photo_names, hero=False, deadline=None):
    clean_names = [name for name in (photo_names or []) if name][:4]
    if not clean_names:
        return
    uris = []
    for index, photo_name in enumerate(clean_names):
        uri = _photo_uri_cached(
            photo_name,
            max_width_px=900 if index == 0 else 420,
            fetch_if_missing=bool(hero and index == 0),
            deadline=deadline,
        )
        if uri:
            uris.append(uri)
    if not uris:
        return
    if hero:
        st.markdown(
            f'<div class="ac-modal-hero" style="background-image:linear-gradient(180deg,rgba(3,7,18,.02),rgba(3,7,18,.26)),url({_html.escape(uris[0])})"></div>',
            unsafe_allow_html=True,
        )
        uris = uris[1:]
    if uris:
        thumbs = "".join(
            f'<div class="ac-photo-thumb" style="background-image:url({_html.escape(uri)})"></div>'
            for uri in uris[:3]
        )
        st.markdown(f'<div class="ac-photo-grid">{thumbs}</div>', unsafe_allow_html=True)


def _render_details_modal(activity):
    details_start = time.perf_counter()
    deadline = details_start + ACTIVITY_DETAILS_MAX_SECONDS
    activity = _activity_with_details(activity, deadline=deadline)
    print(
        f"ACTIVITIES DETAILS PREP: activity_id={activity.get('id')} seconds={time.perf_counter() - details_start:.3f}",
        flush=True,
    )

    def _content():
        _render_activity_photos(activity.get("photo_names"), hero=True, deadline=deadline)

        st.markdown(f"**{_html.escape(activity.get('title') or 'Activity')}**")
        rating_line = _rating_line(activity)
        if rating_line:
            st.caption(rating_line)

        price = activity.get("price", "")
        meta_parts = [
            activity.get("category", ""),
            activity.get("neighborhood", ""),
            activity.get("duration", ""),
        ]
        if price:
            meta_parts.append(price)
        st.caption(" · ".join(p for p in meta_parts if p))

        if activity.get("address"):
            st.markdown(f"**Address:** {_html.escape(activity['address'])}")
        st.markdown(f"**Hours:** {_html.escape(_activity_hours_summary(activity))}")

        why_go_items = _activity_why_go_items(activity)
        if why_go_items:
            st.markdown("**Why go**")
            items_html = "".join(f"<li>{_html.escape(item)}</li>" for item in why_go_items[:2])
            st.markdown(
                f'<ul style="margin:0 0 2px;padding-left:1.2rem;color:rgba(255,255,255,.72);'
                f'font-size:13px;line-height:1.5">{items_html}</ul>',
                unsafe_allow_html=True,
            )

        know = _activity_know_items(activity)[:2]
        if know:
            items_html = "".join(f"<li>{_html.escape(k)}</li>" for k in know)
            st.markdown(
                f'<p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.55);'
                f'text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">Know before you go</p>'
                f'<ul style="margin:0 0 2px;padding-left:1.2rem;color:rgba(255,255,255,.72);'
                f'font-size:13px;line-height:1.5">{items_html}</ul>',
                unsafe_allow_html=True,
            )

        pair_items = _activity_pair_items(activity)[:2]
        if pair_items:
            items_html = "".join(f"<li>{_html.escape(item)}</li>" for item in pair_items)
            st.markdown(
                f'<p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.55);'
                f'text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">Pair with</p>'
                f'<ul style="margin:0 0 2px;padding-left:1.2rem;color:rgba(255,255,255,.72);'
                f'font-size:13px;line-height:1.5">{items_html}</ul>',
                unsafe_allow_html=True,
            )

        reviews = _activity_review_snippets(activity)
        if reviews:
            items_html = "".join(f"<li>{_html.escape(snippet[:220])}</li>" for snippet in reviews[:3])
            st.markdown(
                f'<p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.55);'
                f'text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">Reviews</p>'
                f'<ul style="margin:0 0 2px;padding-left:1.2rem;color:rgba(255,255,255,.72);'
                f'font-size:13px;line-height:1.5">{items_html}</ul>',
                unsafe_allow_html=True,
            )

        links_html = _activity_links_html(activity)
        if links_html:
            st.markdown(links_html, unsafe_allow_html=True)

        if st.button("Close", key=f"close_activity_details_{activity['id']}"):
            st.session_state.pop("activities_active_modal", None)
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog(activity["title"])
        def _dialog():
            _content()
        _dialog()
    else:
        with st.container(border=True):
            st.markdown(f"**{activity['title']}**")
            _content()


def render():
    track_once("page_viewed", key="activities_page_viewed", properties={"page_name": "activities"})
    _inject_styles()

    destination_city = _destination_city()
    st.markdown(
        '<div class="ac-kicker">Activities</div>'
        f'<div class="ac-page-title">Things to do in {_html.escape(destination_city)}</div>'
        '<div class="ac-page-sub">Browse, save, and build your own itinerary. Use search or category chips to filter.</div>',
        unsafe_allow_html=True,
    )

    # --- search ---
    search_query = st.text_input(
        "Search activities",
        value=st.session_state.get("activities_search", ""),
        placeholder="Search activities, neighborhoods, food, museums, shopping...",
        label_visibility="collapsed",
        key="activities_search",
    )

    # --- category chips ---
    active_category = st.session_state.get("activities_category", "All")
    if hasattr(st, "pills"):
        selected_category = st.pills(
            "Category",
            CATEGORIES,
            default=active_category if active_category in CATEGORIES else "All",
            label_visibility="collapsed",
            key="activities_category_pills",
        )
        if selected_category != active_category:
            st.session_state["activities_category"] = selected_category or "All"
            active_category = selected_category or "All"
    else:
        selected_category = st.radio(
            "Category",
            CATEGORIES,
            index=CATEGORIES.index(active_category) if active_category in CATEGORIES else 0,
            horizontal=True,
            label_visibility="collapsed",
            key="activities_category_radio",
        )
        if selected_category != active_category:
            st.session_state["activities_category"] = selected_category
            active_category = selected_category

    # --- filter ---
    saved_ids = set(st.session_state.get("activities_saved") or [])
    activities = get_activities_for_destination(destination_city)
    live_query_results = []
    if str(search_query or "").strip():
        live_query_results = _search_google_places_for_user_query(destination_city, search_query, limit=20)
        if live_query_results:
            st.session_state["activities_live_search_results"] = live_query_results
            activities = _merge_activity_lists(live_query_results, activities, limit=140)
            st.session_state["activities_results"] = activities
    visible = _filter_activities(activities, search_query, active_category)
    activities_by_id = {a["id"]: a for a in activities}

    count_label = f"{len(visible)} activit{'y' if len(visible) == 1 else 'ies'}"
    if search_query:
        count_label += f' matching "{search_query}"'
    elif active_category and active_category != "All":
        count_label += f" in {active_category}"
    st.markdown(f'<div class="ac-result-count">{_html.escape(count_label)}</div>', unsafe_allow_html=True)

    if not visible:
        suggestions = _suggested_searches_for_empty(destination_city, active_category)
        st.info(
            "No activities match that filter yet. Try one of these searches: "
            + ", ".join(suggestions)
            + "."
        )

    # --- activity cards ---
    for activity in visible:
        activity_id = activity["id"]
        is_saved = activity_id in saved_ids

        _render_activity_card(activity, is_saved)

        action_cols = st.columns([1, 0.18, 0.22, 0.18])
        with action_cols[1]:
            save_label = "Saved" if is_saved else "Save"
            if st.button(save_label, key=f"ac_save_{activity_id}"):
                if is_saved:
                    saved_ids.discard(activity_id)
                    track_event("activity_unsaved", {"activity": activity["title"]})
                else:
                    saved_ids.add(activity_id)
                    track_event("activity_saved", {"activity": activity["title"]})
                st.session_state["activities_saved"] = list(saved_ids)
                st.rerun()
        with action_cols[2]:
            add_label = "In itinerary" if is_saved else "Add to day"
            if st.button(add_label, key=f"ac_add_{activity_id}", disabled=is_saved):
                saved_ids.add(activity_id)
                st.session_state["activities_saved"] = list(saved_ids)
                track_event("activity_added_to_day", {"activity": activity["title"]})
                st.rerun()
        with action_cols[3]:
            if st.button("Details", key=f"ac_details_{activity_id}"):
                st.session_state["activities_active_modal"] = activity_id
                st.rerun()

    # --- details modal (exactly one dialog per run) ---
    active_modal_id = st.session_state.get("activities_active_modal")
    if active_modal_id and active_modal_id in activities_by_id:
        _render_details_modal(activities_by_id[active_modal_id])

    # --- saved activities panel ---
    saved_activities = [activities_by_id[aid] for aid in saved_ids if aid in activities_by_id]
    if saved_activities:
        st.markdown("---")
        st.markdown(
            '<div class="ac-saved-panel">',
            unsafe_allow_html=True,
        )
        st.markdown(
            f'<div class="ac-saved-title">Saved activities · {len(saved_activities)}</div>',
            unsafe_allow_html=True,
        )
        for activity in saved_activities:
            cat_color, _, _ = _CAT_COLORS.get(activity["category"], ("#a5b4fc", "", ""))
            remove_cols = st.columns([1, 0.16])
            with remove_cols[0]:
                st.markdown(
                    f'<div class="ac-saved-item">'
                    f'<span style="color:{cat_color};font-size:10px;font-weight:700;'
                    f'text-transform:uppercase;letter-spacing:.4px;margin-right:7px">'
                    f'{_html.escape(activity["category"])}</span>'
                    f'{_html.escape(activity["title"])}'
                    f'<span style="color:rgba(255,255,255,.35);font-size:11px;margin-left:8px">'
                    f'{_html.escape(activity.get("duration", ""))}</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
            with remove_cols[1]:
                if st.button("Remove", key=f"ac_remove_{activity['id']}"):
                    saved_ids.discard(activity["id"])
                    st.session_state["activities_saved"] = list(saved_ids)
                    track_event("activity_removed_from_saved", {"activity": activity["title"]})
                    st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
        if st.button(
            f"Build itinerary from {len(saved_activities)} saved activit{'y' if len(saved_activities) == 1 else 'ies'}",
            key="ac_build_itinerary",
            type="primary",
        ):
            st.session_state["itinerary_source_activities"] = [a["id"] for a in saved_activities]
            track_event(
                "itinerary_build_requested",
                {
                    "activity_count": len(saved_activities),
                    "activities": [a["title"] for a in saved_activities],
                },
            )
            st.info(
                f"Itinerary builder will use your {len(saved_activities)} saved activities. "
                "Coming soon — check the Itinerary tab."
            )
