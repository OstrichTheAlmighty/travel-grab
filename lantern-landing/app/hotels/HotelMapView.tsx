"use client";

// Loaded via dynamic({ ssr: false }) — react-map-gl requires a browser environment.
import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useMemo, useRef, useState } from "react";
import Map, {
  Source,
  Layer,
  Marker,
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
  type LayerProps,
} from "react-map-gl/maplibre";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

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

// ── Map style — free CartoDB dark, no API key required ─────────────────────────
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

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

// Default city centers for initial viewport when hotel coords are absent
const CITY_CENTERS: Record<string, { longitude: number; latitude: number; zoom: number }> = {
  tokyo:      { longitude: 139.710, latitude: 35.680, zoom: 12.5 },
  barcelona:  { longitude: 2.173,   latitude: 41.385, zoom: 13   },
  london:     { longitude: -0.128,  latitude: 51.508, zoom: 12.5 },
  "new york": { longitude: -73.984, latitude: 40.748, zoom: 12.5 },
  bangkok:    { longitude: 100.502, latitude: 13.754, zoom: 12.5 },
  singapore:  { longitude: 103.820, latitude: 1.352,  zoom: 12.5 },
  seoul:      { longitude: 126.978, latitude: 37.567, zoom: 12.5 },
};

// ── Layer style definitions ───────────────────────────────────────────────────

function makeFillLayer(recId: string | null, selId: string | null): LayerProps {
  return {
    id:   "nbhd-fill",
    type: "fill",
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "id"], recId ?? ""],  "#4ADE80",  // lantern-mint
        ["==", ["get", "id"], selId ?? ""],  "#A78BFA",  // lantern-violet
        "#ffffff",
      ],
      "fill-opacity": [
        "case",
        ["==", ["get", "id"], recId ?? ""],  0.13,
        ["==", ["get", "id"], selId ?? ""],  0.11,
        0.04,
      ],
    },
  };
}

function makeLineLayer(recId: string | null, selId: string | null): LayerProps {
  return {
    id:   "nbhd-line",
    type: "line",
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "id"], recId ?? ""],  "#4ADE80",
        ["==", ["get", "id"], selId ?? ""],  "#A78BFA",
        "#ffffff",
      ],
      "line-opacity": [
        "case",
        ["==", ["get", "id"], recId ?? ""],  0.55,
        ["==", ["get", "id"], selId ?? ""],  0.50,
        0.10,
      ],
      "line-width": [
        "case",
        ["==", ["get", "id"], recId ?? ""],  2,
        ["==", ["get", "id"], selId ?? ""],  1.5,
        1,
      ],
    },
  };
}

// ── Hotel marker components ───────────────────────────────────────────────────

function Marker1({ hotel, isSelected, onClick }: {
  hotel:      MapHotelOffer;
  isSelected: boolean;
  onClick:    () => void;
}) {
  const shortName = hotel.name.split(",")[0].split("–")[0].trim();
  const display   = shortName.length > 22 ? shortName.slice(0, 20) + "…" : shortName;
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-start
        rounded-xl px-2.5 py-1.5
        border shadow-lg
        transition-all duration-150
        text-left
        ${isSelected
          ? "bg-lantern-mint border-lantern-mint/80 text-[#090e1a] scale-105 shadow-lantern-mint/20"
          : "bg-[#090e1a]/95 border-lantern-mint/50 text-white hover:border-lantern-mint/80"}
      `}
      style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.08em] opacity-70 leading-none mb-0.5">
        #1 Pick
      </span>
      <span className={`text-[11px] font-bold leading-tight ${isSelected ? "text-[#090e1a]" : "text-white/90"}`}>
        {display}
      </span>
      <span className={`text-[10px] font-semibold mt-0.5 ${isSelected ? "text-[#090e1a]/70" : "text-lantern-mint/80"}`}>
        ${Math.round(hotel.price_per_night)}/night
        {hotel.overall_rating && hotel.overall_rating > 0
          ? ` · ${hotel.overall_rating.toFixed(1)}★`
          : ""}
      </span>
    </button>
  );
}

function Marker2({ hotel, rank, isSelected, onClick }: {
  hotel:      MapHotelOffer;
  rank:       number;
  isSelected: boolean;
  onClick:    () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        rounded-full px-2.5 py-1
        border text-[10px] font-bold
        transition-all duration-150
        ${isSelected
          ? "bg-lantern-violet border-lantern-violet/80 text-white scale-110"
          : "bg-[#0e1422]/90 border-white/20 text-white/75 hover:border-white/45 hover:text-white"}
      `}
      style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
    >
      #{rank} · ${Math.round(hotel.price_per_night)}
    </button>
  );
}

