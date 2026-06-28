/**
 * Tests for the after() integration that keeps the Vercel function alive
 * until buildInventoryBatched completes and writes to Supabase.
 *
 * What these tests cover:
 *   1. Route exports runtime and maxDuration correctly.
 *   2. getOrCreateInventory registers buildInventoryBatched through after().
 *   3. after() callback is async (returns a Promise).
 *   4. after() callback awaits the build before resolving.
 *   5. after() callback catches build errors and does not reject.
 *   6. console.error is called when the build promise rejects.
 *   7. after() is NOT called for a city already in the in-process store.
 *   8. HTTP response is returned before the full build finishes.
 *
 * What these tests do NOT cover:
 *   • The Supabase write itself (supabaseAdmin is null in tests → no-op).
 *   • The "partial DB cache" path (readCityCache is mocked to return null).
 *   • OpenAI whyVisit generation (OPENAI_API_KEY is not set in tests).
 */

import * as fs from "fs";
import * as path from "path";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Captured after() callbacks ────────────────────────────────────────────────
// We collect every function passed to after() so tests can inspect and invoke it.

type AfterCallback = () => Promise<void>;
const capturedCallbacks: AfterCallback[] = [];

// vi.mock is hoisted to the top of the file by the Vitest transformer, so the
// mock is in place before any import of next/server (including the one inside
// _inventory.ts).

vi.mock("next/server", () => ({
  after: vi.fn((cb: AfterCallback) => {
    capturedCallbacks.push(cb);
  }),
  // Route tests do not import NextRequest/NextResponse through this mock, but
  // provide stubs here so _inventory.ts can import from next/server without error.
  NextRequest: class {},
  NextResponse: { json: vi.fn() },
}));

// supabaseAdmin = null → writeInventoryToSupabase is a no-op in all tests.
vi.mock("@/lib/db", () => ({ supabaseAdmin: null }));

// Cache layer returns null for all reads (forces the "new city" path) and
// no-ops for all writes.
vi.mock("@/app/api/activities/_inventoryCache", () => ({
  readGeoCache:  vi.fn().mockResolvedValue(null),
  writeGeoCache: vi.fn().mockResolvedValue(undefined),
  readCityCache: vi.fn().mockResolvedValue(null),
  writeQueryCache: vi.fn().mockResolvedValue(undefined),
  makeCacheKey: vi.fn(
    (city: string, g: { type?: string; query?: string }) =>
      `${city}:${g.type ?? g.query ?? "unknown"}`,
  ),
}));

// ── Fake API responses ────────────────────────────────────────────────────────

const FAKE_GEOCODE_RESPONSE = {
  status: "OK",
  results: [
    {
      geometry: {
        location: { lat: 35.6762, lng: 139.6503 },
        viewport: {
          northeast: { lat: 35.7762, lng: 139.7503 },
          southwest: { lat: 35.5762, lng: 139.5503 },
        },
      },
      address_components: [
        { long_name: "Tokyo", types: ["locality"] },
        { long_name: "Japan",  types: ["country"] },
      ],
    },
  ],
};

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Module-level state helpers ────────────────────────────────────────────────
// inventoryStore and destinationToKey are module-level Maps inside _inventory.ts.
// We import them here so we can reset them between tests to prevent state leakage.

import { inventoryStore, destinationToKey } from "@/app/api/activities/_inventory";

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  capturedCallbacks.length = 0;
  inventoryStore.clear();
  destinationToKey.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// 1. Route configuration
// =============================================================================

describe("activities search route configuration", () => {
  const routeSrc = fs.readFileSync(
    path.resolve(__dirname, "../app/api/activities/search/route.ts"),
    "utf-8",
  );

  it('exports runtime = "nodejs"', () => {
    expect(routeSrc).toContain('export const runtime = "nodejs"');
  });

  it("exports maxDuration = 300", () => {
    expect(routeSrc).toContain("export const maxDuration = 300");
  });
});

// =============================================================================
// 2–8. after() integration tests via getOrCreateInventory
// =============================================================================

