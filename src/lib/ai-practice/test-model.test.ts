import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "../../types/practice";
import { AI_PROVIDERS, DEFAULT_AI_SETTINGS, providerPreset, testAiModel } from "./index";

const key = "FAKE_PROBE_KEY_NOT_A_CREDENTIAL";
const prompt = 'Return exactly this JSON object and nothing else: {"ok":true}';
const protocols = ["gemini", "anthropic", "openai-compatible"] as const;
type Protocol = typeof protocols[number];
const settingsFor = (provider: Protocol): AiSettings => ({
  ...DEFAULT_AI_SETTINGS, provider, apiKey: ` ${key} `, model: " selected-model ",
  endpoint: provider === "openai-compatible" ? "https://custom.test/private/v1/chat/completions" : providerPreset(provider).endpoint,
});
function envelope(protocol: Protocol, content = '{"ok":true}'): object {
  if (protocol === "gemini") return { candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: key }, { text: content }] } }] };
  if (protocol === "anthropic") return { stop_reason: "end_turn", content: [{ type: "thinking", thinking: key }, { type: "text", text: content }] };
  return { choices: [{ finish_reason: "stop", message: { content, reasoning: key } }] };
}
const reply = (payload: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status })));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("selected model JSON probe", () => {
  it("uses Gemini's exact normalized/encoded route, native schema, and header auth", async () => {
    reply(envelope("gemini"));
    const settings = { ...settingsFor("gemini"), model: " models/models/selected model " };
    expect(await testAiModel(settings)).toEqual({ durationMs: expect.any(Number) });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${settings.endpoint}/models/selected%20model:generateContent`);
    expect(options).toMatchObject({ method: "POST", credentials: "omit", redirect: "error", headers: { "Content-Type": "application/json", "x-goog-api-key": key } });
    expect(JSON.parse(String(options?.body))).toEqual({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] } },
    });
    expect(String(options?.body)).not.toContain(key);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("uses native Anthropic messages and adequate max_tokens without thinking overrides", async () => {
    reply(envelope("anthropic"));
    const settings = settingsFor("anthropic");
    await testAiModel(settings);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(settings.endpoint);
    expect(options).toMatchObject({ credentials: "omit", redirect: "error", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } });
    expect(JSON.parse(String(options?.body))).toEqual({ model: "selected-model", max_tokens: 4096, messages: [{ role: "user", content: prompt }] });
  });

  it.each(AI_PROVIDERS.filter(provider => provider.protocol === "openai-compatible"))("uses the selected $name endpoint/model with nonstream JSON mode and no token/reasoning caps", async provider => {
    reply(envelope("openai-compatible"));
    const endpoint = provider.endpoint || settingsFor("openai-compatible").endpoint;
    await testAiModel({ ...settingsFor("openai-compatible"), provider: provider.id, endpoint });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(endpoint);
    expect(options).toMatchObject({ credentials: "omit", redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } });
    expect(JSON.parse(String(options?.body))).toEqual({ model: "selected-model", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, stream: false });
  });

  describe.each(protocols)("%s protocol boundaries", protocol => {
    it.each(["not JSON", "```json\n{\"ok\":true}\n```", '{"ok":false}', '{"ok":"true"}', '{"ok":true,"extra":1}', "null", "[]", key])("rejects invalid actual output %s without exposing it", async content => {
      reply(envelope(protocol, content));
      const error = await testAiModel(settingsFor(protocol)).catch(cause => cause as Error);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("expected JSON reply");
      expect(String(error)).not.toContain(key);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it.each([{}, { error: key }])("rejects malformed/error envelopes", async data => {
      reply(data);
      await expect(testAiModel(settingsFor(protocol))).rejects.toThrow(/expected JSON reply/);
    });

    it.each([[401, /API key/], [403, /permissions/], [404, /HTTP 404/], [429, /quota/], [500, /HTTP 500/]] as const)("sanitizes HTTP %i without retries", async (status, message) => {
      reply({ error: key }, status);
      const result = testAiModel(settingsFor(protocol));
      await expect(result).rejects.toThrow(message);
      await expect(result).rejects.not.toThrow(key);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it.each([false, true])("bounds response to 64 KiB (advertised=%s)", async advertised => {
      const cancel = vi.fn();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode("é".repeat(32769))); }, cancel,
      }), { headers: advertised ? { "content-length": String(65537) } : {} })));
      await expect(testAiModel(settingsFor(protocol))).rejects.toThrow(/exceeded 64 KiB/);
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("accepts an exactly 64 KiB valid envelope", async () => {
      const json = JSON.stringify(envelope(protocol));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(json.padEnd(65536, " "))));
      expect(await testAiModel(settingsFor(protocol))).toEqual({ durationMs: expect.any(Number) });
    });

    it("aborts a stalled fetch at the overall 20-second deadline without retrying", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
      const result = testAiModel(settingsFor(protocol));
      const assertion = expect(result).rejects.toThrow(/timed out after 20 seconds/);
      await vi.advanceTimersByTimeAsync(19999);
      expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(["cancel", "timeout"])("%s also stops a stalled response body", async action => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel }))));
      const controller = new AbortController();
      const result = testAiModel(settingsFor(protocol), controller.signal);
      const assertion = expect(result).rejects.toThrow(action === "cancel" ? /cancelled/ : /timed out/);
      await vi.advanceTimersByTimeAsync(0);
      if (action === "cancel") controller.abort();
      else await vi.advanceTimersByTimeAsync(20000);
      await assertion;
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("does not fetch when already cancelled or when settings are invalid", async () => {
      vi.stubGlobal("fetch", vi.fn());
      const controller = new AbortController(); controller.abort();
      await expect(testAiModel(settingsFor(protocol), controller.signal)).rejects.toThrow(/cancelled/);
      await expect(testAiModel({ ...settingsFor(protocol), apiKey: "" })).rejects.toThrow(/API key/);
      await expect(testAiModel({ ...settingsFor(protocol), model: "" })).rejects.toThrow(/model/);
      await expect(testAiModel({ ...settingsFor(protocol), endpoint: "https://unsafe.test/?secret=1" })).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sanitizes network failures and never retries", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(key)));
      const result = testAiModel(settingsFor(protocol));
      await expect(result).rejects.toThrow(/CORS/);
      await expect(result).rejects.not.toThrow(key);
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  it.each([
    ["gemini", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"ok":true}' }] } }] }, /incomplete/],
    ["gemini", { candidates: [{ finishReason: "SAFETY" }] }, /blocked or refused/],
    ["gemini", { promptFeedback: { blockReason: key } }, /blocked or refused/],
    ["gemini", { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }, /blocked or refused/],
    ["anthropic", { stop_reason: "max_tokens", content: [{ type: "text", text: '{"ok":true}' }] }, /incomplete/],
    ["anthropic", { stop_reason: "refusal", content: [] }, /blocked or refused/],
    ["anthropic", { stop_reason: "tool_use", content: [] }, /expected JSON reply/],
    ["openai-compatible", { choices: [{ finish_reason: "length", message: { content: '{"ok":true}' } }] }, /incomplete/],
    ["openai-compatible", { choices: [{ finish_reason: "stop", message: { refusal: key, content: '{"ok":true}' } }] }, /blocked or refused/],
    ["openai-compatible", { choices: [{ finish_reason: "content_filter", message: {} }] }, /blocked or refused/],
    ["openai-compatible", { choices: [{ message: { content: '{"ok":true}' } }] }, /expected JSON reply/],
  ] as const)("rejects %s refusal/truncation/unfinished envelopes", async (protocol, payload, message) => {
    reply(payload);
    await expect(testAiModel(settingsFor(protocol))).rejects.toThrow(message);
  });
});
