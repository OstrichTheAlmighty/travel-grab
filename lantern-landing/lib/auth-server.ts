import { supabaseAdmin } from "./supabase-server";

export function isAdminRequest(req: Request): boolean {
  const cookie = req.headers.get("cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === "tg_admin=1");
}

export async function getUserFromRequest(req: Request): Promise<{ id: string } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || !supabaseAdmin) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id };
}
