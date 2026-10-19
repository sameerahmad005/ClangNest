import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { generateProblem, DEFAULT_AI_SETTINGS, saveAiSettings } from "./lib/ai-practice";
import { runCpp } from "./lib/cpp-runner";
import type { AiGenerationProgress, PracticeProblem } from "./types/practice";
import type { CppRunnerResult } from "./types/cpp-runner";

vi.mock("@monaco-editor/react", () => ({ default: (props: { value: string; onChange(value: string): void }) => createElement("textarea", { "aria-label": "C++ editor", value: props.value, onChange: (event: { target: { value: string } }) => props.onChange(event.target.value) }) }));
vi.mock("./lib/ai-practice", async (original) => ({ ...await original<object>(), generateProblem: vi.fn(), testAiModel: vi.fn().mockResolvedValue({ durationMs: 1 }), listAvailableModels: vi.fn().mockResolvedValue([{ id: "test-generation-model", name: "Test generation model" }]) }));
vi.mock("./lib/cpp-runner", () => ({ runCpp: vi.fn() }));
vi.mock("./lib/project-storage", () => ({ createProjectStorage: () => ({
  list: async () => [{ id: "saved", name: "main.cpp", source: "MY EXISTING SOLUTION", stdin: "old input", createdAt: 1, updatedAt: 1 }],
  save: async (draft: object) => ({ ...draft, id: "saved", updatedAt: 2 }),
}) }));

