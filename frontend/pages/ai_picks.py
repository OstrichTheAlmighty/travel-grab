import html as _html
import time

import streamlit as st

from analytics import track_event, track_once
from pages.activities import (
    CATEGORIES,
    _CAT_COLORS,
    _destination_city,
    _stable_activity_id,
    _selected_activity_ids,
    _persist_selected_activity,
    _remove_selected_activity,
    _add_activity_to_unscheduled_itinerary,
    _activity_in_itinerary,
    _photo_uri_cached,
    _deduplicate_activities,
    get_activities_for_destination,
)

_AP_THUMB_PX = 200    # thumbnail fetch size for list view
_AP_CARD_PX = 800     # hero photo fetch size for card view
_AP_PAGE_SIZE = 20    # list-view page size (unused in card flow, kept for list view)

_CATEGORY_ICONS = {
    "Culture":     "🏛️",
    "Nature":      "🌿",
    "Adventure":   "🧗",
    "Food":        "🍜",
    "Nightlife":   "🎵",
    "Luxury":      "✨",
    "Hidden gems": "💎",
    "Free":        "🌟",
    "Shopping":    "🛍️",
}


# ── Scoring ───────────────────────────────────────────────────────────────────

def _match_score(activity, active_category):
    score = 50
    cat = activity.get("category") or ""
    if active_category and active_category != "All" and cat == active_category:
        score += 20
    rating = float(activity.get("rating") or 0)
    if rating >= 4.5:
        score += 15
    elif rating >= 4.0:
        score += 8
    review_count = int(activity.get("review_count") or 0)
    if review_count >= 1000:
        score += 10
    elif review_count >= 200:
        score += 5
    badge = str(activity.get("badge") or "").lower()
    tags_text = " ".join(str(t) for t in (activity.get("tags") or [])).lower()
    if badge in ("popular", "first_day") or "popular" in tags_text or "first visit" in tags_text:
        score += 10
    if badge == "gem" or "hidden gem" in tags_text:
        score += 10
    if badge == "free" or cat == "Free" or "free" in tags_text:
        score += 10
    return min(score, 98)


def _score_color(score):
    if score >= 85:
        return "#34d399"
    if score >= 70:
        return "#fdba74"
    return "#a5b4fc"


def _why_text(activity, active_category):
    """Generate a short contextual blurb for the card."""
    parts = []
    cat = activity.get("category") or ""
    neighborhood = (activity.get("neighborhood") or "").split(",")[0].strip()
    rating = float(activity.get("rating") or 0)
    review_count = int(activity.get("review_count") or 0)
    badge = str(activity.get("badge") or "").lower()
    tags_text = " ".join(str(t) for t in (activity.get("tags") or [])).lower()

    if rating >= 4.5 and review_count >= 500:
        parts.append(
            f"One of the highest-rated {cat.lower() or 'spots'} nearby"
            f" — {float(rating):.1f} stars from {review_count:,} reviews."
        )
    elif rating >= 4.0:
        parts.append(f"Well-rated at {float(rating):.1f} stars.")

    if badge == "first_day" or "first visit" in tags_text:
        parts.append("A great pick for your first day in the city.")
    elif badge == "gem" or "hidden gem" in tags_text:
        parts.append("A local favourite that most tourists overlook.")
    elif badge == "popular" or "popular" in tags_text:
        parts.append("Consistently popular and worth the visit.")
    elif badge == "free" or cat == "Free":
        parts.append("No entry fee — a high-value addition to any day.")

    if not parts:
        loc = f" in {neighborhood}" if neighborhood else ""
        parts.append(f"A notable {cat.lower() or 'experience'}{loc} for your trip.")

    return " ".join(parts[:2])


# ── Styles ────────────────────────────────────────────────────────────────────

