import { DEFAULT_RUNNER_LIMITS } from "../../types/cpp-runner";
import { CPP_STANDARD } from "../cpp-runner/standard";
import { DIFFICULTIES, DSA_TOPICS, type AiGenerationProgress, type AiSettings, type Difficulty, type DsaTopic, type PracticeCase, type PracticeProblem } from "../../types/practice";
import { validateAiSettings } from "./settings";
import { normalizeGeminiModel, providerPreset } from "./catalog";
import { boundedJson, checkResponse, ProviderError, providerHeaders, providerRequest } from "./transport";
import { readProblemStream } from "./stream";

const MAX_RESPONSE_BYTES = 128 * 1024;
const TIMEOUT_MS = 45_000;
const encoder = new TextEncoder();
const MALFORMED = "The provider returned an invalid problem. Try generating again or choose another model.";

const problemSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    statement: { type: "STRING" },
    inputFormat: { type: "STRING" },
    outputFormat: { type: "STRING" },
    constraints: { type: "STRING" },
    testCases: {
      type: "ARRAY", minItems: 2, maxItems: 2,
      items: {
        type: "OBJECT",
        properties: { input: { type: "STRING" }, expectedOutput: { type: "STRING" }, explanation: { type: "STRING" } },
        required: ["input", "expectedOutput", "explanation"],
      },
    },
  },
  required: ["title", "statement", "inputFormat", "outputFormat", "constraints", "testCases"],
};

function promptFor(topic: DsaTopic, difficulty: Difficulty): string {
  return `Create an original ${difficulty} ${topic} problem for ${CPP_STANDARD}. Keep prose and examples short.
Use deterministic batch stdin/stdout; no interaction, randomness, files, network or external libraries.
Return only a JSON object with plain-text strings: title, statement, inputFormat, outputFormat, constraints; and testCases: EXACTLY TWO objects with input, expectedOutput, explanation strings.
Each example is a complete independent run. Specify exact stdout formatting and feasible constraints for 3 seconds. Each input/output must be below 65536 UTF-8 bytes; empty is allowed.
Work through BOTH examples and self-verify their outputs. Explain each result briefly; no solution code or algorithm solution.`;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError(MALFORMED);
  return value as Record<string, unknown>;
}

function field(value: unknown, maxBytes: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maxBytes || encoder.encode(value).byteLength > maxBytes) {
    throw new ProviderError(MALFORMED);
  }
  return value;
}

function parseProblem(text: string, topic: DsaTopic, difficulty: Difficulty): PracticeProblem {
  const fenced = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  let parsed: unknown;
  try { parsed = JSON.parse(fenced ? fenced[1] : text); } catch { throw new ProviderError(MALFORMED); }
  const data = record(parsed);
  if (!Array.isArray(data.testCases) || data.testCases.length !== 2) throw new ProviderError(MALFORMED);
  const testCases = data.testCases.map((item): PracticeCase => {
    const test = record(item);
    return {
      input: field(test.input, DEFAULT_RUNNER_LIMITS.maxInputBytes, true),
      expectedOutput: field(test.expectedOutput, DEFAULT_RUNNER_LIMITS.maxOutputBytes, true),
      explanation: field(test.explanation, 4000),
    };
  }) as [PracticeCase, PracticeCase];
  return {
    title: field(data.title, 240), topic, difficulty,
    statement: field(data.statement, 16000),
    inputFormat: field(data.inputFormat, 4000),
    outputFormat: field(data.outputFormat, 4000),
    constraints: field(data.constraints, 4000), testCases,
  };
}

