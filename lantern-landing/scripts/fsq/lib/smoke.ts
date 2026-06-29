import type * as duckdb from "duckdb";

export const FSQ_OS_TABLE = "places.datasets.places_os" as const;
export const MIN_DUCKDB_VERSION = "1.4.0" as const;

type Row = Record<string, unknown>;

export interface SmokeDatabase {
  connect(): duckdb.Connection;
  close(callback?: (error: Error | null) => void): void;
}

export interface SmokeOptions {
  token: string | undefined;
  createDatabase: () => SmokeDatabase;
  log?: (message: string) => void;
  error?: (message: string) => void;
  stepTimeoutMs?: number;
}

export interface SafeSample {
  placeId: unknown;
  name: unknown;
  latitude: unknown;
  longitude: unknown;
  categoryIds: unknown[];
}

export interface SmokeResult {
  version: string;
  columns: string[];
  samples: SafeSample[];
}

export function assertAllowedTable(table: string): asserts table is typeof FSQ_OS_TABLE {
  if (table !== FSQ_OS_TABLE) {
    throw new Error(`[fsq-smoke] Refusing to access non-OS table: ${table}`);
  }
}

export function validateDuckDbVersion(version: string): void {
  const match = version.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) {
    throw new Error(`[fsq-smoke] DuckDB version check failed: could not parse "${version}"`);
  }

  const actual = match.slice(1, 4).map(Number);
  const minimum = MIN_DUCKDB_VERSION.split(".").map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return;
    if (actual[index] < minimum[index]) {
      throw new Error(
        `[fsq-smoke] DuckDB ${version} is unsupported; ${MIN_DUCKDB_VERSION} or later is required`,
      );
    }
  }
}

export function redactSecret(message: string, token?: string): string {
  let safe = message;
  if (token) safe = safe.split(token).join("[REDACTED]");
  return safe.replace(/(TOKEN\s+')[^']*(')/gi, "$1[REDACTED]$2");
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function exec(conn: duckdb.Connection, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, (error) => error ? reject(error) : resolve());
  });
}

function all(conn: duckdb.Connection, sql: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (error, rows) => error ? reject(error) : resolve(rows as Row[]));
  });
}

function closeConnection(conn: duckdb.Connection): Promise<void> {
  return new Promise((resolve) => conn.close(() => resolve()));
}

function closeDatabase(db: SmokeDatabase): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

function categoryIds(value: unknown): unknown[] {
  let categories = value;
  if (typeof categories === "string") {
    try {
      categories = JSON.parse(categories) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(categories)) return [];
  return categories.flatMap((category) => {
    if (["string", "number", "bigint"].includes(typeof category)) return [category];
    if (!category || typeof category !== "object") return [];
    const record = category as Record<string, unknown>;
    const id = record.id ?? record.category_id ?? record.fsq_category_id;
    return id === undefined || id === null ? [] : [id];
  });
}

async function timed<T>(label: string, timeoutMs: number, operation: () => Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runFsqSmokeTest(options: SmokeOptions): Promise<SmokeResult> {
  const log = options.log ?? (() => undefined);
  const token = options.token?.trim();
  const timeoutMs = options.stepTimeoutMs ?? 45_000;
  if (!token) {
    throw new Error("[fsq-smoke] FAILED (credentials): FSQ_OS_PLACES_TOKEN is missing from .env.local");
  }

  log("[fsq-smoke] FSQ_OS_PLACES_TOKEN is present (value hidden)");
  assertAllowedTable(FSQ_OS_TABLE);

  const db = options.createDatabase();
  const conn = db.connect();
  let stage = "DuckDB version check";
  try {
    const versionRows = await timed(stage, timeoutMs, () => all(conn, "SELECT version() AS version"));
    const version = String(versionRows[0]?.version ?? "unknown");
    validateDuckDbVersion(version);
    log(`[fsq-smoke] DuckDB version: ${version}`);

    stage = "httpfs extension installation/loading";
    await timed(stage, timeoutMs, () => exec(conn, "INSTALL httpfs; LOAD httpfs;"));
    stage = "iceberg extension installation/loading";
    await timed(stage, timeoutMs, () => exec(conn, "INSTALL iceberg; LOAD iceberg;"));
    log("[fsq-smoke] httpfs and iceberg extensions loaded");

    stage = "Iceberg credential creation";
    await timed(stage, timeoutMs, () => exec(conn, `CREATE SECRET iceberg_secret (
      TYPE ICEBERG,
      TOKEN ${sqlString(token)}
    );`));

    stage = "Iceberg catalog attachment/authentication";
    await timed(stage, timeoutMs, () => exec(conn, `ATTACH 'places' AS places (
      TYPE iceberg,
      SECRET iceberg_secret,
      ENDPOINT 'https://catalog.h3-hub.foursquare.com/iceberg'
    );`));

    stage = `${FSQ_OS_TABLE} discovery`;
    const schema = await timed(stage, timeoutMs, () => all(conn, `DESCRIBE ${FSQ_OS_TABLE}`));
    const columns = schema.map((row) => String(row.column_name ?? "")).filter(Boolean);
    if (columns.length === 0) throw new Error("DESCRIBE returned no columns");
    log(`[fsq-smoke] Table found: ${FSQ_OS_TABLE}`);
    log(`[fsq-smoke] Columns: ${columns.join(", ")}`);

    const required = ["fsq_place_id", "name", "latitude", "longitude"];
    const missing = required.filter((column) => !columns.includes(column));
    if (missing.length > 0) {
      throw new Error(`safe sample columns missing: ${missing.join(", ")}`);
    }
    const categoryColumn = columns.includes("fsq_category_ids")
      ? "fsq_category_ids"
      : columns.includes("categories") ? "categories" : undefined;
    if (!categoryColumn) throw new Error("safe category identifier column missing");

    stage = "five-row safe sample query";
    const rows = await timed(stage, timeoutMs, () => all(conn,
      `SELECT fsq_place_id, name, latitude, longitude, ${categoryColumn} AS category_ids FROM ${FSQ_OS_TABLE} LIMIT 5`,
    ));
    if (rows.length > 5) throw new Error("sample limit was not enforced");
    const samples = rows.map((row) => ({
      placeId: row.fsq_place_id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      categoryIds: categoryIds(row.category_ids),
    }));
    log(`[fsq-smoke] Safe sample rows (${samples.length}):`);
    for (const sample of samples) log(`  ${JSON.stringify(sample)}`);
    log("[fsq-smoke] SUCCESS");
    return { version, columns, samples };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = redactSecret(
      `[fsq-smoke] FAILED (${stage}): ${detail}`,
      token,
    );
    options.error?.(message);
    throw new Error(message);
  } finally {
    await closeConnection(conn);
    await closeDatabase(db);
  }
}
