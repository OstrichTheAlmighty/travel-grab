import { NextRequest, NextResponse } from "next/server";

// Proxies Google Places photo requests server-side so the API key is never
// sent to the browser.  Photo references come from the /api/activities/search
// response and are not user-supplied, so they are already trusted values.
//
// GET /api/activities/photo?ref={photo_reference}&w={maxWidth}
// → streams the image from Google Places Photo API with long cache headers.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ref   = (searchParams.get("ref") ?? "").trim();
  const width = Math.min(parseInt(searchParams.get("w") ?? "800", 10) || 800, 1600);

  if (!ref) {
    return new NextResponse("Missing ref parameter", { status: 400 });
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) {
    return new NextResponse("API key not configured", { status: 503 });
  }

  const photoUrl =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=${width}&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`;

  try {
    const upstream = await fetch(photoUrl, {
      signal: AbortSignal.timeout(8000),
      // Follow the redirect Google sends — Node fetch does this automatically.
    });

    if (!upstream.ok) {
      console.warn(`[activities/photo] upstream ${upstream.status} for ref=${ref.slice(0, 20)}…`);
      return new NextResponse("Photo unavailable", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const body        = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status:  200,
      headers: {
        "Content-Type":  contentType,
        // Cache aggressively — photo references don't change for a given place.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Vary":          "Accept-Encoding",
      },
    });
  } catch (err) {
    console.error("[activities/photo] fetch error", err);
    return new NextResponse("Failed to fetch photo", { status: 502 });
  }
}
