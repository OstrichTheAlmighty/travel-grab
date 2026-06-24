import { NextRequest, NextResponse } from "next/server";
import { generateItinerary } from "./generateWithClaude";
import type { PlannerOutput, PlannedDay, PlannedSlot, SlotKind } from "@/lib/itinerary/types";

// ── Claude output types ────────────────────────────────────────────────────────

interface ClaudeScheduleItem {
  time:             string;
  activity:         string;
  duration:         string;
  type:             string;
  notes?:           string;
  recommendation?:  string;
  timeExplanation?: string;
}

interface ClaudeDay {
  dayIndex: number;
  date:     string;
  city:     string;
  theme:    string;
  schedule: ClaudeScheduleItem[];
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = (t ?? "09:00").split(":").map(Number);
  return (h ?? 9) * 60 + (m ?? 0);
}

function parseDur(d: string): number {
  if (!d) return 60;
  const hr  = d.match(/(\d+(?:\.\d+)?)\s*h/i);
  const min = d.match(/(\d+)\s*m(?!o)/i);
  let total = 0;
  if (hr)  total += Math.round(parseFloat(hr[1])  * 60);
  if (min) total += parseInt(min[1]);
  return total || 60;
}

function inferKind(type: string, title: string): SlotKind {
  const t = title.toLowerCase();
  if (type === "meal") return "meal";
  if (t.includes("check-in") || t.includes("checkin") || t.includes("hotel check")) return "hotel_checkin";
  if (t.includes("check-out") || t.includes("checkout")) return "hotel_checkout";
  if (t.includes("airport") || t.includes("arrival transfer") || t.includes("departure transfer")) return "airport_transfer";
  if (type === "transfer" || t.includes("travel to") || t.includes("transfer to")) return "intercity_transfer";
  return "activity";
}

// Count activities per the pace definition:
// sightseeing/meal = 1, casual stroll = 0.5, transport/hotel = 0
function countPaceActivities(slots: PlannedSlot[]): number {
  let count = 0;
  for (const s of slots) {
    if (s.kind === "activity" || s.kind === "meal") {
      const t = s.title.toLowerCase();
      const isStroll = t.includes("stroll") || t.includes("wander") || t.includes("walk through") || t.includes("neighborhood walk");
      count += isStroll ? 0.5 : 1;
    }
    // hotel_checkin, hotel_checkout, airport_transfer, intercity_transfer = 0
  }
  return count;
}

function transformDay(day: ClaudeDay, paceMax: number): PlannedDay {
  const slots: PlannedSlot[] = (day.schedule ?? []).map((item) => {
    const startMinutes    = timeToMin(item.time ?? "09:00");
    const durationMinutes = parseDur(item.duration ?? "1h");
    const kind            = inferKind(item.type ?? "activity", item.activity ?? "");
    return {
      kind,
      startMinutes,
      endMinutes:    startMinutes + durationMinutes,
      durationMinutes,
      title:           item.activity ?? "",
      explanation:     item.notes ?? item.recommendation ?? "",
      timeExplanation: item.timeExplanation ?? undefined,
    };
  });

  const actSlots    = slots.filter((s) => s.kind === "activity");
  const totalActMin = actSlots.reduce((s, sl) => s + sl.durationMinutes, 0);
  const paceCount   = countPaceActivities(slots);

  const warnings: import("@/lib/itinerary/types").DayWarning[] = [];
  if (paceCount > paceMax) {
    warnings.push({
      type:    "packed",
      message: `Busy day — ${paceCount} activities scheduled (target ≤ ${paceMax})`,
    });
  }

  return {
    dayIndex:               (day.dayIndex ?? 1) - 1,
    date:                   day.date   ?? "",
    theme:                  day.theme  ?? "",
    geographicArea:         (day.city  ?? "").split(",")[0].trim(),
    cityLabel:              day.city   ?? undefined,
    daySummary:             undefined,
    slots,
    scheduledActivityCount: actSlots.length,
    totalActivityMinutes:   totalActMin,
    warnings,
  };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const input = await req.json();
    const result = await generateItinerary(input);

    // Warning threshold mirrors the activity-count pace limit in the prompt
    const paceMax = ({ relaxed: 3, moderate: 5, packed: 8 } as Record<string, number>)[
      input.userPreferences?.pace ?? "moderate"
    ] ?? 5;

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

    return NextResponse.json(plannerOutput);
  } catch (error) {
    console.error("Itinerary generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
