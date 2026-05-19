"""SerpAPI Google Shopping provider.

Shopping results are treated as canonical pricing. No webpage scraping or price
extraction is performed here.
"""

def _price_value(result):
    extracted = result.get("extracted_price")
    if extracted not in (None, ""):
        try:
            return float(extracted)
        except Exception:
            return None
    return None


def search(query, api_key, max_results=5):
    if not api_key or not query:
        return []
    import requests

    response = requests.get(
        "https://serpapi.com/search.json",
        params={
            "engine": "google_shopping",
            "q": query,
            "api_key": api_key,
            "num": max_results,
        },
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    cards = []
    for result in payload.get("shopping_results", [])[:max_results]:
        price = _price_value(result)
        link = result.get("product_link") or result.get("link")
        title = result.get("title")
        if price is None or not title or not link:
            continue
        cards.append(
            {
                "title": title,
                "price": price,
                "merchant": result.get("source") or result.get("merchant") or "",
                "source_title": result.get("source") or "Google Shopping",
                "source_url": link,
                "image": result.get("thumbnail") or "",
                "rating": result.get("rating"),
                "price_verified": True,
                "provider": "serpapi_google_shopping",
            }
        )
    return cards
