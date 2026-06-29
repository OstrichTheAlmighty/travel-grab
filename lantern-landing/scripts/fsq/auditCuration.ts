#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import type { NormalizedActivity } from "../../lib/activities/types";
import type { CuratedActivity } from "./lib/curation";
import { auditCsv, buildCurationAudit } from "./lib/curationAudit";

function main(): void {
  const city = process.argv.slice(2).find((arg) => arg.startsWith("--city="))?.slice(7).toLowerCase();
  if (city !== "tokyo") throw new Error("FSQ curation audit requires --city=tokyo");
  const outputDir = path.join(__dirname, "output");
  const read = <T>(name: string) => JSON.parse(fs.readFileSync(path.join(outputDir, name), "utf8")) as T;
  const tierA = read<CuratedActivity[]>("tokyo-fsq-curated.json");
  const tierB = read<CuratedActivity[]>("tokyo-fsq-reserve.json");
  const source = read<NormalizedActivity[]>("tokyo-fsq-os-validation.json");
  const curationReport = read<Record<string, unknown>>("tokyo-fsq-curated.report.json");
  const importReport = read<Record<string, unknown>>("tokyo-fsq-os-validation.report.json");
  const reviewCsv = fs.readFileSync(path.join(outputDir, "tokyo-fsq-review.csv"), "utf8");
  const audit = buildCurationAudit(tierA, tierB, source, curationReport, importReport, reviewCsv);
  const jsonPath = path.join(outputDir, "tokyo-fsq-curation-audit.json");
  const csvPath = path.join(outputDir, "tokyo-fsq-curation-audit.csv");
  fs.writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvPath, auditCsv(audit), "utf8");
  console.log(`[fsq-audit] Tier intersection: ${audit.integrity.overlapCount}; combined unique IDs: ${audit.integrity.combinedUniqueIds}`);
  console.log(`[fsq-audit] CSV data rows: ${audit.csvValidation.totalDataRows}; malformed: ${audit.csvValidation.malformedRows}`);
  console.log(`[fsq-audit] Result: ${audit.auditPassed ? "PASS" : "FAIL"}`);
  console.log(`[fsq-audit] Report: ${jsonPath}`);
  console.log("[fsq-audit] Read-only local audit complete; no Supabase writes occurred");
  if (!audit.auditPassed) process.exitCode = 1;
}

try { main(); }
catch (error: unknown) {
  console.error(`[fsq-audit] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
