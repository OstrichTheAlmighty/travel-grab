import html
import streamlit as st

from analytics import track_event, track_once
from places_hotels import (
    get_google_place_photo_data_uri,
    google_places_key_configured,
    search_hotels_with_google_places,
)


HOTEL_PREFERENCES = [
    "Food",
    "Nightlife",
    "Luxury",
    "Shopping",
    "Walkability",
    "Culture",
    "Family Friendly",
    "Lowest Price",
    "Relaxation",
]
DEFAULT_HOTEL_PREFERENCES = ["Food", "Shopping", "Walkability"]
NEIGHBORHOOD_TO_RECOMMENDATION = {
    "Ginza / Yurakucho": "ginza",
    "Shinjuku / Shibuya": "nightlife",
    "Ueno / Asakusa": "price",
    "Ginza / Toranomon": "luxury",
    "Tokyo Bay / Shiba": "relaxation",
}


MOCK_RECOMMENDATIONS = {
    "ginza": {
        "match_preferences": {"Food", "Shopping", "Walkability"},
        "neighborhood": {
            "name": "Ginza / Yurakucho",
            "score": 91,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Excellent restaurant and shopping density.",
                "Walkable streets with easy access to Tokyo Station.",
                "Polished base for a first Tokyo trip.",
            ],
            "cons": [
                "Higher nightly rates than Ueno or Asakusa.",
                "Less nightlife energy than Shinjuku or Shibuya.",
            ],
        },
        "hotel": {
            "name": "Mitsui Garden Hotel Ginza Premier",
            "area": "Ginza · shopping and dining core",
            "type": "Recommended hotel",
            "price": 268,
            "score": 89,
            "why": "Byable recommends this stay because it puts food, shopping, and walkability first without jumping to ultra-luxury pricing.",
            "tags": ["Food access", "Shopping", "Walkable"],
            "scores": {
                "Location Match": (9.2, "Strong fit for food, shopping, and walkable Tokyo days."),
                "Transit Access": (8.6, "Close enough to Ginza and Shimbashi lines for cross-city routing."),
                "Value": (8.1, "Pricier than Ueno, but cheaper than the luxury Ginza/Toranomon set."),
                "Room Quality": (8.4, "Mock profile assumes polished upper-midscale rooms."),
                "Safety": (9.0, "Central, well-lit business and shopping district."),
            },
        },
    },
    "nightlife": {
        "match_preferences": {"Nightlife"},
        "neighborhood": {
            "name": "Shinjuku / Shibuya",
            "score": 89,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Best Tokyo base for nightlife, late dining, and energy.",
                "Major rail access for day trips and cross-city plans.",
                "More evening options within walking distance.",
            ],
            "cons": [
                "Busier streets and stations can feel intense.",
                "Rooms can be smaller or louder near entertainment zones.",
            ],
        },
        "hotel": {
            "name": "JR Kyushu Hotel Blossom Shinjuku",
            "area": "Shinjuku · station access",
            "type": "Recommended hotel",
            "price": 286,
            "score": 87,
            "why": "Byable recommends this stay for nightlife-focused trips because it keeps late-night food and rail access close.",
            "tags": ["Nightlife", "Station access", "Central"],
            "scores": {
                "Location Match": (9.1, "Strong fit for nightlife and late dining."),
                "Transit Access": (9.0, "Shinjuku Station gives broad local and regional access."),
                "Value": (7.6, "Convenience raises the estimated nightly rate."),
                "Room Quality": (8.1, "Mock profile assumes a reliable modern city hotel."),
                "Safety": (8.0, "Central and active, though busier late at night."),
            },
        },
    },
    "culture": {
        "match_preferences": {"Culture"},
        "neighborhood": {
            "name": "Asakusa / Ueno",
            "score": 88,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Close to temples, museums, parks, and older Tokyo streets.",
                "Better value than Ginza or Shinjuku.",
                "Good for slower cultural days.",
            ],
            "cons": [
                "Less polished nightlife and luxury hotel density.",
                "Some routes require transfers to west-side neighborhoods.",
            ],
        },
        "hotel": {
            "name": "Nohga Hotel Ueno Tokyo",
            "area": "Ueno · culture and transit",
            "type": "Recommended hotel",
            "price": 172,
            "score": 86,
            "why": "Byable recommends this stay because it prioritizes culture and value near Ueno museums and transit.",
            "tags": ["Culture", "Value", "Museums"],
            "scores": {
                "Location Match": (8.8, "Strong match for museums, parks, and older Tokyo sightseeing."),
                "Transit Access": (8.4, "Ueno gives useful JR and subway access."),
                "Value": (9.0, "Lower estimated nightly rate than Ginza, Shinjuku, or Toranomon."),
                "Room Quality": (8.0, "Mock profile assumes design-forward upper-midscale rooms."),
                "Safety": (8.5, "Established sightseeing district with predictable transport."),
            },
        },
    },
    "luxury": {
        "match_preferences": {"Luxury"},
        "neighborhood": {
            "name": "Ginza / Toranomon",
            "score": 90,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Best fit for premium hotels, design, and polished dining.",
                "Strong access to Ginza, Tokyo Station, and central business districts.",
                "Feels elevated without leaving central Tokyo.",
            ],
            "cons": [
                "Highest nightly rates in this recommended set.",
                "Less neighborhood texture than Ueno or Asakusa.",
            ],
        },
        "hotel": {
            "name": "The Tokyo Edition, Toranomon",
            "area": "Toranomon · skyline hotel",
            "type": "Recommended hotel",
            "price": 620,
            "score": 88,
            "why": "Byable recommends this stay for luxury-focused trips where the hotel experience matters as much as the neighborhood.",
            "tags": ["Luxury", "Design", "Skyline"],
            "scores": {
                "Location Match": (8.8, "Strong fit for premium dining, design hotels, and central access."),
                "Transit Access": (8.2, "Good central access, though not as frictionless as Shinjuku for rail-heavy days."),
                "Value": (6.8, "High estimated nightly rate lowers value despite strong quality."),
                "Room Quality": (9.2, "Mock profile assumes the strongest room and design quality in this set."),
                "Safety": (9.1, "Polished central district with predictable business-area access."),
            },
        },
    },
    "price": {
        "match_preferences": {"Lowest Price"},
        "neighborhood": {
            "name": "Ueno / Asakusa",
            "score": 87,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Lowest hotel pricing among the recommended areas.",
                "Good cultural access without premium-neighborhood rates.",
                "Useful rail connections from Ueno.",
            ],
            "cons": [
                "Less central for Shibuya, Harajuku, and west-side nightlife.",
                "Fewer luxury hotel choices.",
            ],
        },
        "hotel": {
            "name": "Nohga Hotel Ueno Tokyo",
            "area": "Ueno · culture and transit",
            "type": "Recommended hotel",
            "price": 172,
            "score": 87,
            "why": "Byable recommends this stay because it keeps the nightly estimate low while preserving transit and neighborhood character.",
            "tags": ["Lowest price", "Culture", "Transit"],
            "scores": {
                "Location Match": (8.3, "Good fit if value and culture matter more than premium shopping."),
                "Transit Access": (8.4, "Ueno gives useful JR and subway connections."),
                "Value": (9.3, "Lowest recommended estimated nightly rate in this recommendation set."),
                "Room Quality": (8.0, "Mock profile assumes solid design-hotel quality."),
                "Safety": (8.5, "Established visitor area with predictable transport access."),
            },
        },
    },
    "relaxation": {
        "match_preferences": {"Relaxation", "Family Friendly"},
        "neighborhood": {
            "name": "Tokyo Bay / Shiba",
            "score": 86,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Calmer base than Shinjuku or Shibuya.",
                "Better fit for slower mornings and family-friendly pacing.",
                "Useful access to Haneda-side routes.",
            ],
            "cons": [
                "Less dense for late-night food and nightlife.",
                "Some sightseeing days may require longer transit.",
            ],
        },
        "hotel": {
            "name": "Hotel The Celestine Tokyo Shiba",
            "area": "Shiba Park · near Daimon / Hamamatsucho",
            "type": "Recommended hotel",
            "price": 238,
            "score": 88,
            "why": "Byable recommends this stay because it gives a calmer Tokyo base while keeping useful transit access.",
            "tags": ["Relaxation", "Quiet base", "Transit access"],
            "scores": {
                "Location Match": (8.6, "Strong fit for a quieter Tokyo base with park access nearby."),
                "Transit Access": (8.9, "Daimon and Hamamatsucho help with Haneda access and Yamanote routing."),
                "Value": (8.4, "Moderate estimated rate for a calmer, polished hotel profile."),
                "Room Quality": (8.4, "Mock profile assumes comfortable upper-midscale rooms."),
                "Safety": (9.0, "Calm business district profile with predictable late-evening access."),
            },
        },
    },
}


ALTERNATIVE_HOTELS = [
    {
        "label": "Luxury alternative",
        "name": "The Tokyo Edition, Toranomon",
        "area": "Toranomon · skyline hotel",
        "price": 620,
        "score": 86,
        "why": "Best if the hotel itself should feel like a major part of the trip, but the nightly rate is much higher.",
        "tags": ["Luxury", "Design", "Skyline"],
    },
    {
        "label": "Best value alternative",
        "name": "Nohga Hotel Ueno Tokyo",
        "area": "Ueno · culture and transit",
        "price": 172,
        "score": 84,
        "why": "Lower estimated rate with strong neighborhood character and good museum access, but less polished than the recommended pick.",
        "tags": ["Value", "Local feel", "Museums"],
    },
    {
        "label": "Best location alternative",
        "name": "JR Kyushu Hotel Blossom Shinjuku",
        "area": "Shinjuku · station access",
        "price": 286,
        "score": 85,
        "why": "Very convenient for train-heavy sightseeing, but the area can feel busier and less calm at night.",
        "tags": ["Station access", "Central", "Efficient"],
    },
]


NEIGHBORHOOD_PROFILES = [
    {
        "name": "Ginza / Yurakucho",
        "best_for": "Food, shopping, polished first-trip convenience",
        "preference_tags": {"Food", "Shopping", "Walkability", "Luxury"},
        "base_score": 8.7,
        "convenience": 9.0,
        "value": 7.1,
        "tradeoff": "More expensive and calmer at night than Shinjuku or Shibuya.",
        "good_fit": [
            "Restaurants, department stores, and polished streets close together.",
            "Easy Tokyo Station, Ginza, and Shimbashi access for first-time days.",
        ],
    },
    {
        "name": "Shinjuku / Shibuya",
        "best_for": "Nightlife, energy, late dining, station access",
        "preference_tags": {"Nightlife", "Food", "Shopping", "Walkability"},
        "base_score": 8.5,
        "convenience": 9.3,
        "value": 7.4,
        "tradeoff": "Busier streets and stations can feel less relaxing.",
        "good_fit": [
            "Late dining, nightlife, and after-dark energy.",
            "Major station access for cross-city sightseeing.",
        ],
    },
    {
        "name": "Ueno / Asakusa",
        "best_for": "Culture, museums, temples, lower nightly rates",
        "preference_tags": {"Culture", "Lowest Price", "Family Friendly"},
        "base_score": 8.2,
        "convenience": 8.2,
        "value": 9.2,
        "tradeoff": "Less central for west-side nightlife, luxury, and shopping.",
        "good_fit": [
            "Museums, temples, parks, and older Tokyo atmosphere.",
            "Usually better hotel value than Shinjuku/Shibuya.",
        ],
    },
    {
        "name": "Ginza / Toranomon",
        "best_for": "Luxury, design hotels, premium dining",
        "preference_tags": {"Luxury", "Food", "Relaxation"},
        "base_score": 8.4,
        "convenience": 8.3,
        "value": 6.6,
        "tradeoff": "Highest rates and less neighborhood texture than Ueno or Asakusa.",
        "good_fit": [
            "Premium hotels, design-forward stays, and polished dining.",
            "A calmer luxury base than Shinjuku/Shibuya.",
        ],
    },
    {
        "name": "Tokyo Bay / Shiba",
        "best_for": "Relaxation, family pacing, quieter evenings",
        "preference_tags": {"Relaxation", "Family Friendly"},
        "base_score": 7.9,
        "convenience": 8.1,
        "value": 8.0,
        "tradeoff": "Less dense for nightlife, food hopping, and shopping.",
        "good_fit": [
            "Slower mornings, calmer evenings, and family-friendly pacing.",
            "Useful Haneda-side routing and quieter hotel areas.",
        ],
    },
]


_PARIS_NEIGHBORHOOD_PROFILES = [
    {
        "name": "Le Marais",
        "best_for": "Culture, food, art galleries, and vibrant Paris streets",
        "preference_tags": {"Culture", "Food", "Nightlife", "Shopping"},
        "base_score": 8.8,
        "convenience": 8.6,
        "value": 7.5,
        "tradeoff": "Pricier than the Latin Quarter; fewer luxury hotel options than the 8th.",
        "good_fit": [
            "Dense concentration of museums, galleries, cafés, and restaurants.",
            "Walking distance to Centre Pompidou, Place des Vosges, and the Seine.",
        ],
    },
    {
        "name": "Saint-Germain-des-Prés",
        "best_for": "Luxury stays, literary cafés, boutique shopping, and relaxed elegance",
        "preference_tags": {"Luxury", "Culture", "Food", "Relaxation"},
        "base_score": 8.7,
        "convenience": 8.4,
        "value": 6.8,
        "tradeoff": "Expensive, with quieter nightlife than Le Marais.",
        "good_fit": [
            "Classic Paris atmosphere with iconic cafés, galleries, and gardens.",
            "Close to Musée d'Orsay, Luxembourg Gardens, and the Seine.",
        ],
    },
    {
        "name": "Latin Quarter",
        "best_for": "Budget stays, culture, student atmosphere, and affordable dining",
        "preference_tags": {"Culture", "Lowest Price", "Food", "Family Friendly"},
        "base_score": 8.2,
        "convenience": 8.3,
        "value": 9.1,
        "tradeoff": "Livelier and noisier at night than some visitors prefer.",
        "good_fit": [
            "Best hotel value among central Paris neighborhoods.",
            "Close to Notre-Dame, Panthéon, and Luxembourg Gardens.",
        ],
    },
    {
        "name": "Opéra / Louvre",
        "best_for": "Sightseeing base, shopping, central Paris access, and the Louvre",
        "preference_tags": {"Shopping", "Walkability", "Food", "Culture"},
        "base_score": 8.5,
        "convenience": 9.2,
        "value": 7.4,
        "tradeoff": "More tourist-heavy than Marais or Saint-Germain.",
        "good_fit": [
            "Walking distance to the Louvre, Tuileries, Galeries Lafayette, and Palais Royal.",
            "Strong metro access for cross-city sightseeing.",
        ],
    },
    {
        "name": "Montmartre",
        "best_for": "Atmosphere, hidden cafés, village feel, and Sacré-Cœur views",
        "preference_tags": {"Culture", "Food", "Walkability"},
        "base_score": 8.0,
        "convenience": 7.8,
        "value": 8.5,
        "tradeoff": "Hillside streets can be tiring. Slightly farther from central sights.",
        "good_fit": [
            "The most atmospheric, village-like Paris neighborhood.",
            "Quiet side streets behind Sacré-Cœur feel genuinely local.",
        ],
    },
    {
        "name": "Champs-Élysées / 8th",
        "best_for": "Luxury hotels, flagship shopping, and the iconic Paris boulevard",
        "preference_tags": {"Luxury", "Shopping", "Walkability"},
        "base_score": 8.3,
        "convenience": 8.5,
        "value": 5.8,
        "tradeoff": "Most expensive neighborhood. Can feel touristy on the main boulevard.",
        "good_fit": [
            "Home to Paris's top luxury hotels and flagship stores.",
            "Arc de Triomphe, Champs-Élysées, and easy airport connections.",
        ],
    },
]

_PARIS_NEIGHBORHOOD_TO_RECOMMENDATION = {
    "Le Marais": "paris_marais",
    "Saint-Germain-des-Prés": "paris_saint_germain",
    "Latin Quarter": "paris_latin_quarter",
    "Opéra / Louvre": "paris_opera",
    "Montmartre": "paris_montmartre",
    "Champs-Élysées / 8th": "paris_champs_elysees",
}

