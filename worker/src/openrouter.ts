// OpenRouter client. Compatible with OpenAI Chat Completions.
// https://openrouter.ai/docs/api_reference/overview

type Msg = { role: "system" | "user" | "assistant"; content: string };

export type OpenRouterOpts = {
  apiKey: string;
  model: string;
  messages: Msg[];
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function openRouterComplete({
  apiKey,
  model,
  messages,
  jsonMode,
  maxTokens = 1500,
  temperature = 0.4,
  signal,
}: OpenRouterOpts): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://quantara.app",
      "X-Title": "Quantara",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openrouter ${model} ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function openRouterStream({
  apiKey,
  model,
  messages,
  jsonMode,
  maxTokens = 1500,
  temperature = 0.4,
  signal,
}: OpenRouterOpts): Promise<ReadableStream<Uint8Array>> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://quantara.app",
      "X-Title": "Quantara",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`openrouter ${model} ${res.status}: ${text.slice(0, 200)}`);
  }

  // Re-emit OpenAI-style SSE chunks as `data: {"response": "..."}\n\n` so the
  // existing frontend SSE parser keeps working.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstream = res.body;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const raw of lines) {
            const line = raw.trim();
            if (!line || !line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const chunk = obj.choices?.[0]?.delta?.content ?? "";
              if (chunk) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ response: chunk })}\n\n`)
                );
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}