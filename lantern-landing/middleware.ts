import { NextRequest, NextResponse } from "next/server";

const BLOCKED: string[] = ["/flights", "/hotels", "/activities"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (BLOCKED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(new URL("/?coming_soon=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/flights/:path*", "/hotels/:path*", "/activities/:path*"],
};
