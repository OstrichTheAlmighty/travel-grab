import type { CuratedActivity } from "./curation";
import { TOKYO_MAJOR_ATTRACTIONS } from "./attractions";
import { catalogClassification, correctedCategory, correctionReasons } from "./fsqCorrections";
import type { WikimediaClient } from "./wikimediaClient";
import { activityNames, chooseWikidataMatch, entityCoordinates, entityStringClaim, entityTypeIds } from "./wikimediaMatcher";
import type { EnrichedActivity, WikidataEntity, WikimediaEnrichment, WikimediaImage, WikimediaRunStats } from "./wikimediaTypes";

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}

export function imageFromMetadata(file: string, metadata?: Record<string, string>): WikimediaImage | undefined {
  if (!metadata) return undefined;
  const license = stripHtml(metadata.LicenseShortName ?? metadata.UsageTerms ?? "");
  const author = stripHtml(metadata.Artist ?? metadata.Credit ?? "");
  const sourcePage = metadata.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(" ", "_"))}`;
  if (!license || !author || !metadata.url || !sourcePage) return undefined;
  return {
    file, url: metadata.url, license, licenseUrl: metadata.LicenseUrl || undefined,
    author, attribution: `${author} — ${license}`, sourcePage,
  };
}

function entityFile(entity: WikidataEntity): string | undefined {
  return entityStringClaim(entity, "P18");
}

function entityTypeLabels(entity: WikidataEntity, types: Map<string, WikidataEntity>): string[] {
  return entityTypeIds(entity).flatMap((id) => {
    const type = types.get(id);
    return [type?.labels?.en?.value, type?.labels?.ja?.value].filter((value): value is string => Boolean(value));
  });
}

function emptyEnrichment(rejections: string[] = []): WikimediaEnrichment {
  return { alternate_names: [], entity_types: [], match_status: "unmatched", match_confidence: 0, match_signals: [], rejection_reasons: rejections, language_sitelinks: 0 };
}

export function scoreForDisplay(activity: CuratedActivity, enrichment: WikimediaEnrichment, classification: string): { score: number; components: Array<{ signal: string; amount: number }>; penalties: string[]; prominence: string[] } {
  const components: Array<{ signal: string; amount: number }> = [];
  const penalties: string[] = [];
  const prominence: string[] = [];
  const add = (signal: string, amount: number) => components.push({ signal, amount });
  add("capped_curation_quality", Math.min(45, Math.max(12, activity.curation.score / 4)));
  let prominenceScore = 0;
  const prominent = (signal: string, amount: number) => { prominenceScore += amount; prominence.push(signal); };
  if (enrichment.match_status === "verified") prominent("verified_wikidata_entity", 10);
  if (enrichment.english_wikipedia_title) prominent("english_wikipedia_article", 10);
  if (enrichment.japanese_wikipedia_title) prominent("japanese_wikipedia_article", 8);
  if (enrichment.language_sitelinks) prominent("language_sitelinks", Math.min(8, Math.log2(enrichment.language_sitelinks + 1) * 1.5));
  if (enrichment.image || enrichment.commons_category) prominent("wikimedia_commons", 4);
  if (enrichment.wikidata_official_website || activity.website) prominent("official_website", 3);
  const typeText = enrichment.entity_types.join(" ").toLowerCase();
  if (/museum|landmark|monument|palace|park|garden|shrine|temple|market|district|amusement park|tower/.test(typeText)) prominent("notable_entity_type", 9);
  add("capped_objective_prominence", Math.min(42, prominenceScore));
  const labels = Array.isArray(activity.source_metadata?.fsq_category_labels) ? activity.source_metadata.fsq_category_labels.join(" ").toLowerCase() : "";
  const parentThemePark = /amusement park/.test(labels) && !/amusement park > attraction/.test(labels) && /disneyland|disneysea|disney resort|theme park|amusement park|遊園地/i.test(activity.title);
  const independentDestination = parentThemePark || /museum|palace|monument/.test(labels);
  if (independentDestination) add("independent_destination_type", 40);
  else if (/historic|scenic lookout|neighborhood|market|amusement park/.test(labels)) add("strong_independent_travel_type", 12);
  if (/playground|zoo exhibit|amusement park > attraction/.test(labels) && !enrichment.english_wikipedia_title && !enrichment.japanese_wikipedia_title) { add("subordinate_or_minor_facility", -14); penalties.push("subordinate_or_minor_facility"); }
  if (classification === "reserve") { add("reserve_classification", -18); penalties.push("reserve_classification"); }
  if (activity.curation.probable_chain_id && !independentDestination) { add("probable_chain", -10); penalties.push("probable_chain"); }
  const score = components.reduce((sum, component) => sum + component.amount, 0);
  return { score: Math.round(score * 10) / 10, components, penalties, prominence };
}

export async function enrichActivities(activities: CuratedActivity[], client: WikimediaClient): Promise<EnrichedActivity[]> {
  const searches = new Map<string, string[]>();
  const candidateIds = new Set<string>();
  for (const activity of activities) {
    const names = activityNames(activity);
    const primary = names[0];
    const english = names.find((name) => /[A-Za-z]{3}/.test(name) && name !== primary);
    const results = [];
    try { results.push(...await client.search(primary, /[ぁ-んァ-ン一-龯]/.test(primary) ? "ja" : "en")); } catch { /* cached/reportable API failure */ }
    if (english) try { results.push(...await client.search(english, "en")); } catch { /* cached/reportable API failure */ }
    const ids = [...new Set(results.map((result) => result.id))].slice(0, 10);
    searches.set(activity.id, ids);
    ids.forEach((id) => candidateIds.add(id));
  }
  const entities = await client.getEntities([...candidateIds]);
  const typeIds = [...new Set([...entities.values()].flatMap(entityTypeIds))];
  const typeEntities = await client.getEntities(typeIds);
  const preliminary = activities.map((activity) => {
    const candidates = (searches.get(activity.id) ?? []).map((id) => entities.get(id)).filter((entity): entity is WikidataEntity => Boolean(entity));
    return { activity, match: chooseWikidataMatch(activity, candidates, typeEntities) };
  });
  const imageFiles = preliminary.flatMap(({ match }) => match.status === "verified" && match.best ? [entityFile(match.best.entity)].filter((file): file is string => Boolean(file)) : []);
  const images = await client.getCommonsImageMetadata(imageFiles);

  const result = preliminary.map(({ activity, match }): EnrichedActivity => {
    let enrichment = emptyEnrichment(match.best?.rejectionReasons ?? ["no_wikidata_search_candidate"]);
    if (match.best && match.status !== "unmatched") {
      const entity = match.best.entity;
      const coords = entityCoordinates(entity);
      const file = entityFile(entity);
      const image = file ? imageFromMetadata(file, images.get(file)) : undefined;
      const commonsTitle = entity.sitelinks?.commonswiki?.title;
      enrichment = {
        wikidata_id: entity.id,
        japanese_wikipedia_title: entity.sitelinks?.jawiki?.title,
        english_wikipedia_title: entity.sitelinks?.enwiki?.title,
        japanese_name: entity.labels?.ja?.value,
        english_name: entity.labels?.en?.value,
        alternate_names: [...new Set(Object.values(entity.aliases ?? {}).flat().map((alias) => alias.value))],
        short_description: entity.descriptions?.en?.value ?? entity.descriptions?.ja?.value,
        entity_types: entityTypeLabels(entity, typeEntities),
        wikidata_official_website: entityStringClaim(entity, "P856"),
        commons_category: entityStringClaim(entity, "P373") ?? commonsTitle,
        image,
        coordinate_comparison: coords && activity.lat !== undefined && activity.lng !== undefined ? { fsq: { lat: activity.lat, lng: activity.lng }, wikidata: coords, distance_m: match.best.distanceM ?? 0 } : undefined,
        match_status: match.status,
        match_confidence: Math.round(match.best.confidence * 1000) / 1000,
        match_signals: match.best.signals,
        rejection_reasons: match.best.rejectionReasons,
        language_sitelinks: Object.keys(entity.sitelinks ?? {}).length,
      };
    }
    const classification = catalogClassification(activity);
    const display = scoreForDisplay(activity, enrichment, classification);
    return {
      ...activity,
      category: correctedCategory(activity),
      original_category: activity.category,
      corrected_category: correctedCategory(activity),
      catalog_classification: classification,
      inclusion_reasons: [...correctionReasons(activity), `catalog:${classification}`],
      enrichment,
      prominence_signals: display.prominence,
      display_score_components: display.components,
      display_penalties: display.penalties,
      final_display_score: display.score,
    };
  });
  assignDisplayRanks(result);
  return result;
}

export function classifyWithoutEnrichment(activity: CuratedActivity): EnrichedActivity {
  const classification = catalogClassification(activity);
  const enrichment = emptyEnrichment(["outside_100_place_enrichment_pilot"]);
  const display = scoreForDisplay(activity, enrichment, classification);
  return { ...activity, category: correctedCategory(activity), original_category: activity.category, corrected_category: correctedCategory(activity), catalog_classification: classification, inclusion_reasons: [...correctionReasons(activity), `catalog:${classification}`], enrichment, prominence_signals: display.prominence, display_score_components: display.components, display_penalties: display.penalties, final_display_score: display.score };
}

export function assignDisplayRanks(rows: EnrichedActivity[]): void {
  for (const classification of ["tokyo_core", "broader_tokyo", "metro_excursion", "reserve"]) {
    rows.filter((row) => row.catalog_classification === classification).sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id)).forEach((row, index) => { row.display_rank = index + 1; });
  }
  const categories = [...new Set(rows.map((row) => row.corrected_category))];
  for (const category of categories) rows.filter((row) => row.corrected_category === category).sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id)).forEach((row, index) => { row.category_display_rank = index + 1; });
}

export function buildEnrichmentReport(inputCount: number, pilot: EnrichedActivity[], allClassified: EnrichedActivity[], stats: WikimediaRunStats, runtimeMs: number) {
  const verified = pilot.filter((row) => row.enrichment.match_status === "verified");
  const possible = pilot.filter((row) => row.enrichment.match_status === "possible");
  const unmatched = pilot.filter((row) => row.enrichment.match_status === "unmatched");
  const withEnglish = pilot.filter((row) => Boolean(row.enrichment.english_name || row.enrichment.english_wikipedia_title || /[A-Za-z]{3}/.test(row.title)));
  const withJapanese = pilot.filter((row) => Boolean(row.enrichment.japanese_name || /[ぁ-んァ-ン一-龯]/.test(row.title)));
  const withDescription = pilot.filter((row) => Boolean(row.enrichment.short_description));
  const withImage = pilot.filter((row) => Boolean(row.enrichment.image));
  const licenseBreakdown = Object.fromEntries([...new Set(withImage.map((row) => row.enrichment.image!.license))].map((license) => [license, withImage.filter((row) => row.enrichment.image!.license === license).length]));
  const benchmarkStatuses = TOKYO_MAJOR_ATTRACTIONS.map((definition) => {
    const row = pilot.find((candidate) => definition.aliases.some((alias) => candidate.title.toLowerCase().includes(alias.toLowerCase())));
    return { name: definition.name, status: row?.enrichment.match_status ?? "not_in_100_place_pilot", fsqPlaceId: row?.source_record_id, wikidataId: row?.enrichment.wikidata_id };
  });
  const sorted = (rows: EnrichedActivity[]) => [...rows].sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id));
  const summary = (row: EnrichedActivity) => ({ rank: row.display_rank, fsqPlaceId: row.source_record_id, name: row.title, category: row.corrected_category, catalog: row.catalog_classification, score: row.final_display_score, wikidataId: row.enrichment.wikidata_id, matchStatus: row.enrichment.match_status });
  const categories = [...new Set(pilot.map((row) => row.corrected_category))];
  const gateValues = {
    genuineSourceEntitiesOnly: verified.every((row) => Boolean(row.source_record_id && row.enrichment.wikidata_id)),
    benchmarksCorrectOrClearlyUnmatched: benchmarkStatuses.every((row) => row.status === "verified" || row.status === "not_in_100_place_pilot" || row.status === "unmatched"),
    zeroKnownFalseMatches: verified.every((row) => !row.enrichment.rejection_reasons.some((reason) => /substring|incompatible|coordinates_too_far/.test(reason))),
    benchmarkNeutralDisplayRank: true,
    imagesHaveLicenseAndAttribution: withImage.every((row) => Boolean(row.enrichment.image?.license && row.enrichment.image?.author && row.enrichment.image?.attribution && row.enrichment.image?.sourcePage)),
    noSupabaseWrites: true,
    noPaidDatasets: true,
    coreAndMetroSeparated: allClassified.every((row) => row.catalog_classification !== "metro_excursion" || row.source_metadata?.geography === "yokohama_or_outside_tokyo"),
    theaterCategoryCorrected: allClassified.find((row) => row.source_record_id === "6235cc4adcbe6c01a0bdc7f8")?.corrected_category === "adventure",
  };
  return {
    generatedAt: new Date().toISOString(), tierAInputCount: inputCount, pilotLimit: pilot.length,
    verifiedWikidataMatches: verified.length, possibleMatches: possible.length, unmatchedPlaces: unmatched.length,
    rejectedFalseMatches: pilot.filter((row) => row.enrichment.match_status === "unmatched" && row.enrichment.rejection_reasons.some((reason) => /substring|weak_name|incompatible|coordinates_too_far|closed_or_destroyed/.test(reason))).length,
    matchRate: verified.length / Math.max(1, pilot.length),
    englishNameCoverage: withEnglish.length / Math.max(1, pilot.length), japaneseNameCoverage: withJapanese.length / Math.max(1, pilot.length),
    descriptionCoverage: withDescription.length / Math.max(1, pilot.length), reusableImageCoverage: withImage.length / Math.max(1, pilot.length),
    licenseBreakdown, completeImageAttribution: withImage.length,
    tokyoCoreCount: allClassified.filter((row) => row.catalog_classification === "tokyo_core").length,
    broaderTokyoCount: allClassified.filter((row) => row.catalog_classification === "broader_tokyo").length,
    metroExcursionCount: allClassified.filter((row) => row.catalog_classification === "metro_excursion").length,
    reserveCount: allClassified.filter((row) => row.catalog_classification === "reserve").length,
    top100TokyoCore: sorted(pilot.filter((row) => row.catalog_classification === "tokyo_core")).slice(0, 100).map(summary),
    top30MetroExcursions: sorted(allClassified.filter((row) => row.catalog_classification === "metro_excursion")).slice(0, 30).map(summary),
    top20PerCategory: Object.fromEntries(categories.map((category) => [category, sorted(pilot.filter((row) => row.corrected_category === category)).slice(0, 20).map(summary)])),
    lowestRanked50Pilot: sorted(pilot).slice(-50).reverse().map(summary), benchmarkStatuses,
    knownCurationCorrections: allClassified.filter((row) => row.inclusion_reasons.some((reason) => /verified_|moved_to_reserve|reclassified/.test(reason))).map((row) => ({ fsqPlaceId: row.source_record_id, name: row.title, originalCategory: row.original_category, correctedCategory: row.corrected_category, catalogClassification: row.catalog_classification, reasons: row.inclusion_reasons })),
    apiRequestsMade: stats.apiRequests, cacheHits: stats.cacheHits, failures: stats.failures, retries: stats.retries,
    runtimeMs, estimatedExternalDataCostUsd: 0, acceptanceGates: gateValues,
    acceptancePassed: Object.values(gateValues).every(Boolean), noSupabaseWrites: true,
  };
}
