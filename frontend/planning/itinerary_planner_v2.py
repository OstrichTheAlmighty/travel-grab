"""
Deterministic itinerary planner v2.

This module is intentionally pure Python: no Streamlit and no session state.
The page layer owns persistence and rendering. The planner owns classification,
city rejection, clustering, fixed slot assignment, and debug output.
"""

from __future__ import annotations

import math
import re


ATTRACTION_SLOTS = (
    {"name": "9:00 attraction", "start": 9 * 60, "end": 10 * 60 + 30, "period": "Morning"},
    {"name": "10:45 attraction", "start": 10 * 60 + 45, "end": 12 * 60 + 15, "period": "Morning"},
    {"name": "2:00 attraction", "start": 14 * 60, "end": 15 * 60 + 30, "period": "Afternoon"},
    {"name": "3:45 optional attraction", "start": 15 * 60 + 45, "end": 17 * 60 + 15, "period": "Afternoon"},
    {"name": "6:30 evening attraction", "start": 18 * 60 + 30, "end": 20 * 60, "period": "Evening", "evening_only": True},
)
NIGHTLIFE_SLOT = {"name": "9:00 nightlife", "start": 21 * 60, "end": 23 * 60, "period": "Evening"}

ARRIVAL_TRANSFER_AND_CHECKIN_MIN = 150
DEPARTURE_AIRPORT_BUFFER_MIN = 240
DAY_TRIP_RADIUS_KM = 150

NIGHTLIFE_CATEGORIES = {"nightlife", "bar", "bars", "nightclub", "night club", "lounge"}
NIGHTLIFE_TERMS = (
    "bar", "pub", "nightclub", "night club", "club", "lounge", "cocktail",
    "music venue", "live music", "jazz", "dj", "nightlife", "brewery", "wine bar",
)
FOOD_TERMS = (
    "restaurant", "cafe", "café", "coffee", "bakery", "izakaya", "ramen", "sushi",
    "bistro", "brasserie", "trattoria", "taverna", "dessert", "gelato", "pastry",
    "food hall", "food court", "food market", "night market", "dining", "eatery",
    "taqueria", "pizzeria", "steakhouse", "omakase", "tea house", "teahouse",
)
FOOD_EXPERIENCE_TERMS = (
    "food tour", "food walk", "tasting", "cooking class", "culinary", "street food",
    "dessert crawl", "cafe crawl", "café crawl", "dining experience",
)
ATTRACTION_TERMS = (
    "museum", "gallery", "observation deck", "observatory", "tower", "temple",
    "shrine", "palace", "castle", "cathedral", "monument", "landmark", "park",
    "garden", "ruins", "fortress", "basilica", "aquarium", "zoo", "botanical",
)
TIER_ONE_TERMS = (
    "museum", "landmark", "monument", "palace", "castle", "cathedral", "temple",
    "shrine", "observation deck", "tower", "gallery", "historic", "heritage",
    "ruins", "fortress", "basilica", "opera house",
)
WRONG_CITY_HINTS = (
    "california", "san francisco", "los angeles", "oakland", "san jose", "new york",
    "london", "paris", "seoul", "tokyo", "kyoto", "osaka", "budapest", "zagreb",
)

# Attractions explicitly enjoyable or typically open in the evening.
EVENING_FRIENDLY_TERMS = (
    "observation deck", "observatory", "viewpoint", "view point", "city view",
    "skyline", "panoramic", "panorama", "rooftop", "roof top",
    "light show", "illumination", "night illumination",
    "night market", "evening tour", "night tour", "sunset tour", "sunset cruise",
    "evening walk", "night walk",
    "performance", "theatre", "theater", "opera", "concert", "live show",
    "night view", "night scene",
)
# Attractions that typically close by late afternoon / early evening.
NOT_EVENING_FRIENDLY_TERMS = (
    "museum", "gallery", "art gallery",
    "garden", "botanical garden",
    "park", "national park",
    "temple", "shrine",
    "zoo", "aquarium",
    "ruins", "archaeological",
)
EVENING_FRIENDLY_CATEGORIES = frozenset({"entertainment", "performance", "viewpoint", "observation"})
NOT_EVENING_FRIENDLY_CATEGORIES = frozenset({"museum", "gallery", "garden", "park", "nature", "religious", "zoo", "aquarium"})
_EVENING_CUTOFF = 18 * 60  # 6:00 PM


