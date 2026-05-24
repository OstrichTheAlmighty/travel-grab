import datetime
import re
from urllib.parse import urlparse


MONTH_PATTERN = (
    r"(January|February|March|April|May|June|July|August|September|October|November|December|"
    r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
)


def parse_month_start(value, today=None):
    today = today or datetime.date.today()
    text = str(value or "").strip()
    if not text:
        return today.replace(day=1)
    for fmt in ("%B %Y", "%b %Y"):
        try:
            parsed = datetime.datetime.strptime(text, fmt).date()
            return parsed.replace(day=1)
        except Exception:
            pass
    for fmt in ("%B", "%b"):
        try:
            month_num = datetime.datetime.strptime(text.split()[0], fmt).month
            year = today.year if month_num >= today.month else today.year + 1
            return datetime.date(year, month_num, 1)
        except Exception:
            pass
    return today.replace(day=1)


def extract_future_date(text, today=None):
    today = today or datetime.date.today()
    value = str(text or "")
    patterns = [
        rf"{MONTH_PATTERN}\s+(\d{{1,2}}),?\s+(20\d{{2}})",
        rf"{MONTH_PATTERN}\s+(\d{{1,2}})",
        r"(20\d{2})-(\d{1,2})-(\d{1,2})",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, value, flags=re.IGNORECASE):
            groups = match.groups()
            try:
                if groups[0].isdigit():
                    parsed = datetime.date(int(groups[0]), int(groups[1]), int(groups[2]))
                else:
                    month_label = "Sep" if groups[0].lower() == "sept" else groups[0]
                    month = datetime.datetime.strptime(month_label[:3], "%b").month
                    day = int(groups[1])
                    year = int(groups[2]) if len(groups) > 2 and str(groups[2]).isdigit() else today.year
                    parsed = datetime.date(year, month, day)
                    if parsed < today and len(groups) <= 2:
                        parsed = parsed.replace(year=today.year + 1)
                if parsed >= today:
                    return parsed
                return parsed
            except Exception:
                continue
    return None


def extract_price_candidates(text):
    candidates = []
    value = str(text or "")
    for match in re.finditer(r"\$\s?(\d[\d,]*(?:\.\d{1,2})?)", value):
        try:
            amount = float(match.group(1).replace(",", ""))
        except Exception:
            continue
        start = max(0, match.start() - 48)
        end = min(len(value), match.end() + 72)
        snippet = value[start:end].strip()
        candidates.append({"value": amount, "snippet": snippet, "raw": match.group(0)})
    return candidates


def price_candidate_is_valid(candidate, idea_type=""):
    amount = float(candidate.get("value", 0.0) or 0.0)
    snippet = str(candidate.get("snippet", "")).lower()
    if amount <= 0:
        return False
    if amount == 1:
        return False
    if amount < 5 and str(idea_type).lower() in {"concert", "event", "class", "product"}:
        return False
    false_positive_patterns = (
        r"\btop\s+\$?\d+\b",
        r"#\s?\$?\d+\b",
        r"\b\$?\d+\s+best\b",
        r"\b\$?\d+\s+item\b",
        r"\btop\s+\d+\b",
        r"#\s?\d+\b",
        r"\b\d+\s+best\b",
        r"\b\d+\s+item\b",
    )
    return not any(re.search(pattern, snippet) for pattern in false_positive_patterns)


def extract_prices(text):
    return [candidate["value"] for candidate in extract_price_candidates(text) if price_candidate_is_valid(candidate)]


def is_explicitly_free(text):
    return bool(re.search(r"(\$0\b|\bfree\b|\bno cost\b|\bcomplimentary\b|\btrial\b)", str(text or ""), flags=re.IGNORECASE))


def is_concert_or_event(idea, discovery_data=None):
    text = " ".join(
        [
            str(idea.get("title", "")),
            str(idea.get("type", "")),
            str(idea.get("goal_type", "")),
            str((discovery_data or {}).get("interests", "")),
        ]
    ).lower()
    return any(term in text for term in ("concert", "ticket", "festival", "show", "event", "tour"))


