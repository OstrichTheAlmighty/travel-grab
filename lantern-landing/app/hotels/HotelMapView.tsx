"use client";

import {
  APIProvider,
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, GeoJsonProperties, Geometry, Position } from "geojson";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MapHotelOffer {
  hotel_id:               string;
  name:                   string;
  price_per_night:        number;
  ai_score:               number;
  recommendation_label:   string;
  inferred_neighborhood:  string;
  address:                string;
  latitude?:              number;
  longitude?:             number;
  overall_rating?:        number;
  rank_bullets?:          string[];
  rank_weakness?:         string;
}

interface MapNeighborhood {
  id:            string;
  name:          string;
  matchKeywords: string[];
  tags:          string[];
}

interface MapCityGuide {
  displayName:   string;
  neighborhoods: MapNeighborhood[];
}

interface Props {
  offers:                 MapHotelOffer[];
  selectedHotelId:        string | null;
  onSelectHotel:          (id: string | null) => void;
  destination:            string;
  cityGuide:              MapCityGuide | null;
  selectedNeighborhood:   string | null;
  onSelectNeighborhood:   (id: string | null) => void;
  activePrefs:            readonly string[];
  recommendedNbhdId:      string | null;
}

type HotelCoordinate = { id: string; lat: number; lng: number };

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

// ── Static GeoJSON paths ───────────────────────────────────────────────────────

const GEOJSON_BY_CITY: Record<string, string> = {
  tokyo: "/geojson/tokyo.geojson",
};

function detectCityKey(destination: string): string | null {
  const d = destination.toLowerCase();
  if (d.includes("tokyo"))     return "tokyo";
  if (d.includes("barcelona")) return "barcelona";
  if (d.includes("london"))    return "london";
  if (d.includes("new york") || d.includes("nyc")) return "new york";
  if (d.includes("bangkok"))   return "bangkok";
  if (d.includes("singapore")) return "singapore";
  if (d.includes("seoul"))     return "seoul";
  return null;
}

const CITY_CENTERS: Record<string, { longitude: number; latitude: number; zoom: number }> = {
  tokyo:      { longitude: 139.710, latitude: 35.680, zoom: 12.5 },
  barcelona:  { longitude: 2.173,   latitude: 41.385, zoom: 13   },
  london:     { longitude: -0.128,  latitude: 51.508, zoom: 12.5 },
  "new york": { longitude: -73.984, latitude: 40.748, zoom: 12.5 },
  bangkok:    { longitude: 100.502, latitude: 13.754, zoom: 12.5 },
  singapore:  { longitude: 103.820, latitude: 1.352,  zoom: 12.5 },
  seoul:      { longitude: 126.978, latitude: 37.567, zoom: 12.5 },
};

const NBHD_CENTROIDS: Record<string, Record<string, [number, number]>> = {
  tokyo: {
    "ginza-chuo":       [139.763, 35.673],
    "shinjuku":         [139.700, 35.695],
    "shibuya":          [139.703, 35.657],
    "roppongi-minato":  [139.733, 35.662],
    "asakusa-taito":    [139.798, 35.716],
    "ueno":             [139.772, 35.714],
    "ebisu-daikanyama": [139.708, 35.648],
  },
};

// ── Viewport fitting ──────────────────────────────────────────────────────────

