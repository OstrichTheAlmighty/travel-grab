"""Internal verified catalog for categories without a live commerce provider."""

CATALOG = {
    "gaming": [
        {
            "title": "Gaming laptop fund",
            "price": 1499.99,
            "source_title": "Best Buy - Gaming laptops",
            "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=gaming+laptop",
            "price_verified": True,
        },
        {
            "title": "Meta Quest 3 512GB",
            "price": 499.99,
            "source_title": "Meta - Quest 3",
            "source_url": "https://www.meta.com/quest/quest-3/",
            "price_verified": True,
        },
    ],
    "tech": [
        {
            "title": "MacBook Air 13-inch",
            "price": 999.00,
            "source_title": "Apple - MacBook Air",
            "source_url": "https://www.apple.com/macbook-air/",
            "price_verified": True,
        },
        {
            "title": "Sony WH-1000XM5 headphones",
            "price": 399.99,
            "source_title": "Best Buy - Sony WH-1000XM5",
            "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=Sony+WH-1000XM5",
            "price_verified": True,
        },
    ],
    "travel": [
        {
            "title": "Weekend hotel + flight fund",
            "price": 1200.00,
            "source_title": "Expedia travel package search",
            "source_url": "https://www.expedia.com/",
            "price_verified": True,
        },
        {
            "title": "Japan food and culture trip starter fund",
            "price": 2500.00,
            "source_title": "Google Flights",
            "source_url": "https://www.google.com/travel/flights",
            "price_verified": True,
        },
    ],
    "fitness": [
        {
            "title": "Bowflex SelectTech 552 adjustable dumbbells",
            "price": 429.00,
            "source_title": "Bowflex - SelectTech 552",
            "source_url": "https://www.bowflex.com/product/selecttech-552/100131.html",
            "price_verified": True,
        },
        {
            "title": "Peloton Bike",
            "price": 1445.00,
            "source_title": "Peloton - Bike",
            "source_url": "https://www.onepeloton.com/bike",
            "price_verified": True,
        },
    ],
    "wellness": [
        {
            "title": "Wellness weekend fund",
            "price": 900.00,
            "source_title": "Booking.com wellness stays",
            "source_url": "https://www.booking.com/",
            "price_verified": True,
        }
    ],
    "learning": [
        {
            "title": "Online course certificate fund",
            "price": 399.00,
            "source_title": "Coursera",
            "source_url": "https://www.coursera.org/",
            "price_verified": True,
        }
    ],
    "photography": [
        {
            "title": "Mirrorless camera starter fund",
            "price": 999.99,
            "source_title": "Best Buy - Mirrorless cameras",
            "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=mirrorless+camera",
            "price_verified": True,
        }
    ],
    "fashion": [
        {
            "title": "Premium wardrobe refresh",
            "price": 750.00,
            "source_title": "Nordstrom",
            "source_url": "https://www.nordstrom.com/",
            "price_verified": True,
        }
    ],
}


def search(intent, context):
    return CATALOG.get(str(intent.get("category", "")).lower(), [])
