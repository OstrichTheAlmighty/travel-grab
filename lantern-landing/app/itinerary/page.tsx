import type { Metadata } from "next";
import ItineraryPlanner from "./ItineraryPlanner";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata: Metadata = {
  title: "Plan your itinerary — TravelGrab",
  description: "AI-powered day-by-day itinerary planning. Enter your trip details and get a personalized schedule built around opening hours, geography, and your preferences.",
};

export default function ItineraryPage() {
  return (
    <AuthGuard>
      <ItineraryPlanner />
    </AuthGuard>
  );
}