const problem: PracticeProblem = {
  title: "Sum two integers", topic: "Arrays", difficulty: "Easy",
  statement: "Print the sum.", constraints: "Small integers", inputFormat: "Two integers", outputFormat: "One integer",
  testCases: [{ input: "5 9\n", expectedOutput: "14\n", explanation: "5 + 9" }, { input: "20 22\n", expectedOutput: "42\n", explanation: "20 + 22" }],
};
let root: Root;
let host: HTMLDivElement;
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label);
  expect(button, `button ${label}`).toBeTruthy();
  await act(async () => button!.click());
}
async function mount(withKey = true) {
  if (withKey) saveAiSettings({ ...DEFAULT_AI_SETTINGS, model: "test-generation-model", apiKey: "FAKE_UI_TEST_KEY" });
  await act(async () => root.render(createElement(App)));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  vi.mocked(generateProblem).mockResolvedValue(problem);
  vi.mocked(runCpp).mockImplementation(async ({ stdin }) => ({ status: "success", stdout: `${(stdin ?? "").trim().split(/\s+/).reduce((total, n) => total + Number(n), 0)}\n`, stderr: "", compileOutput: "", diagnostics: [], exitCode: 0, durationMs: 1, outputTruncated: false }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("opens settings instead of attempting generation with a missing credential", async () => {
  await mount(false); await click("Generate question");
  expect(generateProblem).not.toHaveBeenCalled();
  expect(host.querySelector('[role="dialog"]')).toBeTruthy();
  expect(host.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe("");
  expect(host.textContent).toContain("Choose a provider, add your API key");
});

it("generates a left-hand problem without replacing code, fills stdin, and passes both cases", async () => {
  await mount(); await click("Generate question");
  expect(generateProblem).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini" }), "Arrays", "Easy", expect.any(AbortSignal), expect.any(Function));
  expect(host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')?.value).toBe("MY EXISTING SOLUTION");
  expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Program input"]')?.value).toBe("5 9\n");
  expect(host.querySelectorAll(".practice-case")).toHaveLength(2);
  await click("Run 2 tests");
  expect(vi.mocked(runCpp).mock.calls.map(([request]) => [request.source, request.stdin])).toEqual([["MY EXISTING SOLUTION", "5 9\n"], ["MY EXISTING SOLUTION", "20 22\n"]]);
  expect(host.textContent).toContain("All visible examples passed");
  expect(host.querySelectorAll(".practice-passed").length).toBeGreaterThanOrEqual(2);
});

it("marks a wrong answer failed and invalidates previous passes when code is edited", async () => {
  await mount(); await click("Generate question"); await click("Run 2 tests");
  const editor = host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')!;
  await act(async () => { editor.value = "WRONG SOLUTION"; Simulate.change(editor); });
  expect(host.textContent).not.toContain("All visible examples passed");
  vi.mocked(runCpp).mockResolvedValue({ status: "success", stdout: "999\n", stderr: "", compileOutput: "", diagnostics: [], exitCode: 0, durationMs: 1, outputTruncated: false });
  await click("Run 2 tests");
  expect(host.querySelectorAll(".practice-failed")).toHaveLength(2);
  expect(host.textContent).not.toContain("All visible examples passed");
});

it("cancels question generation and leaves the existing source intact", async () => {
  await mount();
  vi.mocked(generateProblem).mockImplementation((_settings, _topic, _difficulty, signal) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("Problem generation was cancelled.")), { once: true })));
  await click("Generate question"); await click("Cancel");
  expect(host.textContent).toContain("Problem generation was cancelled");
  expect(host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')?.value).toBe("MY EXISTING SOLUTION");
  expect(runCpp).not.toHaveBeenCalled();
});

it("shows plain-text streaming progress before enabling validated examples, then clears the preview", async () => {
  let report!: (progress: AiGenerationProgress) => void;
  let complete!: (problem: PracticeProblem) => void;
  vi.mocked(generateProblem).mockImplementation((_settings, _topic, _difficulty, _signal, progress) => {
    report = progress!;
    return new Promise(resolve => { complete = resolve; });
  });
  await mount(); await click("Generate question");
  expect(host.textContent).toContain("Waiting for your AI provider…");
  const preview = '{"statement":"<img src=x onerror=alert(1)>"';
  await act(async () => report({ phase: "receiving", receivedChars: preview.length, preview }));
  expect(host.textContent).toContain(`Receiving reply… ${preview.length} characters`);
  expect(host.querySelector('[aria-label="Unvalidated AI response preview"]')?.textContent).toBe(preview);
  expect(host.querySelector(".practice-stream-preview img")).toBeNull();
  expect(host.querySelectorAll(".practice-case")).toHaveLength(0);
  expect([...host.querySelectorAll("button")].find(item => item.textContent === "Run 2 tests")?.disabled).toBe(true);
  expect(host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')?.value).toBe("MY EXISTING SOLUTION");
  await act(async () => complete(problem));
  expect(host.querySelector(".practice-stream-preview")).toBeNull();
  expect(host.querySelectorAll(".practice-case")).toHaveLength(2);
  expect(host.textContent).toMatch(/Generated in \d+\.\d s/);
  await act(async () => report({ phase: "receiving", receivedChars: 4, preview: "LATE" }));
  expect(host.querySelector(".practice-stream-preview")).toBeNull();
});

it("clears cancelled previews and ignores stale progress during the next request", async () => {
  const reports: ((progress: AiGenerationProgress) => void)[] = [];
  let complete!: (problem: PracticeProblem) => void;
  vi.mocked(generateProblem).mockImplementation((_settings, _topic, _difficulty, signal, progress) => {
    reports.push(progress!);
    return new Promise((resolve, reject) => {
      complete = resolve;
      signal?.addEventListener("abort", () => reject(new Error("Problem generation was cancelled.")), { once: true });
    });
  });
  await mount(); await click("Generate question");
  await act(async () => reports[0]({ phase: "receiving", receivedChars: 7, preview: "partial" }));
  await click("Cancel");
  expect(host.querySelector(".practice-stream-preview")).toBeNull();
  await click("Generate question");
  await act(async () => reports[0]({ phase: "receiving", receivedChars: 5, preview: "STALE" }));
  expect(host.querySelector(".practice-stream-preview")).toBeNull();
  await act(async () => reports[1]({ phase: "receiving", receivedChars: 5, preview: "fresh" }));
  expect(host.querySelector('[aria-label="Unvalidated AI response preview"]')?.textContent).toBe("fresh");
  await act(async () => complete(problem));
  expect(host.querySelectorAll(".practice-case")).toHaveLength(2);
  expect(generateProblem).toHaveBeenCalledTimes(2);
});

it("shows elapsed waiting and slow-provider guidance without automatically retrying", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.mocked(generateProblem).mockImplementation((_settings, _topic, _difficulty, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("Problem generation was cancelled.")), { once: true });
  }));
  await mount(); await click("Generate question");
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(host.textContent).toContain("Waiting for your AI provider… · 10 s");
  expect(host.textContent).toContain("Provider queueing or model reasoning may take longer");
  await click("Projects");
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  await click("DSA Practice");
  expect(host.textContent).toContain("Waiting for your AI provider… · 13 s");
  expect(generateProblem).toHaveBeenCalledTimes(1);
  await click("Cancel");
  expect(host.textContent).not.toContain("Waiting for your AI provider…");
  expect(vi.getTimerCount()).toBe(0);
});

