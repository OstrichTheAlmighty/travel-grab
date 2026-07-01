import { NextRequest, NextResponse } from "next/server";
import {
  canSpend,
  recordGoogleUsage,
  recordServerInFlightHit,
} from "@/lib/activities/google-usage";

const inFlight = new Map<string, Promise<{ body: ArrayBuffer; contentType: string }>>();

// Proxies Google Places (New) photo requests server-side so the API key is never
// sent to the browser.
//
// GET /api/activities/photo?name={photo.name}&w={maxWidth}
// photo.name comes from the Places API response, e.g. "places/ChIJ.../photos/AXCi..."
// The Places API redirects to the actual image; fetch follows that redirect automatically.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name  = (searchParams.get("name") ?? "").trim();
  const width = Math.min(parseInt(searchParams.get("w") ?? "800", 10) || 800, 1600);

  if (!name) {
    return new NextResponse("Missing name parameter", { status: 400 });
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) {
    return new NextResponse("API key not configured", { status: 503 });
  }

  if (!canSpend("place_photo")) {
    return new NextResponse("Photo temporarily unavailable", { status: 429 });
  }

  // Places API (New) photo endpoint issues a 302 redirect to the actual CDN image URL.
  // Do NOT pass skipHttpRedirect=true — that returns JSON instead of the image.
  // Node fetch follows redirects by default (redirect: "follow").
  const photoUrl =
    `https://places.googleapis.com/v1/${name}/media` +
    `?maxWidthPx=${width}&key=${apiKey}`;

  try {
    const key = `${name}:${width}`;
    let request = inFlight.get(key);
    if (request) {
      recordServerInFlightHit();
    } else {
      request = (async () => {
        if (!recordGoogleUsage("place_photo")) throw new Error("CAP_REACHED");
        const upstream = await fetch(photoUrl, { redirect: "follow", signal: AbortSignal.timeout(10000) });
        if (!upstream.ok) throw new Error(`HTTP_${upstream.status}`);
        const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
        if (contentType.includes("json")) throw new Error("UNEXPECTED_JSON");
        return { body: await upstream.arrayBuffer(), contentType };
      })();
      inFlight.set(key, request);
    }
    const { body, contentType } = await request.finally(() => inFlight.delete(key));

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Vary":          "Accept-Encoding",
      },
    });
  } catch (err) {
    console.error(`[activities/photo] fetch failed name="${name.slice(0, 40)}"`);
    return new NextResponse("Failed to fetch photo", { status: 502 });
  }
}
