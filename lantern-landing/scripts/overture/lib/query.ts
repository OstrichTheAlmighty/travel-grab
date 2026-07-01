import * as duckdb from "duckdb";
import type { BoundingBox } from "../../activities/lib/types";
import type { OvertureRawRow, OvertureSchemaVersion } from "./types";

// ── DuckDB async wrappers ─────────────────────────────────────────────────────

function execAsync(conn: duckdb.Connection, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, (err) => {
      if (err) reject(new Error(`DuckDB exec error: ${err.message}\nSQL: ${sql.slice(0, 200)}`));
      else resolve();
    });
  });
}

function allAsync(conn: duckdb.Connection, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) reject(new Error(`DuckDB query error: ${err.message}\nSQL: ${sql.slice(0, 200)}`));
      else resolve(rows as Record<string, unknown>[]);
    });
  });
}

// ── S3 path ───────────────────────────────────────────────────────────────────

/**
 * S3 glob pattern for Overture Places data.
 * Overture stores each theme/type as Parquet files in hive-partitioned directories.
 * No AWS credentials required — the bucket is publicly readable.
 */
function overtureS3Path(release: string): string {
  return `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*.parquet`;
}

// ── Schema detection ──────────────────────────────────────────────────────────

/**
 * Probes the Parquet files to detect which Overture schema version is present.
 *
 * Current schema (2025+): has `basic_category` and `taxonomy` struct columns.
 * Legacy schema (pre-2025): has `categories` struct columns.
 *
 * A LIMIT 0 query reads only the Parquet footer (schema metadata) from S3,
 * making this probe cheap even on large datasets.
 */
export async function detectSchemaVersion(
  conn: duckdb.Connection,
  s3Path: string,
): Promise<OvertureSchemaVersion> {
  try {
    // Try reading a current-schema column — cheap because LIMIT 0 reads no rows
    await allAsync(
      conn,
      `SELECT basic_category FROM read_parquet('${s3Path}', hive_partitioning = 1) LIMIT 0`,
    );
    return "current";
  } catch {
    return "legacy";
  }
}

// ── Schema-aware SQL ──────────────────────────────────────────────────────────

/**
 * Builds a SELECT query that projects both schema variants into the same
 * OvertureRawRow shape. Fields absent in the active schema are projected as NULL.
 *
 * Current schema fields:  basic_category, taxonomy.primary/alternates/hierarchy, sources
 * Legacy schema fields:   categories.primary, categories.alternate
 * Common fields:          id, names, confidence, websites, addresses, brand, bbox
 */
function buildSelectSql(s3Path: string, bbox: BoundingBox, schema: OvertureSchemaVersion): string {
  const bboxFilter = `
    (bbox.xmin + bbox.xmax) / 2.0 BETWEEN ${bbox.minLng} AND ${bbox.maxLng}
    AND (bbox.ymin + bbox.ymax) / 2.0 BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
  `.trim();

  if (schema === "current") {
    return `
      SELECT
        id,
        names.primary                              AS name_primary,
        names.common                               AS names_common,
        basic_category                             AS basic_category,
        taxonomy.primary                           AS taxonomy_primary,
        taxonomy.alternates                        AS taxonomy_alternates,
        taxonomy.hierarchy                         AS taxonomy_hierarchy,
        NULL::VARCHAR                              AS category_primary,
        NULL::VARCHAR[]                            AS categories_alternate,
        confidence,
        websites,
        addresses,
        sources,
        COALESCE(brand.names.primary, NULL)        AS brand_name,
        (bbox.xmin + bbox.xmax) / 2.0             AS lng,
        (bbox.ymin + bbox.ymax) / 2.0             AS lat
      FROM read_parquet('${s3Path}', hive_partitioning = 1)
      WHERE ${bboxFilter}
    `;
  }

  // Legacy schema
  return `
    SELECT
      id,
      names.primary                              AS name_primary,
      names.common                               AS names_common,
      NULL::VARCHAR                              AS basic_category,
      NULL::VARCHAR                              AS taxonomy_primary,
      NULL::VARCHAR[]                            AS taxonomy_alternates,
      NULL::VARCHAR[]                            AS taxonomy_hierarchy,
      categories.primary                         AS category_primary,
      categories.alternate                       AS categories_alternate,
      confidence,
      websites,
      addresses,
      NULL                                       AS sources,
      COALESCE(brand.names.primary, NULL)        AS brand_name,
      (bbox.xmin + bbox.xmax) / 2.0             AS lng,
      (bbox.ymin + bbox.ymax) / 2.0             AS lat
    FROM read_parquet('${s3Path}', hive_partitioning = 1)
    WHERE ${bboxFilter}
  `;
}

