/**
 * Tests for STAC release resolution (stac.ts):
 *
 *   resolveLatestRelease() — fetches catalog and returns newest YYYY-MM-DD.N id
 *   releaseToSlug()        — converts release string to filesystem-safe slug
 *
 * Scenarios:
 *   1. Returns latest release from title field of child links.
 *   2. Falls back to parsing href when title is absent.
 *   3. Returns lexicographically latest when multiple releases present.
 *   4. Throws on HTTP error.
 *   5. Throws when no child links contain a release identifier.
 *   6. releaseToSlug replaces dots with dashes.
 *   7. Output filename uses the slug correctly.
 *   8. Non-child links (root, self, etc.) are ignored.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveLatestRelease, releaseToSlug } from "@/scripts/overture/lib/stac";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(catalog: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => catalog,
  } as Response);
}

const CATALOG_WITH_TITLES = {
  links: [
    { rel: "root",  href: "/catalog.json" },
    { rel: "child", href: "/2025-04-23.0/collection.json", title: "2025-04-23.0" },
    { rel: "child", href: "/2025-06-17.0/collection.json", title: "2025-06-17.0" },
    { rel: "child", href: "/2024-12-01.0/collection.json", title: "2024-12-01.0" },
    { rel: "self",  href: "/catalog.json" },
  ],
};

const CATALOG_HREF_ONLY = {
  links: [
    { rel: "child", href: "https://stac.overturemaps.org/2025-06-17.0/collection.json" },
    { rel: "child", href: "https://stac.overturemaps.org/2025-04-23.0/collection.json" },
  ],
};

const CATALOG_NO_RELEASES = {
  links: [
    { rel: "root", href: "/catalog.json" },
    { rel: "self", href: "/catalog.json" },
  ],
};

// ── resolveLatestRelease ──────────────────────────────────────────────────────

describe("resolveLatestRelease", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the latest release from title fields", async () => {
    mockFetch(CATALOG_WITH_TITLES);
    const release = await resolveLatestRelease();
    expect(release).toBe("2025-06-17.0");
  });

  it("falls back to parsing href when title is absent", async () => {
    mockFetch(CATALOG_HREF_ONLY);
    const release = await resolveLatestRelease();
    expect(release).toBe("2025-06-17.0");
  });

  it("ignores non-child links (root, self, etc.)", async () => {
    const catalogWithNoise = {
      links: [
        { rel: "root",  href: "/catalog.json", title: "9999-99-99.0" }, // should be ignored
        { rel: "self",  href: "/catalog.json" },
        { rel: "child", href: "/2025-06-17.0/collection.json", title: "2025-06-17.0" },
      ],
    };
    mockFetch(catalogWithNoise);
    const release = await resolveLatestRelease();
    expect(release).toBe("2025-06-17.0");
  });

  it("returns lexicographically latest when multiple releases present", async () => {
    const catalog = {
      links: [
        { rel: "child", title: "2025-01-01.0" },
        { rel: "child", title: "2025-06-17.0" },
        { rel: "child", title: "2025-03-15.1" },
      ],
    };
    mockFetch(catalog);
    const release = await resolveLatestRelease();
    expect(release).toBe("2025-06-17.0");
  });

  it("throws when the HTTP response is not ok", async () => {
    mockFetch({}, 503);
    await expect(resolveLatestRelease()).rejects.toThrow("HTTP 503");
  });

  it("throws when no release identifiers are found in child links", async () => {
    mockFetch(CATALOG_NO_RELEASES);
    await expect(resolveLatestRelease()).rejects.toThrow("No releases found");
  });

  it("handles catalog with empty links array", async () => {
    mockFetch({ links: [] });
    await expect(resolveLatestRelease()).rejects.toThrow("No releases found");
  });

  it("handles catalog with no links field", async () => {
    mockFetch({});
    await expect(resolveLatestRelease()).rejects.toThrow("No releases found");
  });
});

// ── releaseToSlug ─────────────────────────────────────────────────────────────

describe("releaseToSlug", () => {
  it("replaces the trailing .N with -N", () => {
    expect(releaseToSlug("2025-06-17.0")).toBe("2025-06-17-0");
  });

  it("handles .10 suffix", () => {
    expect(releaseToSlug("2025-06-17.10")).toBe("2025-06-17-10");
  });

  it("is idempotent on a slug that has no dots", () => {
    expect(releaseToSlug("2025-06-17-0")).toBe("2025-06-17-0");
  });

  it("output filename format is correct", () => {
    const release = "2025-06-17.0";
    const slug    = releaseToSlug(release);
    const file    = `tokyo-${slug}.json`;
    expect(file).toBe("tokyo-2025-06-17-0.json");
  });
});
