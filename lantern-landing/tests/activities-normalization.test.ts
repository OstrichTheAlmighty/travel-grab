/**
 * Phase 2 normalization tests: Google adapter → NormalizedActivity.
 *
 * These tests are purely functional — they import only the adapter and types,
 * no mocks required. The adapter has no runtime dependency on _inventory.ts
 * (types are import-erased) and no I/O.
 *
 * Covered scenarios:
 *   1. A well-populated Google record normalizes correctly.
 *   2. Opaque Google photo reference is preserved in photos[].ref with proxy_required=true.
 *   3. Null / missing provider fields do not throw and produce a valid result.
 *   4. querySources are preserved verbatim as search_keywords.
 *   5. The existing Activity interface remains backward compatible (compile-time + shape check).
 *   6. google_places_data contains all fields mapToActivity uses to render the UI.
 *   7. The adapter does not remove rating, category, description, photos, or place ID.
 */

import { describe, it, expect } from "vitest";
import { normalizeGoogleEntry } from "@/lib/activities/adapters/google";
import type { InventoryEntry, GooglePlace } from "@/app/api/activities/_inventory";
import type { Activity } from "@/app/activities/data/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlace(overrides: Partial<GooglePlace> = {}): GooglePlace {
  return {
    id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
    displayName: { text: "Tokyo Tower" },
    rating: 4.5,
    userRatingCount: 12_000,
    types: ["tourist_attraction", "point_of_interest"],
    photos: [{ name: "places/ChIJ.../photos/AXCi3Qabcdef", widthPx: 4032, heightPx: 3024 }],
    priceLevel: "PRICE_LEVEL_MODERATE",
    editorialSummary: { text: "Iconic lattice tower in central Tokyo." },
    websiteUri: "https://www.tokyotower.co.jp/",
    googleMapsUri: "https://maps.google.com/?cid=123",
    location: { latitude: 35.6586, longitude: 139.7454 },
    regularOpeningHours: { openNow: true },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    place: makePlace(),
    category: "culture",
    tags: ["Views", "Observation Deck"],
    querySources: ["observation deck tokyo", "tourist attraction"],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("normalizeGoogleEntry", () => {
  // 1. Happy path
  it("normalizes an existing Google record correctly", () => {
    const entry = makeEntry();
    const result = normalizeGoogleEntry(entry, "Tokyo");

    expect(result.source).toBe("google");
    expect(result.place_id).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(result.title).toBe("Tokyo Tower");
    expect(result.city).toBe("Tokyo");
    expect(result.category).toBe("culture");
    expect(result.description).toBe("Iconic lattice tower in central Tokyo.");
    expect(result.rating).toBe(4.5);
    expect(result.review_count).toBe(12_000);
    expect(result.website).toBe("https://www.tokyotower.co.jp/");
    expect(result.map_link).toBe("https://maps.google.com/?cid=123");
    expect(result.lat).toBe(35.6586);
    expect(result.lng).toBe(139.7454);
    expect(result.capabilities.opening_hours).toBe(true);
    expect(result.capabilities.website).toBe(true);
    expect(result.capabilities.map_link).toBe(true);
    expect(result.capabilities.price).toBe(true);
    expect(result.provider_ids).toEqual([
      { source: "google", id: "ChIJN1t_tDeuEmsRUsoyG83frY4" },
    ]);
  });

  // 2. Opaque photo reference
  it("preserves opaque Google photo reference and marks proxy_required", () => {
    const photoName = "places/ChIJ.../photos/AXCi3Qabcdef";
    const entry = makeEntry({
      place: makePlace({
        photos: [{ name: photoName, widthPx: 4032, heightPx: 3024 }],
      }),
    });
    const result = normalizeGoogleEntry(entry, "Tokyo");

    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].ref).toBe(photoName);
    expect(result.photos[0].proxy_required).toBe(true);
    expect(result.photos[0].provider).toBe("google");
    expect(result.photos[0].url).toBeUndefined();
    expect(result.photos[0].width).toBe(4032);
    expect(result.photos[0].height).toBe(3024);
    expect(result.photos[0].priority).toBe(0);
    expect(result.photos[0].is_fallback).toBe(false);
  });

  // 3. Null provider fields
  it("handles missing / null provider fields without throwing", () => {
    const sparsePlace: GooglePlace = {
      id: "sparse-place-id",
      displayName: { text: "Sparse Place" },
      // no rating, userRatingCount, types, photos, priceLevel, location, etc.
    };
    const entry: InventoryEntry = {
      place: sparsePlace,
      category: "culture",
      tags: [],
      querySources: [],
    };

    expect(() => normalizeGoogleEntry(entry, "Tokyo")).not.toThrow();

    const result = normalizeGoogleEntry(entry, "Tokyo");
    expect(result.title).toBe("Sparse Place");
    expect(result.place_id).toBe("sparse-place-id");
    expect(result.description).toBeUndefined();
    expect(result.rating).toBeUndefined();
    expect(result.review_count).toBeUndefined();
    expect(result.photos).toHaveLength(0);
    expect(result.lat).toBeUndefined();
    expect(result.lng).toBeUndefined();
    expect(result.capabilities.photos).toBe(false);
    expect(result.capabilities.rating).toBe(false);
    expect(result.capabilities.review_count).toBe(false);
    expect(result.capabilities.opening_hours).toBe(false);
    expect(result.capabilities.website).toBe(false);
    expect(result.capabilities.map_link).toBe(false);
    expect(result.capabilities.price).toBe(false);
  });

  // 4. querySources → search_keywords
  it("maps querySources verbatim to search_keywords", () => {
    const querySources = ["observation deck tokyo", "tourist attraction", "landmark"];
    const entry = makeEntry({ querySources });
    const result = normalizeGoogleEntry(entry, "Tokyo");

    expect(result.search_keywords).toEqual(querySources);
  });

  // 5. Activity interface backward compatibility
  it("Activity interface required fields are unchanged (backward compatibility)", () => {
    // This test constructs a value typed as Activity. TypeScript compilation
    // will fail here if the Activity interface has had required fields removed
    // or renamed — making this a compile-time safety net.
    const activity: Activity = {
      id: "abc",
      title: "Test",
      neighborhood: "Shinjuku",
      duration: "1–2 hours",
      price: "$$",
      isFree: false,
      rating: 4.2,
      reviewCount: 100,
      description: "A test activity",
      whyVisit: "Because it is great",
      category: "culture",
      tags: [],
      badges: [],
      emoji: "🎭",
      gradient: "linear-gradient(#000, #fff)",
    };

    const requiredKeys: Array<keyof Activity> = [
      "id", "title", "neighborhood", "duration", "price", "isFree",
      "rating", "reviewCount", "description", "whyVisit",
      "category", "tags", "badges", "emoji", "gradient",
    ];
    for (const key of requiredKeys) {
      expect(Object.prototype.hasOwnProperty.call(activity, key)).toBe(true);
    }

    // Optional keys must still compile correctly.
    const withOptionals: Activity = {
      ...activity,
      photoRef: "places/abc/photos/xyz",
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      querySources: ["museum tokyo"],
      lat: 35.6586,
      lng: 139.7454,
    };
    expect(withOptionals.photoRef).toBe("places/abc/photos/xyz");
    expect(withOptionals.querySources).toEqual(["museum tokyo"]);
  });

  // 6. All data the UI needs is preserved in google_places_data
  it("google_places_data preserves every field mapToActivity uses to render UI", () => {
    const entry = makeEntry();
    const result = normalizeGoogleEntry(entry, "Tokyo");

    // The UI reads the stored place via mapToActivity(place, ...) — all fields must survive.
    const stored = result.google_places_data as unknown as GooglePlace;
    expect(stored.id).toBe(entry.place.id);
    expect(stored.displayName?.text).toBe("Tokyo Tower");
    expect(stored.rating).toBe(entry.place.rating);
    expect(stored.userRatingCount).toBe(entry.place.userRatingCount);
    expect(stored.photos?.[0]?.name).toBe(entry.place.photos?.[0]?.name);
    expect(stored.editorialSummary?.text).toBe(entry.place.editorialSummary?.text);
    expect(stored.location?.latitude).toBe(35.6586);
    expect(stored.location?.longitude).toBe(139.7454);
    expect(stored.websiteUri).toBe(entry.place.websiteUri);
    expect(stored.googleMapsUri).toBe(entry.place.googleMapsUri);
    expect(stored.regularOpeningHours?.openNow).toBe(true);
    expect(stored.priceLevel).toBe("PRICE_LEVEL_MODERATE");
  });

  // 7. No data loss: rating, category, description, photos, place ID
  it("does not remove rating, category, description, photos, or place ID", () => {
    const entry = makeEntry();
    const result = normalizeGoogleEntry(entry, "Tokyo");

    expect(result.rating).toBeDefined();
    expect(result.rating).toBeGreaterThan(0);
    expect(result.review_count).toBeDefined();
    expect(result.review_count).toBeGreaterThan(0);
    expect(result.category).toBe("culture");
    expect(result.description).toBeDefined();
    expect(result.description!.length).toBeGreaterThan(0);
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].ref).toBeDefined();
    expect(result.place_id).toBe(entry.place.id);
    expect(result.provider_ids).toContainEqual({
      source: "google",
      id: entry.place.id,
    });
  });
});
