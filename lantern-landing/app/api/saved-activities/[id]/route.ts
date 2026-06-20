import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedActivities } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function deviceId(req: NextRequest) { return req.headers.get("x-device-id"); }

// DELETE /api/saved-activities/[id] — unsave by record UUID or by sourceId
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const did = deviceId(req);
  if (!did) return NextResponse.json({ error: "X-Device-ID required" }, { status: 400 });

  // [id] may be either the DB UUID or the Google Place ID (sourceId)
  // Try UUID first, fall back to sourceId
  let deleted = await db
    .delete(savedActivities)
    .where(and(eq(savedActivities.id, id), eq(savedActivities.deviceId, did)))
    .returning({ id: savedActivities.id });

  if (deleted.length === 0) {
    deleted = await db
      .delete(savedActivities)
      .where(and(eq(savedActivities.sourceId, id), eq(savedActivities.deviceId, did)))
      .returning({ id: savedActivities.id });
  }

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