_PARIS_MOCK_RECOMMENDATIONS = {
    "paris_opera": {
        "match_preferences": {"Food", "Shopping", "Walkability", "Culture"},
        "neighborhood": {
            "name": "Opéra / Louvre",
            "score": 91,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Closest neighborhood to the Louvre, Tuileries, and Galeries Lafayette.",
                "Strong metro connections for cross-city sightseeing.",
                "Dense restaurant and café options for food-focused days.",
            ],
            "cons": [
                "More tourist-heavy than Marais or Saint-Germain.",
                "Less local neighborhood texture than quieter areas.",
            ],
        },
        "hotel": {
            "name": "Grand Hôtel du Palais Royal",
            "area": "Opéra / Louvre · Palais Royal gardens",
            "type": "Recommended hotel",
            "price": 380,
            "score": 89,
            "why": "Byable recommends this stay because it puts shopping, walkability, and food access in the most central Paris base.",
            "tags": ["Central", "Walkable", "Sightseeing"],
            "scores": {
                "Location Match": (9.1, "Steps from the Louvre, Tuileries, and Palais Royal."),
                "Transit Access": (9.0, "Palais Royal–Musée du Louvre stop for easy cross-city access."),
                "Value": (7.4, "Premium location drives the nightly rate."),
                "Room Quality": (8.6, "Polished boutique hotel with Palais Royal garden views."),
                "Safety": (9.2, "Central tourist district with strong pedestrian environment."),
            },
        },
    },
    "paris_marais": {
        "match_preferences": {"Culture", "Food", "Nightlife"},
        "neighborhood": {
            "name": "Le Marais",
            "score": 90,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Paris's most vibrant cultural and food neighborhood.",
                "Walking distance to Centre Pompidou, Place des Vosges, and the Seine.",
                "Strong café, restaurant, and nightlife density.",
            ],
            "cons": [
                "Pricier than the Latin Quarter.",
                "Can feel busy on weekends.",
            ],
        },
        "hotel": {
            "name": "Hôtel du Petit Moulin",
            "area": "Le Marais · Place des Vosges area",
            "type": "Recommended hotel",
            "price": 210,
            "score": 87,
            "why": "Byable recommends this stay for culture and food-focused trips — a boutique Marais hotel steps from Paris's best galleries and restaurants.",
            "tags": ["Culture", "Boutique", "Le Marais"],
            "scores": {
                "Location Match": (9.0, "Heart of the Marais, close to Place des Vosges and major galleries."),
                "Transit Access": (8.4, "Saint-Paul and Hôtel de Ville metro stops nearby."),
                "Value": (7.8, "Boutique pricing, competitive for the Marais."),
                "Room Quality": (8.5, "Design-forward rooms in a converted medieval pharmacy."),
                "Safety": (9.0, "Central, well-lit Marais district."),
            },
        },
    },
    "paris_saint_germain": {
        "match_preferences": {"Luxury", "Relaxation", "Family Friendly"},
        "neighborhood": {
            "name": "Saint-Germain-des-Prés",
            "score": 89,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Classic Paris elegance — iconic cafés, galleries, and quiet streets.",
                "Close to Musée d'Orsay, Luxembourg Gardens, and the Seine.",
                "Calmer evenings than the Marais or Latin Quarter.",
            ],
            "cons": [
                "Higher nightly rates than the Latin Quarter.",
                "Less late-night energy than the Marais.",
            ],
        },
        "hotel": {
            "name": "L'Hôtel Saint-Germain",
            "area": "Saint-Germain-des-Prés · literary Left Bank",
            "type": "Recommended hotel",
            "price": 350,
            "score": 88,
            "why": "Byable recommends this stay for luxury and relaxation trips — the most iconic Left Bank boutique hotel in Paris.",
            "tags": ["Luxury", "Saint-Germain", "Boutique"],
            "scores": {
                "Location Match": (9.0, "Heart of Saint-Germain, steps from Café de Flore and Musée d'Orsay."),
                "Transit Access": (8.3, "Saint-Germain-des-Prés metro within two minutes' walk."),
                "Value": (6.9, "Premium boutique pricing for the Left Bank address."),
                "Room Quality": (9.0, "One of Paris's most iconic and historic boutique stays."),
                "Safety": (9.2, "Calm, central Left Bank district."),
            },
        },
    },
    "paris_latin_quarter": {
        "match_preferences": {"Culture", "Lowest Price"},
        "neighborhood": {
            "name": "Latin Quarter",
            "score": 87,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Best hotel value among central Paris neighborhoods.",
                "Close to Notre-Dame, Panthéon, and Luxembourg Gardens.",
                "Lively student atmosphere with good affordable restaurants.",
            ],
            "cons": [
                "Can be noisy at night near bars and rue Mouffetard.",
                "Less polished luxury hotel density than Saint-Germain.",
            ],
        },
        "hotel": {
            "name": "Hôtel des Grandes Écoles",
            "area": "Latin Quarter · garden courtyard",
            "type": "Recommended hotel",
            "price": 148,
            "score": 85,
            "why": "Byable recommends this stay for culture and value — a charming garden courtyard hotel near the Panthéon and Sorbonne.",
            "tags": ["Value", "Culture", "Garden"],
            "scores": {
                "Location Match": (8.7, "Quiet Latin Quarter location near major cultural sights."),
                "Transit Access": (8.2, "Cardinal Lemoine and Monge stops within walking distance."),
                "Value": (9.3, "Lowest recommended estimated nightly rate in this Paris set."),
                "Room Quality": (8.0, "Charming garden-hotel profile — classic Paris feel without luxury pricing."),
                "Safety": (8.8, "Established central Paris tourist area."),
            },
        },
    },
    "paris_montmartre": {
        "match_preferences": {"Culture", "Food", "Walkability"},
        "neighborhood": {
            "name": "Montmartre",
            "score": 84,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "The most atmospheric, village-like Paris neighborhood.",
                "Quiet side streets behind Sacré-Cœur feel genuinely local.",
                "Strong café and bistro density.",
            ],
            "cons": [
                "Hillside streets are tiring on heavy-sightseeing days.",
                "Slightly farther from the Louvre, Marais, and Saint-Germain.",
            ],
        },
        "hotel": {
            "name": "Hôtel Particulier Montmartre",
            "area": "Montmartre · quiet side street",
            "type": "Recommended hotel",
            "price": 280,
            "score": 84,
            "why": "Byable recommends this stay for atmosphere — a secluded Montmartre mansion hotel away from tourist crowds.",
            "tags": ["Atmosphere", "Montmartre", "Boutique"],
            "scores": {
                "Location Match": (8.5, "Quiet Montmartre side street, away from the Sacré-Cœur crowds."),
                "Transit Access": (7.8, "Lamarck–Caulaincourt metro nearby; hillside walking required."),
                "Value": (7.6, "Boutique mansion hotel — distinctive experience at a premium."),
                "Room Quality": (8.7, "Private estate feel with garden — one of Paris's most memorable stays."),
                "Safety": (8.6, "Residential Montmartre neighborhood."),
            },
        },
    },
    "paris_champs_elysees": {
        "match_preferences": {"Luxury", "Shopping"},
        "neighborhood": {
            "name": "Champs-Élysées / 8th",
            "score": 88,
            "why": "Recommended because it matches your selected preferences.",
            "pros": [
                "Home to Paris's top luxury hotels and flagship boutiques.",
                "Arc de Triomphe, Champs-Élysées, and easy airport connections.",
                "Best fit for shopping-heavy, hotel-led luxury trips.",
            ],
            "cons": [
                "Most expensive neighborhood in this set.",
                "Can feel touristy on the main boulevard.",
            ],
        },
        "hotel": {
            "name": "Hôtel Fouquet's Barrière",
            "area": "Champs-Élysées · luxury flagship",
            "type": "Recommended hotel",
            "price": 890,
            "score": 87,
            "why": "Byable recommends this stay for luxury-focused Paris trips — the landmark Champs-Élysées hotel where the stay itself is part of the experience.",
            "tags": ["Luxury", "Flagship", "Champs-Élysées"],
            "scores": {
                "Location Match": (9.0, "On the Champs-Élysées, adjacent to Arc de Triomphe."),
                "Transit Access": (8.5, "George V and Charles de Gaulle–Étoile metro stops."),
                "Value": (5.8, "Highest nightly rate in the Paris set — premium luxury profile."),
                "Room Quality": (9.3, "Paris's iconic luxury hotel with Michelin-starred dining."),
                "Safety": (9.2, "Upscale 8th arrondissement."),
            },
        },
    },
}

_PARIS_ALTERNATIVE_HOTELS = [
    {
        "label": "Luxury alternative",
        "name": "Hôtel Fouquet's Barrière",
        "area": "Champs-Élysées · luxury flagship",
        "price": 890,
        "score": 86,
        "why": "Best if the hotel itself should feel like a major part of the Paris trip.",
        "tags": ["Luxury", "Champs-Élysées", "Iconic"],
    },
    {
        "label": "Best value alternative",
        "name": "Hôtel des Grandes Écoles",
        "area": "Latin Quarter · garden courtyard",
        "price": 148,
        "score": 84,
        "why": "Charming garden courtyard hotel in the Latin Quarter — strongest value option in central Paris.",
        "tags": ["Value", "Latin Quarter", "Garden"],
    },
    {
        "label": "Best location alternative",
        "name": "Grand Hôtel du Palais Royal",
        "area": "Opéra / Louvre · central sightseeing",
        "price": 380,
        "score": 85,
        "why": "Most central Paris sightseeing base — steps from the Louvre with easy metro access.",
        "tags": ["Central", "Walkable", "Sightseeing"],
    },
]

_PARIS_HOTEL_FACTOR_PROFILES = {
    "Grand Hôtel du Palais Royal": {
        "Location Match": (9.1, "Steps from the Louvre, Tuileries, and Palais Royal gardens."),
        "Transit Access": (9.0, "Palais Royal–Musée du Louvre metro for easy cross-city routing."),
        "Value": (7.4, "Central Louvre-area location drives the nightly rate."),
        "Room Quality": (8.6, "Polished boutique hotel with garden-facing rooms."),
        "Safety": (9.2, "Central tourist district with strong pedestrian environment."),
        "preference_tags": {"Shopping", "Walkability", "Food", "Culture"},
    },
    "Hôtel du Petit Moulin": {
        "Location Match": (9.0, "Heart of Le Marais, close to Place des Vosges and major galleries."),
        "Transit Access": (8.4, "Saint-Paul and Hôtel de Ville metro stops nearby."),
        "Value": (7.8, "Boutique pricing competitive for the Marais location."),
        "Room Quality": (8.5, "Design-forward rooms in a converted medieval pharmacy."),
        "Safety": (9.0, "Central, well-lit Marais district."),
        "preference_tags": {"Culture", "Food", "Nightlife"},
    },
    "L'Hôtel Saint-Germain": {
        "Location Match": (9.0, "Heart of Saint-Germain, steps from Café de Flore and Musée d'Orsay."),
        "Transit Access": (8.3, "Saint-Germain-des-Prés metro within two minutes' walk."),
        "Value": (6.9, "Premium boutique pricing for the Left Bank address."),
        "Room Quality": (9.0, "One of Paris's most iconic and historic boutique stays."),
        "Safety": (9.2, "Calm, central Left Bank district."),
        "preference_tags": {"Luxury", "Culture", "Relaxation"},
    },
    "Hôtel des Grandes Écoles": {
        "Location Match": (8.7, "Quiet Latin Quarter location near the Panthéon and Sorbonne."),
        "Transit Access": (8.2, "Cardinal Lemoine and Monge metro stops within walking distance."),
        "Value": (9.3, "Lowest recommended nightly rate in the Paris set."),
        "Room Quality": (8.0, "Charming garden-hotel profile — classic Paris feel without luxury pricing."),
        "Safety": (8.8, "Established central Paris tourist area."),
        "preference_tags": {"Culture", "Lowest Price", "Food", "Family Friendly"},
    },
    "Hôtel Particulier Montmartre": {
        "Location Match": (8.5, "Quiet Montmartre side street away from Sacré-Cœur crowds."),
        "Transit Access": (7.8, "Lamarck–Caulaincourt metro nearby; hillside walking required."),
        "Value": (7.6, "Distinctive boutique mansion experience at a premium."),
        "Room Quality": (8.7, "Private estate feel with garden — one of Paris's most memorable stays."),
        "Safety": (8.6, "Residential Montmartre neighborhood."),
        "preference_tags": {"Culture", "Food", "Walkability"},
    },
    "Hôtel Fouquet's Barrière": {
        "Location Match": (9.0, "On the Champs-Élysées, adjacent to Arc de Triomphe."),
        "Transit Access": (8.5, "George V and Charles de Gaulle–Étoile metro stops."),
        "Value": (5.8, "Highest nightly rate in the Paris set — premium luxury profile."),
        "Room Quality": (9.3, "Paris's iconic luxury hotel with Michelin-starred dining."),
        "Safety": (9.2, "Upscale 8th arrondissement."),
        "preference_tags": {"Luxury", "Shopping"},
    },
}

_TOKYO_NEIGHBORHOOD_SAFETY_SCORES = {
    "Ginza / Yurakucho": 9.1,
    "Shinjuku / Shibuya": 8.0,
    "Ueno / Asakusa": 8.5,
    "Ginza / Toranomon": 9.2,
    "Tokyo Bay / Shiba": 9.0,
}

_PARIS_NEIGHBORHOOD_SAFETY_SCORES = {
    "Le Marais": 9.0,
    "Saint-Germain-des-Prés": 9.2,
    "Latin Quarter": 8.7,
    "Opéra / Louvre": 9.2,
    "Montmartre": 8.6,
    "Champs-Élysées / 8th": 9.2,
}


def _money(value):
    if value is None:
        return "Not priced"
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return "Not priced"
        try:
            value = float(stripped)
        except ValueError:
            return html.escape(stripped)
    return f"${float(value):,.0f}"


def _rating_text(hotel):
    rating = hotel.get("rating")
    try:
        return f"{float(rating):.1f} ★" if rating else ""
    except (TypeError, ValueError):
        return ""


def _review_count_text(hotel):
    try:
        count = int(hotel.get("review_count") or 0)
    except (TypeError, ValueError):
        count = 0
    return f"{count:,} reviews" if count else "Reviews unavailable"


def _escape_list(items):
    return "".join(f"<li>{html.escape(str(item))}</li>" for item in items)


def _select_mock_recommendation(preferences, mock_recommendations=None):
    if mock_recommendations is None:
        mock_recommendations = MOCK_RECOMMENDATIONS
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    # preference-to-key lookup (city-agnostic via preference_tags)
    for key, rec in mock_recommendations.items():
        match_prefs = set(rec.get("match_preferences") or [])
        if selected & match_prefs:
            return rec
    return next(iter(mock_recommendations.values()))


def _destination_city():
    explicit = st.session_state.get("trip_destination")
    if explicit:
        return str(explicit).strip() or "Tokyo"
    search_params = st.session_state.get("flight_search") or {}
    city = str(search_params.get("destination_city") or "Tokyo").strip()
    return city or "Tokyo"


HOTEL_FACTOR_PROFILES = {
    "Mitsui Garden Hotel Ginza Premier": {
        "Location Match": (9.3, "Strong fit for Ginza food, shopping, and walkable first-trip days."),
        "Transit Access": (8.7, "Useful Ginza/Shimbashi/Tokyo Station access without needing a car."),
        "Value": (7.8, "Pricier than Ueno, but less expensive than luxury Ginza/Toranomon hotels."),
        "Room Quality": (8.4, "Upper-midscale profile with polished rooms and skyline-oriented positioning."),
        "Safety": (9.1, "Central, well-lit shopping and business district profile."),
        "preference_tags": {"Food", "Shopping", "Walkability"},
    },
    "JR Kyushu Hotel Blossom Shinjuku": {
        "Location Match": (8.8, "Best fit for nightlife, late dining, and west-side Tokyo energy."),
        "Transit Access": (9.3, "Shinjuku Station gives the strongest rail access in this recommended set."),
        "Value": (7.5, "Convenience raises the nightly rate versus Ueno or Asakusa."),
        "Room Quality": (8.2, "Reliable modern city-hotel profile."),
        "Safety": (8.0, "Central and active, though the area can feel busier late at night."),
        "preference_tags": {"Nightlife", "Walkability"},
    },
    "Nohga Hotel Ueno Tokyo": {
        "Location Match": (8.4, "Strong fit for museums, parks, older Tokyo, and slower cultural days."),
        "Transit Access": (8.5, "Ueno gives useful JR and subway connections across Tokyo."),
        "Value": (9.3, "Lowest estimated nightly rate among the core Byable options."),
        "Room Quality": (8.1, "Solid design-hotel profile without luxury pricing."),
        "Safety": (8.5, "Established visitor area with predictable transport access."),
        "preference_tags": {"Culture", "Lowest Price", "Walkability"},
    },
    "The Tokyo Edition, Toranomon": {
        "Location Match": (8.7, "Strong fit for premium dining, design hotels, and polished central Tokyo."),
        "Transit Access": (8.1, "Central, but less frictionless than Shinjuku for rail-heavy sightseeing."),
        "Value": (6.5, "Highest estimated nightly rate lowers value despite strong quality."),
        "Room Quality": (9.5, "Strongest luxury and room-quality profile in this set."),
        "Safety": (9.2, "Polished central business district with predictable access."),
        "preference_tags": {"Luxury", "Food", "Relaxation"},
    },
    "Hotel The Celestine Tokyo Shiba": {
        "Location Match": (8.2, "Best for a calmer base near parks and Haneda-side routing."),
        "Transit Access": (8.8, "Daimon and Hamamatsucho support useful airport and Yamanote access."),
        "Value": (8.4, "Moderate estimated rate for a quieter, polished hotel profile."),
        "Room Quality": (8.5, "Comfortable upper-midscale profile."),
        "Safety": (9.0, "Calm business district profile with predictable late-evening access."),
        "preference_tags": {"Relaxation", "Family Friendly"},
    },
}

_TOKYO_CITY_DATA = {
    "data_source": "curated",
    "neighborhood_profiles": NEIGHBORHOOD_PROFILES,
    "neighborhood_to_recommendation": NEIGHBORHOOD_TO_RECOMMENDATION,
    "mock_recommendations": MOCK_RECOMMENDATIONS,
    "alternative_hotels": ALTERNATIVE_HOTELS,
    "hotel_factor_profiles": HOTEL_FACTOR_PROFILES,
    "neighborhood_safety_scores": _TOKYO_NEIGHBORHOOD_SAFETY_SCORES,
    "preferred_alternative_neighborhoods": ["Shinjuku / Shibuya", "Ueno / Asakusa", "Ginza / Toranomon"],
}

