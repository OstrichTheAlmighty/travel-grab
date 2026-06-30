import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  countScheduledActivities,
  rescheduleArrivalDay,
  rescheduleDepartureDay,
} from "../lib/itinerary/flight-day-update";
import type { PlannedDay, PlannedSlot } from "../lib/itinerary/types";

function slot(kind: PlannedSlot["kind"], title: string, startMinutes: number, durationMinutes: number): PlannedSlot {
  return {
    kind, title, startMinutes, durationMinutes,
    endMinutes: startMinutes + durationMinutes,
    explanation: title,
    ...(kind === "activity" ? { sourceId: title.toLowerCase().replace(/\s/g, "-") } : {}),
  };
}

function day(slots: PlannedSlot[]): PlannedDay {
  return {
    dayIndex: 0,
    date: "2026-07-02",
    theme: "Tokyo highlights",
    geographicArea: "Tokyo",
    cityLabel: "Tokyo",
    slots,
    scheduledActivityCount: slots.filter((item) => item.kind === "activity").length,
    totalActivityMinutes: slots.filter((item) => item.kind === "activity").reduce((sum, item) => sum + item.durationMinutes, 0),
  };
}

describe("flight-aware itinerary day updates", () => {
  it("keeps activities and hotel check-in after an outbound arrival", () => {
    const original = day([
      slot("meal", "Breakfast", 480, 60),
      slot("activity", "Sensō-ji", 555, 90),
      slot("hotel_checkin", "Hotel check-in", 900, 30),
      slot("activity", "Tokyo Tower", 960, 90),
      slot("meal", "Dinner", 1140, 60),
    ]);
    const transfer = slot("airport_transfer", "Arrive NRT", 890, 90);
    const updated = rescheduleArrivalDay(original, transfer, "Flight arrives at 14:50.");

    expect(updated.slots.filter((item) => item.kind === "activity").map((item) => item.title))
      .toEqual(["Sensō-ji", "Tokyo Tower"]);
    expect(updated.slots.some((item) => item.kind === "hotel_checkin")).toBe(true);
    expect(updated.slots.some((item) => item.title === "Breakfast")).toBe(false);
    expect(updated.slots.filter((item) => item.kind !== "airport_transfer").every((item) => item.startMinutes >= transfer.endMinutes)).toBe(true);
    expect(updated.scheduledActivityCount).toBe(2);
  });

  it("keeps activities and hotel checkout before a return-flight transfer", () => {
    const original = day([
      slot("hotel_checkout", "Hotel checkout", 540, 30),
      slot("activity", "Osaka Castle", 600, 120),
      slot("activity", "Dotonbori", 780, 90),
    ]);
    const transfer = slot("airport_transfer", "Transfer to KIX", 900, 180);
    const updated = rescheduleDepartureDay(original, transfer, "Flight departs at 18:00.");

    expect(updated.slots.filter((item) => item.kind === "activity")).toHaveLength(2);
    expect(updated.slots.some((item) => item.kind === "hotel_checkout")).toBe(true);
    expect(updated.slots.at(-1)?.kind).toBe("airport_transfer");
    expect(updated.slots.slice(0, -1).every((item) => item.endMinutes <= transfer.startMinutes)).toBe(true);
    expect(updated.slots.slice(0, -1).every((item) => item.durationMinutes > 0)).toBe(true);
  });

  it("does not erase or zero-duration activities when an early return flight makes the day overfull", () => {
    const original = day([
      slot("activity", "Morning market", 480, 120),
      slot("activity", "Museum", 630, 120),
    ]);
    const transfer = slot("airport_transfer", "Transfer to airport", 180, 180);
    const updated = rescheduleDepartureDay(original, transfer, "Flight departs at 06:00.");

    expect(updated.slots.filter((item) => item.kind === "activity")).toHaveLength(2);
    expect(updated.slots.filter((item) => item.kind === "activity").every((item) => item.durationMinutes === 120)).toBe(true);
    expect(updated.warnings?.some((warning) => warning.message.includes("preserved for manual adjustment"))).toBe(true);
  });

  it("recounts activities from preserved itinerary slots", () => {
    expect(countScheduledActivities([
      day([slot("activity", "A", 600, 60), slot("meal", "Lunch", 720, 60)]),
      { ...day([slot("activity", "B", 600, 60)]), dayIndex: 1 },
    ])).toBe(2);
  });

  it("uses the separately selected return flight during full regeneration", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../app/itinerary/ItineraryPlanner.tsx"), "utf8");
    expect(source).toContain("selectedReturnFlight?.departTime ?? selectedFlight?.returnDepartTime");
    expect(source).toContain("selectedReturnFlight?.origin ?? selectedFlight?.returnOrigin");
    expect(source).not.toContain("function displace(day");
  });
});
