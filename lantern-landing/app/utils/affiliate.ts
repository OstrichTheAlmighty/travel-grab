const AVIASALES_BASE = "https://aviasales.tpx.lu/H4L4KIUE/searches/new";

export function buildAviasalesUrl(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
}): string {
  const p = new URLSearchParams({
    origin_iata: params.origin,
    destination_iata: params.destination,
    departure_at: params.departureDate,
  });
  if (params.returnDate) p.set("return_at", params.returnDate);
  return `${AVIASALES_BASE}?${p.toString()}`;
}