it("clears a key when changing provider and can forget saved credentials", async () => {
  await mount(); await click("AI provider settings");
  const provider = host.querySelector<HTMLSelectElement>('.ai-field select')!;
  await act(async () => { provider.value = "openai-compatible"; Simulate.change(provider); });
  expect(host.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe("");
  expect(host.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe("");
  await click("Forget key");
  expect(sessionStorage.getItem("cpp-practice.ai.api-key")).toBeNull();
  expect(localStorage.getItem("cpp-practice.ai.api-key")).toBeNull();
});

it("opens live model setup when the saved model returns 404, without retrying", async () => {
  await mount();
  vi.mocked(generateProblem).mockRejectedValue(new Error("The model or generation route was not found (HTTP 404). Refresh the model list."));
  await click("Generate question");
  expect(generateProblem).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="dialog"]')).toBeTruthy();
  expect(host.textContent).toContain("Load available models");
  expect(host.textContent).toContain("HTTP 404");
  expect(runCpp).not.toHaveBeenCalled();
});

const duplicateMain: CppRunnerResult = {
  status: "compile-error", stdout: "", stderr: "compiler exited with code 1",
  compileOutput: "main.cpp:8:5: error: redefinition of 'main'\n    8 | int main() { return 42; }\n      |     ^\nmain.cpp:2:5: note: previous definition is here",
  diagnostics: [
    { file: "main.cpp", line: 8, column: 5, severity: "error", message: "redefinition of 'main'", raw: "main.cpp:8:5: error: redefinition of 'main'" },
    { file: "main.cpp", line: 2, column: 5, severity: "note", message: "previous definition is here", raw: "main.cpp:2:5: note: previous definition is here" },
  ],
  exitCode: 1, durationMs: 1, outputTruncated: false,
};

it("passes a complete main-containing editor program exactly once and unchanged to the runner", async () => {
  await mount();
  const source = '#include <iostream>\n// Preserve this program exactly.\nint main() { std::cout << "replacement"; }\n';
  const editor = host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')!;
  await act(async () => { editor.value = source; Simulate.change(editor); });
  await click("RunCtrl ↵");
  expect(runCpp).toHaveBeenCalledTimes(1);
  expect(runCpp).toHaveBeenCalledWith({ source, stdin: "old input", signal: expect.any(AbortSignal) });
});

it("shows raw duplicate-main diagnostics once with stderr and an actionable replacement hint", async () => {
  await mount();
  vi.mocked(runCpp).mockResolvedValue(duplicateMain);
  await click("RunCtrl ↵");
  const errors = host.querySelector('.terminal-content pre')!.textContent!;
  expect(errors).toContain(`${duplicateMain.compileOutput}\n${duplicateMain.stderr}`);
  expect(errors.match(/redefinition of 'main'/g)).toHaveLength(1);
  expect(errors.match(/previous definition is here/g)).toHaveLength(1);
  expect(errors).toContain("Keep one main() function only");
  expect(errors).toContain("Replace the starter program rather than appending a complete program");
  expect(errors).toContain("Ctrl+A, then paste");
  expect(errors).not.toMatch(/C\+\+23|upgrade/);
  expect(host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')!.value).toBe("MY EXISTING SOLUTION");
});

it("recognizes duplicate-main compiler output even without parsed diagnostics", async () => {
  await mount();
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, diagnostics: [] });
  await click("RunCtrl ↵");
  expect(host.querySelector('.terminal-content pre')!.textContent).toContain("Ctrl+A, then paste");
});