function FitHotelBounds({ coordinates }: { coordinates: HotelCoordinate[] }) {
  const map = useMap();
  const coordinateKey = coordinates
    .map(({ id, lat, lng }) => `${id}:${lat.toFixed(6)}:${lng.toFixed(6)}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!map || coordinates.length === 0) return;

    if (coordinates.length === 1) {
      map.setCenter({ lat: coordinates[0].lat, lng: coordinates[0].lng });
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const coordinate of coordinates) {
      bounds.extend({ lat: coordinate.lat, lng: coordinate.lng });
    }
    map.fitBounds(bounds, { top: 72, right: 72, bottom: 72, left: 72 });
  // The key deliberately excludes selection state and changes only when hotel
  // identities or coordinates change, preventing selection-driven refits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, coordinateKey]);

  return null;
}

// ── Native Google Maps neighborhood polygons ─────────────────────────────────

function toGoogleRing(ring: Position[]): google.maps.LatLngLiteral[] {
  return ring
    .filter((position) => position.length >= 2)
    .map((position) => ({ lat: Number(position[1]), lng: Number(position[0]) }))
    .filter((position) => Number.isFinite(position.lat) && Number.isFinite(position.lng));
}

function NeighborhoodPolygons({
  geoData,
  recommendedNbhdId,
  selectedNeighborhood,
  onSelectNeighborhood,
}: {
  geoData: FeatureCollection<Geometry, GeoJsonProperties> | null;
  recommendedNbhdId: string | null;
  selectedNeighborhood: string | null;
  onSelectNeighborhood: (id: string | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !geoData) return;

    const polygons: google.maps.Polygon[] = [];
    const listeners: google.maps.MapsEventListener[] = [];

    for (const feature of geoData.features) {
      const idValue = feature.properties?.id ?? feature.id;
      const id = typeof idValue === "string" || typeof idValue === "number"
        ? String(idValue)
        : "";
      if (!id) continue;

      const geometry = feature.geometry;
      const polygonCoordinates = geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];

      const isSelected = id === selectedNeighborhood;
      const isRecommended = id === recommendedNbhdId;
      const strokeColor = isSelected ? "#7C3AED" : isRecommended ? "#16A37A" : "#64748B";
      const fillColor = isSelected ? "#8B5CF6" : isRecommended ? "#42D6AE" : "#94A3B8";

      for (const coordinates of polygonCoordinates) {
        const paths = coordinates.map(toGoogleRing).filter((ring) => ring.length >= 3);
        if (paths.length === 0) continue;

        const polygon = new google.maps.Polygon({
          map,
          paths,
          clickable: true,
          fillColor,
          fillOpacity: isSelected ? 0.16 : isRecommended ? 0.13 : 0.025,
          strokeColor,
          strokeOpacity: isSelected ? 0.78 : isRecommended ? 0.68 : 0.16,
          strokeWeight: isSelected ? 2.25 : isRecommended ? 2 : 1,
          zIndex: isSelected ? 3 : isRecommended ? 2 : 1,
        });
        polygons.push(polygon);
        listeners.push(polygon.addListener("click", () => {
          onSelectNeighborhood(id === selectedNeighborhood ? null : id);
        }));
      }
    }

    return () => {
      for (const listener of listeners) listener.remove();
      for (const polygon of polygons) polygon.setMap(null);
    };
  }, [map, geoData, recommendedNbhdId, selectedNeighborhood, onSelectNeighborhood]);

  return null;
}

// ── Marker presentation ───────────────────────────────────────────────────────

function HotelMarker({ hotel, rank, isSelected, onClick }: {
  hotel: MapHotelOffer;
  rank: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const shortName = hotel.name.split(",")[0].split("–")[0].trim();
  const isTop = rank === 1;

  if (rank > 5 && !isSelected) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="whitespace-nowrap rounded-full border border-slate-200 bg-white/85 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 opacity-70 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5 hover:opacity-100"
        title={`#${rank} ${shortName} · $${Math.round(hotel.price_per_night)}/night`}
        aria-label={`Select hotel ranked ${rank}: ${shortName}`}
      >
        #{rank} · ${Math.round(hotel.price_per_night)}
      </button>
    );
  }

  if (!isSelected) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-extrabold leading-none shadow-[0_3px_12px_rgba(15,23,42,0.24)] transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_16px_rgba(15,23,42,0.3)] ${
          isTop
            ? "border-teal-500 bg-[#83F1D0] text-slate-950"
            : "border-slate-200 bg-white text-slate-900"
        }`}
        aria-label={`Select hotel ranked ${rank}: ${shortName}`}
      >
        <span className={isTop ? "text-teal-900" : "text-slate-500"}>#{rank}</span>
        <span className="mx-1 text-current opacity-35">·</span>
        ${Math.round(hotel.price_per_night)}
      </button>
    );
  }

  const display = shortName.length > 24 ? `${shortName.slice(0, 22)}…` : shortName;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[170px] max-w-[225px] rounded-xl border-2 px-3 py-2 text-left shadow-[0_10px_28px_rgba(15,23,42,0.3)] transition-transform hover:-translate-y-0.5 ${
        isTop
          ? "border-teal-600 bg-[#83F1D0] text-slate-950"
          : "border-violet-500 bg-white text-slate-950"
      }`}
      aria-label={`Deselect ${shortName}`}
    >
      <span className={`block text-[9px] font-black uppercase tracking-[0.1em] ${isTop ? "text-teal-800" : "text-violet-700"}`}>
        #{rank} · Selected
      </span>
      <span className="mt-0.5 block truncate text-[12px] font-extrabold leading-tight">{display}</span>
      <span className="mt-1 block text-[10px] font-semibold text-slate-700">
        ${Math.round(hotel.price_per_night)}/night
        {hotel.overall_rating && hotel.overall_rating > 0 ? ` · ${hotel.overall_rating.toFixed(1)}★` : ""}
      </span>
      {hotel.rank_weakness && (
        <span className="mt-1 block text-[9px] leading-snug text-slate-600">{hotel.rank_weakness}</span>
      )}
    </button>
  );
}

