import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_PROVIDERS, DEFAULT_AI_SETTINGS, loadAiSettings, providerPreset, saveAiSettings, validateAiConnection, validateAiSettings } from "./index";

const fakeKey = "FAKE_TEST_KEY_NOT_A_CREDENTIAL";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe("private AI settings", () => {
  it("starts with Gemini and no stored key, returning independent defaults", () => {
    expect(loadAiSettings()).toEqual({ provider: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta", model: "", apiKey: "", rememberKey: false });
    loadAiSettings().model = "changed";
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    expect(localStorage.length).toBe(0);
  });

  it("saves configuration locally and keeps the key only in session storage by default", () => {
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey });
    expect(loadAiSettings().apiKey).toBe(fakeKey);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(localStorage.key(0)!)).not.toContain(fakeKey);
    expect(sessionStorage.length).toBe(1);
    sessionStorage.clear();
    expect(loadAiSettings().apiKey).toBe("");
  });

  it("moves the key between stores on explicit remember changes and clears obsolete copies", () => {
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey });
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey, rememberKey: true });
    expect(sessionStorage.length).toBe(0);
    expect(loadAiSettings()).toMatchObject({ apiKey: fakeKey, rememberKey: true });
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey });
    expect(localStorage.length).toBe(1);
    saveAiSettings(DEFAULT_AI_SETTINGS);
    expect(sessionStorage.length).toBe(0);
    expect(loadAiSettings().apiKey).toBe("");
  });

  it("allows saving empty keys but requires one before generation", () => {
    expect(() => saveAiSettings(DEFAULT_AI_SETTINGS)).not.toThrow();
    expect(() => validateAiSettings(DEFAULT_AI_SETTINGS)).toThrow(/API key/);
  });

  it.each([
    { endpoint: "broken" },
    { endpoint: "https://example.test?key=FAKE_TEST_KEY_NOT_A_CREDENTIAL" },
    { endpoint: "https://user:password@example.test" },
    { endpoint: "http://example.test" },
    { model: "" },
    { model: "bad\nmodel" },
    { apiKey: "bad\nkey" },
    { provider: "openai-compatible" as const, endpoint: "https://example.test/v1" },
  ])("rejects invalid configuration with a nonsecret error: %j", change => {
    expect(() => validateAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey, ...change })).toThrow();
    try { validateAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey, ...change }); } catch (error) {
      expect(String(error)).not.toContain(fakeKey);
    }
  });

  it("accepts complete compatible endpoints, including local development", () => {
    expect(() => validateAiSettings({ ...DEFAULT_AI_SETTINGS, provider: "openai-compatible", endpoint: "http://localhost:8080/v1/chat/completions", model: "test-model", apiKey: fakeKey })).not.toThrow();
  });

  it("keeps an old saved model, while allowing empty models in saved settings and connection checks", () => {
    localStorage.setItem("cpp-practice.ai.settings", JSON.stringify({ ...DEFAULT_AI_SETTINGS, model: "previously-saved-model" }));
    expect(loadAiSettings().model).toBe("previously-saved-model");
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey });
    expect(loadAiSettings().model).toBe("");
    expect(() => validateAiConnection(loadAiSettings())).not.toThrow();
    expect(() => validateAiSettings(loadAiSettings())).toThrow(/Choose a model/);
    expect(() => validateAiSettings({ ...loadAiSettings(), model: "models/" })).toThrow(/Choose a model/);
  });

  it.each(AI_PROVIDERS)("round-trips $id and its optional custom models endpoint without persisting the key in configuration", preset => {
    const config = { ...DEFAULT_AI_SETTINGS, provider: preset.id, endpoint: preset.endpoint, modelsEndpoint: "https://example.test/custom/models", apiKey: fakeKey };
    saveAiSettings(config);
    expect(loadAiSettings()).toEqual(config);
    expect(localStorage.getItem("cpp-practice.ai.settings")).not.toContain(fakeKey);
    if (preset.endpoint) expect(() => validateAiConnection(config)).not.toThrow();
    else expect(() => validateAiConnection(config)).toThrow(/endpoint URL/);
  });

  it.each(["https://user:password@example.test/models", "https://example.test/models?key=FAKE_TEST_KEY_NOT_A_CREDENTIAL", "https://example.test/models#secret", "https://example.test/models?", "https://example.test/models#", "http://example.test/models", "not a url"])("rejects unsafe custom models endpoints: %s", modelsEndpoint => {
    const config = { ...DEFAULT_AI_SETTINGS, apiKey: fakeKey, modelsEndpoint };
    expect(() => saveAiSettings(config)).toThrow();
    expect(() => validateAiConnection(config)).toThrow();
    try { validateAiConnection(config); } catch (error) { expect(String(error)).not.toContain(fakeKey); }
  });

  it("does not invent a preset or silently substitute a different provider", () => {
    expect(AI_PROVIDERS).toHaveLength(10);
    expect(providerPreset("openai-compatible").endpoint).toBe("");
    expect(() => providerPreset("unknown" as never)).toThrow(/supported/);
  });

  it("recovers from malformed storage and does not load a key from the configuration object", () => {
    localStorage.setItem("cpp-practice.ai.settings", "bad json");
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    localStorage.setItem("cpp-practice.ai.settings", JSON.stringify({ ...DEFAULT_AI_SETTINGS, apiKey: fakeKey }));
    expect(loadAiSettings().apiKey).toBe("");
    localStorage.setItem("cpp-practice.ai.settings", JSON.stringify({ endpoint: "not a url" }));
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("handles unavailable browser storage without exposing a raw storage error", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error(fakeKey); });
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error(fakeKey); });
    expect(() => saveAiSettings(DEFAULT_AI_SETTINGS)).toThrow(/browser storage/);
  });
});
