import datetime
import math
import os
import re

import requests
import streamlit as st


st.set_page_config(page_title="Byable Goal Discovery V2", layout="wide")
st.write("ENTRYPOINT TEST: frontend/app_v2.py")

TODAY = datetime.date.today()
DEV_MODE = str(os.environ.get("DEV_MODE", "")).lower() in {"1", "true", "yes", "on"}

st.markdown(
    """
    <style>
    .block-container {
        padding-top: 2rem;
        max-width: 1180px;
    }
    [data-testid="stSidebar"] {
        background: #0e141b;
        border-right: 1px solid rgba(255,255,255,0.08);
    }
    .lantern-hero {
        padding: 1.2rem 0 0.75rem 0;
    }
    .lantern-hero h1 {
        font-size: 2.6rem;
        line-height: 1.05;
        margin: 0 0 0.35rem 0;
        letter-spacing: 0;
    }
    .lantern-hero p {
        color: rgba(255,255,255,0.68);
        margin: 0;
        font-size: 1rem;
    }
    .goal-card {
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.035);
        border-radius: 12px;
        padding: 1rem;
        min-height: 235px;
        transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }
    .goal-card:hover {
        transform: translateY(-2px);
        border-color: rgba(125, 211, 252, 0.35);
        background: rgba(255,255,255,0.055);
    }
    .goal-card h3 {
        margin: 0.2rem 0 0.3rem 0;
        font-size: 1.05rem;
    }
    .goal-pill {
        display: inline-flex;
        font-size: 0.72rem;
        color: #cbd5e1;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 999px;
        padding: 0.15rem 0.5rem;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .goal-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.55rem;
        margin: 0.8rem 0;
    }
    .goal-metric {
        background: rgba(15, 23, 42, 0.68);
        border-radius: 10px;
        padding: 0.55rem;
    }
    .goal-metric span {
        display: block;
        color: rgba(255,255,255,0.52);
        font-size: 0.72rem;
    }
    .goal-metric strong {
        font-size: 1rem;
    }
    .goal-actions {
        color: rgba(255,255,255,0.68);
        font-size: 0.82rem;
        margin: 0.5rem 0 0 0;
        padding-left: 1rem;
    }
    .goal-actions li {
        margin-bottom: 0.25rem;
    }
    .placeholder-panel {
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.035);
        border-radius: 12px;
        padding: 1rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def money(value):
    try:
        return f"${float(value):,.2f}"
    except Exception:
        return "$0.00"


def get_tavily_api_key():
    try:
        key = st.secrets["TAVILY_API_KEY"]
    except Exception:
        key = os.environ.get("TAVILY_API_KEY", "")
    return str(key or "").strip()


def parse_budget(value):
    numbers = []
    for raw, suffix in re.findall(r"\$?\s*(\d+(?:\.\d+)?)\s*([kK]?)", str(value or "").replace(",", "")):
        amount = float(raw)
        if suffix.lower() == "k":
            amount *= 1000
        numbers.append(amount)
    if not numbers:
        return 1000.0
    return max(numbers)


def parse_target_month(value):
    text = str(value or "").strip()
    for fmt in ("%B %Y", "%b %Y"):
        try:
            return datetime.datetime.strptime(text, fmt).date().replace(day=1)
        except Exception:
            pass
    for fmt in ("%B", "%b"):
        try:
            month = datetime.datetime.strptime(text.split()[0], fmt).month
            year = TODAY.year if month >= TODAY.month else TODAY.year + 1
            return datetime.date(year, month, 1)
        except Exception:
            pass
    return TODAY + datetime.timedelta(days=120)


def save_monthly(cost, target_month):
    target = parse_target_month(target_month)
    months = max(1.0, (target - TODAY).days / 30.4375)
    return float(cost) / months


GOAL_CATALOG = [
    {"title": "MacBook Air upgrade", "category": "tech", "estimated_cost": 999, "keywords": ["tech", "laptop", "apple", "computer"], "source_title": "Apple MacBook Air", "source_url": "https://www.apple.com/macbook-air/", "ways_to_afford_it": ["Cut subscriptions temporarily.", "Use a monthly tech fund.", "Buy after comparing education or refurbished pricing."]},
    {"title": "Sony noise-canceling headphones", "category": "tech", "estimated_cost": 399, "keywords": ["tech", "music", "headphones", "audio"], "source_title": "Best Buy headphones", "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=sony+wh-1000xm5", "ways_to_afford_it": ["Redirect entertainment spending.", "Wait for seasonal sale pricing.", "Use cash-back rewards if available."]},
    {"title": "iPad Air creative setup", "category": "tech", "estimated_cost": 750, "keywords": ["tech", "ipad", "design", "drawing"], "source_title": "Apple iPad Air", "source_url": "https://www.apple.com/ipad-air/", "ways_to_afford_it": ["Pause shopping for one month.", "Buy accessories later.", "Set a dedicated weekly transfer."]},
    {"title": "Smart home starter kit", "category": "tech", "estimated_cost": 350, "keywords": ["tech", "home", "gadgets"], "source_title": "Best Buy smart home", "source_url": "https://www.bestbuy.com/site/smart-home/pcmcat254000050002.c", "ways_to_afford_it": ["Start with essentials only.", "Use home goods budget.", "Skip duplicate devices."]},
    {"title": "Gaming laptop", "category": "gaming", "estimated_cost": 1500, "keywords": ["gaming", "laptop", "pc"], "source_title": "Best Buy gaming laptops", "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=gaming+laptop", "ways_to_afford_it": ["Cut dining and shopping first.", "Compare open-box models.", "Delay accessories until after purchase."]},
    {"title": "PlayStation 5 bundle", "category": "gaming", "estimated_cost": 575, "keywords": ["gaming", "playstation", "console"], "source_title": "PlayStation 5", "source_url": "https://www.playstation.com/en-us/ps5/", "ways_to_afford_it": ["Cap game purchases.", "Use entertainment budget.", "Buy one game at launch, not three."]},
    {"title": "Meta Quest 3 setup", "category": "gaming", "estimated_cost": 600, "keywords": ["gaming", "vr", "meta", "quest"], "source_title": "Meta Quest 3", "source_url": "https://www.meta.com/quest/quest-3/", "ways_to_afford_it": ["Trim entertainment spending.", "Start with base headset.", "Add accessories later."]},
    {"title": "Steam Deck OLED", "category": "gaming", "estimated_cost": 650, "keywords": ["gaming", "steam", "handheld"], "source_title": "Steam Deck", "source_url": "https://store.steampowered.com/steamdeck", "ways_to_afford_it": ["Pause new game purchases.", "Sell old gear.", "Use a weekly gaming fund."]},
    {"title": "Home gym dumbbell set", "category": "fitness", "estimated_cost": 430, "keywords": ["fitness", "home gym", "weights"], "source_title": "Bowflex SelectTech", "source_url": "https://www.bowflex.com/product/selecttech-552/100131.html", "ways_to_afford_it": ["Trade one unused subscription.", "Use wellness budget.", "Buy bench later."]},
    {"title": "Peloton Bike fund", "category": "fitness", "estimated_cost": 1445, "keywords": ["fitness", "bike", "cycling"], "source_title": "Peloton Bike", "source_url": "https://www.onepeloton.com/bike", "ways_to_afford_it": ["Reduce restaurants for 8 weeks.", "Compare used options.", "Budget for membership separately."]},
    {"title": "Personal training package", "category": "fitness", "estimated_cost": 900, "keywords": ["fitness", "coach", "training"], "source_title": "Thumbtack personal trainers", "source_url": "https://www.thumbtack.com/k/personal-trainers/near-me/", "ways_to_afford_it": ["Book a limited session pack.", "Cut shopping first.", "Use a monthly health allocation."]},
    {"title": "Half marathon travel weekend", "category": "fitness", "estimated_cost": 850, "keywords": ["fitness", "running", "race", "travel"], "source_title": "Running in the USA", "source_url": "https://runningintheusa.com/", "ways_to_afford_it": ["Register early.", "Share lodging.", "Set aside weekly race money."]},
    {"title": "Tokyo food + culture trip starter fund", "category": "travel", "estimated_cost": 2500, "keywords": ["travel", "japan", "asian culture", "food"], "source_title": "Google Flights", "source_url": "https://www.google.com/travel/flights", "ways_to_afford_it": ["Track flight deals.", "Choose shoulder season.", "Reduce flexible spending before booking."]},
    {"title": "Seoul gaming + street food trip", "category": "travel", "estimated_cost": 2200, "keywords": ["travel", "korea", "gaming", "asian culture"], "source_title": "Google Flights", "source_url": "https://www.google.com/travel/flights", "ways_to_afford_it": ["Keep trip short.", "Stay near transit.", "Cap shopping budget."]},
    {"title": "Domestic city weekend", "category": "travel", "estimated_cost": 900, "keywords": ["travel", "weekend", "city"], "source_title": "Booking.com", "source_url": "https://www.booking.com/", "ways_to_afford_it": ["Travel off-peak.", "Use public transit.", "Set a food budget."]},
    {"title": "National park long weekend", "category": "travel", "estimated_cost": 750, "keywords": ["travel", "nature", "wellness"], "source_title": "Recreation.gov", "source_url": "https://www.recreation.gov/", "ways_to_afford_it": ["Book early.", "Split lodging.", "Pack meals."]},
    {"title": "Concert weekend package", "category": "concerts", "estimated_cost": 650, "keywords": ["concert", "music", "event"], "source_title": "Ticketmaster", "source_url": "https://www.ticketmaster.com/", "ways_to_afford_it": ["Set a ticket ceiling.", "Budget for fees.", "Choose local lodging only if needed."]},
    {"title": "Music festival pass fund", "category": "concerts", "estimated_cost": 500, "keywords": ["concert", "festival", "music"], "source_title": "Live Nation", "source_url": "https://www.livenation.com/", "ways_to_afford_it": ["Buy early tiers.", "Share transport.", "Cap merch spending."]},
    {"title": "VIP venue night", "category": "concerts", "estimated_cost": 350, "keywords": ["concert", "vip", "music"], "source_title": "Ticketmaster", "source_url": "https://www.ticketmaster.com/", "ways_to_afford_it": ["Pick one premium night.", "Reduce entertainment spend.", "Avoid resale markups."]},
    {"title": "Comedy show + dinner night", "category": "concerts", "estimated_cost": 220, "keywords": ["concert", "show", "comedy", "event"], "source_title": "Eventbrite", "source_url": "https://www.eventbrite.com/", "ways_to_afford_it": ["Choose weekday tickets.", "Set dinner cap.", "Use entertainment budget."]},
    {"title": "Wellness retreat weekend", "category": "wellness", "estimated_cost": 900, "keywords": ["wellness", "retreat", "yoga"], "source_title": "Booking wellness stays", "source_url": "https://www.booking.com/", "ways_to_afford_it": ["Choose local first.", "Book deposit early.", "Pause nonessential shopping."]},
    {"title": "Spa day reset", "category": "wellness", "estimated_cost": 300, "keywords": ["wellness", "spa", "self care"], "source_title": "Spafinder", "source_url": "https://www.spafinder.com/", "ways_to_afford_it": ["Use one low-spend weekend.", "Skip add-ons.", "Compare weekday pricing."]},
    {"title": "Meditation course", "category": "wellness", "estimated_cost": 200, "keywords": ["wellness", "meditation", "learning"], "source_title": "Mindfulness courses", "source_url": "https://www.coursera.org/search?query=mindfulness", "ways_to_afford_it": ["Cancel unused apps.", "Start with one course.", "Set a small weekly transfer."]},
    {"title": "Yoga studio package", "category": "wellness", "estimated_cost": 250, "keywords": ["wellness", "yoga", "fitness"], "source_title": "ClassPass", "source_url": "https://classpass.com/", "ways_to_afford_it": ["Try intro offers.", "Replace one subscription.", "Set a monthly class limit."]},
    {"title": "Knife skills cooking class", "category": "cooking", "estimated_cost": 150, "keywords": ["cooking", "food", "class"], "source_title": "Sur La Table classes", "source_url": "https://www.surlatable.com/cooking-classes/", "ways_to_afford_it": ["Use dining-out savings.", "Pick one class first.", "Practice at home before buying gear."]},
    {"title": "Home espresso setup", "category": "cooking", "estimated_cost": 650, "keywords": ["cooking", "coffee", "espresso"], "source_title": "Breville espresso machines", "source_url": "https://www.breville.com/us/en/products/espresso.html", "ways_to_afford_it": ["Redirect coffee shop spending.", "Buy grinder later.", "Compare refurbished units."]},
    {"title": "Sushi making workshop", "category": "cooking", "estimated_cost": 180, "keywords": ["cooking", "asian culture", "food"], "source_title": "Cozymeal sushi classes", "source_url": "https://www.cozymeal.com/cooking-classes/sushi-making", "ways_to_afford_it": ["Use restaurant savings.", "Bring a friend to split transport.", "Skip premium add-ons."]},
    {"title": "Outdoor pizza oven", "category": "cooking", "estimated_cost": 500, "keywords": ["cooking", "food", "home"], "source_title": "Ooni pizza ovens", "source_url": "https://ooni.com/", "ways_to_afford_it": ["Cut takeout for a month.", "Buy accessories gradually.", "Host at home instead of dining out."]},
    {"title": "Mirrorless camera starter kit", "category": "photography", "estimated_cost": 1000, "keywords": ["photography", "camera", "travel"], "source_title": "Best Buy cameras", "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=mirrorless+camera", "ways_to_afford_it": ["Buy body first.", "Rent lenses before purchasing.", "Sell old gear."]},
    {"title": "Portrait photography workshop", "category": "photography", "estimated_cost": 300, "keywords": ["photography", "learning", "class"], "source_title": "CreativeLive photography", "source_url": "https://www.creativelive.com/photography", "ways_to_afford_it": ["Start with one workshop.", "Delay gear upgrades.", "Use learning budget."]},
    {"title": "Travel photo weekend", "category": "photography", "estimated_cost": 800, "keywords": ["photography", "travel"], "source_title": "Airbnb experiences", "source_url": "https://www.airbnb.com/experiences", "ways_to_afford_it": ["Choose nearby city.", "Use transit.", "Set a fixed meal budget."]},
    {"title": "Lightroom editing setup", "category": "photography", "estimated_cost": 250, "keywords": ["photography", "editing", "tech"], "source_title": "Adobe Lightroom", "source_url": "https://www.adobe.com/products/photoshop-lightroom.html", "ways_to_afford_it": ["Use subscription budget.", "Avoid buying presets early.", "Start with mobile workflow."]},
    {"title": "Premium wardrobe refresh", "category": "fashion", "estimated_cost": 750, "keywords": ["fashion", "style", "clothes"], "source_title": "Nordstrom", "source_url": "https://www.nordstrom.com/", "ways_to_afford_it": ["Build around staples.", "Use a one-in-one-out rule.", "Shop off-season."]},
    {"title": "Sneaker grail fund", "category": "fashion", "estimated_cost": 400, "keywords": ["fashion", "sneakers", "streetwear"], "source_title": "Nike sneakers", "source_url": "https://www.nike.com/w/mens-shoes-nik1zy7ok", "ways_to_afford_it": ["Set a resale cap.", "Skip impulse accessories.", "Use shopping budget only."]},
    {"title": "Tailored suit fund", "category": "fashion", "estimated_cost": 900, "keywords": ["fashion", "career", "style"], "source_title": "SuitSupply", "source_url": "https://suitsupply.com/", "ways_to_afford_it": ["Book tailoring into the budget.", "Buy one versatile suit.", "Delay extra shirts."]},
    {"title": "Capsule wardrobe project", "category": "fashion", "estimated_cost": 600, "keywords": ["fashion", "minimal", "style"], "source_title": "Everlane", "source_url": "https://www.everlane.com/", "ways_to_afford_it": ["Prioritize basics.", "Sell unused clothing.", "Buy over two months."]},
    {"title": "Professional certificate course", "category": "learning", "estimated_cost": 500, "keywords": ["learning", "career", "course"], "source_title": "Coursera certificates", "source_url": "https://www.coursera.org/certificates", "ways_to_afford_it": ["Use career budget.", "Finish one course before another.", "Set weekly study time."]},
    {"title": "Language learning package", "category": "learning", "estimated_cost": 300, "keywords": ["learning", "language", "travel", "asian culture"], "source_title": "italki", "source_url": "https://www.italki.com/", "ways_to_afford_it": ["Book weekly lessons.", "Use travel fund.", "Pair with free practice."]},
    {"title": "Coding bootcamp starter fund", "category": "learning", "estimated_cost": 1200, "keywords": ["learning", "coding", "tech"], "source_title": "Udacity", "source_url": "https://www.udacity.com/", "ways_to_afford_it": ["Start with one module.", "Use tech budget.", "Reduce entertainment while studying."]},
    {"title": "Music production course", "category": "learning", "estimated_cost": 350, "keywords": ["learning", "music", "tech"], "source_title": "Ableton learning", "source_url": "https://www.ableton.com/en/live/learn-live/", "ways_to_afford_it": ["Use entertainment savings.", "Avoid plugin impulse buys.", "Buy course before gear."]},
]


def score_goal(goal, interest_terms, target_budget):
    text = " ".join([goal["title"], goal["category"], " ".join(goal["keywords"])]).lower()
    keyword_score = sum(1 for term in interest_terms if term and term in text)
    budget_distance = abs(float(goal["estimated_cost"]) - target_budget) / max(target_budget, 1.0)
    return (keyword_score * 10) - budget_distance


def select_goals(interests, budget):
    terms = [
        term.strip().lower()
        for term in re.split(r"[,/ ]+", str(interests or ""))
        if term.strip()
    ]
    ranked = sorted(GOAL_CATALOG, key=lambda goal: score_goal(goal, terms, budget), reverse=True)
    selected = []
    seen_categories = set()
    for goal in ranked:
        if goal["category"] not in seen_categories or len(selected) >= 3:
            selected.append(dict(goal))
            seen_categories.add(goal["category"])
        if len(selected) == 5:
            break
    for goal in ranked:
        if len(selected) == 5:
            break
        if goal not in selected:
            selected.append(dict(goal))
    return selected[:5]


def tavily_link_for_goal(goal, location):
    api_key = get_tavily_api_key()
    if not api_key:
        return None
    query = f"{goal['title']} {location} price"
    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": 1,
                "include_answer": False,
                "include_raw_content": False,
            },
            timeout=12,
        )
        response.raise_for_status()
        results = response.json().get("results", [])
    except Exception:
        return None
    if not results:
        return None
    result = results[0]
    return {
        "source_title": result.get("title") or goal["source_title"],
        "source_url": result.get("url") or goal["source_url"],
    }


def render_goal_card(goal, target_month, idx):
    monthly = save_monthly(goal["estimated_cost"], target_month)
    target_label = parse_target_month(target_month).strftime("%B %Y")
    st.markdown(
        f"""
        <div class="goal-card">
            <div class="goal-pill">{goal["category"].title()}</div>
            <h3>{goal["title"]}</h3>
            <div class="goal-metrics">
                <div class="goal-metric"><span>Estimated cost</span><strong>{money(goal["estimated_cost"])}</strong></div>
                <div class="goal-metric"><span>Save monthly</span><strong>{money(monthly)}</strong></div>
                <div class="goal-metric"><span>Target</span><strong>{target_label}</strong></div>
                <div class="goal-metric"><span>Source</span><strong>{goal["source_title"]}</strong></div>
            </div>
            <ul class="goal-actions">
                <li>{goal["ways_to_afford_it"][0]}</li>
                <li>{goal["ways_to_afford_it"][1]}</li>
            </ul>
        </div>
        """,
        unsafe_allow_html=True,
    )
    link_cols = st.columns([1, 1])
    with link_cols[0]:
        st.link_button("View source", goal["source_url"], width="stretch")
    with link_cols[1]:
        if st.button("Use this goal", key=f"app_v2_use_goal_{idx}"):
            st.session_state.goal_input_name = goal["title"]
            st.session_state.goal_input_cost = float(goal["estimated_cost"])
            st.session_state.goal_input_date = parse_target_month(target_month)
            st.success("Goal sent to the planner.")


def main():
    st.sidebar.title("Byable")
    st.sidebar.caption("See the path to what you want.")
    page = st.sidebar.radio(
        "Navigation",
        ["Goal Discovery", "Budget Planner", "Saved Plans"],
        label_visibility="collapsed",
    )
    if page != "Goal Discovery":
        st.markdown(
            f"""
            <div class="lantern-hero">
                <h1>{page}</h1>
                <p>This V2 shell keeps navigation in place while Goal Discovery is polished.</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(
            '<div class="placeholder-panel">This page is available in the main Byable app. The clean V2 entrypoint focuses on Goal Discovery.</div>',
            unsafe_allow_html=True,
        )
        return

    st.markdown(
        """
        <div class="lantern-hero">
            <h1>How can I afford this?</h1>
            <p>Pick something you want. Byable turns it into a simple monthly path.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    cols = st.columns(4)
    interests = cols[0].text_input("Interests", placeholder="gaming, Japan, fitness, fashion")
    location = cols[1].text_input("Location", placeholder="Los Angeles, online, anywhere")
    budget_text = cols[2].text_input("Budget", placeholder="$1,500")
    target_month = cols[3].text_input("Target month", placeholder="September")

    target_budget = parse_budget(budget_text)
    goals = select_goals(interests, target_budget)

    if st.button("Refresh live links"):
        refreshed = []
        for goal in goals:
            live_link = tavily_link_for_goal(goal, location)
            updated = dict(goal)
            if live_link:
                updated.update(live_link)
            refreshed.append(updated)
        st.session_state.app_v2_refreshed_goals = refreshed

    goals_to_render = st.session_state.get("app_v2_refreshed_goals", goals)
    if len(goals_to_render) != 5:
        goals_to_render = goals

    st.markdown("#### Suggested goals")
    rows = [goals_to_render[:3], goals_to_render[3:]]
    card_idx = 0
    for row in rows:
        card_cols = st.columns(len(row))
        for col, goal in zip(card_cols, row):
            with col:
                render_goal_card(goal, target_month, card_idx)
            card_idx += 1


if __name__ == "__main__":
    main()
