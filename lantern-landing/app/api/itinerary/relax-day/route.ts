import Anthropic from "@anthropic-ai/sdk";
import { transformDay, type ClaudeDay } from "@/lib/itinerary/transform";
import type { PlannedDay } from "@/lib/itinerary/types";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 120;

interface RelaxDayRequest {
  day:      PlannedDay;
  wakeTime?: string; // "HH:MM" 24h
}

function formatSchedule(day: PlannedDay): string {
  return day.slots.map((s) => {
    const h   = String(Math.floor(s.startMinutes / 60)).padStart(2, "0");
    const m   = String(s.startMinutes % 60).padStart(2, "0");
    const dh  = Math.floor(s.durationMinutes / 60);
    const dm  = s.durationMinutes % 60;
    const dur = dm > 0 ? `${dh}h ${dm}m` : `${dh}h`;
    return `  ${h}:${m} — ${s.title} (${dur}, ${s.kind})`;
  }).join("\n");
}

export async function POST(req: Request) {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 503 });
  }

  let body: RelaxDayRequest;
  try { body = await req.json() as RelaxDayRequest; }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const { day, wakeTime = "08:00" } = body;
  if (!day?.slots) {
    return new Response(JSON.stringify({ error: "day.slots required" }), { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const city   = day.cityLabel ?? day.geographicArea;
  const [wh]   = wakeTime.split(":").map(Number);
  const breakfastEnd = `${String(Math.min(10, (wh ?? 8) + 2)).padStart(2, "0")}:00`;

  const prompt = `Lighten this day's itinerary — it is too packed. Return a more relaxed version.

CURRENT DAY: Day ${day.dayIndex + 1} in ${city} (${day.date})
Current theme: ${day.theme}

CURRENT SCHEDULE:
${formatSchedule(day)}

RULES FOR THE LIGHTER VERSION:
1. Keep at most 2 sightseeing activities — choose only the best highlights
2. Meals: 1 breakfast + 1 lunch + 1 dinner — never two meals back-to-back
3. Meal windows: breakfast ${wakeTime}–${breakfastEnd} | lunch 12:00–13:30 | dinner 18:30–20:30
4. Add breathing room: café stops, neighborhood strolls, or rest between activities
5. Nothing scheduled before ${wakeTime}
6. Keep hotel check-in/checkout and airport transfers if they were in the original

Return ONLY this JSON — no markdown, no prose:
{"theme":"2–4 word label","schedule":[{"time":"HH:MM","activity":"...","duration":"Xh Ym","type":"activity|meal|transfer|logistics","notes":"5 words max","timeExplanation":"One concise sentence for activity slots only"}]}`;

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch { /* closed */ }
      };

      const heartbeat = setInterval(() => send({ type: "ping" }), 3000);

      try {
        const response = await client.messages.create(
          {
            model:      "claude-sonnet-4-6",
            max_tokens: 2000,
            messages:   [{ role: "user", content: prompt }],
          },
          { timeout: 110_000 },
        );

        const content = response.content[0];
        if (!content || content.type !== "text") throw new Error("Unexpected Claude response type");

        let raw = content.text.trim();
        if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

        const parsed = JSON.parse(raw) as { theme?: string; schedule: ClaudeDay["schedule"] };

        // Build a ClaudeDay so we can reuse the same transformDay logic
        const claudeDay: ClaudeDay = {
          dayIndex: day.dayIndex + 1, // transformDay subtracts 1
          date:     day.date,
          city,
          theme:    parsed.theme ?? day.theme,
          schedule: parsed.schedule ?? [],
        };

        const relaxedDay = transformDay(claudeDay, 3); // paceMax=3 for relaxed

        send({ type: "done", data: relaxedDay });
      } catch (error) {
        console.error("[relax-day] error:", error);
        send({ type: "error", error: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
