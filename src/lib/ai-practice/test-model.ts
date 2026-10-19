import type { AiSettings } from "../../types/practice";
import { normalizeGeminiModel, providerPreset } from "./catalog";
import { validateAiSettings } from "./settings";
import { boundedJson, checkResponse, ProviderError, providerHeaders, providerRequest } from "./transport";

const MALFORMED = "Model not verified: the provider did not return the expected JSON reply.";
const REFUSED = "Model not verified: the provider blocked or refused the test request.";
const INCOMPLETE = "Model not verified: the provider response was incomplete.";
const PROMPT = 'Return exactly this JSON object and nothing else: {"ok":true}';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError(MALFORMED);
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new ProviderError(MALFORMED);
  return value;
}

function replyText(raw: unknown, protocol: ReturnType<typeof providerPreset>["protocol"]): string {
  const data = record(raw);
  if (data.error) throw new ProviderError(MALFORMED);
  if (protocol === "gemini") {
    if (data.promptFeedback && record(data.promptFeedback).blockReason) throw new ProviderError(REFUSED);
    if (!Array.isArray(data.candidates) || data.candidates.length !== 1) throw new ProviderError(MALFORMED);
    const candidate = record(data.candidates[0]);
    if (candidate.finishReason === "MAX_TOKENS") throw new ProviderError(INCOMPLETE);
    if (candidate.finishReason !== "STOP") throw new ProviderError(REFUSED);
    const content = record(candidate.content);
    if (!Array.isArray(content.parts)) throw new ProviderError(MALFORMED);
    return content.parts.filter(part => record(part).thought !== true).map(part => text(record(part).text)).join("");
  }
  if (protocol === "anthropic") {
    if (data.stop_reason === "max_tokens") throw new ProviderError(INCOMPLETE);
    if (data.stop_reason === "refusal") throw new ProviderError(REFUSED);
    if (data.stop_reason !== "end_turn" || !Array.isArray(data.content)) throw new ProviderError(MALFORMED);
    return data.content.filter(part => record(part).type === "text").map(part => text(record(part).text)).join("");
  }
  if (!Array.isArray(data.choices) || data.choices.length !== 1) throw new ProviderError(MALFORMED);
  const choice = record(data.choices[0]);
  const message = record(choice.message);
  if (message.refusal || choice.finish_reason === "content_filter") throw new ProviderError(REFUSED);
  if (choice.finish_reason === "length") throw new ProviderError(INCOMPLETE);
  if (choice.finish_reason !== "stop") throw new ProviderError(MALFORMED);
  return text(message.content);
}

/** A minimal JSON connectivity check, not a streaming or full problem-generation guarantee. */
export async function testAiModel(settings: AiSettings, signal?: AbortSignal): Promise<{ durationMs: number }> {
  validateAiSettings(settings);
  const protocol = providerPreset(settings.provider).protocol;
  const url = protocol === "gemini"
    ? `${settings.endpoint.replace(/\/+$/, "")}/models/${encodeURIComponent(normalizeGeminiModel(settings.model))}:generateContent`
    : settings.endpoint;
  const body = protocol === "gemini" ? {
    contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: {
      type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"],
    } },
  } : protocol === "anthropic" ? {
    model: settings.model.trim(), max_tokens: 4096, messages: [{ role: "user", content: PROMPT }],
  } : {
    model: settings.model.trim(), messages: [{ role: "user", content: PROMPT }], response_format: { type: "json_object" }, stream: false,
  };
  const start = performance.now();
  return providerRequest("Model test", 20_000, signal, async requestSignal => {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...providerHeaders(settings) },
      body: JSON.stringify(body), signal: requestSignal, credentials: "omit", redirect: "error",
    });
    if (requestSignal.aborted) {
      void response.body?.cancel().catch(() => {});
      throw new ProviderError("Model test was cancelled.");
    }
    checkResponse(response);
    const { data } = await boundedJson(response, 64 * 1024, "Model not verified: the provider response exceeded 64 KiB.", MALFORMED, requestSignal);
    if (requestSignal.aborted) throw new ProviderError("Model test was cancelled.");
    let parsed: unknown;
    const content = replyText(data, protocol);
    try { parsed = JSON.parse(content); } catch { throw new ProviderError(MALFORMED); }
    const result = record(parsed);
    if (result.ok !== true || Object.keys(result).length !== 1) throw new ProviderError(MALFORMED);
    return { durationMs: Math.max(0, Math.round(performance.now() - start)) };
  });
}
