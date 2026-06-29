/**
 * DuckDB Iceberg query helpers for Foursquare OS Places.
 *
 * Token handling: the FSQ_OS_PLACES_TOKEN is read from env and passed into
 * DuckDB SQL but is NEVER logged or printed by any function here.
 */

import * as duckdb from "duckdb";
import type { BoundingBox, FsqRawRow } from "./types";
import { TOKYO_MAJOR_ATTRACTIONS } from "./attractions";

// ── DuckDB async wrappers ─────────────────────────────────────────────────────

export function execAsync(conn: duckdb.Connection, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, (err) => {
      if (err) reject(new Error(`DuckDB exec error: ${err.message}`));
      else resolve();
    });
  });
}

export function allAsync(
  conn: duckdb.Connection,
  sql: string,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) reject(new Error(`DuckDB query error: ${err.message}`));
      else resolve(rows as Record<string, unknown>[]);
    });
  });
}

// ── Connection factory ────────────────────────────────────────────────────────

export interface DuckDbHandle {
  db:   duckdb.Database;
  conn: duckdb.Connection;
}

/**
 * Opens an in-memory DuckDB instance and loads the httpfs + iceberg extensions.
 * Caller is responsible for calling db.close() when done.
 */
export async function createDuckDbConnection(): Promise<DuckDbHandle> {
  const db   = new duckdb.Database(":memory:");
  const conn = db.connect();
  await execAsync(conn, "INSTALL httpfs; LOAD httpfs; INSTALL iceberg; LOAD iceberg;");
  return { db, conn };
}

// ── Secret + catalog setup ────────────────────────────────────────────────────

/**
 * Creates the token secret for the FSQ Iceberg catalog.
 * Token is embedded in SQL but NEVER logged.
 */
export async function setupFsqSecret(
  conn: duckdb.Connection,
  token: string,
): Promise<void> {
  const escapedToken = token.replaceAll("'", "''");
  try {
    await execAsync(
      conn,
      `CREATE OR REPLACE SECRET iceberg_secret (
         TYPE ICEBERG,
         TOKEN '${escapedToken}'
       );`,
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(detail.split(token).join("[REDACTED]"));
  }
}

/**
 * Attaches the Foursquare OS Places Iceberg catalog.
 * Must be called after setupFsqSecret.
 */
export async function attachFsqCatalog(conn: duckdb.Connection): Promise<void> {
  await execAsync(
    conn,
    `ATTACH 'places' AS places (
       TYPE iceberg,
       SECRET iceberg_secret,
       ENDPOINT 'https://catalog.h3-hub.foursquare.com/iceberg'
     );`,
  );
}

// ── Schema inspection ─────────────────────────────────────────────────────────

export interface ColumnInfo {
  columnName: string;
  columnType: string;
}

/** Runs DESCRIBE on places.datasets.places_os and returns column metadata. */
export async function describeTable(conn: duckdb.Connection): Promise<ColumnInfo[]> {
  const rows = await allAsync(conn, "DESCRIBE places.datasets.places_os");
  return rows.map((r) => ({
    columnName: String(r["column_name"] ?? r["columnName"] ?? ""),
    columnType: String(r["column_type"] ?? r["columnType"] ?? ""),
  }));
}

// ── Main query ────────────────────────────────────────────────────────────────

export interface QueryFsqOptions {
  limit?:     number;
  verbose?:   boolean;
  timeoutMs?: number;
  interrupt?: () => void;
}

export interface FsqCandidateCounts {
  allInsideBbox: number;
  travelRelevantOpen: number;
  usableCoordinates: number;
  excludedClosed: number;
}

const TRAVEL_CATEGORY_TERMS = [
  "landmark", "museum", "historic", "shrine", "temple", "park", "garden",
  "viewpoint", "lookout", "market", "restaurant", "cafe", "café", "coffee",
  "bar", "nightclub", "theater", "theatre", "music venue", "concert",
  "amusement", "theme park", "aquarium", "zoo", "stadium", "sports",
  "outdoor", "recreation", "trail", "shopping", "department store", "mall",
  "gallery", "monument", "castle", "palace", "arcade", "spa", "onsen",
  "neighborhood", "district", "street", "intersection", "plaza", "waterfront",
] as const;

const MAX_SAFE_LIMIT = 20_000;

const categoryTextSql = "lower(array_to_string(fsq_category_labels, ' '))";

const categoryGroupSql = `CASE
  WHEN regexp_matches(${categoryTextSql}, 'museum|historic|landmark|shrine|temple|theater|theatre|gallery|monument|castle|palace|shopping|department store|mall|neighborhood|district|street|intersection|plaza') THEN 'culture'
  WHEN regexp_matches(${categoryTextSql}, 'amusement|theme park|aquarium|zoo|stadium|sports|arcade') THEN 'adventure'
  WHEN regexp_matches(${categoryTextSql}, 'park|garden|viewpoint|lookout|outdoor|recreation|trail') THEN 'nature'
  WHEN regexp_matches(${categoryTextSql}, 'nightclub|bar|music venue|concert') THEN 'nightlife'
  WHEN regexp_matches(${categoryTextSql}, 'spa|onsen') THEN 'luxury'
  WHEN regexp_matches(${categoryTextSql}, 'public art|public plaza') THEN 'free'
  WHEN regexp_matches(${categoryTextSql}, 'restaurant|cafe|café|coffee|market') THEN 'food'
  ELSE 'other'
END`;

const sourceRankSql = `(CASE
  WHEN regexp_matches(${categoryTextSql}, 'museum|historic|landmark|observation|aquarium|zoo|theme park|national park|botanical garden|palace|castle') THEN 45
  WHEN regexp_matches(${categoryTextSql}, 'park|garden|theater|theatre|market|stadium|music venue|shopping mall') THEN 32
  WHEN regexp_matches(${categoryTextSql}, 'shrine|temple|restaurant|bar|cafe|café') THEN 18
  ELSE 10 END
  + LEAST(15, length(array_to_string(fsq_category_labels, ' ')) / 12)
  + CASE WHEN name IS NOT NULL AND length(trim(name)) >= 5 THEN 8 ELSE 0 END
  + CASE WHEN website IS NOT NULL AND trim(website) <> '' THEN 4 ELSE 0 END
  + CASE WHEN TRY_CAST(date_refreshed AS DATE) >= CURRENT_DATE - INTERVAL '3 years' THEN 6 ELSE 0 END)`;

function validateQueryInput(bbox: BoundingBox, limit: number): void {
  const numbers = [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, limit];
  if (!numbers.every(Number.isFinite)) throw new Error("FSQ query bounds and limit must be finite numbers");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SAFE_LIMIT) {
    throw new Error(`FSQ validation run requires --limit between 1 and ${MAX_SAFE_LIMIT}`);
  }
}

