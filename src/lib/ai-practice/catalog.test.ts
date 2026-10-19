import { describe, expect, it } from "vitest";
import type { AiProviderId } from "../../types/practice";
import { AI_PROVIDERS, providerPreset } from "./catalog";

const officialDestinations: [AiProviderId, string][] = [
  ["gemini", "https://aistudio.google.com/apikey"],
  ["openai", "https://platform.openai.com/api-keys"],
  ["anthropic", "https://console.anthropic.com/settings/keys"],
  ["openrouter", "https://openrouter.ai/settings/keys"],
  ["groq", "https://console.groq.com/keys"],
  ["deepseek", "https://platform.deepseek.com/api_keys"],
  ["mistral", "https://console.mistral.ai/api-keys/"],
  ["together", "https://api.together.ai/settings/api-keys"],
  ["xai", "https://console.x.ai/"],
];

describe("provider API-key destinations", () => {
  it.each(officialDestinations)("uses the official static destination for %s", (id, destination) => {
    expect(providerPreset(id).apiKeyUrl).toBe(destination);
  });

  it("only includes HTTPS destinations without credentials, query strings, or fragments", () => {
    const destinations = AI_PROVIDERS.filter(provider => provider.apiKeyUrl !== undefined);
    expect(destinations).toHaveLength(9);
    for (const provider of destinations) {
      const url = new URL(provider.apiKeyUrl!);
      expect(url.protocol).toBe("https:");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
    }
  });

  it("does not supply an API-key destination for custom OpenAI-compatible providers", () => {
    expect(providerPreset("openai-compatible").apiKeyUrl).toBeUndefined();
  });
});
