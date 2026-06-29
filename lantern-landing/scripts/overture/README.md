# Overture Maps Activities Pilot — Phase 3

Server-side scripts for importing travel-relevant places from the
[Overture Maps Places dataset](https://overturemaps.org/) into the
TravelGrab activity catalog.

**Status:** Pilot (offline only). Does NOT replace the current Google
Activities system. Results are written to local JSON files only until
Phase 4 review is complete.

---

## Architecture

```
Overture Maps S3 (public) → DuckDB HTTPFS query (bbox filter)
  → schema detection        (current 2025+ vs. legacy pre-2025)
  → travel-relevance filter (category map + confidence + coordinates)
  → deduplication           (name similarity + geographic distance)
  → quality scoring         (0-100: confidence, coords, website, multilingual)
  → keyword generation      (name tokens + category terms + alt names)
  → NormalizedActivity      (provider-neutral Phase 2 type, incl. attribution)
  → local JSON output       (scripts/overture/output/)
  → (optional) comparison   (vs existing Google Supabase rows)
```

Overture data is read directly from the public AWS S3 bucket using
DuckDB's HTTPFS extension — no local download required. The bounding box
filter means only a fraction of the global dataset (~50-200 MB) is read
per city.

The latest Overture release is resolved automatically from the public STAC
catalog (`https://stac.overturemaps.org/catalog.json`) unless `--release`
is specified.

---

## Prerequisites

All required packages are already in `devDependencies`:

```bash
# From lantern-landing/ — already done:
npm install   # installs duckdb, dotenv, etc.
```

No AWS credentials are required — the Overture bucket is publicly readable.

---

## Commands

All commands run from `lantern-landing/`:

### Tokyo dry-run (recommended first step)

```bash
npm run activities:overture -- --city=tokyo --dry-run
```

### Paris dry-run

```bash
npm run activities:overture -- --city=paris --dry-run
```

### New York dry-run

```bash
npm run activities:overture -- --city=new-york --dry-run
```

### Verbose output (shows DuckDB query progress and schema detection)

```bash
npm run activities:overture -- --city=tokyo --dry-run --verbose
```

### Custom Overture release

```bash
npm run activities:overture -- --city=tokyo --dry-run --release=2025-07-23.0
```

When `--release` is omitted the importer prints the resolved release:
```
[overture] Using release: 2025-06-17.0
```

Find the latest release at: https://stac.overturemaps.org/catalog.json

### Compare Overture vs existing Google inventory (Tokyo)

Run the importer first to produce the JSON, then:

```bash
npm run activities:compare -- --city=tokyo
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local`.

---

## Output files

All output is written to `scripts/overture/output/` which is `.gitignore`d.
The filename slug uses the resolved release with dots replaced by dashes.

| File | Contents |
|---|---|
| `tokyo-2025-06-17-0.json` | Array of `NormalizedActivity` (retained places) |
| `tokyo-2025-06-17-0.report.json` | Import stats and top-50 quality list |
| `tokyo-2025-06-17-0.compare.json` | Overture vs Google comparison report |

---

## Flags reference

| Flag | Default | Description |
|---|---|---|
| `--city=<key>` | required | `tokyo`, `paris`, or `new-york` |
| `--release=<ver>` | STAC-resolved | Overture release (e.g. `2025-06-17.0`); omit to auto-resolve |
| `--dry-run` | default | No DB writes; write local JSON only |
| `--write` | off | Reserved for future DB write path |
| `--output=<dir>` | `scripts/overture/output/` | Output directory |
| `--verbose` | off | Extra DuckDB and schema-detection logging |

---

## Bounding boxes

| City | minLng | minLat | maxLng | maxLat |
|---|---|---|---|---|
| Tokyo | 139.55 | 35.50 | 139.95 | 35.80 |
| Paris | 2.25 | 48.75 | 2.45 | 48.95 |
| New York | −74.05 | 40.60 | −73.70 | 40.85 |

---

## Schema versions

Overture Places schema changed in 2025. The importer auto-detects which
version is present by probing for the `basic_category` column (LIMIT 0
reads only the Parquet footer — cheap):

| Field | Current schema (2025+) | Legacy schema (pre-2025) |
|---|---|---|
| Category (detailed) | `taxonomy.primary` | `categories.primary` |
| Category (simplified) | `basic_category` | — |
| Category (alternate) | `taxonomy.alternate` | `categories.alternate` |
| Category hierarchy | `taxonomy.hierarchy` | — |
| Source attribution | `sources` array | — |

Category resolution priority: `taxonomy.primary` → `categories.primary` → `basic_category`.

---

## What the importer does NOT do

- Write to `public.activities` (Phase 4 — after review)
- Enrich photos (Phase 4 — Wikimedia/Wikivoyage)
- Enrich descriptions (Phase 4 — Wikipedia/Wikivoyage)
- Add ratings or reviews (requires Google fallback, Phase 5)
- Book or list prices (Viator integration, Phase 5)
- Replace or overwrite the existing Google activities in Supabase

---

## Licensing and attribution

Overture Maps Places is a **compilation** of data from multiple upstream
sources. Each layer carries its own license:

| Source dataset | License | Notes |
|---|---|---|
| Meta (Facebook) | CDLA-Permissive-2.0 | Largest contributor |
| OpenStreetMap | ODbL-1.0 | Share-alike; requires OSM attribution |
| Yelp, Microsoft, others | varies | Typically CDLA-Permissive-2.0 |
| Compilation | CDLA-Permissive-2.0 | Overture's own license on the aggregate |

The importer extracts per-record attribution from the `sources` array
and stores it in the `NormalizedActivity` output:

| Field | Example value |
|---|---|
| `source_dataset` | `"meta"` |
| `source_record_id` | `"meta:123456789"` |
| `attribution` | `"Meta via Overture Maps Foundation"` |
| `license` | `"CDLA-Permissive-2.0"` or `"ODbL-1.0"` |

For OSM-derived records the license is set to `ODbL-1.0` and attribution
includes "OpenStreetMap contributors".

Required attribution on any public-facing product:
> "Data © OpenStreetMap contributors (ODbL), Meta and others via Overture Maps Foundation (CDLA-Permissive-2.0)"

See: https://overturemaps.org/resources/license/
