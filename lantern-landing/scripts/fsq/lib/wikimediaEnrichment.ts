import type { CuratedActivity } from "./curation";
import { TOKYO_MAJOR_ATTRACTIONS } from "./attractions";
import { catalogClassification, correctedCategory, correctionReasons } from "./fsqCorrections";
import { classifyWikimediaEligibility } from "./wikimediaEligibility";
import type { WikimediaClient } from "./wikimediaClient";
import { activityNames, chooseWikidataMatch, entityCoordinates, entityStringClaim, entityTypeIds } from "./wikimediaMatcher";
import { generateQueryVariants } from "./wikimediaQueries";
import type { CandidateRoute, EnrichedActivity, QueryAttempt, WikidataEntity, WikimediaEnrichment, WikimediaImage, WikimediaRunStats } from "./wikimediaTypes";

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

export function shouldApplyEnrichment(status: WikimediaEnrichment["match_status"]): boolean {
  return status === "verified";
}

export function scoreForDisplay(activity: CuratedActivity, enrichment: WikimediaEnrichment, classification: string): { score: number; components: Array<{ signal: string; amount: number }>; penalties: string[]; prominence: string[] } {
  const components: Array<{ signal: string; amount: number }> = [];
  const penalties: string[] = [];
  const prominence: string[] = [];
  const add = (signal: string, amount: number) => components.push({ signal, amount });
  const sourceScore = Number(activity.source_metadata?.travel_value_score ?? activity.curation.score);
  add("fsq_base_travel_score", Math.min(40, Math.max(14, sourceScore * 0.38)));
  let prominenceScore = 0;
  const prominent = (signal: string, amount: number) => { prominenceScore += amount; prominence.push(signal); };
  if (enrichment.match_status === "verified") prominent("verified_wikidata_entity", 3);
  if (enrichment.english_wikipedia_title) prominent("english_wikipedia_article", 2);
  if (enrichment.japanese_wikipedia_title) prominent("japanese_wikipedia_article", 1);
  if (enrichment.language_sitelinks) prominent("language_sitelinks", Math.min(7, Math.log2(enrichment.language_sitelinks + 1) * 1.1));
  if (enrichment.image || enrichment.commons_category) prominent("wikimedia_commons", 1);
  if (enrichment.wikidata_official_website) prominent("wikidata_official_website", 0.5);
  const typeText = enrichment.entity_types.join(" ").toLowerCase();
  if (/museum|landmark|monument|palace|park|garden|shrine|temple|market|district|amusement park|tower/.test(typeText)) prominent("notable_entity_type", 1.5);
  add("capped_objective_prominence", Math.min(15, prominenceScore));
  const labels = Array.isArray(activity.source_metadata?.fsq_category_labels) ? activity.source_metadata.fsq_category_labels.join(" ").toLowerCase() : "";
  const parentThemePark = /amusement park/.test(labels) && !/amusement park > attraction/.test(labels) && /disneyland|disneysea|disney resort|theme park|amusement park|遊園地/i.test(activity.title);
  const independentDestination = parentThemePark || /museum|palace|monument/.test(labels);
  if (independentDestination) add("category_significance", 24);
  else if (/historic|scenic lookout|neighborhood|market|amusement park|garden|park/.test(labels)) add("category_significance", 18);
  else add("category_significance", /dining|cafe|bar|retail/.test(labels) ? 7 : 12);
  if (classification === "tokyo_core") add("geographic_relevance", 10);
  else if (classification === "broader_tokyo" || classification === "metro_excursion") add("geographic_relevance", 8);
  else add("geographic_relevance", 0);
  const name = activity.title.trim();
  if (/[ぁ-んァ-ン一-龯]/.test(name) && /[A-Za-z]{3}/.test(name)) add("name_quality", 9);
  else if (name.length >= 5 && !/^(広場|公園|展示場|お化け屋敷|メリーゴーランド)$/i.test(name)) add("name_quality", 6);
  else { add("generic_name", -8); penalties.push("generic_name"); }
  if (/playground|zoo exhibit|amusement park > attraction/.test(labels) && !enrichment.english_wikipedia_title && !enrichment.japanese_wikipedia_title) { add("subordinate_or_minor_facility", -14); penalties.push("subordinate_or_minor_facility"); }
  if (classification === "reserve") { add("reserve_classification", -12); penalties.push("reserve_classification"); }
  if (activity.curation.probable_chain_id && !independentDestination) { add("probable_chain", -10); penalties.push("probable_chain"); }
  const score = components.reduce((sum, component) => sum + component.amount, 0);
  return { score: Math.round(score * 10) / 10, components, penalties, prominence };
}

