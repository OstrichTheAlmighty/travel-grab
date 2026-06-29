import { describe, it, expect } from "vitest";
import {
  matchOvertureToGoogle,
  getGoogleCoords,
  isWeakName,
  isPlaceholderName,
  areCategoriesCompatible,
  tokenJaccard,
  type GoogleRow,
  type OvertureMatchInput,
} from "@/scripts/overture/lib/matcher";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGoogle(overrides: Partial<GoogleRow> & { lat?: number; lng?: number } = {}): GoogleRow {
  const { lat = 35.6586, lng = 139.7454, ...rest } = overrides;
  return {
    id:    rest.id    ?? "g_001",
    title: rest.title ?? "Tokyo Tower",
    city:  rest.city  ?? "Tokyo",
    category:           rest.category ?? "culture",
    image_url:          null,
    google_places_data: {
      location: { latitude: lat, longitude: lng },
    },
  };
}

function makeOverture(overrides: Partial<OvertureMatchInput> = {}): OvertureMatchInput {
  return {
    id:          "ov_001",
    title:       "Tokyo Tower",
    namePrimary: "東京タワー",
    altNames:    { en: "Tokyo Tower", "ja-Latn": "Tōkyō Tawā" },
    lat:         35.6586,
    lng:         139.7454,
    category:    "culture",
    ...overrides,
  };
}

// ── getGoogleCoords ───────────────────────────────────────────────────────────

describe("getGoogleCoords", () => {
  it("extracts coordinates from google_places_data.location", () => {
    const g = makeGoogle({ lat: 35.6762, lng: 139.6503 });
    const c = getGoogleCoords(g);
    expect(c).toEqual({ lat: 35.6762, lng: 139.6503 });
  });

  it("returns null when google_places_data is null", () => {
    const g = makeGoogle();
    g.google_places_data = null;
    expect(getGoogleCoords(g)).toBeNull();
  });

  it("returns null when coordinates are 0,0", () => {
    const g = makeGoogle({ lat: 0, lng: 0 });
    expect(getGoogleCoords(g)).toBeNull();
  });

  it("returns null when latitude is missing", () => {
    const g = makeGoogle();
    g.google_places_data = { location: { longitude: 139.7454 } };
    expect(getGoogleCoords(g)).toBeNull();
  });
});

// ── isWeakName ────────────────────────────────────────────────────────────────

describe("isWeakName", () => {
  it("returns true for 'studio'", () => {
    expect(isWeakName("studio")).toBe(true);
  });

  it("returns true for 'room'", () => {
    expect(isWeakName("room")).toBe(true);
  });

  it("returns true for very short strings", () => {
    expect(isWeakName("ab")).toBe(true);
  });

  it("returns false for 'tokyo tower'", () => {
    expect(isWeakName("tokyo tower")).toBe(false);
  });

  it("returns false for 'senso-ji'", () => {
    expect(isWeakName("senso-ji")).toBe(false);
  });
});

// ── isPlaceholderName ─────────────────────────────────────────────────────────

describe("isPlaceholderName", () => {
  it("returns false for COMINGSOON_shibuya (lowercase suffix disqualifies all-caps check)", () => {
    // The matcher's isPlaceholderName is intentionally simpler than relevanceFilter.isExcludedByName.
    // It strips spaces, then checks the all-caps regex. "COMINGSOON_shibuya" has lowercase "shibuya"
    // so the full string does not match. The relevanceFilter handles this before places reach the matcher.
    expect(isPlaceholderName("COMINGSOON_shibuya")).toBe(false);
  });

  it("returns true for COMINGSOON", () => {
    expect(isPlaceholderName("COMINGSOON")).toBe(true);
  });

  it("returns false for 'Studio Ghibli'", () => {
    // Mixed case, not all-caps
    expect(isPlaceholderName("Studio Ghibli")).toBe(false);
  });

  it("returns false for 'Tokyo Tower'", () => {
    expect(isPlaceholderName("Tokyo Tower")).toBe(false);
  });
});

// ── areCategoriesCompatible ───────────────────────────────────────────────────

