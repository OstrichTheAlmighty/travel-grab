"""Stable product provider for purchasable electronics-style goals."""

ITEMS = [
    {
        "title": "ASUS ROG Zephyrus G14 gaming laptop",
        "price": 1499.99,
        "source_title": "Best Buy - ASUS ROG Zephyrus G14",
        "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=ASUS+ROG+Zephyrus+G14",
        "price_verified": True,
    },
    {
        "title": "Gaming PC build fund",
        "price": 1299.99,
        "source_title": "Best Buy - Gaming desktops",
        "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=gaming+desktop",
        "price_verified": True,
    },
    {
        "title": "OLED gaming monitor",
        "price": 899.99,
        "source_title": "Best Buy - OLED gaming monitors",
        "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=oled+gaming+monitor",
        "price_verified": True,
    },
    {
        "title": "Sony WH-1000XM5 headphones",
        "price": 399.99,
        "source_title": "Best Buy - Sony WH-1000XM5",
        "source_url": "https://www.bestbuy.com/site/searchpage.jsp?st=Sony+WH-1000XM5",
        "price_verified": True,
    },
]


def search(intent, context):
    text = f"{intent.get('title', '')} {intent.get('category', '')} {context.get('interests', '')}".lower()
    if any(term in text for term in ("gaming", "game", "pc", "monitor", "laptop")):
        return ITEMS[:3]
    if any(term in text for term in ("tech", "headphones", "audio", "gadget")):
        return [ITEMS[0], ITEMS[3]]
    return ITEMS[:2]

