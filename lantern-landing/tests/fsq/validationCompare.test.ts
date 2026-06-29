import { describe, expect, it, vi } from "vitest";
import type { NormalizedActivity } from "@/lib/activities/types";
import { TOKYO_MAJOR_ATTRACTIONS, matchesMajorAttraction } from "@/scripts/fsq/lib/attractions";
import { classifyTokyoGeography } from "@/scripts/fsq/lib/geography";
import { paginateGoogleRows } from "@/scripts/fsq/lib/googlePagination";
import { matchFsqToGoogle } from "@/scripts/fsq/lib/matcher";
import type { GoogleRow } from "@/scripts/overture/lib/matcher";

function google(overrides: Partial<GoogleRow> = {}): GoogleRow {
  return {
    id: "g1",
    title: "Different nearby place",
    city: "Tokyo",
    category: "culture",
    image_url: null,
    google_places_data: { location: { latitude: 35.6586, longitude: 139.7454 } },
    ...overrides,
  };
}

function activity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    id: "fsq:1",
    provider_ids: [],
    title: "Tokyo Tower",
    city: "Tokyo",
    category: "culture",
    photos: [],
    lat: 35.6586,
    lng: 139.7454,
    search_keywords: [],
    capabilities: {
      photos: false, rating: false, review_count: false, written_reviews: false,
      opening_hours: false, phone: false, website: false, map_link: false,
      booking: false, live_availability: false, price: false,
    },
    source: "manual",
    ...overrides,
  };
}

describe("Tokyo geographic classification", () => {
  it("separates a 23-ward address from broader Tokyo", () => {
    expect(classifyTokyoGeography({ locality: "Shibuya", region: "Tokyo" })).toBe("tokyo_core_23_wards");
    expect(classifyTokyoGeography({ locality: "Mitaka", region: "Tokyo" })).toBe("broader_tokyo");
  });

  it("classifies Yokohama/Kanagawa outside Tokyo", () => {
    expect(classifyTokyoGeography({ locality: "Yokohama", region: "Kanagawa" })).toBe("yokohama_or_outside_tokyo");
    expect(classifyTokyoGeography({ address: "横浜市中区", region: "神奈川県" })).toBe("yokohama_or_outside_tokyo");
  });
});

describe("major attraction matching", () => {
  const tower = TOKYO_MAJOR_ATTRACTIONS.find((item) => item.name === "Tokyo Tower")!;
  const meiji = TOKYO_MAJOR_ATTRACTIONS.find((item) => item.name === "Meiji Jingū")!;

  it("accepts exact attraction identity with compatible category and proximity", () => {
    expect(matchesMajorAttraction(tower, {
      name: "東京タワー", lat: tower.lat, lng: tower.lng, categoryText: "Landmark > Observation Deck",
    })).toBe(true);
  });

  it("rejects false substring matches inside Tokyo Tower", () => {
    expect(matchesMajorAttraction(tower, {
      name: "Tokyo Tower Portrait Studio", lat: tower.lat, lng: tower.lng, categoryText: "Business > Photography Studio",
    })).toBe(false);
  });

  it("does not confuse Meiji Shrine with Meiji Jingu Stadium", () => {
    expect(matchesMajorAttraction(meiji, {
      name: "Meiji Jingu Stadium", lat: meiji.lat, lng: meiji.lng, categoryText: "Sports > Stadium",
    })).toBe(false);
  });

  it("rejects ordinary Harajuku/Akihabara businesses sharing a district substring", () => {
    const harajuku = TOKYO_MAJOR_ATTRACTIONS.find((item) => item.name === "Harajuku")!;
    expect(matchesMajorAttraction(harajuku, {
      name: "Harajuku Portrait Studio", lat: harajuku.lat, lng: harajuku.lng, categoryText: "Photography Studio",
    })).toBe(false);
  });
});

describe("FSQ versus Google matcher", () => {
  it("rejects proximity-only candidates", () => {
    const match = matchFsqToGoogle(activity(), [google()]);
    expect(match?.decision).toBe("rejected_match");
    expect(match?.signals).toContain("proximity_only_rejected");
  });

  it("confirms exact normalized names with compatible categories", () => {
    const match = matchFsqToGoogle(activity(), [google({ title: "Tokyo Tower" })]);
    expect(match?.decision).toBe("confirmed_match");
    expect(match?.signals).toContain("exact_normalized_name");
  });

  it("treats an English parenthetical name as exact bilingual evidence", () => {
    const match = matchFsqToGoogle(activity({ title: "東京タワー (Tokyo Tower)" }), [google({ title: "Tokyo Tower" })]);
    expect(match?.decision).toBe("confirmed_match");
    expect(match?.signals).toContain("exact_normalized_name");
  });
});

describe("Google pagination", () => {
  it("fetches every page and verifies the count", async () => {
    const fetchPage = vi.fn(async (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, index) => google({ id: `g${from + index}` })),
    );
    const rows = await paginateGoogleRows(2_050, fetchPage, 1_000);
    expect(rows).toHaveLength(2_050);
    expect(fetchPage.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2049]]);
  });

  it("fails when fetched rows do not equal the count", async () => {
    await expect(paginateGoogleRows(2, async () => [google()], 1_000)).rejects.toThrow("pagination mismatch");
  });
});
