import type { Metadata } from "next";
import HotelSearch from "./HotelSearch";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata: Metadata = {
  title: "Hotel Search — TravelGrab",
  description:
    "Find the right hotel, not just the cheapest one. TravelGrab ranks hotels by reviews, location, walkability, and value.",
};

export default function HotelsPage() {
  return (
    <AuthGuard>
      <HotelSearch />
    </AuthGuard>
  );
}
