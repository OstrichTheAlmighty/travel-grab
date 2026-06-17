# TravelGrab Hotels — Map View Phase 1 Report

**Date:** 2026-06-16  
**Scope:** Phase 1 hotel map implementation — pins, neighborhood overlays, bidirectional selection sync

---

## What Was Built

### 1. List / Map view toggle
A toggle above hotel results lets users switch between:
- **List View** — the existing card layout (default)
- **Map View** — interactive map with hotel pins + neighborhood overlays

The toggle is positioned above the sort bar. Sort controls hide in map view (not relevant when viewing a spatial layout).

### 2. Hotel markers
- Every hotel with GPS coordinates from SerpAPI appears as a custom price-bubble marker
- Marker shows `$245` (rounded nightly price) directly on the map
- **AI Pick** hotel renders in violet (`#A78BFA`) to match the existing brand treatment
- **Selected** hotel renders in blue (`#77A7FF`) with a halo ring
- Clicking a marker: selects the hotel, scrolls to its card in the list below
- Clicking the map background: clears selection

### 3. Bidirectional card ↔ marker sync
- Clicking a marker → card below gets a blue ring + scrolls into view
- Clicking a card (in map view) → the matching marker highlights on the map
- Cards use `data-hotel-id` attributes; map uses `document.querySelector()` to scroll

### 4. Neighborhood overlays
For 7 supported cities (Tokyo, Barcelona, London, NYC, Bangkok, Singapore, Seoul):
- Each neighborhood gets a semi-transparent circle overlay (~650m radius from a hand-calibrated centre point)
- Neighborhood names appear as map labels at the circle centres
- Clicking a neighbourhood circle or label filters the hotel list below (same as the existing neighbourhood guide cards in list view)
- Active filter shown below the map with a "× Show all" clear button
- The selected neighbourhood circle gets a blue tint; others are white/subtle

### 5. Recommendation layer
- The neighbourhood where the **AI Pick** hotel lives gets a violet tint and border (distinct from the default white tint)
- If preferences are active, a small badge appears on that neighbourhood: "Best for Luxury", "Best for Nightlife", etc. (derived from the first active preference)
- This makes TravelGrab's neighbourhood-first logic visible spatially, not just as text

### 6. Dark-themed map tiles
Uses CartoDB Dark Matter (OpenStreetMap base, free, no API key required). The dark style matches TravelGrab's design system. Alternative: Stamen Terrain or standard OSM for lighter feel.

### 7. Mobile support
- Map renders at 480px height with `overflow: hidden` and rounded corners
- On mobile, the map takes full container width; hotel cards scroll below the map
- Neighbourhood filter note appears between map and cards
- No API key or billing required — works on any device without configuration

---

## Architecture Decisions

### Library choice: plain Leaflet, no react-leaflet
**Decision:** Use `leaflet` directly via `useEffect` and dynamic `import('leaflet')`. No react-leaflet dependency.

**Why:**
- react-leaflet v5 (React 19 compatible) was in early release at implementation time
- Direct Leaflet API gives full control over marker lifecycle without react-leaflet's reconciler overhead
- Leaflet markers are imperative by nature; forcing them into React's declarative model adds complexity without benefit
- `dynamic(() => import('./HotelMapView'), { ssr: false })` in Next.js handles the SSR constraint cleanly

**Trade-off:** More imperative code in useEffect. Managed with separate effects for init / marker updates / neighbourhood updates.

### GPS coordinates from SerpAPI
**Decision:** Extract `gps_coordinates.latitude/longitude` from SerpAPI Google Hotels properties at the provider level (`googleHotels.ts`). Pass through `ProviderHotel` → `HotelOffer` → client.

**Coverage:** SerpAPI typically returns GPS coordinates for ~85-95% of hotels. Hotels without coordinates are silently omitted from the map (no fallback positioning — avoids misleading pin placement).

**Alternative considered:** Client-side Nominatim geocoding. Rejected because: adds latency, adds API dependency, and complicates the client component significantly.

### Neighbourhood overlay approach: circles, not polygons
**Decision:** Use `L.Circle` overlays with approximate centre points (~650m radius) rather than precise GeoJSON polygons.

**Why:**
- Precise neighbourhood polygon data requires a paid geodata source (Mapbox, HERE, or custom GeoJSON files)
- Circle overlays communicate "this area" clearly enough for Phase 1
- The 7 cities are manually calibrated with accurate centre points
- Building the GeoJSON data set is a Phase 2 enhancement

**Trade-off:** Circles overlap in dense cities (e.g. NYC Midtown / Upper East Side). Acceptable for Phase 1. Phase 2 should use proper polygons.

### Map tiles: CartoDB Dark Matter (free)
No billing, no API key, global CDN. Matches the dark design. 