def _inject_styles():
    st.markdown(
        """
        <style>
        /* ── shared ── */
        .ap-kicker {
            font-size:11px; font-weight:600; letter-spacing:.8px;
            text-transform:uppercase; color:rgba(255,255,255,.3); margin-bottom:6px;
        }
        .ap-title {
            font-size:26px; font-weight:800; letter-spacing:-.6px;
            color:#fff; margin-bottom:4px;
        }
        .ap-sub { font-size:13px; color:rgba(255,255,255,.35); margin-bottom:16px; }

        /* ── card flow ── */
        .apc-header {
            display:flex; justify-content:space-between; align-items:center;
            margin-bottom:10px;
        }
        .apc-counter {
            font-size:12px; font-weight:600; color:rgba(255,255,255,.3);
        }
        .apc-card {
            border-radius:18px; overflow:hidden;
            border:0.5px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.03);
            margin-bottom:8px;
        }
        .apc-hero {
            position:relative; height:230px; overflow:hidden;
            background:rgba(255,255,255,.04);
            display:flex; align-items:center; justify-content:center;
        }
        .apc-hero img { width:100%; height:100%; object-fit:cover; display:block; }
        .apc-hero-fallback { font-size:72px; }
        .apc-hero-overlay {
            position:absolute; top:0; left:0; right:0;
            padding:12px 14px;
            display:flex; justify-content:space-between; align-items:flex-start;
            background:linear-gradient(to bottom,rgba(0,0,0,.65) 0%,transparent 100%);
        }
        .apc-match-badge {
            display:flex; flex-direction:column; align-items:center;
            background:rgba(0,0,0,.45); backdrop-filter:blur(8px);
            border:0.5px solid rgba(255,255,255,.15);
            border-radius:10px; padding:6px 10px;
        }
        .apc-match-num { font-size:18px; font-weight:800; line-height:1; }
        .apc-match-lbl { font-size:9px; color:rgba(255,255,255,.45); margin-top:2px; }
        .apc-cat-badge {
            font-size:11px; font-weight:700; letter-spacing:.3px;
            padding:5px 11px; border-radius:20px;
            backdrop-filter:blur(8px);
        }
        .apc-body { padding:16px 16px 14px; }
        .apc-name {
            font-size:22px; font-weight:800; letter-spacing:-.4px;
            color:#fff; line-height:1.2; margin-bottom:8px;
        }
        .apc-loc {
            font-size:12px; color:rgba(255,255,255,.42);
            margin-bottom:10px; line-height:1.6;
        }
        .apc-tags { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:13px; }
        .apc-tag {
            font-size:11px; font-weight:600;
            padding:3px 9px; border-radius:9px;
        }
        .apc-why {
            padding:10px 12px;
            background:rgba(99,102,241,.1);
            border:0.5px solid rgba(99,102,241,.2);
            border-radius:10px;
        }
        .apc-why-label {
            font-size:10px; font-weight:700; letter-spacing:.4px;
            text-transform:uppercase; color:#818cf8; margin-bottom:5px;
            display:flex; align-items:center; gap:5px;
        }
        .apc-why-dot {
            width:5px; height:5px; border-radius:50%;
            background:#6366f1; display:inline-block;
            animation:apc-pulse 1.8s infinite;
        }
        @keyframes apc-pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .apc-why-text {
            font-size:12px; color:rgba(255,255,255,.5); line-height:1.6;
        }

        /* ── done state ── */
        .apc-done {
            text-align:center; padding:44px 24px;
            background:rgba(255,255,255,.02);
            border-radius:16px; border:0.5px solid rgba(255,255,255,.07);
        }
        .apc-done-icon { font-size:48px; margin-bottom:12px; }
        .apc-done-title {
            font-size:20px; font-weight:700; color:#fff; margin-bottom:6px;
        }
        .apc-done-sub { font-size:13px; color:rgba(255,255,255,.4); }

        /* ── up next preview ── */
        .apc-upnext-label {
            font-size:11px; font-weight:600; letter-spacing:.5px;
            text-transform:uppercase; color:rgba(255,255,255,.25);
            margin:18px 0 10px; display:flex; align-items:center; gap:8px;
        }
        .apc-upnext-label::after {
            content:''; flex:1; height:.5px; background:rgba(255,255,255,.07);
        }
        .apc-preview {
            display:flex; align-items:center; gap:10px;
            padding:9px 12px;
            border-radius:10px; border:0.5px solid rgba(255,255,255,.06);
            background:rgba(255,255,255,.02); margin-bottom:5px;
        }
        .apc-preview-icon {
            width:36px; height:36px; border-radius:7px;
            background:rgba(255,255,255,.05);
            display:flex; align-items:center; justify-content:center;
            font-size:18px; flex-shrink:0;
        }
        .apc-preview-info { flex:1; min-width:0; }
        .apc-preview-name {
            font-size:13px; font-weight:600; color:#e4e6f0;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .apc-preview-sub { font-size:11px; color:rgba(255,255,255,.32); margin-top:2px; }
        .apc-preview-score { font-size:13px; font-weight:700; flex-shrink:0; }

        /* ── old list view ── */
        .ap-row {
            display:flex; align-items:center; gap:12px;
            padding:11px 13px 10px;
            border-radius:12px;
            border:0.5px solid rgba(255,255,255,.07);
            background:rgba(255,255,255,.025);
            margin-bottom:2px;
        }
        .ap-row.ap-sel { border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.04); }
        .ap-thumb {
            width:52px; height:52px; border-radius:9px;
            flex-shrink:0; overflow:hidden;
            background:rgba(255,255,255,.06);
            display:flex; align-items:center; justify-content:center; font-size:22px;
        }
        .ap-thumb img { width:52px; height:52px; object-fit:cover; display:block; }
        .ap-info { flex:1; min-width:0; }
        .ap-name {
            font-size:14px; font-weight:700; color:#e4e6f0; line-height:1.2;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .ap-meta { font-size:11px; color:rgba(255,255,255,.38); margin-top:3px; line-height:1.5; }
        .ap-tags { display:flex; gap:4px; flex-wrap:wrap; margin-top:5px; }
        .ap-tag { font-size:10px; font-weight:600; padding:2px 7px; border-radius:8px; }
        .ap-score { text-align:center; flex-shrink:0; min-width:42px; }
        .ap-score-num { font-size:17px; font-weight:800; line-height:1; }
        .ap-score-lbl { font-size:9px; color:rgba(255,255,255,.28); display:block; margin-top:2px; }
        .ap-count { font-size:11px; color:rgba(255,255,255,.28); margin-bottom:10px; }
        </style>
        """,
        unsafe_allow_html=True,
    )


