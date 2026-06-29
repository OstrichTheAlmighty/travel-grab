/**
 * Structural tests for query.ts and the two entry-point scripts.
 *
 * These tests verify:
 *   - Credential handling: token never logged
 *   - OS-only table enforcement: no Pro/Premium/movement/audience tables
 *   - Secret SQL contains TYPE BEARER but no hardcoded token value
 *   - SELECT query includes a bbox WHERE clause
 *   - Scripts don't import supabaseAdmin at module top level
 */

import { describe, it, expect } from "vitest";
import * as fs   from "fs";
import * as path from "path";

const SCRIPTS_DIR = path.join(__dirname, "../../scripts/fsq");

function read(file: string): string {
  return fs.readFileSync(path.join(SCRIPTS_DIR, file), "utf-8");
}

// ── Token safety ──────────────────────────────────────────────────────────────

describe("token never logged", () => {
  const files = [
    "smokeTest.ts",
    "compare.ts",
    "lib/query.ts",
    "lib/smoke.ts",
  ];

  for (const file of files) {
    it(`${file} does not pass FSQ_OS_PLACES_TOKEN directly to console`, () => {
      const src = read(file);
      expect(src).not.toMatch(/console\.(log|error|warn)\(.*FSQ_OS_PLACES_TOKEN/);
    });
  }

  it("query.ts does not call console.log inside setupFsqSecret", () => {
    const src = read("lib/query.ts");
    // Confirm the function exists
    expect(src).toContain("setupFsqSecret");
    // Confirm no log inside it (we check that the function body has no console call)
    const fnMatch = src.match(/setupFsqSecret[\s\S]*?\n\}/);
    if (fnMatch) {
      expect(fnMatch[0]).not.toContain("console.log");
    }
  });
});

// ── OS-only table enforcement ─────────────────────────────────────────────────

describe("OS-only table enforcement", () => {
  const FORBIDDEN = [
    "places_pro",
    "places_premium",
    "movement",
    "audience",
    "visits",
  ];

  const files = [
    "smokeTest.ts",
    "importCity.ts",
    "compare.ts",
    "lib/query.ts",
  ];

  for (const forbidden of FORBIDDEN) {
    it(`no file references the "${forbidden}" table`, () => {
      for (const file of files) {
        const src = read(file);
        expect(src.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    });
  }

  it("query.ts references places.datasets.places_os", () => {
    const src = read("lib/query.ts");
    expect(src).toContain("places.datasets.places_os");
  });

  it("the smoke implementation references places.datasets.places_os", () => {
    const src = read("lib/smoke.ts");
    expect(src).toContain("places.datasets.places_os");
  });
});

// ── Secret SQL ────────────────────────────────────────────────────────────────

describe("secret SQL structure", () => {
  it("setupFsqSecret uses TYPE ICEBERG", () => {
    const src = read("lib/query.ts");
    expect(src).toMatch(/TYPE\s+ICEBERG/i);
  });

  it("setupFsqSecret uses TOKEN template (not hardcoded value)", () => {
    const src = read("lib/query.ts");
    // Should contain TOKEN '${token}' pattern, not a literal token value
    expect(src).toContain("TOKEN '${escapedToken}'");
  });

  it("query.ts ATTACH uses correct endpoint", () => {
    const src = read("lib/query.ts");
    expect(src).toContain("catalog.h3-hub.foursquare.com/iceberg");
  });
});

// ── Bbox WHERE clause ─────────────────────────────────────────────────────────

describe("bbox filter pushed into SQL", () => {
  it("queryFsqPlaces SQL contains BETWEEN for latitude", () => {
    const src = read("lib/query.ts");
    expect(src).toMatch(/latitude\s+BETWEEN/i);
  });

  it("queryFsqPlaces SQL contains BETWEEN for longitude", () => {
    const src = read("lib/query.ts");
    expect(src).toMatch(/longitude\s+BETWEEN/i);
  });

  it("queryFsqPlaces does NOT use SELECT *", () => {
    const src = read("lib/query.ts");
    // The main SELECT should not be SELECT * — only DESCRIBE or probes use wider selects
    const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const selectStar = withoutComments.match(/SELECT\s+\*/gi) ?? [];
    // None should be in the main bbox query
    expect(selectStar.length).toBe(0);
  });
});

// ── Supabase isolation ────────────────────────────────────────────────────────

describe("supabase isolation", () => {
  it("compare.ts does not static-import supabaseAdmin", () => {
    const src = read("compare.ts");
    expect(src).not.toMatch(/import.*supabaseAdmin/);
    expect(src).not.toMatch(/from.*['"]\/?lib\/db['"]/);
  });

  it("importCity.ts does not static-import supabaseAdmin", () => {
    const src = read("importCity.ts");
    expect(src).not.toMatch(/^import.*supabaseAdmin/m);
  });

  it("compare.ts uses dynamic import for Supabase client", () => {
    const src = read("compare.ts");
    expect(src).toMatch(/await import\(["']@supabase\/supabase-js["']\)/);
  });

  it("compare.ts does not log SUPABASE_SERVICE_ROLE_KEY value", () => {
    const src = read("compare.ts");
    expect(src).not.toMatch(/console\.(log|error|warn)\(.*process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  });
});
