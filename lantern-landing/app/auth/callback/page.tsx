"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/app/components/Logo";
import { BRAND_NAME } from "@/lib/brand";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setError("Auth not configured."); return; }

    const code = new URLSearchParams(window.location.search).get("code");

    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            setError("This confirmation link has expired or already been used.");
          } else {
            router.replace("/flights");
          }
        });
    } else {
      // Hash-based tokens (older Supabase flow)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace("/flights");
        } else {
          setError("Invalid or expired confirmation link.");
        }
      });
    }
  }, [router]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 [color-scheme:light]">
        <div className="w-full max-w-sm text-center">
          <a href="/" className="mb-8 flex items-center justify-center gap-2.5">
            <Logo size={32} />
            <span className="text-sm font-bold tracking-tight text-gray-900">{BRAND_NAME}</span>
          </a>
          <div className="rounded-xl border border-red-100 bg-red-50 p-8">
            <p className="mb-1 font-semibold text-red-700">Link expired</p>
            <p className="mb-6 text-sm text-red-600">{error}</p>
            <a
              href="/auth/signup"
              className="inline-block rounded-lg bg-lantern-mint px-5 py-2.5 text-sm font-bold text-[#0A0A0A] transition hover:bg-lantern-mint/85"
            >
              Sign up again
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white [color-scheme:light]">
      <div className="text-center">
        <div className="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-teal-500" />
        <p className="text-sm text-gray-500">Confirming your account…</p>
      </div>
    </main>
  );
}
