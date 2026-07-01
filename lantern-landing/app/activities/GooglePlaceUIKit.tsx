"use client";

import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

class PlacesUIKitErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // UI Kit failures remain isolated from the direct TravelGrab modal.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FailureMessage() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
      <p className="text-sm font-bold text-amber-950">Google Places UI Kit is temporarily unavailable.</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">
        The TravelGrab activity information remains available in direct mode.
      </p>
    </div>
  );
}

export type GooglePlaceUIKitContentMode = "standard" | "hybrid";

function createExplicitContent(places: google.maps.PlacesLibrary) {
  const content = new places.PlaceContentConfigElement();
  const media = new places.PlaceMediaElement({ lightboxPreferred: true });
  const attribution = new places.PlaceAttributionElement({
    lightSchemeColor: "BLACK",
    darkSchemeColor: "WHITE",
  });

  content.append(
    media,
    new places.PlaceRatingElement(),
    new places.PlaceTypeElement(),
    new places.PlaceOpenNowStatusElement(),
    new places.PlaceOpeningHoursElement(),
    new places.PlaceAddressElement(),
    new places.PlaceWebsiteElement(),
    new places.PlacePhoneNumberElement(),
    new places.PlaceReviewSummaryElement(),
    new places.PlaceReviewsElement(),
    attribution,
  );
  return content;
}

function PlaceDetailsElementHost({
  placeId,
  contentMode,
}: {
  placeId: string;
  contentMode: GooglePlaceUIKitContentMode;
}) {
  const places = useMapsLibrary("places");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !places) return;

    setStatus("loading");
    const handleLoad = () => setStatus("ready");
    const handleError = () => setStatus("failed");
    let details: google.maps.places.PlaceDetailsElement;

    try {
      details = new places.PlaceDetailsElement();
      const request = new places.PlaceDetailsPlaceRequestElement({ place: placeId });
      const content = createExplicitContent(places);
      details.addEventListener("gmp-load", handleLoad);
      details.addEventListener("gmp-error", handleError);
      details.append(request, content);
      details.style.display = "block";
      details.style.width = "100%";
      if (contentMode === "hybrid") {
        details.style.colorScheme = "light";
        details.style.setProperty("--gmp-mat-color-surface", "#ffffff");
        details.style.setProperty("--gmp-mat-color-on-surface", "#111827");
        details.style.setProperty("--gmp-mat-color-on-surface-variant", "#4b5563");
        details.style.setProperty("--gmp-mat-color-primary", "#0f9f8f");
        details.style.setProperty("--gmp-mat-color-positive", "#087f6f");
        details.style.setProperty("--gmp-mat-font-family", "Inter, ui-sans-serif, system-ui, sans-serif");
        details.style.border = "1px solid #e5e7eb";
        details.style.borderRadius = "14px";
        details.style.overflow = "hidden";
      }
      host.replaceChildren(details);
    } catch {
      host.replaceChildren();
      setStatus("failed");
      return;
    }

    return () => {
      details.removeEventListener("gmp-load", handleLoad);
      details.removeEventListener("gmp-error", handleError);
      details.remove();
    };
  }, [places, placeId, contentMode]);

  if (status === "failed") return <FailureMessage />;

  return (
    <div className="relative min-h-48">
      {status === "loading" && (
        <div className="absolute inset-x-0 top-0 z-10 flex min-h-48 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
          <span className="text-xs font-medium text-gray-600">Loading Google place details…</span>
        </div>
      )}
      <div ref={hostRef} className={status === "ready" ? "block" : "invisible"} />
    </div>
  );
}

export default function GooglePlaceUIKit({
  placeId,
  contentMode = "standard",
}: {
  placeId: string;
  contentMode?: GooglePlaceUIKitContentMode;
}) {
  const [providerFailed, setProviderFailed] = useState(false);
  if (!GOOGLE_MAPS_API_KEY || providerFailed) return <FailureMessage />;

  const fallback = <FailureMessage />;
  return (
    <PlacesUIKitErrorBoundary fallback={fallback}>
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        libraries={["places"]}
        authReferrerPolicy="origin"
        onError={() => setProviderFailed(true)}
      >
        <PlaceDetailsElementHost placeId={placeId} contentMode={contentMode} />
      </APIProvider>
    </PlacesUIKitErrorBoundary>
  );
}
