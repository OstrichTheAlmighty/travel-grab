import ActivitySearch from "./ActivitySearch";
import DemoGuard from "@/app/components/DemoGuard";

export const metadata = {
  title: "Activities – TravelGrab",
  description: "Advisor-style activity planning. Find what's actually worth doing with your limited vacation time.",
};

export default function ActivitiesPage() {
  return (
    <DemoGuard>
      <ActivitySearch />
    </DemoGuard>
  );
}
