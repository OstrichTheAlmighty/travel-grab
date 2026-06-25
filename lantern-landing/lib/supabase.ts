import { createClient } from "@supabase/supabase-js";

// Strip /rest/v1 suffix if accidentally included in the env var
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const url = rawUrl.replace(/\/rest\/v1\/?$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Returns null when env vars aren't set — callers must guard with `if (supabase)`
export const supabase = url && key ? createClient(url, key) : null;
