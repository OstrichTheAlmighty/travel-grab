import type { CuratedActivity } from "./curation";

export type CatalogClassification = "tokyo_core" | "broader_tokyo" | "metro_excursion" | "reserve";
export type WikimediaMatchStatus = "verified" | "possible" | "unmatched";

export interface WikimediaImage {
  file: string;
  url: string;
  license: string;
  licenseUrl?: string;
  author: string;
  attribution: string;
  sourcePage: string;
}

export interface WikimediaEnrichment {
  wikidata_id?: string;
  japanese_wikipedia_title?: string;
  english_wikipedia_title?: string;
  japanese_name?: string;
  english_name?: string;
  alternate_names: string[];
  short_description?: string;
  entity_types: string[];
  wikidata_official_website?: string;
  commons_category?: string;
  image?: WikimediaImage;
  coordinate_comparison?: { fsq: { lat: number; lng: number }; wikidata: { lat: number; lng: number }; distance_m: number };
  match_status: WikimediaMatchStatus;
  match_confidence: number;
  match_signals: string[];
  rejection_reasons: string[];
  language_sitelinks: number;
}

export interface EnrichedActivity extends CuratedActivity {
  catalog_classification: CatalogClassification;
  original_category: string;
  corrected_category: string;
  inclusion_reasons: string[];
  display_rank?: number;
  category_display_rank?: number;
  enrichment: WikimediaEnrichment;
  prominence_signals: string[];
  display_score_components: Array<{ signal: string; amount: number }>;
  display_penalties: string[];
  final_display_score: number;
}

export interface WikidataEntity {
  id: string;
  labels?: Record<string, { language: string; value: string }>;
  aliases?: Record<string, Array<{ language: string; value: string }>>;
  descriptions?: Record<string, { language: string; value: string }>;
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
  sitelinks?: Record<string, { site: string; title: string }>;
}

export interface WikidataSearchResult {
  id: string;
  label?: string;
  description?: string;
  aliases?: string[];
  match?: { type?: string; language?: string; text?: string };
}

export interface WikimediaRunStats {
  apiRequests: number;
  cacheHits: number;
  failures: number;
  retries: number;
}
