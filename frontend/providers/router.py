"""Routes AI goal intent to shopping/catalog providers."""

from . import catalog, serpapi, ticketmaster


PRODUCT_CATEGORIES = {"gaming", "tech", "photography", "fashion", "fitness"}


def _queries_for_intent(intent, context):
    queries = intent.get("product_search_queries") or []
    if isinstance(queries, str):
        queries = [queries]
    queries = [str(query).strip() for query in queries if str(query).strip()]
    if queries:
        return queries[:4]
    title = str(intent.get("title") or context.get("interests") or intent.get("category") or "product").strip()
    budget = str(context.get("preferred_budget_range") or "").strip()
    return [f"{title} {budget}".strip()]


def _shopping_results(intent, context):
    if not context.get("use_live_prices", False):
        return []
    api_key = context.get("serpapi_api_key", "")
    results = []
    for query in _queries_for_intent(intent, context):
        try:
            results.extend(serpapi.search(query, api_key))
        except Exception:
            continue
        if len(results) >= 6:
            break
    return results


def route_intent(intent, context):
    category = str(intent.get("category", "")).lower()
    if category in PRODUCT_CATEGORIES:
        shopping_results = _shopping_results(intent, context)
        if shopping_results:
            return shopping_results
    if category in PRODUCT_CATEGORIES:
        catalog_results = catalog.search(intent, context)
        if catalog_results:
            return catalog_results
    if category == "concerts":
        return ticketmaster.search(intent, context)
    return catalog.search(intent, context)


def route_intents(intents, context):
    results = []
    seen = set()
    for intent in intents:
        for item in route_intent(intent, context):
            key = (item.get("title"), item.get("source_url"))
            if key in seen:
                continue
            seen.add(key)
            enriched = dict(item)
            enriched["intent"] = intent
            results.append(enriched)
    return results
