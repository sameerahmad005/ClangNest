import type { AiSettings } from "../../types/practice";
import { providerPreset } from "./catalog";

export class ProviderError extends Error {}

export function providerHeaders(settings: AiSettings): Record<string, string> {
  const protocol = providerPreset(settings.provider).protocol;
  if (protocol === "gemini") return { "x-goog-api-key": settings.apiKey.trim() };
  if (protocol === "anthropic") return {
    "x-api-key": settings.apiKey.trim(),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  return { Authorization: `Bearer ${settings.apiKey.trim()}` };
}

export function checkResponse(response: Response, models = false): void {
  if (response.ok) return;
  void response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) throw new ProviderError("The provider rejected the API key or permissions. Check your key and model access in AI settings.");
  if (response.status === 429) throw new ProviderError("The provider's rate limit or quota was reached. Check your quota or wait before trying again.");
  if (response.status === 404) throw new ProviderError(models
    ? "The models route was not found (HTTP 404). Check the provider endpoint or set a custom models URL in AI settings."
    : "The model or generation route was not found (HTTP 404). Refresh the model list, choose an available model, and check the provider endpoint in AI settings.");
  throw new ProviderError(`The provider request failed (HTTP ${response.status}). Check the endpoint and model in AI settings.`);
}

export async function boundedJson(response: Response, maxBytes: number, tooLarge: string, malformed: string, signal: AbortSignal): Promise<{ data: unknown; bytes: number }> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new ProviderError(tooLarge);
  }
  if (!response.body) throw new ProviderError(malformed);
  const reader = response.body.getReader();
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      if (signal.aborted) throw new ProviderError("Request cancelled.");
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new ProviderError(tooLarge);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    if (signal.aborted) throw new ProviderError("Request cancelled.");
    text += decoder.decode();
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  try { return { data: JSON.parse(text), bytes }; } catch { throw new ProviderError(malformed); }
}

export async function providerRequest<T>(label: string, timeoutMs: number, signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal?.aborted) throw new Error(`${label} was cancelled.`);
  const controller = new AbortController();
  let timedOut = false;
  const abortMessage = () => timedOut ? `${label} timed out after ${timeoutMs / 1000} seconds. Try again or choose another model.` : `${label} was cancelled.`;
  const onCancel = () => controller.abort();
  signal?.addEventListener("abort", onCancel, { once: true });
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new ProviderError(abortMessage()));
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await Promise.race([aborted, work(controller.signal)]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(abortMessage());
    if (error instanceof ProviderError) throw new Error(error.message);
    throw new Error("Could not reach the AI provider. Check your connection, endpoint, and browser CORS support.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onCancel);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
