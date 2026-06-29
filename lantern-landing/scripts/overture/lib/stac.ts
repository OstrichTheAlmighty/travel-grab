const STAC_URL = "https://stac.overturemaps.org/catalog.json";

/** Matches YYYY-MM-DD or YYYY-MM-DD.N release identifiers */
const RELEASE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

interface StacCatalog {
  links?: Array<{ rel?: string; href?: string; title?: string }>;
}

/**
 * Resolves the latest Overture Maps release identifier from the public STAC catalog.
 *
 * The catalog lists all available releases as child links. Each release identifier
 * follows the format YYYY-MM-DD.N (e.g. "2025-06-17.0"). Lexicographic ordering
 * equals chronological ordering for YYYY-MM-DD prefixes, so a simple sort suffices.
 *
 * Resolution strategy:
 *   1. title field of the link (explicit release name, most reliable)
 *   2. Parse the path component of href (e.g. ".../2025-06-17.0/collection.json")
 */
export async function resolveLatestRelease(): Promise<string> {
  const resp = await fetch(STAC_URL, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) {
    throw new Error(
      `STAC catalog fetch failed: HTTP ${resp.status} from ${STAC_URL}`,
    );
  }

  const catalog = (await resp.json()) as StacCatalog;
  const releases: string[] = [];

  for (const link of catalog.links ?? []) {
    if (link.rel !== "child") continue;

    let id: string | undefined;

    // Prefer explicit title (e.g. "2025-06-17.0")
    const title = link.title?.trim();
    if (title && RELEASE_PATTERN.test(title)) {
      id = title;
    }

    // Fall back to parsing the href path component
    if (!id && link.href) {
      const match = link.href.match(/\/(\d{4}-\d{2}-\d{2}(?:\.\d+)?)\//);
      if (match) id = match[1];
    }

    if (id) releases.push(id);
  }

  if (releases.length === 0) {
    throw new Error(
      "No releases found in Overture STAC catalog. " +
        `Check ${STAC_URL} manually.`,
    );
  }

  // Lexicographic sort = chronological sort for YYYY-MM-DD.N format
  releases.sort().reverse();
  return releases[0];
}

/**
 * Converts a release string to a filesystem-safe slug.
 * "2025-06-17.0" → "2025-06-17-0"
 */
export function releaseToSlug(release: string): string {
  return release.replace(/\./g, "-");
}
