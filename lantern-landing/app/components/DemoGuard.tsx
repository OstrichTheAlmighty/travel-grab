"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LS_KEY = "travelgrab_demo_access_v1";

/**
 * Pure function containing the access decision.
 * Exported so it can be unit-tested without a React environment.
 *
 * Priority order:
 *   1. demoEnabled  — NEXT_PUBLIC_DEMO_ENABLED=true bypasses the gate entirely.
 *   2. storedKey    — a matching key previously saved to localStorage grants access.
 */
export function checkDemoAccess(
  demoEnabled: boolean,
  expectedKey: string,
  storedKey: string | null,
): boolean {
  if (demoEnabled) return true;
  return !!expectedKey && storedKey === expectedKey;
}

function DemoGuardInner({ children }: { children: React.ReactNode }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // Check the global demo-enabled flag first — no localStorage read needed.
    const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ENABLED === "true";
    if (demoEnabled) {
      setAllowed(true);
      return;
    }

    const expectedKey = process.env.NEXT_PUBLIC_DEMO_KEY ?? "";
    const urlKey      = searchParams.get("demo_key");

    // If URL carries a matching key, persist it and clean the URL.
    if (urlKey && expectedKey && urlKey === expectedKey) {
      try { localStorage.setItem(LS_KEY, urlKey); } catch { /* quota */ }
      const params = new URLSearchParams(searchParams.toString());
      params.delete("demo_key");
      const clean = window.location.pathname + (params.size > 0 ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    }

    const storedKey = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();

    if (checkDemoAccess(false, expectedKey, storedKey)) {
      setAllowed(true);
    } else {
      router.replace("/");
    }
  }, [searchParams, router]);

  if (!allowed) return null;
  return <>{children}</>;
}

// Suspense required because useSearchParams() needs it in Next.js App Router.
export default function DemoGuard({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <DemoGuardInner>{children}</DemoGuardInner>
    </Suspense>
  );
}