_PARIS_CITY_DATA = {
    "data_source": "curated",
    "neighborhood_profiles": _PARIS_NEIGHBORHOOD_PROFILES,
    "neighborhood_to_recommendation": _PARIS_NEIGHBORHOOD_TO_RECOMMENDATION,
    "mock_recommendations": _PARIS_MOCK_RECOMMENDATIONS,
    "alternative_hotels": _PARIS_ALTERNATIVE_HOTELS,
    "hotel_factor_profiles": _PARIS_HOTEL_FACTOR_PROFILES,
    "neighborhood_safety_scores": _PARIS_NEIGHBORHOOD_SAFETY_SCORES,
    "preferred_alternative_neighborhoods": ["Le Marais", "Opéra / Louvre", "Saint-Germain-des-Prés"],
}

_GENERIC_NEIGHBORHOOD_TEMPLATES = [
    {
        "key": "central",
        "name_template": "Central {city}",
        "best_for": "Sightseeing, central access, and walkable city days",
        "preference_tags": {"Food", "Shopping", "Walkability", "Culture"},
        "base_score": 8.4,
        "convenience": 9.0,
        "value": 7.5,
        "tradeoff": "Can be busier and more expensive than quieter neighborhoods.",
        "good_fit": [
            "Best transit connections for cross-city sightseeing.",
            "Close to major landmarks, restaurants, and shops.",
        ],
        "hotel_name_template": "{city} Grand Hotel",
        "hotel_area_template": "Central {city} · city centre",
        "hotel_price": 260,
        "hotel_scores": {
            "Location Match": (8.8, "Central location with easy access to major sights and transit."),
            "Transit Access": (9.0, "Main city transit hub for broad cross-city access."),
            "Value": (7.5, "Central location drives a higher nightly rate."),
            "Room Quality": (8.2, "Solid city-centre hotel profile."),
            "Safety": (8.8, "Well-lit central district with strong pedestrian environment."),
        },
        "hotel_why_template": "Byable recommends this stay because it gives the most central base for sightseeing and walkable city days in {city}.",
        "hotel_tags": ["Central", "Walkable", "Sightseeing"],
    },
    {
        "key": "historic",
        "name_template": "Old Town / Historic District",
        "best_for": "Culture, history, architecture, and local atmosphere",
        "preference_tags": {"Culture", "Food", "Walkability"},
        "base_score": 8.3,
        "convenience": 8.0,
        "value": 8.2,
        "tradeoff": "Can feel crowded in peak season. Some areas are pedestrian-only.",
        "good_fit": [
            "Historic streets, museums, and cultural landmarks close together.",
            "Strong pedestrian atmosphere and local café culture.",
        ],
        "hotel_name_template": "{city} Heritage Hotel",
        "hotel_area_template": "Old Town / Historic District · heritage quarter",
        "hotel_price": 220,
        "hotel_scores": {
            "Location Match": (8.7, "Historic district location near cultural sights and walking routes."),
            "Transit Access": (7.9, "Walkable district; metro access may require a short walk."),
            "Value": (8.2, "Solid value for the heritage area character."),
            "Room Quality": (8.3, "Character hotel profile in a historic setting."),
            "Safety": (8.7, "Established tourist area with good daytime foot traffic."),
        },
        "hotel_why_template": "Byable recommends this stay because it keeps cultural sights, walking routes, and historic atmosphere close in {city}.",
        "hotel_tags": ["Culture", "Heritage", "Walkable"],
    },
    {
        "key": "shopping",
        "name_template": "Shopping & Dining Quarter",
        "best_for": "Shopping, food markets, and walkable city energy",
        "preference_tags": {"Shopping", "Walkability", "Food", "Nightlife"},
        "base_score": 8.2,
        "convenience": 8.8,
        "value": 7.3,
        "tradeoff": "Busier and noisier than quieter residential neighborhoods.",
        "good_fit": [
            "Dense retail, dining, and entertainment options.",
            "Good transit access and pedestrian-friendly streets.",
        ],
        "hotel_name_template": "{city} Market Hotel",
        "hotel_area_template": "Shopping & Dining Quarter · retail district",
        "hotel_price": 195,
        "hotel_scores": {
            "Location Match": (8.6, "Keeps shopping, markets, and restaurants within easy reach."),
            "Transit Access": (8.8, "Good metro and bus access for cross-city routing."),
            "Value": (7.3, "Busy district raises nightly rates vs. quieter areas."),
            "Room Quality": (8.0, "Practical modern hotel profile."),
            "Safety": (8.5, "Active daytime district with good pedestrian presence."),
        },
        "hotel_why_template": "Byable recommends this stay because it puts shopping, food markets, and walkable streets within easy reach in {city}.",
        "hotel_tags": ["Shopping", "Food", "Central"],
    },
    {
        "key": "nightlife",
        "name_template": "Nightlife & Entertainment District",
        "best_for": "Nightlife, late dining, and evening energy",
        "preference_tags": {"Nightlife", "Food", "Walkability"},
        "base_score": 8.0,
        "convenience": 8.5,
        "value": 7.8,
        "tradeoff": "Noisier at night. Less suited for relaxation or family-focused trips.",
        "good_fit": [
            "Late dining, bars, and evening entertainment close by.",
            "Active nighttime atmosphere with dense local dining options.",
        ],
        "hotel_name_template": "{city} Nights Hotel",
        "hotel_area_template": "Nightlife & Entertainment District · evening quarter",
        "hotel_price": 185,
        "hotel_scores": {
            "Location Match": (8.4, "Entertainment district keeps nightlife and late dining within walking distance."),
            "Transit Access": (8.5, "Good transit for late-night returns and day trips."),
            "Value": (7.8, "Moderate pricing with good access to evening activity."),
            "Room Quality": (8.0, "Functional city hotel profile for active evenings."),
            "Safety": (7.9, "Busier at night — generally safe but livelier surroundings."),
        },
        "hotel_why_template": "Byable recommends this stay for nightlife-focused trips because it keeps late dining and entertainment close in {city}.",
        "hotel_tags": ["Nightlife", "Late dining", "Active"],
    },
    {
        "key": "residential",
        "name_template": "Quiet Residential Area",
        "best_for": "Relaxation, family pacing, and calmer stays",
        "preference_tags": {"Relaxation", "Family Friendly", "Lowest Price"},
        "base_score": 7.8,
        "convenience": 7.8,
        "value": 9.0,
        "tradeoff": "Requires transit for most sightseeing. Less dense for nightlife or shopping.",
        "good_fit": [
            "Calmer mornings and quieter evenings away from tourist areas.",
            "Usually better hotel value than central or commercial districts.",
        ],
        "hotel_name_template": "{city} Garden Hotel",
        "hotel_area_template": "Quiet Residential Area · local neighbourhood",
        "hotel_price": 130,
        "hotel_scores": {
            "Location Match": (7.8, "Quieter residential setting — good for calmer pacing."),
            "Transit Access": (7.8, "Transit available; sightseeing requires a short journey."),
            "Value": (9.0, "Best estimated value in the set — lower rate for calmer surroundings."),
            "Room Quality": (8.0, "Comfortable mid-range hotel profile."),
            "Safety": (9.0, "Calm residential district with low foot traffic."),
        },
        "hotel_why_template": "Byable recommends this stay because it offers the best value while keeping a calm neighbourhood base in {city}.",
        "hotel_tags": ["Value", "Quiet", "Family-friendly"],
    },
    {
        "key": "luxury",
        "name_template": "Upscale / Luxury Quarter",
        "best_for": "Luxury hotels, fine dining, and polished stays",
        "preference_tags": {"Luxury", "Relaxation", "Food"},
        "base_score": 8.1,
        "convenience": 8.2,
        "value": 5.5,
        "tradeoff": "Most expensive neighbourhood option. Less casual nightlife density.",
        "good_fit": [
            "High-end hotels, fine dining, and a refined city atmosphere.",
            "Quieter and more polished than busy commercial districts.",
        ],
        "hotel_name_template": "The {city} Palace",
        "hotel_area_template": "Upscale / Luxury Quarter · premium district",
        "hotel_price": 520,
        "hotel_scores": {
            "Location Match": (8.5, "Premium district with upscale dining, hotels, and polished streets."),
            "Transit Access": (8.2, "Good central access with quieter surroundings."),
            "Value": (5.5, "Luxury pricing reflects the premium hotel and neighbourhood profile."),
            "Room Quality": (9.2, "Luxury hotel profile with strong amenities."),
            "Safety": (9.3, "Upscale district with strong pedestrian environment."),
        },
        "hotel_why_template": "Byable recommends this stay for luxury-focused trips where the hotel experience itself matters as much as the location in {city}.",
        "hotel_tags": ["Luxury", "Fine dining", "Premium"],
    },
]

_TEMPLATE_CITY_DATA_CACHE: dict = {}


def _generate_template_city_data(city: str) -> dict:
    if city in _TEMPLATE_CITY_DATA_CACHE:
        return _TEMPLATE_CITY_DATA_CACHE[city]

    neighborhood_profiles = []
    neighborhood_to_recommendation = {}
    mock_recommendations = {}
    hotel_factor_profiles = {}
    safety_scores = {}

    for tmpl in _GENERIC_NEIGHBORHOOD_TEMPLATES:
        nb_name = tmpl["name_template"].format(city=city)
        rec_key = f"generic_{tmpl['key']}"
        hotel_name = tmpl["hotel_name_template"].format(city=city)
        hotel_area = tmpl["hotel_area_template"].format(city=city)
        hotel_why = tmpl["hotel_why_template"].format(city=city)
        hs = tmpl["hotel_scores"]
        hotel_score_base = int(round((
            hs["Location Match"][0] * 0.22
            + hs["Transit Access"][0] * 0.15
            + hs["Value"][0] * 0.17
            + hs["Room Quality"][0] * 0.17
            + hs["Safety"][0] * 0.11
            + 7.5 * 0.18
        ) * 10))

        neighborhood_profiles.append({
            "name": nb_name,
            "best_for": tmpl["best_for"],
            "preference_tags": set(tmpl["preference_tags"]),
            "base_score": tmpl["base_score"],
            "convenience": tmpl["convenience"],
            "value": tmpl["value"],
            "tradeoff": tmpl["tradeoff"],
            "good_fit": list(tmpl["good_fit"]),
        })
        neighborhood_to_recommendation[nb_name] = rec_key
        mock_recommendations[rec_key] = {
            "match_preferences": set(tmpl["preference_tags"]),
            "neighborhood": {
                "name": nb_name,
                "score": int(round(tmpl["base_score"] * 10.5)),
                "why": "Recommended because it matches your selected preferences.",
                "pros": list(tmpl["good_fit"]) + [f"Good base for {tmpl['best_for'].lower()}."],
                "cons": [tmpl["tradeoff"]],
            },
            "hotel": {
                "name": hotel_name,
                "area": hotel_area,
                "type": "Recommended hotel",
                "price": tmpl["hotel_price"],
                "score": hotel_score_base,
                "why": hotel_why,
                "tags": list(tmpl["hotel_tags"]),
                "scores": dict(hs),
            },
        }
        hotel_factor_profiles[hotel_name] = {
            **hs,
            "preference_tags": set(tmpl["preference_tags"]),
        }
        safety_scores[nb_name] = hs["Safety"][0]

    luxury_tmpl = next(t for t in _GENERIC_NEIGHBORHOOD_TEMPLATES if t["key"] == "luxury")
    residential_tmpl = next(t for t in _GENERIC_NEIGHBORHOOD_TEMPLATES if t["key"] == "residential")
    central_tmpl = next(t for t in _GENERIC_NEIGHBORHOOD_TEMPLATES if t["key"] == "central")

    alternative_hotels = [
        {
            "label": "Luxury alternative",
            "name": luxury_tmpl["hotel_name_template"].format(city=city),
            "area": luxury_tmpl["hotel_area_template"].format(city=city),
            "price": luxury_tmpl["hotel_price"],
            "score": 86,
            "why": f"Best if the hotel experience itself should be a highlight of the {city} trip.",
            "tags": list(luxury_tmpl["hotel_tags"]),
        },
        {
            "label": "Best value alternative",
            "name": residential_tmpl["hotel_name_template"].format(city=city),
            "area": residential_tmpl["hotel_area_template"].format(city=city),
            "price": residential_tmpl["hotel_price"],
            "score": 84,
            "why": f"Best estimated value in {city} — lower nightly rate with comfortable surroundings.",
            "tags": list(residential_tmpl["hotel_tags"]),
        },
        {
            "label": "Best location alternative",
            "name": central_tmpl["hotel_name_template"].format(city=city),
            "area": central_tmpl["hotel_area_template"].format(city=city),
            "price": central_tmpl["hotel_price"],
            "score": 85,
            "why": f"Most central {city} base — best if sightseeing access and transit convenience are the priority.",
            "tags": list(central_tmpl["hotel_tags"]),
        },
    ]

    preferred_alt = [
        t["name_template"].format(city=city)
        for t in _GENERIC_NEIGHBORHOOD_TEMPLATES
        if t["key"] in ("central", "historic", "shopping")
    ]

    result = {
        "data_source": "template",
        "neighborhood_profiles": neighborhood_profiles,
        "neighborhood_to_recommendation": neighborhood_to_recommendation,
        "mock_recommendations": mock_recommendations,
        "alternative_hotels": alternative_hotels,
        "hotel_factor_profiles": hotel_factor_profiles,
        "neighborhood_safety_scores": safety_scores,
        "preferred_alternative_neighborhoods": preferred_alt,
    }
    _TEMPLATE_CITY_DATA_CACHE[city] = result
    return result


def get_hotel_data_for_destination(destination: str) -> dict:
    """Return hotel data bundle for destination.

    Returns curated data for Tokyo/Paris, template-generated estimates for all other cities.
    Never falls back to Tokyo for non-Tokyo destinations.
    """
    normalized = str(destination or "").strip().lower()
    if "tokyo" in normalized:
        return _TOKYO_CITY_DATA
    if "paris" in normalized:
        return _PARIS_CITY_DATA
    return _generate_template_city_data(destination)


def _base_mock_hotels(mock_recommendations=None, alternative_hotels=None):
    if mock_recommendations is None:
        mock_recommendations = MOCK_RECOMMENDATIONS
    if alternative_hotels is None:
        alternative_hotels = ALTERNATIVE_HOTELS
    hotels = []
    seen = set()
    for recommendation in mock_recommendations.values():
        hotel = dict(recommendation["hotel"])
        if hotel["name"] not in seen:
            hotels.append(hotel)
            seen.add(hotel["name"])
    for hotel in alternative_hotels:
        if hotel["name"] not in seen:
            item = dict(hotel)
            item.setdefault("type", item.get("label", "Alternative hotel"))
            hotels.append(item)
            seen.add(item["name"])
    return hotels


def _trip_fit_factor(hotel_name, preferences, hotel_factor_profiles=None):
    if hotel_factor_profiles is None:
        hotel_factor_profiles = HOTEL_FACTOR_PROFILES
    profile = hotel_factor_profiles.get(hotel_name, {})
    tags = set(profile.get("preference_tags") or [])
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    if not selected:
        return 7.2, "Neutral fit because no hotel preferences were selected."
    matches = sorted(tags & selected)
    ratio = len(matches) / max(1, min(len(selected), 3))
    score = round(max(6.2, min(9.7, 6.4 + ratio * 3.0)), 1)
    if matches:
        note = f"Matches selected priorities: {', '.join(matches[:3])}."
    else:
        note = "Less directly aligned with the selected hotel priorities."
    return score, note


def _score_mock_hotel(hotel, preferences, hotel_factor_profiles=None):
    if hotel_factor_profiles is None:
        hotel_factor_profiles = HOTEL_FACTOR_PROFILES
    profile = hotel_factor_profiles.get(hotel["name"], {})
    scores = {
        key: profile.get(key, (7.5, "Byable score based on current stay assumptions."))
        for key in ("Location Match", "Transit Access", "Value", "Room Quality", "Safety")
    }
    scores["Trip Fit"] = _trip_fit_factor(hotel["name"], preferences, hotel_factor_profiles)
    weighted = (
        scores["Location Match"][0] * 0.22
        + scores["Transit Access"][0] * 0.15
        + scores["Value"][0] * 0.17
        + scores["Room Quality"][0] * 0.17
        + scores["Safety"][0] * 0.11
        + scores["Trip Fit"][0] * 0.18
    )
    scored = dict(hotel)
    scored["scores"] = scores
    scored["score"] = int(round(weighted * 10))
    scored["trip_fit"] = scores["Trip Fit"][0]
    scored["type"] = scored.get("type") or "Recommended hotel"
    scored["tags"] = scored.get("tags") or sorted(profile.get("preference_tags") or [])[:3]
    return scored


def _price_level_label(price_level):
    labels = {
        "PRICE_LEVEL_FREE": "Free",
        "PRICE_LEVEL_INEXPENSIVE": "Lower price",
        "PRICE_LEVEL_MODERATE": "Moderate price",
        "PRICE_LEVEL_EXPENSIVE": "Higher price",
        "PRICE_LEVEL_VERY_EXPENSIVE": "Premium price",
    }
    return labels.get(str(price_level or ""), "Price unavailable")


