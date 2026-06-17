"use client";

// Loaded via dynamic({ ssr: false }) — never runs on the server.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MapHotelOffer {
  hotel_id: string;
  name: string;
  price_per_night: number;
  ai_score: number;
  recommendation_label: string;
  inferred_neighborhood: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

interface MapNeighborhood {
  id: string;
  name: string;
  matchKeywords: string[];
  tags: string[];
}

interface MapCityGuide {
  displayName: string;
  neighborhoods: MapNeighborhood[];
}

interface Props {
  offers: MapHotelOffer[];
  selectedHotelId: string | null;
  onSelectHotel: (id: string | null) => void;
  destination: string;
  cityGuide: MapCityGuide | null;
  selectedNeighborhood: string | null;
  onSelectNeighborhood: (id: string | null) => void;
  activePrefs: readonly string[];
}

// ── Neighborhood centre coordinates ───────────────────────────────────────────
// Approximate centres for Phase 1 circle overlays. Good enough for visual zones.

type LatLng = [number, number];

const NEIGHBORHOOD_CENTERS: Record<string, Record<string, LatLng>> = {
  tokyo: {
    "ginza-chuo":       [35.6717, 139.7645],
    "shinjuku":         [35.6938, 139.7036],
    "shibuya":          [35.6580, 139.7016],
    "roppongi-minato":  [35.6603, 139.7292],
    "asakusa-taito":    [35.7148, 139.7967],
    "ueno":             [35.7140, 139.7773],
    "ebisu-daikanyama": [35.6479, 139.7076],
  },
  barcelona: {
    "eixample":      [41.3934, 2.1622],
    "gothic-quarter":[41.3827, 2.1762],
    "el-born":       [35.6853, 2.1829],
    "gracia":        [41.4035, 2.1563],
    "barceloneta":   [41.3789, 2.1893],
    "sarria":        [41.4007, 2.1197],
  },
  london: {
    "mayfair":        [51.5098, -0.1454],
    "covent-garden":  [51.5117, -0.1233],
    "shoreditch":     [51.5222, -0.0784],
    "south-bank":     [51.5044, -0.1087],
    "kensington":     [51.5007, -0.1948],
    "bloomsbury":     [51.5229, -0.1296],
  },
  "new york": {
    "midtown":           [40.7549, -73.9840],
    "upper-east-side":   [40.7736, -73.9566],
    "soho-west-village": [40.7266, -74.0054],
    "brooklyn":          [40.7081, -73.9571],
    "lower-east-side":   [40.7150, -73.9857],
    "financial-district":[40.7074, -74.0113],
  },
  bangkok: {
    "riverside":      [13.7264, 100.5149],
    "rattanakosin":   [13.7543, 100.4921],
    "sukhumvit":      [13.7399, 100.5615],
    "silom-sathorn":  [13.7238, 100.5323],
    "siam":           [13.7463, 100.5347],
  },
  singapore: {
    "marina-bay":        [1.2838, 103.8590],
    "orchard":           [1.3048, 103.8318],
    "chinatown":         [1.2818, 103.8442],
    "little-india-arab": [1.3067, 103.8515],
    "sentosa":           [1.2494, 103.8303],
  },
  seoul: {
    "myeongdong":        [37.5636, 126.9836],
    "insadong-jongno":   [37.5740, 126.9900],
    "gangnam":           [37.4979, 127.0276],
    "hongdae":           [37.5563, 126.9228],
    "itaewon":           [37.5348, 126.9943],
  },
};

// Default city centre fallback when hotels have no GPS data
const CITY_CENTERS: Record<string, LatLng> = {
  tokyo:      [35.6762, 139.6503],
  barcelona:  [41.3851, 2.1734],
  london:     [51.5074, -0.1278],
  "new york": [40.7128, -74.0060],
  bangkok:    [13.7563, 100.5018],
  singapore:  [1.3521, 103.8198],
  seoul:      [37.5665, 126.9780],
};

