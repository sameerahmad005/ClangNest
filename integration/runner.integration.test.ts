import { readFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { DEFAULT_RUNNER_LIMITS, type CppRunnerResult } from "../src/types/cpp-runner";
import { runPracticeTests } from "../src/lib/practice-evaluator";
import { DEFAULT_CPP_FLAGS } from "../src/lib/cpp-runner/standard";

// Exercise the real LLVM/WASI toolchain locally, not a substitute compiler or mocked output.
// Only asset transport and the Worker message boundary are bridged for Node.
vi.mock("browsercc/dist/clang.wasm?url", () => ({ default: "clang.wasm" }));
vi.mock("browsercc/dist/lld.wasm?url", () => ({ default: "lld.wasm" }));
vi.mock("browsercc/dist/sysroot.tar?url", () => ({ default: "sysroot.tar" }));

const hello = '#include <iostream>\nint main() { std::cout << "Hello, World!\\n"; }';
const sum = '#include <iostream>\nint main() { long long a=0,b=0; if(!(std::cin>>a>>b)) { std::cerr<<"Expected two integers\\n"; return 2; } std::cout<<a+b<<"\\n"; }';
type Request = { source: string; stdin: string; fileName: string; flags: string[]; limits: typeof DEFAULT_RUNNER_LIMITS };
type Message = CppRunnerResult | { type: "phase"; phase: "execution" };
let receive: ((message: Message) => void) | undefined;
const bridge = {
  onmessage: null as null | ((event: MessageEvent<Request>) => void),
  postMessage(message: Message) { receive?.(message); },
};

beforeAll(async () => {
  vi.stubGlobal("fetch", async (name: string) => {
    if (!["clang.wasm", "lld.wasm", "sysroot.tar"].includes(name)) throw new Error(`Unexpected asset: ${name}`);
    const buffer = await readFile(new URL(`../node_modules/browsercc/dist/${name}`, import.meta.url));
    return { ok: true, status: 200, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  });
  vi.stubGlobal("self", bridge);
  await import("../src/lib/cpp-runner/runner.worker");
});

afterAll(() => {
  vi.unstubAllGlobals();
  // Clang's Emscripten glue sets Node's exit code even for an expected syntax failure.
  process.exitCode = 0;
});

async function run(source: string, stdin = "", flags: readonly string[] = DEFAULT_CPP_FLAGS): Promise<CppRunnerResult> {
  const result = await new Promise<CppRunnerResult>((resolve) => {
    receive = (message) => { if ("status" in message) resolve(message); };
    bridge.onmessage!({ data: { source, stdin, fileName: "main.cpp", flags: [...flags], limits: DEFAULT_RUNNER_LIMITS } } as MessageEvent<Request>);
  });
  return result;
}

it("compiles real C++, reruns cached modules with fresh stdin, and recovers from syntax errors", async () => {
  const cold = await run(hello);
  expect(cold).toMatchObject({ status: "success", stdout: "Hello, World!\n", exitCode: 0 });
  const warm: number[] = [];
  for (let i = 0; i < 3; i++) {
    const result = await run(hello);
    expect(result).toMatchObject({ status: "success", stdout: "Hello, World!\n", exitCode: 0 });
    warm.push(result.durationMs);
  }
  const changed = await run(sum, "5 9");
  expect(changed).toMatchObject({ status: "success", stdout: "14\n", exitCode: 0 });
  const inputOnly = await run(sum, "20 22");
  expect(inputOnly).toMatchObject({ status: "success", stdout: "42\n", exitCode: 0 });
  const empty = await run(sum);
  expect(empty).toMatchObject({ status: "runtime-error", stdout: "", stderr: "Expected two integers\n", exitCode: 2 });
  const failed = await run("int main() { missing ; }");
  expect(failed.status).toBe("compile-error");
  expect(failed.stdout).toBe("");
  expect(failed.compileOutput).toContain("error:");
  const recovered = await run(hello);
  expect(recovered).toMatchObject({ status: "success", stdout: "Hello, World!\n" });
  const cpp17 = await run('#include <iostream>\n#include <optional>\n#include <utility>\nint main() { auto [a,b] = std::pair{19,23}; if constexpr(__cplusplus>=201703L) { std::optional<int> n=a+b; std::cout<<*n<<"\\n"; } }');
  expect(cpp17).toMatchObject({ status: "success", stdout: "42\n", exitCode: 0 });
  console.log("REAL_WASM_TIMINGS_MS", JSON.stringify({ cold: cold.durationMs, warm, changedSource: changed.durationMs, inputOnly: inputOnly.durationMs, recovery: recovered.durationMs }));
});

it("verifies the bundled compiler's C++23 mode, if consteval, and available newer library features", async () => {
  const source = `#include <iostream>
#include <bit>
#include <version>
constexpr int answer(int n) {
  if consteval { return n * 2; } else { return n + 2; }
}
static_assert(answer(21) == 42);
static_assert(__cplusplus >= 202302L);
int main() {
  int n; std::cin >> n;
  std::cout << "__clang_version__=" << __clang_version__ << "\\n";
  std::cout << "__cplusplus=" << __cplusplus << "\\n";
  std::cout << "if consteval=" << answer(n) << "\\n";
  std::cout << "std::byteswap=" << std::byteswap(0x12345678u) << "\\n";
}`;
  const result = await run(source, "40");
  console.log("REAL_WASM_CPP23", JSON.stringify(result));
  expect(result.status, result.compileOutput || result.stderr).toBe("success");
  expect(result.stdout).toMatch(/__clang_version__=.+/);
  expect(Number(result.stdout.match(/__cplusplus=(\d+)/)?.[1])).toBeGreaterThanOrEqual(202302);
  expect(result.stdout).toContain("if consteval=42\nstd::byteswap=2018915346\n");

  // Reject C++23 extensions in the older mode, rather than accepting a warning as proof.
  const olderMode = await run(source, "40", ["-std=c++20", "-pedantic-errors"]);
  expect(olderMode.status).toBe("compile-error");
  expect(olderMode.compileOutput).toMatch(/consteval.*C\+\+23|C\+\+23.*consteval/);
  expect(olderMode.stdout).toBe("");
  expect(await run(source, "40")).toMatchObject({ status: "success", stdout: result.stdout });
});

it("runs std::print without exceptions while preserving explicit flags and their cache keys", async () => {
  const source = '#include <print>\nint main() { std::print("answer={}\\n", 42); }';
  const fixed = await run(source);
  console.log("REAL_WASM_STD_PRINT_FIXED", JSON.stringify(fixed));
  expect(fixed, fixed.compileOutput || fixed.stderr).toMatchObject({ status: "success", stdout: "answer=42\n", exitCode: 0 });
  const original = await run(source, "", ["-std=c++23"]);
  console.log("REAL_WASM_STD_PRINT_ORIGINAL", JSON.stringify(original));
  expect(original).toMatchObject({ status: "compile-error", stdout: "", exitCode: null });
  expect(original.compileOutput).toContain("undefined symbol: __cxa_allocate_exception");
  expect(original.compileOutput).toContain("undefined symbol: __cxa_throw");
  expect(await run(source)).toMatchObject({ status: "success", stdout: "answer=42\n", exitCode: 0 });
});

it("runs valid std::format and container bounds checks without exceptions", async () => {
  const result = await run('#include <format>\n#include <iostream>\n#include <vector>\nint main() { std::vector<int> values{42}; std::cout << std::format("answer={}\\n", values.at(0)); }');
  console.log("REAL_WASM_STD_FORMAT", JSON.stringify(result));
  expect(result, result.compileOutput || result.stderr).toMatchObject({ status: "success", stdout: "answer=42\n", exitCode: 0 });
});

it("rejects explicit throw and try at compile time with the default flags", async () => {
  const result = await run("int main() { try { throw 42; } catch (...) { return 0; } }");
  console.log("REAL_WASM_EXCEPTIONS_DISABLED", JSON.stringify(result));
  expect(result).toMatchObject({ status: "compile-error", stdout: "", exitCode: null });
  expect(result.compileOutput).toContain("cannot use 'throw' with exceptions disabled");
  expect(result.compileOutput).toContain("cannot use 'try' with exceptions disabled");
  expect(result.compileOutput).not.toContain("undefined symbol:");
});

it("reports library aborts without stale output and recovers on the same source", async () => {
  const source = '#include <format>\n#include <iostream>\n#include <string>\nint main() { std::string pattern; std::getline(std::cin, pattern); int answer = 42; std::cout << std::vformat(pattern, std::make_format_args(answer)) << "\\n"; }';
  expect(await run(source, "answer={}")).toMatchObject({ status: "success", stdout: "answer=42\n", exitCode: 0 });
  const aborted = await run(source, "{");
  console.log("REAL_WASM_FORMAT_ABORT", JSON.stringify(aborted));
  expect(aborted).toMatchObject({ status: "runtime-error", stdout: "", compileOutput: "" });
  expect(aborted.exitCode).not.toBe(0);
  expect(aborted.stderr).not.toBe("");
  expect(await run(source, "fresh={}")).toMatchObject({ status: "success", stdout: "fresh=42\n", stderr: "", exitCode: 0 });
});

it("keeps explicit language flags in the real compilation cache key", async () => {
  const source = '#include <iostream>\nint main() { std::cout << __cplusplus << "\\n"; }';
  const latest = await run(source);
  expect(latest.status).toBe("success");
  expect(Number(latest.stdout.trim())).toBeGreaterThanOrEqual(202302);
  expect(await run(source, "", ["-std=c++17"])).toMatchObject({ status: "success", stdout: "201703\n" });
  expect(await run(source)).toMatchObject({ status: "success", stdout: latest.stdout });
});

it("reports duplicate mains at the original lines 3 and 12 and runs the single-main correction without stale output", async () => {
  const source = [
    "#include <iostream>",
    "",
    'int main() { std::cout << "corrected\\n"; }',
    "", "", "", "", "", "", "", "",
    'int main() { std::cout << "duplicate\\n"; }',
  ].join("\n");
  expect(source.split("\n")).toHaveLength(12);
  expect(await run(hello)).toMatchObject({ status: "success", stdout: "Hello, World!\n" });
  const failed = await run(source);
  console.log("REAL_WASM_DUPLICATE_MAIN", JSON.stringify(failed));
  expect(failed).toMatchObject({ status: "compile-error", stdout: "", stderr: "", exitCode: null });
  expect(failed.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ file: "main.cpp", line: 12, column: 5, severity: "error", message: expect.stringContaining("redefinition of 'main'") }),
    expect.objectContaining({ file: "main.cpp", line: 3, column: 5, severity: "note", message: expect.stringContaining("previous definition") }),
  ]));
  const corrected = source.split("\n").slice(0, 11).join("\n");
  for (let i = 0; i < 2; i++) {
    expect(await run(corrected)).toMatchObject({ status: "success", stdout: "corrected\n", stderr: "", compileOutput: "", diagnostics: [], exitCode: 0 });
  }
});