it("falls back to parsed diagnostics when raw compiler output is empty and preserves stderr", async () => {
  await mount();
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, compileOutput: " \n" });
  await click("RunCtrl ↵");
  const errors = host.querySelector('.terminal-content pre')!.textContent!;
  expect(errors).toContain("main.cpp:8:5 error: redefinition of 'main'\nmain.cpp:2:5 note: previous definition is here\ncompiler exited with code 1");
  expect(errors).toContain("Ctrl+A, then paste");
});

it.each([
  { message: "expected expression", source: "// redefinition of 'main'\nint main() { return ; }" },
  { message: "redefinition of 'main_helper'", source: "int main() {}" },
  { message: "static assertion failed: redefinition of 'main'", source: "int main() {}" },
])("does not suggest replacing main for unrelated errors: $message", async ({ message, source }) => {
  await mount();
  const editor = host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')!;
  await act(async () => { editor.value = source; Simulate.change(editor); });
  const compileOutput = `main.cpp:1:1: error: ${message}\n2 | // redefinition of 'main'`;
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, compileOutput, diagnostics: [{ severity: "error", message, raw: compileOutput }] });
  await click("RunCtrl ↵");
  expect(host.querySelector('.terminal-content pre')!.textContent).toBe(`${compileOutput}\n${duplicateMain.stderr}`);
});

it.each([
  { prefix: "wasm-ld: error: ", message: "undefined symbol: __cxa_allocate_exception" },
  { prefix: "wasm-ld: error: ", message: "undefined symbol: __cxa_throw" },
  { prefix: "wasm-ld: error: ", message: "/lib/libc++.a(stdexcept.o): undefined symbol: __cxa_allocate_exception" },
  { prefix: "wasm-ld: error: ", message: "/lib/libc++.a(stdexcept.o): undefined symbol: __cxa_throw" },
  { prefix: "main.cpp:3:5: error: ", message: "cannot use 'throw' with exceptions disabled" },
  { prefix: "main.cpp:3:5: error: ", message: "cannot use 'try' with exceptions disabled" },
].flatMap((test) => [true, false].map((parsed) => ({ ...test, parsed }))))("explains unsupported exceptions for $message (parsed: $parsed) without changing errors or source", async ({ prefix, message, parsed }) => {
  await mount();
  const source = "#include <vector>\nint main() { std::vector<int> values(4); }\n";
  const editor = host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')!;
  await act(async () => { editor.value = source; Simulate.change(editor); });
  const compileOutput = `\n${prefix}${message}\n  referenced by library code\n`;
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, compileOutput, diagnostics: parsed ? [{ severity: "error", message, raw: `${prefix}${message}` }] : [] });
  await click("RunCtrl ↵");
  const errors = host.querySelector('.terminal-content pre')!.textContent!;
  expect(errors.split("\n\nHint:")).toEqual([`${compileOutput}\n${duplicateMain.stderr}`, expect.any(String)]);
  expect(errors.split(message)).toHaveLength(2);
  expect(errors).toContain("browser runner lacks C++ exception handling");
  expect(errors).toContain("throw/try/catch are unsupported");
  expect(errors).toContain("Handle errors explicitly");
  expect(errors).toContain("older default linker output, reload the updated runner");
  expect(errors).not.toContain("Keep one main()");
  expect(editor.value).toBe(source);
  expect(runCpp).toHaveBeenCalledTimes(1);
  expect(runCpp).toHaveBeenCalledWith({ source, stdin: "old input", signal: expect.any(AbortSignal) });
});

it.each(["undefined symbol: __cxa_throw", "cannot use 'throw' with exceptions disabled"])("explains parsed exception diagnostics without raw compiler output: %s", async (message) => {
  await mount();
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, compileOutput: "", diagnostics: [{ file: "main.cpp", line: 3, column: 5, severity: "error", message, raw: message }] });
  await click("RunCtrl ↵");
  const errors = host.querySelector('.terminal-content pre')!.textContent!;
  expect(errors.split("\n\nHint:")).toEqual([`main.cpp:3:5 error: ${message}\n${duplicateMain.stderr}`, expect.any(String)]);
  expect(errors).toContain("browser runner lacks C++ exception handling");
  expect(errors.split(message)).toHaveLength(2);
});

