"use client";

import { useRef, useState, useEffect } from "react";
import { activityPhotoUrl } from "@/lib/activities/google-place-client";
import type { Activity } from "@/app/activities/data/types";

interface ResolvedData {
  rating: number;
  reviewCount: number;
}

interface Props {
  activity: Activity;
  resolveImmediately?: boolean;
  onResolved?: (data: ResolvedData) => void;
  children?: React.ReactNode;
}

export function CardPlacePreview({
  activity,
  resolveImmediately = false,
  onResolved,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const resolvedRef = useRef(false);
  const onResolvedRef = useRef(onResolved);
  useEffect(() => { onResolvedRef.current = onResolved; });

  const [localPhotoRef, setLocalPhotoRef] = useState<string | undefined>(activity.photoRef);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const { id, title, lat, lng, photoRef, rating, reviewCount } = activity;
    const fsqId = id.startsWith("fsq:") ? id.replace("fsq:", "") : null;

    if (!fsqId || !lat || !lng) return;

    // Already fully resolved — just notify parent if needed
    if (photoRef && rating > 0 && !resolvedRef.current) {
      resolvedRef.current = true;
      onResolvedRef.current?.({ rating, reviewCount });
      return;
    }

    async function doResolve() {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      try {
        const resp = await fetch(
          `/api/activities/resolve-place?name=${encodeURIComponent(title)}&lat=${lat!}&lng=${lng!}&fsq_id=${encodeURIComponent(fsqId!)}`,
        );
        if (!resp.ok) return;
        const data = await resp.json() as {
          googlePlaceId?: string;
          photoUrl?: string;
          rating?: number;
          reviewCount?: number;
        };
        if (data.photoUrl && !photoRef) {
          setLocalPhotoRef(data.photoUrl);
        }
        const r = data.rating ?? (rating > 0 ? rating : 0);
        const rc = data.reviewCount ?? reviewCount;
        if (r > 0 || rc > 0) {
          onResolvedRef.current?.({ rating: r, reviewCount: rc });
        }
      } catch {
        // Non-fatal
      }
    }

    if (resolveImmediately) {
      void doResolve();
      return;
    }

    const el = rootRef.current;
    if (!el) {
      void doResolve();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          void doResolve();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPhoto = Boolean(localPhotoRef) && !imgFailed;

  return (
    <div ref={rootRef} className="relative h-52 overflow-hidden flex-shrink-0">
      {/* Gradient + emoji background — always visible as loading state */}
      <div
        className="absolute inset-0 w-full h-full flex items-center justify-center"
        style={{ background: activity.gradient }}
      >
        <span
          className="text-8xl select-none transition-transform duration-500 ease-out group-hover:scale-110"
          style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}
        >
          {activity.emoji}
        </span>
      </div>

      {/* Google photo fades in over gradient once loaded */}
      {hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activityPhotoUrl(localPhotoRef!, 800)}
          alt={activity.title}
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
        />
      )}

      {children}
    </div>
  );
}
