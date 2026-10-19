import { Clang, LLD, tarContents } from "browsercc";
import { ConsoleStdout, File, OpenFile, WASI, WASIProcExit } from "@bjorn3/browser_wasi_shim";
import type { CppRunnerResult, RunnerLimits } from "../../types/cpp-runner";
import { limitUtf8, parseDiagnostics } from "./runner-helpers";
import { parseCompilerInvocation } from "./compiler-invocation";
import clangWasmUrl from "browsercc/dist/clang.wasm?url";
import lldWasmUrl from "browsercc/dist/lld.wasm?url";
import sysrootUrl from "browsercc/dist/sysroot.tar?url";

interface WorkerRequest {
  source: string;
  stdin: string;
  fileName: string;
  flags: string[];
  limits: RunnerLimits;
}

interface OutputCapture {
  stdout: string;
  stderr: string;
  bytes: number;
  truncated: boolean;
  append(channel: "stdout" | "stderr", data: Uint8Array): void;
}

function createCapture(maxBytes: number): OutputCapture {
  const decoder = new TextDecoder();
  const capture: OutputCapture = {
    stdout: "",
    stderr: "",
    bytes: 0,
    truncated: false,
    append(channel, data) {
      if (capture.bytes >= maxBytes) {
        capture.truncated = true;
        return;
      }
      const remaining = maxBytes - capture.bytes;
      const text = decoder.decode(data);
      const limited = limitUtf8(text, remaining);
      capture[channel] += limited.text;
      capture.bytes += limited.bytes;
      capture.truncated ||= limited.truncated;
    },
  };
  return capture;
}

function resultBase(): CppRunnerResult {
  return {
    status: "runtime-error",
    stdout: "",
    stderr: "",
    compileOutput: "",
    diagnostics: [],
    exitCode: null,
    durationMs: 0,
    outputTruncated: false,
  };
}

async function execute(request: WorkerRequest): Promise<CppRunnerResult> {
  const startedAt = performance.now();
  const result = resultBase();
  let compiled: CompiledProgram;
  try {
    const key = JSON.stringify([request.source, request.fileName, request.flags]);
    if (lastCompilation?.key === key) {
      compiled = lastCompilation.compiled;
    } else {
      // A failed edit must not retain a previous source's successful module.
      lastCompilation = undefined;
      compiled = await compileWithExplicitAssets(request.source, request.fileName, request.flags);
      if (compiled.module) lastCompilation = { key, compiled };
    }
  } catch (error) {
    result.status = "runtime-error";
    result.stderr = `Compiler stage failed: ${error instanceof Error ? `${error.message}${error.stack ? `\n${error.stack}` : ""}` : String(error)}`;
    result.durationMs = performance.now() - startedAt;
    return result;
  }
  const compileOutput = limitUtf8(compiled.compileOutput, request.limits.maxCompilerOutputBytes);
  result.compileOutput = compileOutput.text;
  result.diagnostics = parseDiagnostics(compileOutput.text);
  if (!compiled.module) {
    result.status = "compile-error";
    result.durationMs = performance.now() - startedAt;
    return result;
  }

  const output = createCapture(request.limits.maxOutputBytes);
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(request.stdin))),
    new ConsoleStdout((data) => output.append("stdout", data)),
    new ConsoleStdout((data) => output.append("stderr", data)),
  ];
  const wasi = new WASI([], [], fds);
  let moduleSummary = "";
  try {
    self.postMessage({ type: "phase", phase: "execution" });
    const instance = await WebAssembly.instantiate(compiled.module, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    const exports = instance.exports;
    if (typeof exports._start !== "function") {
      result.stderr = `Compiled module does not export _start (exports: ${Object.keys(exports).join(", ") || "none"}).`;
      result.status = "runtime-error";
      result.durationMs = performance.now() - startedAt;
      return result;
    }
    moduleSummary = `exports: ${Object.keys(exports).join(", ")} | imports: ${WebAssembly.Module.imports(compiled.module).map((item) => `${item.module}.${item.name}`).join(", ")}`;
    result.exitCode = wasi.start({ exports } as never);
    result.status = result.exitCode === 0 ? "success" : "runtime-error";
  } catch (error) {
    if (error instanceof WASIProcExit) {
      result.exitCode = error.code;
      result.status = error.code === 0 ? "success" : "runtime-error";
    } else {
      const details = error instanceof Error ? `${error.message}${error.stack ? `\n${error.stack}` : ""}` : String(error);
      result.stderr = `${details}\n${moduleSummary}`;
      result.status = "runtime-error";
    }
  }
  result.stdout = output.stdout;
  result.stderr = [result.stderr, output.stderr].filter(Boolean).join("\n");
  result.outputTruncated = output.truncated;
  result.durationMs = performance.now() - startedAt;
  return result;
}

type CompilerModule = {
  FS: { writeFile: (path: string, data: string | Uint8Array) => void; readFile: (path: string, options?: { encoding: string }) => Uint8Array; mkdirTree: (path: string) => void };
  callMain: (args: string[]) => number;
};

