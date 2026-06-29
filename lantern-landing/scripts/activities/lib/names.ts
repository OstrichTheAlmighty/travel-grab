/** Normalize a place name for comparison: lower-case and strip punctuation/accents. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  const result = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

/** Jaccard similarity of two character-trigram sets. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const left = trigrams(a);
  const right = trigrams(b);
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 1 : intersection / union;
}
