// Legacy reference — Aviasales direct search (kept for rollback)
// export function buildAviasalesUrlLegacy(params: {
//   origin: string; destination: string; departureDate: string; returnDate?: string;
// }): string {
//   const p = new URLSearchParams({
//     origin_iata: params.origin, destination_iata: params.destination,
//     depart_date: params.departureDate, adults: "1", children: "0",
//     infants: "0", trip_class: "0", marker: "H4L4KIUE", locale: "en", currency: "USD",
//   });
//   if (params.returnDate) p.set("return_date", params.returnDate);
//   return `https://search.aviasales.com/flights/?${p.toString()}`;
// }

export function buildAviasalesUrl(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  // Optional flight-specific params — pre-select the exact flight on the White Label
  airlineCode?: string;
  flightNumber?: string; // full flight number, e.g. "ZG25"
  departTime?: string;   // HH:MM extracted from ISO depart_time
  price?: number;
  currency?: string;
}): string {
  const p = new URLSearchParams({
    origin_iata:      params.origin,
    destination_iata: params.destination,
    depart_date:      params.departureDate,
    adults:           "1",
    children:         "0",
    infants:          "0",
    trip_class:       "0",
    locale:           "en",
  });
  if (params.returnDate)   p.set("return_date",   params.returnDate);
  if (params.airlineCode)  p.set("airline_code",   params.airlineCode);
  if (params.flightNumber) p.set("flight_number",  params.flightNumber);
  if (params.departTime)   p.set("depart_time",    params.departTime);
  if (params.price != null) p.set("price",         String(Math.round(params.price)));
  if (params.currency)     p.set("currency",       params.currency);
  return `https://book.travelgrab.ai/flights/?${p.toString()}`;
}
