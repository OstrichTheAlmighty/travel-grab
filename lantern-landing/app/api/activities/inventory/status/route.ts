import { NextRequest, NextResponse } from "next/server";
import { inventoryStore, destinationToKey } from "../../_inventory";

// GET /api/activities/inventory/status?city=tokyo
// Lightweight — no API calls. Client polls this while inventory is building.

export async function GET(req: NextRequest) {
  const cityParam = (req.nextUrl.searchParams.get("city") ?? "").toLowerCase().trim();
  if (!cityParam) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }

  // Try direct key first, then via destinationToKey alias
  let inv = inventoryStore.get(cityParam);
  if (!inv) {
    const mapped = destinationToKey.get(cityParam);
    if (mapped) inv = inventoryStore.get(mapped);
  }

  if (!inv) {
    return NextResponse.json({ status: "not_started", count: 0 });
  }

  return NextResponse.json({
    status:            inv.status,
    count:             inv.entries.size,
    queriesCompleted:  inv.queriesCompleted,
    queriesTotal:      inv.queriesTotal,
    city:              inv.city,
    country:           inv.country,
  });
}
