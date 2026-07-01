/**
 * Compatibility declarations used by the local DuckDB scripts.
 */
declare module "duckdb" {
  type RowData = Record<string, unknown>;

  class Database {
    constructor(path: string, callback?: (err: Error | null) => void);
    connect(): Connection;
    close(callback?: (err: Error | null) => void): void;
    interrupt(): void;
  }

  class Connection {
    close(callback?: (err: Error | null) => void): void;
    exec(sql: string, callback: (err: Error | null) => void): void;
    all(sql: string, callback: (err: Error | null, rows: RowData[]) => void): void;
    run(sql: string, callback?: (err: Error | null) => void): void;
  }

  export { Database, Connection };
}