function detectCityKey(destination: string): string | null {
  const d = destination.toLowerCase();
  if (d.includes("tokyo"))     return "tokyo";
  if (d.includes("barcelona")) return "barcelona";
  if (d.includes("london"))    return "london";
  if (d.includes("new york") || d.includes("nyc")) return "new york";
  if (d.includes("bangkok") || d.includes("krung thep")) return "bangkok";
  if (d.includes("singapore")) return "singapore";
  if (d.includes("seoul"))     return "seoul";
  return null;
}

// ── Icon HTML builders ────────────────────────────────────────────────────────

function buildMarkerHTML(
  price: number,
  isSelected: boolean,
  isBestOverall: boolean,
): string {
  const bg     = isBestOverall ? "#A78BFA" : isSelected ? "#77A7FF" : "#131929";
  const border = isBestOverall ? "rgba(167,139,250,0.9)" : isSelected ? "rgba(119,167,255,0.9)" : "rgba(255,255,255,0.14)";
  const color  = isSelected || isBestOverall ? "#fff" : "rgba(255,255,255,0.85)";
  const shadow = isSelected || isBestOverall
    ? `0 2px 12px rgba(0,0,0,0.5), 0 0 0 3px ${isBestOverall ? "rgba(167,139,250,0.35)" : "rgba(119,167,255,0.35)"}`
    : "0 2px 6px rgba(0,0,0,0.45)";
  const scale = isSelected ? "scale(1.15)" : "scale(1)";
  return `<div style="
    background:${bg};border:1px solid ${border};
    border-radius:20px;padding:4px 9px;
    font-size:11px;font-weight:700;color:${color};
    white-space:nowrap;box-shadow:${shadow};
    cursor:pointer;transform:${scale};
    transition:all 0.15s ease;font-family:ui-sans-serif,system-ui,sans-serif;
    letter-spacing:-0.01em;
  ">$${Math.round(price)}</div>`;
}

