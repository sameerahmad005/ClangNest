import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "../../types/practice";
import { AI_PROVIDERS, DEFAULT_AI_SETTINGS, listAvailableModels, providerPreset } from "./index";

const fakeKey = "FAKE_TEST_KEY_NOT_A_CREDENTIAL";
const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, apiKey: fakeKey };
const json = (payload: unknown, init?: ResponseInit) => new Response(JSON.stringify(payload), init);
const response = (payload: unknown, init?: ResponseInit) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(payload, init)));
const forProvider = (provider: AiSettings["provider"]): AiSettings => ({ ...settings, provider, endpoint: providerPreset(provider).endpoint || "https://example.test/v1/chat/completions" });
const geminiModel = (name: string, methods = ["generateContent"]) => ({ name: `models/${name}`, displayName: `Display ${name}`, supportedGenerationMethods: methods });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("live provider model discovery", () => {
  it("loads all Gemini pages, filters non-generation models, normalizes prefixes, deduplicates and sorts", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ models: [geminiModel("z"), geminiModel("embedding", ["embedContent"])], nextPageToken: "opaque +/token" }))
      .mockResolvedValueOnce(json({ models: [geminiModel("a"), geminiModel("z")] })));
    expect(await listAvailableModels(settings)).toEqual([{ id: "a", name: "Display a" }, { id: "z", name: "Display z" }]);
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(new URL(String(calls[0][0])).pathname).toBe("/v1beta/models");
    expect(new URL(String(calls[1][0])).searchParams.get("pageToken")).toBe("opaque +/token");
    for (const [url, options] of calls) {
      expect(String(url)).not.toContain(fakeKey);
      expect(options).toMatchObject({ method: "GET", headers: { "x-goog-api-key": fakeKey }, credentials: "omit", redirect: "error" });
      expect(options?.body).toBeUndefined();
    }
  });

  it.each(AI_PROVIDERS.filter(preset => preset.protocol === "openai-compatible"))("derives $id models URL and uses Bearer authentication without requiring a model", async preset => {
    response({ data: [{ id: "listed-only", name: "Listed model" }] });
    const config = forProvider(preset.id);
    expect(await listAvailableModels(config)).toEqual([{ id: "listed-only", name: "Listed model", ...(preset.id === "openrouter" ? { pricingCategory: "unknown" } : {}) }]);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(config.endpoint.replace(/\/chat\/completions$/, "/models"));
    expect(options?.headers).toEqual({ Authorization: `Bearer ${fakeKey}` });
    expect(options).toMatchObject({ credentials: "omit", redirect: "error" });
  });

  describe("OpenRouter pricing metadata", () => {
    it.each([
      ["zero token prices", { prompt: "0", completion: "0.000" }, "free"],
      ["scientific zero prices", { prompt: "0e-1000", completion: "0.0E+10" }, "free"],
      ["zero optional prices", { prompt: "0", completion: "0", request: "0", internal_reasoning: "0.0" }, "free"],
      ["prompt charge", { prompt: "0.000001", completion: "0" }, "paid"],
      ["completion charge", { prompt: "0", completion: "2.5E-6" }, "paid"],
      ["decimal variants", { prompt: ".001", completion: "1." }, "paid"],
      ["positive exponent", { prompt: "1e+2", completion: "0" }, "paid"],
      ["smallest positive double", { prompt: "5e-324", completion: "0" }, "paid"],
      ["request charge", { prompt: "0", completion: "0", request: "0.01" }, "paid"],
      ["reasoning charge", { prompt: "0", completion: "0", internal_reasoning: "1e-6" }, "paid"],
      ["unrelated media charges", { prompt: "0", completion: "0", image: "0.1", image_output: "1", image_token: "1", audio: "1", audio_output: "1", input_audio_cache: "1" }, "free"],
      ["missing pricing", undefined, "unknown"],
      ["null pricing", null, "unknown"],
      ["array pricing", [], "unknown"],
      ["string pricing", "0", "unknown"],
      ["missing both token prices", {}, "unknown"],
      ["missing prompt", { completion: "0" }, "unknown"],
      ["missing completion", { prompt: "0" }, "unknown"],
      ["charge with missing completion", { prompt: "0.01" }, "unknown"],
      ["charge with malformed reasoning", { prompt: "0.01", completion: "0", internal_reasoning: "bad" }, "unknown"],
    ])("classifies %s", async (_label, pricing, category) => {
      response({ data: [{ id: "provider/model", pricing }] });
      expect(await listAvailableModels(forProvider("openrouter"))).toEqual([
        { id: "provider/model", name: "provider/model", pricingCategory: category },
      ]);
    });

    describe.each(["prompt", "completion", "request", "internal_reasoning"])("invalid %s price", field => {
      it.each(["", " ", true, false, null, 0, 0.01, [], {}, "-0.01", "-1", "NaN", "Infinity", "1e309", "0x0", "0x10", "0b0", "0o0", "1e-1000", "1.0e-999", "1usd", "1e", "1 0"])("returns unknown for %j", async invalid => {
        response({ data: [{ id: "provider/model", pricing: { prompt: "0", completion: "0", [field]: invalid } }] });
        expect(await listAvailableModels(forProvider("openrouter"))).toEqual([
          { id: "provider/model", name: "provider/model", pricingCategory: "unknown" },
        ]);
      });
    });

    it.each([
      ["provider/model:free", "Free model", { prompt: "0.01", completion: "0" }, "paid"],
      ["provider/model:free", "Free model", undefined, "unknown"],
      ["provider/model:free", "Free model", { prompt: "0", completion: "bad" }, "unknown"],
      ["provider/paid-model", "Paid model", { prompt: "0", completion: "0" }, "free"],
    ])("uses pricing rather than the ID/name of %s", async (id, name, pricing, category) => {
      response({ data: [{ id, name, pricing }] });
      expect(await listAvailableModels(forProvider("openrouter"))).toEqual([{ id, name, pricingCategory: category }]);
    });
  });

  it.each(AI_PROVIDERS.filter(preset => preset.id !== "openrouter"))("does not add pricing metadata for $id", async preset => {
    const item = { id: "provider/model:free", ...geminiModel("provider/model:free"), pricing: { prompt: "0.01", completion: "0" } };
    response(preset.protocol === "gemini" ? { models: [item] } : { data: [item] });
    expect(await listAvailableModels(forProvider(preset.id))).toEqual([
      { id: "provider/model:free", name: "Display provider/model:free" },
    ]);
  });

  it("uses native Anthropic headers and after_id pagination from the same configured route", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "native-b", display_name: "Native B" }], has_more: true, last_id: "cursor-b", next_url: `https://untrusted.test/${fakeKey}` }))
      .mockResolvedValueOnce(json({ data: [{ id: "native-a", display_name: "Native A" }], has_more: false })));
    expect(await listAvailableModels(forProvider("anthropic"))).toEqual([{ id: "native-a", name: "Native A" }, { id: "native-b", name: "Native B" }]);
    const calls = vi.mocked(fetch).mock.calls;
    expect(new URL(String(calls[0][0])).pathname).toBe("/v1/models");
    expect(new URL(String(calls[1][0])).searchParams.get("after_id")).toBe("cursor-b");
    for (const [url, options] of calls) {
      expect(new URL(String(url)).origin).toBe("https://api.anthropic.com");
      expect(options?.headers).toEqual({ "x-api-key": fakeKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
    }
  });

  it("supports OpenAI has_more/last_id without following response next URLs", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "first" }], has_more: true, last_id: "https://untrusted.test/next", next: "https://untrusted.test/next" }))
      .mockResolvedValueOnce(json({ data: [{ id: "second" }], has_more: false })));
    expect(await listAvailableModels(forProvider("openai"))).toHaveLength(2);
    const url = new URL(String(vi.mocked(fetch).mock.calls[1][0]));
    expect(url.origin).toBe("https://api.openai.com");
    expect(url.pathname).toBe("/v1/models");
    expect(url.searchParams.get("after")).toBe("https://untrusted.test/next");
  });

  it("uses the last listed ID when an OpenAI page has_more without last_id", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "first" }], has_more: true }))
      .mockResolvedValueOnce(json({ data: [{ id: "second" }] })));
    await listAvailableModels(forProvider("openai"));
    expect(new URL(String(vi.mocked(fetch).mock.calls[1][0])).searchParams.get("after")).toBe("first");
  });

  it("accepts Together's top-level array without fabricating model IDs or filtering arbitrary provider IDs", async () => {
    response([{ id: "provider/model", display_name: "Provider Model" }, { id: "provider/embedding" }]);
    expect(await listAvailableModels(forProvider("together"))).toEqual([{ id: "provider/embedding", name: "provider/embedding" }, { id: "provider/model", name: "Provider Model" }]);
  });

  it("uses a user-configured models endpoint exactly, including custom origin and path", async () => {
    response({ data: [{ id: "listed" }] });
    await listAvailableModels({ ...forProvider("openai-compatible"), modelsEndpoint: "https://models.example.test/private/list" });
    expect(fetch).toHaveBeenCalledWith("https://models.example.test/private/list", expect.objectContaining({ headers: { Authorization: `Bearer ${fakeKey}` } }));
  });

  it.each([[401, /API key/], [403, /permissions/], [429, /quota/], [404, /models route.*custom models URL/], [500, /HTTP 500/]])("sanitizes HTTP %i failures and does not retry", async (status, message) => {
    response({ error: fakeKey }, { status: status as number });
    const error = await listAvailableModels(settings).catch(error => error);
    expect(String(error)).toMatch(message as RegExp);
    expect(String(error)).not.toContain(fakeKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("explains CORS errors without exposing raw errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(fakeKey)));
    const error = await listAvailableModels(settings).catch(error => error);
    expect(String(error)).toMatch(/CORS/);
    expect(String(error)).not.toContain(fakeKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{ models: [] }, { models: [geminiModel("embedding", ["embedContent"])] }])("explains empty compatible lists and never returns a static fallback", async payload => {
    response(payload);
    await expect(listAvailableModels(settings)).rejects.toThrow(/No compatible generation models/);
  });

  it.each([{}, { models: "bad" }, { models: [null] }, { models: [geminiModel("")] }, { models: [], nextPageToken: 123 }])("rejects invalid provider responses", async payload => {
    response(payload);
    await expect(listAvailableModels(settings)).rejects.toThrow(/invalid model list/);
  });

  it("rejects malformed JSON instead of exposing its content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(fakeKey)));
    await expect(listAvailableModels(settings)).rejects.toThrow(/invalid model list/);
  });

  it("requires keys and validates custom URL security before fetching", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(listAvailableModels(DEFAULT_AI_SETTINGS)).rejects.toThrow(/API key/);
    await expect(listAvailableModels({ ...settings, modelsEndpoint: `https://models.example.test/?key=${fakeKey}` })).rejects.toThrow(/without credentials, query/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels an oversized declared response before reading", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { headers: { "content-length": String(2 * 1024 * 1024 + 1) } })));
    await expect(listAvailableModels(settings)).rejects.toThrow(/exceeded.*2 MiB/);
    expect(cancel).toHaveBeenCalled();
  });

  it("bounds streamed bytes even when no content-length is supplied", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(2 * 1024 * 1024 + 1))));
    await expect(listAvailableModels(settings)).rejects.toThrow(/exceeded/);
  });

  it("applies the byte budget across pages, not separately to each page", async () => {
    const padding = " ".repeat(1100 * 1024);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "first" }], has_more: true, last_id: "first" }) + padding))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "second" }] }) + padding)));
    await expect(listAvailableModels(forProvider("openai"))).rejects.toThrow(/2 MiB/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds the model count without silently truncating or returning partial pages", async () => {
    response({ data: Array.from({ length: 5001 }, (_, index) => ({ id: `test-${index}` })) });
    await expect(listAvailableModels(forProvider("openai"))).rejects.toThrow(/5000 models/);
  });

  it("bounds pages without silently returning a partial list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      const count = vi.mocked(fetch).mock.calls.length;
      return json({ data: [{ id: `test-${count}` }], has_more: true, last_id: `cursor-${count}` });
    }));
    await expect(listAvailableModels(forProvider("openai"))).rejects.toThrow(/50 pages/);
    expect(fetch).toHaveBeenCalledTimes(50);
  });

  it("rejects repeated cursors rather than looping or silently returning partial data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json({ models: [geminiModel("one")], nextPageToken: "repeated" })));
    await expect(listAvailableModels(settings)).rejects.toThrow(/repeated.*page/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects pre-cancelled requests without fetching", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const controller = new AbortController();
    controller.abort();
    await expect(listAvailableModels(settings, controller.signal)).rejects.toThrow(/cancelled/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels in-flight fetches even if the implementation does not reject on abort", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const controller = new AbortController();
    const result = listAvailableModels(settings, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow(/cancelled/);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not process a late fetch response or request another page after cancellation", async () => {
    let complete: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>(resolve => { complete = resolve; })));
    const controller = new AbortController();
    const result = listAvailableModels(settings, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow(/cancelled/);
    const cancel = vi.fn();
    complete(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cancels a stalled response stream", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const controller = new AbortController();
    const result = listAvailableModels(settings, controller.signal);
    await vi.waitFor(() => expect(vi.mocked(fetch).mock.results[0].type).toBe("return"));
    controller.abort();
    await expect(result).rejects.toThrow(/cancelled/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("times out the entire listing after 30 seconds without retrying", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const result = listAvailableModels(settings);
    const assertion = expect(result).rejects.toThrow(/timed out after 30 seconds/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reset the 30-second deadline for subsequent pages", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => setTimeout(() => resolve(json({ models: [geminiModel("first")], nextPageToken: "next" })), 20_000)))
      .mockImplementationOnce(() => new Promise(() => {})));
    const result = listAvailableModels(settings);
    const assertion = expect(result).rejects.toThrow(/timed out after 30 seconds/);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(vi.mocked(fetch).mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
