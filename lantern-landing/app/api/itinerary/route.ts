import { NextRequest, NextResponse } from "next/server";
import { generateItinerary } from "./generateWithClaude";

export async function POST(req: NextRequest) {
  try {
    const input = await req.json();
    const result = await generateItinerary(input);

    // Claude might return JSON wrapped in markdown backticks
    let itinerary = result;
    if (typeof result === "string") {
      let jsonText = result;
      if (jsonText.includes("```")) {
        jsonText = jsonText.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      }
      itinerary = JSON.parse(jsonText);
    }

    return NextResponse.json({
      success: true,
      itinerary,
    });
  } catch (error) {
    console.error("Itinerary generation error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}