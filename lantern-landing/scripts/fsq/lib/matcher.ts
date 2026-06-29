import type { NormalizedActivity } from "../../../lib/activities/types";
import { getGoogleCoords, type GoogleRow } from "../../activities/lib/google";
import { areCategoriesCompatible, tokenJaccard } from "../../activities/lib/matching";
import { normalizeName, trigramSimilarity } from "../../activities/lib/names";
import { haversineM } from "../../activities/lib/geo";

export type FsqMatchDecision = "confirmed_match" | "possible_match" | "rejected_match";

export interface FsqGoogleMatch {
  fsqId: string;
  fsqName: string;
  googleId: string;
  googleName: string;
  decision: FsqMatchDecision;
  confidence: number;
  distanceM: number;
  signals: string[];
}

function googleNames(row: GoogleRow): string[] {
  const data = row.google_places_data as { displayName?: { text?: string } } | null;
  return [row.title, data?.displayName?.text].filter((value): value is string => Boolean(value)).flatMap(expandNameVariants);
}

function expandNameVariants(value: string): string[] {
  const variants = [value];
  for (const match of value.matchAll(/[（(]([^()（）]{3,})[）)]/g)) variants.push(match[1]);
  const withoutParenthetical = value.replace(/[（(][^()（）]+[）)]/g, " ").trim();
  if (withoutParenthetical) variants.push(withoutParenthetical);
  return [...new Set(variants)];
}

function fsqNames(activity: NormalizedActivity): string[] {
  return [activity.title, activity.name_local, ...Object.values(activity.name_alts ?? {})]
    .filter((value): value is string => Boolean(value)).flatMap(expandNameVariants);
}

export function matchFsqToGoogle(activity: NormalizedActivity, candidates: GoogleRow[]): FsqGoogleMatch | null {
  if (typeof activity.lat !== "number" || typeof activity.lng !== "number") return null;
  const leftNames = [...new Set(fsqNames(activity).map(normalizeName).filter((name) => name.length >= 3))];
  let best: FsqGoogleMatch | null = null;

  for (const google of candidates) {
    const coords = getGoogleCoords(google);
    if (!coords) continue;
    const distanceM = haversineM(activity.lat, activity.lng, coords.lat, coords.lng);
    if (distanceM > 600) continue;

    let exact = false;
    let token = 0;
    let trigram = 0;
    for (const left of leftNames) {
      for (const right of googleNames(google).map(normalizeName)) {
        if (left === right) exact = true;
        token = Math.max(token, tokenJaccard(left, right));
        trigram = Math.max(trigram, trigramSimilarity(left, right));
      }
    }

    const categoryCompatible = areCategoriesCompatible(activity.category, google.category);
    const signals = [`distance:${distanceM.toFixed(0)}m`];
    if (exact) signals.push("exact_normalized_name");
    if (token > 0) signals.push(`token_similarity:${token.toFixed(2)}`);
    if (trigram > 0) signals.push(`transliteration_or_trigram:${trigram.toFixed(2)}`);
    signals.push(categoryCompatible ? "category_compatible" : "category_conflict");

    let decision: FsqMatchDecision = "rejected_match";
    let confidence = 0;
    if (exact && categoryCompatible && distanceM <= 600) {
      decision = "confirmed_match";
      confidence = Math.max(0.82, 1 - distanceM / 3_500);
    } else if (categoryCompatible && distanceM <= 200 && token >= 0.72 && trigram >= 0.65) {
      decision = "confirmed_match";
      confidence = Math.min(0.95, token * 0.65 + trigram * 0.25 + 0.1);
    } else if (categoryCompatible && distanceM <= 350 && token >= 0.48 && trigram >= 0.48) {
      decision = "possible_match";
      confidence = Math.min(0.79, token * 0.55 + trigram * 0.25 + 0.05);
    } else if (distanceM <= 80) {
      signals.push("proximity_only_rejected");
    } else {
      continue;
    }

    const match = {
      fsqId: activity.id,
      fsqName: activity.title,
      googleId: google.id,
      googleName: google.title,
      decision,
      confidence,
      distanceM,
      signals,
    };
    if (!best || match.confidence > best.confidence || (match.confidence === best.confidence && match.distanceM < best.distanceM)) best = match;
  }
  return best;
}
