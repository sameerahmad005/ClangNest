import { describe, expect, it, vi } from "vitest";
import { evaluateCase, normalizeOutput, runPracticeTests } from "./practice-evaluator";
import type { CppRunnerResult } from "../types/cpp-runner";

const success = (stdout: string): CppRunnerResult => ({ status: "success", stdout, stderr: "", compileOutput: "", diagnostics: [], exitCode: 0, durationMs: 1, outputTruncated: false });
const cases = [
  { input: "5 9\n", expectedOutput: "14", explanation: "Sum" },
  { input: "20 22\n", expectedOutput: "42\n", explanation: "Another sum" },
];

describe("practice output comparison", () => {
  it("ignores CRLF, trailing spaces and final newlines, not meaningful differences", () => {
    expect(normalizeOutput("14 \t\r\n\r\n")).toBe("14");
    expect(evaluateCase(0, cases[0], success("14\n")).passed).toBe(true);
    for (const actual of [" 14", "1 4", "15", "14\ndebug"]) expect(evaluateCase(0, cases[0], success(actual)).passed).toBe(false);
  });
  it("never passes failed, truncated, or nonzero-exit execution even with matching text", () => {
    expect(evaluateCase(0, cases[0], { ...success("14"), status: "runtime-error", exitCode: 1 }).passed).toBe(false);
    expect(evaluateCase(0, cases[0], { ...success("14"), outputTruncated: true }).passed).toBe(false);
    expect(evaluateCase(0, cases[0], { ...success("14"), exitCode: null }).passed).toBe(false);
  });
  it("supports programs that need no input and have empty output", async () => {
    const runner = vi.fn().mockResolvedValue(success(""));
    const result = await runPracticeTests("int main(){}", [{ input: "", expectedOutput: "", explanation: "None" }], new AbortController().signal, () => {}, runner);
    expect(result[0].passed).toBe(true);
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ stdin: "" }));
  });
  it("runs in order with each case's automatic stdin and the same source", async () => {
    const runner = vi.fn().mockResolvedValueOnce(success("14\n")).mockResolvedValueOnce(success("42\n"));
    const update = vi.fn();
    const results = await runPracticeTests("solution", cases, new AbortController().signal, update, runner);
    expect(results.map((result) => result.passed)).toEqual([true, true]);
    expect(runner.mock.calls.map(([request]) => [request.source, request.stdin])).toEqual([["solution", "5 9\n"], ["solution", "20 22\n"]]);
    expect(update).toHaveBeenCalledTimes(2);
  });
  it("does not rerun a broken compilation or return old output", async () => {
    const runner = vi.fn().mockResolvedValue({ ...success(""), status: "compile-error", exitCode: null, compileOutput: "genuine compiler error" });
    const result = await runPracticeTests("invalid", cases, new AbortController().signal, () => {}, runner);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].result.stdout).toBe("");
  });
  it("honors cancellation between testcases", async () => {
    const controller = new AbortController();
    const runner = vi.fn().mockResolvedValue(success("14"));
    const results = await runPracticeTests("source", cases, controller.signal, () => controller.abort(), runner);
    expect(results).toHaveLength(1);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
