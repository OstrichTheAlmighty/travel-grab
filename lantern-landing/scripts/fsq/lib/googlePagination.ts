import type { GoogleRow } from "../../overture/lib/matcher";

export async function paginateGoogleRows(
  total: number,
  fetchPage: (from: number, to: number) => Promise<GoogleRow[]>,
  pageSize = 1_000,
): Promise<GoogleRow[]> {
  const rows: GoogleRow[] = [];
  for (let from = 0; from < total; from += pageSize) {
    const page = await fetchPage(from, Math.min(total - 1, from + pageSize - 1));
    rows.push(...page);
  }
  if (rows.length !== total) throw new Error(`Google pagination mismatch: expected ${total}, fetched ${rows.length}`);
  return rows;
}
