import type { Metadata } from "next";
import ItineraryPlanner from "./ItineraryPlanner";
import DemoGuard from "@/app/components/DemoGuard";

export const metadata: Metadata = {
  title: "Plan your itinerary — TravelGrab",
  description: "AI-powered day-by-day itinerary planning. Enter your trip details and get a personalized schedule built around opening hours, geography, and your preferences.",
};

export default function ItineraryPage() {
  return (
    <DemoGuard>
      <ItineraryPlanner />
    </DemoGuard>
  );
}