def is_product_interest(discovery_data=None):
    text = " ".join(
        str((discovery_data or {}).get(key, ""))
        for key in ("interests", "preference", "travel_distance")
    ).lower()
    return any(
        term in text
        for term in (
            "tech",
            "gadget",
            "headphone",
            "laptop",
            "gaming",
            "fitness gear",
            "fashion",
            "camera",
            "running shoes",
            "shoes",
            "watch",
            "phone",
            "tablet",
            "vr",
        )
    )


def is_product_like(idea, discovery_data=None):
    text = " ".join(
        [
            str(idea.get("title", "")),
            str(idea.get("type", "")),
            str(idea.get("goal_type", "")),
            str((discovery_data or {}).get("preference", "")),
            str((discovery_data or {}).get("interests", "")),
        ]
    ).lower()
    return "product" in text or is_product_interest(discovery_data)


def classify_source(url, title="", snippet=""):
    host = urlparse(str(url or "")).netloc.lower().replace("www.", "")
    text = f"{host} {title} {snippet}".lower()
    retailer_domains = (
        "bestbuy.com",
        "amazon.com",
        "target.com",
        "walmart.com",
        "bhphotovideo.com",
        "bhphoto.com",
        "newegg.com",
        "playstation.com",
    )
    official_brand_domains = (
        "apple.com",
        "rei.com",
        "nike.com",
        "adidas.com",
        "sony.com",
        "samsung.com",
        "dell.com",
        "lenovo.com",
        "logitech.com",
        "meta.com",
        "razer.com",
        "onepeloton.com",
        "alomoves.com",
        "fitonapp.com",
        "store.steampowered.com",
    )
    event_domains = ("ticketmaster.com", "livenation.com", "eventbrite.com", "bandsintown.com")
    reputable_reviews = ("pcmag.com", "nytimes.com", "wirecutter", "theverge.com", "cnet.com", "rtings.com")
    if any(domain in host for domain in retailer_domains):
        return "marketplace" if "amazon.com" in host else "official_retailer"
    if any(domain in host for domain in official_brand_domains):
        return "official_retailer"
    if any(domain in text for domain in reputable_reviews):
        return "review_article"
    if any(domain in host for domain in event_domains):
        return "official_event"
    if source_looks_like_roundup(text):
        return "roundup_article"
    if re.search(r"\b(venue|theatre|theater|arena|bowl|auditorium|tickets)\b", text):
        return "official_event"
    if re.search(r"\b(blog|wordpress|substack|medium.com|calendar|directory)\b", text):
        return "unknown"
    return "unknown"


def product_source_quality(url, title="", snippet=""):
    source_type = classify_source(url, title, snippet)
    if source_type in {"official_retailer", "marketplace"}:
        return "official_retailer"
    if source_type == "review_article":
        return "reputable_review"
    if source_type == "roundup_article":
        return "roundup_article"
    return "weak"


def product_name_is_specific(name):
    text = str(name or "").strip().lower()
    if len(text) < 8:
        return False
    generic_phrases = (
        "best ",
        "top ",
        "deals under",
        "gift guide",
        "shopping guide",
        "roundup",
        "gadgets under",
        "headphones under",
        "laptops under",
        "gaming gear under",
    )
    if any(phrase in text for phrase in generic_phrases):
        return False
    tokens = [token for token in re.split(r"\W+", text) if token]
    return len(tokens) >= 2


def source_looks_like_roundup(text):
    lowered = str(text or "").lower()
    return any(
        phrase in lowered
        for phrase in (
            "best ",
            "top ",
            "deals under",
            "products under",
            "gift guide",
            "roundup",
            "shopping guide",
            "things under",
            "our picks",
        )
    )


