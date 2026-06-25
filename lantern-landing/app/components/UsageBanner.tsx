"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { DAILY_LIMITS } from "@/lib/usage";
import type { UsageResult } from "@/lib/usage";

interface Props {
  feature: keyof typeof DAILY_LIMITS;
}

export default function UsageBanner({ feature }: Props) {
  const [usage, setUsage] = useState<UsageResult | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/usage")
      .then(r => r.json())
      .then((data: Record<string, UsageResult>) => setUsage(data[feature] ?? null))
      .catch(() => null);
  }, [feature]);

  if (!usage) return null;

  const { count, limit, remaining, allowed } = usage;
  const pct = Math.round((count / limit) * 100);

  if (!allowed) {
    return (
      <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg">🚫</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              Daily limit reached — {count}/{limit} {feature} searches used today
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Your free quota resets at midnight UTC.{" "}
              <a href="#waitlist" className="font-medium underline underline-offset-2">
                Upgrade to Pro
              </a>{" "}
              for unlimited searches.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (remaining <= 2) {
    return (
      <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-orange-200 bg-orange-50 px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-orange-700">
            <span className="font-semibold">{remaining} of {limit}</span> {feature} searches remaining today
          </p>
          <div className="h-1.5 w-24 flex-shrink-0 overflow-hidden rounded-full bg-orange-100">
            <div
              className="h-full rounded-full bg-orange-400 transition-all"
              style={{ width: `${100 - pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-teal-400 transition-all"
            style={{ width: `${100 - pct}%` }}
          />
        </div>
        <p className="flex-shrink-0 font-mono text-[10px] text-gray-500">
          {remaining}/{limit} searches today
        </p>
      </div>
    </div>
  );
}