function providerText(raw: unknown, protocol: "gemini" | "anthropic" | "openai-compatible"): string {
  const data = record(raw);
  const blocked = "The provider blocked or refused this request. Try another topic or model.";
  if (protocol === "gemini") {
    if (data.promptFeedback && record(data.promptFeedback).blockReason) throw new ProviderError(blocked);
    if (!Array.isArray(data.candidates) || !data.candidates.length) throw new ProviderError(MALFORMED);
    const candidate = record(data.candidates[0]);
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      throw new ProviderError(candidate.finishReason === "MAX_TOKENS" ? "The provider response was incomplete. Try another model or generate again." : blocked);
    }
    const content = record(candidate.content);
    if (!Array.isArray(content.parts)) throw new ProviderError(MALFORMED);
    return content.parts.filter(part => record(part).thought !== true).map(part => field(record(part).text, MAX_RESPONSE_BYTES, true)).join("");
  }
  if (protocol === "anthropic") {
    if (data.stop_reason === "max_tokens") throw new ProviderError("The provider response was incomplete. Try another model or generate again.");
    if (data.stop_reason === "refusal") throw new ProviderError(blocked);
    if (!Array.isArray(data.content)) throw new ProviderError(MALFORMED);
    return data.content.filter(part => record(part).type === "text").map(part => field(record(part).text, MAX_RESPONSE_BYTES, true)).join("");
  }
  if (!Array.isArray(data.choices) || !data.choices.length) throw new ProviderError(MALFORMED);
  const choice = record(data.choices[0]);
  const message = record(choice.message);
  if (message.refusal || choice.finish_reason === "content_filter") throw new ProviderError(blocked);
  if (choice.finish_reason === "length") throw new ProviderError("The provider response was incomplete. Try another model or generate again.");
  return field(message.content, MAX_RESPONSE_BYTES);
}

export async function generateProblem(settings: AiSettings, topic: DsaTopic, difficulty: Difficulty, signal?: AbortSignal, onProgress?: (progress: AiGenerationProgress) => void): Promise<PracticeProblem> {
  validateAiSettings(settings);
  if (!DSA_TOPICS.includes(topic) || !DIFFICULTIES.includes(difficulty)) throw new Error("Choose a supported topic and difficulty.");
  const protocol = providerPreset(settings.provider).protocol;
  const gemini = protocol === "gemini";
  const prompt = promptFor(topic, difficulty);
  const url = gemini ? `${settings.endpoint.replace(/\/+$/, "")}/models/${encodeURIComponent(normalizeGeminiModel(settings.model))}:generateContent` : settings.endpoint;
  const headers = { "Content-Type": "application/json", ...providerHeaders(settings) };
  const body = gemini ? {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: problemSchema },
  } : protocol === "anthropic" ? {
    model: settings.model.trim(), max_tokens: 4096, messages: [{ role: "user", content: prompt }],
  } : {
    model: settings.model.trim(), messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, stream: true,
  };
  return providerRequest("Problem generation", TIMEOUT_MS, signal, async requestSignal => {
    const progress = (phase: AiGenerationProgress["phase"], preview = "") => {
      if (requestSignal.aborted) return;
      try { onProgress?.({ phase, receivedChars: preview.length, preview }); } catch { /* UI callbacks cannot expose errors or interrupt transport cleanup. */ }
    };
    const assertActive = () => { if (requestSignal.aborted) throw new ProviderError("Problem generation was cancelled."); };
    progress("waiting");
    assertActive();
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: requestSignal, credentials: "omit", redirect: "error" });
    if (requestSignal.aborted) { void response.body?.cancel().catch(() => {}); throw new ProviderError("Problem generation was cancelled."); }
    checkResponse(response);
    let text: string;
    if (protocol === "openai-compatible" && response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "text/event-stream") {
      text = await readProblemStream(response, requestSignal, content => progress("receiving", content));
    } else {
      const { data } = await boundedJson(response, MAX_RESPONSE_BYTES, "The provider response was too large. Try generating a smaller problem.", MALFORMED, requestSignal);
      assertActive();
      text = providerText(data, protocol);
      if (protocol === "openai-compatible") progress("receiving", text);
    }
    assertActive();
    progress("validating", protocol === "openai-compatible" ? text : "");
    assertActive();
    return parseProblem(text, topic, difficulty);
  });
}
