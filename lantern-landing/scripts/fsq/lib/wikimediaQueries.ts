import type { CuratedActivity } from "./curation";

export interface QueryVariant { query: string; language: "ja" | "en"; kind: "exact" | "japanese" | "english" | "parenthetical" | "normalized" | "locality" | "category"; }

export function normalizeQueryText(value: string): string {
  return value.normalize("NFKC").replace(/[〔【［]/g, "[").replace(/[〕】］]/g, "]").replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ").trim();
}

export function removeMacrons(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ō/g, "o").replace(/ū/g, "u").replace(/ā/g, "a").replace(/ī/g, "i").replace(/ē/g, "e");
}

function usable(query: string, language: "ja" | "en"): boolean {
  const normalized = query.replace(/[^\p{L}\p{N}]/gu, "");
  if (normalized.length < 2) return false;
  if (language === "en" && !query.includes(" ") && normalized.length < 6) return false;
  return !/^(park|museum|plaza|cafe|bar|shop|market|tokyo)$/i.test(query.trim());
}

export function generateQueryVariants(activity: CuratedActivity): QueryVariant[] {
  const title = normalizeQueryText(activity.title);
  const outside = normalizeQueryText(title.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " "));
  const inside = [...title.matchAll(/[\(\[]([^\)\]]+)[\)\]]/g)].map((match) => normalizeQueryText(match[1]));
  const japanese = normalizeQueryText(title.replace(/[A-Za-zÀ-ž0-9][A-Za-zÀ-ž0-9 .,'&+\-/]*/g, " ").replace(/[()[\]]/g, " "));
  const englishParts = [...title.matchAll(/[A-Za-zÀ-ž][A-Za-zÀ-ž0-9 .,'&+\-/]*/g)].map((match) => normalizeQueryText(match[0]));
  const locality = String(activity.source_metadata?.locality ?? "").trim();
  const labels = activity.source_metadata?.fsq_category_labels;
  const category = Array.isArray(labels) ? String(labels[0]?.split(" > ").at(-1) ?? "") : "";
  const candidates: QueryVariant[] = [];
  const add = (query: string, language: "ja" | "en", kind: QueryVariant["kind"]) => { const value = normalizeQueryText(query); if (usable(value, language)) candidates.push({ query: value, language, kind }); };
  add(title, /[ぁ-んァ-ン一-龯]/.test(title) ? "ja" : "en", "exact");
  if (outside !== title) add(outside, /[ぁ-んァ-ン一-龯]/.test(outside) ? "ja" : "en", "normalized");
  add(japanese, "ja", "japanese");
  if (japanese.includes("・")) add(japanese.replaceAll("・", ""), "ja", "normalized");
  if (japanese.includes("の")) add(japanese.replaceAll("の", " "), "ja", "normalized");
  for (const value of inside) add(value, /[ぁ-んァ-ン一-龯]/.test(value) ? "ja" : "en", "parenthetical");
  for (const value of englishParts) { add(value, "en", "english"); const plain = removeMacrons(value); if (plain !== value) add(plain, "en", "normalized"); }
  const coreJa = candidates.find((variant) => variant.language === "ja")?.query;
  const coreEn = candidates.find((variant) => variant.language === "en")?.query;
  if (coreJa) add(`${coreJa} 東京`, "ja", "locality");
  if (coreEn) add(`${coreEn} ${locality || "Tokyo"}`, "en", "locality");
  if (coreEn && category) add(`${coreEn} ${category}`, "en", "category");
  if (/市場$/.test(japanese)) add(`${japanese.replace(/市場$/, "")} 市場`, "ja", "normalized");
  if (/駅$/.test(japanese)) add(`${japanese.replace(/駅$/, "")} 駅`, "ja", "normalized");
  return [...new Map(candidates.map((variant) => [`${variant.language}:${variant.query.toLowerCase()}`, variant])).values()];
}
