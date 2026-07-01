export const PLACE_MODAL_MODES = ["direct", "ui-kit", "comparison", "hybrid"] as const;

export type PlaceModalMode = (typeof PLACE_MODAL_MODES)[number];

export function parsePlaceModalMode(search: string | URLSearchParams): PlaceModalMode {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  const requested = params.get("placeModal");
  return PLACE_MODAL_MODES.includes(requested as PlaceModalMode)
    ? requested as PlaceModalMode
    : "direct";
}

export function shouldLoadPlacesUIKit(mode: PlaceModalMode, modalOpen: boolean): boolean {
  return modalOpen && (mode === "ui-kit" || mode === "comparison" || mode === "hybrid");
}

export function shouldFetchDirectPlaceDetails(mode: PlaceModalMode): boolean {
  return mode === "direct" || mode === "comparison";
}
