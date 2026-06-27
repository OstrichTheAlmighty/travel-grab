import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminRequest } from "@/lib/auth-server";
import { checkUsage, incrementUsage } from "@/lib/usage";
import { generateItinerary } from "./generateWithClaude";
import { transformDay } from "@/lib/itinerary/transform";
import type { PlannerOutput, PlannedDay } from "@/lib/itinerary/types";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 300; // streaming keeps connection alive; 300s for Pro plan safety net

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth + quota must be checked before the stream starts — can't send non-200 once streaming begins
  if (!isAdminRequest(req)) {
    const authUser = await getUserFromRequest(req);
    if (authUser) {
      const { allowed, count, limit } = await checkUsage(authUser.id, "itinerary");
      if (!allowed) {
        return NextResponse.json(
          { error: `Daily limit reached — ${count}/${limit} itineraries generated today. Resets at midnight UTC.`, limitReached: true },
          { status: 429 }
        );
      }
      incrementUsage(authUser.id, "itinerary");
    }
  }

  const input = await req.json();
  const paceMax = ({ relaxed: 3, moderate: 5, packed: 8 } as Record<string, number>)[
    input.userPreferences?.pace ?? "moderate"
  ] ?? 5;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch { /* closed */ }
      };

      // Heartbeat every 3 s keeps the Vercel connection alive while Claude generates
      const heartbeat = setInterval(() => send({ type: "ping" }), 3000);

      try {
        const result = await generateItinerary(input);
        const days: PlannedDay[] = (result.days ?? []).map((day) => transformDay(day, paceMax));
        const totalScheduled = days.reduce((s, d) => s + d.scheduledActivityCount, 0);
        const dropped = result._dropped ?? [];

        const plannerOutput: PlannerOutput = {
          days,
          meta: {
            solverDurationMs:         0,
            totalActivitiesScheduled: totalScheduled,
            totalActivitiesDropped:   dropped.length,
            droppedActivities:        dropped,
            conflicts:                [],
          },
        };

        send({ type: "done", data: plannerOutput });
      } catch (error) {
        console.error("Itinerary generation error:", error);
        send({ type: "error", error: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