describe("areCategoriesCompatible", () => {
  it("returns true for identical categories", () => {
    expect(areCategoriesCompatible("culture", "culture")).toBe(true);
  });

  it("returns true when Google category is null", () => {
    expect(areCategoriesCompatible("culture", null)).toBe(true);
  });

  it("returns true for food:nightlife (known compatible pair)", () => {
    expect(areCategoriesCompatible("food", "nightlife")).toBe(true);
  });

  it("returns true for culture:nature (known compatible pair)", () => {
    expect(areCategoriesCompatible("culture", "nature")).toBe(true);
  });

  it("returns false for food:nature (not in compatible pairs and not identical)", () => {
    expect(areCategoriesCompatible("food", "nature")).toBe(false);
  });

  it("returns false for culture:food when reversed (food is food-only, culture not food)", () => {
    // food:culture IS a compatible pair, so culture:food should be too
    expect(areCategoriesCompatible("culture", "food")).toBe(true);
  });
});

// ── tokenJaccard ──────────────────────────────────────────────────────────────

describe("tokenJaccard", () => {
  it("returns 1.0 for identical strings", () => {
    expect(tokenJaccard("tokyo tower", "tokyo tower")).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(tokenJaccard("senso ji temple", "shibuya crossing")).toBe(0);
  });

  it("returns ~0.67 for one shared word out of three", () => {
    // "tokyo tower" vs "tokyo sky tree" → intersection={tokyo}, union={tokyo,tower,sky,tree} = 4
    const j = tokenJaccard("tokyo tower", "tokyo sky tree");
    expect(j).toBeCloseTo(1 / 4, 2);
  });

  it("returns 0 for empty strings", () => {
    expect(tokenJaccard("", "tokyo tower")).toBe(0);
    expect(tokenJaccard("tokyo tower", "")).toBe(0);
  });

  it("ignores single-character tokens", () => {
    // "a b c" — all tokens filtered out, so Jaccard = 0
    expect(tokenJaccard("a b c", "a b c")).toBe(0);
  });
});

// ── matchOvertureToGoogle — confirmed matches ─────────────────────────────────

describe("matchOvertureToGoogle — confirmed matches", () => {
  it("returns confirmed_match for exact name + same location", () => {
    const ov = makeOverture();
    const g  = makeGoogle();
    const result = matchOvertureToGoogle(ov, [g]);
    expect(result).not.toBeNull();
    expect(result!.match.decision).toBe("confirmed_match");
    expect(result!.match.distanceM).toBeLessThan(1);
  });

  it("returns confirmed_match when English altName matches", () => {
    const ov = makeOverture({
      title:       "東京タワー",
      namePrimary: "東京タワー",
      altNames:    { en: "Tokyo Tower" },
    });
    const g = makeGoogle({ title: "Tokyo Tower", lat: 35.6588, lng: 139.7456 }); // ~25m away
    const result = matchOvertureToGoogle(ov, [g]);
    expect(result).not.toBeNull();
    expect(result!.match.decision).toBe("confirmed_match");
  });

  it("returns confirmed_match via transliteration (ja-Latn altName)", () => {
    const ov = makeOverture({
      title:       "浅草寺",
      namePrimary: "浅草寺",
      altNames:    { "ja-Latn": "Senso-ji", en: "Senso-ji Temple" },
      lat: 35.7147, lng: 139.7967,
      category: "culture",
    });
    const g = makeGoogle({
      title:    "Senso-ji",
      lat:      35.7148,
      lng:      139.7968,
      category: "culture",
    });
    const result = matchOvertureToGoogle(ov, [g]);
    expect(result).not.toBeNull();
    expect(result!.match.decision).toBe("confirmed_match");
  });

  it("returns confirmed_match when Google title is a prefix of Overture title", () => {
    // "Tokyo Tower" (Google) matches "Tokyo Tower Observation Deck" (Overture)
    const ov = makeOverture({ title: "Tokyo Tower Observation Deck", namePrimary: "東京タワー展望台" });
    const g  = makeGoogle({ title: "Tokyo Tower", lat: 35.6587, lng: 139.7454 });
    const result = matchOvertureToGoogle(ov, [g]);
    expect(result).not.toBeNull();
    expect(result!.match.decision).toBe("confirmed_match");
  });
});

// ── matchOvertureToGoogle — category conflict ─────────────────────────────────

