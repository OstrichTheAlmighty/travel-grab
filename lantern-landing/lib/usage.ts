import { supabaseAdmin } from "./supabase-server";

export const DAILY_LIMITS: Record<string, number> = {
  flights:    5,
  hotels:     5,
  activities: 10,
  itinerary:  3,
};

function today(): string {
  return new Date().toISOString().split("T")[0]!;
}

export interface UsageResult {
  allowed:   boolean;
  count:     number;
  limit:     number;
  remaining: number;
}

export async function checkUsage(userId: string, feature: string): Promise<UsageResult> {
  const limit = DAILY_LIMITS[feature] ?? Infinity;
  if (!supabaseAdmin) return { allowed: true, count: 0, limit, remaining: limit };

  const { data } = await supabaseAdmin
    .from("usage_tracking")
    .select("count")
    .eq("user_id",   userId)
    .eq("feature",   feature)
    .eq("usage_date", today())
    .maybeSingle();

  const count = (data as { count?: number } | null)?.count ?? 0;
  return { allowed: count < limit, count, limit, remaining: Math.max(0, limit - count) };
}

export async function incrementUsage(userId: string, feature: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.rpc("increment_usage", {
    p_user_id: userId,
    p_feature:  feature,
    p_date:     today(),
  });
}

export async function getAllUsage(userId: string): Promise<Record<string, UsageResult>> {
  const features = Object.keys(DAILY_LIMITS);
  const results = await Promise.all(features.map(f => checkUsage(userId, f)));
  return Object.fromEntries(features.map((f, i) => [f, results[i]!]));
}
