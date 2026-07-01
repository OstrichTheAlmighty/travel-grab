import "dotenv/config";
import { buildInventoryOffline, convertInventoryToActivities } from "../../app/api/activities/_inventory";

function cityArg(argv: string[]): string {
  const value = argv.find((arg) => arg.startsWith("--city="))?.slice("--city=".length).trim();
  if (!value) throw new Error("Usage: npm run activities:google-build -- --city=\"Tokyo, Japan\"");
  return value;
}

async function main(): Promise<void> {
  const city = cityArg(process.argv.slice(2));
  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is required");
  console.log(`[activities/google-build] Explicit offline build started for ${city}`);
  const inventory = await buildInventoryOffline(city, apiKey);
  if (!inventory) throw new Error("Could not resolve destination");
  const activities = convertInventoryToActivities(inventory);
  console.log(`[activities/google-build] Completed ${activities.length} activities; no Supabase writes performed`);
}

main().catch((error) => {
  console.error(`[activities/google-build] ${error instanceof Error ? error.message : "Build failed"}`);
  process.exitCode = 1;
});
