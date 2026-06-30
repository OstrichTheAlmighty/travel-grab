import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INITIAL_ACTIVITY_LOAD_STATE,
  activityLoadReducer,
  activityResultMatchesDestination,
  classifyActivitySearchResponse,
  deriveActivityPageState,
  type ActivitySearchResult,
} from "../lib/activities/activity-search-state";

const root = resolve(import.meta.dirname, "..");

function result(city: string): ActivitySearchResult {
  return {
    activities: [],
    city,
    country: city === "Tokyo" ? "Japan" : "Croatia",
    inventoryStatus: "ready",
    inventorySize: 0,
  };
}

describe("Activities destination loading states", () => {
  it("clears Tokyo inventory immediately when a Zagreb request begins", () => {
    const tokyo = activityLoadReducer(INITIAL_ACTIVITY_LOAD_STATE, {
      type: "start",
      requestId: 1,
      destination: "Tokyo, Japan",
    });
    const loadedTokyo = activityLoadReducer(tokyo, {
      type: "loaded",
      requestId: 1,
      result: result("Tokyo"),
    });
    const loadingZagreb = activityLoadReducer(loadedTokyo, {
      type: "start",
      requestId: 2,
      destination: "Zagreb, Croatia",
    });

    expect(loadingZagreb.status).toBe("loading");
    expect(loadingZagreb.requestedDestination).toBe("Zagreb, Croatia");
    expect(loadingZagreb.result).toBeNull();
    expect(loadingZagreb.error).toBeNull();
  });

  it("classifies an unavailable catalog separately from a failed request", () => {
    expect(classifyActivitySearchResponse(false, {
      cityNotBuilt: true,
      error: "This city catalog has not been built yet.",
    })).toBe("city_not_built");
    expect(classifyActivitySearchResponse(false, { error: "Database unavailable" })).toBe("request_failed");

    const source = readFileSync(resolve(root, "app/activities/ActivitySearch.tsx"), "utf8");
    expect(source).toContain("TravelGrab activities are not available in");
    expect(source).toContain('pageState === "city_not_built"');
    expect(source).toContain('pageState === "request_failed"');
  });

  it("uses empty_search_results only inside a successfully loaded city context", () => {
    expect(deriveActivityPageState("loaded", true, 0)).toBe("empty_search_results");
    expect(deriveActivityPageState("city_not_built", false, 0)).toBe("city_not_built");
    expect(deriveActivityPageState("request_failed", false, 0)).toBe("request_failed");
    expect(deriveActivityPageState("loaded", true, 4)).toBe("loaded");
  });

  it("ignores a stale Tokyo response after Zagreb becomes the active request", () => {
    const zagreb = activityLoadReducer(INITIAL_ACTIVITY_LOAD_STATE, {
      type: "start",
      requestId: 2,
      destination: "Zagreb, Croatia",
    });
    const afterLateTokyo = activityLoadReducer(zagreb, {
      type: "loaded",
      requestId: 1,
      result: result("Tokyo"),
    });

    expect(afterLateTokyo).toBe(zagreb);
    expect(afterLateTokyo.result).toBeNull();
  });

  it("rejects legacy cache entries whose returned city differs from the request", () => {
    expect(activityResultMatchesDestination(result("Tokyo"), "Tokyo, Japan")).toBe(true);
    expect(activityResultMatchesDestination(result("Tokyo"), "Zagreb, Croatia")).toBe(false);
  });

  it("keeps retry wording exclusive to genuine failures", () => {
    const source = readFileSync(resolve(root, "app/activities/ActivitySearch.tsx"), "utf8");
    const cityUnavailable = source.slice(source.indexOf("function CityNotBuiltState"), source.indexOf("function EmptyResultsState"));
    const errorState = source.slice(source.indexOf("function ErrorState"), source.indexOf("// ── Featured curation"));
    expect(cityUnavailable).not.toContain("Try again");
    expect(errorState).toContain("Try again");
  });
});