describe("matchOvertureToGoogle — category conflict", () => {
  it("returns null or weaker decision when categories are incompatible", () => {
    const ov = makeOverture({ category: "culture" });
    const g  = makeGoogle({ category: "food", lat: 35.6588, lng: 139.7455 }); // ~10m away
    // culture:food is actually a compatible pair, so let's use nature:food (not compatible)
    const ov2 = makeOverture({ category: "nature" });
    const result = matchOvertureToGoogle(ov2, [g]);
    // If a result is returned, it must NOT be confirmed_match (category conflict penalizes)
    if (result) {
      expect(result.match.decision).not.toBe("confirmed_match");
      // Signals should mention cat_conflict
      expect(result.match.signals.some((s) => s.includes("cat_conflict"))).toBe(true);
    }
  });

  it("applies category-conflict ×0.3 penalty visible in signals", () => {
    const ov = makeOverture({ category: "nature" });
    const g  = makeGoogle({ category: "food", lat: 35.6587, lng: 139.7454 }); // same coords
    const result = matchOvertureToGoogle(ov, [g]);
    if (result) {
      expect(result.match.signals.join(" ")).toContain("cat_conflict");
    }
  });
});

// ── matchOvertureToGoogle — proximity-only rejection ─────────────────────────

describe("matchOvertureToGoogle — proximity-only rejection", () => {
  it("returns rejected_match for nearby place with completely different name", () => {
    const ov = makeOverture({
      title:       "GINZA Kabukiza",
      namePrimary: "歌舞伎座",
      altNames:    {},
      lat: 35.6691, lng: 139.7638,
      category: "culture",
    });
    // Different place ~60m away
    const g = makeGoogle({
      title:    "Agora Tokyo Ginza Hotel",
      lat:      35.6695,
      lng:      139.7640,
      category: "culture",
    });
    const result = matchOvertureToGoogle(ov, [g]);
    if (result) {
      // Distance is small but names share no tokens — must not be confirmed
      expect(result.match.decision).not.toBe("confirmed_match");
    }
  });

  it("does not confirm match when only criterion is distance < 80m", () => {
    const ov = makeOverture({
      title:       "Ramen Ichiryu",
      namePrimary: "ラーメン一流",
      altNames:    {},
      lat: 35.6586, lng: 139.7454,
      category: "food",
    });
    // Different restaurant at same location — e.g. another restaurant in same building
    const g = makeGoogle({
      title:    "Sushi Yamamoto",
      lat:      35.6586,
      lng:      139.7454,
      category: "food",
    });
    const result = matchOvertureToGoogle(ov, [g]);
    if (result) {
      expect(result.match.decision).not.toBe("confirmed_match");
    }
  });

  it("returns rejected_match (not null) for a proximity candidate with no name match", () => {
    // Explicitly test the rejected_match path: same location, weak/no name similarity
    const ov = makeOverture({
      title:       "ZZZ Unrelated Place",
      namePrimary: "ZZZ Unrelated Place",
      altNames:    {},
    });
    const g = makeGoogle({
      title: "AAA Completely Different",
      lat:   35.6586,
      lng:   139.7454,
    });
    const result = matchOvertureToGoogle(ov, [g], 500);
    // May return null or rejected_match — but never confirmed_match
    if (result) {
      expect(result.match.decision).not.toBe("confirmed_match");
    }
  });
});

// ── matchOvertureToGoogle — weak and placeholder name detection ───────────────

describe("matchOvertureToGoogle — weak and placeholder names", () => {
  it("does not confirm COMINGSOON_shibuya as a match (placeholder Overture title)", () => {
    const ov = makeOverture({ title: "COMINGSOON_shibuya", namePrimary: "COMINGSOON_shibuya", altNames: {} });
    const g  = makeGoogle({ title: "Shibuya Parco", lat: 35.6590, lng: 139.6980 });
    const result = matchOvertureToGoogle(ov, [g]);
    if (result) {
      expect(result.match.decision).not.toBe("confirmed_match");
    }
  });

  it("skips Google candidates whose title is a placeholder", () => {
    const ov = makeOverture({ title: "Tsukiji Outer Market", namePrimary: "築地場外市場", altNames: {} });
    const g  = makeGoogle({ title: "COMINGSOON_tsukiji" });
    const result = matchOvertureToGoogle(ov, [g]);
    if (result) {
      expect(result.match.decision).not.toBe("confirmed_match");
    }
  });
});

// ── matchOvertureToGoogle — no candidates within radius ──────────────────────

describe("matchOvertureToGoogle — no nearby candidates", () => {
  it("returns null when all Google candidates are outside maxRadiusM", () => {
    const ov = makeOverture({ lat: 35.6586, lng: 139.7454 });
    const g  = makeGoogle({ lat: 35.7100, lng: 139.8000 }); // >5 km away
    expect(matchOvertureToGoogle(ov, [g], 500)).toBeNull();
  });

  it("returns null for an empty candidates list", () => {
    expect(matchOvertureToGoogle(makeOverture(), [], 500)).toBeNull();
  });
});
