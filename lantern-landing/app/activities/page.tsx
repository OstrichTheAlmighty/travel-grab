import ActivitySearch from "./ActivitySearch";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata = {
  title: "Activities – TravelGrab",
  description: "Advisor-style activity planning. Find what's actually worth doing with your limited vacation time.",
};

export default function ActivitiesPage() {
  return (
    <AuthGuard>
      <ActivitySearch />
    </AuthGuard>
  );
}
