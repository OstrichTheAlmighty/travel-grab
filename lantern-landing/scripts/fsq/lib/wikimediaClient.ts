import type { WikimediaCache } from "./wikimediaCache";
import type { WikidataEntity, WikidataSearchResult } from "./wikimediaTypes";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = process.env.WIKIMEDIA_USER_AGENT ?? "TravelGrabFSQEnrichment/0.1 (local pilot; contact: https://travelgrab.app)";

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

export class WikimediaClient {
  private lastRequestAt = 0;

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
      const response = await this.request<{ entities?: Record<string, WikidataEntity> }>(WIKIDATA_API, {
        action: "wbgetentities", ids: batch.join("|"), props: "labels|aliases|descriptions|claims|sitelinks", languages: "ja|en",
      });
      for (const entity of Object.values(response.entities ?? {})) if (!entity.id.startsWith("-")) result.set(entity.id, entity);
    }
    return result;
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
