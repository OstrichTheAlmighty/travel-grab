import { createClient } from "@supabase/supabase-js";

const rawUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const url        = rawUrl.replace(/\/rest\/v1\/?$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null;