// ── Main query function ───────────────────────────────────────────────────────

/**
 * Queries the Overture Places dataset for a given bounding box.
 *
 * Uses DuckDB HTTPFS to read directly from the public Overture S3 bucket —
 * no local download required. DuckDB uses Parquet row-group statistics to
 * skip data outside the bounding box, so only a fraction of the global
 * dataset is read.
 *
 * Estimated data read per city query: 50-200 MB (vs. 100 GB+ global dataset).
 * No AWS credentials are required (Overture bucket is publicly readable).
 *
 * Returns raw rows before travel-relevance filtering.
 */
export async function queryOverturePlaces(
  bbox: BoundingBox,
  release: string,
  verbose = false,
): Promise<OvertureRawRow[]> {
  const db   = new duckdb.Database(":memory:");
  const conn = db.connect();

  if (verbose) console.log("[overture/query] Installing extensions...");

  await execAsync(conn, "INSTALL httpfs; LOAD httpfs;");
  await execAsync(conn, `
    SET s3_region = 'us-west-2';
    SET s3_access_key_id     = '';
    SET s3_secret_access_key = '';
    SET s3_session_token     = '';
  `);

  const s3Path = overtureS3Path(release);

  if (verbose) {
    console.log(`[overture/query] Querying ${s3Path}`);
    console.log(`[overture/query] BBox: lng ${bbox.minLng}..${bbox.maxLng}, lat ${bbox.minLat}..${bbox.maxLat}`);
    console.log("[overture/query] Detecting schema version...");
  }

  const schema = await detectSchemaVersion(conn, s3Path);

  if (verbose) console.log(`[overture/query] Schema: ${schema}`);

  const sql = buildSelectSql(s3Path, bbox, schema);

  if (verbose) console.log("[overture/query] Running SQL...");

  const rows = await allAsync(conn, sql);

  if (verbose) console.log(`[overture/query] Received ${rows.length} raw rows`);

  db.close();

  return rows as unknown as OvertureRawRow[];
}

/**
 * Returns the count of places in the bounding box without fetching all columns.
 * Useful for a quick sanity check before running the full import.
 */
export async function countOverturePlaces(
  bbox: BoundingBox,
  release: string,
): Promise<number> {
  const db   = new duckdb.Database(":memory:");
  const conn = db.connect();

  await execAsync(conn, "INSTALL httpfs; LOAD httpfs;");
  await execAsync(conn, `
    SET s3_region = 'us-west-2';
    SET s3_access_key_id     = '';
    SET s3_secret_access_key = '';
    SET s3_session_token     = '';
  `);

  const sql = `
    SELECT COUNT(*) AS cnt
    FROM read_parquet('${overtureS3Path(release)}', hive_partitioning = 1)
    WHERE
      (bbox.xmin + bbox.xmax) / 2.0 BETWEEN ${bbox.minLng} AND ${bbox.maxLng}
      AND (bbox.ymin + bbox.ymax) / 2.0 BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
  `;

  const rows = await allAsync(conn, sql);
  db.close();
  return Number((rows[0] as { cnt: unknown }).cnt ?? 0);
}
