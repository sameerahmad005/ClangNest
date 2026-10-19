export const DEFAULT_RUNNER_LIMITS = {
  maxSourceBytes: 256 * 1024,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
  maxCompilerOutputBytes: 64 * 1024,
  maxCompileTimeMs: 30_000,
  timeoutMs: 3_000,
} as const;

export const HARD_RUNNER_LIMITS = {
  maxSourceBytes: 512 * 1024,
  maxInputBytes: 256 * 1024,
  maxOutputBytes: 256 * 1024,
  maxCompilerOutputBytes: 256 * 1024,
  maxCompileTimeMs: 30_000,
  timeoutMs: 30_000,
} as const;

export type RunnerStatus =
  | "success"
  | "compile-error"
  | "runtime-error"
  | "timeout"
  | "cancelled"
  | "limit-exceeded";

export interface RunnerLimits {
  maxSourceBytes: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxCompilerOutputBytes: number;
  maxCompileTimeMs: number;
  timeoutMs: number;
}

export interface CppRunnerRequest {
  source: string;
  stdin?: string;
  fileName?: string;
  flags?: readonly string[];
  limits?: Partial<RunnerLimits>;
  signal?: AbortSignal;
}

export interface RunnerDiagnostic {
  severity: "error" | "warning" | "note" | "info";
  message: string;
  file?: string;
  line?: number;
  column?: number;
  raw: string;
}

export interface CppRunnerResult {
  status: RunnerStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  diagnostics: RunnerDiagnostic[];
  exitCode: number | null;
  durationMs: number;
  outputTruncated: boolean;
}
