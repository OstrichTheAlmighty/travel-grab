import type { PlannedDay, PlannedSlot, SlotKind, DayWarning } from "./types";

export interface ClaudeScheduleItem {
  time:             string;
  activity:         string;
  duration:         string;
  type:             string;
  notes?:           string;
  recommendation?:  string;
  timeExplanation?: string;
}

export interface ClaudeDay {
  dayIndex: number;
  date:     string;
  city:     string;
  theme:    string;
  schedule: ClaudeScheduleItem[];
}

export function timeToMin(t: string): number {
  const [h, m] = (t ?? "09:00").split(":").map(Number);
  return (h ?? 9) * 60 + (m ?? 0);
}

export function parseDur(d: string): number {
  if (!d) return 60;
  const hr  = d.match(/(\d+(?:\.\d+)?)\s*h/i);
  const min = d.match(/(\d+)\s*m(?!o)/i);
  let total = 0;
  if (hr)  total += Math.round(parseFloat(hr[1]) * 60);
  if (min) total += parseInt(min[1]);
  return total || 60;
}

export function inferKind(type: string, title: string): SlotKind {
  const t = title.toLowerCase();
  if (type === "meal") return "meal";
  if (t.includes("check-in") || t.includes("checkin") || t.includes("hotel check")) return "hotel_checkin";
  if (t.includes("check-out") || t.includes("checkout")) return "hotel_checkout";
  if (t.includes("airport") || t.includes("arrival transfer") || t.includes("departure transfer")) return "airport_transfer";
  if (type === "transfer" || t.includes("travel to") || t.includes("transfer to")) return "intercity_transfer";
  return "activity";
}

export function countPaceActivities(slots: PlannedSlot[]): number {
  let count = 0;
  for (const s of slots) {
    if (s.kind === "activity" || s.kind === "meal") {
      const t = s.title.toLowerCase();
      const isStroll = t.includes("stroll") || t.includes("wander") || t.includes("walk through") || t.includes("neighborhood walk");
      count += isStroll ? 0.5 : 1;
    }
  }
  return count;
}

export function transformDay(day: ClaudeDay, paceMax: number): PlannedDay {
  const slots: PlannedSlot[] = (day.schedule ?? []).map((item) => {
    const startMinutes    = timeToMin(item.time ?? "09:00");
    const durationMinutes = parseDur(item.duration ?? "1h");
    const kind            = inferKind(item.type ?? "activity", item.activity ?? "");
    return {
      kind,
      startMinutes,
      endMinutes:      startMinutes + durationMinutes,
      durationMinutes,
      title:           item.activity ?? "",
      explanation:     item.notes ?? item.recommendation ?? "",
      timeExplanation: item.timeExplanation ?? undefined,
    };
  });

  const actSlots    = slots.filter((s) => s.kind === "activity");
  const totalActMin = actSlots.reduce((s, sl) => s + sl.durationMinutes, 0);
  const paceCount   = countPaceActivities(slots);

  const warnings: DayWarning[] = [];
  if (paceCount > paceMax) {
    warnings.push({
      type:    "packed",
      message: `Busy day — ${paceCount} activities scheduled (target ≤ ${paceMax})`,
    });
  }

  return {
    dayIndex:               (day.dayIndex ?? 1) - 1,
    date:                   day.date  ?? "",
    theme:                  day.theme ?? "",
    geographicArea:         (day.city ?? "").split(",")[0].trim(),
    cityLabel:              day.city  ?? undefined,
    daySummary:             undefined,
    slots,
    scheduledActivityCount: actSlots.length,
    totalActivityMinutes:   totalActMin,
    warnings,
  };
}
