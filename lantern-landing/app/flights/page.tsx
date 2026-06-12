import type { Metadata } from "next";
import FlightSearch from "./FlightSearch";

export const metadata: Metadata = {
  title: "Flight Search — TravelGrab",
  description:
    "Find the right flight, not just the cheapest one. AI compares price, layovers, timing, airlines, and comfort.",
};

export default function FlightsPage() {
  return <FlightSearch />;
}
