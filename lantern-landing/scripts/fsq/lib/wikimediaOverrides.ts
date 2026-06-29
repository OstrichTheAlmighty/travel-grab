import type { CuratedActivity } from "./curation";

export interface ReviewedEntityOverride {
  fsqPlaceId: string;
  wikidataId: string;
  entityLabel: string;
  fsqCoordinates: { lat: number; lng: number };
  wikidataCoordinates: { lat: number; lng: number };
  reviewReason: string;
  reviewedBy: string;
  reviewedAt: string;
}

/** Human-authored registry only. Never append to this list from runtime code. */
export const REVIEWED_ENTITY_OVERRIDES: readonly ReviewedEntityOverride[] = Object.freeze([]);

export function validateReviewedOverride(override: ReviewedEntityOverride, activity: CuratedActivity): string[] {
  const errors: string[] = [];
  if (!/^[a-f0-9]{24}$/i.test(override.fsqPlaceId)) errors.push("invalid_fsq_place_id");
  if (!/^Q\d+$/.test(override.wikidataId)) errors.push("invalid_wikidata_id");
  if (!override.entityLabel.trim()) errors.push("missing_entity_label");
  if (!override.reviewReason.trim()) errors.push("missing_review_reason");
  if (!override.reviewedBy.trim() || !/^\d{4}-\d{2}-\d{2}/.test(override.reviewedAt)) errors.push("missing_review_audit_identity");
  if (activity.source_record_id !== override.fsqPlaceId) errors.push("fsq_identity_mismatch");
  if (activity.lat !== override.fsqCoordinates.lat || activity.lng !== override.fsqCoordinates.lng) errors.push("fsq_coordinates_mismatch");
  if (![override.wikidataCoordinates.lat, override.wikidataCoordinates.lng].every(Number.isFinite)) errors.push("invalid_wikidata_coordinates");
  return errors;
}

export function findReviewedOverride(activity: CuratedActivity, registry: readonly ReviewedEntityOverride[] = REVIEWED_ENTITY_OVERRIDES): ReviewedEntityOverride | undefined {
  const override = registry.find((entry) => entry.fsqPlaceId === activity.source_record_id);
  return override && validateReviewedOverride(override, activity).length === 0 ? override : undefined;
}
