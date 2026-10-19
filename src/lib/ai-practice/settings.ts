import type { AiSettings } from "../../types/practice";
import { normalizeGeminiModel, providerPreset } from "./catalog";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "gemini",
  endpoint: "https://generativelanguage.googleapis.com/v1beta",
  model: "",
  apiKey: "",
  rememberKey: false,
};

const SETTINGS_KEY = "cpp-practice.ai.settings";
const API_KEY = "cpp-practice.ai.api-key";

function validateUrl(endpoint: string): URL {
  if (typeof endpoint !== "string" || endpoint.length > 2048 || /[\x00-\x20\x7f]/.test(endpoint)) {
    throw new Error("Enter a valid provider endpoint URL of at most 2048 characters.");
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Enter a valid provider endpoint URL.");
  }
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password || /[?#]/.test(endpoint)) {
    throw new Error("Use an HTTPS endpoint without credentials, query parameters, or fragments (HTTP is allowed for localhost).");
  }
  return url;
}

function validateConfiguration(settings: AiSettings): void {
  if (!settings) throw new Error("Choose a supported AI provider.");
  const preset = providerPreset(settings.provider);
  // A custom provider can be saved before its explicit endpoint is configured.
  const url = settings.provider === "openai-compatible" && settings.endpoint === "" ? null : validateUrl(settings.endpoint);
  if (url && preset.protocol === "gemini" && /\/models(?:\/|$)|:generateContent\/?$/.test(url.pathname)) {
    throw new Error("Enter the Gemini API base URL, such as https://generativelanguage.googleapis.com/v1beta, not a models or generateContent URL.");
  }
  if (url && preset.protocol === "openai-compatible" && !url.pathname.replace(/\/+$/, "").endsWith("/chat/completions")) {
    throw new Error("Enter the complete OpenAI-compatible URL ending in /chat/completions.");
  }
  if (url && preset.protocol === "anthropic" && !url.pathname.replace(/\/+$/, "").endsWith("/messages")) {
    throw new Error("Enter the complete Anthropic URL ending in /messages.");
  }
  if (settings.modelsEndpoint !== undefined && settings.modelsEndpoint !== "") validateUrl(settings.modelsEndpoint);
  if (typeof settings.model !== "string" || settings.model.length > 200 || /[\x00-\x1f\x7f]/.test(settings.model)) {
    throw new Error("Enter a model name of at most 200 characters.");
  }
  if (typeof settings.apiKey !== "string" || /[\x00-\x1f\x7f]/.test(settings.apiKey) || settings.apiKey.length > 4096) {
    throw new Error("Enter a valid API key without line breaks.");
  }
  if (typeof settings.rememberKey !== "boolean") throw new Error("Choose whether to remember the API key.");
}

export function validateAiConnection(settings: AiSettings): void {
  validateConfiguration(settings);
  validateUrl(settings.endpoint);
  if (!settings.apiKey.trim()) throw new Error("Enter your provider API key in AI settings before generating a problem.");
}

export function validateAiSettings(settings: AiSettings): void {
  validateAiConnection(settings);
  if (!(settings.provider === "gemini" ? normalizeGeminiModel(settings.model) : settings.model.trim())) {
    throw new Error("Choose a model from the live provider list or enter a model ID before generating a problem.");
  }
}

export function loadAiSettings(): AiSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...DEFAULT_AI_SETTINGS };
    const config = stored as Partial<AiSettings>;
    const settings: AiSettings = {
      provider: config.provider ?? DEFAULT_AI_SETTINGS.provider,
      endpoint: config.endpoint ?? DEFAULT_AI_SETTINGS.endpoint,
      model: config.model ?? DEFAULT_AI_SETTINGS.model,
      rememberKey: config.rememberKey === true,
      apiKey: "",
      ...(config.modelsEndpoint !== undefined ? { modelsEndpoint: config.modelsEndpoint } : {}),
    };
    validateConfiguration(settings);
    settings.apiKey = (settings.rememberKey ? localStorage : sessionStorage).getItem(API_KEY) ?? "";
    validateConfiguration(settings);
    return settings;
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  validateConfiguration(settings);
  const { provider, endpoint, modelsEndpoint, model, rememberKey } = settings;
  try {
    // Clear both locations first so changing persistence never leaves an obsolete key.
    localStorage.removeItem(API_KEY);
    sessionStorage.removeItem(API_KEY);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider, endpoint, modelsEndpoint, model, rememberKey }));
    if (settings.apiKey.trim()) (rememberKey ? localStorage : sessionStorage).setItem(API_KEY, settings.apiKey.trim());
  } catch {
    throw new Error("AI settings could not be saved. Check your browser storage permissions.");
  }
}
