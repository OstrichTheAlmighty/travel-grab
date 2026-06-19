import { NextRequest, NextResponse } from "next/server";

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

  // Places API (New) photo endpoint issues a 302 redirect to the actual CDN image URL.
  // Do NOT pass skipHttpRedirect=true — that returns JSON instead of the image.
  // Node fetch follows redirects by default (redirect: "follow").
  const photoUrl =
    `https://places.googleapis.com/v1/${name}/media` +
    `?maxWidthPx=${width}&key=${apiKey}`;

  console.log(
    `[activities/photo] fetching name="${name.slice(0, 70)}" ` +
    `url="${photoUrl.replace(apiKey, "REDACTED")}"`,
  );

  try {
    const upstream = await fetch(photoUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.warn(
        `[activities/photo] upstream ${upstream.status} name="${name.slice(0, 40)}" body="${body.slice(0, 200)}"`,
      );
      return new NextResponse("Photo unavailable", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";

    // Guard: if Google returned JSON (shouldn't happen without skipHttpRedirect) log and bail
    if (contentType.includes("json")) {
      const body = await upstream.text().catch(() => "");
      console.warn(`[activities/photo] got JSON instead of image — body="${body.slice(0, 200)}"`);
      return new NextResponse("Unexpected JSON response from photo API", { status: 502 });
    }

    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Vary":          "Accept-Encoding",
      },
    });
  } catch (err) {
    console.error(`[activities/photo] fetch error name="${name.slice(0, 40)}"`, err);
    return new NextResponse("Failed to fetch photo", { status: 502 });
  }
}
