import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiGenerationProgress, AiSettings } from "../../types/practice";
import { AI_PROVIDERS, DEFAULT_AI_SETTINGS, generateProblem, listAvailableModels, providerPreset } from "./index";

const fakeKey = "FAKE_TEST_KEY_NOT_A_CREDENTIAL";
const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, model: "test-generation-model", apiKey: fakeKey };
const problem = () => ({
  title: "Sum two integers", statement: "Print the sum of two integers.",
  inputFormat: "Two integers a and b.", outputFormat: "Their sum followed by a newline.", constraints: "-10 <= a, b <= 10",
  testCases: [
    { input: "2 3\n", expectedOutput: "5\n", explanation: "2 + 3 = 5." },
    { input: "-1 1\n", expectedOutput: "0\n", explanation: "-1 + 1 = 0." },
  ],
});
const gemini = (content: unknown = problem()) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof content === "string" ? content : JSON.stringify(content) }] } }] });
const reply = (payload: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status })));
const openai: AiSettings = { ...settings, provider: "openai-compatible", endpoint: "https://example.test/chat/completions" };
const deltaEvent = (content: string, finish_reason: string | null = null) => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason }] })}\n\n`;
const streamReply = (wire: string, close = false) => {
  const cancel = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(wire)); if (close) controller.close(); }, cancel,
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8" } })));
  return cancel;
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("AI provider requests", () => {
  it("uses an exact discovered Gemini model ID for generation instead of a guessed default", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: "models/current-provider-model", displayName: "Current provider model", supportedGenerationMethods: ["generateContent"] }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify(gemini()))));
    const connection = { ...settings, model: "" };
    const available = await listAvailableModels(connection);
    expect(available).toEqual([{ id: "current-provider-model", name: "Current provider model" }]);
    const result = await generateProblem({ ...connection, model: available[0].id }, "Arrays", "Easy");
    expect(result.testCases).toHaveLength(2);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toBe(`${settings.endpoint}/models/current-provider-model:generateContent`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a pasted full Gemini model URL before making a malformed request", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(generateProblem({ ...settings, endpoint: `${settings.endpoint}/models/old:generateContent` }, "Arrays", "Easy")).rejects.toThrow(/API base URL/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses Gemini's encoded model path, header authentication, JSON schema and a self-verification prompt", async () => {
    reply(gemini());
    const generated = await generateProblem({ ...settings, model: "models/special model" }, "Arrays", "Easy");
    expect(generated).toEqual({ ...problem(), topic: "Arrays", difficulty: "Easy" });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${settings.endpoint}/models/special%20model:generateContent`);
    expect(url).not.toContain(fakeKey);
    expect(options?.headers).toEqual({ "Content-Type": "application/json", "x-goog-api-key": fakeKey });
    expect(options).toMatchObject({ method: "POST", credentials: "omit", redirect: "error" });
    const body = JSON.parse(String(options?.body));
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseSchema: { properties: { testCases: { minItems: 2, maxItems: 2 } } } });
    expect(body.contents[0].parts[0].text).toMatch(/C\+\+23/);
    expect(body.contents[0].parts[0].text).toMatch(/EXACTLY TWO/);
    expect(body.contents[0].parts[0].text).toMatch(/self-verify/);
    expect(options?.body).not.toContain(fakeKey);
  });

  it("posts to the exact full OpenAI-compatible URL with Bearer authentication", async () => {
    reply({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(problem()) } }] });
    const endpoint = "https://example.test/custom/v1/chat/completions";
    await generateProblem({ ...settings, provider: "openai-compatible", endpoint }, "Graphs", "Hard");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(endpoint);
    expect(options?.headers).toEqual({ "Content-Type": "application/json", Authorization: `Bearer ${fakeKey}` });
    expect(JSON.parse(String(options?.body))).toMatchObject({ model: settings.model, response_format: { type: "json_object" }, messages: [{ role: "user" }], stream: true });
  });

  it.each(AI_PROVIDERS.filter(provider => provider.protocol === "openai-compatible" && provider.endpoint))("generates with $name using its configured full URL", async preset => {
    reply({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(problem()) } }] });
    await generateProblem({ ...settings, provider: preset.id, endpoint: preset.endpoint }, "Arrays", "Easy");
    expect(fetch).toHaveBeenCalledWith(preset.endpoint, expect.objectContaining({ headers: { "Content-Type": "application/json", Authorization: `Bearer ${fakeKey}` } }));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({ model: settings.model, response_format: { type: "json_object" } });
  });

  it("uses native Anthropic messages, ignores thinking blocks, and joins text blocks", async () => {
    const json = JSON.stringify(problem());
    reply({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "private reasoning" }, { type: "text", text: json.slice(0, 20) }, { type: "text", text: json.slice(20) }] });
    const preset = providerPreset("anthropic");
    expect(await generateProblem({ ...settings, provider: preset.id, endpoint: preset.endpoint }, "Arrays", "Easy")).toMatchObject(problem());
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(preset.endpoint);
    expect(options?.headers).toEqual({ "Content-Type": "application/json", "x-api-key": fakeKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({ max_tokens: 4096, model: settings.model, messages: [{ role: "user", content: expect.stringMatching(/Return only a JSON object/) }] });
    expect(body).not.toHaveProperty("response_format");
  });

  it.each(["max_tokens", "refusal"])("explains Anthropic %s stop reasons", async reason => {
    reply({ stop_reason: reason, content: [] });
    await expect(generateProblem({ ...settings, provider: "anthropic", endpoint: providerPreset("anthropic").endpoint }, "Arrays", "Easy")).rejects.toThrow(reason === "max_tokens" ? /incomplete/ : /refused/);
  });

  it("keeps two-case validation for native Anthropic", async () => {
    reply({ content: [{ type: "text", text: JSON.stringify({ ...problem(), testCases: [problem().testCases[0]] }) }] });
    await expect(generateProblem({ ...settings, provider: "anthropic", endpoint: providerPreset("anthropic").endpoint }, "Arrays", "Easy")).rejects.toThrow(/invalid problem/);
  });

  it("explains stale models and missing generation routes without exposing provider errors", async () => {
    reply({ error: fakeKey }, 404);
    const error = await generateProblem(settings, "Arrays", "Easy").catch(error => error as Error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/Refresh the model list/);
    expect(String(error)).not.toContain(fakeKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts fenced JSON, ignores model-selected metadata and preserves empty input/output", async () => {
    const data = { ...problem(), topic: "untrusted", difficulty: "untrusted" };
    data.testCases[0] = { input: "", expectedOutput: "", explanation: "No output is required." };
    reply(gemini(`\`\`\`json\n${JSON.stringify(data)}\n\`\`\``));
    expect(await generateProblem(settings, "Strings", "Medium")).toMatchObject({ topic: "Strings", difficulty: "Medium", testCases: [{ input: "", expectedOutput: "" }, {}] });
  });

  it.each([0, 1, 3])("rejects %i cases instead of exactly two", async count => {
    const data = problem();
    data.testCases = Array.from({ length: count }, () => data.testCases[0]);
    reply(gemini(data));
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(/invalid problem/);
  });

  it.each([
    { ...problem(), title: "" },
    { ...problem(), statement: 42 },
    { ...problem(), constraints: "x".repeat(4001) },
    { ...problem(), testCases: [{ expectedOutput: "", explanation: "missing input" }, problem().testCases[1]] },
    { ...problem(), testCases: [{ input: "", expectedOutput: null, explanation: "not a string" }, problem().testCases[1]] },
    { ...problem(), testCases: [{ input: "é".repeat(32769), expectedOutput: "", explanation: "UTF-8 overflow" }, problem().testCases[1]] },
    { ...problem(), testCases: [{ input: "", expectedOutput: "é".repeat(32769), explanation: "UTF-8 overflow" }, problem().testCases[1]] },
  ])("rejects untrusted malformed or oversized problem fields", async data => {
    reply(gemini(data));
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(/invalid problem/);
  });

  it.each([
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "SAFETY" }] },
  ])("explains Gemini blocked requests", async data => {
    reply(data);
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(/blocked or refused/);
  });

  it("explains OpenAI-compatible refusals", async () => {
    reply({ choices: [{ message: { refusal: "not shared", content: null } }] });
    await expect(generateProblem({ ...settings, provider: "openai-compatible", endpoint: "https://example.test/chat/completions" }, "Arrays", "Easy")).rejects.toThrow(/blocked or refused/);
  });

  it.each([gemini("not JSON"), {}, { candidates: [{ finishReason: "STOP", content: { parts: [] } }] }])("sanitizes malformed responses", async data => {
    reply(data);
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(/invalid problem/);
  });

  it("explains token-truncated responses", async () => {
    reply({ candidates: [{ finishReason: "MAX_TOKENS" }] });
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(/incomplete/);
  });

  it.each([[401, /API key/], [403, /permissions/], [429, /quota/], [500, /HTTP 500/]])("sanitizes HTTP %i without echoing the response", async (status, message) => {
    reply({ error: fakeKey }, status as number);
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(message as RegExp);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sanitizes CORS/network errors without leaking raw messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError(fakeKey)));
    const error = await generateProblem(settings, "Arrays", "Easy").catch(error => error as Error);
    if (!(error instanceof Error)) throw new Error("Expected a network error");
    expect(error.message).toMatch(/CORS/);
    expect(error.message).not.toContain(fakeKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects missing keys before making a request", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(generateProblem(DEFAULT_AI_SETTINGS, "Arrays", "Easy")).rejects.toThrow(/API key/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caps the full streamed response even without a content-length header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(128 * 1024 + 1))));
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(/too large/);
  });

  it("cancels oversized advertised responses before reading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-length": String(128 * 1024 + 1) } })));
    await expect(generateProblem(settings, "Arrays", "Easy")).rejects.toThrow(/too large/);
  });

  it("times out at 45 seconds and aborts the request without retrying", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const result = generateProblem(settings, "Arrays", "Easy");
    const assertion = expect(result).rejects.toThrow(/timed out after 45 seconds/);
    await vi.advanceTimersByTimeAsync(45000);
    await assertion;
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an in-flight request and removes its timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const controller = new AbortController();
    const result = generateProblem(settings, "Arrays", "Easy", controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow(/cancelled/);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a request when already cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const controller = new AbortController();
    controller.abort();
    await expect(generateProblem(settings, "Arrays", "Easy", controller.signal)).rejects.toThrow(/cancelled/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("generation progress and streamed validation", () => {
  it("streams the selected OpenRouter model with no token caps, reasoning overrides or extra requests", async () => {
    const text = JSON.stringify(problem());
    const cancel = streamReply(deltaEvent(text.slice(0, 25)) + deltaEvent(text.slice(25), "stop"));
    const progress = vi.fn();
    const preset = providerPreset("openrouter");
    expect(await generateProblem({ ...settings, provider: preset.id, endpoint: preset.endpoint }, "Arrays", "Easy", undefined, progress)).toMatchObject(problem());
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(preset.endpoint);
    expect(options).toMatchObject({ credentials: "omit", redirect: "error", headers: { Authorization: `Bearer ${fakeKey}` } });
    expect(JSON.parse(String(options?.body))).toEqual({ model: settings.model, stream: true, response_format: { type: "json_object" }, messages: [{ role: "user", content: expect.any(String) }] });
    expect(progress.mock.calls.map(([update]) => update)).toEqual([
      { phase: "waiting", receivedChars: 0, preview: "" },
      { phase: "receiving", receivedChars: 25, preview: text.slice(0, 25) },
      { phase: "receiving", receivedChars: text.length, preview: text },
      { phase: "validating", receivedChars: text.length, preview: text },
    ]);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(["gemini", "anthropic"] as const)("emits native %s phases without exposing thinking or fabricating a preview", async provider => {
    const text = JSON.stringify(problem());
    reply(provider === "gemini"
      ? { candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: fakeKey }, { text }] } }] }
      : { stop_reason: "end_turn", content: [{ type: "thinking", thinking: fakeKey }, { type: "text", text }] });
    const progress = vi.fn();
    await generateProblem({ ...settings, provider, endpoint: providerPreset(provider).endpoint }, "Arrays", "Easy", undefined, progress);
    expect(progress.mock.calls).toEqual([
      [{ phase: "waiting", receivedChars: 0, preview: "" }],
      [{ phase: "validating", receivedChars: 0, preview: "" }],
    ]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).not.toHaveProperty("stream");
  });

  it("keeps the bounded JSON fallback for servers that ignore stream:true", async () => {
    const text = JSON.stringify(problem());
    reply({ choices: [{ finish_reason: "stop", message: { content: text, reasoning: fakeKey } }] });
    const progress = vi.fn();
    expect(await generateProblem(openai, "Arrays", "Easy", undefined, progress)).toMatchObject(problem());
    expect(progress.mock.calls.map(([update]) => update.phase)).toEqual(["waiting", "receiving", "validating"]);
    expect(JSON.stringify(progress.mock.calls)).not.toContain(fakeKey);
  });

  it.each([0, 1, 3])("preserves exact-two-example validation for %i streamed examples", async count => {
    const text = JSON.stringify({ ...problem(), testCases: Array.from({ length: count }, () => problem().testCases[0]) });
    const cancel = streamReply(deltaEvent(text, "stop"));
    await expect(generateProblem(openai, "Arrays", "Easy")).rejects.toThrow(/invalid problem/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("never treats valid-looking content as complete without a stream terminal", async () => {
    streamReply(deltaEvent(JSON.stringify(problem())), true);
    const progress = vi.fn();
    await expect(generateProblem(openai, "Arrays", "Easy", undefined, progress)).rejects.toThrow(/truncated/);
    expect(progress.mock.calls.map(([update]) => update.phase)).toEqual(["waiting", "receiving"]);
  });

  it("isolates callback exceptions, including credential-bearing messages", async () => {
    streamReply(deltaEvent(JSON.stringify(problem()), "stop"));
    const progress = vi.fn(() => { throw new Error(fakeKey); });
    expect(await generateProblem(openai, "Arrays", "Easy", undefined, progress)).toMatchObject(problem());
    expect(progress).toHaveBeenCalledTimes(3);
  });

  it("suppresses all further progress and cancels when the consumer aborts during receiving", async () => {
    const cancel = streamReply(deltaEvent("{") + deltaEvent(JSON.stringify(problem()), "stop"));
    const controller = new AbortController();
    const updates: AiGenerationProgress[] = [];
    await expect(generateProblem(openai, "Arrays", "Easy", controller.signal, update => {
      updates.push(update);
      if (update.phase === "receiving") controller.abort();
    })).rejects.toThrow(/cancelled/);
    expect(updates.map(update => update.phase)).toEqual(["waiting", "receiving"]);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not fetch if the waiting callback cancels", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const controller = new AbortController();
    const progress = vi.fn(() => controller.abort());
    await expect(generateProblem(openai, "Arrays", "Easy", controller.signal, progress)).rejects.toThrow(/cancelled/);
    expect(fetch).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledOnce();
  });

  it("cancels an idle stream at the unchanged 45-second deadline without retrying", async () => {
    vi.useFakeTimers();
    const cancel = streamReply(": keepalive\n\n");
    const progress = vi.fn();
    const result = generateProblem(openai, "Arrays", "Easy", undefined, progress);
    const assertion = expect(result).rejects.toThrow(/timed out after 45 seconds/);
    await vi.advanceTimersByTimeAsync(45000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(progress.mock.calls.map(([update]) => update.phase)).toEqual(["waiting"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("demonstrates earlier preview, not faster completion, with a fixed payload and FAKE delays", async () => {
    vi.useFakeTimers();
    const text = JSON.stringify(problem());
    const baselineStart = Date.now();
    const baselineUpdates: { ms: number; phase: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => {
      setTimeout(() => resolve(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: text } }] }))), 1000);
    })));
    const baseline = generateProblem(openai, "Arrays", "Easy", undefined, update => baselineUpdates.push({ ms: Date.now() - baselineStart, phase: update.phase }));
    await vi.advanceTimersByTimeAsync(1000);
    const baselineResult = await baseline;

    const start = Date.now();
    const updates: { ms: number; progress: AiGenerationProgress }[] = [];
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        const send = (wire: string) => controller.enqueue(new TextEncoder().encode(wire));
        setTimeout(() => send(deltaEvent(text.slice(0, 25))), 100);
        setTimeout(() => send(deltaEvent(text.slice(25))), 600);
        setTimeout(() => send(deltaEvent("", "stop")), 1000);
      }, cancel,
    }), { headers: { "Content-Type": "text/event-stream" } })));
    let completed = false;
    const streamed = generateProblem(openai, "Arrays", "Easy", undefined, progress => updates.push({ ms: Date.now() - start, progress }));
    void streamed.then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(100);
    expect(updates.at(-1)).toEqual({ ms: 100, progress: { phase: "receiving", receivedChars: 25, preview: text.slice(0, 25) } });
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(899);
    expect(completed).toBe(false);
    expect(updates.some(update => update.progress.phase === "validating")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await streamed).toEqual(baselineResult);
    const firstBaseline = baselineUpdates.find(update => update.phase === "receiving")!.ms;
    const firstPreview = updates.find(update => update.progress.phase === "receiving")!.ms;
    const validated = updates.find(update => update.progress.phase === "validating")!.ms;
    expect({ firstBaseline, firstPreview, validated }).toEqual({ firstBaseline: 1000, firstPreview: 100, validated: 1000 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    console.info(`FAKE-delay timing (fixed identical problem; not live provider speed): JSON first content/completion=1000/1000ms; SSE first preview/completion=${firstPreview}/${validated}ms.`);
  });

  it("reduces local prompt bytes while retaining the problem contract", async () => {
    reply(gemini());
    await generateProblem(settings, "Arrays", "Easy");
    const prompt = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).contents[0].parts[0].text as string;
    const baseline = `Create one original Easy DSA programming problem about Arrays for C++23.
Use deterministic batch stdin/stdout only: no interaction, randomness, files, networking, or external libraries.
Return only a JSON object with title, statement, inputFormat, outputFormat, constraints, and testCases.
testCases must contain EXACTLY TWO objects, each with input, expectedOutput, and explanation strings.
Each case is an independent complete program invocation. Specify exact output formatting, use feasible constraints for a 3-second execution limit, and keep each input/output below 65536 UTF-8 bytes.
Manually work through BOTH examples and self-verify every expected output before responding. Explain the example result, but include no solution code or full algorithm solution.
Use plain text in all strings. An empty input or expected output is allowed when appropriate.`;
    const before = new TextEncoder().encode(baseline).length;
    const after = new TextEncoder().encode(prompt).length;
    expect(after).toBeLessThan(before);
    expect(prompt).toMatch(/short/);
    expect(prompt).toMatch(/EXACTLY TWO/);
    expect(prompt).toMatch(/self-verify/);
    console.info(`Local prompt bytes (Easy/Arrays): baseline=${before}, concise=${after}, saved=${before - after}.`);
  });
});