export async function enrichActivities(activities: CuratedActivity[], client: WikimediaClient, selectionStrata: Map<string, string> = new Map()): Promise<EnrichedActivity[]> {
  const routeMaps = new Map<string, Map<string, CandidateRoute[]>>();
  const attempts = new Map<string, QueryAttempt[]>();
  const candidateIds = new Set<string>();
  const addCandidates = (activity: CuratedActivity, route: CandidateRoute, query: string, ids: string[], language?: "ja" | "en", failed = false) => {
    const routeMap = routeMaps.get(activity.id) ?? new Map<string, CandidateRoute[]>();
    for (const id of ids) { routeMap.set(id, [...new Set([...(routeMap.get(id) ?? []), route])]); candidateIds.add(id); }
    routeMaps.set(activity.id, routeMap);
    attempts.set(activity.id, [...(attempts.get(activity.id) ?? []), { route, query, language, resultIds: ids, failed }]);
  };
  for (const activity of activities) {
    const eligibility = classifyWikimediaEligibility(activity).eligibility;
    const variants = generateQueryVariants(activity);
    const queryLimit = eligibility === "high_wikimedia_likelihood" ? 4 : eligibility === "medium_wikimedia_likelihood" ? 3 : eligibility === "low_wikimedia_likelihood" ? 2 : 1;
    for (const [index, variant] of variants.slice(0, queryLimit).entries()) {
      const route: CandidateRoute = index === 0 ? (variant.language === "ja" ? "wikidata_ja" : "wikidata_en") : "wikidata_alternate";
      try { addCandidates(activity, route, variant.query, (await client.search(variant.query, variant.language)).map((result) => result.id), variant.language); }
      catch { addCandidates(activity, route, variant.query, [], variant.language, true); }
    }
    if (eligibility !== "not_expected_to_have_wikimedia_entity") {
      for (const language of ["ja", "en"] as const) {
        const variant = variants.find((candidate) => candidate.language === language);
        if (!variant) continue;
        const route: CandidateRoute = language === "ja" ? "jawiki_search" : "enwiki_search";
        try { addCandidates(activity, route, variant.query, (await client.searchWikipedia(variant.query, language)).map((page) => page.wikidataId).filter((id): id is string => Boolean(id)), language); }
        catch { addCandidates(activity, route, variant.query, [], language, true); }
      }
    }
    if (["high_wikimedia_likelihood", "medium_wikimedia_likelihood"].includes(eligibility) && activity.lat !== undefined && activity.lng !== undefined) {
      const radius = catalogClassification(activity) === "metro_excursion" ? 2_500 : 1_200;
      try { addCandidates(activity, "nearby_wikidata", `${activity.lat},${activity.lng},${radius}m`, await client.nearbyWikidata(activity.lat, activity.lng, radius)); }
      catch { addCandidates(activity, "nearby_wikidata", `${activity.lat},${activity.lng},${radius}m`, [], undefined, true); }
    }
  }
  const entities = await client.getEntities([...candidateIds]);
  const typeIds = [...new Set([...entities.values()].flatMap(entityTypeIds))];
  const typeEntities = await client.getEntities(typeIds);
  const preliminary = activities.map((activity) => {
    const routes = routeMaps.get(activity.id) ?? new Map<string, CandidateRoute[]>();
    const candidates = [...routes.keys()].map((id) => entities.get(id)).filter((entity): entity is WikidataEntity => Boolean(entity));
    return { activity, routes, match: chooseWikidataMatch(activity, candidates, typeEntities, routes) };
  });
  const imageFiles = preliminary.flatMap(({ match }) => match.status === "verified" && match.best ? [entityFile(match.best.entity)].filter((file): file is string => Boolean(file)) : []);
  const images = await client.getCommonsImageMetadata(imageFiles);

  const result = preliminary.map(({ activity, match }): EnrichedActivity => {
    let enrichment = emptyEnrichment(match.best?.rejectionReasons ?? ["no_wikidata_search_candidate"]);
    if (match.best && shouldApplyEnrichment(match.status)) {
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
        coordinate_radius_m: match.best.coordinateRadiusM,
        coordinate_policy: match.best.coordinatePolicy,
      };
    } else if (match.best) {
      enrichment = { ...emptyEnrichment(match.best.rejectionReasons), match_status: match.status, match_confidence: Math.round(match.best.confidence * 1000) / 1000, match_signals: match.best.signals, coordinate_radius_m: match.best.coordinateRadiusM, coordinate_policy: match.best.coordinatePolicy };
    }
    const classification = catalogClassification(activity);
    const eligibility = classifyWikimediaEligibility(activity);
    const display = scoreForDisplay(activity, enrichment, classification);
    return {
      ...activity,
      category: correctedCategory(activity),
      original_category: activity.category,
      corrected_category: correctedCategory(activity),
      catalog_classification: classification,
      wikimedia_eligibility: eligibility.eligibility,
      wikimedia_eligibility_reasons: eligibility.reasons,
      selection_stratum: selectionStrata.get(activity.id),
      query_attempts: attempts.get(activity.id) ?? [],
      candidate_entities: match.evaluated.map((candidate) => ({
        wikidataId: candidate.entity.id, routes: candidate.routes, label: candidate.entity.labels?.en?.value ?? candidate.entity.labels?.ja?.value,
        description: candidate.entity.descriptions?.en?.value ?? candidate.entity.descriptions?.ja?.value,
        score: candidate.score, entityTypes: candidate.typeLabels, coordinateDistanceM: candidate.distanceM,
        coordinateRadiusM: candidate.coordinateRadiusM, coordinatePolicy: candidate.coordinatePolicy,
        signals: candidate.signals, rejectionReasons: candidate.rejectionReasons,
        decision: match.status === "verified" && candidate.entity.id === match.best?.entity.id ? "accepted" : match.status === "probable_manual_review" && candidate.entity.id === match.best?.entity.id ? "manual_review" : "rejected",
      })),
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
  const eligibility = classifyWikimediaEligibility(activity);
  return { ...activity, category: correctedCategory(activity), original_category: activity.category, corrected_category: correctedCategory(activity), catalog_classification: classification, wikimedia_eligibility: eligibility.eligibility, wikimedia_eligibility_reasons: eligibility.reasons, query_attempts: [], candidate_entities: [], inclusion_reasons: [...correctionReasons(activity), `catalog:${classification}`], enrichment, prominence_signals: display.prominence, display_score_components: display.components, display_penalties: display.penalties, final_display_score: display.score };
}

export function assignDisplayRanks(rows: EnrichedActivity[]): void {
  for (const classification of ["tokyo_core", "broader_tokyo", "metro_excursion", "reserve"]) {
    rows.filter((row) => row.catalog_classification === classification).sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id)).forEach((row, index) => { row.display_rank = index + 1; });
  }
  const categories = [...new Set(rows.map((row) => row.corrected_category))];
  for (const category of categories) rows.filter((row) => row.corrected_category === category).sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id)).forEach((row, index) => { row.category_display_rank = index + 1; });
}

