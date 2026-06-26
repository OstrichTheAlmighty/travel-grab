function ddmm(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}${month}`;
}

export function buildAviasalesUrl(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
}): string {
  const route = `${params.origin}${ddmm(params.departureDate)}${params.destination}1`;
  const returnSegment = params.returnDate ? ddmm(params.returnDate) : "";
  return `https://www.aviasales.com/search/${route}${returnSegment}?marker=H4L4KIUE`;
}
