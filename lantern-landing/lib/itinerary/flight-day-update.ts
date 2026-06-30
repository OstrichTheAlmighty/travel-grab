import type { DayWarning, PlannedDay, PlannedSlot } from "./types";

const GAP_MINUTES = 10;

function duration(slot: PlannedSlot): number {
  return Math.max(15, slot.durationMinutes || slot.endMinutes - slot.startMinutes || 60);
}

function flightWarning(message: string): DayWarning {
  return { type: "flight_recovery", message };
}

function metrics(slots: PlannedSlot[]): Pick<PlannedDay, "scheduledActivityCount" | "totalActivityMinutes"> {
  const activities = slots.filter((slot) => slot.kind === "activity");
  return {
    scheduledActivityCount: activities.length,
    totalActivityMinutes: activities.reduce((sum, slot) => sum + duration(slot), 0),
  };
}

export function rescheduleArrivalDay(
  day: PlannedDay,
  transfer: PlannedSlot,
  arrivalLabel: string,
): PlannedDay {
  const readyAt = transfer.endMinutes;
  const original = day.slots
    .filter((slot) => slot.kind !== "airport_transfer")
    // Breakfast/lunch that ended before arrival are genuinely missed. Activities,
    // hotel check-in, transfers, and later meals are always retained.
    .filter((slot) => slot.kind !== "meal" || slot.endMinutes > readyAt)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const checkIns = original.filter((slot) => slot.kind === "hotel_checkin");
  const remaining = original.filter((slot) => slot.kind !== "hotel_checkin");
  const ordered = [...checkIns, ...remaining];
  let cursor = readyAt;
  const shifted = ordered.map((slot) => {
    const slotDuration = duration(slot);
    const startMinutes = Math.max(cursor, slot.kind === "meal" ? slot.startMinutes : cursor);
    const updated = { ...slot, startMinutes, endMinutes: startMinutes + slotDuration, durationMinutes: slotDuration };
    cursor = updated.endMinutes + GAP_MINUTES;
    return updated;
  });
  const slots = [transfer, ...shifted];
  const late = slots.some((slot) => slot.endMinutes >= 24 * 60);

  return {
    ...day,
    slots,
    ...metrics(slots),
    daySummary: `${arrivalLabel} Existing plans have been moved after the airport transfer.`,
    warnings: [
      ...(day.warnings ?? []).filter((warning) => warning.type !== "flight_recovery"),
      flightWarning(late
        ? "Arrival leaves a very full evening; review the final activity times."
        : "Activities were rescheduled after arrival; no activities were removed."),
    ],
  };
}

export function rescheduleDepartureDay(
  day: PlannedDay,
  transfer: PlannedSlot,
  departureLabel: string,
): PlannedDay {
  const original = day.slots
    .filter((slot) => slot.kind !== "airport_transfer")
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const requiredMinutes = original.reduce((sum, slot) => sum + duration(slot), 0)
    + Math.max(0, original.length - 1) * GAP_MINUTES;
  const fitsBeforeTransfer = requiredMinutes <= transfer.startMinutes;
  let cursor = Math.max(0, transfer.startMinutes - requiredMinutes);
  const shifted = original.map((slot) => {
    const slotDuration = duration(slot);
    const updated = {
      ...slot,
      startMinutes: cursor,
      endMinutes: cursor + slotDuration,
      durationMinutes: slotDuration,
    };
    cursor = updated.endMinutes + GAP_MINUTES;
    return updated;
  });
  const slots = [...shifted, transfer];
  return {
    ...day,
    slots,
    ...metrics(slots),
    daySummary: `${departureLabel} Existing plans have been moved before the airport transfer.`,
    warnings: [
      ...(day.warnings ?? []).filter((warning) => warning.type !== "flight_recovery"),
      flightWarning(fitsBeforeTransfer
        ? "Activities were rescheduled before departure; no activities were removed."
        : "The full existing schedule does not fit before this flight. Activities were preserved for manual adjustment."),
    ],
  };
}

export function countScheduledActivities(days: PlannedDay[]): number {
  return days.reduce(
    (total, day) => total + day.slots.filter((slot) => slot.kind === "activity").length,
    0,
  );
}