def _price_level_value_score(price_level):
    scores = {
        "PRICE_LEVEL_FREE": 9.5,
        "PRICE_LEVEL_INEXPENSIVE": 9.2,
        "PRICE_LEVEL_MODERATE": 8.1,
        "PRICE_LEVEL_EXPENSIVE": 6.8,
        "PRICE_LEVEL_VERY_EXPENSIVE": 5.8,
    }
    return scores.get(str(price_level or ""), 7.7)


def _review_count_bonus(review_count):
    try:
        count = int(review_count or 0)
    except (TypeError, ValueError):
        count = 0
    if count >= 2000:
        return 0.6
    if count >= 750:
        return 0.4
    if count >= 200:
        return 0.25
    return 0


def _rating_quality_score(rating, review_count):
    try:
        rating_value = float(rating or 0)
    except (TypeError, ValueError):
        rating_value = 0
    if rating_value <= 0:
        return 7.2
    return round(max(6.2, min(9.7, rating_value * 2 + _review_count_bonus(review_count))), 1)


def _neighborhood_safety_score(scored_neighborhood, safety_scores=None):
    if safety_scores is None:
        safety_scores = _TOKYO_NEIGHBORHOOD_SAFETY_SCORES
    return safety_scores.get(scored_neighborhood.get("name"), 8.4)


def _live_trip_fit_score(hotel, scored_neighborhood, preferences):
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    neighborhood_tags = set(scored_neighborhood.get("preference_tags") or [])
    matches = selected & neighborhood_tags
    score = 6.5 + min(2.4, len(matches) * 0.8)
    price_level = str(hotel.get("price_level") or "")
    if "Lowest Price" in selected and price_level in {"PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"}:
        score += 0.6
    if "Luxury" in selected and price_level in {"PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"}:
        score += 0.5
    if {"Food", "Shopping", "Walkability"} & selected and scored_neighborhood.get("name") in {"Ginza / Yurakucho", "Shinjuku / Shibuya"}:
        score += 0.35
    return round(max(6.0, min(9.6, score)), 1)


def _score_google_hotel(hotel, preferences, scored_neighborhood, safety_scores=None):
    neighborhood_name = scored_neighborhood["name"]
    neighborhood_match = round(max(6.8, min(9.7, scored_neighborhood["score"] / 10)), 1)
    transit = round(float(scored_neighborhood.get("convenience") or 8.0), 1)
    safety = round(_neighborhood_safety_score(scored_neighborhood, safety_scores), 1)
    value = round(_price_level_value_score(hotel.get("price_level")), 1)
    room = _rating_quality_score(hotel.get("rating"), hotel.get("review_count"))
    trip_fit = _live_trip_fit_score(hotel, scored_neighborhood, preferences)
    scores = {
        "Location Match": (
            neighborhood_match,
            f"Matched to the selected {neighborhood_name} stay area.",
        ),
        "Transit Access": (
            transit,
            "Based on the selected neighborhood's transit and walkability profile.",
        ),
        "Value": (
            value,
            f"Based on Google Places price level: {_price_level_label(hotel.get('price_level'))}.",
        ),
        "Room Quality": (
            room,
            f"Based on Google rating {hotel.get('rating') or 'unavailable'} and {int(hotel.get('review_count') or 0):,} reviews.",
        ),
        "Safety": (
            safety,
            "Based on the selected neighborhood's current safety profile.",
        ),
        "Trip Fit": (
            trip_fit,
            "Based on selected hotel preferences and neighborhood alignment.",
        ),
    }
    weighted = (
        scores["Location Match"][0] * 0.22
        + scores["Transit Access"][0] * 0.15
        + scores["Value"][0] * 0.17
        + scores["Room Quality"][0] * 0.17
        + scores["Safety"][0] * 0.11
        + scores["Trip Fit"][0] * 0.18
    )
    tags = [
        f"{float(hotel.get('rating')):.1f} rating" if hotel.get("rating") else "Rating unavailable",
        f"{int(hotel.get('review_count') or 0):,} reviews" if hotel.get("review_count") else "Reviews unavailable",
    ]
    price_label = _price_level_label(hotel.get("price_level"))
    if price_label != "Price unavailable":
        tags.append(price_label)
    return {
        "name": hotel["name"],
        "area": hotel.get("address") or neighborhood_name,
        "type": "Recommended hotel",
        "label": "Alternative hotel",
        "price": None,
        "price_subtitle": "Google price level",
        "score": int(round(weighted * 10)),
        "trip_fit": trip_fit,
        "why": "",
        "tags": tags,
        "scores": scores,
        "rating": hotel.get("rating"),
        "review_count": hotel.get("review_count"),
        "lat": hotel.get("lat"),
        "lng": hotel.get("lng"),
        "price_level": hotel.get("price_level"),
        "source": "google_places",
    }


def _rank_google_hotels(google_hotels, preferences, scored_neighborhood, safety_scores=None):
    scored = [_score_google_hotel(hotel, preferences, scored_neighborhood, safety_scores) for hotel in google_hotels]
    return sorted(scored, key=lambda hotel: hotel["score"], reverse=True)


def _rank_mock_hotels(preferences, city_data=None):
    if city_data is None:
        city_data = _TOKYO_CITY_DATA
    base = _base_mock_hotels(city_data["mock_recommendations"], city_data["alternative_hotels"])
    ranked = [_score_mock_hotel(hotel, preferences, city_data["hotel_factor_profiles"]) for hotel in base]
    return sorted(ranked, key=lambda hotel: hotel["score"], reverse=True)


def _hotel_recommendation_copy(hotel, preferences, neighborhood=None):
    preference_text = ", ".join((preferences or DEFAULT_HOTEL_PREFERENCES)[:3])
    neighborhood_name = neighborhood or "the selected neighborhood"
    rating = _rating_text(hotel)
    rating_text = " Public Google reviews add confidence in this specific hotel pick." if rating else ""
    return (
        f"Your main priorities are {preference_text}. Byable recommends this stay because {neighborhood_name} gives those days the easiest base."
        f"{rating_text}"
    )


def _hotel_pick_bullets(hotel, recommended_neighborhood, preferences):
    neighborhood_name = recommended_neighborhood.get("name") or "the selected neighborhood"
    preference_text = ", ".join((preferences or DEFAULT_HOTEL_PREFERENCES)[:3])
    bullets = []

    neighborhood_benefits = {
        "Ginza / Yurakucho": "Convenient base for restaurants, shopping, Tokyo Station, and polished first-time days.",
        "Shinjuku / Shibuya": "Convenient base for food, shopping, nightlife, and rail-heavy day trips.",
        "Ueno / Asakusa": "Good base for museums, temples, parks, and traditional Tokyo atmosphere.",
        "Ginza / Toranomon": "Upscale base for premium dining, design hotels, and quieter evenings.",
        "Tokyo Bay / Shiba": "Calmer base for slower mornings, family pacing, and Haneda-side routing.",
        "Le Marais": "Vibrant base for museums, galleries, cafés, and the best Paris food streets.",
        "Saint-Germain-des-Prés": "Classic Left Bank base for iconic cafés, Musée d'Orsay, and elegant Paris evenings.",
        "Latin Quarter": "Good-value base for cultural sights, Notre-Dame, and affordable Paris dining.",
        "Opéra / Louvre": "Central sightseeing base steps from the Louvre, Tuileries, and Galeries Lafayette.",
        "Montmartre": "Atmospheric village-within-Paris base with great café culture and Sacré-Cœur views.",
        "Champs-Élysées / 8th": "Upscale base for luxury hotels, flagship shopping, and the iconic Paris boulevard.",
    }
    neighborhood_benefit = neighborhood_benefits.get(
        neighborhood_name,
        f"Convenient base in {neighborhood_name} for your planned stay.",
    )
    bullets.append(f"{neighborhood_benefit}")

    rating = _rating_text(hotel)
    if rating:
        bullets.append(f"Public Google review signals help validate this {neighborhood_name} pick.")
    else:
        bullets.append(f"Keeps the stay recommendation focused on {neighborhood_name} while live review details are limited.")

    if {"Food", "Shopping", "Walkability"} & set(preferences or []):
        bullets.append(f"Keeps restaurants, shopping, and walkable plans close to {neighborhood_name}.")
    elif "Culture" in set(preferences or []):
        bullets.append(f"Makes {neighborhood_name} the base for museums, temples, or older Tokyo streets.")
    elif "Luxury" in set(preferences or []):
        bullets.append(f"Keeps the stay aligned with a more polished {neighborhood_name} experience.")
    elif "Lowest Price" in set(preferences or []):
        bullets.append(f"Keeps the hotel choice practical inside the {neighborhood_name} strategy.")
    else:
        bullets.append(f"Fits naturally inside the {neighborhood_name} stay strategy.")

    address = str(hotel.get("area") or "")
    if address and neighborhood_name.split(" / ")[0] in address:
        bullets.append(f"Located in the area Byable selected for this trip: {neighborhood_name}.")

    return bullets[:4]


def _hotel_context(hotel=None, preferences=None, neighborhood=None):
    selected_preferences = list(
        preferences
        or (hotel or {}).get("_selected_preferences")
        or st.session_state.get("hotel_preferences")
        or DEFAULT_HOTEL_PREFERENCES
    )
    neighborhood_name = (
        neighborhood
        or (hotel or {}).get("_recommended_neighborhood_name")
        or st.session_state.get("hotel_recommended_neighborhood_name")
        or "the selected neighborhood"
    )
    return selected_preferences, neighborhood_name


def _priority_phrase(preferences, limit=2, joiner="and"):
    selected = [str(item) for item in (preferences or DEFAULT_HOTEL_PREFERENCES)[:limit]]
    if not selected:
        return "your priorities"
    if len(selected) == 1:
        return selected[0]
    return f" {joiner} ".join(selected)


def _priority_badge_phrase(preferences):
    return " + ".join(str(item) for item in (preferences or DEFAULT_HOTEL_PREFERENCES)[:2])


def _traveler_focus_phrase(preferences):
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    if {"Food", "Shopping", "Walkability"} & selected:
        return "dining and city exploration"
    if "Nightlife" in selected:
        return "late nights and entertainment"
    if "Culture" in selected:
        return "museums, temples, and cultural sights"
    if "Luxury" in selected:
        return "a polished, hotel-led stay"
    if "Lowest Price" in selected:
        return "better value without giving up a central base"
    if "Relaxation" in selected:
        return "calmer mornings and quieter evenings"
    if "Family Friendly" in selected:
        return "simple logistics and calmer pacing"
    return "convenient city days"


def _hotel_priority_match_line(hotel, preferences, neighborhood_name):
    selected = set(preferences or [])
    name_key = str(hotel.get("name") or "").lower()
    area = str(hotel.get("area") or "").lower()

    if "Food" in selected and ("shinjuku" in area or "ginza" in area):
        return "Places you within walking distance of some of Tokyo's strongest dining options."
    if "Shopping" in selected and ("ginza" in area or "shinjuku" in area):
        return "Keeps major shopping streets close without turning every day into a transit plan."
    if "Walkability" in selected:
        return f"Keeps the stay tied to {neighborhood_name}, so more of the trip can happen on foot."
    if "Culture" in selected and ("ueno" in area or "asakusa" in area):
        return "Keeps museums, parks, temples, and older Tokyo close by."
    if "Nightlife" in selected and ("shinjuku" in area or "gracery" in name_key):
        return "Keeps late dining and entertainment within easy reach."
    if "Luxury" in selected and ("toranomon" in area or "edition" in name_key):
        return "Makes the hotel experience feel more polished and intentional."
    if "Lowest Price" in selected and ("ueno" in area or "asakusa" in area):
        return "Leans toward better-value Tokyo hotel areas."
    return f"Fits naturally with the {neighborhood_name} base Byable selected."


def _hotel_identity_profile(hotel, recommended_hotel=None, recommended=False, preferences=None, neighborhood=None):
    selected_preferences, neighborhood_name = _hotel_context(hotel, preferences, neighborhood)
    focus_text = _traveler_focus_phrase(selected_preferences)
    name = str(hotel.get("name") or "")
    name_key = name.lower()
    area = str(hotel.get("area") or "").lower()
    label = str(hotel.get("label") or hotel.get("type") or "").lower()
    tags = {str(tag).lower() for tag in hotel.get("tags") or []}
    best_for = []

    def add_best(label):
        if label and label not in best_for:
            best_for.append(label)

    known_profiles = [
        (
            "the knot",
            [
                "Stylish design hotel experience",
                "Trendy social atmosphere",
                "A younger, more social hotel feel",
            ],
            "Slightly weaker comfort and cleanliness confidence than the recommended pick.",
        ),
        (
            "gracery",
            [
                "Central Shinjuku location",
                "Famous Godzilla attraction",
                "Easy nightlife access",
            ],
            "Smaller average room experience than more comfort-focused options.",
        ),
        (
            "mitsui garden",
            [
                "Polished high-floor city hotel feel",
                "Food and shopping access around Ginza",
                "Easy first-time Tokyo base",
            ],
            "Less nightlife energy than Shinjuku/Shibuya.",
        ),
        (
            "jr kyushu",
            [
                "Short-hop access to Shinjuku Station",
                "Train-heavy sightseeing days",
                "Nightlife nearby without giving up practical logistics",
            ],
            "Busier surroundings than calmer hotel areas.",
        ),
        (
            "nohga",
            [
                "Museums, parks, and older Tokyo streets",
                "Better hotel value than Ginza or Toranomon",
                "Quieter local neighborhood feel",
            ],
            "Less polished and less central for shopping-heavy trips.",
        ),
        (
            "edition",
            [
                "Luxury hotel atmosphere",
                "Design-forward stay experience",
                "Premium dining and quieter evenings",
            ],
            "Higher price profile than most other options.",
        ),
        (
            "celestine",
            [
                "Calmer evenings away from the busiest districts",
                "More hotel-focused atmosphere",
                "Haneda-side routing and slower mornings",
            ],
            "Less useful for nightlife and dense shopping days.",
        ),
    ]
    for needle, strengths, tradeoff in known_profiles:
        if needle in name_key:
            personalized_strengths = [
                _hotel_priority_match_line(hotel, selected_preferences, neighborhood_name),
                *strengths,
            ]
            personalized_tradeoff = tradeoff
            return {"best_for": personalized_strengths[:3], "tradeoff": personalized_tradeoff}

    if "shinjuku" in area or "shinjuku" in name_key:
        add_best("Central Shinjuku location")
        add_best("Nightlife and late dining access")
    if "ginza" in area or "ginza" in name_key:
        add_best("Food and shopping access")
        add_best("Polished first-time Tokyo base")
    if "ueno" in area or "asakusa" in area or "ueno" in name_key or "asakusa" in name_key:
        add_best("Culture-focused sightseeing")
        add_best("Better value than central luxury areas")
    if "toranomon" in area or "roppongi" in area or "toranomon" in name_key:
        add_best("Upscale central Tokyo base")
        add_best("Premium dining access")
    if "tokyo bay" in area or "shiba" in area or "shiba" in name_key:
        add_best("Calmer hotel surroundings")
        add_best("Family-friendly pacing")
    if {"lower price", "moderate price", "value"} & tags:
        add_best("Keeps nightly cost more controlled")
    if "premium price" in tags or "higher price" in tags:
        add_best("Makes the hotel feel like part of the trip")

    rating = _hotel_numeric_value(hotel, "rating")
    review_count = _hotel_numeric_value(hotel, "review_count")
    if "luxury" in label:
        add_best("More emphasis on amenities and atmosphere")
    elif "value" in label:
        add_best("Practical stay without overpaying")
    elif "location" in label:
        add_best("Minimizes transit friction")
    elif rating and rating >= 4.4:
        add_best("Useful when guest review confidence matters")
    elif review_count and review_count >= 1000:
        add_best("Widely reviewed hotel choice")
    if not best_for:
        area_label = str(hotel.get("area") or neighborhood_name).split("·")[0].strip() or neighborhood_name
        add_best(f"Useful if {area_label} is where you want to spend more time")
        add_best(f"A possible backup to the {neighborhood_name} base with public Google listing visibility")

    best_for = [_hotel_priority_match_line(hotel, selected_preferences, neighborhood_name), *best_for]

    tradeoff = "Live rate and room details still need verification before booking."
    if recommended_hotel and not recommended:
        rec_rating = _hotel_numeric_value(recommended_hotel, "rating")
        if rating and rec_rating and rating < rec_rating - 0.2:
            tradeoff = "Public rating confidence is weaker than the recommended hotel."
        elif review_count and _hotel_numeric_value(recommended_hotel, "review_count") and review_count < _hotel_numeric_value(recommended_hotel, "review_count") * 0.5:
            tradeoff = "Fewer public reviews make this harder to trust."
        elif "premium price" in tags or "higher price" in tags:
            tradeoff = f"Likely pricier without enough extra benefit for {focus_text}."
        elif "shinjuku" in area and "shinjuku" not in str(recommended_hotel.get("area") or "").lower():
            tradeoff = f"Busier surroundings than Byable's {neighborhood_name} neighborhood choice."
        else:
            tradeoff = f"Less directly aligned with the {neighborhood_name} base Byable selected."
    elif recommended:
        tradeoff = f"Still verify live nightly rates and room type before booking this {neighborhood_name} stay."

    return {"best_for": best_for[:3], "tradeoff": tradeoff}


