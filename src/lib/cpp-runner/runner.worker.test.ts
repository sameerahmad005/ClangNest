import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RUNNER_LIMITS, type CppRunnerResult } from "../../types/cpp-runner";

const mocks = vi.hoisted(() => ({
  Clang: vi.fn(),
  LLD: vi.fn(),
  tarContents: vi.fn(),
  wasiInstances: [] as object[],
  compilerInstances: [] as WebAssembly.Instance[],
  compilerModules: [] as WebAssembly.Module[],
  compilerArgs: [] as string[][],
  linkerArgs: [] as string[][],
  warning: "main.cpp:1:1: warning: test warning\n",
  linkerFailure: false,
  exitCode: 0,
}));

vi.mock("browsercc", () => mocks);
vi.mock("browsercc/dist/clang.wasm?url", () => ({ default: "/clang.wasm" }));
vi.mock("browsercc/dist/lld.wasm?url", () => ({ default: "/lld.wasm" }));
vi.mock("browsercc/dist/sysroot.tar?url", () => ({ default: "/sysroot.tar" }));
vi.mock("@bjorn3/browser_wasi_shim", () => {
  class File {
    constructor(public data: Uint8Array) {}
  }
  class OpenFile {
    constructor(public file: File) {}
  }
  class ConsoleStdout {
    constructor(public write: (data: Uint8Array) => void) {}
  }
  class WASI {
    wasiImport = {};
    constructor(_args: string[], _env: string[], public fds: [OpenFile, ConsoleStdout, ConsoleStdout]) {
      mocks.wasiInstances.push(this);
    }
    start() {
      this.fds[1].write(this.fds[0].file.data);
      return mocks.exitCode;
    }
  }
  class WASIProcExit extends Error {
    constructor(public code: number) { super(); }
  }
  return { File, OpenFile, ConsoleStdout, WASI, WASIProcExit };
});

interface CompilerOptions {
  thisProgram: string;
  printErr(data: string): void;
  instantiateWasm(imports: WebAssembly.Imports, receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void): WebAssembly.Exports;
}

function instantiateCompiler(options: CompilerOptions) {
  const receiveInstance = vi.fn();
  const exports = options.instantiateWasm({}, receiveInstance);
  const [instance, module] = receiveInstance.mock.calls[0] as [WebAssembly.Instance, WebAssembly.Module];
  expect(exports).toBe(instance.exports);
  mocks.compilerInstances.push(instance);
  mocks.compilerModules.push(module);
}

const baseRequest = {
  source: "int main() {}",
  stdin: "",
  fileName: "main.cpp",
  flags: ["-std=c++17"],
  limits: { ...DEFAULT_RUNNER_LIMITS },
};