def source_text_for_idea(idea, search_results=None):
    source_urls = idea.get("source_urls", []) or []
    if not isinstance(source_urls, list):
        source_urls = [str(source_urls)]
    by_url = {str(item.get("url", "")).strip(): item for item in (search_results or [])}
    chunks = [
        str(idea.get("title", "")),
        str(idea.get("source_price_or_price_note", "")),
        str(idea.get("package_or_deal_angle", "")),
        str(idea.get("what_to_check_next", "")),
        str(idea.get("source_title", "")),
        str(idea.get("source_url", "")),
        str(idea.get("source_snippet", "")),
        " ".join(str(snippet) for snippet in (idea.get("source_snippets", []) or [])),
    ]
    for idx, url in enumerate(source_urls):
        result = by_url.get(str(url).strip(), {})
        chunks.extend(
            [
                str(url),
                str(result.get("title", "")),
                str(result.get("snippet", "")),
                " ".join(result.get("detected_prices", []) or []),
            ]
        )
        titles = idea.get("source_titles", []) or []
        if idx < len(titles):
            chunks.append(str(titles[idx]))
    return " ".join(chunks)


def location_matches(text, location):
    location_text = str(location or "").strip().lower()
    if not location_text or location_text in {"anywhere", "online", "near me"}:
        return True
    source_text = str(text or "").lower()
    city = location_text.split(",")[0].strip()
    tokens = [token for token in re.split(r"\W+", city) if len(token) >= 3]
    return bool(city and city in source_text) or any(token in source_text for token in tokens)


def has_unavailable_or_stale_text(text):
    lowered = str(text or "").lower()
    return any(
        term in lowered
        for term in (
            "sold out",
            "unavailable",
            "event has passed",
            "past event",
            "no tickets available",
            "tickets are not currently available",
            "expired deal",
            "deal expired",
            "no longer available",
        )
    )


