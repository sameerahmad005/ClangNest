import type { AiProviderId, AiProviderPreset } from "../../types/practice";

export const AI_PROVIDERS: readonly AiProviderPreset[] = [
  { id: "gemini", name: "Google Gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta", protocol: "gemini", apiKeyUrl: "https://aistudio.google.com/apikey" },
  { id: "openai", name: "OpenAI", endpoint: "https://api.openai.com/v1/chat/completions", protocol: "openai-compatible", apiKeyUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", endpoint: "https://api.anthropic.com/v1/messages", protocol: "anthropic", apiKeyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openrouter", name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", protocol: "openai-compatible", apiKeyUrl: "https://openrouter.ai/settings/keys" },
  { id: "groq", name: "Groq", endpoint: "https://api.groq.com/openai/v1/chat/completions", protocol: "openai-compatible", apiKeyUrl: "https://console.groq.com/keys" },
  { id: "deepseek", name: "DeepSeek", endpoint: "https://api.deepseek.com/chat/completions", protocol: "openai-compatible", apiKeyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "mistral", name: "Mistral", endpoint: "https://api.mistral.ai/v1/chat/completions", protocol: "openai-compatible", apiKeyUrl: "https://console.mistral.ai/api-keys/" },
  { id: "together", name: "Together AI", endpoint: "https://api.together.xyz/v1/chat/completions", protocol: "openai-compatible", apiKeyUrl: "https://api.together.ai/settings/api-keys" },
  { id: "xai", name: "xAI", endpoint: "https://api.x.ai/v1/chat/completions", protocol: "openai-compatible", apiKeyUrl: "https://console.x.ai/" },
  { id: "openai-compatible", name: "Custom OpenAI-compatible", endpoint: "", protocol: "openai-compatible" },
];

export function providerPreset(id: AiProviderId): AiProviderPreset {
  const preset = AI_PROVIDERS.find(provider => provider.id === id);
  if (!preset) throw new Error("Choose a supported AI provider.");
  return preset;
}

export function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^(?:models\/)+/, "");
}
