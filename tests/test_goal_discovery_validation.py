import datetime

from frontend.goal_discovery import validate_goal_idea


TODAY = datetime.date(2026, 5, 17)


def test_billie_eilish_2024_result_rejected():
    idea = {
        "title": "Billie Eilish concert weekend",
        "type": "event",
        "estimated_cost": 180,
        "confidence": "high",
        "source_urls": ["https://www.ticketmaster.com/billie-eilish"],
        "source_titles": ["Billie Eilish Tickets"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "concerts",
        "location": "Los Angeles",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://www.ticketmaster.com/billie-eilish",
                "title": "Billie Eilish Los Angeles",
                "snippet": "Billie Eilish at Kia Forum Los Angeles on November 15, 2024. Tickets from $99.",
                "detected_prices": ["$99"],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is False
    assert "past" in validated["validation_debug"]["accepted_or_rejected_reason"]


def test_one_dollar_concert_rejected():
    idea = {
        "title": "Arena concert night",
        "type": "event",
        "estimated_cost": 1,
        "confidence": "medium",
        "source_urls": ["https://www.ticketmaster.com/future-show"],
        "source_titles": ["Future Show Tickets"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "concerts",
        "location": "Los Angeles",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://www.ticketmaster.com/future-show",
                "title": "Future Show Los Angeles",
                "snippet": "Future Show at The Wiltern Los Angeles on September 20, 2026. Tickets from $1.",
                "detected_prices": ["$1"],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is False
    assert "below $50" in validated["validation_debug"]["accepted_or_rejected_reason"]


def test_source_with_no_price_downgraded_or_rejected():
    idea = {
        "title": "Pottery class series",
        "type": "class",
        "estimated_cost": 1,
        "confidence": "high",
        "source_urls": ["https://example.com/pottery"],
        "source_titles": ["Pottery class"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "learning",
        "location": "Los Angeles",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://example.com/pottery",
                "title": "Pottery class Los Angeles",
                "snippet": "A four-week pottery class series in Los Angeles beginning September 10, 2026.",
                "detected_prices": [],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is False
    assert validated["validation_debug"]["source_price_valid"] is False
    assert "real extracted price is missing" in validated["validation_debug"]["accepted_or_rejected_reason"]


def test_future_dated_concert_with_price_accepted():
    idea = {
        "title": "Future artist concert package",
        "type": "event",
        "estimated_cost": 140,
        "confidence": "high",
        "source_urls": ["https://www.ticketmaster.com/future-artist"],
        "source_titles": ["Future Artist Tickets"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "concerts",
        "location": "Los Angeles",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://www.ticketmaster.com/future-artist",
                "title": "Future Artist Tickets - Los Angeles",
                "snippet": "Future Artist at Hollywood Bowl Los Angeles on September 22, 2026. Tickets from $75.",
                "detected_prices": ["$75"],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is True
    assert validated["validation_debug"]["source_date_valid"] is True
    assert validated["validation_debug"]["source_price_valid"] is True
    assert validated["validation_debug"]["source_location_valid"] is True
    assert validated["confidence"] == "high"


def test_product_roundup_without_specific_product_rejected():
    idea = {
        "title": "20 gaming headset deals under $200",
        "type": "product",
        "estimated_cost": 99,
        "confidence": "medium",
        "source_urls": ["https://example.com/best-gaming-headsets"],
        "source_titles": ["20 gaming headset deals under $200"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "gaming headphones",
        "location": "online",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://example.com/best-gaming-headsets",
                "title": "20 gaming headset deals under $200",
                "snippet": "A roundup of popular gaming headsets with changing prices.",
                "detected_prices": ["$200"],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is False
    assert validated["validation_debug"]["product_specific"] is False


def test_specific_product_with_retailer_price_accepted_high_confidence():
    idea = {
        "title": "Sony WH-1000XM5 wireless headphones",
        "product_name": "Sony WH-1000XM5 wireless headphones",
        "type": "product",
        "estimated_cost": 329,
        "confidence": "high",
        "source_urls": ["https://www.bestbuy.com/site/sony-wh-1000xm5/123"],
        "source_titles": ["Sony WH-1000XM5 Wireless Noise-Canceling Headphones"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "tech headphones",
        "location": "online",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://www.bestbuy.com/site/sony-wh-1000xm5/123",
                "title": "Sony WH-1000XM5 Wireless Noise-Canceling Headphones",
                "snippet": "Sony WH-1000XM5 Wireless Noise-Canceling Headphones are available at Best Buy for $329.99.",
                "detected_prices": ["$329.99"],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is True
    assert validated["validation_debug"]["price_valid"] is True
    assert validated["validation_debug"]["product_specific"] is True
    assert validated["validation_debug"]["source_quality"] == "official_retailer"
    assert validated["confidence"] == "high"


def test_product_with_unknown_price_rejected():
    idea = {
        "title": "Meta Quest VR headset",
        "product_name": "Meta Quest VR headset",
        "type": "product",
        "estimated_cost": 1,
        "confidence": "medium",
        "source_urls": ["https://www.bestbuy.com/site/meta-quest/123"],
        "source_titles": ["Meta Quest VR headset"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "gaming VR",
        "location": "online",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://www.bestbuy.com/site/meta-quest/123",
                "title": "Meta Quest VR headset",
                "snippet": "Meta Quest VR headset available at Best Buy.",
                "detected_prices": [],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is False
    assert "real extracted price is missing" in validated["validation_debug"]["accepted_or_rejected_reason"]
    assert "invalid one-dollar fallback" in validated["validation_debug"]["accepted_or_rejected_reason"]


def test_top_five_is_not_extracted_as_price():
    idea = {
        "title": "Logitech gaming keyboard",
        "product_name": "Logitech gaming keyboard",
        "type": "product",
        "estimated_cost": 89,
        "confidence": "medium",
        "source_urls": ["https://www.bestbuy.com/site/logitech-keyboard/123"],
        "source_titles": ["Top 5 Logitech gaming keyboards"],
        "target_month": "September 2026",
    }
    discovery = {
        "interests": "gaming keyboard",
        "location": "online",
        "target_month": "September 2026",
        "search_results": [
            {
                "url": "https://www.bestbuy.com/site/logitech-keyboard/123",
                "title": "Top 5 Logitech gaming keyboards",
                "snippet": "Top 5 Logitech gaming keyboards for PC players.",
                "detected_prices": [],
            }
        ],
    }

    accepted, validated = validate_goal_idea(idea, discovery, today=TODAY)

    assert accepted is False
    assert validated["validation_debug"]["extracted_price"] is None
    assert "real extracted price is missing" in validated["validation_debug"]["accepted_or_rejected_reason"]
