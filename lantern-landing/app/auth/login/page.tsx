"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/app/components/Logo";
import { BRAND_NAME } from "@/lib/brand";

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get("redirect") ?? "/flights";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) { setError("Auth not configured."); return; }
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push(redirect);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 [color-scheme:light]">
      <div className="w-full max-w-sm">

        <a href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo size={32} />
          <span className="text-sm font-bold tracking-tight text-gray-900">{BRAND_NAME}</span>
        </a>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-bold text-gray-900">Welcome back</h1>
          <p className="mb-6 text-sm text-gray-500">Log in to your {BRAND_NAME} account.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 [color-scheme:light]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 [color-scheme:light]"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-lantern-mint py-2.5 text-sm font-bold text-[#0A0A0A] transition hover:bg-lantern-mint/85 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <a href="/auth/signup" className="font-medium text-teal-600 hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
