import { describe, expect, it, vi } from "vitest";
import type * as duckdb from "duckdb";
import {
  assertAllowedTable,
  FSQ_OS_TABLE,
  redactSecret,
  runFsqSmokeTest,
  validateDuckDbVersion,
  type SmokeDatabase,
} from "@/scripts/fsq/lib/smoke";

const TEST_TOKEN = "test-token-that-must-never-appear";

interface MockOptions {
  version?: string;
  failOn?: RegExp;
  failureMessage?: string;
}

function mockDatabase(options: MockOptions = {}) {
  const sql: string[] = [];
  const closeConnection = vi.fn((callback?: () => void) => callback?.());
  const closeDatabase = vi.fn((callback?: (error: Error | null) => void) => callback?.(null));
  const connection = {
    exec(statement: string, callback: (error: Error | null) => void) {
      sql.push(statement);
      callback(options.failOn?.test(statement) ? new Error(options.failureMessage ?? "request failed") : null);
    },
    all(statement: string, callback: (error: Error | null, rows?: unknown[]) => void) {
      sql.push(statement);
      if (options.failOn?.test(statement)) {
        callback(new Error(options.failureMessage ?? "request failed"));
        return;
      }
      if (statement.includes("version()")) callback(null, [{ version: options.version ?? "v1.4.4" }]);
      else if (statement.startsWith("DESCRIBE")) callback(null, [
        { column_name: "fsq_place_id" },
        { column_name: "name" },
        { column_name: "latitude" },
        { column_name: "longitude" },
        { column_name: "fsq_category_ids" },
      ]);
      else callback(null, [{
        fsq_place_id: "id-1",
        name: "Safe place",
        latitude: 1,
        longitude: 2,
        category_ids: [100],
      }]);
    },
    close: closeConnection,
  } as unknown as duckdb.Connection;
  const database: SmokeDatabase = {
    connect: () => connection,
    close: closeDatabase,
  };
  return { database, sql, closeConnection, closeDatabase };
}

describe("FSQ OS Places smoke test", () => {
  it("fails clearly when the token is missing without opening DuckDB", async () => {
    const createDatabase = vi.fn();
    await expect(runFsqSmokeTest({ token: undefined, createDatabase }))
      .rejects.toThrow("FSQ_OS_PLACES_TOKEN is missing");
    expect(createDatabase).not.toHaveBeenCalled();
  });

  it("redacts the token from authentication failures and logs", async () => {
    const mock = mockDatabase({
      failOn: /^ATTACH/,
      failureMessage: `401 unauthorized for ${TEST_TOKEN}`,
    });
    const messages: string[] = [];
    await expect(runFsqSmokeTest({
      token: TEST_TOKEN,
      createDatabase: () => mock.database,
      log: (message) => messages.push(message),
      error: (message) => messages.push(message),
    })).rejects.toThrow("FAILED (Iceberg catalog attachment/authentication): 401 unauthorized");
    expect(messages.join("\n")).not.toContain(TEST_TOKEN);
    expect(mock.closeConnection).toHaveBeenCalledOnce();
    expect(mock.closeDatabase).toHaveBeenCalledOnce();
  });

  it("allows only places.datasets.places_os", () => {
    expect(() => assertAllowedTable(FSQ_OS_TABLE)).not.toThrow();
    expect(() => assertAllowedTable("places.datasets.some_other_table"))
      .toThrow("Refusing to access non-OS table");
  });

  it("queries exactly five safe fields and contains no Supabase writes", async () => {
    const mock = mockDatabase();
    await runFsqSmokeTest({ token: TEST_TOKEN, createDatabase: () => mock.database });
    const source = mock.sql.join("\n");
    expect(source).toContain(
      `SELECT fsq_place_id, name, latitude, longitude, fsq_category_ids AS category_ids FROM ${FSQ_OS_TABLE} LIMIT 5`,
    );
    expect(source).not.toMatch(/supabase|insert\s+into|update\s+|delete\s+from/i);
    expect(source).not.toMatch(/places\.datasets\.(?!places_os)/i);
  });

  it("validates DuckDB 1.4.0 or later", () => {
    expect(() => validateDuckDbVersion("v1.4.0")).not.toThrow();
    expect(() => validateDuckDbVersion("v1.4.4")).not.toThrow();
    expect(() => validateDuckDbVersion("v2.0.0")).not.toThrow();
    expect(() => validateDuckDbVersion("v1.3.9")).toThrow("1.4.0 or later");
    expect(() => validateDuckDbVersion("unknown")).toThrow("could not parse");
  });

  it("redacts secrets from generated SQL-shaped errors", () => {
    const redacted = redactSecret(`error TOKEN '${TEST_TOKEN}'`, TEST_TOKEN);
    expect(redacted).toBe("error TOKEN '[REDACTED]'");
  });
});