def _label_hotel_alternatives(alternatives):
    candidates = [dict(hotel) for hotel in alternatives[:3]]
    extra = [dict(hotel) for hotel in alternatives[3:]]
    label_rules = [
        (
            "Luxury alternative",
            lambda hotel: (
                (_hotel_factor_score(hotel, "Room Quality") or 0) * 1.2
                + (_hotel_numeric_value(hotel, "price_level") or 0) * 0.6
            ),
        ),
        (
            "Best value alternative",
            lambda hotel: (
                (_hotel_factor_score(hotel, "Value") or 0) * 1.4
                + (0.4 if (_hotel_numeric_value(hotel, "price_level") or 0) <= 2 else 0)
            ),
        ),
        (
            "Best location alternative",
            lambda hotel: (
                (_hotel_factor_score(hotel, "Location Match") or 0)
                + (_hotel_factor_score(hotel, "Transit Access") or 0)
            ),
        ),
    ]
    output = []
    used_ids = set()
    for label, scorer in label_rules:
        remaining = [
            (index, hotel)
            for index, hotel in enumerate(candidates)
            if index not in used_ids
        ]
        if not remaining:
            break
        selected_index, selected_hotel = max(remaining, key=lambda item: scorer(item[1]))
        used_ids.add(selected_index)
        hotel = dict(selected_hotel)
        item = dict(hotel)
        item["label"] = label
        item["type"] = label
        output.append(item)
    for index, hotel in enumerate(candidates):
        if index in used_ids:
            continue
        item = dict(hotel)
        item["label"] = "Alternative hotel"
        item["type"] = "Alternative hotel"
        output.append(item)
    for hotel in extra:
        item = dict(hotel)
        item["label"] = "Alternative hotel"
        item["type"] = "Alternative hotel"
        output.append(item)
    return output


def _normalize_key_fragment(value):
    raw = str(value or "").strip().lower()
    output = []
    previous_dash = False
    for char in raw:
        if char.isalnum():
            output.append(char)
            previous_dash = False
        elif not previous_dash:
            output.append("-")
            previous_dash = True
    return "".join(output).strip("-")[:72]


def _stable_hotel_identifier(hotel, index):
    google_id = hotel.get("google_place_id") or hotel.get("place_id") or hotel.get("id")
    if google_id:
        key_base = f"google-{google_id}"
    else:
        key_base = f"{hotel.get('name') or 'hotel'}-{index}"
    return _normalize_key_fragment(key_base) or f"hotel-{index}"


def _assign_hotel_identifiers(hotels):
    for index, hotel in enumerate(hotels):
        hotel["_hotel_key"] = _stable_hotel_identifier(hotel, index)
    return hotels


def _set_selected_hotel(hotel, neighborhood_name):
    selected = {
        "hotel_key": hotel.get("_hotel_key"),
        "name": hotel.get("name"),
        "area": hotel.get("area"),
        "address": hotel.get("address"),
        "rating": hotel.get("rating"),
        "review_count": hotel.get("review_count"),
        "price": hotel.get("price"),
        "neighborhood": neighborhood_name,
        "lat": hotel.get("lat"),
        "lng": hotel.get("lng"),
        "source": hotel.get("source") or "mock",
    }
    st.session_state["selected_hotel"] = selected
    st.session_state["active_hotel"] = selected
    st.session_state["trip_hotel"] = selected
    st.session_state["selected_hotel_key"] = hotel.get("_hotel_key")


def _selected_hotel_key():
    return st.session_state.get("selected_hotel_key") or (
        st.session_state.get("selected_hotel") or {}
    ).get("hotel_key")


def _set_hotel_active_modal(modal_type, hotel_key):
    st.session_state.pop("neighborhood_why_not_modal_open", None)
    st.session_state["hotels_active_modal"] = {
        "type": modal_type,
        "hotel_key": hotel_key,
    }


def _set_neighborhood_active_modal(neighborhood_name):
    st.session_state.pop("hotel_active_modal", None)
    st.session_state["hotels_active_modal"] = {
        "type": "neighborhood_why_not",
        "item": neighborhood_name,
    }


def _clear_hotel_active_modal():
    st.session_state.pop("hotels_active_modal", None)
    st.session_state.pop("hotel_active_modal", None)
    st.session_state.pop("neighborhood_why_not_modal_open", None)


def _hotel_factor_score(hotel, factor):
    scores = hotel.get("scores") or {}
    try:
        return float(scores.get(factor, (0, ""))[0])
    except (TypeError, ValueError, IndexError):
        return None


def _hotel_numeric_value(hotel, key):
    try:
        value = hotel.get(key)
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _hotel_comparison_rows(hotel, recommended_hotel):
    rows = []

    def add_row(label, selected, recommended, value_format, meaningful_delta):
        if selected is None or recommended is None:
            return
        delta = round(float(selected) - float(recommended), 1)
        rows.append(
            {
                "label": label,
                "selected": selected,
                "recommended": recommended,
                "delta": delta,
                "value": value_format,
                "meaningful_delta": meaningful_delta,
            }
        )

    add_row(
        "Google rating",
        _hotel_numeric_value(hotel, "rating"),
        _hotel_numeric_value(recommended_hotel, "rating"),
        lambda value: f"{float(value):.1f}/5",
        0.2,
    )
    add_row(
        "Review count",
        _hotel_numeric_value(hotel, "review_count"),
        _hotel_numeric_value(recommended_hotel, "review_count"),
        lambda value: f"{int(value):,}",
        150,
    )
    add_row(
        "Neighborhood score",
        _hotel_factor_score(hotel, "Location Match"),
        _hotel_factor_score(recommended_hotel, "Location Match"),
        lambda value: f"{float(value):.1f}/10",
        0.3,
    )
    add_row(
        "Stay score",
        _hotel_numeric_value(hotel, "score"),
        _hotel_numeric_value(recommended_hotel, "score"),
        lambda value: f"{int(round(float(value)))}",
        3,
    )
    for label, factor in (
        ("Room quality score", "Room Quality"),
        ("Transit score", "Transit Access"),
        ("Value score", "Value"),
        ("Safety score", "Safety"),
        ("Trip Fit", "Trip Fit"),
    ):
        add_row(
            label,
            _hotel_factor_score(hotel, factor),
            _hotel_factor_score(recommended_hotel, factor),
            lambda value: f"{float(value):.1f}/10",
            0.3,
        )
    return rows


def _hotel_delta_phrase(row, lower=True):
    delta = abs(float(row["delta"]))
    label = row["label"].lower()
    if row["label"] == "Stay score":
        amount = f"{int(round(delta))} points"
    elif row["label"] == "Review count":
        amount = f"{int(round(delta)):,} reviews"
    else:
        amount = f"{delta:.1f} points"
    direction = "lower" if lower else "higher"
    return f"{amount} {direction} on {label}"


def _comparison_row_by_label(rows, label):
    for row in rows:
        if row["label"] == label:
            return row
    return None


def _hotel_why_not_lists(hotel, recommended_hotel):
    selected_preferences, neighborhood_name = _hotel_context(hotel)
    focus_text = _traveler_focus_phrase(selected_preferences)
    name_key = str(hotel.get("name") or "").lower()
    area = str(hotel.get("area") or "").lower()
    label = str(hotel.get("label") or hotel.get("type") or "").lower()
    identity = _hotel_identity_profile(hotel, recommended_hotel=recommended_hotel)
    advantages = list(identity.get("best_for") or [])[:3]
    drawbacks = []

    if "gracery" in name_key:
        advantages = [
            f"Adds Kabukicho energy instead of the quieter {neighborhood_name} base",
            "Easy access to restaurants, entertainment, and late-night dining",
            "The iconic Godzilla-themed location",
        ]
        drawbacks = [
            "Busier and noisier surroundings",
            f"Less aligned with Byable's {neighborhood_name} neighborhood choice",
        ]
        take = f"Choose this if nightlife and being in the middle of the action matter more than the calmer {neighborhood_name} base."
    elif "the knot" in name_key:
        advantages = [
            "Adds a more design-forward stay",
            "Trendier social atmosphere",
            "Popular with younger travelers",
        ]
        drawbacks = [
            "Slightly weaker comfort and cleanliness signal",
            f"Less directly connected to the {neighborhood_name} stay strategy",
        ]
        take = f"Choose this if style and atmosphere matter more than the practical {neighborhood_name} fit."
    elif "edition" in name_key or "luxury" in label or "toranomon" in area:
        advantages = [
            "Adds a more premium hotel atmosphere",
            "Design-forward stay experience",
            "Quieter upscale evenings than Shinjuku",
        ]
        drawbacks = [
            "Higher nightly-rate profile",
            f"Less useful if the {neighborhood_name} choice was mainly about easy food, shopping, or transit",
        ]
        take = f"Choose this if the hotel experience itself matters more than optimizing around {neighborhood_name}."
    elif "nohga" in name_key or "ueno" in area or "asakusa" in area or "value" in label:
        advantages = [
            f"Better for {focus_text} if you prefer Ueno or Asakusa",
            "Museums, parks, and older Tokyo atmosphere",
            "A quieter local-feeling base",
        ]
        drawbacks = [
            "Less convenient for nightlife and shopping-heavy days",
            f"Less connected to the {neighborhood_name} neighborhood choice",
        ]
        take = f"Choose this if culture and value matter more than staying in {neighborhood_name}."
    elif "jr kyushu" in name_key or "shinjuku" in area or "location" in label:
        advantages = [
            "Strong Shinjuku Station access",
            "Easy restaurants and late-night food nearby",
            "Practical base for train-heavy sightseeing",
        ]
        drawbacks = [
            "Busier station-area surroundings",
            f"Less calm than the {neighborhood_name} choice if Byable picked it for a smoother stay",
        ]
        take = f"Choose this if transit access and Shinjuku energy matter more than the {neighborhood_name} fit Byable selected."
    elif "celestine" in name_key or "shiba" in area or "tokyo bay" in area:
        advantages = [
            f"Creates a calmer hotel base than {neighborhood_name}",
            "A more hotel-focused atmosphere",
            "Useful Haneda-side routing",
        ]
        drawbacks = [
            "Less ideal for nightlife or shopping-heavy days",
            f"Farther from the activity density that made {neighborhood_name} attractive",
        ]
        take = f"Choose this if slower mornings and quiet matter more than the activity density around {neighborhood_name}."
    else:
        if not advantages:
            advantages = [
                f"A straightforward base for {focus_text}",
                f"A possible alternative to Byable's {neighborhood_name} neighborhood choice",
            ]
        if "ginza" in area:
            drawbacks.append("Less nightlife-focused than Shinjuku options")
            take = f"Choose this if food, shopping, and polished streets matter more than staying in {neighborhood_name}."
        elif "shinjuku" in area:
            drawbacks.append("Busier surroundings than calmer hotel districts")
            take = f"Choose this if action and convenience matter more than the {neighborhood_name} neighborhood fit."
        elif "ueno" in area or "asakusa" in area:
            drawbacks.append("Less convenient for shopping-heavy or nightlife-focused days")
            take = f"Choose this if older Tokyo atmosphere and value matter more than {neighborhood_name}."
        else:
            drawbacks.append(f"Less clearly connected to {focus_text} and the {neighborhood_name} base")
            take = f"Choose this if its location or atmosphere fits your travel style better than {recommended_hotel['name']}."

    return {
        "summary": take,
        "advantages": advantages[:3],
        "drawbacks": drawbacks[:2],
    }


def _hotel_stay_expectations(hotel):
    selected_preferences, neighborhood_name = _hotel_context(hotel)
    focus_text = _traveler_focus_phrase(selected_preferences)
    name_key = str(hotel.get("name") or "").lower()
    area = str(hotel.get("area") or "").lower()
    label = str(hotel.get("label") or hotel.get("type") or "").lower()
    identity = _hotel_identity_profile(hotel)
    strengths = []
    tradeoffs = []

    def add_strength(text):
        if text and text not in strengths:
            strengths.append(text)

    def add_tradeoff(text):
        if text and text not in tradeoffs:
            tradeoffs.append(text)

    if "gracery" in name_key:
        strengths = [
            f"Works well for {focus_text} if you want Kabukicho nightlife instead of {neighborhood_name}",
            "Easy restaurants, entertainment, and late-night energy",
            "Memorable Godzilla-themed location",
        ]
        tradeoffs = [
            "Busier surroundings than quieter Tokyo hotel areas",
            f"Less tied to Byable's {neighborhood_name} neighborhood choice",
        ]
        best_for = f"Best for travelers who want nightlife at the door more than the calmer {neighborhood_name} base."
    elif "the knot" in name_key:
        strengths = [
            "Adds a design-forward stay",
            "Trendier social feel than a standard business hotel",
            "Good fit for younger travelers or style-focused stays",
        ]
        tradeoffs = [
            "Less comfort-focused than more polished hotel picks",
            f"Less directly connected to the {neighborhood_name} stay strategy",
        ]
        best_for = f"Best for travelers who care more about style and atmosphere than maximizing the {neighborhood_name} fit."
    elif "edition" in name_key or "luxury" in label or "toranomon" in area:
        strengths = [
            "Adds a premium hotel atmosphere",
            "Design-forward stay experience",
            "Quieter upscale evenings than Shinjuku",
            "Good fit when the hotel is part of the trip, not just a place to sleep",
        ]
        tradeoffs = [
            "Likely a higher nightly-rate choice",
            f"May pull the stay away from the practical advantages of {neighborhood_name}",
        ]
        best_for = f"Best for travelers who want the stay itself to feel elevated and polished."
    elif "nohga" in name_key or "ueno" in area or "asakusa" in area or "value" in label:
        strengths = [
            f"Works well for {focus_text} if Ueno or Asakusa feels more appealing than {neighborhood_name}",
            "Easy access to museums, parks, temples, and older Tokyo atmosphere",
            "Usually better hotel value than premium central districts",
            "Quieter local-feeling base",
        ]
        tradeoffs = [
            "Less convenient for nightlife and shopping-heavy days",
            f"Less aligned with Byable's selected {neighborhood_name} neighborhood",
        ]
        best_for = f"Best for travelers who want culture, value, and a calmer Tokyo base."
    elif "jr kyushu" in name_key or "shinjuku" in area or "location" in label:
        strengths = [
            "Easy Shinjuku rail access",
            "Convenient base for day trips around Tokyo",
            "Restaurants and late-night food nearby",
            "Reliable choice for first-time visitors who want logistics to be simple",
        ]
        tradeoffs = [
            "Busier area during evenings",
            f"May feel less calm than the {neighborhood_name} stay Byable selected",
        ]
        best_for = "Best for travelers who want a convenient Tokyo base without spending time optimizing logistics."
    elif "celestine" in name_key or "shiba" in area or "tokyo bay" in area:
        strengths = [
            f"Creates a calmer base than {neighborhood_name}",
            "Useful access for Haneda-side routing",
            "Better fit for slower mornings and quieter evenings",
        ]
        tradeoffs = [
            "Less convenient for nightlife and shopping-heavy days",
            f"Farther from the reasons Byable selected {neighborhood_name}",
        ]
        best_for = "Best for travelers who want a quieter stay and do not need to be in the middle of the action."
    else:
        for strength in identity.get("best_for", [])[:3]:
            add_strength(strength)
        if "ginza" in area:
            add_strength(f"Convenient food, shopping, and polished streets near {neighborhood_name}")
            add_tradeoff("Less nightlife energy than Shinjuku")
            best_for = "Best for travelers who want food, shopping, and a polished central base."
        elif "shinjuku" in area:
            add_strength("Shinjuku restaurants and train connections close by")
            add_tradeoff("Busier surroundings than calmer hotel neighborhoods")
            best_for = "Best for travelers who want action and convenience close by."
        elif "ueno" in area or "asakusa" in area:
            add_strength("Museums, temples, parks, and older Tokyo close by")
            add_tradeoff("Less ideal for shopping-heavy or nightlife-focused days")
            best_for = "Best for travelers who want culture and value over nightlife."
        else:
            add_strength(f"A straightforward hotel base in {neighborhood_name} for {focus_text}")
            add_strength(f"Public listing visibility helps evaluate it against the {neighborhood_name} recommendation")
            add_tradeoff(f"Less specifically matched to {focus_text} than the strongest {neighborhood_name} pick")
            best_for = f"Best for travelers who already prefer this location over {neighborhood_name}."

        add_tradeoff(identity.get("tradeoff"))
        strengths = strengths[:5]
        tradeoffs = tradeoffs[:3]

    if not strengths:
        strengths = list(identity.get("best_for") or [])[:3]
    if not tradeoffs:
        tradeoffs = [identity.get("tradeoff") or "Live rate and room type still need verification before booking."]

    return {
        "strengths": strengths[:5],
        "tradeoffs": tradeoffs[:3],
        "best_for": best_for,
    }


