import { describe, expect, it, vi } from "vitest";
import { readProblemStream } from "./stream";

const encoder = new TextEncoder();
const secret = "FAKE_PRIVATE_ERROR_OR_REASONING";
const event = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
function transport(parts: (string | Uint8Array)[], close = false, headers: Record<string, string> = {}) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(typeof part === "string" ? encoder.encode(part) : part);
      if (close) controller.close();
    },
    cancel,
  });
  return { response: new Response(body, { headers: { "Content-Type": "text/event-stream", ...headers } }), cancel };
}
const read = (response: Response, onContent = vi.fn()) => readProblemStream(response, new AbortController().signal, onContent);

describe("bounded OpenAI-compatible SSE", () => {
  it("handles one-byte UTF-8/CRLF splits, multiline data, comments and SSE fields", async () => {
    const wire = `: keepalive\r\nid: 1\r\nretry: 1000\r\nevent: message\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"é🙂"},"finish_reason":null}]}\r\n\r\n${event({ content: " answer" })}data:[DONE]\r\n\r\n`;
    const parts = Array.from(encoder.encode(wire), byte => new Uint8Array([byte]));
    const { response, cancel } = transport(parts);
    const previews = vi.fn();
    expect(await read(response, previews)).toBe("é🙂 answer");
    expect(previews.mock.calls).toEqual([["é🙂"], ["é🙂 answer"]]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("ignores reasoning, tool, prompt, credential and usage metadata", async () => {
    const { response } = transport([
      `data: ${JSON.stringify({ prompt: secret, api_key: secret, choices: [{ delta: { role: "assistant", reasoning: secret, reasoning_content: secret, reasoning_details: [{ text: secret }], tool_calls: [{ function: { arguments: secret } }] } }] })}\n\n`,
      'data: {"choices":[],"usage":{"completion_tokens":50}}\n\n',
      event({ content: "answer" }, "stop"),
    ]);
    const previews = vi.fn();
    expect(await read(response, previews)).toBe("answer");
    expect(previews.mock.calls).toEqual([["answer"]]);
  });

  it("accepts terminal stop without waiting for DONE and ignores subsequent deltas", async () => {
    const { response, cancel } = transport([event({ content: "answer" }, "stop") + event({ content: secret })]);
    const previews = vi.fn();
    expect(await read(response, previews)).toBe("answer");
    expect(previews.mock.calls).toEqual([["answer"]]);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts a separate terminal finish_reason with no content delta", async () => {
    const { response } = transport([event({ content: "answer" }), 'data: {"choices":[{"finish_reason":"stop"}]}\n\n']);
    expect(await read(response)).toBe("answer");
  });

  it.each([
    event({ content: "answer" }),
    event({ content: "answer" }).trimEnd(),
    event({ content: "answer" }, "stop").trimEnd(),
    "data: not-json\n\n",
    "data: {}\n\n",
    "data: [DONE]\n\n",
    event({ content: { text: secret } }),
    event({ content: "answer" }, "tool_calls"),
  ])("rejects malformed/truncated streams without reflecting their payload", async wire => {
    const { response } = transport([wire], true);
    const error = await read(response).catch(error => error as Error);
    expect(String(error)).toMatch(/invalid or truncated/);
    expect(String(error)).not.toContain(secret);
    expect(response.body?.locked).toBe(false);
  });

  it.each([
    [event({}, "length"), /incomplete/],
    [event({}, "content_filter"), /blocked or refused/],
    [event({}, "refusal"), /blocked or refused/],
    [event({ refusal: secret }), /blocked or refused/],
    [`data: ${JSON.stringify({ error: { message: secret } })}\n\n`, /generation error/],
    [`event: error\ndata: ${secret}\n\n`, /generation error/],
  ])("cancels and sanitizes provider error/termination events", async (wire, expected) => {
    const { response, cancel } = transport([wire as string]);
    const previews = vi.fn();
    const error = await read(response, previews).catch(error => error as Error);
    expect(String(error)).toMatch(expected as RegExp);
    expect(String(error)).not.toContain(secret);
    expect(cancel).toHaveBeenCalledOnce();
    expect(previews).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 and cancels the reader", async () => {
    const { response, cancel } = transport([new Uint8Array([0xc3, 0x28])]);
    await expect(read(response)).rejects.toThrow(/invalid or truncated/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds accumulated UTF-8 answer bytes across deltas independently of wire size", async () => {
    const { response, cancel } = transport([event({ content: "é".repeat(32768) }), event({ content: "é".repeat(32769) })]);
    const previews = vi.fn();
    await expect(read(response, previews)).rejects.toThrow(/too large/);
    expect(previews).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledOnce();
    const boundary = transport([event({ content: "x".repeat(128 * 1024) }, "stop")]);
    expect((await read(boundary.response)).length).toBe(128 * 1024);
  });

  it("bounds all wire bytes including keepalives and reasoning envelopes", async () => {
    for (const wire of [":" + "x".repeat(1024 * 1024), event({ reasoning: "x".repeat(1024 * 1024) })]) {
      const { response, cancel } = transport([wire]);
      const previews = vi.fn();
      await expect(read(response, previews)).rejects.toThrow(/too large/);
      expect(cancel).toHaveBeenCalledOnce();
      expect(previews).not.toHaveBeenCalled();
    }
  });

  it("enforces the cumulative wire limit across individually small keepalives", async () => {
    const keepalive = ":" + "x".repeat(1022) + "\n";
    const { response, cancel } = transport([...Array<string>(1024).fill(keepalive), event({ content: "answer" }, "stop")]);
    const previews = vi.fn();
    await expect(read(response, previews)).rejects.toThrow(/too large/);
    expect(previews).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects oversized advertised wire lengths before taking a reader", async () => {
    const { response, cancel } = transport([], false, { "content-length": String(1024 * 1024 + 1) });
    await expect(read(response)).rejects.toThrow(/too large/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels pending reads on abort and never emits later content", async () => {
    const cancel = vi.fn();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; }, cancel }));
    const controller = new AbortController();
    const previews = vi.fn();
    const result = readProblemStream(response, controller.signal, previews);
    controller.abort();
    await expect(result).rejects.toThrow(/cancelled/);
    expect(cancel).toHaveBeenCalledOnce();
    expect(previews).not.toHaveBeenCalled();
    expect(() => source.enqueue(encoder.encode(event({ content: secret })))).toThrow();
    expect(response.body?.locked).toBe(false);
  });
});
