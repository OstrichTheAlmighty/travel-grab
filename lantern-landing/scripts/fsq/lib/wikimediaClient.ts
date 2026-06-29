import type { WikimediaCache } from "./wikimediaCache";
import type { WikipediaSearchPage, WikidataEntity, WikidataSearchResult } from "./wikimediaTypes";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const JA_WIKIPEDIA_API = "https://ja.wikipedia.org/w/api.php";
const EN_WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = process.env.WIKIMEDIA_USER_AGENT ?? "TravelGrabFSQEnrichment/0.1 (local pilot; contact: https://travelgrab.app)";

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

export class WikimediaClient {
  private lastRequestAt = 0;
  private readonly entityRedirects = new Map<string, string>();

  constructor(private readonly cache: WikimediaCache, private readonly minimumDelayMs = 125) {}

  private async request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries({ format: "json", formatversion: "2", maxlag: "5", ...params })) url.searchParams.set(key, value);
    const key = url.toString();
    const cached = this.cache.read<T>(key);
    if (cached?.status === "ok") return cached.value as T;
    if (cached?.status === "failed") throw new Error(`Cached Wikimedia request failure: ${cached.error ?? "unknown failure"}`);

    let lastError = "unknown Wikimedia failure";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const wait = Math.max(0, this.minimumDelayMs - (Date.now() - this.lastRequestAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();
      this.cache.stats.apiRequests += 1;
      try {
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
        if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value = await response.json() as T & { error?: { code?: string; info?: string } };
        if (value.error) throw new Error(`${value.error.code ?? "api_error"}: ${value.error.info ?? "Wikimedia API error"}`);
        this.cache.writeSuccess(key, value);
        return value;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < 2) {
          this.cache.stats.retries += 1;
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    this.cache.stats.failures += 1;
    this.cache.writeFailure(key, lastError);
    throw new Error(`Wikimedia request failed after retries: ${lastError}`);
  }

  async search(query: string, language: "ja" | "en"): Promise<WikidataSearchResult[]> {
    const response = await this.request<{ search?: WikidataSearchResult[] }>(WIKIDATA_API, {
      action: "wbsearchentities", search: query, language, uselang: "en", type: "item", limit: "7", continue: "0",
    });
    return response.search ?? [];
  }

  async getEntities(ids: string[]): Promise<Map<string, WikidataEntity>> {
    const result = new Map<string, WikidataEntity>();
    for (const batch of chunks([...new Set(ids)].sort(), 50)) {
      if (!batch.length) continue;
      const response = await this.request<{ entities?: Record<string, WikidataEntity>; redirects?: Array<{ from?: string; to?: string }> | Record<string, string> }>(WIKIDATA_API, {
        action: "wbgetentities", ids: batch.join("|"), props: "labels|aliases|descriptions|claims|sitelinks", languages: "ja|en", redirects: "yes",
      });
      if (Array.isArray(response.redirects)) {
        for (const redirect of response.redirects) if (redirect.from && redirect.to) this.entityRedirects.set(redirect.from, redirect.to);
      } else {
        for (const [from, to] of Object.entries(response.redirects ?? {})) this.entityRedirects.set(from, to);
      }
      for (const entity of Object.values(response.entities ?? {})) if (!entity.id.startsWith("-")) result.set(entity.id, entity);
    }
    return result;
  }

  getEntityRedirects(): Map<string, string> { return new Map(this.entityRedirects); }

  async searchWikipedia(query: string, language: "ja" | "en"): Promise<WikipediaSearchPage[]> {
    const response = await this.request<{ query?: { redirects?: Array<{ from?: string; to?: string }>; normalized?: Array<{ from?: string; to?: string }>; pages?: Array<{ title?: string; pageprops?: { wikibase_item?: string }; coordinates?: Array<{ lat?: number; lon?: number }>; terms?: { description?: string[] } }> } }>(language === "ja" ? JA_WIKIPEDIA_API : EN_WIKIPEDIA_API, {
      action: "query", generator: "search", gsrsearch: query, gsrnamespace: "0", gsrlimit: "5",
      prop: "pageprops|coordinates|pageterms", wbptterms: "description", redirects: "1",
    });
    const redirects = [...(response.query?.normalized ?? []), ...(response.query?.redirects ?? [])].filter((entry): entry is { from: string; to: string } => Boolean(entry.from && entry.to));
    return (response.query?.pages ?? []).map((page) => ({
      title: page.title ?? "", wikidataId: page.pageprops?.wikibase_item,
      description: page.terms?.description?.[0], lat: page.coordinates?.[0]?.lat, lng: page.coordinates?.[0]?.lon,
      route: language === "ja" ? "jawiki_search" as const : "enwiki_search" as const,
      redirects,
    })).filter((page) => Boolean(page.title));
  }

  async nearbyWikidata(lat: number, lng: number, radiusM: number): Promise<string[]> {
    const response = await this.request<{ query?: { geosearch?: Array<{ title?: string }> } }>(WIKIDATA_API, {
      action: "query", list: "geosearch", gscoord: `${lat}|${lng}`, gsradius: String(Math.min(10_000, Math.max(10, Math.round(radiusM)))), gslimit: "20", gsnamespace: "0",
    });
    return (response.query?.geosearch ?? []).map((result) => result.title ?? "").filter((title) => /^Q\d+$/.test(title));
  }

  async getCommonsImageMetadata(files: string[]): Promise<Map<string, Record<string, string>>> {
    const result = new Map<string, Record<string, string>>();
    for (const batch of chunks([...new Set(files)].sort(), 40)) {
      if (!batch.length) continue;
      const response = await this.request<{ query?: { pages?: Array<{ title?: string; imageinfo?: Array<{ url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }> }> } }>(COMMONS_API, {
        action: "query", prop: "imageinfo", titles: batch.map((file) => `File:${file}`).join("|"), iiprop: "url|extmetadata",
      });
      for (const page of response.query?.pages ?? []) {
        const info = page.imageinfo?.[0];
        const file = page.title?.replace(/^File:/, "");
        if (!file || !info) continue;
        const flat = Object.fromEntries(Object.entries(info.extmetadata ?? {}).map(([key, value]) => [key, value.value ?? ""]));
        result.set(file, { ...flat, url: info.url ?? "", descriptionurl: info.descriptionurl ?? "" });
      }
    }
    return result;
  }
}