**Alternative:** Mapbox GL JS would provide much better visual quality and vector tiles, but requires API key + billing and a larger library.

### Marker icons: custom DivIcon with inline styles
**Decision:** Use `L.divIcon` with inline-styled HTML strings rather than image markers.

**Why:**
- Avoids Leaflet's well-known webpack/Next.js default icon breakage
- Allows dynamic pricing content inside the icon
- Easy to style for selected/unselected/best-overall states
- No additional image assets required

### State architecture: shared between list and map
`viewMode`, `selectedHotelId`, and `selectedNeighborhood` live in the parent `HotelSearch` component. Both the map and the list read from these shared states.

This means:
- Switching from map → list preserves the neighbourhood filter
- The list scrolls to the selected hotel when a marker is clicked
- The map highlights the marker when a card is clicked

---

## Files Modified

| File | Change |
|------|--------|
| `app/api/hotels/providers/types.ts` | Added `latitude?: number; longitude?: number` to `ProviderHotel` |
| `app/api/hotels/providers/googleHotels.ts` | Extract `gps_coordinates` from SerpAPI response |
| `app/api/hotels/search/route.ts` | Added `latitude?/longitude?` to `HotelOffer` interface; pass-through in scored output |
| `app/hotels/HotelSearch.tsx` | View toggle, `viewMode`/`selectedHotelId` state, `HotelMapView` integration, `isMapSelected` card highlight, `data-hotel-id` attributes |
| `app/hotels/HotelMapView.tsx` | New file — full map component |
| `MAP_VIEW_REPORT.md` | This file |

---

## Remaining Gaps (Phase 2 Opportunities)

### G1 — Polygon neighbourhood boundaries (High priority)
Current circles are approximate. Phase 2 should replace them with actual GeoJSON boundaries sourced from:
- OpenStreetMap Nominatim area boundaries (free, open)
- Mapbox Boundaries (paid, accurate)
- Hand-drawn GeoJSON for the 7 supported cities

### G2 — Hotels without GPS coordinates
~5-15% of SerpAPI results may have no GPS data. Currently these are silently excluded from the map.

**Solutions:**
- Client-side Nominatim geocoding fallback (async, adds latency)
- Pre-compute coordinates for popular hotels and cache them server-side
- Show a "X hotels not shown on map (no location data)" notice

### G3 — Map-first mobile UX
Current mobile implementation is a simple two-panel layout (map top, cards bottom). A proper mobile map experience would include:
- Fullscreen map mode with a drag-up bottom sheet
- Card miniaturisation (compact cards with just price + score)
- "List nearby" button when a hotel is selected

### G4 — More cities
The neighbourhood overlay data covers 7 cities. All other searches show hotel pins with no neighbourhood context. Phase 2: add Paris, Rome, Amsterdam, Dubai, Sydney (20 cities total).

### G5 — Zoom-responsive neighbourhood labels
Currently neighbourhood labels show at all zoom levels. Phase 2: only show labels at zoom ≥ 13, hide at zoomed-out view to reduce clutter.

### G6 — Hotel image previews in popups
Clicking a marker shows a price popup. Phase 2: show a thumbnail, rating, and brief recommendation sentence inline in the popup without needing to scroll to the card.

### G7 — Map clustering for dense cities
In NYC Midtown or central Tokyo, many hotels occupy a small geographic area. Phase 2: use `leaflet.markercluster` to group nearby pins, expanding on click.

### G8 — "Draw to filter" bounding-box selection
Let users draw a rectangle on the map to filter hotels within a custom area. More precise than neighbourhood-level filtering.

---

## Future Enhancements

### F1 — Isochrone overlay (How far can I walk in 15 minutes?)
Overlay a walking isochrone from a hotel or a user-specified point. Would directly implement the "How far from X?" feature from the DIFFERENTIATION_OPPORTUNITIES.md top-10 list.

**Technical path:** OpenRouteService API (free tier) or Mapbox Isochrone API.

### F2 — Neighbourhood price heat map
Colour-code neighbourhoods by average nightly price (green = cheap → red = expensive). Gives users price context spatially.

**Technical path:** Compute average price per neighbourhood from scored results, map to colour gradient.

### F3 — Preference fit overlay
Colour-code neighbourhoods by neighbourhood fit score for the active preferences. Purple = great fit, white = neutral, red = poor fit. Makes the NF score visible on the map.

### F4 — Street view preview
When hovering a marker, show a Google Street View thumbnail of the hotel's street. Requires Maps Static API (billing).

### F5 — Points of interest layer
Toggle-able overlay showing nearby restaurants, transit stations, museums — drawn from the Google Places data already fetched during hotel enrichment.

---

## Build Status

```
✓ Compiled successfully in 2.0s
✓ TypeScript: 0 errors
✓ Static pages: 11/11
```
