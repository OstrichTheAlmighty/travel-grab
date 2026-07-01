import type { Activity } from "@/app/activities/data/types";

export type ActivityRequestState =
  | "idle"
  | "loading"
  | "loaded"
  | "city_not_built"
  | "request_failed";

export type ActivityPageState = ActivityRequestState | "empty_search_results";

export interface ActivitySearchResult {
  activities: Activity[];
  city: string;
  country: string;
  source?: string;
  inventoryStatus?: "building" | "ready";
  inventorySize?: number;
  inventoryProgress?: { completed: number; total: number };
  _debug?: {
    cacheSource: string;
    apiCallsMade: number;
    searchGroups?: number;
    googleHttpRequests?: { textSearch: number; nearbySearch: number; geocoding: number };
    entriesLoaded: number;
  };
}

export interface ActivitySearchApiResponse extends Partial<ActivitySearchResult> {
  error?: string;
  limitReached?: boolean;
  cityNotBuilt?: boolean;
  requestedDestination?: string;
}

export interface ActivityLoadState {
  status: ActivityRequestState;
  requestedDestination: string;
  result: ActivitySearchResult | null;
  error: string | null;
  requestId: number;
}

export type ActivityLoadAction =
  | { type: "start"; requestId: number; destination: string }
  | { type: "loaded"; requestId: number; result: ActivitySearchResult }
  | { type: "city_not_built"; requestId: number }
  | { type: "request_failed"; requestId: number; error: string }
  | { type: "update_inventory_size"; requestId: number; size: number }
  | { type: "reset"; requestId: number; destination?: string };

export const INITIAL_ACTIVITY_LOAD_STATE: ActivityLoadState = {
  status: "idle",
  requestedDestination: "Tokyo, Japan",
  result: null,
  error: null,
  requestId: 0,
};

export function activityLoadReducer(
  state: ActivityLoadState,
  action: ActivityLoadAction,
): ActivityLoadState {
  if (action.type === "start") {
    return {
      status: "loading",
      requestedDestination: action.destination,
      result: null,
      error: null,
      requestId: action.requestId,
    };
  }

  if (action.type === "reset") {
    return {
      status: "idle",
      requestedDestination: action.destination ?? "",
      result: null,
      error: null,
      requestId: action.requestId,
    };
  }

  // Late responses and polling updates from an older destination are ignored.
  if (action.requestId !== state.requestId) return state;

  if (action.type === "loaded") {
    return { ...state, status: "loaded", result: action.result, error: null };
  }
  if (action.type === "city_not_built") {
    return { ...state, status: "city_not_built", result: null, error: null };
  }
  if (action.type === "request_failed") {
    return { ...state, status: "request_failed", result: null, error: action.error };
  }
  if (action.type === "update_inventory_size") {
    return state.result
      ? { ...state, result: { ...state.result, inventorySize: action.size } }
      : state;
  }
  return state;
}

export function classifyActivitySearchResponse(
  responseOk: boolean,
  response: ActivitySearchApiResponse,
): "loaded" | "city_not_built" | "request_failed" {
  if (response.cityNotBuilt === true) return "city_not_built";
  if (!responseOk || response.error) return "request_failed";
  return "loaded";
}

export function deriveActivityPageState(
  requestState: ActivityRequestState,
  hasInventoryContext: boolean,
  visibleResultCount: number,
): ActivityPageState {
  if (requestState === "loaded" && hasInventoryContext && visibleResultCount === 0) {
    return "empty_search_results";
  }
  return requestState;
}

function normalizedCity(value: string): string {
  return value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\bcity\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function activityResultMatchesDestination(
  result: Pick<ActivitySearchResult, "city">,
  destination: string,
): boolean {
  const requested = normalizedCity(destination);
  const returned = normalizedCity(result.city);
  return requested.length > 0
    && returned.length > 0
    && (requested === returned || requested.includes(returned) || returned.includes(requested));
}
