import os
import base64
from pathlib import Path

import certifi
import requests
import streamlit as st


GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_PLACES_FIELD_MASK = ",".join(
    [
        "places.displayName",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.location",
        "places.priceLevel",
        "places.photos",
        "places.reviews.text",
    ]
)


def _google_places_api_key():
    try:
        secret_key = st.secrets.get("GOOGLE_PLACES_API_KEY", "")
    except Exception:
        secret_key = ""
    return str(secret_key or os.environ.get("GOOGLE_PLACES_API_KEY", "") or "").strip()


def google_places_key_configured():
    return bool(_google_places_api_key())


def _normalize_place(place):
    display_name = place.get("displayName") or {}
    location = place.get("location") or {}
    photos = place.get("photos") or []
    reviews = place.get("reviews") or []
    review_texts = []
    for review in reviews[:5]:
        text = review.get("text") or {}
        review_text = str(text.get("text") or "").strip()
        if review_text:
            review_texts.append(review_text)
    return {
        "name": str(display_name.get("text") or "").strip(),
        "address": str(place.get("formattedAddress") or "").strip(),
        "rating": place.get("rating"),
        "review_count": place.get("userRatingCount"),
        "lat": location.get("latitude"),
        "lng": location.get("longitude"),
        "price_level": place.get("priceLevel"),
        "photo_name": str((photos[0] or {}).get("name") or "").strip() if photos else "",
        "review_texts": review_texts,
        "source": "google_places",
    }


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def get_google_place_photo_data_uri(photo_name, max_width_px=900):
    api_key = _google_places_api_key()
    clean_photo_name = str(photo_name or "").strip()
    if not api_key or not clean_photo_name:
        return ""

    url = f"https://places.googleapis.com/v1/{clean_photo_name}/media"
    try:
        response = requests.get(
            url,
            params={"key": api_key, "maxWidthPx": int(max_width_px or 900)},
            timeout=8,
            verify=certifi.where(),
        )
        response.raise_for_status()
    except requests.RequestException:
        return ""

    content_type = response.headers.get("Content-Type", "image/jpeg")
    if not str(content_type).startswith("image/"):
        return ""
    encoded = base64.b64encode(response.content).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


@st.cache_data(ttl=60 * 60 * 6, show_spinner=False)
def search_hotels_with_google_places(destination_city, neighborhood=None, limit=10):
    api_key = _google_places_api_key()
    if not api_key:
        return []

    clean_destination = str(destination_city or "").strip()
    clean_neighborhood = str(neighborhood or "").strip()
    if not clean_destination:
        return []

    query = (
        f"hotels in {clean_neighborhood}, {clean_destination}"
        if clean_neighborhood
        else f"hotels in {clean_destination}"
    )
    print(f"GOOGLE PLACES QUERY: {query}")
    max_results = max(1, min(int(limit or 10), 20))
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
    }
    payload = {
        "textQuery": query,
        "languageCode": "en",
        "maxResultCount": max_results,
    }
    try:
        response = requests.post(
            GOOGLE_PLACES_TEXT_SEARCH_URL,
            headers=headers,
            json=payload,
            timeout=8,
            verify=certifi.where(),
        )
        response.raise_for_status()
        places = response.json().get("places") or []
    except (requests.RequestException, ValueError):
        print("GOOGLE PLACES RESULTS: 0")
        return []

    normalized = [_normalize_place(place) for place in places]
    results = [
        hotel
        for hotel in normalized
        if hotel.get("name") and hotel.get("address")
    ][:max_results]
    print(f"GOOGLE PLACES RESULTS: {len(results)}")
    return results


def _load_dotenv_for_cli():
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def test_ginza_tokyo_search():
    hotels = search_hotels_with_google_places("Tokyo", neighborhood="Ginza", limit=3)
    if hotels:
        print(f"GOOGLE PLACES HOTEL TEST: ok - {hotels[0]['name']}")
        return True
    print("GOOGLE PLACES HOTEL TEST: no hotels returned")
    return False


if __name__ == "__main__":
    _load_dotenv_for_cli()
    raise SystemExit(0 if test_ginza_tokyo_search() else 1)