it("checks practice examples against genuine C++ output with automatic input", async () => {
  const cases = [{ input: "5 9", expectedOutput: "14\n", explanation: "Sum" }, { input: "20 22", expectedOutput: "42", explanation: "Another sum" }];
  const runner = (request: { source: string; stdin?: string }) => run(request.source, request.stdin);
  const correct = await runPracticeTests(sum, cases, new AbortController().signal, () => {}, runner);
  expect(correct.map((test) => test.passed)).toEqual([true, true]);
  expect(correct.map((test) => test.result.stdout)).toEqual(["14\n", "42\n"]);
  const incorrect = await runPracticeTests(sum, [{ ...cases[0], expectedOutput: "999" }, cases[1]], new AbortController().signal, () => {}, runner);
  expect(incorrect.map((test) => test.passed)).toEqual([false, true]);
  const failed = await runPracticeTests("int main() { syntax error }", cases, new AbortController().signal, () => {}, runner);
  expect(failed).toHaveLength(1);
  expect(failed[0].result.status).toBe("compile-error");
  expect(failed[0].result.stdout).toBe("");
  expect(failed[0].passed).toBe(false);
});

it("benchmarks cold, changed-source, and cached execution with the real toolchain", async () => {
  vi.resetModules();
  await import("../src/lib/cpp-runner/runner.worker");
  const cold = await run(hello);
  expect(cold).toMatchObject({ status: "success", stdout: "Hello, World!\n", exitCode: 0 });
  const cached: number[] = [];
  for (let i = 0; i < 3; i++) {
    const result = await run(hello);
    expect(result).toMatchObject({ status: "success", stdout: "Hello, World!\n", exitCode: 0 });
    cached.push(result.durationMs);
  }
  const changed: Record<string, number[]> = {};
  for (const header of ["iostream", "bits/stdc++.h"]) {
    changed[header] = [];
    for (let i = 0; i < 3; i++) {
      // Every source and expected output changes, forcing genuine compilation and execution.
      const result = await run(`#include <${header}>\nint main() { int value; std::cin >> value; std::cout << value + ${i} << "\\n"; }`, "40");
      expect(result, result.compileOutput || result.stderr).toMatchObject({ status: "success", stdout: `${40 + i}\n`, exitCode: 0 });
      changed[header].push(result.durationMs);
    }
  }
  const median = (times: number[]) => [...times].sort((a, b) => a - b)[1];
  console.log("REAL_WASM_CHANGED_SOURCE_MS", JSON.stringify({
    node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
    cpu: cpus()[0].model, logicalCpus: cpus().length, memoryGiB: totalmem() / 2 ** 30,
    flags: DEFAULT_CPP_FLAGS, cold: cold.durationMs, cached, medianCached: median(cached),
    changed, medians: Object.fromEntries(Object.entries(changed).map(([header, times]) => [header, median(times)])),
  }));
});

it("benchmarks fresh compiler state against reuse with identical source and output", async () => {
  const freshWorker: number[] = [];
  const reusedWorker: number[] = [];
  for (let i = 0; i < 3; i++) {
    // Match the previous per-run reset behavior without changing compiler flags or source.
    // This resets worker module state in Node, not a browser process or its HTTP cache.
    vi.resetModules();
    await import("../src/lib/cpp-runner/runner.worker");
    const result = await run(hello);
    expect(result).toMatchObject({ status: "success", stdout: "Hello, World!\n", exitCode: 0 });
    freshWorker.push(result.durationMs);
  }
  for (let i = 0; i < 3; i++) {
    const result = await run(hello);
    expect(result).toMatchObject({ status: "success", stdout: "Hello, World!\n", exitCode: 0 });
    reusedWorker.push(result.durationMs);
  }
  const median = (times: number[]) => [...times].sort((a, b) => a - b)[1];
  console.log("REAL_WASM_COMPARISON_MS", JSON.stringify({ freshWorker, reusedWorker, medianFresh: median(freshWorker), medianReused: median(reusedWorker) }));
});
