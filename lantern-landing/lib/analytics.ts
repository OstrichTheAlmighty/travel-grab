export type AnalyticsEvent =
  | "flight_search_submitted"
  | "flight_result_clicked"
  | "google_flights_clicked"
  | "duffel_booking_clicked"
  | "hotel_search_submitted"
  | "hotel_booking_clicked";

export type EventProps = Record<string, string | number | boolean | null | undefined>;

export function track(event: AnalyticsEvent, props?: EventProps): void {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV !== "production") {
    console.log("[analytics]", event, props ?? {});
    return;
  }

  try {
    const payload = JSON.stringify({ event, props: props ?? {}, ts: Date.now() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([payload], { type: "application/json" }));
    }
  } catch {
    // non-critical — never throws to caller
  }
}
