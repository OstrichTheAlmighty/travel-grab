/**
 * Writes FSQ activities to Supabase public.activities.
 *
 * place_id is stored as 'fsq:' + fsq_place_id so the existing UNIQUE
 * constraint on place_id enables clean upserts on re-runs.
 *
 * Required env vars (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as path from "node:path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { NormalizedActivity } from "../../lib/activities/types";
import type { TemplateFields } from "./lib/templateFields";

dotenv.config({ path: path.join(__dirname, "../../.env.local"), quiet: true });

// ── Supabase client ───────────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Row shape ─────────────────────────────────────────────────────────────────

interface FsqSupabaseRow {
  place_id: string;
  title: string;
  city: string;
  category: string;
  description: string | null;
  image_url: string | null;
  source: string;
  google_places_data: Record<string, unknown>;
  photos: unknown[];
}

// ── Write result ──────────────────────────────────────────────────────────────

export interface WriteResult {
  city: string;
  attempted: number;
  upserted: number;
  errors: number;
  elapsedMs: number;
}

// ── Build row ─────────────────────────────────────────────────────────────────

export function buildFsqRow(
  activity: NormalizedActivity,
  templates: TemplateFields,
  overviewText: string | null,
  cityName: string,
): FsqSupabaseRow {
  const meta = activity.source_metadata ?? {};
  const fsqPlaceId = activity.source_record_id ?? activity.id.replace(/^fsq:/, "");

  // Wikimedia image from photos array
  const wikiPhoto = activity.photos.find((p) => p.provider === "wikimedia");
  const imageUrl = wikiPhoto?.url ?? null;
  const wikimediaPhotos = activity.photos
    .filter((p) => p.provider === "wikimedia")
    .map((p) => ({
      source: "wikimedia",
      url: p.url,
      attribution: p.attribution_name,
      attribution_url: p.attribution_url,
      license: p.license,
      width: p.width,
      height: p.height,
    }));

  const description = overviewText ?? activity.description ?? null;

  return {
    place_id: `fsq:${fsqPlaceId}`,
    title: activity.title,
    city: cityName,
    category: activity.category,
    description,
    image_url: imageUrl,
    source: "fsq",
    photos: wikimediaPhotos,
    google_places_data: {
      source: "fsq",
      fsq_place_id: fsqPlaceId,
      lat: activity.lat,
      lng: activity.lng,
      address: meta.address ?? null,
      locality: meta.locality ?? null,
      region: meta.region ?? null,
      country_code: null,
      website: activity.website ?? null,
      fsq_category_ids: meta.fsq_category_ids ?? [],
      fsq_category_labels: meta.fsq_category_labels ?? [],
      detailed_subcategories: meta.detailed_subcategories ?? [],
      primary_fsq_category: meta.primary_fsq_category ?? null,
      quality_score: meta.travel_value_score ?? null,
      search_keywords: activity.search_keywords,
      name_local: activity.name_local ?? null,
      templates: {
        neighborhood: templates.neighborhood,
        duration: templates.duration,
        price: templates.price,
        is_free: templates.isFree,
        tags: templates.tags,
        badges: templates.badges,
        emoji: templates.emoji,
        gradient: templates.gradient,
        why_visit: templates.whyVisit,
      },
    },
  };
}

// ── Bulk upsert ───────────────────────────────────────────────────────────────

const CHUNK_SIZE = 500;

export async function writeFsqActivitiesToSupabase(
  rows: FsqSupabaseRow[],
  cityName: string,
): Promise<WriteResult> {
  const started = Date.now();
  const sb = getSupabaseClient();
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error, count } = await sb
      .from("activities")
      .upsert(chunk, { onConflict: "place_id", count: "exact" });

    if (error) {
      console.error(`[writeToSupabase] chunk ${i}-${i + chunk.length - 1} error: ${error.message}`);
      errors += chunk.length;
    } else {
      upserted += count ?? chunk.length;
    }
  }

  return {
    city: cityName,
    attempted: rows.length,
    upserted,
    errors,
    elapsedMs: Date.now() - started,
  };
}

// ── Update overviews ──────────────────────────────────────────────────────────

export async function updateFsqOverviews(
  overviews: Map<string, string>,
): Promise<{ updated: number; errors: number }> {
  const sb = getSupabaseClient();
  let updated = 0;
  let errors = 0;

  const entries = [...overviews.entries()];
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(([placeId, description]) =>
      sb
        .from("activities")
        .update({ description })
        .eq("place_id", placeId)
        .eq("source", "fsq"),
    );
    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === "rejected" || result.value.error) {
        errors++;
      } else {
        updated++;
      }
    }
  }

  return { updated, errors };
}

// ── Wipe city ─────────────────────────────────────────────────────────────────

export async function deleteFsqCityActivities(cityName: string): Promise<number> {
  const sb = getSupabaseClient();
  const { count, error } = await sb
    .from("activities")
    .delete({ count: "exact" })
    .eq("city", cityName)
    .eq("source", "fsq");
  if (error) throw new Error(`[writeToSupabase] delete failed for ${cityName}: ${error.message}`);
  return count ?? 0;
}

// ── Count existing ────────────────────────────────────────────────────────────

export async function countFsqCityActivities(cityName: string): Promise<number> {
  const sb = getSupabaseClient();
  const { count, error } = await sb
    .from("activities")
    .select("*", { count: "exact", head: true })
    .eq("city", cityName)
    .eq("source", "fsq");
  if (error) return 0;
  return count ?? 0;
}
