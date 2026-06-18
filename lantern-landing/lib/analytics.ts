"use client";

// This module is client-only. All exported functions guard against SSR with
// `typeof window === "undefined"` checks. PostHog is lazy-initialised on the
// first track() call so no Provider component is required.

import posthog from "posthog-js";

// ── Event type registry ───────────────────────────────────────────────────────

export type AnalyticsEvent =
  // Flights
  | "flight_search_submitted"
  | "flight_result_clicked"
  | "google_flights_clicked"
  | "duffel_booking_clicked"
  // Hotels — search lifecycle
  | "hotel_search"
  | "hotel_search_completed"
  // Hotels — interactions
  | "hotel_selected"
  | "hotel_availability_clicked"
  | "hotel_photo_scrolled"
  | "hotel_reviews_viewed"
  | "hotel_reviews_loaded"
  | "hotel_reviews_searched"
  | "hotel_review_opened"
  | "hotel_reviews_sort_changed"
  | "hotel_review_read_more_clicked"
  | "hotel_review_external_clicked"
  | "hotel_compare_opened"
  | "map_viewed"
  | "neighborhood_selected"
  // Debug / temporary
  | "hotels_page_loaded";

export type EventProps = Record<string, string | number | boolean | null | undefined>;

// ── PostHog lazy initialisation ───────────────────────────────────────────────
//
// Rules:
//  • _initialized is ONLY set to true after posthog.init() actually runs.
//  • If the key is absent the function returns without setting _initialized,
//    so the next track() call will retry (e.g. after HMR or a future call
//    where the env var is now inlined by Next.js).
//  • SSR (typeof window === "undefined") returns immediately without touching
//    _initialized so server-side rendering never poisons the client state.

let _initialized = false;

function init(): void {
  if (_initialized || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[analytics] init() called. NEXT_PUBLIC_POSTHOG_KEY:",
      key ? `present (${key.slice(0, 8)}…)` : "MISSING",
    );
  }

  if (!key) {
    // Do NOT set _initialized — allow retry on the next track() call.
    return;
  }

  _initialized = true; // set only after we confirm the key exists

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (process.env.NODE_ENV !== "production") {
    console.log("[analytics] calling posthog.init() →", host);
  }

  posthog.init(key, {
    api_host:          host,
    person_profiles:   "identified_only",
    capture_pageview:  false,
    capture_pageleave: false,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function track(event: AnalyticsEvent, props?: EventProps): void {
  if (typeof window === "undefined") return;
  init();

  if (process.env.NODE_ENV !== "production") {
    console.log("[analytics] track →", event, props ?? {});
  }

  try {
    posthog.capture(event, props ?? {});
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[analytics] posthog.capture failed:", err);
    }
  }
}
