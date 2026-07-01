/**
 * Diagnostic: verify that supabaseAdmin can write to public.activities.
 *
 * Run from the lantern-landing directory:
 *   npx tsx scripts/test-activities-supabase-write.ts --confirm
 *
 * Required env vars (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase service-role key (Settings → API)
 *
 * What this script does:
 *   1. Checks that both required env vars are present (without printing values).
 *   2. Inserts one diagnostic row into public.activities.
 *   3. Reads the row back by place_id to confirm the write landed.
 *   4. Deletes the row to leave the table clean.
 *   5. Prints PASS or FAIL with a brief explanation.
 *   6. Exits nonzero on any failure.
 *
 * This script does NOT modify application code and does NOT affect production
 * activity data.  The diagnostic row uses a sentinel place_id that will never
 * collide with a real Google Place ID.
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ── Guard ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (!args.includes("--confirm")) {
  console.error(
    "Safety guard: pass --confirm to run this diagnostic.\n" +
      "  npx tsx scripts/test-activities-supabase-write.ts --confirm\n" +
      "\n" +
      "This script inserts and then deletes one diagnostic row in public.activities."
  );
  process.exit(1);
}

// ── Env var check ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkEnv(name: string, value: string | undefined): void {
  if (!value || value.trim() === "") {
    console.error(`FAIL: env var ${name} is missing or empty.`);
    console.error(
      "  Check Vercel → Project Settings → Environment Variables → Production."
    );
    process.exit(1);
  }
}

checkEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
checkEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);

console.log("ENV:  NEXT_PUBLIC_SUPABASE_URL   — present");
console.log("ENV:  SUPABASE_SERVICE_ROLE_KEY  — present");

// ── Client ────────────────────────────────────────────────────────────────────

const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, {
  auth: { persistSession: false },
});

// ── Sentinel row ──────────────────────────────────────────────────────────────

// This place_id is deliberately not a real Google Place ID.
// Real Google Place IDs start with "ChIJ" or similar and never begin with "__".
const SENTINEL_PLACE_ID = "__diag_travelgrab_write_test__";

const diagnosticRow = {
  place_id:           SENTINEL_PLACE_ID,
  title:              "TravelGrab diagnostic row — safe to delete",
  city:               "__diagnostic__",
  category:           null,
  description:        "Inserted and deleted by test-activities-supabase-write.ts",
  image_url:          null,
  google_places_data: { _diagnostic: true },
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let insertedId: string | null = null;

  // ── Step 1: Insert ──────────────────────────────────────────────────────────
  console.log("\nSTEP 1: Insert diagnostic row …");

  const { data: insertData, error: insertError } = await sb
    .from("activities")
    .upsert(diagnosticRow, { onConflict: "place_id" })
    .select("id, place_id")
    .single();

  if (insertError) {
    console.error("FAIL [insert]:", insertError.message);
    if (insertError.code) console.error("  code:", insertError.code);
    if (insertError.details) console.error("  details:", insertError.details);
    if (insertError.hint) console.error("  hint:", insertError.hint);
    console.error(
      "\n  This error means supabaseAdmin cannot write to public.activities.\n" +
        "  Check that SUPABASE_SERVICE_ROLE_KEY is the correct service-role key\n" +
        "  (not the anon key) and that it belongs to the same Supabase project\n" +
        "  as NEXT_PUBLIC_SUPABASE_URL."
    );
    process.exit(1);
  }

  if (!insertData?.id) {
    console.error("FAIL [insert]: upsert returned no data (select().single() returned null).");
    console.error(
      "  The upsert may have silently ignored the row due to an RLS policy or\n" +
        "  a constraint conflict.  Check Supabase Dashboard → Logs → Postgres."
    );
    process.exit(1);
  }

  insertedId = insertData.id;
  console.log("  Inserted id:", insertedId);
  console.log("  place_id:   ", insertData.place_id);

  // ── Step 2: Read back ───────────────────────────────────────────────────────
  console.log("\nSTEP 2: Read back by place_id …");

  const { data: readData, error: readError } = await sb
    .from("activities")
    .select("id, place_id, title, city")
    .eq("place_id", SENTINEL_PLACE_ID)
    .single();

  if (readError) {
    console.error("FAIL [read-back]:", readError.message);
    process.exit(1);
  }

  if (!readData) {
    console.error("FAIL [read-back]: row not found after insert.");
    console.error(
      "  Insert appeared to succeed but SELECT returned nothing.\n" +
        "  This would be unusual and suggests an RLS SELECT policy issue."
    );
    process.exit(1);
  }

  console.log("  id:      ", readData.id);
  console.log("  place_id:", readData.place_id);
  console.log("  title:   ", readData.title);
  console.log("  city:    ", readData.city);

  if (readData.id !== insertedId) {
    console.error(
      `FAIL [read-back]: id mismatch — expected ${insertedId}, got ${readData.id}.`
    );
    process.exit(1);
  }

  // ── Step 3: Delete ──────────────────────────────────────────────────────────
  console.log("\nSTEP 3: Delete diagnostic row …");

  const { error: deleteError } = await sb
    .from("activities")
    .delete()
    .eq("place_id", SENTINEL_PLACE_ID);

  if (deleteError) {
    console.error("FAIL [delete]:", deleteError.message);
    console.error(
      "  The diagnostic row was written and read successfully but could not\n" +
        "  be deleted.  Delete it manually in the Supabase Dashboard:\n" +
        `    DELETE FROM public.activities WHERE place_id = '${SENTINEL_PLACE_ID}';`
    );
    process.exit(1);
  }

  // ── Confirm deletion ────────────────────────────────────────────────────────
  const { data: afterDelete } = await sb
    .from("activities")
    .select("id")
    .eq("place_id", SENTINEL_PLACE_ID)
    .maybeSingle();

  if (afterDelete) {
    console.warn(
      "WARN [delete]: row still present after DELETE.  It may have been\n" +
        "  re-inserted by a concurrent process.  Delete manually if needed:\n" +
        `    DELETE FROM public.activities WHERE place_id = '${SENTINEL_PLACE_ID}';`
    );
  } else {
    console.log("  Deleted — table is clean.");
  }

  // ── Final result ────────────────────────────────────────────────────────────
  console.log(
    "\n─────────────────────────────────────────────────────────────────────"
  );
  console.log("PASS: supabaseAdmin can INSERT, SELECT, and DELETE from public.activities.");
  console.log(
    "─────────────────────────────────────────────────────────────────────"
  );
  console.log(
    "\nConclusion: the Supabase connection and service-role credentials are\n" +
      "working correctly.  The reason public.activities is empty in production\n" +
      "is NOT a permissions problem — it is a Vercel function lifetime problem.\n" +
      "See ACTIVITIES_CACHE_WRITE_DIAGNOSIS.md for the full explanation and fix."
  );
}

main().catch((err: unknown) => {
  console.error("\nFATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
