import { NextRequest, NextResponse } from "next/server";

const BLOCKED: string[] = ["/flights", "/hotels", "/activities"];
const ADMIN_COOKIE = "tg_admin";
const UNLOCK_KEY   = process.env.ADMIN_UNLOCK_KEY ?? "tg_owner_2026";

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Allow through if the admin cookie is set
  if (req.cookies.get(ADMIN_COOKIE)?.value === "1") {
    return NextResponse.next();
  }

  // One-time unlock: /?unlock=<key> on the landing page sets the cookie
  if (pathname === "/" && searchParams.get("unlock") === UNLOCK_KEY) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set(ADMIN_COOKIE, "1", {
      path:     "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 365, // 1 year
    });
    return res;
  }

  if (BLOCKED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(new URL("/?coming_soon=1", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/flights/:path*", "/hotels/:path*", "/activities/:path*"],
};