# ── Card HTML ────────────────────────────────────────────────────────────────

def _card_html(activity, score, active_category, is_saved, is_in_itinerary, photo_uri):
    cat = activity.get("category") or ""
    cat_color, cat_bg, _ = _CAT_COLORS.get(cat, ("#a5b4fc", "rgba(99,102,241,.12)", ""))
    name = activity.get("title") or activity.get("name") or "Activity"

    raw_loc = activity.get("neighborhood") or activity.get("address") or ""
    neighborhood = raw_loc.split(",")[0].strip() if "," in raw_loc else raw_loc

    rating = activity.get("rating")
    review_count = activity.get("review_count")
    loc_parts = []
    if neighborhood:
        loc_parts.append(f"📍 {_html.escape(neighborhood)}")
    if rating:
        star_str = f"⭐ {float(rating):.1f}"
        if review_count:
            star_str += f"  ·  {int(review_count):,} reviews"
        loc_parts.append(_html.escape(star_str))
    loc_html = "  &nbsp;·&nbsp;  ".join(loc_parts)

    tags = (activity.get("tags") or [])[:4]
    tags_html = "".join(
        f'<span class="apc-tag" style="background:{cat_bg};color:{cat_color}">'
        f'{_html.escape(str(t))}</span>'
        for t in tags
    )

    why = _why_text(activity, active_category)
    why_html = (
        f'<div class="apc-why">'
        f'<div class="apc-why-label"><span class="apc-why-dot"></span>Why this matches</div>'
        f'<div class="apc-why-text">{_html.escape(why)}</div>'
        f'</div>'
    )

    sc = _score_color(score)
    match_badge = (
        f'<div class="apc-match-badge">'
        f'<span class="apc-match-num" style="color:{sc}">{score}</span>'
        f'<span class="apc-match-lbl">match</span>'
        f'</div>'
    )
    cat_badge = (
        f'<span class="apc-cat-badge" style="background:{cat_bg};color:{cat_color}">'
        f'{_html.escape(cat)}</span>'
        if cat else ""
    )

    if photo_uri:
        hero_inner = f'<img src="{_html.escape(photo_uri)}" alt="">'
    else:
        icon = _CATEGORY_ICONS.get(cat, "📍")
        hero_inner = f'<span class="apc-hero-fallback">{icon}</span>'

    sel_indicator = ""
    if is_saved or is_in_itinerary:
        label = "In trip" if is_in_itinerary else "Saved"
        sel_indicator = (
            f'<span style="font-size:10px;font-weight:600;color:#34d399;'
            f'background:rgba(52,211,153,.12);border:0.5px solid rgba(52,211,153,.25);'
            f'padding:3px 8px;border-radius:8px;">{label}</span>'
        )

    return (
        f'<div class="apc-card">'
        f'<div class="apc-hero">'
        f'{hero_inner}'
        f'<div class="apc-hero-overlay">'
        f'{match_badge}'
        f'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">'
        f'{cat_badge}'
        f'{sel_indicator}'
        f'</div>'
        f'</div>'
        f'</div>'
        f'<div class="apc-body">'
        f'<div class="apc-name">{_html.escape(name)}</div>'
        f'<div class="apc-loc">{loc_html}</div>'
        f'<div class="apc-tags">{tags_html}</div>'
        f'{why_html}'
        f'</div>'
        f'</div>'
    )