def _hotel_advisor_badge(hotel, recommended=False):
    selected_preferences, _ = _hotel_context(hotel)
    focus_text = _traveler_focus_phrase(selected_preferences).title()
    if recommended:
        return "Best Overall Match"

    label = str(hotel.get("label") or hotel.get("type") or "").lower()
    name_key = str(hotel.get("name") or "").lower()
    area = str(hotel.get("area") or "").lower()

    if "value" in label or "nohga" in name_key or "ueno" in area or "asakusa" in area:
        return "Best Value"
    if "luxury" in label or "edition" in name_key or "toranomon" in area:
        return f"Best Luxury Option For {focus_text}"
    if "nightlife" in label or "gracery" in name_key or "kabukicho" in area:
        return "Best Nightlife Option"
    if "location" in label or "jr kyushu" in name_key or "shinjuku" in area:
        return "Best Transit Access"
    if "ginza" in area or "mitsui garden" in name_key:
        return f"Best Base For {focus_text}"
    if "celestine" in name_key or "shiba" in area or "tokyo bay" in area:
        return "Best Quiet Stay"
    return "Best Distinctive Stay"


def _hotel_choose_sentence(hotel, recommended=False):
    selected_preferences, neighborhood_name = _hotel_context(hotel)
    priority_text = _priority_phrase(selected_preferences)
    if recommended:
        return f"Because you picked {priority_text}, this keeps you anchored in Byable's {neighborhood_name} neighborhood choice."

    name_key = str(hotel.get("name") or "").lower()
    area = str(hotel.get("area") or "").lower()
    label = str(hotel.get("label") or hotel.get("type") or "").lower()

    if "gracery" in name_key or "kabukicho" in area:
        return f"Because you picked {priority_text}, choose this only if Kabukicho nightlife beats the {neighborhood_name} base."
    if "the knot" in name_key:
        return f"Because you picked {priority_text}, choose this if a trendier social hotel matters more than the {neighborhood_name} fit."
    if "edition" in name_key or "luxury" in label or "toranomon" in area:
        return f"Because you picked {priority_text}, choose this if a polished luxury stay matters more than staying closest to {neighborhood_name}."
    if "nohga" in name_key or "ueno" in area or "asakusa" in area or "value" in label:
        return f"Because you picked {priority_text}, choose this if culture and value beat the convenience of {neighborhood_name}."
    if "jr kyushu" in name_key or "location" in label or "shinjuku" in area:
        return f"Because you picked {priority_text}, choose this if Shinjuku rail access is more useful than the selected {neighborhood_name} base."
    if "celestine" in name_key or "shiba" in area or "tokyo bay" in area:
        return f"Because you picked {priority_text}, choose this if quiet evenings matter more than the {neighborhood_name} neighborhood energy."
    if "ginza" in area or "mitsui garden" in name_key:
        return f"Because you picked {priority_text}, choose this for food, shopping, and polished streets around {neighborhood_name}."
    return f"Because you picked {priority_text}, choose this only if its location feels more useful than {neighborhood_name}."


def _hotel_card_summary(hotel, recommended=False):
    selected_preferences, neighborhood_name = _hotel_context(hotel)
    focus_text = _traveler_focus_phrase(selected_preferences)
    if recommended:
        return str(hotel.get("why") or f"Byable recommends this stay because {neighborhood_name} is a strong base for {focus_text}.")

    name_key = str(hotel.get("name") or "").lower()
    area = str(hotel.get("area") or "").lower()
    label = str(hotel.get("label") or hotel.get("type") or "").lower()

    if "gracery" in name_key:
        return f"The action-heavy alternative to {neighborhood_name}, with more nightlife and late dining."
    if "the knot" in name_key:
        return f"The design-forward alternative if atmosphere matters more than the practical {neighborhood_name} base."
    if "edition" in name_key or "luxury" in label or "toranomon" in area:
        return "The premium alternative if the stay itself should feel like a major part of the trip."
    if "nohga" in name_key or "ueno" in area or "asakusa" in area or "value" in label:
        return f"The culture-and-value alternative to {neighborhood_name}, with an older Tokyo feel."
    if "jr kyushu" in name_key or "location" in label or "shinjuku" in area:
        return "The transit-first alternative if easy rail access matters more than a calmer setting."
    if "celestine" in name_key or "shiba" in area or "tokyo bay" in area:
        return f"The quieter alternative if you want calmer evenings than {neighborhood_name} offers."
    return f"An alternate fit if this location feels better than {neighborhood_name} for {focus_text}."


def _score_neighborhood(profile, preferences):
    selected = set(preferences or DEFAULT_HOTEL_PREFERENCES)
    tags = set(profile.get("preference_tags") or [])
    matches = sorted(selected & tags)
    match_ratio = len(matches) / max(1, min(len(selected), 3))
    preference_score = 6.2 + match_ratio * 3.1
    score_10 = (
        profile["base_score"] * 0.32
        + preference_score * 0.34
        + profile["convenience"] * 0.20
        + profile["value"] * 0.14
    )
    score = int(round(max(72, min(96, score_10 * 10))))
    return {
        **profile,
        "score": score,
        "matched_preferences": matches,
    }


def _rank_neighborhoods(preferences, neighborhood_profiles=None):
    if neighborhood_profiles is None:
        neighborhood_profiles = NEIGHBORHOOD_PROFILES
    ranked = [_score_neighborhood(profile, preferences) for profile in neighborhood_profiles]
    return sorted(ranked, key=lambda item: item["score"], reverse=True)


def _recommendation_for_neighborhood(scored_neighborhood, neighborhood_to_recommendation=None, mock_recommendations=None):
    if neighborhood_to_recommendation is None:
        neighborhood_to_recommendation = NEIGHBORHOOD_TO_RECOMMENDATION
    if mock_recommendations is None:
        mock_recommendations = MOCK_RECOMMENDATIONS
    key = neighborhood_to_recommendation.get(scored_neighborhood["name"])
    if key and key in mock_recommendations:
        return mock_recommendations[key]
    return next(iter(mock_recommendations.values()))


def _neighborhood_pick_bullets(scored_neighborhood, alternatives, preferences):
    preference_text = ", ".join(scored_neighborhood.get("matched_preferences") or (preferences or DEFAULT_HOTEL_PREFERENCES)[:2])
    bullets = [
        f"Matches your selected priorities: {preference_text}.",
        f"Convenience score is {float(scored_neighborhood['convenience']):.1f}/10 for transit and walkable trip days.",
    ]
    if alternatives:
        strongest_alternative = alternatives[0]
        bullets.append(
            f"Tradeoff: {strongest_alternative['name']} is better for {strongest_alternative['best_for'].lower()}, but {scored_neighborhood['name']} fits your current priorities better."
        )
    else:
        bullets.append(f"Tradeoff: {scored_neighborhood['tradeoff']}")
    return bullets[:3]


def _neighborhood_tradeoff_bullets(neighborhood, recommended_neighborhood):
    recommended_name = recommended_neighborhood.get("name", "")
    selected = set(st.session_state.get("hotel_preferences") or DEFAULT_HOTEL_PREFERENCES)
    neighborhood_tags = set(neighborhood.get("preference_tags") or [])
    bullets = []
    if "Nightlife" in selected and "Nightlife" not in neighborhood_tags:
        bullets.append("Less nightlife and late dining.")
    if {"Food", "Shopping", "Walkability"} & selected and not ({"Shopping", "Walkability", "Food"} & neighborhood_tags):
        bullets.append("Less ideal for shopping-heavy, food-focused days.")
    if "Culture" in selected and "Culture" not in neighborhood_tags:
        bullets.append("Fewer museums, cultural sights, and historic streets nearby.")
    if "Luxury" in selected and "Luxury" not in neighborhood_tags:
        bullets.append("Fewer premium hotels and polished dining clusters.")
    if "Relaxation" in selected and "Relaxation" not in neighborhood_tags:
        bullets.append("Busier evenings and less calm hotel surroundings.")
    if "Lowest Price" in selected and "Lowest Price" not in neighborhood_tags:
        bullets.append("Usually weaker hotel value than budget-oriented neighborhoods.")
    if not bullets:
        bullets.append(neighborhood.get("tradeoff") or f"{recommended_name} fits the current trip profile better.")
    return bullets[:2]


def _neighborhood_why_not_lists(neighborhood, recommended_neighborhood):
    advantages = list(neighborhood.get("good_fit") or [])[:2]
    drawbacks = _neighborhood_tradeoff_bullets(neighborhood, recommended_neighborhood)
    selected_preferences = st.session_state.get("hotel_preferences") or DEFAULT_HOTEL_PREFERENCES
    preference_text = ", ".join(selected_preferences[:3])
    take = f"Because you selected {preference_text}, {recommended_neighborhood['name']} is a stronger base for this trip."
    return {
        "advantages": advantages[:2] or [f"Good for {neighborhood['best_for'].lower()}."],
        "drawbacks": drawbacks[:2],
        "take": take,
    }


def _select_alternative_neighborhoods(ranked_neighborhoods, recommended_neighborhood):
    preferred_names = ["Shinjuku / Shibuya", "Ueno / Asakusa", "Ginza / Toranomon"]
    selected = []
    used = {recommended_neighborhood["name"]}
    by_name = {item["name"]: item for item in ranked_neighborhoods}
    for name in preferred_names:
        if name in by_name and name not in used:
            selected.append(by_name[name])
            used.add(name)
    for item in ranked_neighborhoods:
        if len(selected) >= 3:
            break
        if item["name"] not in used:
            selected.append(item)
            used.add(item["name"])
    return selected[:3]


