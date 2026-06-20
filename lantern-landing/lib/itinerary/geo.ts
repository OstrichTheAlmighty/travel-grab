import type { LatLng, TransitMode } from "./types";

const EARTH_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Estimate travel time between two points without calling an external API.
 *
 * Walking:  5 km/h
 * Transit:  20 km/h average speed + 11-min fixed overhead (walk to stop, wait, exit)
 * Driving:  30 km/h city average + 5-min parking overhead
 *
 * Minimum returned: 5 minutes (nearby ≠ instant).
 */
export function estimateTransit(
  a: LatLng,
  b: LatLng,
  mode: TransitMode,
): { durationMinutes: number; distanceKm: number } {
  const distKm = haversineKm(a, b);
  let minutes: number;

  switch (mode) {
    case "walking":
      minutes = (distKm / 5) * 60;
      break;
    case "driving":
      minutes = (distKm / 30) * 60 + 5;
      break;
    default: // "transit"
      minutes = (distKm / 20) * 60 + 11;
  }

  return {
    durationMinutes: Math.max(5, Math.round(minutes)),
    distanceKm:      Math.round(distKm * 100) / 100,
  };
}

/**
 * Assign each point to one of k clusters via k-means (haversine distance).
 * Returns an array of cluster indices, parallel to `points`.
 */
export function clusterByLocation(points: LatLng[], k: number): number[] {
  if (points.length === 0) return [];

  const n = points.length;
  const clampedK = Math.min(k, n);
  if (clampedK <= 1) return new Array<number>(n).fill(0);

  // Initialise centroids: pick k points evenly spread across lat-sorted order
  const sorted = [...points]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.lat - b.p.lat || a.p.lng - b.p.lng);

  const step = Math.max(1, Math.floor(n / clampedK));
  const centroids: LatLng[] = Array.from(
    { length: clampedK },
    (_, j) => ({ ...sorted[Math.min(j * step, n - 1)].p }),
  );

  let assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < 60; iter++) {
    // Assign each point to the nearest centroid
    const next = points.map((p) => {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < clampedK; c++) {
        const d = haversineKm(p, centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      return best;
    });

    const converged = next.every((a, i) => a === assignments[i]);
    assignments = next;
    if (converged) break;

    // Recompute centroids
    for (let c = 0; c < clampedK; c++) {
      const members = points.filter((_, i) => assignments[i] === c);
      if (members.length === 0) {
        // Re-seed empty cluster with the farthest point from any centroid
        let farthest = 0;
        let farthestDist = -1;
        for (let i = 0; i < n; i++) {
          const d = Math.min(...centroids.map((cen) => haversineKm(points[i], cen)));
          if (d > farthestDist) {
            farthestDist = d;
            farthest = i;
          }
        }
        centroids[c] = { ...points[farthest] };
        continue;
      }
      centroids[c] = {
        lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
        lng: members.reduce((s, p) => s + p.lng, 0) / members.length,
      };
    }
  }

  // Renumber clusters deterministically by their centroid latitude (N→S day order)
  const centroidOrder = centroids
    .map((c, i) => ({ lat: c.lat, i }))
    .sort((a, b) => b.lat - a.lat)
    .map((x, rank) => ({ original: x.i, rank }));

  const remap: number[] = new Array(clampedK);
  for (const { original, rank } of centroidOrder) remap[original] = rank;

  return assignments.map((c) => remap[c]);
}