let worker: {
  onmessage: ((event: MessageEvent<typeof baseRequest>) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
let fetchMock: ReturnType<typeof vi.fn>;

function run(overrides: Partial<typeof baseRequest> = {}): Promise<CppRunnerResult> {
  return new Promise((resolve) => {
    worker.postMessage.mockImplementation((message: CppRunnerResult | { type: "phase" }) => {
      if ("status" in message) resolve(message);
    });
    worker.onmessage!({ data: { ...baseRequest, ...overrides } } as MessageEvent<typeof baseRequest>);
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.wasiInstances = [];
  mocks.compilerInstances = [];
  mocks.compilerModules = [];
  mocks.compilerArgs = [];
  mocks.linkerArgs = [];
  mocks.warning = "main.cpp:1:1: warning: test warning\n";
  mocks.linkerFailure = false;
  mocks.exitCode = 0;
  mocks.tarContents.mockReturnValue([]);

  mocks.Clang.mockImplementation(async (options: CompilerOptions) => {
    instantiateCompiler(options);
    let source = "";
    let called = false;
    return {
      FS: {
        mkdirTree() {},
        writeFile(_path: string, data: string | Uint8Array) {
          if (typeof data === "string") source = data;
        },
        readFile: () => new Uint8Array([0]),
      },
      callMain(args: string[]) {
        if (called) throw new Error("Clang main is one-shot");
        called = true;
        // Reproduce Emscripten's actual mutation, including the second warm call.
        args.unshift(options.thisProgram);
        if (args.includes("-###")) {
          options.printErr(`"/clang++" "-cc1" "-o" "/tmp/main.o" ${JSON.stringify(args[1])}`);
          options.printErr('"/wasm-ld" "-o" "a.out" "/tmp/main.o"');
          return 0;
        }
        mocks.compilerArgs.push([...args]);
        if (args[1] !== "-cc1") {
          options.printErr("error: unknown argument '-cc1'");
          return 1;
        }
        if (source === "syntax-error") {
          options.printErr("main.cpp:1:1: error: expected expression");
          return 1;
        }
        options.printErr(mocks.warning.trimEnd());
        return 0;
      },
    };
  });
  mocks.LLD.mockImplementation(async (options: CompilerOptions) => {
    instantiateCompiler(options);
    let called = false;
    return {
      FS: { mkdirTree() {}, writeFile() {}, readFile: () => new Uint8Array([0]) },
      callMain(args: string[]) {
        if (called) throw new Error("LLD main is one-shot");
        called = true;
        args.unshift(options.thisProgram);
        mocks.linkerArgs.push([...args]);
        if (mocks.linkerFailure || args[1] !== "-o") {
          options.printErr("wasm-ld: error: undefined symbol: missing");
          return 1;
        }
        return 0;
      },
    };
  });

  fetchMock = vi.fn(async () => ({
    ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0),
  }));
  vi.stubGlobal("fetch", fetchMock);
  worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() };
  vi.stubGlobal("self", worker);
  const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  vi.spyOn(WebAssembly, "compile")
    .mockResolvedValueOnce(new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])))
    .mockResolvedValueOnce(new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])))
    .mockResolvedValue(module);
  vi.spyOn(WebAssembly, "instantiate").mockResolvedValue({ exports: { _start() {} } } as never);
  await import("./runner.worker");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("worker compilation cache", () => {
  it("compiles each toolchain binary once but instantiates every driver, cc1, and linker afresh", async () => {
    expect((await run()).status).toBe("success");
    expect((await run({ source: "int main() { return 0; }" })).status).toBe("success");
    expect(WebAssembly.compile).toHaveBeenCalledTimes(4); // two engines and two genuine program compilations
    expect(mocks.compilerInstances).toHaveLength(5);
    expect(new Set(mocks.compilerInstances).size).toBe(5);
    const [driver, cc1, linker, nextCc1, nextLinker] = mocks.compilerModules;
    expect(driver).toBe(cc1);
    expect(nextCc1).toBe(cc1);
    expect(nextLinker).toBe(linker);
    expect(linker).not.toBe(cc1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries toolchain module compilation after a rejected engine compile", async () => {
    vi.mocked(WebAssembly.compile).mockReset()
      .mockRejectedValueOnce(new Error("engine compile failed"))
      .mockResolvedValue(new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])));
    const failed = await run();
    expect(failed).toMatchObject({ status: "runtime-error", stdout: "" });
    expect(failed.stderr).toContain("engine compile failed");
    expect(mocks.Clang).not.toHaveBeenCalled();
    expect((await run()).status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(WebAssembly.compile).toHaveBeenCalledTimes(5);
  });

  it("reuses the module and warnings with different stdin, but creates fresh WASI and instances", async () => {
    const first = await run({ stdin: "first input" });
    const second = await run({ stdin: "second input" });
    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    expect(first.stdout).toBe("first input");
    expect(second.stdout).toBe("second input");
    expect(second.compileOutput).toBe(first.compileOutput);
    expect(second.diagnostics).toEqual(first.diagnostics);
    expect(second.diagnostics[0]).toMatchObject({ severity: "warning", message: "test warning" });
    expect(WebAssembly.compile).toHaveBeenCalledTimes(3);
    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(2);
    expect(mocks.Clang).toHaveBeenCalledTimes(2);
    expect(mocks.LLD).toHaveBeenCalledTimes(1);
    expect(mocks.wasiInstances).toHaveLength(2);
    expect(mocks.wasiInstances[0]).not.toBe(mocks.wasiInstances[1]);
    const imports = vi.mocked(WebAssembly.instantiate).mock.calls.map((call) => call[1]);
    expect(imports[0]).not.toBe(imports[1]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.tarContents).toHaveBeenCalledTimes(1);
  });

  it("copies cached cc1 and linker args before mutating callMain on warm source changes", async () => {
    expect((await run()).status).toBe("success");
    expect((await run({ source: "int main() { return 0; }" })).status).toBe("success");
    expect(mocks.compilerArgs).toEqual([
      ["clang++", "-cc1", "-o", "/tmp/main.o", "main.cpp"],
      ["clang++", "-cc1", "-o", "/tmp/main.o", "main.cpp"],
    ]);
    expect(mocks.linkerArgs).toEqual([
      ["wasm-ld", "-o", "a.out", "/tmp/main.o"],
      ["wasm-ld", "-o", "a.out", "/tmp/main.o"],
    ]);
    expect(mocks.Clang).toHaveBeenCalledTimes(3);
    expect(mocks.LLD).toHaveBeenCalledTimes(2);
    expect(mocks.LLD.mock.calls.every(([options]) => options.thisProgram === "wasm-ld")).toBe(true);
    expect(WebAssembly.compile).toHaveBeenCalledTimes(4);
  });

  it.each([
    { source: "int main() { return 1; }" },
    { fileName: "other.cpp" },
    { flags: ["-std=c++20"] },
    { flags: ["-std=c++17", "-O2"] },
  ])("misses for a changed compilation key %j and retains only its last module", async (change) => {
    await run();
    await run(change);
    await run();
    expect(WebAssembly.compile).toHaveBeenCalledTimes(5);
  });

  it("clears the last success after a changed source fails, preserving compiler diagnostics", async () => {
    await run();
    const failed = await run({ source: "syntax-error" });
    expect(failed.status).toBe("compile-error");
    expect(failed.compileOutput).toContain("error: expected expression");
    expect(failed.diagnostics[0]).toMatchObject({ severity: "error", message: "expected expression" });
    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(1);
    await run();
    expect(WebAssembly.compile).toHaveBeenCalledTimes(4);
    expect(mocks.compilerArgs).toHaveLength(3);
  });

  it("retains genuine linker errors and retries rather than caching failed compilations", async () => {
    await run();
    mocks.linkerFailure = true;
    const failed = await run({ source: "changed" });
    expect(failed.status).toBe("compile-error");
    expect(failed.compileOutput).toContain("wasm-ld: error: undefined symbol: missing");
    mocks.linkerFailure = false;
    expect((await run({ source: "changed" })).status).toBe("success");
    expect(mocks.LLD).toHaveBeenCalledTimes(3);
  });

  it("does not cache execution failures or results", async () => {
    mocks.exitCode = 7;
    expect((await run({ stdin: "first" })).exitCode).toBe(7);
    mocks.exitCode = 0;
    const second = await run({ stdin: "second" });
    expect(second).toMatchObject({ status: "success", exitCode: 0, stdout: "second" });
    expect(WebAssembly.compile).toHaveBeenCalledTimes(3);
    expect(WebAssembly.instantiate).toHaveBeenCalledTimes(2);
  });

  it("reapplies compiler output limits on a cache hit", async () => {
    const first = await run({ limits: { ...DEFAULT_RUNNER_LIMITS, maxCompilerOutputBytes: 5 } });
    const second = await run();
    expect(first.compileOutput).toBe("main.");
    expect(second.compileOutput).toBe(mocks.warning);
    expect(WebAssembly.compile).toHaveBeenCalledTimes(3);
  });

  it("signals execution immediately before instantiation on cold and cached runs", async () => {
    await run();
    await run();
    const phases = worker.postMessage.mock.calls.flatMap(([message], index) =>
      message.type === "phase" ? [index] : []);
    expect(phases).toHaveLength(2);
    for (const [index, callIndex] of phases.entries()) {
      expect(worker.postMessage.mock.calls[callIndex][0]).toEqual({ type: "phase", phase: "execution" });
      expect(worker.postMessage.mock.invocationCallOrder[callIndex])
        .toBeLessThan(vi.mocked(WebAssembly.instantiate).mock.invocationCallOrder[index]);
      expect(vi.mocked(WebAssembly.instantiate).mock.invocationCallOrder[index])
        .toBeLessThan(worker.postMessage.mock.invocationCallOrder[callIndex + 1]);
    }
    expect(worker.close).not.toHaveBeenCalled();
  });

  it("rejects an HTTP asset failure and retries asset loading on the next request", async () => {
    const body = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, arrayBuffer: body });
    const failed = await run();
    expect(failed.status).toBe("runtime-error");
    expect(failed.stderr).toContain("Failed to load compiler asset /clang.wasm: HTTP 503");
    expect(body).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect((await run()).status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("resets a rejected fetch promise and retries", async () => {
    fetchMock.mockRejectedValueOnce(new Error("temporary network failure"));
    expect((await run()).stderr).toContain("temporary network failure");
    expect((await run()).status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("resets failed sysroot extraction so it can retry using loaded assets", async () => {
    mocks.tarContents.mockImplementationOnce(() => { throw new Error("invalid tar"); });
    expect((await run()).stderr).toContain("invalid tar");
    expect((await run()).status).toBe("success");
    expect(mocks.tarContents).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
