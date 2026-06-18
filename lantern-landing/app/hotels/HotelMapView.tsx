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
        ["==", ["get", "id"], recId ?? ""],  0.20,
        ["==", ["get", "id"], selId ?? ""],  0.13,
        0.02,
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
        ["==", ["get", "id"], recId ?? ""],  0.70,
        ["==", ["get", "id"], selId ?? ""],  0.55,
        0.06,
      ],
      "line-width": [
        "case",
        ["==", ["get", "id"], recId ?? ""],  2.5,
        ["==", ["get", "id"], selId ?? ""],  1.5,
        1,
      ],
    },
  };
}

// ── Hotel marker component ────────────────────────────────────────────────────

function HotelMarker({ hotel, rank, isSelected, onClick }: {
  hotel:      MapHotelOffer;
  rank:       number;
  isSelected: boolean;
  onClick:    (e: React.MouseEvent) => void;
}) {
  const shortName = hotel.name.split(",")[0].split("–")[0].trim();

  if (!isSelected) {
    const opacity      = rank === 1 ? 1 : rank === 2 ? 0.80 : rank === 3 ? 0.65 : rank === 4 ? 0.52 : 0.40;
    const borderColor  = rank === 1 ? "border-lantern-mint/55" : "border-white/18";
    const labelColor   = rank === 1 ? "text-lantern-mint" : "text-white/65";
    return (
      <button
        onClick={onClick}
        style={{ opacity, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
        className={`rounded-full px-2 py-0.5 border text-[10px] font-bold transition-all duration-150
          bg-[#0e1422]/90 ${borderColor} ${labelColor} hover:opacity-100 hover:border-white/40 hover:text-white`}
      >
        #{rank} · ${Math.round(hotel.price_per_night)}
      </button>
    );
  }

  const display = shortName.length > 20 ? shortName.slice(0, 18) + "…" : shortName;
  const isTop   = rank === 1;
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start rounded-xl px-2.5 py-1.5 border shadow-lg text-left
        transition-all duration-150 scale-105
        ${isTop
          ? "bg-lantern-mint border-lantern-mint/80 shadow-lantern-mint/20"
          : "bg-[#090e1a]/95 border-lantern-violet/60 shadow-lantern-violet/15"}`}
      style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <span className={`text-[9px] font-black uppercase tracking-[0.08em] leading-none mb-0.5
        ${isTop ? "text-[#090e1a]/55" : "text-lantern-violet/75"}`}>
        #{rank}
      </span>
      <span className={`text-[11px] font-bold leading-tight ${isTop ? "text-[#090e1a]" : "text-white/90"}`}>
        {display}
      </span>
      <span className={`text-[10px] font-semibold mt-0.5
        ${isTop ? "text-[#090e1a]/65" : "text-lantern-violet/75"}`}>
        ${Math.round(hotel.price_per_night)}/night
        {hotel.overall_rating && hotel.overall_rating > 0 ? ` · ${hotel.overall_rating.toFixed(1)}★` : ""}
      </span>
      {hotel.rank_weakness && (
        <span className={`text-[9px] leading-snug mt-0.5 max-w-[140px]
          ${isTop ? "text-[#090e1a]/45" : "text-white/30"}`}>
          {hotel.rank_weakness}
        </span>
      )}
    </button>
  );
}

// ── Neighborhood label overlay ────────────────────────────────────────────────

function NbhdLabel({ name, isRec, isSelected, reason }: {
  name:       string;
  isRec:      boolean;
  isSelected: boolean;
  reason?:    string | null;
}) {
  return (
    <div
      className={`
        rounded-full px-2 py-0.5 border
        text-[9px] font-black uppercase tracking-[0.10em]
        select-none cursor-pointer transition-colors duration-150
        ${isSelected
          ? "bg-lantern-violet/20 border-lantern-violet/40 text-lantern-violet"
          : isRec
            ? "bg-lantern-mint/15 border-lantern-mint/35 text-lantern-mint"
            : "bg-black/45 border-white/08 text-white/28"}
      `}
      style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
    >
      {name.split(" /")[0]}
      {isRec && reason && (
        <span className="ml-1 opacity-65 normal-case font-semibold tracking-normal">· {reason}</span>
      )}
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
    () => sortedOffers
      .slice(0, 5)
      .filter(
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
        }
      }
      // Intentionally do NOT clear selectedHotelId on empty-map click.
      // Marker button clicks are DOM events and don't reach the canvas; however
      // clearing here would race with and cancel any marker-click selection.
    },
    [selectedNeighborhood, onSelectNeighborhood],
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
                reason={n.id === recommendedNbhdId ? (n.tags[0] ?? null) : null}
              />
            </Marker>
          );
        })}

        {/* ── Hotel markers ─────────────────────────────────────────────── */}
        {geoOffers.map((offer) => {
          const rank       = rankOf(offer.hotel_id);
          const isSelected = offer.hotel_id === selectedHotelId;

          const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelectHotel(offer.hotel_id === selectedHotelId ? null : offer.hotel_id);
          };

          return (
            <Marker
              key={offer.hotel_id}
              longitude={offer.longitude!}
              latitude={offer.latitude!}
              anchor="bottom"
            >
              <HotelMarker
                hotel={offer}
                rank={rank}
                isSelected={isSelected}
                onClick={handleClick}
              />
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