it.each([
  { message: "expected expression", excerpt: "3 | // wasm-ld: error: undefined symbol: __cxa_throw" },
  { message: "expected expression", excerpt: "3 | // error: cannot use 'throw' with exceptions disabled" },
  { message: "expected expression", excerpt: "3 | // main.cpp:3:5: error: cannot use 'try' with exceptions disabled" },
  { message: "undefined symbol: __cxa_throw_helper", excerpt: "" },
  { message: "undefined symbol: __cxa_allocate_exception_extra", excerpt: "" },
  { message: "undefined symbol: __cxa_free_exception", excerpt: "" },
  { message: "static assertion failed: undefined symbol: __cxa_throw", excerpt: "" },
  { message: "static assertion failed: cannot use 'try' with exceptions disabled", excerpt: "" },
  { message: "cannot use 'co_await' with exceptions disabled", excerpt: "" },
])("does not suggest exception fixes for unrelated errors or source excerpts: $message $excerpt", async ({ message, excerpt }) => {
  await mount();
  const editor = host.querySelector<HTMLTextAreaElement>('.editor-wrap textarea')!;
  await act(async () => { editor.value = "// undefined symbol: __cxa_throw\n// cannot use 'try' with exceptions disabled\nint main() {}"; Simulate.change(editor); });
  const compileOutput = `main.cpp:3:5: error: ${message}\n${excerpt}`;
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, compileOutput, diagnostics: [{ severity: "error", message, raw: compileOutput }] });
  await click("RunCtrl ↵");
  expect(host.querySelector('.terminal-content pre')!.textContent).toBe(`${compileOutput}\n${duplicateMain.stderr}`);
});

it.each(["success", "runtime-error", "timeout", "cancelled"] as const)("does not add exception guidance to %s results", async (status) => {
  await mount();
  const compileOutput = "wasm-ld: error: undefined symbol: __cxa_throw";
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, status, compileOutput, diagnostics: [{ severity: "error", message: "undefined symbol: __cxa_throw", raw: compileOutput }] });
  await click("RunCtrl ↵");
  await click("Errors (1)");
  expect(host.querySelector('.terminal-content pre')!.textContent).toBe(`${compileOutput}\n${duplicateMain.stderr}`);
});

it("ignores exception notes and stderr text that are not compiler errors", async () => {
  await mount();
  const compileOutput = "main.cpp:3:5: error: expected expression\nmain.cpp:1:1: note: cannot use 'throw' with exceptions disabled";
  const stderr = "undefined symbol: __cxa_throw";
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, compileOutput, stderr, diagnostics: [{ severity: "note", message: "undefined symbol: __cxa_throw", raw: stderr }] });
  await click("RunCtrl ↵");
  expect(host.querySelector('.terminal-content pre')!.textContent).toBe(`${compileOutput}\n${stderr}`);
});

it("preserves both duplicate-main and exception guidance when both compiler errors occur", async () => {
  await mount();
  const compileOutput = `${duplicateMain.compileOutput}\nwasm-ld: error: undefined symbol: __cxa_throw`;
  vi.mocked(runCpp).mockResolvedValue({ ...duplicateMain, compileOutput });
  await click("RunCtrl ↵");
  const errors = host.querySelector('.terminal-content pre')!.textContent!;
  expect(errors.startsWith(`${compileOutput}\n${duplicateMain.stderr}\n\nHint:`)).toBe(true);
  expect(errors).toContain("Keep one main() function only");
  expect(errors).toContain("browser runner lacks C++ exception handling");
  expect(errors.split(compileOutput)).toHaveLength(2);
});

it("shows C++23 consistently with qualified support and persistent editor help", async () => {
  await mount();
  expect(host.querySelector('.brand-sub')!.textContent).toBe("C++23 practice");
  expect(host.querySelector('.standard-chip')!.textContent).toBe("C++23");
  expect(host.querySelector('.standard-chip')!.getAttribute("title")).toContain("C++23 no-exceptions mode");
  expect(host.querySelector('.standard-chip')!.getAttribute("title")).toContain("compiler and standard-library support is partial");
  expect(host.querySelector('.standard-chip svg')).toBeNull();
  expect(host.querySelector('.statusbar')!.textContent).toContain("Clang / WASI · C++23");
  expect(host.textContent).toContain("Paste a complete program by replacing the starter code; keep one main()");
});
