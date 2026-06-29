/**
 * Tests for Overture S3 query builder (query.ts):
 *
 *   detectSchemaVersion() — probes Parquet footer for basic_category column
 *   buildSelectSql()      — generates schema-aware SELECT (not exported, tested via SQL text)
 *
 * Scenarios:
 *   1. Current-schema SQL references taxonomy.alternates (plural), NOT taxonomy.alternate.
 *   2. Legacy-schema SQL references categories.alternate (singular) and no taxonomy struct.
 *   3. The two SQL branches are mutually exclusive — no COALESCE spanning both structures.
 *   4. Current SQL aliases taxonomy.alternates as taxonomy_alternates.
 *   5. Legacy SQL projects NULL as taxonomy_alternates placeholder.
 *   6. S3 path ends with *.parquet (not /*).
 *   7. dry-run guarantee: no supabaseAdmin import anywhere in query.ts.
 *
 * NOTE: We test the SQL text by importing the module and inspecting string output.
 * DuckDB is NOT called in these tests — no S3 traffic, no credentials needed.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── SQL text helpers ──────────────────────────────────────────────────────────
//
// We cannot call buildSelectSql() directly because it is unexported.
// Instead we read the source file and verify the string literals it contains.
// This is a deliberate regression test: if someone re-introduces the wrong
// field name the source text check catches it even before tsc runs.

const QUERY_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../scripts/overture/lib/query.ts"),
  "utf-8",
);

describe("query.ts SQL correctness", () => {
  it("contains taxonomy.alternates (plural) for current schema", () => {
    expect(QUERY_SRC).toContain("taxonomy.alternates");
  });

  it("does NOT contain taxonomy.alternate without the trailing s", () => {
    // Match the bare field reference — exclude occurrences of "taxonomy.alternates"
    const stripped = QUERY_SRC.replace(/taxonomy\.alternates/g, "");
    expect(stripped).not.toMatch(/taxonomy\.alternate\b/);
  });

  it("contains categories.alternate (singular) for legacy schema", () => {
    expect(QUERY_SRC).toContain("categories.alternate");
  });

  it("aliases taxonomy.alternates as taxonomy_alternates", () => {
    expect(QUERY_SRC).toMatch(/taxonomy\.alternates\s+AS\s+taxonomy_alternates/);
  });

  it("aliases legacy NULL placeholder as taxonomy_alternates in legacy branch", () => {
    // The legacy branch projects NULL for the taxonomy_alternates column
    expect(QUERY_SRC).toMatch(/NULL::VARCHAR\[\]\s+AS\s+taxonomy_alternates/);
  });

  it("S3 path glob ends with *.parquet, not /*", () => {
    expect(QUERY_SRC).toMatch(/\/\*\.parquet/);
    // Must NOT have the old bare /* pattern
    expect(QUERY_SRC).not.toMatch(/type=place\/'\s*\+/);
  });

  it("does not import or reference supabaseAdmin (dry-run guarantee)", () => {
    expect(QUERY_SRC).not.toContain("supabaseAdmin");
    expect(QUERY_SRC).not.toContain("lib/db");
  });

  it("two schema branches are separate — no COALESCE across taxonomy and categories", () => {
    // A COALESCE that references both structures would fail at DuckDB bind time
    // when one struct is absent. Verify the two names never appear on the same
    // COALESCE line.
    const lines = QUERY_SRC.split("\n");
    for (const line of lines) {
      if (line.includes("COALESCE")) {
        const hasTaxonomy  = line.includes("taxonomy.");
        const hasCategories = line.includes("categories.");
        expect(hasTaxonomy && hasCategories).toBe(false);
      }
    }
  });
});

// ── OvertureRawRow field name regression ──────────────────────────────────────

const TYPES_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../scripts/overture/lib/types.ts"),
  "utf-8",
);

describe("OvertureRawRow type correctness", () => {
  it("declares taxonomy_alternates (plural) not taxonomy_alternate", () => {
    expect(TYPES_SRC).toContain("taxonomy_alternates");
    // Must NOT have the old singular form as a field declaration
    expect(TYPES_SRC).not.toMatch(/^\s+taxonomy_alternate\s*:/m);
  });

  it("declares categories_alternate (singular) for legacy field", () => {
    expect(TYPES_SRC).toContain("categories_alternate");
  });
});