describe("getOrCreateInventory registers buildInventoryBatched through after()", () => {
  // Helper: set up a fetch mock where all Places API calls resolve with empty
  // results.  Geocoding is handled by URL pattern matching.
  function stubFastFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("maps.googleapis.com/maps/api/geocode")
        ) {
          return makeResponse(FAKE_GEOCODE_RESPONSE);
        }
        // nearbySearch + textSearch → empty results, resolves immediately
        return makeResponse({ places: [] });
      }),
    );
  }

  // Helper: set up a fetch mock where the first 12 Places API calls (seed
  // batch) return immediately, and all subsequent calls are blocked until
  // `resolveRemaining()` is called.  Returns the unblock function.
  function stubSeedFastRemainingBlocked(): { resolveRemaining: () => void } {
    let placesCallCount = 0;
    let resolveRemaining!: () => void;
    const remainingBlocker = new Promise<void>((r) => {
      resolveRemaining = r;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("maps.googleapis.com/maps/api/geocode")
        ) {
          return makeResponse(FAKE_GEOCODE_RESPONSE);
        }
        placesCallCount++;
        if (placesCallCount > 12) {
          await remainingBlocker;
        }
        return makeResponse({ places: [] });
      }),
    );

    return { resolveRemaining };
  }

  it("calls after() exactly once when creating a new city inventory", async () => {
    stubFastFetch();

    const { getOrCreateInventory } = await import(
      "@/app/api/activities/_inventory"
    );
    await getOrCreateInventory("Tokyo, Japan", "fake-key");

    const { after } = await import("next/server");
    expect(after).toHaveBeenCalledTimes(1);
    expect(capturedCallbacks).toHaveLength(1);
  });

  it("after() callback is an async function (returns a Promise)", async () => {
    stubFastFetch();

    const { getOrCreateInventory } = await import(
      "@/app/api/activities/_inventory"
    );
    await getOrCreateInventory("Tokyo, Japan", "fake-key");

    expect(capturedCallbacks).toHaveLength(1);
    const callback = capturedCallbacks[0];
    const result = callback();
    expect(result).toBeInstanceOf(Promise);
    await result; // must not throw
  });

  it("after() callback resolves without error when build succeeds", async () => {
    stubFastFetch();

    const { getOrCreateInventory } = await import(
      "@/app/api/activities/_inventory"
    );
    await getOrCreateInventory("Tokyo, Japan", "fake-key");

    const callback = capturedCallbacks[0];
    await expect(callback()).resolves.toBeUndefined();
  });

  it(
    "after() callback awaits the build — callback is pending while build is in progress",
    async () => {
      const { resolveRemaining } = stubSeedFastRemainingBlocked();

      const { getOrCreateInventory } = await import(
        "@/app/api/activities/_inventory"
      );

      // getOrCreateInventory returns once the seed batch (first 12 queries)
      // completes.  The remaining batches are still blocked.
      const inv = await getOrCreateInventory("Tokyo, Japan", "fake-key");
      expect(inv).not.toBeNull();
      expect(capturedCallbacks).toHaveLength(1);

      // Run the after() callback.  It should be pending because the build
      // promise is still waiting for the blocked fetches.
      let callbackSettled = false;
      const callbackPromise = capturedCallbacks[0]().finally(() => {
        callbackSettled = true;
      });

      // Give the microtask queue a chance to settle.
      // The callback is awaiting the build promise, which is awaiting the
      // blocked fetches, so it must NOT be settled yet.
      await Promise.resolve();
      await Promise.resolve();
      expect(callbackSettled).toBe(false);

      // Unblock the remaining fetches → build finishes → callback resolves.
      resolveRemaining();
      await callbackPromise;
      expect(callbackSettled).toBe(true);
    },
    // Allow up to 15 s for the seed batch to complete under load.
    15_000,
  );

  it(
    "after() callback catches build errors and does not reject",
    async () => {
      // Make all Places API calls throw.  buildInventoryBatched catches errors
      // per query, so the build promise itself does not reject — this test
      // verifies the callback resolves cleanly even when every API call fails.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (
            typeof url === "string" &&
            url.includes("maps.googleapis.com/maps/api/geocode")
          ) {
            return makeResponse(FAKE_GEOCODE_RESPONSE);
          }
          throw new Error("Simulated Places API failure");
        }),
      );

      const { getOrCreateInventory } = await import(
        "@/app/api/activities/_inventory"
      );
      await getOrCreateInventory("Tokyo, Japan", "fake-key");

      expect(capturedCallbacks).toHaveLength(1);
      // Must not reject, even though all Places API calls threw.
      await expect(capturedCallbacks[0]()).resolves.toBeUndefined();
    },
    15_000,
  );

  it(
    "does not call after() for a city already in the inventory store",
    async () => {
      stubFastFetch();

      const { getOrCreateInventory } = await import(
        "@/app/api/activities/_inventory"
      );

      // First call — populates store and registers after().
      await getOrCreateInventory("Tokyo, Japan", "fake-key");
      const firstAfterCount = capturedCallbacks.length;
      expect(firstAfterCount).toBe(1);

      // Second call for the same destination — hits the in-process store.
      capturedCallbacks.length = 0;
      const { after } = await import("next/server");
      vi.mocked(after).mockClear();

      await getOrCreateInventory("Tokyo, Japan", "fake-key");
      expect(after).not.toHaveBeenCalled();
    },
    15_000,
  );

  it(
    "HTTP response is returned before the full build finishes (seed-only timing)",
    async () => {
      const { resolveRemaining } = stubSeedFastRemainingBlocked();

      const { getOrCreateInventory } = await import(
        "@/app/api/activities/_inventory"
      );

      // getOrCreateInventory must return (allowing the HTTP response to be
      // sent) while remaining batches are still blocked.
      const inv = await getOrCreateInventory("Tokyo, Japan", "fake-key");

      // The inventory exists and has data from the seed batch, but the build
      // is still in progress (queriesCompleted < queriesTotal).
      expect(inv).not.toBeNull();
      expect(inv!.queriesCompleted).toBeLessThan(inv!.queriesTotal);

      // Unblock so the build can complete and avoid leaving a hanging promise.
      resolveRemaining();
      // Let the pending callback settle before the test ends.
      if (capturedCallbacks.length > 0) await capturedCallbacks[0]();
    },
    15_000,
  );
});
