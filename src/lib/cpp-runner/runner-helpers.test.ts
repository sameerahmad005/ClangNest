import { describe, expect, it } from "vitest";
import { HARD_RUNNER_LIMITS } from "../../types/cpp-runner";

// Keep the helper imports explicit through the public cpp-runner barrel below.
import {
  normalizeRunnerLimits as normalize,
  parseDiagnostics as parse,
  limitUtf8 as limit,
  validateRunnerRequest as validate,
} from "./runner-helpers";

describe("runner helpers", () => {
  it("caps caller-provided limits at the hard safety ceiling", () => {
    expect(normalize({ timeoutMs: Number.MAX_SAFE_INTEGER }).timeoutMs).toBe(HARD_RUNNER_LIMITS.timeoutMs);
    expect(normalize({ maxSourceBytes: Number.MAX_SAFE_INTEGER }).maxSourceBytes).toBe(
      HARD_RUNNER_LIMITS.maxSourceBytes,
    );
  });

  it("limits UTF-8 output without splitting a multibyte character", () => {
    const limited = limit("A🙂B", 5);
    expect(limited.text).toBe("A🙂");
    expect(limited.truncated).toBe(true);
  });

  it("extracts clang diagnostics and rejects oversized source", () => {
    expect(parse("main.cpp:4:7: error: expected ';'")[0]).toMatchObject({
      file: "main.cpp",
      line: 4,
      column: 7,
      severity: "error",
    });
    expect(parse("main.cpp:1:1: warning: unused variable")[0]?.severity).toBe("warning");
    expect(validate({ source: "12345" }, { maxSourceBytes: 4, maxInputBytes: 10, maxOutputBytes: 10, maxCompilerOutputBytes: 10, maxCompileTimeMs: 10, timeoutMs: 1 }).valid).toBe(false);
    expect(validate({ source: "ok" }).valid).toBe(true);
  });
});