function Marker3({ isSelected, onClick }: {
  hotel:      MapHotelOffer;
  isSelected: boolean;
  onClick:    () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-2.5 h-2.5 rounded-full border transition-all duration-150
        ${isSelected
          ? "bg-white border-white scale-150"
          : "bg-white/30 border-white/20 hover:bg-white/55 hover:border-white/45"}
      `}
    />
  );
}

// ── Neighborhood label overlay ────────────────────────────────────────────────

function NbhdLabel({ name, isRec, isSelected }: {
  name:       string;
  isRec:      boolean;
  isSelected: boolean;
}) {
  return (
    <div
      className={`
        text-[10px] font-black uppercase tracking-[0.12em]
        pointer-events-none select-none
        px-1.5 py-0.5
        ${isSelected ? "text-lantern-violet" : isRec ? "text-lantern-mint" : "text-white/35"}
      `}
      style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)" }}
    >
      {name.split(" /")[0]}
      {isRec && <span className="ml-1 opacity-70 normal-case font-semibold tracking-normal">· Top pick</span>}
    </div>
  );
}

// ── Neighborhood centroid helpers ─────────────────────────────────────────────

const NBHD_CENTROIDS: Record<string, Record<string, [number, number]>> = {
  tokyo: {
    "ginza-chuo":       [139.763,  35.673],
    "shinjuku":         [139.700,  35.695],
    "shibuya":          [139.703,  35.657],
    "roppongi-minato":  [139.733,  35.662],
    "asakusa-taito":    [139.798,  35.716],
    "ueno":             [139.772,  35.714],
    "ebisu-daikanyama": [139.708,  35.648],
  },
};

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
  const mapRef  = useRef<MapRef>(null);
  const cityKey = detectCityKey(destination);
  const geojsonPath = cityKey ? GEOJSON_BY_CITY[cityKey] : null;
  const centroids   = cityKey ? (NBHD_CENTROIDS[cityKey] ?? {}) : {};

  // ── GeoJSON data (fetched once) ──────────────────────────────────────────────
  const [geoData, setGeoData] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const geoFetched = useRef(false);

  const fetchGeo = useCallback(() => {
    if (geoFetched.current || !geojsonPath) return;
    geoFetched.current = true;
    fetch(geojsonPath)
      .then((r) => r.json())
      .then((d) => setGeoData(d))
      .catch(() => { /* no polygon data for this city */ });
  }, [geojsonPath]);

  // ── Initial viewport ─────────────────────────────────────────────────────────
  const initialViewState = useMemo(() => {
    const geoHotels = offers.filter(
      (o) => typeof o.latitude === "number" && typeof o.longitude === "number"
        && !isNaN(o.latitude!) && !isNaN(o.longitude!),
    );
    if (geoHotels.length > 0) {
      const lats = geoHotels.map((o) => o.latitude!);
      const lngs = geoHotels.map((o) => o.longitude!);
      return {
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        latitude:  (Math.min(...lats) + Math.max(...lats)) / 2,
        zoom:      12.8,
      };
    }
    return cityKey ? CITY_CENTERS[cityKey] : { longitude: 139.710, latitude: 35.680, zoom: 12.5 };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hotel ranking ────────────────────────────────────────────────────────────
  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => b.ai_score - a.ai_score),
    [offers],
  );

  const rankOf = useCallback(
    (id: string) => sortedOffers.findIndex((o) => o.hotel_id === id) + 1,
    [sortedOffers],
  );

  const geoOffers = useMemo(
    () => sortedOffers.filter(
      (o) => typeof o.latitude === "number" && typeof o.longitude === "number"
        && !isNaN(o.latitude!) && !isNaN(o.longitude!),
    ),
    [sortedOffers],
  );

  // ── Click handler for polygon layers ────────────────────────────────────────
  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const id = e.features[0].properties?.id as string | undefined;
        if (id) {
          onSelectNeighborhood(id === selectedNeighborhood ? null : id);
          return;
        }
      }
      // Click on empty map → deselect hotel
      onSelectHotel(null);
    },
    [selectedNeighborhood, onSelectNeighborhood, onSelectHotel],
  );

  // ── Layer paint (memoised so we avoid recreation on every render) ────────────
  const fillLayer = useMemo(
    () => makeFillLayer(recommendedNbhdId, selectedNeighborhood),
    [recommendedNbhdId, selectedNeighborhood],
  );
  const lineLayer = useMemo(
    () => makeLineLayer(recommendedNbhdId, selectedNeighborhood),
    [recommendedNbhdId, selectedNeighborhood],
  );

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={geoData ? ["nbhd-fill"] : []}
        onClick={handleMapClick}
        cursor={geoData ? "pointer" : "default"}
        onLoad={fetchGeo}
        attributionControl={false}
        reuseMaps
      >
        {/* Navigation controls */}
        <NavigationControl position="top-right" showCompass={false} />

        {/* ── Neighborhood polygon source + layers ─────────────────────── */}
        {geoData && (
          <Source id="neighborhoods" type="geojson" data={geoData}>
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
          </Source>
        )}

        {/* ── Neighborhood name labels (at centroid) ────────────────────── */}
        {cityGuide?.neighborhoods.map((n) => {
          const centroid = centroids[n.id];
          if (!centroid) return null;
          return (
            <Marker
              key={`label-${n.id}`}
              longitude={centroid[0]}
              latitude={centroid[1]}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectNeighborhood(n.id === selectedNeighborhood ? null : n.id);
              }}
            >
              <NbhdLabel
                name={n.name}
                isRec={n.id === recommendedNbhdId}
                isSelected={n.id === selectedNeighborhood}
              />
            </Marker>
          );
        })}

        {/* ── Hotel markers ─────────────────────────────────────────────── */}
        {geoOffers.map((offer) => {
          const rank       = rankOf(offer.hotel_id);
          const isSelected = offer.hotel_id === selectedHotelId;

          return (
            <Marker
              key={offer.hotel_id}
              longitude={offer.longitude!}
              latitude={offer.latitude!}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectHotel(offer.hotel_id === selectedHotelId ? null : offer.hotel_id);
              }}
            >
              {rank === 1 ? (
                <Marker1
                  hotel={offer}
                  isSelected={isSelected}
                  onClick={() => onSelectHotel(offer.hotel_id === selectedHotelId ? null : offer.hotel_id)}
                />
              ) : rank <= 4 ? (
                <Marker2
                  hotel={offer}
                  rank={rank}
                  isSelected={isSelected}
                  onClick={() => onSelectHotel(offer.hotel_id === selectedHotelId ? null : offer.hotel_id)}
                />
              ) : (
                <Marker3
                  hotel={offer}
                  isSelected={isSelected}
                  onClick={() => onSelectHotel(offer.hotel_id === selectedHotelId ? null : offer.hotel_id)}
                />
              )}
            </Marker>
          );
        })}
      </Map>

      {/* Attribution */}
      <div className="absolute bottom-2 right-2 z-10 text-[8px] text-white/20 pointer-events-none">
        © CartoDB · OpenStreetMap contributors
      </div>
    </div>
  );
}
