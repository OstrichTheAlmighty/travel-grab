/**
 * Reads FSQ activities from Supabase and converts to Activity[].
 *
 * FSQ rows store template fields under google_places_data.templates.*
 * (nested), while Google rows store them flat at the top level.
 * This reader handles the FSQ-specific shape.
 */

import { createClient } from "@supabase/supabase-js";
import type { Activity, Category, Badge } from "../../app/activities/data/types";

// ── Supabase client (server-side) ─────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Valid value sets ──────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set<Category>([
  "food", "nightlife", "culture", "adventure", "nature", "luxury", "hidden_gems",
]);

const VALID_BADGES = new Set<Badge>([
  "hidden_gem", "worth_the_splurge", "family_friendly", "popular", "free",
]);

// ── Supabase row shape (FSQ source) ──────────────────────────────────────────

interface FsqSupabaseRow {
  id: string;
  place_id: string;
  title: string;
  city: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  source: string;
  google_places_data: Record<string, unknown> | null;
}

// ── Row → Activity ────────────────────────────────────────────────────────────

function fsqRowToActivity(row: FsqSupabaseRow): Activity {
  const gd = (row.google_places_data ?? {}) as Record<string, unknown>;
  const t  = (gd.templates ?? {}) as Record<string, unknown>;

  const rawCat = (row.category ?? "culture") as Category;
  const cat: Category = VALID_CATEGORIES.has(rawCat) ? rawCat : "culture";

  const rawBadges = (t.badges as string[] | undefined) ?? [];
  const badges = rawBadges.filter((b): b is Badge => VALID_BADGES.has(b as Badge));

  const isFree = !!(t.is_free as boolean | undefined) || badges.includes("free");
  const price = isFree ? "Free" : ((t.price as string | undefined) ?? "Varies");

  return {
    id:           row.place_id || row.id,
    placeId:      (gd.google_place_id as string | undefined) || undefined,
    title:        row.title,
    neighborhood: (t.neighborhood as string | undefined) ?? row.city,
    duration:     (t.duration as string | undefined) ?? "1–2 hours",
    price,
    isFree,
    rating:       0,
    reviewCount:  0,
    description:  row.description ?? "",
    whyVisit:     (t.why_visit as string | undefined) ?? row.description ?? "",
    category:     cat,
    tags:         (t.tags as string[] | undefined) ?? [],
    badges,
    emoji:        (t.emoji as string | undefined) ?? "📍",
    gradient:     (t.gradient as string | undefined) ?? "radial-gradient(ellipse at 35% 30%, rgba(109,40,217,0.9) 0%, rgba(76,29,149,0.85) 45%, rgba(8,4,18,1) 100%)",
    photoRef:     row.image_url ?? (gd.photo_url as string | undefined) ?? undefined,
    websiteUri:   (gd.website as string | undefined),
    lat:          (gd.lat as number | undefined),
    lng:          (gd.lng as number | undefined),
    querySources: (gd.search_keywords as string[] | undefined),
  };
}

// ── City name normalizer ──────────────────────────────────────────────────────

function extractCityName(destination: string): string {
  return destination.split(",")[0].trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface FsqCityResult {
  activities: Activity[];
  city: string;
  country: string;
  source: "fsq_supabase";
}

/**
 * Check if a city has any FSQ activities in Supabase.
 * Cheap HEAD-style query (count only).
 */
export async function hasFsqCity(destination: string): Promise<boolean> {
  const cityName = extractCityName(destination);
  try {
    const sb = getSupabaseClient();
    const { count, error } = await sb
      .from("activities")
      .select("*", { count: "exact", head: true })
      .eq("city", cityName)
      .eq("source", "fsq")
      .limit(1);

    if (error) {
      console.error(`[fsq-reader] hasFsqCity error for "${cityName}": ${error.message}`);
      return false;
    }
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

const PAGE_SIZE = 1_000;

/**
 * Load all FSQ activities for a city from Supabase.
 * Returns null if no FSQ data exists for this city.
 */
export async function loadFsqCity(destination: string): Promise<FsqCityResult | null> {
  const cityName = extractCityName(destination);
  const sb = getSupabaseClient();

  const rows: FsqSupabaseRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("activities")
      .select("id, place_id, title, city, category, description, image_url, source, google_places_data")
      .eq("city", cityName)
      .eq("source", "fsq")
      .order("place_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`[fsq-reader] Query error for "${cityName}" (from=${from}): ${error.message}`);
      break;
    }

    if (!data || data.length === 0) break;
    rows.push(...(data as FsqSupabaseRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (rows.length === 0) return null;

  const activities = rows.map(fsqRowToActivity);

  // Infer country from first row's google_places_data if available
  const firstMeta = (rows[0].google_places_data ?? {}) as Record<string, unknown>;
  const country = (firstMeta.country_name as string | undefined) ?? "";

  console.log(`[fsq-reader] Loaded ${activities.length} FSQ activities for "${cityName}"`);

  return {
    activities,
    city: cityName,
    country,
    source: "fsq_supabase",
  };
}
