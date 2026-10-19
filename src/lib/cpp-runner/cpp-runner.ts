import type { CppRunnerRequest, CppRunnerResult } from "../../types/cpp-runner";
import { normalizeRunnerLimits, parseDiagnostics, validateRunnerRequest } from "./runner-helpers";
import { DEFAULT_CPP_FLAGS } from "./standard";

export interface RunnerWorker {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message" | "error", listener: EventListener): void;
  removeEventListener(type: "message" | "error", listener: EventListener): void;
}

export interface CppRunnerOptions {
  workerFactory?: () => RunnerWorker;
}

function emptyResult(status: CppRunnerResult["status"], message = ""): CppRunnerResult {
  return {
    status,
    stdout: "",
    stderr: message,
    compileOutput: "",
    diagnostics: message ? parseDiagnostics(message) : [],
    exitCode: null,
    durationMs: 0,
    outputTruncated: false,
  };
}

export class CppRunner {
  private readonly workerFactory: () => RunnerWorker;
  private worker: RunnerWorker | undefined;
  private cancelActiveRun: (() => void) | undefined;

  constructor(options: CppRunnerOptions = {}) {
    this.workerFactory = options.workerFactory ?? (() => {
      if (typeof Worker === "undefined") throw new Error("Web Workers are not available in this environment");
      return new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" });
    });
  }

  run(request: CppRunnerRequest): Promise<CppRunnerResult> {
    if (this.cancelActiveRun) {
      return Promise.resolve(emptyResult("runtime-error", "A C++ run is already in progress."));
    }
    const limits = normalizeRunnerLimits(request.limits);
    const validation = validateRunnerRequest(request, limits);
    if (!validation.valid) return Promise.resolve(emptyResult("limit-exceeded", validation.reason));
    if (request.signal?.aborted) return Promise.resolve(emptyResult("cancelled"));

    let worker: RunnerWorker;
    try {
      worker = this.worker ??= this.workerFactory();
    } catch (error) {
      return Promise.resolve(emptyResult("runtime-error", error instanceof Error ? error.message : String(error)));
    }
    const startedAt = performance.now();
    return new Promise((resolve) => {
      let settled = false;
      let executing = false;
      let timeoutHandle: ReturnType<typeof setTimeout>;
      const finish = (result: CppRunnerResult, resetWorker = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        request.signal?.removeEventListener("abort", abort);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        this.cancelActiveRun = undefined;
        if (resetWorker) {
          if (this.worker === worker) this.worker = undefined;
          worker.terminate();
        }
        resolve({ ...result, durationMs: Math.max(result.durationMs, performance.now() - startedAt) });
      };
      const abort = () => {
        finish(emptyResult("cancelled"), true);
      };
      const timeout = () => {
        const stage = executing ? "Execution" : "Compilation";
        const limit = executing ? limits.timeoutMs : limits.maxCompileTimeMs;
        finish(emptyResult("timeout", `${stage} exceeded the ${limit} ms time limit.`), true);
      };
      const onMessage = (event: Event) => {
        const result = (event as MessageEvent<CppRunnerResult | { type: "phase"; phase: "execution" }>).data;
        if ("type" in result) {
          if (result.type === "phase" && result.phase === "execution" && !executing) {
            executing = true;
            clearTimeout(timeoutHandle);
            timeoutHandle = setTimeout(timeout, limits.timeoutMs);
          }
          return;
        }
        finish(result, result.status !== "success" && result.status !== "compile-error");
      };
      const onError = (event: Event) => {
        const message = (event as ErrorEvent).message || "Runner worker failed.";
        finish(emptyResult("runtime-error", message), true);
      };
      timeoutHandle = setTimeout(timeout, limits.maxCompileTimeMs);
      this.cancelActiveRun = abort;

      request.signal?.addEventListener("abort", abort, { once: true });
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      if (request.signal?.aborted) {
        abort();
        return;
      }
      try {
        worker.postMessage({
          source: request.source,
          stdin: request.stdin ?? "",
          fileName: request.fileName?.trim() || "main.cpp",
          flags: [...(request.flags ?? DEFAULT_CPP_FLAGS)],
          limits,
        });
      } catch (error) {
        finish(emptyResult("runtime-error", error instanceof Error ? error.message : String(error)), true);
      }
    });
  }

  dispose(): void {
    if (this.cancelActiveRun) {
      this.cancelActiveRun();
      return;
    }
    const worker = this.worker;
    this.worker = undefined;
    worker?.terminate();
  }
}

const defaultRunner = new CppRunner();

export function runCpp(request: CppRunnerRequest, options?: CppRunnerOptions): Promise<CppRunnerResult> {
  return (options ? new CppRunner(options) : defaultRunner).run(request);
}
