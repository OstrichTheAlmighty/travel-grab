import html as _html
import streamlit as st

from analytics import track_event, track_once


CATEGORIES = ["All", "Food", "Nightlife", "Culture", "Adventure", "Nature", "Luxury", "Hidden gems", "Free"]

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

ACTIVITIES = [
    {
        "id": "teamlab_planets",
        "title": "TeamLab Planets",
        "category": "Culture",
        "subcategory": "Immersive art",
        "neighborhood": "Toyosu",
        "description": "Walk through rooms of infinite light and digital art that reacts to your movement. Wading pools, mirror gardens.",
        "duration": "2 – 2.5 hrs",
        "price": "¥3,200",
        "price_usd": "~$22",
        "tags": ["Immersive art", "Premium", "Photography"],
        "badge": "booking",
        "details": {
            "strengths": [
                "Most visually striking experience in Tokyo.",
                "Water room and crystalline universe installations are uniquely photogenic.",
                "Ticket includes access to the full permanent collection.",
            ],
            "tradeoffs": [
                "Sells out weeks in advance — book before the trip.",
                "Removing shoes and wading through water is required.",
            ],
            "best_time": "First entry slot at 9am. Far fewer people than midday.",
            "booking_notes": "Book at teamlab.art. Tickets non-refundable. Allow 30 min travel from central Tokyo.",
            "nearby": ["Toyosu Market (15 min walk)", "teamLab Borderless in Azabudai Hills"],
        },
    },
    {
        "id": "tsukiji_market",
        "title": "Tsukiji Outer Market",
        "category": "Food",
        "subcategory": "Market",
        "neighborhood": "Tsukiji",
        "description": "Tuna breakfast, fresh uni on rice, tamagoyaki sticks. Arrive before 7am for the best stalls.",
        "duration": "1.5 hrs",
        "price": "~¥3,000",
        "price_usd": "~$20",
        "tags": ["Seafood", "Early morning", "Street food"],
        "badge": "popular",
        "details": {
            "strengths": [
                "Where Tokyo chefs actually shop — not a tourist market.",
                "Outer market stays lively year-round regardless of the inner market.",
                "Dense concentration of exceptional seafood stalls.",
            ],
            "tradeoffs": [
                "Stalls start closing by 10am — early start required.",
                "Can be crowded even early in peak season.",
            ],
            "best_time": "Before 7am. The atmosphere shifts entirely from 8am onward.",
            "booking_notes": "No booking needed. Cash preferred at most stalls.",
            "nearby": ["Hamarikyu Gardens (10 min walk)", "Hongan-ji temple across the street"],
        },
    },
    {
        "id": "meiji_shrine",
        "title": "Meiji Shrine at sunrise",
        "category": "Nature",
        "subcategory": "Shrine",
        "neighborhood": "Harajuku",
        "description": "Ancient cedar forest path, completely empty before 7am. A different experience from the crowded midday visit.",
        "duration": "1 – 2 hrs",
        "price": "Free",
        "price_usd": "",
        "tags": ["Free entry", "Shrine", "Forest walk"],
        "badge": "gem",
        "details": {
            "strengths": [
                "Forested path feels remote despite being in central Tokyo.",
                "Morning light through the cedar canopy is exceptional.",
                "Adjacent Yoyogi Park extends the walk naturally.",
            ],
            "tradeoffs": [
                "Inner shrine opens at sunrise — check seasonal times.",
                "Some facilities closed before 9am.",
            ],
            "best_time": "Before 7am. Most visitors arrive from 10am onward.",
            "booking_notes": "No booking needed. Free entry to outer grounds.",
            "nearby": ["Yoyogi Park", "Omotesando for breakfast after 8am"],
        },
    },
    {
        "id": "golden_gai",
        "title": "Golden Gai bar crawl",
        "category": "Nightlife",
        "subcategory": "Bar crawl",
        "neighborhood": "Shinjuku",
        "description": "200+ tiny bars packed into six alleyways, each with its own theme and owner. Bar Benfiddich is the crown jewel.",
        "duration": "2 – 4 hrs",
        "price": "~¥3,500",
        "price_usd": "per drink",
        "tags": ["Bar crawl", "Cash only", "Locals"],
        "badge": "night",
        "details": {
            "strengths": [
                "Most authentic nightlife experience in Tokyo — zero tourist-trap energy.",
                "Each bar seats 5–8 people, creating a genuinely intimate atmosphere.",
                "Bar Benfiddich's bartender grows his own herbs on the roof.",
            ],
            "tradeoffs": [
                "Cash only at most bars.",
                "Entrance fees (¥500–1,000) at the best bars are normal — budget accordingly.",
            ],
            "best_time": "After 9pm. Bars are quietest on weeknights before midnight.",
            "booking_notes": "No reservations. If a bar has an entrance fee on the door, it's usually the best one on that alley.",
            "nearby": ["Kabukicho (5 min walk)", "Shinjuku Gyoen for the next morning"],
        },
    },
    {
        "id": "shibuya_sky",
        "title": "Shibuya Sky observation deck",
        "category": "Culture",
        "subcategory": "Views",
        "neighborhood": "Shibuya",
        "description": "360° rooftop above the Shibuya Scramble crossing. Golden hour is the best time to go.",
        "duration": "1 hr",
        "price": "¥2,000",
        "price_usd": "~$14",
        "tags": ["Views", "Rooftop", "Golden hour"],
        "badge": "popular",
        "details": {
            "strengths": [
                "Best aerial view of the Shibuya Scramble crossing.",
                "Rooftop section is fully open-air in good weather.",
                "Works well combined with the crossing at street level first.",
            ],
            "tradeoffs": [
                "Capacity limits can create waits at peak hours.",
                "Closed during heavy rain or strong winds.",
            ],
            "best_time": "Golden hour (sunset). Book the 4–5pm slot if visiting in autumn.",
            "booking_notes": "Buy tickets at shibuyasky.jp in advance to avoid queues.",
            "nearby": ["Shibuya Scramble Crossing (below)", "Shibuya Stream for dinner after"],
        },
    },
    {
        "id": "hakone_onsen",
        "title": "Hakone onsen day trip",
        "category": "Luxury",
        "subcategory": "Onsen",
        "neighborhood": "Hakone",
        "description": "Ryokan day-use hot springs with Mt. Fuji views. Takes a full day — worth planning a dedicated trip day.",
        "duration": "Full day",
        "price": "¥8,800",
        "price_usd": "~$60",
        "tags": ["Onsen", "Mt. Fuji", "Day trip"],
        "badge": "splurge",
        "details": {
            "strengths": [
                "Highest-rated single-day excursion from Tokyo.",
                "Mt. Fuji views from the baths on clear mornings.",
                "Ryokan day-use typically includes a traditional meal and bathrobe.",
            ],
            "tradeoffs": [
                "90 min from Shinjuku — needs a full day commitment.",
                "Mt. Fuji views depend on clear weather; October–January is best.",
            ],
            "best_time": "Weekdays. October–January for the clearest Fuji views.",
            "booking_notes": "Book the Hakone Free Pass from Odakyu. Reserve the ryokan day-use package in advance.",
            "nearby": ["Hakone Open Air Museum (same pass)", "Owakudani volcanic valley"],
        },
    },
    {
        "id": "arashiyama_bamboo",
        "title": "Arashiyama Bamboo Grove",
        "category": "Nature",
        "subcategory": "Bamboo forest",
        "neighborhood": "Arashiyama · Kyoto",
        "description": "Towering bamboo stalks filter morning light. The path to Okochi Sanso villa beyond the main grove gets truly quiet.",
        "duration": "2 – 3 hrs",
        "price": "Free",
        "price_usd": "",
        "tags": ["Free path", "Bamboo", "Kyoto day trip"],
        "badge": "gem",
        "details": {
            "strengths": [
                "Main path crowds disappear completely before 7:30am.",
                "Morning light through the canopy is exceptional.",
                "Okochi Sanso villa beyond the grove adds real seclusion.",
            ],
            "tradeoffs": [
                "Main path is heavily crowded by 9am.",
                "Requires an early train from Tokyo if doing as a day trip.",
            ],
            "best_time": "Before 7:30am. The bamboo creaks audibly in wind — only noticeable before the crowds.",
            "booking_notes": "No booking needed. Adjacent Tenryu-ji garden costs ¥500 and is worth adding.",
            "nearby": ["Tenryu-ji garden (next door)", "Togetsukyo Bridge", "Monkey Park Iwatayama"],
        },
    },
    {
        "id": "tsukiji_cooking_class",
        "title": "Tsukiji cooking class",
        "category": "Food",
        "subcategory": "Cooking class",
        "neighborhood": "Tsukiji",
        "description": "Shop at the outer market, then make sushi and ramen in a small-group class. About 3 hours total.",
        "duration": "3 hrs",
        "price": "¥9,500",
        "price_usd": "~$65",
        "tags": ["Hands-on", "Small group", "Sushi"],
        "badge": "booking",
        "details": {
            "strengths": [
                "Combines market browsing and hands-on cooking in one session.",
                "Small group format (max 8) feels personal and unhurried.",
                "Recipe cards included to recreate at home.",
            ],
            "tradeoffs": [
                "More expensive than browsing the market alone.",
                "Requires a morning commitment starting at 7am.",
            ],
            "best_time": "Morning class starting at 7am — pairs well with early market arrival.",
            "booking_notes": "Book via Airbnb Experiences or Cookly. 48-hour cancellation policy.",
            "nearby": ["Tsukiji Outer Market (start here)", "Hamarikyu Gardens after the class"],
        },
    },
    {
        "id": "senso_ji",
        "title": "Senso-ji Temple",
        "category": "Culture",
        "subcategory": "Temple",
        "neighborhood": "Asakusa",
        "description": "Tokyo's oldest temple. Nakamise shopping street leads up to the main hall. Lantern-lit at dusk.",
        "duration": "1 – 2 hrs",
        "price": "Free",
        "price_usd": "",
        "tags": ["Temple", "Free entry", "Historic"],
        "badge": "first_day",
        "details": {
            "strengths": [
                "Most iconic and photogenic temple in Tokyo.",
                "Nakamise shopping street is great for authentic souvenirs.",
                "Beautiful at both sunrise and dusk with the lanterns lit.",
            ],
            "tradeoffs": [
                "Very crowded at midday, especially on weekends.",
                "The inner temple area can feel rushed during peak hours.",
            ],
            "best_time": "Early morning or at dusk when the lanterns are lit. Midday is the worst time.",
            "booking_notes": "No booking needed. Fortune stickers (omikuji) are a popular ritual — ¥100.",
            "nearby": ["Kappabashi Kitchen Street (10 min walk)", "Sumida River cruise nearby"],
        },
    },
    {
        "id": "shinjuku_gyoen",
        "title": "Shinjuku Gyoen Garden",
        "category": "Nature",
        "subcategory": "Garden",
        "neighborhood": "Shinjuku",
        "description": "Three distinct garden styles — French formal, English landscape, Japanese traditional. Calm oasis in the middle of the city.",
        "duration": "1.5 – 2 hrs",
        "price": "¥500",
        "price_usd": "~$4",
        "tags": ["Garden", "Picnic", "Walking"],
        "badge": "near_hotel",
        "details": {
            "strengths": [
                "Rare quiet green space near Shinjuku Station.",
                "French, English, and Japanese garden sections within walking distance of each other.",
                "Cherry blossoms in April are exceptional.",
            ],
            "tradeoffs": [
                "Alcohol prohibited inside the garden.",
                "Some sections may be closed for maintenance.",
            ],
            "best_time": "Weekday mornings for the calmest experience. Spring for cherry blossoms.",
            "booking_notes": "No booking needed. Entry ¥500. Closes at 4:30pm (last entry 4pm).",
            "nearby": ["Golden Gai (15 min walk for evening)", "Omoide Yokocho 'Memory Lane'"],
        },
    },
    {
        "id": "akihabara",
        "title": "Akihabara electronics walk",
        "category": "Adventure",
        "subcategory": "Shopping",
        "neighborhood": "Akihabara",
        "description": "Seven-story electronics stores, retro game shops, and maid cafés. The most dense tech and anime shopping in the world.",
        "duration": "2 – 3 hrs",
        "price": "Varies",
        "price_usd": "",
        "tags": ["Electronics", "Anime", "Retro games"],
        "badge": "popular",
        "details": {
            "strengths": [
                "Unmatched density of electronics, components, and gadgets.",
                "Retro game shops have items unavailable anywhere else.",
                "Maid café experience is uniquely and specifically Tokyo.",
            ],
            "tradeoffs": [
                "Can feel overwhelming — hard to know where to start.",
                "Prices not always cheaper than buying online.",
            ],
            "best_time": "Afternoon. Most shops open around 10am–11am.",
            "booking_notes": "No booking needed. For maid cafés, walk-ins are usually accepted.",
            "nearby": ["Kanda Shrine (10 min walk)", "Ochanomizu for music instruments"],
        },
    },
    {
        "id": "yanaka_walk",
        "title": "Yanaka neighborhood walk",
        "category": "Culture",
        "subcategory": "Neighborhood",
        "neighborhood": "Yanaka",
        "description": "Old Tokyo that survived the war. Narrow lanes, local shops, wooden houses, and one of the city's best cemeteries.",
        "duration": "2 hrs",
        "price": "Free",
        "price_usd": "",
        "tags": ["Free", "Old Tokyo", "Slow travel"],
        "badge": "gem",
        "details": {
            "strengths": [
                "One of the few areas in Tokyo that feels unchanged from the 1950s.",
                "Yanaka Cemetery is atmospheric and quiet — not morbid.",
                "Great independent food shops, cafés, and craft stores.",
            ],
            "tradeoffs": [
                "Less structured than a formal sightseeing spot.",
                "Shops close early — better as a morning or early afternoon activity.",
            ],
            "best_time": "Weekend mornings when local market stalls along Yanaka Ginza are active.",
            "booking_notes": "No booking needed. Free to wander.",
            "nearby": ["Ueno Park (20 min walk)", "Nezu Shrine (10 min walk)"],
        },
    },
]


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
        if category == "Hidden gems":
            result = [a for a in result if a.get("badge") == "gem"]
        elif category == "Free":
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
        st.caption(
            f"{activity.get('category', '')} · {activity.get('neighborhood', '')} · {activity.get('duration', '')}"
        )
        price = activity.get("price", "")
        price_usd = activity.get("price_usd", "")
        if price:
            price_display = f"{price} {price_usd}".strip()
            st.caption(f"Price: {price_display}")

        strengths = details.get("strengths") or []
        if strengths:
            st.markdown("**Strengths**")
            for s in strengths:
                st.markdown(f"✓ {s}")

        tradeoffs = details.get("tradeoffs") or []
        if tradeoffs:
            st.markdown("**Tradeoffs**")
            for t in tradeoffs:
                st.markdown(f"• {t}")

        best_time = details.get("best_time")
        if best_time:
            st.markdown("**Best time to go**")
            st.markdown(best_time)

        booking = details.get("booking_notes")
        if booking:
            st.markdown("**Booking notes**")
            st.markdown(booking)

        nearby = details.get("nearby") or []
        if nearby:
            st.markdown("**Nearby pairings**")
            for item in nearby:
                st.markdown(f"• {item}")

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
            st.markdown(f"#### {_html.escape(activity['title'])}")
            _content()


def render():
    track_once("page_viewed", key="activities_page_viewed", properties={"page_name": "activities"})
    _inject_styles()

    st.markdown(
        '<div class="ac-kicker">Activities</div>'
        '<div class="ac-page-title">Things to do in Tokyo</div>'
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
    visible = _filter_activities(ACTIVITIES, search_query, active_category)
    activities_by_id = {a["id"]: a for a in ACTIVITIES}

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