# ── Up-next preview HTML ──────────────────────────────────────────────────────

def _preview_row_html(activity, score):
    cat = activity.get("category") or ""
    cat_color, _, _ = _CAT_COLORS.get(cat, ("#a5b4fc", "", ""))
    name = activity.get("title") or activity.get("name") or "Activity"
    raw_loc = activity.get("neighborhood") or activity.get("address") or ""
    neighborhood = raw_loc.split(",")[0].strip() if "," in raw_loc else raw_loc
    icon = _CATEGORY_ICONS.get(cat, "📍")
    sc = _score_color(score)
    sub_parts = [_html.escape(cat)] + ([_html.escape(neighborhood)] if neighborhood else [])
    return (
        f'<div class="apc-preview">'
        f'<div class="apc-preview-icon">{icon}</div>'
        f'<div class="apc-preview-info">'
        f'<div class="apc-preview-name">{_html.escape(name)}</div>'
        f'<div class="apc-preview-sub">{" · ".join(sub_parts)}</div>'
        f'</div>'
        f'<span class="apc-preview-score" style="color:{sc}">{score}</span>'
        f'</div>'
    )


# ── Old list-view renderer (preserved, not called from render()) ──────────────

def _row_html(activity, is_selected, score, photo_uri):
    cat = activity.get("category") or ""
    cat_color, cat_bg, _ = _CAT_COLORS.get(cat, ("#a5b4fc", "rgba(99,102,241,.12)", ""))
    name = activity.get("title") or activity.get("name") or "Activity"
    raw_neighborhood = activity.get("neighborhood") or activity.get("address") or ""
    neighborhood = raw_neighborhood.split(",")[0].strip() if "," in raw_neighborhood else raw_neighborhood
    neighborhood = neighborhood[:40]
    meta_parts = []
    if cat:
        meta_parts.append(f'<span style="color:{cat_color}">{_html.escape(cat)}</span>')
    if neighborhood:
        meta_parts.append(_html.escape(neighborhood))
    rating = activity.get("rating")
    review_count = activity.get("review_count")
    if rating:
        star_str = f"⭐ {float(rating):.1f}"
        if review_count:
            star_str += f" ({int(review_count):,})"
        meta_parts.append(_html.escape(star_str))
    tags = (activity.get("tags") or [])[:3]
    tags_html = "".join(
        f'<span class="ap-tag" style="background:{cat_bg};color:{cat_color}">{_html.escape(str(t))}</span>'
        for t in tags
    )
    if photo_uri:
        thumb = f'<div class="ap-thumb"><img src="{_html.escape(photo_uri)}" alt=""></div>'
    else:
        icon = _CATEGORY_ICONS.get(cat, "📍")
        thumb = f'<div class="ap-thumb">{icon}</div>'
    sc = _score_color(score)
    sel_class = " ap-sel" if is_selected else ""
    return (
        f'<div class="ap-row{sel_class}">'
        f'{thumb}'
        f'<div class="ap-info">'
        f'<div class="ap-name">{_html.escape(name)}</div>'
        f'<div class="ap-meta">{"  ·  ".join(meta_parts)}</div>'
        f'<div class="ap-tags">{tags_html}</div>'
        f'</div>'
        f'<div class="ap-score">'
        f'<span class="ap-score-num" style="color:{sc}">{score}</span>'
        f'<span class="ap-score-lbl">match</span>'
        f'</div>'
        f'</div>'
    )


