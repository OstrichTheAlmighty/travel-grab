import type { TokyoGeography } from "./types";

const WARDS = [
  "adachi", "arakawa", "bunkyo", "bunkyō", "chiyoda", "chuo", "chūō", "edogawa",
  "itabashi", "katsushika", "kita", "koto", "kōtō", "meguro", "minato", "nakano",
  "nerima", "ota", "ōta", "setagaya", "shibuya", "shinagawa", "shinjuku", "suginami",
  "sumida", "taito", "taitō", "toshima",
  "足立", "荒川", "文京", "千代田", "中央", "江戸川", "板橋", "葛飾", "北区", "江東",
  "目黒", "港区", "中野", "練馬", "大田", "世田谷", "渋谷", "品川", "新宿", "杉並", "墨田", "台東", "豊島",
] as const;

export interface GeographyInput {
  locality?: string | null;
  region?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function classifyTokyoGeography(input: GeographyInput): TokyoGeography {
  const locality = (input.locality ?? "").toLowerCase();
  const region = (input.region ?? "").toLowerCase();
  const address = (input.address ?? "").toLowerCase();
  const adminText = `${locality} ${region} ${address}`;

  if (/yokohama|横浜|kanagawa|神奈川/.test(adminText)) return "yokohama_or_outside_tokyo";
  const isWard = WARDS.some((ward) => locality.includes(ward) || address.includes(ward));
  if (isWard) return "tokyo_core_23_wards";
  if (/tokyo|東京都|東京/.test(adminText)) return "broader_tokyo";

  if (region && !/tokyo|東京都|東京/.test(region)) return "yokohama_or_outside_tokyo";
  return "unknown";
}

export function isStrictTokyoComparisonArea(input: GeographyInput): boolean {
  return classifyTokyoGeography(input) === "tokyo_core_23_wards";
}
