import { supabase } from "./supabase";

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token    = data.session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