def _render_list_view(scored, must_do_ids, photo_deadline):
    """Original full-list view. Preserved but not called from render()."""
    for activity, score in scored:
        activity_id = str(activity.get("id") or "")
        stable_id = _stable_activity_id(activity)
        is_saved = stable_id in _selected_activity_ids()
        is_in_itinerary = _activity_in_itinerary(activity)
        is_must_do = stable_id in must_do_ids
        is_selected = is_saved or is_in_itinerary
        photo_uri = ""
        photo_names = activity.get("photo_names") or []
        if photo_names:
            photo_uri = _photo_uri_cached(
                photo_names[0],
                max_width_px=_AP_THUMB_PX,
                fetch_if_missing=True,
                deadline=photo_deadline,
                place_id=activity.get("place_id") or activity_id,
            )
        st.markdown(_row_html(activity, is_selected, score, photo_uri), unsafe_allow_html=True)
        save_label = "★ Saved" if is_saved else "☆ Save"
        add_label = "✓ In trip" if is_in_itinerary else "+ Add to trip"
        must_label = "⭐ Must-do" if is_must_do else "✦ Must-do"
        btn_save, btn_add, btn_must = st.columns([1, 1.3, 1])
        with btn_save:
            if st.button(save_label, key=f"ap_save_{activity_id}", use_container_width=True):
                if is_saved:
                    _remove_selected_activity(activity)
                else:
                    _persist_selected_activity(activity)
                st.rerun()
        with btn_add:
            if st.button(add_label, key=f"ap_add_{activity_id}", disabled=is_in_itinerary, use_container_width=True):
                _persist_selected_activity(activity)
                _add_activity_to_unscheduled_itinerary(activity)
                st.rerun()
        with btn_must:
            if st.button(must_label, key=f"ap_must_{activity_id}", use_container_width=True):
                if is_must_do:
                    must_do_ids.discard(stable_id)
                else:
                    must_do_ids.add(stable_id)
                    _persist_selected_activity(activity)
                    _add_activity_to_unscheduled_itinerary(activity)
                st.session_state["ai_picks_must_do_ids"] = sorted(must_do_ids)
                st.rerun()
        st.markdown('<div style="margin-bottom:6px"></div>', unsafe_allow_html=True)


# ── Main render ───────────────────────────────────────────────────────────────

