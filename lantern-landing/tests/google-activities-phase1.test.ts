import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GOOGLE_DETAIL_FIELD_MASKS,
  sanitizeDetailResponse,
} from "../lib/activities/google-place-details";
import {
  fetchGooglePlaceDetail,
  getGoogleClientDiagnostics,
  resetGoogleClientForTests,
  activityPhotoUrl,
} from "../lib/activities/google-place-client";
import {
  canSpend,
  recordGoogleUsage,
  resetGoogleUsageForTests,
} from "../lib/activities/google-usage";
import { runtimeGoogleActivityBuildEnabled } from "../app/api/activities/_inventory";
import { mayPersistNewGoogleField } from "../lib/activities/google-storage-policy";

const root = resolve(import.meta.dirname, "..");

describe("Google Activities phase-one controls", () => {
  beforeEach(() => {
    resetGoogleClientForTests();
    resetGoogleUsageForTests();
    delete process.env.ALLOW_RUNTIME_GOOGLE_ACTIVITY_BUILD;
    delete process.env.GOOGLE_DAILY_CAP_DETAILS_RICH_REVIEWS;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("disables runtime Google city building by default and allows explicit opt-in", () => {
    expect(runtimeGoogleActivityBuildEnabled()).toBe(false);
    process.env.ALLOW_RUNTIME_GOOGLE_ACTIVITY_BUILD = "true";
    expect(runtimeGoogleActivityBuildEnabled()).toBe(true);
    expect(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts["activities:google-build"]).toBeTruthy();
  });

  it("keeps standard details free of reviews, editorial summaries, and price level", () => {
    const mask = GOOGLE_DETAIL_FIELD_MASKS.modal_standard.split(",");
    expect(mask).not.toContain("reviews");
    expect(mask).not.toContain("editorialSummary");
    expect(mask).not.toContain("priceLevel");
    expect(mask).toContain("photos");
  });

  it("returns only one hero photo from modal_standard", () => {
    const result = sanitizeDetailResponse({ id: "p", photos: [{ name: "one" }, { name: "two" }], reviews: [] }, "modal_standard");
    expect(result.photos).toEqual([{ name: "one" }]);
    expect(result.reviews).toBeUndefined();
  });

  it("isolates rich reviews and gallery fields", () => {
    expect(GOOGLE_DETAIL_FIELD_MASKS.modal_rich_reviews.split(",")).toContain("reviews");
    expect(GOOGLE_DETAIL_FIELD_MASKS.modal_gallery).toBe("id,photos");
  });

  it("deduplicates simultaneous detail requests separately from cache hits", async () => {
    let resolveResponse!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const fetchMock = vi.fn(() => response);
    vi.stubGlobal("fetch", fetchMock);
    const first = fetchGooglePlaceDetail("place", "modal_standard");
    const second = fetchGooglePlaceDetail("place", "modal_standard");
    resolveResponse(new Response(JSON.stringify({ id: "place", detailLevel: "modal_standard" }), { status: 200 }));
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getGoogleClientDiagnostics().inFlightDeduplicationHits).toBe(1);
    await fetchGooglePlaceDetail("place", "modal_standard");
    expect(getGoogleClientDiagnostics().cacheHits).toBe(1);
  });

  it("enforces environment-configurable rich-detail daily caps", () => {
    process.env.GOOGLE_DAILY_CAP_DETAILS_RICH_REVIEWS = "1";
    expect(canSpend("place_details_modal_rich_reviews")).toBe(true);
    expect(recordGoogleUsage("place_details_modal_rich_reviews")).toBe(true);
    expect(canSpend("place_details_modal_rich_reviews")).toBe(false);
  });

  it("uses the shared detail client in Activities and Itinerary and interaction-lazy rich data", () => {
    const activities = readFileSync(resolve(root, "app/activities/ActivitySearch.tsx"), "utf8");
    const itinerary = readFileSync(resolve(root, "app/itinerary/ItineraryPlanner.tsx"), "utf8");
    expect(activities).toContain('fetchGooglePlaceDetail(placeId, "modal_standard")');
    expect(activities).toContain('fetchGooglePlaceDetail(placeId, "modal_rich_reviews")');
    expect(activities).toContain('fetchGooglePlaceDetail(placeId, "modal_gallery")');
    expect(itinerary).toContain('fetchGooglePlaceDetail(detailSlot.sourceId, "modal_standard")');
    expect(itinerary).not.toContain("fetch(`/api/activities/place");
    expect(activities.indexOf("await fetchInsights")).toBeGreaterThan(activities.indexOf('"modal_rich_reviews"'));
  });

  it("does not automatically persist newly built Google inventory", () => {
    const inventory = readFileSync(resolve(root, "app/api/activities/_inventory.ts"), "utf8");
    const buildEnd = inventory.slice(inventory.indexOf("export async function buildInventoryBatched"), inventory.indexOf("// ── Permanent Supabase"));
    expect(buildEnd).not.toContain("writeInventoryToSupabase(");
    expect(inventory).toContain("automatic Supabase inventory writer was intentionally removed");
    expect(inventory).not.toContain('.from("activities").upsert');
    expect(inventory).not.toMatch(/delete\(\).*activities|drop table/i);
    expect(mayPersistNewGoogleField("place_id")).toBe(true);
    expect(mayPersistNewGoogleField("reviews")).toBe(false);
    expect(mayPersistNewGoogleField("photo resource name")).toBe(false);
  });

  it("preserves provider, review-author, and photo-author attribution fields", () => {
    const detailTypes = readFileSync(resolve(root, "lib/activities/google-place-details.ts"), "utf8");
    expect(detailTypes).toContain("authorAttributions");
    expect(detailTypes).toContain("providerUri");
    expect(GOOGLE_DETAIL_FIELD_MASKS.modal_standard).toContain("attributions");
  });

  it("uses a verified external image directly when Google photo capacity is unavailable", () => {
    expect(activityPhotoUrl("https://upload.wikimedia.org/example.jpg", 800)).toBe("https://upload.wikimedia.org/example.jpg");
    expect(activityPhotoUrl("places/p/photos/one", 800)).toContain("/api/activities/photo?");
  });

  it("never places API keys in client source", () => {
    const client = readFileSync(resolve(root, "lib/activities/google-place-client.ts"), "utf8");
    expect(client).not.toContain("GOOGLE_PLACES_API_KEY");
    expect(client).not.toContain("process.env");
  });
});