function buildNeighborhoodLabelHTML(name: string, isRecommended: boolean, isSelected: boolean): string {
  const color = isSelected ? "#fff" : isRecommended ? "rgba(167,139,250,0.9)" : "rgba(255,255,255,0.55)";
  const fontWeight = isSelected || isRecommended ? "700" : "600";
  const textShadow = "0 1px 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6)";
  return `<div style="
    color:${color};font-size:11px;font-weight:${fontWeight};
    white-space:nowrap;text-shadow:${textShadow};
    cursor:pointer;padding:2px 4px;
    font-family:ui-sans-serif,system-ui,sans-serif;
    letter-spacing:0.02em;text-transform:uppercase;
  ">${name}</div>`;
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
}: Props) {
  const containerRef      = useRef<HTMLDivElement>(null);
  const mapRef            = useRef<import("leaflet").Map | null>(null);
  const markersLayerRef   = useRef<import("leaflet").LayerGroup | null>(null);
  const nbhdLayerRef      = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef        = useRef<typeof import("leaflet") | null>(null);
  const isInitialized     = useRef(false);

  // Determine which city to show neighborhoods for
  const cityKey = detectCityKey(destination);
  const nbhdCenters = cityKey ? (NEIGHBORHOOD_CENTERS[cityKey] ?? {}) : {};
  const cityCenter  = cityKey ? (CITY_CENTERS[cityKey] ?? null) : null;

  // Determine "recommended" neighborhood — where the AI Pick hotel lives
  const bestOffer = offers.find((o) => o.recommendation_label === "Best Overall") ?? offers[0];
  const bestNbhdId = (() => {
    if (!bestOffer || !cityGuide) return null;
    const nbhd = bestOffer.inferred_neighborhood.toLowerCase();
    const addr = bestOffer.address.toLowerCase();
    for (const n of cityGuide.neighborhoods) {
      if (n.matchKeywords.some((k) => nbhd.includes(k) || addr.includes(k))) {
        return n.id;
      }
    }
    return null;
  })();

  // Determine the "best for prefs" label for the recommended neighborhood
  const bestNbhdPrefLabel = (() => {
    if (!activePrefs.length || !bestNbhdId || !cityGuide) return null;
    const n = cityGuide.neighborhoods.find((x) => x.id === bestNbhdId);
    if (!n) return null;
    const pref = activePrefs[0];
    const labelMap: Record<string, string> = {
      luxury: "Best for Luxury",
      quiet: "Best for Quiet",
      food: "Best for Food",
      nightlife: "Best for Nightlife",
      sightseeing: "Best for Sightseeing",
      transit: "Best for Transit",
      "first-time": "Best for First-timers",
      walkable: "Most Walkable",
      budget: "Best for Budget",
      family: "Best for Families",
    };
    return labelMap[pref] ?? null;
  })();

  // Draw neighborhood overlays
  const drawNeighborhoods = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = nbhdLayerRef.current;
    if (!L || !map || !layer || !cityGuide) return;

    layer.clearLayers();

    for (const n of cityGuide.neighborhoods) {
      const center = nbhdCenters[n.id];
      if (!center) continue;

      const isRec      = n.id === bestNbhdId;
      const isSelected = n.id === selectedNeighborhood;

      // Circle overlay
      const circleColor = isRec
        ? "rgba(167,139,250,0.18)"
        : isSelected
          ? "rgba(119,167,255,0.15)"
          : "rgba(255,255,255,0.04)";
      const strokeColor = isRec
        ? "rgba(167,139,250,0.55)"
        : isSelected
          ? "rgba(119,167,255,0.5)"
          : "rgba(255,255,255,0.12)";

      const circle = L.circle(center, {
        radius: 650,
        fillColor: circleColor,
        fillOpacity: 1,
        color: strokeColor,
        weight: 1,
        interactive: true,
      });

      circle.on("click", () => {
        onSelectNeighborhood(isSelected ? null : n.id);
      });

      layer.addLayer(circle);

      // Neighborhood name label
      const labelIcon = L.divIcon({
        html: buildNeighborhoodLabelHTML(n.name, isRec, isSelected),
        className: "",
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker(center, { icon: labelIcon, interactive: true, zIndexOffset: 100 });
      labelMarker.on("click", () => {
        onSelectNeighborhood(isSelected ? null : n.id);
      });
      layer.addLayer(labelMarker);

      // Recommendation badge for AI Pick area
      if (isRec && bestNbhdPrefLabel) {
        const badgeIcon = L.divIcon({
          html: `<div style="
            background:rgba(167,139,250,0.85);color:#fff;
            font-size:9px;font-weight:700;
            border-radius:20px;padding:2px 7px;
            white-space:nowrap;margin-top:16px;
            font-family:ui-sans-serif,system-ui,sans-serif;
            letter-spacing:0.04em;text-transform:uppercase;
            box-shadow:0 2px 8px rgba(0,0,0,0.4);
          ">${bestNbhdPrefLabel}</div>`,
          className: "",
          iconAnchor: [-8, 0],
        });
        const badgeMarker = L.marker(center, { icon: badgeIcon, interactive: false, zIndexOffset: 200 });
        layer.addLayer(badgeMarker);
      }
    }
  }, [cityGuide, nbhdCenters, bestNbhdId, selectedNeighborhood, bestNbhdPrefLabel, onSelectNeighborhood]);

  // Draw hotel markers
  const drawMarkers = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();

    const bounds: [number, number][] = [];

    for (const offer of offers) {
      // Skip offers without coords — can't place on map
      if (
        typeof offer.latitude  !== "number" ||
        typeof offer.longitude !== "number" ||
        isNaN(offer.latitude)  ||
        isNaN(offer.longitude)
      ) continue;

      const latlng: LatLng = [offer.latitude, offer.longitude];
      bounds.push(latlng);

      const isBestOverall = offer.recommendation_label === "Best Overall";
      const isSelected    = offer.hotel_id === selectedHotelId;

      const icon = L.divIcon({
        html: buildMarkerHTML(offer.price_per_night, isSelected, isBestOverall),
        className: "",
        iconAnchor: [24, 14],
      });

      const marker = L.marker(latlng, {
        icon,
        zIndexOffset: isBestOverall ? 1000 : isSelected ? 900 : 0,
        interactive: true,
      });

      const popupContent = `
        <div style="
          font-family:ui-sans-serif,system-ui,sans-serif;
          font-size:12px;color:#e2e8f0;
          background:#0E1422;padding:10px 12px;
          border-radius:8px;min-width:160px;
          border:1px solid rgba(255,255,255,0.1);
        ">
          <div style="font-weight:700;margin-bottom:2px;">${offer.name}</div>
          ${offer.inferred_neighborhood ? `<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:4px;">${offer.inferred_neighborhood}</div>` : ""}
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-weight:700;color:#A78BFA;">$${Math.round(offer.price_per_night)}<span style="font-weight:400;color:rgba(255,255,255,0.4);font-size:10px;">/night</span></span>
            <span style="font-size:10px;color:rgba(255,255,255,0.35);">Score: ${offer.ai_score}</span>
          </div>
        </div>`;

      const popup = L.popup({
        className: "tg-popup",
        closeButton: false,
        offset: [0, -6],
        maxWidth: 220,
      }).setContent(popupContent);

      marker.bindPopup(popup);

      marker.on("click", () => {
        onSelectHotel(offer.hotel_id === selectedHotelId ? null : offer.hotel_id);
        // Scroll to matching card
        const el = document.querySelector(`[data-hotel-id="${offer.hotel_id}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });

      layer.addLayer(marker);
    }

    // Fit map to hotel bounds on initial render
    if (bounds.length >= 2) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0] as L.LatLngExpression, 15);
    } else if (cityCenter) {
      map.setView(cityCenter as L.LatLngExpression, 13);
    }
  }, [offers, selectedHotelId, onSelectHotel, cityCenter]);

  // ── Initialise map once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitialized.current || !containerRef.current) return;
    isInitialized.current = true;

    void (async () => {
      const L = await import("leaflet");
      leafletRef.current = L;

      // Fix Leaflet's default icon path issue in webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });
      mapRef.current = map;

      // Dark-themed OSM tiles via CartoDB Voyager Dark Matter
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      // Layers
      const nbhdLayer = L.layerGroup().addTo(map);
      const markersLayer = L.layerGroup().addTo(map);
      nbhdLayerRef.current = nbhdLayer;
      markersLayerRef.current = markersLayer;

      // Initial draw
      drawNeighborhoods();
      drawMarkers();

      // Click on map background deselects hotel
      map.on("click", () => {
        onSelectHotel(null);
      });
    })();

    return () => {
      mapRef.current?.remove();
      mapRef.current     = null;
      markersLayerRef.current = null;
      nbhdLayerRef.current    = null;
      leafletRef.current       = null;
      isInitialized.current    = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-draw markers when selection or offers change ──────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    drawMarkers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotelId, offers]);

  // ── Re-draw neighborhoods when selection changes ─────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    drawNeighborhoods();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNeighborhood, bestNbhdId, bestNbhdPrefLabel]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-white/[0.08]" style={{ height: "480px" }}>
      {/* Map container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Overlay: legend */}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <div style={{ background: "#A78BFA", width: 10, height: 10, borderRadius: "50%" }} />
          <span className="text-[10px] text-white/60 font-semibold" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
            AI Pick
          </span>
        </div>
        {cityGuide && (
          <div className="flex items-center gap-1.5">
            <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", width: 10, height: 10, borderRadius: "50%" }} />
            <span className="text-[10px] text-white/40 font-semibold" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
              Neighborhoods (click to filter)
            </span>
          </div>
        )}
      </div>

      {/* Inject popup styles */}
      <style>{`
        .tg-popup .leaflet-popup-content-wrapper {
          background: transparent;
          border: none;
          box-shadow: none;
          padding: 0;
        }
        .tg-popup .leaflet-popup-content {
          margin: 0;
        }
        .tg-popup .leaflet-popup-tip-container {
          display: none;
        }
        .leaflet-control-attribution {
          background: rgba(7,10,18,0.7) !important;
          color: rgba(255,255,255,0.25) !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: rgba(255,255,255,0.35) !important;
        }
      `}</style>
    </div>
  );
}