def validate_goal_idea(idea, discovery_data=None, today=None):
    """Validate AI goal cards before rendering. Validation wins over AI output."""
    today = today or datetime.date.today()
    discovery_data = discovery_data or {}
    search_results = discovery_data.get("search_results", []) or []
    selected_month = parse_month_start(discovery_data.get("target_month"), today)
    target_month = parse_month_start(idea.get("target_month") or idea.get("target_date_or_month"), today)
    source_text = source_text_for_idea(idea, search_results)
    source_date = extract_future_date(source_text, today)
    source_urls = idea.get("source_urls", []) or []
    if not isinstance(source_urls, list):
        source_urls = [str(source_urls)]
    idea_type = str(idea.get("type", idea.get("goal_type", ""))).lower()
    price_candidates = [
        candidate
        for candidate in extract_price_candidates(source_text)
        if price_candidate_is_valid(candidate, idea_type)
    ]
    explicit_free = is_explicitly_free(source_text)
    source_location_valid = location_matches(source_text, discovery_data.get("location"))
    source_date_valid = bool(source_date and source_date >= today)
    event_like = is_concert_or_event(idea, discovery_data)
    product_like = is_product_like(idea, discovery_data)
    subscription_like = "subscription" in idea_type or "membership" in source_text.lower()
    class_like = "class" in idea_type or "workshop" in source_text.lower() or "course" in source_text.lower()
    product_name = str(idea.get("product_name") or idea.get("title") or "").strip()
    product_specific = product_name_is_specific(product_name)
    source_type = "unknown"
    extraction_source = ""
    extraction_snippet = ""
    trusted_price_source = False
    for url in source_urls:
        result = next((item for item in search_results if str(item.get("url", "")).strip() == str(url).strip()), {})
        candidate_type = classify_source(url, result.get("title", ""), result.get("snippet", ""))
        if candidate_type in {"official_retailer", "official_event", "marketplace"}:
            source_type = candidate_type
            break
        if candidate_type in {"review_article", "roundup_article"} and source_type == "unknown":
            source_type = candidate_type
    if source_urls:
        extraction_source = source_urls[0]
    if product_like or subscription_like:
        trusted_price_source = source_type in {"official_retailer", "marketplace", "review_article"}
    elif event_like:
        trusted_price_source = source_type == "official_event"
    else:
        trusted_price_source = source_type in {"official_retailer", "official_event", "marketplace", "review_article"}
    price_valid = bool(price_candidates and trusted_price_source)
    if explicit_free and event_like and trusted_price_source:
        price_valid = True
    extracted_price = min((candidate["value"] for candidate in price_candidates), default=None)
    if price_candidates:
        extraction_snippet = min(price_candidates, key=lambda candidate: candidate["value"]).get("snippet", "")
    reasons = []

    try:
        raw_cost = idea.get("estimated_cost", None)
        cost = float(raw_cost) if raw_cost not in {None, ""} else None
    except Exception:
        raw_cost = idea.get("estimated_cost", None)
        cost = None

    if target_month < selected_month:
        reasons.append("target month is earlier than the selected target month")
    if source_date and source_date < today:
        reasons.append("source date is in the past")
    if has_unavailable_or_stale_text(source_text):
        reasons.append("source indicates unavailable or stale tickets")
    if not price_candidates and not explicit_free and (product_like or event_like or class_like or subscription_like):
        reasons.append("real extracted price is missing")
    elif price_candidates and not trusted_price_source and (product_like or event_like or class_like or subscription_like):
        reasons.append("price came from an untrusted source type")
    if source_type == "roundup_article" and not price_valid:
        reasons.append("roundup article has no verified price")

    if event_like:
        if not source_urls:
            reasons.append("event has no source URL")
        if not source_date_valid:
            reasons.append("event source does not confirm a future date")
        if not price_valid:
            reasons.append("event source does not confirm a ticket price")
        if not source_location_valid:
            reasons.append("event source does not match the selected location")
        if not explicit_free and (extracted_price is None or extracted_price < 50):
            reasons.append("concert/event estimate is below $50 without an explicit free source")
    if product_like or subscription_like:
        if not source_urls:
            reasons.append("product has no source URL")
        if not product_specific:
            reasons.append("product name is not specific")
        if source_type not in {"official_retailer", "marketplace", "review_article"}:
            reasons.append("product source is not a trusted retailer or review source")
        if source_type == "roundup_article" and not price_valid:
            reasons.append("roundup/listicle does not include a specific product and price")

    if explicit_free and price_valid:
        cost = 0.0
        idea["estimated_cost"] = 0.0
        idea["current_price"] = 0.0
        idea["source_price_or_price_note"] = "Source confirms this is free."
    elif price_valid and extracted_price is not None:
        cost = extracted_price
        idea["estimated_cost"] = cost
        idea["current_price"] = cost
    elif not price_valid:
        idea["estimated_cost"] = None
        idea["current_price"] = None
        idea["confidence"] = "low"
        idea["source_price_or_price_note"] = "Price unavailable — check source."
    if cost is not None and cost <= 1 and not explicit_free:
        reasons.append("estimated cost used an invalid one-dollar fallback")

    if str(idea.get("confidence", "")).lower() == "high":
        if product_like or subscription_like:
            if not (source_urls and product_specific and price_valid and source_type in {"official_retailer", "marketplace", "review_article"}):
                idea["confidence"] = "medium"
        elif event_like and not (source_urls and source_date_valid and price_valid and source_location_valid and source_type == "official_event"):
            idea["confidence"] = "medium"
    if price_valid and extracted_price is not None:
        idea["source_price_or_price_note"] = f"Source price found: ${extracted_price:.0f}+"
    if source_date:
        idea["source_event_date"] = source_date.isoformat()

    accepted = not reasons
    debug = {
        "source_date_valid": source_date_valid,
        "source_price_valid": price_valid,
        "source_location_valid": source_location_valid,
        "price_valid": price_valid,
        "product_specific": product_specific,
        "source_type": source_type,
        "source_quality": source_type,
        "price_verified": price_valid,
        "explicit_free": explicit_free,
        "raw_price": raw_cost,
        "extracted_price": extracted_price,
        "extraction_source": extraction_source,
        "extraction_snippet": extraction_snippet,
        "accepted_or_rejected_reason": "Accepted" if accepted else "; ".join(reasons),
    }
    if source_date:
        debug["source_date"] = source_date.isoformat()
    idea["validation_debug"] = debug
    return accepted, idea


def validate_goal_ideas(ideas, discovery_data=None, today=None):
    accepted = []
    rejected = []
    for idea in ideas:
        is_valid, validated = validate_goal_idea(dict(idea), discovery_data, today=today)
        if is_valid:
            accepted.append(validated)
        else:
            rejected.append(validated)
    return accepted, rejected
