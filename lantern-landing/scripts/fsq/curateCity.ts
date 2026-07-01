#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { curateTokyoCatalog, curationCsv } from "./lib/curation";
import type { NormalizedActivity } from "../../lib/activities/types";

function main(): void {
  const args = process.argv.slice(2);
  const city = args.find((arg) => arg.startsWith("--city="))?.slice(7).toLowerCase();
  if (city !== "tokyo") throw new Error("FSQ curator requires --city=tokyo");
  if (args.includes("--write")) throw new Error("FSQ curator is local-only and does not support --write");
  const outputDir = path.join(__dirname, "output");
  const inputFile = path.join(outputDir, "tokyo-fsq-os-validation.json");
  const importReportFile = path.join(outputDir, "tokyo-fsq-os-validation.report.json");
  if (!fs.existsSync(inputFile) || !fs.existsSync(importReportFile)) throw new Error("Run the 20,000-row Tokyo FSQ validation importer first");

  const activities = JSON.parse(fs.readFileSync(inputFile, "utf8")) as NormalizedActivity[];
  const importReport = JSON.parse(fs.readFileSync(importReportFile, "utf8"));
  const result = curateTokyoCatalog(activities, importReport);
  const curatedFile = path.join(outputDir, "tokyo-fsq-curated.json");
  const reserveFile = path.join(outputDir, "tokyo-fsq-reserve.json");
  const reportFile = path.join(outputDir, "tokyo-fsq-curated.report.json");
  const reviewFile = path.join(outputDir, "tokyo-fsq-review.csv");
  fs.writeFileSync(curatedFile, `${JSON.stringify(result.tierA, null, 2)}\n`, "utf8");
  fs.writeFileSync(reserveFile, `${JSON.stringify(result.tierB, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
  fs.writeFileSync(reviewFile, curationCsv([...result.tierA, ...result.tierB]), "utf8");
  console.log(`[fsq-curate] Tier A: ${result.tierA.length}; Tier B: ${result.tierB.length}`);
  console.log(`[fsq-curate] Acceptance: ${result.report.acceptancePassed ? "PASS" : "FAIL"}`);
  console.log(`[fsq-curate] Report: ${reportFile}`);
  console.log("[fsq-curate] Local-only curation complete; no Supabase writes occurred");
}

try {
  main();
} catch (error: unknown) {
  console.error(`[fsq-curate] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
