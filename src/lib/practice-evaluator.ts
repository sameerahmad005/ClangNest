import { runCpp } from "./cpp-runner";
import type { CppRunnerRequest, CppRunnerResult } from "../types/cpp-runner";
import type { PracticeCase, PracticeCaseResult } from "../types/practice";

// Preserve meaningful leading/internal spaces; ignore line-ending and trailing-space differences.
export function normalizeOutput(output: string): string {
  return output.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/, "")).join("\n").replace(/\n+$/, "");
}

export function evaluateCase(index: number, test: PracticeCase, result: CppRunnerResult): PracticeCaseResult {
  return {
    index, expectedOutput: test.expectedOutput, result,
    passed: result.status === "success" && result.exitCode === 0 && !result.outputTruncated && normalizeOutput(result.stdout) === normalizeOutput(test.expectedOutput),
  };
}

export async function runPracticeTests(
  source: string,
  cases: readonly PracticeCase[],
  signal: AbortSignal,
  onResult: (value: PracticeCaseResult) => void,
  runner: (request: CppRunnerRequest) => Promise<CppRunnerResult> = runCpp,
): Promise<PracticeCaseResult[]> {
  const results: PracticeCaseResult[] = [];
  for (let index = 0; index < cases.length; index++) {
    if (signal.aborted) break;
    const result = await runner({ source, stdin: cases[index].input, signal });
    const evaluated = evaluateCase(index, cases[index], result);
    results.push(evaluated);
    onResult(evaluated);
    if (["cancelled", "compile-error", "timeout", "limit-exceeded"].includes(result.status)) break;
  }
  return results;
}