def render():
    track_once("page_viewed", key="ai_picks_page_viewed", properties={"page_name": "ai_picks"})
    _inject_styles()

    destination_city = _destination_city()
    st.markdown(
        '<div class="ap-kicker">AI Picks</div>'
        f'<div class="ap-title">Discovery for {_html.escape(destination_city)}</div>'
        '<div class="ap-sub">One card at a time. Skip, Save, Add, or mark Must-do.</div>',
        unsafe_allow_html=True,
    )

    # ── Filter chips ──────────────────────────────────────────────────────
    active_category = st.session_state.get("ai_picks_category", "All")
    if hasattr(st, "pills"):
        sel_cat = st.pills(
            "Filter",
            CATEGORIES,
            default=active_category if active_category in CATEGORIES else "All",
            label_visibility="collapsed",
            key="ai_picks_category_pills",
        )
        if sel_cat != active_category:
            st.session_state["ai_picks_category"] = sel_cat or "All"
            active_category = sel_cat or "All"
    else:
        sel_cat = st.radio(
            "Filter",
            CATEGORIES,
            index=CATEGORIES.index(active_category) if active_category in CATEGORIES else 0,
            horizontal=True,
            label_visibility="collapsed",
            key="ai_picks_category_radio",
        )
        if sel_cat != active_category:
            st.session_state["ai_picks_category"] = sel_cat
            active_category = sel_cat

    # ── Load + score ──────────────────────────────────────────────────────
    activities = get_activities_for_destination(destination_city)
    activities = _deduplicate_activities(activities)

    if active_category and active_category != "All":
        pool = [a for a in activities if a.get("category") == active_category]
    else:
        pool = list(activities)

    scored = sorted(
        [(a, _match_score(a, active_category)) for a in pool],
        key=lambda x: -x[1],
    )

    if not scored:
        st.info(
            f"No activities found for {active_category}. "
            "Try a different filter or check your destination."
        )
        return

    # ── Reset card index when filter or city changes ──────────────────────
    filter_key = f"{destination_city}|{active_category}"
    if st.session_state.get("_ap_filter_key") != filter_key:
        st.session_state["_ap_filter_key"] = filter_key
        st.session_state["_ap_card_index"] = 0

    card_index = int(st.session_state.get("_ap_card_index") or 0)
    must_do_ids = set(
        str(v) for v in (st.session_state.get("ai_picks_must_do_ids") or []) if v
    )

    # ── Done state ────────────────────────────────────────────────────────
    if card_index >= len(scored):
        st.markdown(
            '<div class="apc-done">'
            '<div class="apc-done-icon">🎉</div>'
            '<div class="apc-done-title">You\'ve seen all picks!</div>'
            '<div class="apc-done-sub">Switch filters to explore more, or restart to review again.</div>'
            '</div>',
            unsafe_allow_html=True,
        )
        if st.button("↺  Start over", key="ap_restart", use_container_width=True):
            st.session_state["_ap_card_index"] = 0
            st.rerun()
        return

    activity, score = scored[card_index]
    activity_id = str(activity.get("id") or "")
    stable_id = _stable_activity_id(activity)
    is_saved = stable_id in _selected_activity_ids()
    is_in_itinerary = _activity_in_itinerary(activity)

    remaining = len(scored) - card_index
    st.markdown(
        f'<div class="apc-header">'
        f'<span class="apc-counter">{remaining} remaining</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # ── Fetch hero photo ──────────────────────────────────────────────────
    photo_uri = ""
    photo_names = activity.get("photo_names") or []
    if photo_names:
        photo_uri = _photo_uri_cached(
            photo_names[0],
            max_width_px=_AP_CARD_PX,
            fetch_if_missing=True,
            deadline=time.perf_counter() + 4.0,
            place_id=activity.get("place_id") or activity_id,
        )

    # ── Hero card ─────────────────────────────────────────────────────────
    st.markdown(
        _card_html(activity, score, active_category, is_saved, is_in_itinerary, photo_uri),
        unsafe_allow_html=True,
    )

    # ── Action buttons ────────────────────────────────────────────────────
    is_must_do = stable_id in must_do_ids
    c_skip, c_save, c_add, c_must = st.columns(4)

    def _advance():
        st.session_state["_ap_card_index"] = card_index + 1

    with c_skip:
        if st.button("✕  Skip", key=f"apc_skip_{card_index}", use_container_width=True):
            track_event("ai_pick_skipped", {"activity": activity.get("title")})
            _advance()
            st.rerun()

    with c_save:
        save_label = "★ Saved" if is_saved else "☆ Save"
        if st.button(save_label, key=f"apc_save_{card_index}", use_container_width=True):
            if is_saved:
                _remove_selected_activity(activity)
                track_event("ai_pick_unsaved", {"activity": activity.get("title")})
            else:
                _persist_selected_activity(activity)
                track_event("ai_pick_saved", {"activity": activity.get("title")})
            _advance()
            st.rerun()

    with c_add:
        add_label = "✓ In trip" if is_in_itinerary else "+ Add to trip"
        if st.button(add_label, key=f"apc_add_{card_index}", use_container_width=True):
            _persist_selected_activity(activity)
            _add_activity_to_unscheduled_itinerary(activity)
            track_event("ai_pick_added_to_trip", {"activity": activity.get("title")})
            _advance()
            st.rerun()

    with c_must:
        must_label = "⭐ Must-do" if is_must_do else "✦ Must-do"
        if st.button(must_label, key=f"apc_must_{card_index}", use_container_width=True):
            if is_must_do:
                must_do_ids.discard(stable_id)
                track_event("ai_pick_must_do_removed", {"activity": activity.get("title")})
            else:
                must_do_ids.add(stable_id)
                _persist_selected_activity(activity)
                _add_activity_to_unscheduled_itinerary(activity)
                track_event("ai_pick_must_do", {"activity": activity.get("title")})
            st.session_state["ai_picks_must_do_ids"] = sorted(must_do_ids)
            _advance()
            st.rerun()

    # ── Up next preview ───────────────────────────────────────────────────
    upcoming = scored[card_index + 1 : card_index + 6]
    if upcoming:
        st.markdown(
            '<div class="apc-upnext-label">Up next</div>',
            unsafe_allow_html=True,
        )
        preview_html = "".join(
            _preview_row_html(a, s) for a, s in upcoming
        )
        st.markdown(preview_html, unsafe_allow_html=True)
