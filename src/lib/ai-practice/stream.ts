import { ProviderError } from "./transport";

const MAX_WIRE_BYTES = 1024 * 1024;
const MAX_CONTENT_BYTES = 128 * 1024;
const INVALID = "The provider returned an invalid or truncated response. Try generating again or choose another model.";
const TOO_LARGE = "The provider response was too large. Try generating a smaller problem.";
const BLOCKED = "The provider blocked or refused this request. Try another topic or model.";
const encoder = new TextEncoder();

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError(INVALID);
  return value as Record<string, unknown>;
}

/** Read only answer deltas; provider reasoning/metadata never reaches the preview. */
export async function readProblemStream(response: Response, signal: AbortSignal, onContent: (content: string) => void): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_WIRE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new ProviderError(TOO_LARGE);
  }
  if (!response.body) throw new ProviderError(INVALID);
  const reader = response.body.getReader();
  let cancelled = false;
  const cancel = () => {
    if (!cancelled) { cancelled = true; void reader.cancel().catch(() => {}); }
  };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let wireBytes = 0;
  let contentBytes = 0;
  let content = "";
  let lineParts: string[] = [];
  let skipLf = false;
  let data: string[] = [];
  let event = "";
  let terminal = false;
  const assertActive = () => { if (signal.aborted) throw new ProviderError("Request cancelled."); };

  const dispatch = () => {
    if (event === "error") throw new ProviderError("The provider reported a generation error. Try again or choose another model.");
    const payload = data.join("\n");
    data = [];
    event = "";
    if (!payload) return;
    if (payload.trim() === "[DONE]") { terminal = true; return; }
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { throw new ProviderError(INVALID); }
    const chunk = object(parsed);
    if (chunk.error) throw new ProviderError("The provider reported a generation error. Try again or choose another model.");
    if (!Array.isArray(chunk.choices)) throw new ProviderError(INVALID);
    // Empty choices are standard usage-only chunks, not answer content.
    if (!chunk.choices.length) return;
    if (chunk.choices.length !== 1) throw new ProviderError(INVALID);
    const choice = object(chunk.choices[0]);
    if (choice.index !== undefined && choice.index !== 0) throw new ProviderError(INVALID);
    if (choice.finish_reason === "content_filter" || choice.finish_reason === "refusal") throw new ProviderError(BLOCKED);
    if (choice.finish_reason === "length") throw new ProviderError("The provider response was incomplete. Try another model or generate again.");
    if (choice.finish_reason != null && choice.finish_reason !== "stop") throw new ProviderError(INVALID);
    const delta = choice.delta == null && choice.finish_reason === "stop" ? {} : object(choice.delta);
    if (delta.refusal) throw new ProviderError(BLOCKED);
    if (delta.content != null) {
      if (typeof delta.content !== "string") throw new ProviderError(INVALID);
      contentBytes += encoder.encode(delta.content).byteLength;
      if (contentBytes > MAX_CONTENT_BYTES) throw new ProviderError(TOO_LARGE);
      if (delta.content) {
        content += delta.content;
        assertActive();
        onContent(content);
        assertActive();
      }
    }
    if (choice.finish_reason === "stop") terminal = true;
  };

  try {
    for (;;) {
      assertActive();
      const chunk = await reader.read();
      assertActive();
      if (chunk.done) {
        decoder.decode();
        throw new ProviderError(INVALID);
      }
      wireBytes += chunk.value.byteLength;
      if (wireBytes > MAX_WIRE_BYTES) throw new ProviderError(TOO_LARGE);
      const text = decoder.decode(chunk.value, { stream: true });
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (skipLf) {
          skipLf = false;
          if (char === "\n") { start = i + 1; continue; }
        }
        if (char !== "\r" && char !== "\n") continue;
        lineParts.push(text.slice(start, i));
        const line = lineParts.join("");
        lineParts = [];
        skipLf = char === "\r";
        start = i + 1;
        if (!line) dispatch();
        else if (!line.startsWith(":")) {
          const colon = line.indexOf(":");
          const name = colon < 0 ? line : line.slice(0, colon);
          let value = colon < 0 ? "" : line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (name === "data") data.push(value);
          if (name === "event") event = value;
        }
        if (terminal) {
          if (!content) throw new ProviderError(INVALID);
          return content;
        }
      }
      if (start < text.length) lineParts.push(text.slice(start));
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(INVALID);
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}
