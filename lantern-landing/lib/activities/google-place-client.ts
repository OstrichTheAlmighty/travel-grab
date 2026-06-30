"use client";

import type { GoogleDetailLevel, GooglePlaceDetail } from "./google-place-details";
import { recordGoogleModalTrace } from "./google-modal-trace";

export interface GoogleClientDiagnostics {
  networkRequests: number;
  cacheHits: number;
  inFlightDeduplicationHits: number;
}

const resolved = new Map<string, { detail: GooglePlaceDetail; expiresAt: number }>();
const inFlight = new Map<string, Promise<GooglePlaceDetail | null>>();
const TTL_MS = 60 * 60 * 1000;
const diagnostics: GoogleClientDiagnostics = { networkRequests: 0, cacheHits: 0, inFlightDeduplicationHits: 0 };

export async function fetchGooglePlaceDetail(
  placeId: string,
  level: GoogleDetailLevel = "modal_standard",
): Promise<GooglePlaceDetail | null> {
  const key = `${placeId}:${level}`;
  const cached = resolved.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    diagnostics.cacheHits++;
    recordGoogleModalTrace({ type: "detail", level, outcome: "cache_hit" });
    return cached.detail;
  }
  if (cached) resolved.delete(key);

  const pending = inFlight.get(key);
  if (pending) {
    diagnostics.inFlightDeduplicationHits++;
    recordGoogleModalTrace({ type: "detail", level, outcome: "in_flight_hit" });
    return pending;
  }

  const request = (async () => {
    diagnostics.networkRequests++;
    recordGoogleModalTrace({ type: "detail", level, outcome: "request" });
    const response = await fetch(
      `/api/activities/place?id=${encodeURIComponent(placeId)}&level=${encodeURIComponent(level)}`,
    );
    if (!response.ok) {
      recordGoogleModalTrace({ type: "detail", level, outcome: "failed" });
      return null;
    }
    const detail = await response.json() as GooglePlaceDetail & { capReached?: boolean };
    if (detail.capReached) {
      recordGoogleModalTrace({ type: "detail", level, outcome: "failed" });
      return null;
    }
    resolved.set(key, { detail, expiresAt: Date.now() + TTL_MS });
    recordGoogleModalTrace({ type: "detail", level, outcome: "success" });
    return detail;
  })().catch(() => {
    recordGoogleModalTrace({ type: "detail", level, outcome: "failed" });
    return null;
  });

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export function getGoogleClientDiagnostics(): GoogleClientDiagnostics {
  return { ...diagnostics };
}

export function resetGoogleClientForTests(): void {
  resolved.clear();
  inFlight.clear();
  diagnostics.networkRequests = 0;
  diagnostics.cacheHits = 0;
  diagnostics.inFlightDeduplicationHits = 0;
}

export function activityPhotoUrl(resourceOrUrl: string, width: number): string {
  if (/^https:\/\//i.test(resourceOrUrl)) return resourceOrUrl;
  return `/api/activities/photo?name=${encodeURIComponent(resourceOrUrl)}&w=${width}`;
}
