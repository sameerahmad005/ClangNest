import type { AiModel, AiSettings } from "../../types/practice";
import { normalizeGeminiModel, providerPreset } from "./catalog";
import { validateAiConnection } from "./settings";
import { boundedJson, checkResponse, ProviderError, providerHeaders, providerRequest } from "./transport";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MODELS = 5000;
const MAX_PAGES = 50;
const MALFORMED = "The provider returned an invalid model list. Check the models URL or enter a model ID manually.";
const LIMIT = "The provider model list exceeded the supported limit (2 MiB, 5000 models, or 50 pages). Use a filtered custom models URL or enter a model ID manually.";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError(MALFORMED);
  return value as Record<string, unknown>;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\x00-\x1f\x7f]/.test(value)) throw new ProviderError(MALFORMED);
  return value.trim();
}

function price(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const decimal = value.trim();
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(decimal)) return undefined;
  const amount = Number(decimal);
  // A nonzero decimal that underflows must not turn a charge into free pricing.
  if (!Number.isFinite(amount) || (amount === 0 && /[1-9]/.test(decimal.split(/[eE]/)[0]))) return undefined;
  return amount;
}

function openRouterPricing(value: unknown): AiModel["pricingCategory"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unknown";
  const pricing = value as Record<string, unknown>;
  const prices = [price(pricing.prompt), price(pricing.completion)];
  for (const field of ["request", "internal_reasoning"]) {
    if (pricing[field] !== undefined) prices.push(price(pricing[field]));
  }
  if (prices.includes(undefined)) return "unknown";
  return prices.every(amount => amount === 0) ? "free" : "paid";
}

export async function listAvailableModels(settings: AiSettings, signal?: AbortSignal): Promise<AiModel[]> {
  validateAiConnection(settings);
  const protocol = providerPreset(settings.provider).protocol;
  const base = new URL(settings.modelsEndpoint || settings.endpoint);
  if (!settings.modelsEndpoint) {
    const path = base.pathname.replace(/\/+$/, "");
    base.pathname = protocol === "gemini" ? `${path}/models`
      : protocol === "anthropic" ? path.replace(/\/messages$/, "/models")
        : path.replace(/\/chat\/completions$/, "/models");
  }
  return providerRequest("Model listing", 30_000, signal, async requestSignal => {
    const models = new Map<string, AiModel>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let bytes = 0;
    let count = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      if (requestSignal.aborted) throw new ProviderError("Model listing was cancelled.");
      // Always build pagination URLs from configuration, never provider-supplied next URLs.
      const url = new URL(base);
      if (protocol === "gemini") url.searchParams.set("pageSize", "1000");
      if (protocol === "anthropic") url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set(protocol === "gemini" ? "pageToken" : protocol === "anthropic" ? "after_id" : "after", cursor);
      const response = await fetch(url.toString(), { method: "GET", headers: providerHeaders(settings), signal: requestSignal, credentials: "omit", redirect: "error" });
      if (requestSignal.aborted) { void response.body?.cancel().catch(() => {}); throw new ProviderError("Model listing was cancelled."); }
      checkResponse(response, true);
      const result = await boundedJson(response, MAX_BYTES - bytes, LIMIT, MALFORMED, requestSignal);
      bytes += result.bytes;
      const data = Array.isArray(result.data) && settings.provider === "together" ? { data: result.data } : object(result.data);
      const entries = data[protocol === "gemini" ? "models" : "data"];
      if (!Array.isArray(entries)) throw new ProviderError(MALFORMED);
      count += entries.length;
      if (count > MAX_MODELS) throw new ProviderError(LIMIT);
      for (const entry of entries) {
        const item = object(entry);
        if (protocol === "gemini" && (!Array.isArray(item.supportedGenerationMethods) || !item.supportedGenerationMethods.includes("generateContent"))) continue;
        const id = protocol === "gemini" ? normalizeGeminiModel(text(item.name, 200)) : text(item.id, 200);
        if (!id) throw new ProviderError(MALFORMED);
        const name = item.displayName ?? item.display_name ?? item.name ?? id;
        models.set(id, { id, name: text(name, 500), ...(settings.provider === "openrouter" ? { pricingCategory: openRouterPricing(item.pricing) } : {}) });
      }
      let next: string | undefined;
      if (protocol === "gemini") {
        if (data.nextPageToken !== undefined && data.nextPageToken !== "") next = text(data.nextPageToken, 2048);
      } else {
        if (data.has_more !== undefined && typeof data.has_more !== "boolean") throw new ProviderError(MALFORMED);
        if (data.has_more === true) {
          const lastId = data.last_id ?? (entries.length ? object(entries[entries.length - 1]).id : undefined);
          next = text(lastId, 2048);
        }
      }
      if (!next) {
        if (!models.size) throw new ProviderError("No compatible generation models were returned. Check your key permissions and models URL, or enter a supported model ID manually.");
        return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
      }
      if (cursors.has(next)) throw new ProviderError("The provider repeated a model-list page. Check the models URL or enter a model ID manually.");
      cursors.add(next);
      cursor = next;
    }
    throw new ProviderError(LIMIT);
  });
}
