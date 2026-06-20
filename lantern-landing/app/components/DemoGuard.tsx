"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LS_KEY = "travelgrab_demo_access_v1";

function DemoGuardInner({ children }: { children: React.ReactNode }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const expectedKey = process.env.NEXT_PUBLIC_DEMO_KEY ?? "";
    const urlKey      = searchParams.get("demo_key");

    // If URL carries a matching key, save it and clean the URL
    if (urlKey && expectedKey && urlKey === expectedKey) {
      try { localStorage.setItem(LS_KEY, urlKey); } catch { /* quota */ }
      const params = new URLSearchParams(searchParams.toString());
      params.delete("demo_key");
      const clean = window.location.pathname + (params.size > 0 ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    }

    const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ENABLED === "true";
    const storedKey   = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();
    const hasKey      = !!expectedKey && storedKey === expectedKey;

    if (demoEnabled || hasKey) {
      setAllowed(true);
    } else {
      router.replace("/");
    }
  }, [searchParams, router]);

  if (!allowed) return null;
  return <>{children}</>;
}

// Suspense required because useSearchParams() needs it in Next.js App Router
export default function DemoGuard({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <DemoGuardInner>{children}</DemoGuardInner>
    </Suspense>
  );
}