def _inject_hotel_styles():
    st.markdown(
        """
        <style>
        .hotel-page-shell {
            color: #e5e7eb;
        }
        .hotel-kicker {
            color: rgba(199,210,254,0.82);
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 7px;
        }
        .hotel-title {
            color: #fff;
            font-size: 28px;
            font-weight: 900;
            letter-spacing: -0.8px;
            margin-bottom: 5px;
        }
        .hotel-subtitle {
            color: rgba(255,255,255,0.56);
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 18px;
        }
        .hotel-card {
            border: 1px solid rgba(129,140,248,0.18);
            border-radius: 18px;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.13), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018)),
                rgba(7,9,15,0.92);
            padding: 17px 18px;
            margin-bottom: 14px;
            box-shadow: 0 18px 48px rgba(0,0,0,0.16);
        }
        .hotel-card.recommended {
            border-color: rgba(196,181,253,0.44);
            background:
                radial-gradient(circle at top left, rgba(139,92,246,0.22), transparent 36%),
                linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02)),
                rgba(8,10,18,0.96);
            box-shadow: 0 22px 74px rgba(99,102,241,0.20);
        }
        .hotel-card.selected {
            border-color: rgba(52,211,153,0.54);
            box-shadow: 0 20px 64px rgba(16,185,129,0.15);
        }
        .hotel-card.alt {
            padding: 14px 15px;
            margin-bottom: 11px;
            background:
                linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015)),
                rgba(7,9,15,0.88);
        }
        .hotel-card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 12px;
        }
        .hotel-hero-image,
        .hotel-hero-placeholder {
            width: 100%;
            min-height: 145px;
            border-radius: 14px;
            margin-bottom: 13px;
            background-size: cover;
            background-position: center;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .hotel-hero-placeholder {
            display: flex;
            align-items: flex-end;
            padding: 13px;
            background:
                radial-gradient(circle at 20% 20%, rgba(129,140,248,0.20), transparent 38%),
                linear-gradient(135deg, rgba(15,23,42,0.92), rgba(3,7,18,0.96));
        }
        .hotel-hero-placeholder span {
            color: rgba(255,255,255,0.70);
            font-size: 12px;
            font-weight: 850;
        }
        .hotel-name {
            color: #fff;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: -0.2px;
            line-height: 1.25;
        }
        .hotel-area {
            color: rgba(255,255,255,0.44);
            font-size: 12px;
            margin-top: 4px;
        }
        .neighborhood-best-for {
            color: rgba(255,255,255,0.66);
            font-size: 12px;
            line-height: 1.4;
            margin-top: 5px;
        }
        .neighborhood-best-for strong {
            color: rgba(255,255,255,0.88);
            font-weight: 900;
        }
        .hotel-score {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border-radius: 999px;
            padding: 5px 10px;
            color: #c7d2fe;
            background: rgba(129,140,248,0.12);
            border: 1px solid rgba(129,140,248,0.22);
            font-size: 12px;
            font-weight: 900;
        }
        .hotel-price {
            color: #fff;
            font-size: 25px;
            font-weight: 950;
            letter-spacing: -0.8px;
            text-align: right;
        }
        .hotel-price-sub {
            color: rgba(255,255,255,0.40);
            font-size: 11px;
            text-align: right;
        }
        .hotel-rating-signal {
            color: #fff;
            font-size: 25px;
            font-weight: 950;
            letter-spacing: -0.5px;
            text-align: right;
        }
        .hotel-review-signal {
            color: rgba(255,255,255,0.48);
            font-size: 11px;
            font-weight: 750;
            text-align: right;
            margin-bottom: 6px;
        }
        .hotel-price-chip {
            display: inline-flex;
            justify-content: center;
            white-space: nowrap;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.10);
            background: rgba(255,255,255,0.045);
            color: rgba(255,255,255,0.62);
            padding: 4px 8px;
            font-size: 10px;
            font-weight: 850;
            margin-bottom: 7px;
        }
        .hotel-copy {
            color: rgba(255,255,255,0.72);
            font-size: 13px;
            line-height: 1.48;
            margin-bottom: 11px;
        }
        .hotel-win-card {
            border: 1px solid rgba(129,140,248,0.18);
            border-radius: 16px;
            background:
                linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.016)),
                rgba(7,9,15,0.88);
            padding: 11px 14px;
            margin: -4px 0 13px;
        }
        .hotel-win-grid {
            display: grid;
            grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.9fr);
            gap: 14px;
        }
        .hotel-win-list {
            color: rgba(255,255,255,0.65);
            font-size: 12px;
            line-height: 1.38;
            margin: 0;
            padding-left: 1rem;
        }
        .hotel-win-list li {
            margin-bottom: 2px;
        }
        .hotel-review-box {
            border: 1px solid rgba(129,140,248,0.12);
            border-radius: 13px;
            background: rgba(255,255,255,0.030);
            padding: 9px 10px;
            margin: 10px 0;
        }
        .hotel-review-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .hotel-review-heading {
            color: rgba(255,255,255,0.78);
            font-size: 11px;
            font-weight: 850;
            margin-bottom: 4px;
        }
        .hotel-review-count {
            color: rgba(255,255,255,0.46);
            font-size: 11px;
            margin-top: 6px;
        }
        .hotel-factor-strip {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: center;
            border: 1px solid rgba(129,140,248,0.14);
            border-radius: 13px;
            background: rgba(99,102,241,0.065);
            color: rgba(255,255,255,0.66);
            font-size: 12px;
            font-weight: 800;
            padding: 8px 10px;
            margin: 8px 0 10px;
        }
        .hotel-factor-strip strong {
            color: #c7d2fe;
            font-size: 13px;
            font-weight: 950;
        }
        .hotel-section-label {
            color: #c7d2fe;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            margin: 10px 0 6px;
        }
        .hotel-list {
            color: rgba(255,255,255,0.62);
            font-size: 12px;
            line-height: 1.45;
            margin: 0;
            padding-left: 1rem;
        }
        .hotel-chip-row {
            display: flex;
            gap: 7px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .hotel-chip {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.10);
            background: rgba(255,255,255,0.045);
            color: rgba(255,255,255,0.66);
            padding: 4px 9px;
            font-size: 11px;
            font-weight: 750;
        }
        .hotel-chip.primary {
            color: #dbeafe;
            background: linear-gradient(135deg, rgba(99,102,241,0.25), rgba(14,165,233,0.11));
            border-color: rgba(165,180,252,0.20);
        }
        .hotel-recommended-label {
            display: inline-flex;
            width: fit-content;
            border-radius: 999px;
            border: 1px solid rgba(196,181,253,0.32);
            background: linear-gradient(135deg, rgba(139,92,246,0.28), rgba(99,102,241,0.12));
            color: rgba(238,242,255,0.94);
            padding: 4px 9px;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .hotel-selected-label {
            display: inline-flex;
            width: fit-content;
            border-radius: 999px;
            border: 1px solid rgba(52,211,153,0.34);
            background: rgba(16,185,129,0.14);
            color: rgba(209,250,229,0.96);
            padding: 4px 9px;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin: 0 0 6px 6px;
        }
        .hotel-advisor-badge {
            display: inline-flex;
            width: fit-content;
            border-radius: 999px;
            border: 1px solid rgba(52,211,153,0.28);
            background: linear-gradient(135deg, rgba(16,185,129,0.20), rgba(99,102,241,0.12));
            color: rgba(209,250,229,0.96);
            padding: 4px 9px;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin: 5px 0 6px;
        }
        .hotel-choice-line {
            color: rgba(255,255,255,0.74);
            font-size: 12px;
            line-height: 1.42;
            margin-top: 6px;
            max-width: 620px;
        }
        div[data-testid="stMultiSelect"] [data-baseweb="select"] > div {
            border: 1px solid rgba(129,140,248,0.18) !important;
            background: rgba(15,23,42,0.86) !important;
            border-radius: 14px !important;
            color: rgba(255,255,255,0.88) !important;
        }
        div[data-testid="stMultiSelect"] span,
        div[data-testid="stMultiSelect"] div {
            color: rgba(255,255,255,0.86) !important;
        }
        div[data-testid="stMultiSelect"] [data-baseweb="tag"] {
            background: rgba(99,102,241,0.20) !important;
            border: 1px solid rgba(165,180,252,0.20) !important;
        }
        .hotel-score-panel {
            border: 1px solid rgba(129,140,248,0.16);
            border-radius: 16px;
            background:
                radial-gradient(circle at top left, rgba(99,102,241,0.10), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.016)),
                rgba(7,9,15,0.90);
            padding: 13px 14px;
        }
        .hotel-score-row {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 13px;
            background: rgba(255,255,255,0.035);
            padding: 10px 11px;
            margin-bottom: 9px;
        }
        .hotel-score-row-top {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            color: rgba(255,255,255,0.86);
            font-size: 12px;
            font-weight: 850;
            margin-bottom: 5px;
        }
        .hotel-score-note {
            color: rgba(255,255,255,0.52);
            font-size: 12px;
            line-height: 1.45;
        }
        @media (max-width: 760px) {
            .hotel-card-top {
                flex-direction: column;
            }
            .hotel-win-grid {
                grid-template-columns: 1fr;
            }
            .hotel-review-grid {
                grid-template-columns: 1fr;
            }
            .hotel-price,
            .hotel-price-sub,
            .hotel-rating-signal,
            .hotel-review-signal {
                text-align: left;
            }
        }
        .nbh-breakdown {
            margin-top: 7px;
            text-align: right;
        }
        .nbh-breakdown > summary {
            color: rgba(199,210,254,0.60);
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            cursor: pointer;
            list-style: none;
            outline: none;
            user-select: none;
        }
        .nbh-breakdown > summary::-webkit-details-marker { display: none; }
        .nbh-breakdown > summary::marker { display: none; }
        .nbh-breakdown[open] > summary {
            color: rgba(199,210,254,0.90);
            margin-bottom: 8px;
        }
        .nbh-bd-grid {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 3px 10px;
            font-size: 11px;
            text-align: left;
            margin-top: 6px;
        }
        .nbh-bd-label {
            color: rgba(255,255,255,0.55);
            font-weight: 700;
        }
        .nbh-bd-val {
            color: #c7d2fe;
            font-weight: 850;
            text-align: right;
            white-space: nowrap;
        }
        .nbh-bd-divider {
            grid-column: 1 / -1;
            border-top: 1px solid rgba(255,255,255,0.07);
            margin: 3px 0;
        }
        .nbh-bd-total-label {
            color: rgba(255,255,255,0.88);
            font-size: 11px;
            font-weight: 900;
        }
        .nbh-bd-total-val {
            color: #c7d2fe;
            font-size: 12px;
            font-weight: 950;
            text-align: right;
        }
        .nbh-bd-priorities {
            display: flex;
            flex-wrap: wrap;
            gap: 3px 8px;
            margin-top: 7px;
            font-size: 10px;
            text-align: left;
        }
        .nbh-bd-match {
            color: rgba(110,231,183,0.88);
            font-weight: 850;
        }
        .nbh-bd-miss {
            color: rgba(255,255,255,0.30);
            font-weight: 700;
        }
        .hotel-compact-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
        }
        .hotel-compact-main {
            flex: 1;
            min-width: 0;
        }
        .hotel-compact-signal {
            flex-shrink: 0;
            text-align: right;
        }
        .hotel-compact-reason {
            color: rgba(255,255,255,0.62);
            font-size: 12px;
            line-height: 1.45;
            margin-top: 3px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _score_badge(score, label="Stay Score"):
    return f'<span class="hotel-score">{html.escape(label)}: {int(score)}</span>'


def _neighborhood_score_breakdown_html(neighborhood, preferences):
    selected = list(preferences or DEFAULT_HOTEL_PREFERENCES)
    selected_set = set(selected)
    tags = set(neighborhood.get("preference_tags") or [])
    matches = sorted(selected_set & tags)
    misses = sorted(selected_set - tags)
    match_ratio = len(matches) / max(1, min(len(selected_set), 3))
    preference_score = round(6.2 + match_ratio * 3.1, 1)

    factors = [
        ("Priority fit", preference_score),
        ("Quality", round(float(neighborhood.get("base_score") or 8.0), 1)),
        ("Transit", round(float(neighborhood.get("convenience") or 8.0), 1)),
        ("Value", round(float(neighborhood.get("value") or 7.5), 1)),
    ]
    rows_html = "".join(
        f'<div class="nbh-bd-label">{html.escape(label)}</div>'
        f'<div class="nbh-bd-val">{value:.1f}</div>'
        for label, value in factors
    )
    priority_html = "".join(
        f'<span class="nbh-bd-match">✓ {html.escape(p)}</span>' for p in matches
    ) + "".join(
        f'<span class="nbh-bd-miss">– {html.escape(p)}</span>' for p in misses
    )
    priority_row = f'<div class="nbh-bd-priorities">{priority_html}</div>' if priority_html else ""
    return (
        f'<details class="nbh-breakdown">'
        f'<summary>Score breakdown</summary>'
        f'<div class="nbh-bd-grid">'
        f'{rows_html}'
        f'<div class="nbh-bd-divider"></div><div></div>'
        f'<div class="nbh-bd-total-label">Overall match</div>'
        f'<div class="nbh-bd-total-val">{int(neighborhood["score"])}</div>'
        f'</div>'
        f'{priority_row}'
        f'</details>'
    )


def _chips(tags, primary_first=False):
    output = []
    for index, tag in enumerate(tags):
        css = "hotel-chip primary" if primary_first and index == 0 else "hotel-chip"
        output.append(f'<span class="{css}">{html.escape(str(tag))}</span>')
    return "".join(output)


def _neighborhood_tags(neighborhood):
    best_for = str(neighborhood.get("best_for") or "").lower()
    preference_tags = set(neighborhood.get("preference_tags") or [])
    tags = []

    def add(condition, label):
        if condition and label not in tags:
            tags.append(label)

    add("Culture" in preference_tags or any(word in best_for for word in ("culture", "museum", "temple")), "🏛 Culture")
    add("Food" in preference_tags or any(word in best_for for word in ("food", "dining", "restaurant")), "🍜 Food")
    add("Shopping" in preference_tags or "shopping" in best_for, "🛍 Shopping")
    add("Nightlife" in preference_tags or any(word in best_for for word in ("nightlife", "late")), "🌃 Nightlife")
    add("Luxury" in preference_tags or any(word in best_for for word in ("luxury", "premium", "design")), "💎 Luxury")
    add("Lowest Price" in preference_tags or any(word in best_for for word in ("lower", "value", "budget")), "💰 Value")
    add(
        float(neighborhood.get("convenience") or 0) >= 8.5
        or any(word in best_for for word in ("station", "transit", "access")),
        "🚇 Transit",
    )
    return tags[:3]


def _neighborhood_recommendation_line(neighborhood):
    name = neighborhood.get("name", "")
    lines = {
        "Ueno / Asakusa": "Choose this if you want traditional Tokyo and better hotel value over nightlife.",
        "Ginza / Toranomon": "Choose this if you want an upscale, quieter Tokyo base.",
        "Ginza / Yurakucho": "Choose this if you want food, shopping, and convenience without the intensity of Shinjuku.",
        "Shinjuku / Shibuya": "Choose this if you want nightlife, late dining, and the most energetic Tokyo base.",
        "Tokyo Bay / Shiba": "Choose this if you want calmer evenings, family pacing, and easier Haneda-side routing.",
    }
    return lines.get(name, f"Choose this if you want {str(neighborhood.get('best_for') or 'this stay style').lower()}.")


def _hotel_card_signal_html(hotel):
    if hotel.get("price") is not None:
        price_sub = hotel.get("price_subtitle") or "estimated nightly rate"
        return "".join(
            [
                f'<div class="hotel-price">{_money(hotel["price"])}</div>',
                f'<div class="hotel-price-sub">{html.escape(price_sub)}</div>',
            ]
        )

    rating = _rating_text(hotel)
    if rating:
        return "".join(
            [
                f'<div class="hotel-rating-signal">{html.escape(rating)}</div>',
                f'<div class="hotel-review-signal">{html.escape(_review_count_text(hotel))}</div>',
                '<div class="hotel-price-chip">Price unavailable</div>',
            ]
        )

    return "".join(
        [
            '<div class="hotel-price-chip">Price unavailable</div>',
        ]
    )


def _hotel_photo_html(hotel):
    image_uri = get_google_place_photo_data_uri(hotel.get("photo_name")) if hotel.get("photo_name") else ""
    if image_uri:
        return f'<div class="hotel-hero-image" style="background-image: linear-gradient(180deg, rgba(2,6,23,0.05), rgba(2,6,23,0.48)), url({html.escape(image_uri)});"></div>'
    area = html.escape(str(hotel.get("area") or "Tokyo stay"))
    return f'<div class="hotel-hero-placeholder"><span>{area}</span></div>'


def _review_summary(hotel):
    texts = [str(item).lower() for item in hotel.get("review_texts") or [] if item]
    joined = " ".join(texts)
    positive_checks = [
        (("location", "station", "walk", "near", "convenient"), "Convenient location and easy access"),
        (("clean", "cleanliness", "spotless"), "Clean, well-kept rooms"),
        (("staff", "service", "helpful", "friendly"), "Helpful service"),
        (("view", "skyline", "tower"), "Memorable views"),
        (("breakfast", "restaurant", "food"), "Food and breakfast convenience"),
        (("quiet", "calm", "peaceful"), "Quieter stay atmosphere"),
    ]
    negative_checks = [
        (("small", "tiny", "compact"), "Compact rooms"),
        (("noise", "noisy", "loud"), "Noise or busier surroundings"),
        (("expensive", "price", "cost"), "Higher nightly cost"),
        (("far", "transfer", "walk"), "Some transit or walking friction"),
        (("dated", "old"), "Less polished room feel"),
    ]

    positives = [
        label
        for keywords, label in positive_checks
        if any(keyword in joined for keyword in keywords)
    ]
    negatives = [
        label
        for keywords, label in negative_checks
        if any(keyword in joined for keyword in keywords)
    ]

    if not positives:
        identity = _hotel_identity_profile(hotel)
        positives = list(identity.get("best_for") or [])[:2]
    if not negatives:
        negatives = [str(_hotel_identity_profile(hotel).get("tradeoff") or "Live room details still need verification.")]

    return {
        "positives": positives[:3],
        "negatives": negatives[:2],
        "review_count": _review_count_text(hotel),
    }


def _review_summary_html(hotel):
    summary = _review_summary(hotel)
    return "".join(
        [
            '<div class="hotel-review-box">',
            '<div class="hotel-section-label">Review summary</div>',
            '<div class="hotel-review-grid">',
            '<div><div class="hotel-review-heading">Most mentioned positives</div>',
            f'<ul class="hotel-list">{_escape_list(summary["positives"])}</ul></div>',
            '<div><div class="hotel-review-heading">Most mentioned negatives</div>',
            f'<ul class="hotel-list">{_escape_list(summary["negatives"])}</ul></div>',
            "</div>",
            f'<div class="hotel-review-count">Review count: {html.escape(summary["review_count"])}</div>',
            "</div>",
        ]
    )


def _render_preferences():
    with st.container(border=True):
        st.markdown(
            """
            <div class="hotel-kicker">Hotel preferences</div>
            <div class="hotel-name">What's most important for this trip?</div>
            <div class="hotel-area">Pick the signals Byable should use to rank the Tokyo hotel set.</div>
            """,
            unsafe_allow_html=True,
        )
        selected = st.multiselect(
            "Hotel priorities",
            HOTEL_PREFERENCES,
            default=st.session_state.get("hotel_preferences", DEFAULT_HOTEL_PREFERENCES),
            key="hotel_preferences",
            label_visibility="collapsed",
        )
    return selected or DEFAULT_HOTEL_PREFERENCES


def _render_neighborhood_card(recommendation, preferences, scored_neighborhood, alternative_neighborhoods, selected_neighborhood_name, kicker="Recommended neighborhood"):
    neighborhood = recommendation["neighborhood"]
    best_for = scored_neighborhood.get("best_for") or neighborhood.get("best_for") or "This trip"
    pick_bullets = _escape_list(_neighborhood_pick_bullets(scored_neighborhood, alternative_neighborhoods, preferences))
    selected_class = " selected" if scored_neighborhood["name"] == selected_neighborhood_name else ""
    selected_label = '<span class="hotel-selected-label">Selected</span>' if selected_class else ""
    breakdown_html = _neighborhood_score_breakdown_html(scored_neighborhood, preferences)
    st.markdown(
        f"""
        <div class="hotel-card recommended{selected_class}">
            <div class="hotel-card-top">
                <div>
                    <div class="hotel-kicker">{html.escape(kicker)}</div>
                    <div class="hotel-name">{html.escape(neighborhood["name"])}{selected_label}</div>
                    <div class="neighborhood-best-for"><strong>Best for:</strong> {html.escape(best_for)}</div>
                    <div class="hotel-area">{html.escape(_neighborhood_recommendation_line(scored_neighborhood))}</div>
                </div>
                <div>
                    {_score_badge(scored_neighborhood["score"], "Match")}
                    {breakdown_html}
                </div>
            </div>
            <div class="hotel-copy">{html.escape(neighborhood["why"])}</div>
            <div class="hotel-chip-row">{_chips(_neighborhood_tags(scored_neighborhood), primary_first=True)}</div>
            <div class="hotel-section-label">Why Byable picked this neighborhood</div>
            <ul class="hotel-list">{pick_bullets}</ul>
            <div class="hotel-section-label">Pros</div>
            <ul class="hotel-list">{_escape_list(neighborhood["pros"])}</ul>
            <div class="hotel-section-label">Cons</div>
            <ul class="hotel-list">{_escape_list(neighborhood["cons"])}</ul>
            <div class="hotel-chip-row">
                {_chips(["Central", "Transit-friendly", "Dining access"], primary_first=True)}
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_neighborhood_alt_card(neighborhood, selected_neighborhood_name, preferences=None):
    selected_class = " selected" if neighborhood["name"] == selected_neighborhood_name else ""
    selected_label = '<span class="hotel-selected-label">Selected</span>' if selected_class else ""
    good_fit = list(neighborhood.get("good_fit") or [])[:2]
    tradeoff = str(neighborhood.get("tradeoff") or "")
    why_html = _escape_list(good_fit) if good_fit else ""
    tradeoff_html = _escape_list([tradeoff]) if tradeoff else ""
    breakdown_html = _neighborhood_score_breakdown_html(neighborhood, preferences or DEFAULT_HOTEL_PREFERENCES)
    st.markdown(
        f"""
        <div class="hotel-card alt{selected_class}">
            <div class="hotel-card-top">
                <div>
                    <div class="hotel-kicker">Alternative neighborhood</div>
                    <div class="hotel-name">{html.escape(neighborhood["name"])}{selected_label}</div>
                    <div class="neighborhood-best-for"><strong>Best for:</strong> {html.escape(neighborhood["best_for"])}</div>
                </div>
                <div>
                    {_score_badge(neighborhood["score"], "Match")}
                    {breakdown_html}
                </div>
            </div>
            <div class="hotel-chip-row" style="margin-bottom:10px">{_chips(_neighborhood_tags(neighborhood), primary_first=True)}</div>
            <div class="hotel-section-label">Why choose it</div>
            <ul class="hotel-list">{why_html}</ul>
            <div class="hotel-section-label" style="margin-top:8px">Tradeoff</div>
            <ul class="hotel-list">{tradeoff_html}</ul>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_hotel_card(hotel, recommended=False, recommended_hotel=None):
    is_selected = hotel.get("_hotel_key") == _selected_hotel_key()
    card_class = "hotel-card recommended" if recommended else "hotel-card alt"
    if is_selected:
        card_class += " selected"
    advisor_badge = _hotel_advisor_badge(hotel, recommended=recommended)
    choose_sentence = _hotel_choose_sentence(hotel, recommended=recommended)
    card_summary = _hotel_card_summary(hotel, recommended=recommended)
    selected_label = '<span class="hotel-selected-label">Selected hotel</span>' if is_selected else ""
    recommended_label = '<div class="hotel-recommended-label">Recommended by Byable</div>' if recommended else ""
    pick_bullets = ""
    if recommended and hotel.get("pick_bullets"):
        pick_bullets = "".join(
            [
                '<div class="hotel-section-label">Why Byable picked this hotel</div>',
                f'<ul class="hotel-list">{_escape_list(hotel["pick_bullets"][:4])}</ul>',
            ]
        )
    card_html = "".join(
        [
            f'<div class="{card_class}">',
            '<div class="hotel-card-top">',
            "<div>",
            recommended_label,
            f'<div class="hotel-kicker">{html.escape(hotel["type"] if recommended else hotel["label"])}</div>',
            f'<div class="hotel-name">{html.escape(hotel["name"])}{selected_label}</div>',
            f'<div class="hotel-choice-line">{html.escape(choose_sentence)}</div>',
            f'<div class="hotel-advisor-badge">{html.escape(advisor_badge)}</div>',
            f'<div class="hotel-area">{html.escape(hotel["area"])}</div>',
            "</div>",
            "<div>",
            _hotel_card_signal_html(hotel),
            "</div>",
            "</div>",
            f'<div class="hotel-copy">{html.escape(card_summary)}</div>',
            pick_bullets,
            f'<div class="hotel-chip-row">{_chips(hotel["tags"], primary_first=True)}</div>',
            "</div>",
        ]
    )
    st.markdown(card_html, unsafe_allow_html=True)


def _render_hotel_win_section(recommended_hotel, alternative_hotels, preferences, recommended_neighborhood):
    preference_text = _priority_phrase(preferences, limit=3, joiner=",")
    neighborhood_name = recommended_neighborhood.get("name") or "the selected neighborhood"
    win_bullets = [
        f"Keeps the trip centered around the {neighborhood_name} area selected for this itinerary.",
        "Makes it easier to combine dining, shopping, and sightseeing without extra transit time.",
        f"Delivers the strongest overall fit across {preference_text}.",
    ]
    tradeoff = "Another hotel may be better for nightlife, luxury, or value depending on what you want to emphasize."
    st.markdown(
        f"""
        <div class="hotel-win-card">
            <div class="hotel-section-label">Why Byable Picked This Hotel</div>
            <div class="hotel-win-grid">
                <div>
                    <div class="hotel-copy">Evaluated against multiple strong alternatives.</div>
                    <ul class="hotel-win-list">{_escape_list(win_bullets[:3])}</ul>
                </div>
                <div>
                    <div class="hotel-section-label">Tradeoff</div>
                    <ul class="hotel-win-list">{_escape_list([tradeoff])}</ul>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_hotel_compact_card(hotel):
    is_selected = hotel.get("_hotel_key") == _selected_hotel_key()
    card_class = "hotel-card alt compact"
    if is_selected:
        card_class += " selected"
    label = hotel.get("label") or hotel.get("type") or "Alternative hotel"
    card_summary = _hotel_card_summary(hotel)
    selected_label = '<span class="hotel-selected-label">Selected hotel</span>' if is_selected else ""
    tags = hotel.get("tags") or []
    card_html = "".join(
        [
            f'<div class="{card_class}">',
            '<div class="hotel-compact-row">',
            '<div class="hotel-compact-main">',
            f'<div class="hotel-kicker">{html.escape(label)}</div>',
            f'<div class="hotel-name">{html.escape(hotel["name"])}{selected_label}</div>',
            f'<div class="hotel-area">{html.escape(hotel.get("area") or "")}</div>',
            f'<div class="hotel-compact-reason">{html.escape(card_summary)}</div>',
            "</div>",
            f'<div class="hotel-compact-signal">{_hotel_card_signal_html(hotel)}</div>',
            "</div>",
            f'<div class="hotel-chip-row" style="margin-top:6px">{_chips(tags[:3], primary_first=True)}</div>',
            "</div>",
        ]
    )
    st.markdown(card_html, unsafe_allow_html=True)


def _render_score_modal(hotel):
    expectations = _hotel_stay_expectations(hotel)
    review = _review_summary(hotel)

    def _content():
        st.caption(hotel["name"])

        st.markdown("**Strengths**")
        for strength in expectations["strengths"]:
            st.markdown(f"✓ {strength}")

        st.markdown("**Best for**")
        st.markdown(expectations["best_for"])

        st.markdown("**Tradeoffs**")
        for tradeoff in expectations["tradeoffs"]:
            st.markdown(f"• {tradeoff}")

        if review["positives"] or review["negatives"]:
            st.markdown("**Review signals**")
            for pos in review["positives"][:3]:
                st.markdown(f"✓ {pos}")
            for neg in review["negatives"][:2]:
                st.markdown(f"• {neg}")
            st.caption(f"Review count: {review['review_count']}")

        st.markdown(f"**Stay Score: {int(hotel.get('score') or 0)}/100**")

        if st.button("Close", key=f"close_hotel_score_{hotel.get('_hotel_key', 'active')}"):
            _clear_hotel_active_modal()
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog("What to expect from this stay")
        def _dialog():
            _content()

        _dialog()
    else:
        with st.container(border=True):
            _content()


def _render_why_not_modal(hotel, recommended_hotel):
    comparison = _hotel_why_not_lists(hotel, recommended_hotel)

    def _content():
        st.markdown(f"**Compared to {recommended_hotel['name']}**")
        st.markdown("**Advantages**")
        for advantage in comparison["advantages"][:3]:
            st.markdown(f"✓ {advantage}")

        st.markdown("**Disadvantages**")
        for drawback in comparison["drawbacks"][:2]:
            st.markdown(f"• {drawback}")

        st.markdown("**Decision**")
        st.markdown(comparison["summary"])

        if st.button("Close", key=f"close_hotel_why_not_{hotel.get('_hotel_key', 'active')}"):
            _clear_hotel_active_modal()
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog(f"Why not {hotel['name']}?")
        def _dialog():
            _content()

        _dialog()
    else:
        with st.container(border=True):
            st.markdown(f"#### Why not {hotel['name']}?")
            _content()


def _render_neighborhood_why_not_modal(neighborhood, recommended_neighborhood):
    comparison = _neighborhood_why_not_lists(neighborhood, recommended_neighborhood)

    def _content():
        st.markdown("**Good if you want**")
        for advantage in comparison["advantages"][:2]:
            st.markdown(f"✓ {advantage}")
        st.markdown("**Tradeoffs**")
        for drawback in comparison["drawbacks"][:2]:
            st.markdown(f"• {drawback}")
        st.markdown("**Byable's take**")
        st.caption(comparison["take"])
        if st.button("Close", key="close_neighborhood_why_not"):
            _clear_hotel_active_modal()
            st.rerun()

    if hasattr(st, "dialog"):
        @st.dialog(f"Why not {neighborhood['name']}?")
        def _dialog():
            _content()

        _dialog()
    else:
        with st.container(border=True):
            _content()


def render():
    track_once("page_viewed", key="hotels_page_viewed", properties={"page_name": "hotels"})
    _inject_hotel_styles()
    destination_city = _destination_city()
    st.markdown(
        f"""
        <div class="hotel-page-shell">
            <div class="hotel-kicker">Hotels</div>
            <div class="hotel-title">Where to stay in {html.escape(destination_city)}</div>
            <div class="hotel-subtitle">
                Byable ranks stays by neighborhood fit, transit access, value, room quality, safety, and trip fit.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    city_data = get_hotel_data_for_destination(destination_city)
    if city_data.get("data_source") == "template":
        st.caption(
            f"Showing estimated neighborhood and hotel data for {destination_city}. "
            "Connect Google Places for live listings."
        )

    # If the destination changed, clear stale neighborhood/hotel selections
    last_destination = st.session_state.get("hotels_last_destination")
    if last_destination != destination_city:
        st.session_state.pop("selected_neighborhood_name", None)
        st.session_state.pop("selected_hotel", None)
        st.session_state.pop("selected_hotel_key", None)
        st.session_state["hotels_last_destination"] = destination_city

    selected_preferences = _render_preferences()
    preference_signature = tuple(selected_preferences)
    previous_preference_signature = st.session_state.get("hotel_preferences_last_tracked")
    if previous_preference_signature is None:
        st.session_state["hotel_preferences_last_tracked"] = preference_signature
    elif tuple(previous_preference_signature) != preference_signature:
        track_event(
            "hotel_preferences_changed",
            {
                "preferences": list(selected_preferences),
                "preference_count": len(selected_preferences),
            },
        )
        st.session_state["hotel_preferences_last_tracked"] = preference_signature

    ranked_neighborhoods = _rank_neighborhoods(selected_preferences, city_data["neighborhood_profiles"])
    recommended_neighborhood = ranked_neighborhoods[0]
    st.session_state["hotel_recommended_neighborhood_name"] = recommended_neighborhood["name"]
    available_neighborhood_names = {neighborhood["name"] for neighborhood in ranked_neighborhoods}
    selected_neighborhood_name = st.session_state.get("selected_neighborhood_name")
    if selected_neighborhood_name not in available_neighborhood_names:
        selected_neighborhood_name = recommended_neighborhood["name"]
        st.session_state["selected_neighborhood_name"] = selected_neighborhood_name
    selected_neighborhood = next(
        neighborhood
        for neighborhood in ranked_neighborhoods
        if neighborhood["name"] == selected_neighborhood_name
    )
    alternative_neighborhoods = [
        neighborhood
        for neighborhood in ranked_neighborhoods
        if neighborhood["name"] != recommended_neighborhood["name"]
    ]
    recommendation = _recommendation_for_neighborhood(
        selected_neighborhood,
        city_data["neighborhood_to_recommendation"],
        city_data["mock_recommendations"],
    )
    google_hotels = search_hotels_with_google_places(
        destination_city,
        neighborhood=selected_neighborhood["name"],
        limit=12,
    )
    live_hotel_data_used = bool(google_hotels)
    print(f"HOTELS DATA SOURCE: {'google_places' if live_hotel_data_used else 'mock_fallback'}")
    if not live_hotel_data_used:
        fallback_reason = (
            "GOOGLE_PLACES_API_KEY not configured"
            if not google_places_key_configured()
            else "Google Places returned 0 hotels or request failed"
        )
        print(f"HOTELS FALLBACK USED: {fallback_reason}")
    if live_hotel_data_used:
        ranked_hotels = _rank_google_hotels(
            google_hotels, selected_preferences, selected_neighborhood,
            city_data["neighborhood_safety_scores"],
        )
    else:
        ranked_hotels = _rank_mock_hotels(selected_preferences, city_data)
        selected_mock_name = _recommendation_for_neighborhood(
            selected_neighborhood,
            city_data["neighborhood_to_recommendation"],
            city_data["mock_recommendations"],
        )["hotel"]["name"]
        ranked_hotels = sorted(
            ranked_hotels,
            key=lambda hotel: (
                hotel.get("name") != selected_mock_name,
                -int(hotel.get("score") or 0),
            ),
        )
    recommended_hotel = ranked_hotels[0]
    alternative_hotels = _label_hotel_alternatives(ranked_hotels[1:])
    recommended_hotel["why"] = _hotel_recommendation_copy(
        recommended_hotel,
        selected_preferences,
        neighborhood=selected_neighborhood["name"],
    )
    recommended_hotel["pick_bullets"] = _hotel_pick_bullets(
        recommended_hotel,
        selected_neighborhood,
        selected_preferences,
    )
    recommended_hotel["neighborhood_match_score"] = selected_neighborhood["score"]
    recommended_hotel["overall_stay_score"] = round(selected_neighborhood["score"] * 0.60 + recommended_hotel["score"] * 0.40)
    all_hotels = _assign_hotel_identifiers([recommended_hotel, *alternative_hotels])
    for hotel in all_hotels:
        hotel["_selected_preferences"] = list(selected_preferences)
        hotel["_recommended_neighborhood_name"] = selected_neighborhood["name"]
        hotel["_selected_neighborhood_name"] = selected_neighborhood["name"]
        hotel["_destination_city"] = destination_city
    recommended_hotel = all_hotels[0]
    alternative_hotels = all_hotels[1:]
    hotels_by_key = {hotel["_hotel_key"]: hotel for hotel in all_hotels}
    current_selected_neighborhood = (st.session_state.get("selected_hotel") or {}).get("neighborhood")
    if (
        _selected_hotel_key() not in hotels_by_key
        or current_selected_neighborhood != selected_neighborhood["name"]
    ):
        _set_selected_hotel(recommended_hotel, selected_neighborhood["name"])
    neighborhoods_by_name = {
        neighborhood["name"]: neighborhood
        for neighborhood in [recommended_neighborhood, *alternative_neighborhoods]
    }

    neighborhood_kicker = (
        "Recommended neighborhood"
        if selected_neighborhood_name == recommended_neighborhood["name"]
        else "Selected neighborhood"
    )
    _render_neighborhood_card(
        recommendation,
        selected_preferences,
        selected_neighborhood,
        alternative_neighborhoods,
        selected_neighborhood_name,
        kicker=neighborhood_kicker,
    )
    select_cols = st.columns([1, 0.24])
    with select_cols[1]:
        if st.button(
            "Selected" if selected_neighborhood_name == recommended_neighborhood["name"] else "Select neighborhood",
            key=f"select_neighborhood_{recommended_neighborhood['name']}",
            disabled=selected_neighborhood_name == recommended_neighborhood["name"],
        ):
            st.session_state["selected_neighborhood_name"] = recommended_neighborhood["name"]
            st.rerun()

    st.markdown(
        '<div class="hotel-kicker" style="margin-top:18px">Neighborhood options</div>',
        unsafe_allow_html=True,
    )
    for neighborhood in alternative_neighborhoods:
        _render_neighborhood_alt_card(neighborhood, selected_neighborhood_name, preferences=selected_preferences)
        action_cols = st.columns([1, 0.18, 0.18])
        with action_cols[1]:
            if st.button(
                "Selected" if selected_neighborhood_name == neighborhood["name"] else "Select",
                key=f"select_neighborhood_{neighborhood['name']}",
                disabled=selected_neighborhood_name == neighborhood["name"],
            ):
                st.session_state["selected_neighborhood_name"] = neighborhood["name"]
                st.rerun()
        with action_cols[2]:
            if st.button("Why not?", key=f"neighborhood_why_not_{neighborhood['name']}"):
                _set_neighborhood_active_modal(neighborhood["name"])
                track_event(
                    "hotel_neighborhood_why_not_clicked",
                    {
                        "neighborhood": neighborhood["name"],
                        "recommended_neighborhood": recommended_neighborhood["name"],
                        "match_score": neighborhood["score"],
                        "recommended_match_score": recommended_neighborhood["score"],
                        "preferences": list(selected_preferences),
                    },
                )
                st.rerun()

    if live_hotel_data_used:
        st.caption("Live Google Places hotel data")

    _render_hotel_card(
        recommended_hotel,
        recommended=True,
        recommended_hotel=recommended_hotel,
    )
    action_cols = st.columns([1, 0.20, 0.20])
    with action_cols[1]:
        if st.button(
            "Selected Hotel" if recommended_hotel["_hotel_key"] == _selected_hotel_key() else "Select Hotel",
            key=f"select_hotel_{recommended_hotel['_hotel_key']}",
            disabled=recommended_hotel["_hotel_key"] == _selected_hotel_key(),
        ):
            _set_selected_hotel(recommended_hotel, selected_neighborhood["name"])
            track_event(
                "hotel_selected",
                {
                    "hotel": recommended_hotel["name"],
                    "neighborhood": selected_neighborhood["name"],
                    "recommended": True,
                    "source": recommended_hotel.get("source") or "mock",
                },
            )
            st.rerun()
    with action_cols[2]:
        if st.button("Stay Score", key=f"hotel_stay_score_{recommended_hotel['_hotel_key']}"):
            _set_hotel_active_modal("stay_score", recommended_hotel["_hotel_key"])
            track_event(
                "hotel_ai_score_clicked",
                {
                    "hotel": recommended_hotel["name"],
                    "price": recommended_hotel["price"],
                    "ai_score": recommended_hotel["score"],
                    "interaction": "score_opened",
                },
            )
            st.rerun()

    _render_hotel_win_section(
        recommended_hotel,
        alternative_hotels,
        selected_preferences,
        selected_neighborhood,
    )

    st.markdown(
        '<div class="hotel-kicker" style="margin-top:18px">Alternative hotels</div>',
        unsafe_allow_html=True,
    )
    for hotel in alternative_hotels:
        _render_hotel_compact_card(hotel)
        action_cols = st.columns([1, 0.18, 0.18, 0.18])
        with action_cols[1]:
            if st.button(
                "Selected" if hotel["_hotel_key"] == _selected_hotel_key() else "Select Hotel",
                key=f"select_hotel_{hotel['_hotel_key']}",
                disabled=hotel["_hotel_key"] == _selected_hotel_key(),
            ):
                _set_selected_hotel(hotel, selected_neighborhood["name"])
                track_event(
                    "hotel_selected",
                    {
                        "hotel": hotel["name"],
                        "neighborhood": selected_neighborhood["name"],
                        "recommended": False,
                        "source": hotel.get("source") or "mock",
                    },
                )
                st.rerun()
        with action_cols[2]:
            if st.button("Details", key=f"hotel_stay_score_{hotel['_hotel_key']}"):
                _set_hotel_active_modal("stay_score", hotel["_hotel_key"])
                track_event(
                    "hotel_ai_score_clicked",
                    {
                        "hotel": hotel["name"],
                        "price": hotel["price"],
                        "ai_score": hotel["score"],
                        "interaction": "score_opened",
                    },
                )
                st.rerun()
        with action_cols[3]:
            if st.button("Why not?", key=f"hotel_why_not_{hotel['_hotel_key']}"):
                _set_hotel_active_modal("why_not", hotel["_hotel_key"])
                st.rerun()

    active_modal = st.session_state.get("hotels_active_modal") or {}
    active_modal_type = active_modal.get("type")
    if active_modal_type == "stay_score":
        active_hotel = hotels_by_key.get(active_modal.get("hotel_key"))
        if active_hotel:
            _render_score_modal(active_hotel)
    elif active_modal_type == "why_not":
        active_hotel = hotels_by_key.get(active_modal.get("hotel_key"))
        if active_hotel:
            _render_why_not_modal(active_hotel, recommended_hotel)
    elif active_modal_type == "neighborhood_why_not":
        neighborhood_name = active_modal.get("item")
        if neighborhood_name and neighborhood_name in neighborhoods_by_name:
            _render_neighborhood_why_not_modal(neighborhoods_by_name[neighborhood_name], recommended_neighborhood)