function NbhdLabel({ name, isRec, isSelected, reason }: {
  name: string;
  isRec: boolean;
  isSelected: boolean;
  reason?: string | null;
}) {
  return (
    <div className={`select-none whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] shadow-sm ${
      isSelected
        ? "border-violet-500 bg-violet-600 text-white"
        : isRec
          ? "border-teal-500 bg-[#83F1D0] text-teal-950"
          : "border-slate-200 bg-white/90 text-slate-600"
    }`}>
      {name.split(" /")[0]}
      {isRec && reason && (
        <span className="ml-1 normal-case font-semibold tracking-normal opacity-70">· {reason}</span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HotelMapView({
  offers,
  selectedHotelId,
  onSelectHotel,
  destination,
  cityGuide,
  selectedNeighborhood,
  onSelectNeighborhood,
  activePrefs,
  recommendedNbhdId,
}: Props) {
  const cityKey = detectCityKey(destination);
  const geojsonPath = cityKey ? GEOJSON_BY_CITY[cityKey] : null;
  const centroids = cityKey ? (NBHD_CENTROIDS[cityKey] ?? {}) : {};
  const [geoData, setGeoData] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);

  useEffect(() => {
    setGeoData(null);
    if (!geojsonPath) return;

    const controller = new AbortController();
    fetch(geojsonPath, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`GeoJSON request failed with ${response.status}`);
        return response.json() as Promise<FeatureCollection<Geometry, GeoJsonProperties>>;
      })
      .then(setGeoData)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setGeoData(null);
      });

    return () => controller.abort();
  }, [geojsonPath]);

  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => b.ai_score - a.ai_score),
    [offers],
  );

  const rankById = useMemo(
    () => new globalThis.Map(sortedOffers.map((offer, index) => [offer.hotel_id, index + 1])),
    [sortedOffers],
  );

  const geoOffers = useMemo(
    () => sortedOffers.filter((offer) =>
      typeof offer.latitude === "number"
      && typeof offer.longitude === "number"
      && Number.isFinite(offer.latitude)
      && Number.isFinite(offer.longitude),
    ),
    [sortedOffers],
  );

  const coordinates = useMemo<HotelCoordinate[]>(
    () => geoOffers.map((offer) => ({
      id: offer.hotel_id,
      lat: offer.latitude!,
      lng: offer.longitude!,
    })),
    [geoOffers],
  );

  const fallback = cityKey
    ? CITY_CENTERS[cityKey]
    : { longitude: 139.710, latitude: 35.680, zoom: 12.5 };
  const defaultCenter = coordinates.length > 0
    ? { lat: coordinates[0].lat, lng: coordinates[0].lng }
    : { lat: fallback.latitude, lng: fallback.longitude };

  const handleNeighborhoodSelection = useCallback((id: string) => {
    onSelectNeighborhood(id === selectedNeighborhood ? null : id);
  }, [onSelectNeighborhood, selectedNeighborhood]);

  // Retained as part of the established HotelMapView contract. Preferences are
  // already reflected in scores and recommendedNbhdId by HotelSearch.
  void activePrefs;

  if (!GOOGLE_MAPS_API_KEY || !GOOGLE_MAP_ID) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <div className="max-w-sm">
          <div className="text-sm font-bold text-amber-950">Hotel map needs configuration</div>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Add the public Google Maps browser key and Map ID to enable this map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-slate-100">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} authReferrerPolicy="origin">
        <Map
          mapId={GOOGLE_MAP_ID}
          defaultCenter={defaultCenter}
          defaultZoom={fallback.zoom}
          mapTypeId="roadmap"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          zoomControl
          gestureHandling="greedy"
          reuseMaps
          className="h-full w-full"
        >
          <FitHotelBounds coordinates={coordinates} />
          <NeighborhoodPolygons
            geoData={geoData}
            recommendedNbhdId={recommendedNbhdId}
            selectedNeighborhood={selectedNeighborhood}
            onSelectNeighborhood={onSelectNeighborhood}
          />

          {cityGuide?.neighborhoods.map((neighborhood) => {
            const centroid = centroids[neighborhood.id];
            if (!centroid) return null;
            return (
              <AdvancedMarker
                key={`label-${neighborhood.id}`}
                position={{ lat: centroid[1], lng: centroid[0] }}
                anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                zIndex={neighborhood.id === selectedNeighborhood ? 400 : neighborhood.id === recommendedNbhdId ? 300 : 10}
                onClick={() => handleNeighborhoodSelection(neighborhood.id)}
              >
                <NbhdLabel
                  name={neighborhood.name}
                  isRec={neighborhood.id === recommendedNbhdId}
                  isSelected={neighborhood.id === selectedNeighborhood}
                  reason={neighborhood.id === recommendedNbhdId ? (neighborhood.tags[0] ?? null) : null}
                />
              </AdvancedMarker>
            );
          })}

          {geoOffers.map((offer) => {
            const rank = rankById.get(offer.hotel_id) ?? sortedOffers.length;
            const isSelected = offer.hotel_id === selectedHotelId;
            return (
              <AdvancedMarker
                key={offer.hotel_id}
                position={{ lat: offer.latitude!, lng: offer.longitude! }}
                anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
                zIndex={isSelected ? 10_000 : rank === 1 ? 1_000 : Math.max(20, 500 - rank)}
              >
                <HotelMarker
                  hotel={offer}
                  rank={rank}
                  isSelected={isSelected}
                  onClick={() => onSelectHotel(isSelected ? null : offer.hotel_id)}
                />
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>
    </div>
  );
}
