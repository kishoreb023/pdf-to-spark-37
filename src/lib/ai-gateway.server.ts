import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export async function callChatCompletion(body: Record<string, unknown>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit exceeded. Please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<{
    choices: { message: { content: string } }[];
  }>;
}

export async function callJsonCompletion<T>(opts: {
  system: string;
  user: string;
  model?: string;
}): Promise<T> {
  const data = await callChatCompletion({
    model: opts.model ?? "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: { type: "json_object" },
  });
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  // Strip code fences if the model wraps output
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}
