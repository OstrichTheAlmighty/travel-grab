import html as _html
import streamlit as st

from analytics import track_event, track_once


CATEGORIES = ["All", "Food", "Nightlife", "Culture", "Adventure", "Nature", "Luxury", "Hidden gems", "Free"]


def _destination_city():
    explicit = st.session_state.get("trip_destination")
    if explicit:
        return str(explicit).strip() or "Tokyo"
    search_params = st.session_state.get("flight_search") or {}
    city = str(search_params.get("destination_city") or "Tokyo").strip()
    st.session_state["trip_destination"] = city or "Tokyo"
    return city or "Tokyo"

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


def get_activities_for_destination(destination: str):
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
        </style>
        """,
        unsafe_allow_html=True,
    )


def _filter_activities(activities, query, category):
    result = activities
    if category and category != "All":
        if category == "Free":
            result = [
                a for a in result
                if str(a.get("price", "")).lower() == "free"
                or any("free" in t.lower() for t in a.get("tags", []))
            ]
        else:
            result = [a for a in result if a.get("category") == category]
    if query:
        q = query.lower()
        result = [
            a for a in result
            if q in a["title"].lower()
            or q in a.get("category", "").lower()
            or q in a.get("subcategory", "").lower()
            or q in a.get("neighborhood", "").lower()
            or q in a.get("description", "").lower()
            or any(q in t.lower() for t in a.get("tags", []))
        ]
    return result


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

    card_html = "".join([
        f'<div class="ac-card{saved_class}">',
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


def _render_details_modal(activity):
    details = activity.get("details") or {}

    def _content():
        # one-line summary: category · neighborhood · duration · price
        price = activity.get("price", "")
        price_usd = activity.get("price_usd", "")
        price_display = f"{price} {price_usd}".strip() if price else ""
        meta_parts = [
            activity.get("category", ""),
            activity.get("neighborhood", ""),
            activity.get("duration", ""),
        ]
        if price_display:
            meta_parts.append(price_display)
        st.caption(" · ".join(p for p in meta_parts if p))

        # description as the one-line summary
        desc = activity.get("description", "")
        if desc:
            st.markdown(desc)

        # Good for (strengths, capped at 3)
        good_for = (details.get("strengths") or [])[:3]
        if good_for:
            items_html = "".join(f"<li>{_html.escape(s)}</li>" for s in good_for)
            st.markdown(
                f'<p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.55);'
                f'text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">Good for</p>'
                f'<ul style="margin:0 0 2px;padding-left:1.2rem;color:rgba(255,255,255,.72);'
                f'font-size:13px;line-height:1.5">{items_html}</ul>',
                unsafe_allow_html=True,
            )

        # Know before you go: best_time + first tradeoff, capped at 2
        know = []
        best_time = details.get("best_time")
        if best_time:
            know.append(best_time)
        tradeoffs = details.get("tradeoffs") or []
        if tradeoffs:
            know.append(tradeoffs[0])
        know = know[:2]
        if know:
            items_html = "".join(f"<li>{_html.escape(k)}</li>" for k in know)
            st.markdown(
                f'<p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.55);'
                f'text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">Know before you go</p>'
                f'<ul style="margin:0 0 2px;padding-left:1.2rem;color:rgba(255,255,255,.72);'
                f'font-size:13px;line-height:1.5">{items_html}</ul>',
                unsafe_allow_html=True,
            )

        # Pair with (nearby, capped at 2)
        nearby = (details.get("nearby") or [])[:2]
        if nearby:
            items_html = "".join(f"<li>{_html.escape(n)}</li>" for n in nearby)
            st.markdown(
                f'<p style="font-size:12px;font-weight:700;color:rgba(255,255,255,.55);'
                f'text-transform:uppercase;letter-spacing:.06em;margin:10px 0 4px">Pair with</p>'
                f'<ul style="margin:0 0 2px;padding-left:1.2rem;color:rgba(255,255,255,.72);'
                f'font-size:13px;line-height:1.5">{items_html}</ul>',
                unsafe_allow_html=True,
            )

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
    visible = _filter_activities(activities, search_query, active_category)
    activities_by_id = {a["id"]: a for a in activities}

    count_label = f"{len(visible)} activit{'y' if len(visible) == 1 else 'ies'}"
    if search_query:
        count_label += f' matching "{search_query}"'
    elif active_category and active_category != "All":
        count_label += f" in {active_category}"
    st.markdown(f'<div class="ac-result-count">{_html.escape(count_label)}</div>', unsafe_allow_html=True)

    if not visible:
        st.info("No activities match that filter. Try a different search or category.")

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
