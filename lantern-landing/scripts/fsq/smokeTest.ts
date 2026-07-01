#!/usr/bin/env node

import * as path from "path";
import dotenv from "dotenv";
import * as duckdb from "duckdb";
import { runFsqSmokeTest } from "./lib/smoke";

dotenv.config({
  path: path.join(__dirname, "../../.env.local"),
  quiet: true,
});

void runFsqSmokeTest({
  token: process.env.FSQ_OS_PLACES_TOKEN,
  createDatabase: () => new duckdb.Database(":memory:"),
  log: (message) => console.log(message),
}).then(
  () => {
    process.exitCode = 0;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "[fsq-smoke] FAILED: Unknown error");
    process.exitCode = 1;
  },
);
