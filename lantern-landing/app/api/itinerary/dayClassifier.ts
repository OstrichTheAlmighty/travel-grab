import type { ActivityProfile, ActivityType } from "./activityProfiler";

export interface DayContext {
  dayIndex:             number;
  city:                 string;
  date:                 string;
  isArrivalDay:         boolean;
  isDepartureDay:       boolean;
  hasIntercityTransfer: boolean;
  profiles:             ActivityProfile[];
}

export interface DayCharacter {
  theme:          string;
  geographicArea: string;
}

export function classifyDay(ctx: DayContext): DayCharacter {
  const city = ctx.city.split(",")[0].trim();

  if (ctx.hasIntercityTransfer) {
    return { theme: `On the Way to ${city}`, geographicArea: city };
  }

  if (ctx.isArrivalDay && ctx.profiles.length === 0) {
    return { theme: `Arrival & First Look at ${city}`, geographicArea: city };
  }

  if (ctx.isDepartureDay && ctx.profiles.length === 0) {
    return { theme: `Last Morning in ${city}`, geographicArea: city };
  }

  const count = (t: ActivityType) => ctx.profiles.filter((p) => p.activityType === t).length;
  const total = ctx.profiles.length || 1;

  if (count("nightlife") / total >= 0.5) {
    return { theme: `Nights Out in ${city}`, geographicArea: city };
  }

  if (count("restaurant") / total >= 0.35 || (count("restaurant") >= 2 && total >= 4)) {
    return { theme: `Flavours of ${city}`, geographicArea: city };
  }

  if (count("market") >= 1 && count("sightseeing") >= 2) {
    return { theme: `Markets & Monuments of ${city}`, geographicArea: city };
  }

  if (count("adventure") / total >= 0.5) {
    return { theme: `Active Day in ${city}`, geographicArea: city };
  }

  if (ctx.isArrivalDay) {
    return { theme: `Welcome to ${city}`, geographicArea: city };
  }

  if (ctx.isDepartureDay) {
    return { theme: `Last Day in ${city}`, geographicArea: city };
  }

  return { theme: `Exploring ${city}`, geographicArea: city };
}
