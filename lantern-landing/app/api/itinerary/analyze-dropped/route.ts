import type { DroppedActivity, PlannerOutput } from "@/lib/itinerary/types";

type UIPace = "relaxed" | "balanced" | "packed";

export interface EligibleDay {
  dayIndex:        number;
  city:            string;
  activityCount:   number;
  paceMax:         number;
  status:          "free_slot" | "replace_suggested";
  replaceTitle?:   string;
  replaceDuration?: number;
  suggestion:      string;
}

export interface IneligibleDay {
  dayIndex: number;
  city:     string;
  reason:   string;
}

export interface AnalyzeDroppedResult {
  activity:         string;
  belongsInCity:    string;
  activityDuration: number;
  eligibleDays:     EligibleDay[];
  ineligibleDays:   IneligibleDay[];
}

const PACE_MAX: Record<UIPace, number> = {
  relaxed:  3,
  balanced: 5,
  packed:   8,
};

function normCity(s: string): string {
  return s.toLowerCase().split(",")[0].trim();
}

function citiesMatch(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

export async function POST(req: Request) {
  try {
    const { droppedActivity, itinerary, tripPace } = await req.json() as {
      droppedActivity: DroppedActivity;
      itinerary:       PlannerOutput;
      tripPace:        UIPace;
    };

    if (!droppedActivity || !itinerary) {
      return Response.json({ error: "Missing input" }, { status: 400 });
    }

    const actCity       = droppedActivity.diagnostic?.belongsInCity
      ? normCity(droppedActivity.diagnostic.belongsInCity)
      : "";
    const actDuration   = droppedActivity.diagnostic?.activityDuration ?? 90;
    const isFlexible    = !actCity || actCity === "flexible";
    const paceMax       = PACE_MAX[tripPace] ?? 5;

    const eligibleDays:   EligibleDay[]   = [];
    const ineligibleDays: IneligibleDay[] = [];

    for (const day of itinerary.days) {
      const dayCity     = normCity(day.cityLabel ?? day.theme ?? "");
      const cityOk      = isFlexible || citiesMatch(dayCity, actCity);

      if (!cityOk) {
        ineligibleDays.push({
          dayIndex: day.dayIndex,
          city:     day.cityLabel ?? `Day ${day.dayIndex + 1}`,
          reason:   `Activity belongs in ${droppedActivity.diagnostic?.belongsInCity ?? "another city"}, this day is ${day.cityLabel ?? "a different city"}`,
        });
        continue;
      }

      const actSlots     = day.slots.filter((s) => s.kind === "activity");
      const actCount     = actSlots.length;
      const isFull       = actCount >= paceMax;
      const cityLabel    = day.cityLabel ?? `Day ${day.dayIndex + 1}`;

      if (!isFull) {
        eligibleDays.push({
          dayIndex:      day.dayIndex,
          city:          cityLabel,
          activityCount: actCount,
          paceMax,
          status:        "free_slot",
          suggestion:    "Free slot available",
        });
      } else {
        const removable = [...actSlots]
          .sort((a, b) => a.durationMinutes - b.durationMinutes)[0] ?? null;

        if (removable) {
          eligibleDays.push({
            dayIndex:        day.dayIndex,
            city:            cityLabel,
            activityCount:   actCount,
            paceMax,
            status:          "replace_suggested",
            replaceTitle:    removable.title,
            replaceDuration: removable.durationMinutes,
            suggestion:      `Replace "${removable.title}" (${removable.durationMinutes}m)`,
          });
        } else {
          ineligibleDays.push({
            dayIndex: day.dayIndex,
            city:     cityLabel,
            reason:   "Day is full with no replaceable activities",
          });
        }
      }
    }

    return Response.json({
      activity:         droppedActivity.title,
      belongsInCity:    droppedActivity.diagnostic?.belongsInCity ?? "Flexible",
      activityDuration: actDuration,
      eligibleDays,
      ineligibleDays,
    } satisfies AnalyzeDroppedResult);

  } catch (error) {
    console.error("[analyze-dropped]", error);
    return Response.json({ error: "Analysis failed" }, { status: 500 });
  }
}
