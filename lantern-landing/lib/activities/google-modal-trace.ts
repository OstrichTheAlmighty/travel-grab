"use client";

export type ModalTraceEvent =
  | { type: "detail"; level: string; outcome: "request" | "cache_hit" | "in_flight_hit" | "success" | "failed" }
  | { type: "photo"; resource: string; width: number; outcome: "loaded" | "failed" }
  | { type: "reviews"; outcome: "requested" | "received" | "failed" }
  | { type: "insights"; outcome: "requested" | "received" | "failed" }
  | { type: "fallback"; fallback: string };

interface ModalTrace {
  activityId: string;
  placeId: string;
  startedAt: string;
  events: ModalTraceEvent[];
}

let activeTrace: ModalTrace | null = null;

function enabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function beginGoogleModalTrace(activityId: string, placeId: string): void {
  if (!enabled()) return;
  activeTrace = { activityId, placeId, startedAt: new Date().toISOString(), events: [] };
  console.debug("[activities/modal-trace] started", { activityId, placeId });
}

export function recordGoogleModalTrace(event: ModalTraceEvent): void {
  if (!enabled() || !activeTrace) return;
  activeTrace.events.push(event);
  console.debug("[activities/modal-trace]", event);
}

export function finishGoogleModalTrace(): void {
  if (!enabled() || !activeTrace) return;
  const trace = activeTrace;
  activeTrace = null;
  console.debug("[activities/modal-trace] completed", {
    ...trace,
    detailRequests: trace.events.filter((event) => event.type === "detail" && event.outcome === "request").length,
    photoRequests: trace.events.filter((event) => event.type === "photo").length,
    reviewRequests: trace.events.filter((event) => event.type === "reviews" && event.outcome === "requested").length,
    insightRequests: trace.events.filter((event) => event.type === "insights" && event.outcome === "requested").length,
    cacheHits: trace.events.filter((event) => event.type === "detail" && event.outcome === "cache_hit").length,
    inFlightDeduplicationHits: trace.events.filter((event) => event.type === "detail" && event.outcome === "in_flight_hit").length,
    failedRequests: trace.events.filter((event) => "outcome" in event && event.outcome === "failed").length,
    fallbacksUsed: trace.events.filter((event) => event.type === "fallback").map((event) => event.fallback),
  });
}

export function getGoogleModalTraceForTests(): ModalTrace | null {
  return activeTrace ? { ...activeTrace, events: [...activeTrace.events] } : null;
}
