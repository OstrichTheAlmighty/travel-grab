import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      status: "not_implemented",
      message: "Duffel flight search integration coming soon.",
    },
    { status: 503 }
  );
}
