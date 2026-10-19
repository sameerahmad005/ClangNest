import {
  DEFAULT_RUNNER_LIMITS,
  HARD_RUNNER_LIMITS,
  type CppRunnerRequest,
  type RunnerDiagnostic,
  type RunnerLimits,
} from "../../types/cpp-runner";

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

export interface LimitedText {
  text: string;
  bytes: number;
  truncated: boolean;
}

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

export function limitUtf8(value: string, maxBytes: number): LimitedText {
  const safeMax = Math.max(0, Math.floor(maxBytes));
  const encoded = utf8Encoder.encode(value);
  if (encoded.byteLength <= safeMax) return { text: value, bytes: encoded.byteLength, truncated: false };
  let end = safeMax;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end -= 1;
  const text = utf8Decoder.decode(encoded.slice(0, end));
  return { text, bytes: utf8ByteLength(text), truncated: true };
}

function boundedLimit(value: number | undefined, fallback: number, hardMax: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.min(Math.floor(value), hardMax));
}

export function normalizeRunnerLimits(limits?: Partial<RunnerLimits>): RunnerLimits {
  return {
    maxSourceBytes: boundedLimit(limits?.maxSourceBytes, DEFAULT_RUNNER_LIMITS.maxSourceBytes, HARD_RUNNER_LIMITS.maxSourceBytes),
    maxInputBytes: boundedLimit(limits?.maxInputBytes, DEFAULT_RUNNER_LIMITS.maxInputBytes, HARD_RUNNER_LIMITS.maxInputBytes),
    maxOutputBytes: boundedLimit(limits?.maxOutputBytes, DEFAULT_RUNNER_LIMITS.maxOutputBytes, HARD_RUNNER_LIMITS.maxOutputBytes),
    maxCompilerOutputBytes: boundedLimit(
      limits?.maxCompilerOutputBytes,
      DEFAULT_RUNNER_LIMITS.maxCompilerOutputBytes,
      HARD_RUNNER_LIMITS.maxCompilerOutputBytes,
    ),
    maxCompileTimeMs: boundedLimit(limits?.maxCompileTimeMs, DEFAULT_RUNNER_LIMITS.maxCompileTimeMs, HARD_RUNNER_LIMITS.maxCompileTimeMs),
    timeoutMs: boundedLimit(limits?.timeoutMs, DEFAULT_RUNNER_LIMITS.timeoutMs, HARD_RUNNER_LIMITS.timeoutMs),
  };
}

export interface RequestValidation {
  valid: boolean;
  reason?: string;
}

export function validateRunnerRequest(request: CppRunnerRequest, limits = normalizeRunnerLimits(request.limits)): RequestValidation {
  if (typeof request.source !== "string") return { valid: false, reason: "Source must be a string." };
  if (utf8ByteLength(request.source) > limits.maxSourceBytes) {
    return { valid: false, reason: `Source exceeds the ${limits.maxSourceBytes}-byte limit.` };
  }
  const stdin = request.stdin ?? "";
  if (utf8ByteLength(stdin) > limits.maxInputBytes) {
    return { valid: false, reason: `Input exceeds the ${limits.maxInputBytes}-byte limit.` };
  }
  return { valid: true };
}

const diagnosticPattern = /^(.*?):(\d+):(\d+):\s*(error|warning|note|remark):\s*(.*)$/;

export function parseDiagnostics(output: string): RunnerDiagnostic[] {
  return output.split(/\r?\n/).flatMap((raw): RunnerDiagnostic[] => {
    const match = diagnosticPattern.exec(raw.trim());
    if (!match) return [];
    const severity: RunnerDiagnostic["severity"] = match[4] === "remark" ? "info" : match[4] as RunnerDiagnostic["severity"];
    return [{
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      severity,
      message: match[5],
      raw,
    }];
  });
}