def _normalize(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _text(item: dict) -> str:
    parts = [
        item.get("name"),
        item.get("title"),
        item.get("category"),
        item.get("subcategory"),
        item.get("neighborhood"),
        item.get("address"),
        item.get("destination"),
        " ".join(str(tag) for tag in item.get("tags", []) or []),
    ]
    return " ".join(str(part or "") for part in parts).lower()


def _name(item: dict) -> str:
    return str(item.get("name") or item.get("title") or "Activity")


def _stable_key(item: dict) -> str:
    for field in ("place_id", "selection_id", "id"):
        value = str(item.get(field) or "").strip()
        if value:
            return f"{field}:{value}"
    name = re.sub(r"[^a-z0-9]+", "_", _name(item).lower()).strip("_")
    address = re.sub(r"[^a-z0-9]+", "_", str(item.get("address") or item.get("neighborhood") or "").lower()).strip("_")
    destination = _normalize(item.get("destination"))
    return f"fallback:{destination}:{name}:{address}"


def _clock_minutes(value) -> int | None:
    if not value:
        return None
    text = str(value).strip().lower().replace(".", "")
    try:
        suffix = None
        if text.endswith("am") or text.endswith("pm"):
            suffix = text[-2:]
            text = text[:-2].strip()
        if ":" in text:
            hour_text, minute_text = text.split(":", 1)
            hour = int(hour_text)
            minute = int("".join(ch for ch in minute_text if ch.isdigit())[:2] or "0")
        else:
            hour = int("".join(ch for ch in text if ch.isdigit()) or "0")
            minute = 0
        if suffix == "pm" and hour != 12:
            hour += 12
        if suffix == "am" and hour == 12:
            hour = 0
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour * 60 + minute
    except (TypeError, ValueError):
        return None
    return None


def _duration_minutes(item: dict, default=90) -> int:
    raw = str(item.get("duration") or "").strip().lower()
    if not raw:
        return default
    values = [float(value) for value in re.findall(r"\d+(?:\.\d+)?", raw)]
    if not values:
        return default
    value = sum(values[:2]) / min(2, len(values))
    if "hr" in raw or "hour" in raw or re.search(r"\d\s*h", raw):
        return int(max(30, min(240, value * 60)))
    if "min" in raw:
        return int(max(20, min(180, value)))
    if value <= 12:
        return int(max(30, min(240, value * 60)))
    return int(max(20, min(180, value)))


def _haversine_km(a: dict, b: dict):
    try:
        lat1, lon1 = float(a["lat"]), float(a["lng"])
        lat2, lon2 = float(b["lat"]), float(b["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    x = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def _is_nightlife(item: dict) -> bool:
    text = _text(item)
    category = str(item.get("category") or "").strip().lower()
    if any(term in text for term in ATTRACTION_TERMS):
        return False
    if category in NIGHTLIFE_CATEGORIES:
        return True
    if category == "food":
        return False
    return any(term in text for term in NIGHTLIFE_TERMS)


def _is_food(item: dict) -> bool:
    text = _text(item)
    category = str(item.get("category") or "").strip().lower()
    if _is_nightlife(item):
        return False
    if any(term in text for term in FOOD_EXPERIENCE_TERMS):
        return True
    if any(term in text for term in ATTRACTION_TERMS) and not any(term in text for term in FOOD_TERMS):
        return False
    return category == "food" or any(term in text for term in FOOD_TERMS)


def _meal_type(item: dict) -> str:
    text = _text(item)
    if any(term in text for term in ("breakfast", "brunch", "coffee", "cafe", "café", "bakery", "pastry")):
        return "breakfast"
    if any(term in text for term in ("dinner", "izakaya", "omakase", "steak", "cocktail dinner")):
        return "dinner"
    return "lunch"


def _classify(item: dict) -> str:
    if _is_nightlife(item):
        return "nightlife"
    if _is_food(item):
        return "restaurant"
    return "attraction"


def _tier(item: dict) -> int:
    text = _text(item)
    category = str(item.get("category") or "").lower()
    if category == "culture" or any(term in text for term in TIER_ONE_TERMS):
        return 1
    return 2


def _is_evening_friendly(item: dict) -> bool:
    text = _text(item)
    if any(term in text for term in NOT_EVENING_FRIENDLY_TERMS):
        return False
    if any(term in text for term in EVENING_FRIENDLY_TERMS):
        return True
    category = str(item.get("category") or "").strip().lower()
    if category in NOT_EVENING_FRIENDLY_CATEGORIES:
        return False
    return category in EVENING_FRIENDLY_CATEGORIES


def _close_time_minutes(item: dict) -> int | None:
    """Return the latest confirmed closing time in minutes-since-midnight, or None if unknown."""
    raw = None
    oh = item.get("opening_hours")
    if isinstance(oh, dict):
        periods = oh.get("periods") or []
        close_times = []
        for period in periods:
            t = (period.get("close") or {}).get("time", "")
            if re.match(r"^\d{4}$", t):
                minutes = int(t[:2]) * 60 + int(t[2:])
                close_times.append(24 * 60 if minutes == 0 else minutes)
        if close_times:
            return max(close_times)
        raw = " ".join(str(s) for s in (oh.get("weekday_text") or []))
    elif isinstance(oh, str):
        raw = oh

    if not raw:
        for field in ("hours", "business_hours", "open_hours"):
            val = item.get(field)
            if val and isinstance(val, str):
                raw = val
                break

    if not raw:
        return None

    raw_lower = raw.lower()
    if "24 hours" in raw_lower or "open 24" in raw_lower or "always open" in raw_lower:
        return 24 * 60

    # Match "HH:MM – HH:MM" or "HH:MM AM - HH:MM PM" patterns; capture the closing half.
    close_times = []
    for m in re.finditer(
        r"\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-–—]\s*(\d{1,2}:\d{2})\s*(am|pm)?",
        raw_lower,
    ):
        t = _clock_minutes(m.group(1) + (" " + m.group(2) if m.group(2) else ""))
        if t is not None:
            close_times.append(24 * 60 if t == 0 else t)

    return max(close_times) if close_times else None


def _slot_allows_item(slot: dict, item: dict) -> bool:
    """Return False if this attraction should not be placed in this time slot."""
    slot_start = slot["start"]

    if slot_start >= _EVENING_CUTOFF:
        # Evening slot: only evening-friendly attractions allowed.
        if not _is_evening_friendly(item):
            return False
        close = _close_time_minutes(item)
        if close is not None:
            return close > slot_start  # confirmed open
        return slot_start <= 21 * 60   # unknown hours → allow up to 9 PM start

    # Daytime slot: reject if confirmed closed before slot start.
    close = _close_time_minutes(item)
    if close is not None and close <= slot_start:
        return False
    return True


def _score(item: dict) -> float:
    score = 0.0
    try:
        score += float(item.get("rating") or 0) * 8
    except (TypeError, ValueError):
        pass
    try:
        reviews = int(item.get("review_count") or item.get("user_ratings_total") or 0)
        if reviews > 0:
            score += min(40, math.log10(reviews + 1) * 10)
    except (TypeError, ValueError):
        pass
    if _tier(item) == 1:
        score += 20
    tags = {str(tag).lower() for tag in item.get("tags", []) or []}
    if tags.intersection({"popular", "iconic", "landmark", "must-see", "top attraction"}):
        score += 15
    return score


def _matches_city(item: dict, context: dict) -> bool:
    city = _normalize(context.get("destination_city"))
    if not city:
        return True
    item_destination = _normalize(item.get("destination"))
    if item_destination:
        return item_destination == city

    try:
        hotel_lat = float(context.get("hotel_lat") or 0)
        hotel_lng = float(context.get("hotel_lng") or 0)
        item_lat = float(item.get("lat") or 0)
        item_lng = float(item.get("lng") or 0)
    except (TypeError, ValueError):
        hotel_lat = hotel_lng = item_lat = item_lng = 0
    if hotel_lat and hotel_lng and item_lat and item_lng:
        distance = _haversine_km({"lat": hotel_lat, "lng": hotel_lng}, {"lat": item_lat, "lng": item_lng})
        if distance is not None and distance > DAY_TRIP_RADIUS_KM:
            return False
        return True

    address_text = _normalize(" ".join([str(item.get("address") or ""), str(item.get("neighborhood") or "")]))
    for hint in WRONG_CITY_HINTS:
        normalized_hint = _normalize(hint)
        if normalized_hint and normalized_hint in address_text and normalized_hint != city:
            return False
    return True


def _dedupe_exact(items: list[dict], rejections: list[dict]) -> list[dict]:
    seen = set()
    output = []
    for item in items:
        key = _stable_key(item)
        if key in seen:
            rejections.append({"name": _name(item), "reason": "Duplicate selection"})
            continue
        seen.add(key)
        output.append(item)
    return output


# Stop words stripped from attraction names for semantic dedup.
# "Tokyo Skytree Town" → ["tokyo", "skytree"] after dropping "town".
_DEDUP_STOP_WORDS = frozenset((
    "town", "complex", "area", "district", "center", "centre", "official",
    "main", "tickets", "ticket", "admission", "experience", "visit", "tour",
    "observation", "observatory", "deck", "entrance", "access", "new", "old", "top",
))


def _norm_words(name: str) -> list[str]:
    words = re.sub(r"[^\w\s]", " ", (name or "").lower()).split()
    while words and words[-1] in _DEDUP_STOP_WORDS:
        words.pop()
    return words


def _richness(item: dict) -> int:
    score = 0
    if item.get("photo_url") or item.get("photo"):
        score += 4
    if item.get("rating"):
        score += 3
    if item.get("review_count") or item.get("user_ratings_total"):
        score += 2
    if item.get("address"):
        score += 1
    return score


def _dedupe_semantic(items: list[dict], rejections: list[dict]) -> list[dict]:
    """
    Remove near-duplicate attractions.

    Two attractions are duplicates when:
      - Their normalized names (stop-words stripped) share a common prefix
        of at least 2 words, AND
      - They are within 1 km of each other.

    The richer record is kept (photo > rating > reviews > address).
    """
    if len(items) <= 1:
        return list(items)
    dropped: set = set()
    for i in range(len(items)):
        if i in dropped:
            continue
        wa = _norm_words(_name(items[i]))
        for j in range(i + 1, len(items)):
            if j in dropped:
                continue
            wb = _norm_words(_name(items[j]))
            min_len = min(len(wa), len(wb))
            if min_len < 2 or wa[:min_len] != wb[:min_len]:
                continue
            dist = _haversine_km(items[i], items[j])
            if dist is None or dist > 1.0:
                continue
            if _richness(items[i]) >= _richness(items[j]):
                winner, loser_idx = items[i], j
            else:
                winner, loser_idx = items[j], i
            loser = items[loser_idx]
            if loser_idx not in dropped:
                dropped.add(loser_idx)
                rejections.append({
                    "name": _name(loser),
                    "reason": f"Semantic duplicate of {_name(winner)}",
                })
            if loser_idx == i:
                break
    return [item for idx, item in enumerate(items) if idx not in dropped]


def _location_key(item: dict) -> str:
    destination = str(item.get("destination") or "").strip().lower()
    neighborhood = str(item.get("neighborhood") or item.get("address") or "").strip().lower()
    return f"{destination}|{neighborhood}"


def _cluster_attractions(items: list[dict]) -> list[list[dict]]:
    remaining = list(items)
    clusters = []
    while remaining:
        seed = remaining.pop(0)
        cluster = [seed]
        keep = []
        for candidate in remaining:
            distance = _haversine_km(seed, candidate)
            same_area = _location_key(seed) == _location_key(candidate)
            if same_area or (distance is not None and distance <= 2.5):
                cluster.append(candidate)
            else:
                keep.append(candidate)
        remaining = keep
        clusters.append(cluster)
    return clusters


def _latest_allowed_end(day: str, base_days: list[str], context: dict) -> int:
    if len(base_days) > 1 and day == base_days[-1]:
        departure = _clock_minutes(context.get("departure_time"))
        if departure is not None:
            return max(7 * 60, departure - DEPARTURE_AIRPORT_BUFFER_MIN)
        return 12 * 60
    return 24 * 60


def _available_attraction_slots(day: str, base_days: list[str], context: dict) -> list[dict]:
    earliest = 0
    if len(base_days) > 1 and day == base_days[0]:
        arrival = _clock_minutes(context.get("arrival_time"))
        earliest = (arrival + ARRIVAL_TRANSFER_AND_CHECKIN_MIN) if arrival is not None else 14 * 60
    latest = _latest_allowed_end(day, base_days, context)
    return [
        slot for slot in ATTRACTION_SLOTS
        if slot["start"] >= earliest and slot["end"] <= latest
    ]


def _nightlife_allowed(day: str, base_days: list[str], context: dict) -> bool:
    if len(base_days) > 1 and day in {base_days[0], base_days[-1]}:
        return False
    return NIGHTLIFE_SLOT["end"] <= _latest_allowed_end(day, base_days, context)


def _copy_for_slot(item: dict, slot: dict) -> dict:
    placed = dict(item)
    placed["period"] = slot["period"]
    placed["_v2_slot"] = slot["name"]
    placed["_v2_start"] = slot["start"]
    placed["_v2_duration_minutes"] = min(_duration_minutes(item), max(45, slot["end"] - slot["start"]))
    return placed


def _cluster_area(cluster: list[dict]) -> str:
    if not cluster:
        return "Unknown area"
    raw = str(cluster[0].get("neighborhood") or cluster[0].get("address") or "").strip()
    return raw.title() if raw else "Unknown area"


def _day_target(day: str, base_days: list[str]) -> int:
    if len(base_days) > 1 and day in {base_days[0], base_days[-1]}:
        return 1
    return 3


def plan(items: list, context: dict, base_days: list) -> dict:
    log = []

    def log_line(action, item=None, day=None, reason=""):
        parts = ["PLANNER_V2", action]
        if item is not None:
            parts.append(f"item={_name(item)}")
        if day:
            parts.append(f"day={day}")
        if reason:
            parts.append(f"reason={reason}")
        log.append(" | ".join(parts))

    base_days = list(base_days or ["Day 1"])
    assigned = {day: [] for day in base_days}
    slot_fills = {
        day: [None] * len(_available_attraction_slots(day, base_days, context))
        for day in base_days
    }
    day_slots = {day: _available_attraction_slots(day, base_days, context) for day in base_days}

    wrong_city = []
    couldnt_fit = []
    classifications = []
    rejections = []
    assignments = []

    input_items = _dedupe_exact([item for item in items or [] if isinstance(item, dict)], rejections)
    attractions = []
    restaurants = []
    nightlife = []

    for item in input_items:
        if not _name(item).strip():
            rejections.append({"name": "Activity", "reason": "Missing name"})
            continue
        if not _matches_city(item, context):
            marked = dict(item, unscheduled_reason="Wrong city")
            wrong_city.append(marked)
            rejections.append({"name": _name(item), "reason": "Wrong city"})
            log_line("rejected", item, reason="Wrong city")
            continue
        kind = _classify(item)
        classifications.append({
            "name": _name(item),
            "classification": kind,
            "category": item.get("category") or "",
            "tier": _tier(item) if kind == "attraction" else None,
            "nightlife_eligible": kind == "nightlife",
            "evening_friendly": _is_evening_friendly(item) if kind == "attraction" else None,
        })
        if kind == "restaurant":
            restaurants.append(item)
        elif kind == "nightlife":
            nightlife.append(item)
        else:
            attractions.append(item)

    attractions = _dedupe_semantic(attractions, rejections)

    clusters = _cluster_attractions(sorted(attractions, key=lambda item: (_tier(item), -_score(item))))
    clusters.sort(key=lambda cluster: (
        min((_tier(item) for item in cluster), default=2),
        -max((_score(item) for item in cluster), default=0),
        -len(cluster),
    ))

    def open_slots(day: str) -> int:
        return sum(1 for value in slot_fills.get(day, []) if value is None)

    def placed_count(day: str) -> int:
        return len([item for item in assigned.get(day, []) if _classify(item) == "attraction"])

    def try_place(item: dict, day: str) -> bool:
        for index, slot in enumerate(day_slots.get(day, [])):
            if slot_fills[day][index] is not None:
                continue
            if not _slot_allows_item(slot, item):
                continue
            placed = _copy_for_slot(item, slot)
            assigned[day].append(placed)
            slot_fills[day][index] = placed
            assignments.append({
                "name": _name(item),
                "day": day,
                "slot": slot["name"],
                "tier": _tier(item),
                "deferrals": 0,
            })
            log_line("placed", item, day, slot["name"])
            return True
        return False

    for cluster in clusters:
        cluster_items = sorted(cluster, key=lambda item: (_tier(item), -_score(item)))
        candidates = [
            day for day in base_days
            if open_slots(day) > 0 and placed_count(day) < 4
        ]
        if not candidates:
            candidates = [day for day in base_days if open_slots(day) > 0]
        if not candidates:
            for item in cluster_items:
                rejected = dict(item, unscheduled_reason="No open attraction slot")
                couldnt_fit.append(rejected)
                rejections.append({"name": _name(item), "reason": "No open attraction slot"})
                log_line("rejected", item, reason="No open attraction slot")
            continue
        target = min(
            candidates,
            key=lambda day: (
                abs(placed_count(day) - _day_target(day, base_days)),
                placed_count(day),
                -open_slots(day),
                base_days.index(day),
            ),
        )
        for item in cluster_items:
            if not try_place(item, target):
                placed_elsewhere = False
                for day in sorted(base_days, key=lambda value: (placed_count(value), -open_slots(value), base_days.index(value))):
                    if open_slots(day) and try_place(item, day):
                        placed_elsewhere = True
                        break
                if not placed_elsewhere:
                    rejected = dict(item, unscheduled_reason="No open attraction slot")
                    couldnt_fit.append(rejected)
                    rejections.append({"name": _name(item), "reason": "No open attraction slot"})
                    log_line("rejected", item, reason="No open attraction slot")

    for item in sorted(nightlife, key=lambda value: -_score(value)):
        candidates = [
            day for day in base_days
            if _nightlife_allowed(day, base_days, context)
            and sum(1 for e in assigned.get(day, []) if _classify(e) == "nightlife") < 1
        ]
        if not candidates:
            rejected = dict(item, unscheduled_reason="No eligible nightlife slot")
            couldnt_fit.append(rejected)
            rejections.append({"name": _name(item), "reason": "No eligible nightlife slot"})
            log_line("rejected", item, reason="No eligible nightlife slot")
            continue
        target = min(
            candidates,
            key=lambda day: (
                len([entry for entry in assigned.get(day, []) if _classify(entry) == "nightlife"]),
                placed_count(day),
                base_days.index(day),
            ),
        )
        placed = dict(item)
        placed["period"] = "Evening"
        placed["_v2_slot"] = NIGHTLIFE_SLOT["name"]
        placed["_v2_start"] = NIGHTLIFE_SLOT["start"]
        placed["_v2_duration_minutes"] = min(_duration_minutes(item, default=120), 120)
        assigned[target].append(placed)
        assignments.append({"name": _name(item), "day": target, "slot": NIGHTLIFE_SLOT["name"], "tier": 3, "deferrals": 0})
        log_line("placed", item, target, NIGHTLIFE_SLOT["name"])

    meal_slots = []
    for day in base_days:
        if len(base_days) > 1 and day == base_days[-1]:
            latest = _latest_allowed_end(day, base_days, context)
            if 12 * 60 + 60 <= latest:
                meal_slots.append((day, "lunch"))
            continue
        if len(base_days) > 1 and day == base_days[0]:
            arrival = _clock_minutes(context.get("arrival_time"))
            if arrival is None or arrival + ARRIVAL_TRANSFER_AND_CHECKIN_MIN <= 18 * 60:
                meal_slots.append((day, "dinner"))
            continue
        meal_slots.extend([(day, "lunch"), (day, "dinner")])

    meal_items = []
    used_meal_slots = set()
    for item in sorted(restaurants, key=lambda value: -_score(value)):
        preferred_type = _meal_type(item)
        slot_candidates = [slot for slot in meal_slots if slot[1] == preferred_type and slot not in used_meal_slots]
        if preferred_type == "breakfast":
            slot_candidates = []
        if not slot_candidates and preferred_type in {"lunch", "dinner"}:
            slot_candidates = [slot for slot in meal_slots if slot not in used_meal_slots]
        if not slot_candidates:
            rejected = dict(item, unscheduled_reason="No open meal slot")
            couldnt_fit.append(rejected)
            rejections.append({"name": _name(item), "reason": "No open meal slot"})
            log_line("rejected", item, reason="No open meal slot")
            continue
        day, meal_type = slot_candidates[0]
        used_meal_slots.add((day, meal_type))
        meal = dict(item)
        meal["meal_type"] = meal_type
        meal["_v2_meal_day"] = day
        meal["_v2_meal_type"] = meal_type
        meal_items.append(meal)
        assignments.append({"name": _name(item), "day": day, "slot": meal_type, "tier": None, "deferrals": 0})
        log_line("placed", item, day, f"{meal_type} meal slot")

    cluster_display = [
        {
            "area": _cluster_area(cluster),
            "items": [
                {"name": _name(item), "tier": _tier(item), "category": item.get("category") or ""}
                for item in cluster
            ],
        }
        for cluster in clusters
    ]
    day_utilization = {}
    for day in base_days:
        available = max(1, len(day_slots.get(day, [])))
        filled = available - open_slots(day)
        day_utilization[day] = {
            "available_slots": available,
            "filled_slots": filled,
            "utilization_pct": round(filled / available * 100),
        }

    analysis = {
        "clusters": cluster_display,
        "category_validation": classifications,
        "assignments": assignments,
        "rejections": rejections,
        "deferrals": {},
        "duplicate_detected": [r for r in rejections if "Semantic duplicate" in (r.get("reason") or "")],
        "day_utilization": day_utilization,
    }

    return {
        "assigned": assigned,
        "meal_items": meal_items,
        "wrong_city": wrong_city,
        "couldnt_fit": couldnt_fit,
        "analysis": analysis,
        "log": log,
    }