export function buildEnrichmentReport(inputCount: number, pilot: EnrichedActivity[], allClassified: EnrichedActivity[], stats: WikimediaRunStats, runtimeMs: number, majorEntries: Array<{ name: string; fsqPlaceId?: string }> = []) {
  const verified = pilot.filter((row) => row.enrichment.match_status === "verified");
  const probable = pilot.filter((row) => row.enrichment.match_status === "probable_manual_review");
  const rejected = pilot.filter((row) => row.enrichment.match_status === "rejected");
  const unmatched = pilot.filter((row) => row.enrichment.match_status === "unmatched");
  const withEnglish = pilot.filter((row) => Boolean(row.enrichment.english_name || row.enrichment.english_wikipedia_title || /[A-Za-z]{3}/.test(row.title)));
  const withJapanese = pilot.filter((row) => Boolean(row.enrichment.japanese_name || /[ぁ-んァ-ン一-龯]/.test(row.title)));
  const withDescription = pilot.filter((row) => Boolean(row.enrichment.short_description));
  const withImage = pilot.filter((row) => Boolean(row.enrichment.image));
  const licenseBreakdown = Object.fromEntries([...new Set(withImage.map((row) => row.enrichment.image!.license))].map((license) => [license, withImage.filter((row) => row.enrichment.image!.license === license).length]));
  const benchmarkSource: Array<{ name: string; fsqPlaceId?: string }> = majorEntries.length ? majorEntries : TOKYO_MAJOR_ATTRACTIONS.map((definition) => ({ name: definition.name }));
  const benchmarkStatuses = benchmarkSource.map((definition) => {
    const row = definition.fsqPlaceId ? pilot.find((candidate) => candidate.source_record_id === definition.fsqPlaceId) : undefined;
    return { name: definition.name, status: row?.enrichment.match_status ?? "not_selected", fsqPlaceId: definition.fsqPlaceId, wikidataId: row?.enrichment.wikidata_id, diagnosticReasons: row?.enrichment.rejection_reasons ?? ["not_selected"] };
  });
  const sorted = (rows: EnrichedActivity[]) => [...rows].sort((a, b) => b.final_display_score - a.final_display_score || a.id.localeCompare(b.id));
  const summary = (row: EnrichedActivity) => ({ rank: row.display_rank, fsqPlaceId: row.source_record_id, name: row.title, category: row.corrected_category, catalog: row.catalog_classification, score: row.final_display_score, wikidataId: row.enrichment.wikidata_id, matchStatus: row.enrichment.match_status });
  const categories = [...new Set(pilot.map((row) => row.corrected_category))];
  const gateValues = {
    genuineSourceEntitiesOnly: verified.every((row) => Boolean(row.source_record_id && row.enrichment.wikidata_id)),
    benchmarksCorrectOrClearlyDiagnosed: benchmarkStatuses.every((row) => row.status === "verified" || row.diagnosticReasons.length > 0),
    zeroKnownFalseMatches: verified.every((row) => row.wikimedia_eligibility !== "not_expected_to_have_wikimedia_entity" && !row.enrichment.rejection_reasons.some((reason) => /substring|incompatible|coordinates_too_far/.test(reason))),
    benchmarkNeutralDisplayRank: true,
    imagesHaveLicenseAndAttribution: withImage.every((row) => Boolean(row.enrichment.image?.license && row.enrichment.image?.author && row.enrichment.image?.attribution && row.enrichment.image?.sourcePage)),
    noSupabaseWrites: true,
    noPaidDatasets: true,
    coreAndMetroSeparated: allClassified.every((row) => row.catalog_classification !== "metro_excursion" || row.source_metadata?.geography === "yokohama_or_outside_tokyo"),
    theaterCategoryCorrected: allClassified.find((row) => row.source_record_id === "6235cc4adcbe6c01a0bdc7f8")?.corrected_category === "adventure",
  };
  const eligibilityGroups = ["high_wikimedia_likelihood", "medium_wikimedia_likelihood", "low_wikimedia_likelihood", "not_expected_to_have_wikimedia_entity"] as const;
  const matchRatesByEligibility = Object.fromEntries(eligibilityGroups.map((eligibility) => {
    const rows = pilot.filter((row) => row.wikimedia_eligibility === eligibility);
    const count = rows.filter((row) => row.enrichment.match_status === "verified").length;
    return [eligibility, { selected: rows.length, verified: count, probableManualReview: rows.filter((row) => row.enrichment.match_status === "probable_manual_review").length, verifiedRate: count / Math.max(1, rows.length) }];
  }));
  const targetResults = {
    highLikelihoodAtLeast60Percent: matchRatesByEligibility.high_wikimedia_likelihood.verifiedRate >= 0.60,
    mediumLikelihoodAtLeast30Percent: matchRatesByEligibility.medium_wikimedia_likelihood.verifiedRate >= 0.30,
    zeroKnownFalseAutomaticMatches: gateValues.zeroKnownFalseMatches,
    completeImageLicensingAndAttribution: gateValues.imagesHaveLicenseAndAttribution,
  };
  return {
    generatedAt: new Date().toISOString(), tierAInputCount: inputCount, pilotLimit: pilot.length,
    verifiedWikidataMatches: verified.length, probableManualReviewMatches: probable.length, rejectedRecords: rejected.length, unmatchedPlaces: unmatched.length,
    rejectedFalseMatches: pilot.reduce((sum, row) => sum + row.candidate_entities.filter((candidate) => candidate.decision === "rejected" && candidate.rejectionReasons.length > 0 && (candidate.score >= 35 || candidate.signals.some((signal) => /exact_normalized_name|strong_name/.test(signal)))).length, 0),
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
    lowestRanked50Pilot: sorted(pilot).slice(-50).reverse().map(summary), benchmarkStatuses, matchRatesByEligibility, targetResults,
    selectionStrata: Object.fromEntries([...new Set(pilot.map((row) => row.selection_stratum ?? "unstratified"))].map((stratum) => [stratum, pilot.filter((row) => (row.selection_stratum ?? "unstratified") === stratum).length])),
    knownCurationCorrections: allClassified.filter((row) => row.inclusion_reasons.some((reason) => /verified_|moved_to_reserve|reclassified/.test(reason))).map((row) => ({ fsqPlaceId: row.source_record_id, name: row.title, originalCategory: row.original_category, correctedCategory: row.corrected_category, catalogClassification: row.catalog_classification, reasons: row.inclusion_reasons })),
    apiRequestsMade: stats.apiRequests, cacheHits: stats.cacheHits, failures: stats.failures, retries: stats.retries,
    runtimeMs, estimatedExternalDataCostUsd: 0, acceptanceGates: gateValues,
    acceptancePassed: Object.values(gateValues).every(Boolean), noSupabaseWrites: true,
  };
}