export function buildFsqPlacesQuery(bbox: BoundingBox, limit = 5_000): string {
  validateQueryInput(bbox, limit);
  const relevancePattern = TRAVEL_CATEGORY_TERMS.join("|").replaceAll("'", "''");

  return `
    SELECT
      fsq_place_id, name,
      latitude,
      longitude,
      address, locality, region, postcode, country,
      date_created, date_refreshed, date_closed, website,
      fsq_category_ids, fsq_category_labels, placemaker_url,
      'latitude_longitude' AS coordinate_source,
      ${categoryGroupSql} AS sample_category_group,
      ${sourceRankSql} AS source_rank_score,
      ROW_NUMBER() OVER (
        PARTITION BY ${categoryGroupSql}
        ORDER BY ${sourceRankSql} DESC, fsq_place_id ASC
      ) AS stratified_rank
    FROM places.datasets.places_os
    WHERE date_closed IS NULL
      AND longitude BETWEEN ${bbox.minLng} AND ${bbox.maxLng}
      AND latitude BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
      AND regexp_matches(lower(array_to_string(fsq_category_labels, ' ')), '${relevancePattern}')
    ORDER BY stratified_rank ASC, sample_category_group ASC, source_rank_score DESC, fsq_place_id ASC
    LIMIT ${limit}
  `.trim();
}

export function buildFsqFallbackQuery(bbox: BoundingBox, limit: number): string {
  const base = buildFsqPlacesQuery(bbox, limit);
  return base
    .replace("      latitude,\n      longitude,", "      bbox.ymin AS latitude,\n      bbox.xmin AS longitude,")
    .replace("      'latitude_longitude' AS coordinate_source", "      'point_bbox' AS coordinate_source")
    .replace(
      `AND longitude BETWEEN ${bbox.minLng} AND ${bbox.maxLng}\n      AND latitude BETWEEN ${bbox.minLat} AND ${bbox.maxLat}`,
      `AND latitude IS NULL AND longitude IS NULL
      AND bbox.xmin = bbox.xmax AND bbox.ymin = bbox.ymax
      AND bbox.xmin BETWEEN ${bbox.minLng} AND ${bbox.maxLng}
      AND bbox.ymin BETWEEN ${bbox.minLat} AND ${bbox.maxLat}`,
    );
}

export function buildFsqCountQuery(bbox: BoundingBox): string {
  const pattern = TRAVEL_CATEGORY_TERMS.join("|").replaceAll("'", "''");
  return `SELECT
    COUNT(*) AS all_inside_bbox,
    COUNT(*) FILTER (WHERE date_closed IS NULL
      AND regexp_matches(${categoryTextSql}, '${pattern}')) AS travel_relevant_open,
    COUNT(*) FILTER (WHERE latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180) AS usable_coordinates,
    COUNT(*) FILTER (WHERE date_closed IS NOT NULL) AS excluded_closed
  FROM places.datasets.places_os
  WHERE longitude BETWEEN ${bbox.minLng} AND ${bbox.maxLng}
    AND latitude BETWEEN ${bbox.minLat} AND ${bbox.maxLat}`;
}