type CompilerAssets = {
  clangWasm: WebAssembly.Module;
  lldWasm: WebAssembly.Module;
  sysroot: ArrayBuffer;
};

type CompiledProgram = { compileOutput: string; module: WebAssembly.Module | null };

let assetsPromise: Promise<CompilerAssets> | undefined;
let sysrootEntriesPromise: Promise<Array<{ name: string; content: Uint8Array }>> | undefined;
let lastCompilation: { key: string; compiled: CompiledProgram } | undefined;
let lastInvocation: { key: string; invocation: ReturnType<typeof parseCompilerInvocation> } | undefined;

async function fetchAsset(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load compiler asset ${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

function loadAssets(): Promise<CompilerAssets> {
  return assetsPromise ??= Promise.all([
    fetchAsset(clangWasmUrl).then((bytes) => WebAssembly.compile(bytes)),
    fetchAsset(lldWasmUrl).then((bytes) => WebAssembly.compile(bytes)),
    fetchAsset(sysrootUrl),
  ]).then(([clangWasm, lldWasm, sysroot]) => ({ clangWasm, lldWasm, sysroot }))
    .catch((error: unknown) => {
      assetsPromise = undefined;
      throw error;
    });
}

function loadSysrootEntries() {
  return sysrootEntriesPromise ??= loadAssets().then(({ sysroot }) => [...tarContents(sysroot)])
    .catch((error: unknown) => {
      sysrootEntriesPromise = undefined;
      throw error;
    });
}

async function installSysroot(module: CompilerModule, entries: Array<{ name: string; content: Uint8Array }>) {
  for (const { name, content } of entries) {
    if (name.endsWith("/")) continue;
    module.FS.mkdirTree(name.split("/").slice(0, -1).join("/"));
    module.FS.writeFile(name, content);
  }
}

function compilerOptions(url: string, wasmModule: WebAssembly.Module, stderr: (data: string) => void, thisProgram: string) {
  return {
    thisProgram,
    instantiateWasm(imports: WebAssembly.Imports, receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
      // Reuse compiled engine code, never the one-shot compiler's memory or runtime state.
      const instance = new WebAssembly.Instance(wasmModule, imports);
      receiveInstance(instance, wasmModule);
      return instance.exports;
    },
    locateFile: () => url,
    printErr: (data: string) => stderr(`${data}\n`),
  };
}

async function compileWithExplicitAssets(source: string, fileName: string, flags: string[]) {
  const assets = await loadAssets();
  const sysrootEntries = await loadSysrootEntries();
  const invocationKey = JSON.stringify([fileName, flags]);
  let stderr = "";
  let invocation = lastInvocation?.key === invocationKey ? lastInvocation.invocation : undefined;
  if (!invocation) {
    const driver = await (Clang as unknown as (options: unknown) => Promise<CompilerModule>)(compilerOptions(clangWasmUrl, assets.clangWasm, (data) => { stderr += data; }, "clang++"));
    driver.FS.writeFile(fileName, source);
    driver.FS.mkdirTree("/lib/wasm32-wasi");
    driver.FS.mkdirTree("/include/c++/v1");
    driver.FS.writeFile("/lib/wasm32-wasi/crt1-command.o", new Uint8Array(0));
    driver.FS.writeFile("/lib/wasm32-wasi/crt1-reactor.o", new Uint8Array(0));
    const driverStatus = driver.callMain([fileName, ...flags, "-###"]);
    if (driverStatus !== 0) return { compileOutput: stderr, module: null };
    invocation = parseCompilerInvocation(stderr);
    lastInvocation = { key: invocationKey, invocation };
    stderr = "";
  }
  // Clang's main is one-shot: the driver and cc1 need separate instances.
  const clang = await (Clang as unknown as (options: unknown) => Promise<CompilerModule>)(compilerOptions(clangWasmUrl, assets.clangWasm, (data) => { stderr += data; }, "clang++"));
  clang.FS.writeFile(fileName, source);
  await installSysroot(clang, sysrootEntries);
  // Emscripten prepends argv[0] in place, so never pass the cached arrays.
  if (clang.callMain([...invocation.compiler.args]) !== 0) return { compileOutput: stderr, module: null };
  const binary = clang.FS.readFile(invocation.compiler.output, { encoding: "binary" });
  const lld = await (LLD as unknown as (options: unknown) => Promise<CompilerModule>)(compilerOptions(lldWasmUrl, assets.lldWasm, (data) => { stderr += data; }, "wasm-ld"));
  lld.FS.writeFile(invocation.compiler.output, binary);
  await installSysroot(lld, sysrootEntries);
  if (lld.callMain([...invocation.linker.args]) !== 0) return { compileOutput: stderr, module: null };
  const output = lld.FS.readFile(invocation.linker.output, { encoding: "binary" });
  return { compileOutput: stderr, module: await WebAssembly.compile(output as Uint8Array<ArrayBuffer>) };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void execute(event.data)
    .then((result) => self.postMessage(result))
    .catch((error: unknown) => {
      const result = resultBase();
      result.stderr = error instanceof Error ? error.message : String(error);
      result.durationMs = 0;
      self.postMessage(result);
    });
};