async function runTimedQuery(
  conn: duckdb.Connection,
  sql: string,
  timeoutMs: number,
  interrupt?: () => void,
): Promise<Record<string, unknown>[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    allAsync(conn, sql),
    new Promise<Record<string, unknown>[]>((_, reject) => {
      timeout = setTimeout(() => {
        interrupt?.();
        reject(new Error(`FSQ DuckDB diagnostic timed out after ${Math.round(timeoutMs / 1000)} seconds`));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export async function queryFsqCandidateCounts(
  conn: duckdb.Connection,
  bbox: BoundingBox,
  options: Pick<QueryFsqOptions, "timeoutMs" | "interrupt"> = {},
): Promise<FsqCandidateCounts> {
  const rows = await runTimedQuery(conn, buildFsqCountQuery(bbox), options.timeoutMs ?? 180_000, options.interrupt);
  const row = rows[0] ?? {};
  return {
    allInsideBbox: Number(row.all_inside_bbox ?? 0),
    travelRelevantOpen: Number(row.travel_relevant_open ?? 0),
    usableCoordinates: Number(row.usable_coordinates ?? 0),
    excludedClosed: Number(row.excluded_closed ?? 0),
  };
}

export async function explainFsqPlacesQuery(
  conn: duckdb.Connection,
  bbox: BoundingBox,
  limit: number,
  options: Pick<QueryFsqOptions, "timeoutMs" | "interrupt"> = {},
): Promise<string> {
  const rows = await runTimedQuery(conn, `EXPLAIN ${buildFsqPlacesQuery(bbox, limit)}`, options.timeoutMs ?? 180_000, options.interrupt);
  return rows.map((row) => Object.values(row).map(String).join("\n")).join("\n");
}

export function buildMajorAttractionProbeQuery(definition: (typeof TOKYO_MAJOR_ATTRACTIONS)[number]): string {
  const pattern = definition.aliases
    .map((alias) => alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|").replaceAll("'", "''");
  const latPad = 0.012;
  const lngPad = 0.018;
  return `SELECT fsq_place_id, name, latitude, longitude, address, locality, region, postcode, country,
    date_created, date_refreshed, date_closed, website, fsq_category_ids, fsq_category_labels,
    placemaker_url, 'latitude_longitude' AS coordinate_source
  FROM places.datasets.places_os
  WHERE longitude BETWEEN ${definition.lng - lngPad} AND ${definition.lng + lngPad}
    AND latitude BETWEEN ${definition.lat - latPad} AND ${definition.lat + latPad}
    AND regexp_matches(lower(name), '${pattern}')
  ORDER BY ((latitude - ${definition.lat}) * (latitude - ${definition.lat})
    + (longitude - ${definition.lng}) * (longitude - ${definition.lng})) ASC, fsq_place_id ASC
  LIMIT 2000`;
}

export async function queryMajorAttractionCandidates(
  conn: duckdb.Connection,
  bbox: BoundingBox,
  options: Pick<QueryFsqOptions, "timeoutMs" | "interrupt"> = {},
): Promise<FsqRawRow[]> {
  const rows: Record<string, unknown>[] = [];
  for (const definition of TOKYO_MAJOR_ATTRACTIONS) {
    rows.push(...await runTimedQuery(conn, buildMajorAttractionProbeQuery(definition), options.timeoutMs ?? 180_000, options.interrupt));
  }
  const byId = new Map(rows.map((row) => [String(row.fsq_place_id), row]));
  return [...byId.values()] as unknown as FsqRawRow[];
}

/**
 * Queries places.datasets.places_os for a given bounding box.
 *
 * Only required columns are selected (NOT SELECT *).
 * The bbox filter is pushed into SQL so DuckDB can prune remote data.
 */
export async function queryFsqPlaces(
  conn: duckdb.Connection,
  bbox: BoundingBox,
  opts: QueryFsqOptions = {},
): Promise<FsqRawRow[]> {
  const { limit = 5_000, verbose = false, timeoutMs = 180_000 } = opts;
  const sql = buildFsqPlacesQuery(bbox, limit);

  if (verbose) {
    console.log("[fsq/query] SQL (token not logged):");
    console.log(sql);
    console.log(`[fsq/query] BBox: lat ${bbox.minLat}..${bbox.maxLat}, lng ${bbox.minLng}..${bbox.maxLng}`);
  }

  const t0 = performance.now();
  const primaryRows = await runTimedQuery(conn, sql, timeoutMs, opts.interrupt);
  const elapsed = performance.now() - t0;
  const fallbackLimit = Math.min(100, limit - primaryRows.length);
  const fallbackRows = fallbackLimit > 0
    ? await runTimedQuery(conn, buildFsqFallbackQuery(bbox, fallbackLimit), Math.max(1, timeoutMs - elapsed), opts.interrupt)
    : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of [...primaryRows, ...fallbackRows]) byId.set(String(row.fsq_place_id), row);
  const rows = [...byId.values()].slice(0, limit);
  if (verbose) {
    console.log(`[fsq/query] Received ${rows.length} rows in ${performance.now() - t0} ms`);
  }

  return rows as unknown as FsqRawRow[];
}
