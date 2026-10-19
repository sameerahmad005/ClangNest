import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CppRunnerResult } from "../../types/cpp-runner";
import { CppRunner, runCpp, type RunnerWorker } from "./cpp-runner";
import { CPP_STANDARD, DEFAULT_CPP_FLAGS } from "./standard";

class FakeWorker implements RunnerWorker {
  readonly listeners = {
    message: new Set<EventListener>(),
    error: new Set<EventListener>(),
  };
  postMessage = vi.fn<(message: unknown) => void>();
  terminate = vi.fn();

  addEventListener(type: "message" | "error", listener: EventListener): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: "message" | "error", listener: EventListener): void {
    this.listeners[type].delete(listener);
  }

  message(data: unknown): void {
    for (const listener of this.listeners.message) listener(new MessageEvent("message", { data }));
  }

  error(message?: string): void {
    const event = Object.assign(new Event("error"), { message });
    for (const listener of this.listeners.error) listener(event);
  }
}

function result(status: CppRunnerResult["status"] = "success", stdout = ""): CppRunnerResult {
  return {
    status, stdout, stderr: "", compileOutput: "", diagnostics: [],
    exitCode: status === "success" ? 0 : null, durationMs: 0, outputTruncated: false,
  };
}

const request = { source: "int main() {}", limits: { maxCompileTimeMs: 100, timeoutMs: 20 } };

function setup() {
  const workers: FakeWorker[] = [];
  const workerFactory = vi.fn(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { runner: new CppRunner({ workerFactory }), workers, workerFactory };
}

function expectClean(worker: FakeWorker) {
  expect(worker.listeners.message.size).toBe(0);
  expect(worker.listeners.error.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
}

describe("CppRunner worker lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reuses one worker for successive successful runs and removes abort listeners", async () => {
    const { runner, workers, workerFactory } = setup();
    const controller = new AbortController();
    const removeAbort = vi.spyOn(controller.signal, "removeEventListener");
    const first = runner.run({ ...request, signal: controller.signal });
    const worker = workers[0];
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: request.source, stdin: "", fileName: "main.cpp", flags: [...DEFAULT_CPP_FLAGS],
    }));
    worker.message(result("success", "first"));
    expect(await first).toMatchObject({ status: "success", stdout: "first" });
    expectClean(worker);
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(worker.terminate).not.toHaveBeenCalled();

    const second = runner.run(request);
    worker.message(result("success", "second"));
    expect(await second).toMatchObject({ status: "success", stdout: "second" });
    expect(workerFactory).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expectClean(worker);
    runner.dispose();
  });

  it("defaults to C++23 without exceptions and preserves explicit flags without sharing arrays", async () => {
    expect(CPP_STANDARD).toBe("C++23");
    expect(DEFAULT_CPP_FLAGS).toEqual(["-std=c++23", "-fno-exceptions"]);
    const { runner, workers } = setup();
    for (const flags of [undefined, ["-std=c++23"], ["-std=c++17", "-O2"], []]) {
      const pending = runner.run({ ...request, flags });
      const worker = workers[0];
      const posted = worker.postMessage.mock.lastCall![0] as { flags: string[] };
      expect(posted.flags).toEqual(flags ?? DEFAULT_CPP_FLAGS);
      expect(posted.flags).not.toBe(flags ?? DEFAULT_CPP_FLAGS);
      if (flags === undefined) expect(posted.flags).toContain("-fno-exceptions");
      worker.message(result());
      await pending;
    }
    expect(workers).toHaveLength(1);
    runner.dispose();
  });

  it("retains the worker after compile failure without returning the previous result", async () => {
    const { runner, workers } = setup();
    const first = runner.run(request);
    const worker = workers[0];
    worker.message(result("success", "old output"));
    await first;
    const second = runner.run({ ...request, source: "invalid C++" });
    const failure = { ...result("compile-error"), compileOutput: "main.cpp:1:1: error: invalid source" };
    worker.message(failure);
    expect(await second).toMatchObject({ ...failure, durationMs: expect.any(Number) });
    expectClean(worker);
    expect(worker.terminate).not.toHaveBeenCalled();
    const third = runner.run(request);
    worker.message(result("success", "fresh output"));
    expect(await third).toMatchObject({ status: "success", stdout: "fresh output", compileOutput: "" });
    expect(workers).toHaveLength(1);
    runner.dispose();
  });

  it("treats phase as progress and gives execution its full independent timeout", async () => {
    const { runner, workers } = setup();
    const settled = vi.fn();
    const pending = runner.run(request).then(settled);
    const worker = workers[0];
    await vi.advanceTimersByTimeAsync(90);
    worker.message({ type: "phase", phase: "execution" });
    await vi.advanceTimersByTimeAsync(15);
    expect(settled).not.toHaveBeenCalled();
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.message(result("success", "done"));
    await pending;
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ status: "success", stdout: "done" }));
    expectClean(worker);
    runner.dispose();
  });

  it("enforces the compile watchdog without borrowing execution time and recovers", async () => {
    const { runner, workers } = setup();
    const pending = runner.run(request);
    const worker = workers[0];
    await vi.advanceTimersByTimeAsync(99);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ status: "timeout", stderr: "Compilation exceeded the 100 ms time limit." });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expectClean(worker);
    const recovery = runner.run(request);
    expect(workers).toHaveLength(2);
    workers[1].message(result());
    expect((await recovery).status).toBe("success");
    runner.dispose();
  });

  it("enforces execution timeout from the phase and does not extend it for repeated phases", async () => {
    const { runner, workers } = setup();
    const controller = new AbortController();
    const removeAbort = vi.spyOn(controller.signal, "removeEventListener");
    const pending = runner.run({ ...request, signal: controller.signal });
    const worker = workers[0];
    await vi.advanceTimersByTimeAsync(5);
    worker.message({ type: "phase", phase: "execution" });
    await vi.advanceTimersByTimeAsync(19);
    worker.message({ type: "phase", phase: "execution" });
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ status: "timeout", stderr: "Execution exceeded the 20 ms time limit." });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    expectClean(worker);
  });

  it("cancels, ignores late messages from the old worker, and recovers with a new worker", async () => {
    const { runner, workers } = setup();
    const controller = new AbortController();
    const pending = runner.run({ ...request, signal: controller.signal });
    const worker = workers[0];
    controller.abort();
    expect((await pending).status).toBe("cancelled");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expectClean(worker);
    const recovery = runner.run(request);
    worker.message(result("success", "stale"));
    workers[1].message(result("success", "new"));
    expect(await recovery).toMatchObject({ status: "success", stdout: "new" });
    expectClean(workers[1]);
    runner.dispose();
  });

  it("returns postMessage failures as results and resets the worker", async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => { throw new Error("Cannot clone request"); });
    const replacement = new FakeWorker();
    const workerFactory = vi.fn().mockReturnValueOnce(worker).mockReturnValue(replacement);
    const runner = new CppRunner({ workerFactory });
    const controller = new AbortController();
    const removeAbort = vi.spyOn(controller.signal, "removeEventListener");
    expect(await runner.run({ ...request, signal: controller.signal })).toMatchObject({
      status: "runtime-error", stderr: "Cannot clone request",
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    expectClean(worker);
    const recovery = runner.run(request);
    replacement.message(result());
    expect((await recovery).status).toBe("success");
    runner.dispose();
  });

  it.each(["event", "result"])("resets the worker after a runtime error delivered as %s", async (kind) => {
    const { runner, workers } = setup();
    const pending = runner.run(request);
    const worker = workers[0];
    if (kind === "event") worker.error("Worker crashed");
    else worker.message({ ...result("runtime-error"), stderr: "Worker crashed" });
    expect(await pending).toMatchObject({ status: "runtime-error", stderr: "Worker crashed" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expectClean(worker);
    const recovery = runner.run(request);
    expect(workers).toHaveLength(2);
    workers[1].message(result());
    await recovery;
    runner.dispose();
  });

  it("rejects duplicate runs without posting or sharing the active run's listeners", async () => {
    const { runner, workers, workerFactory } = setup();
    const first = runner.run(request);
    const worker = workers[0];
    const duplicateAbort = new AbortController();
    const duplicate = await runner.run({ ...request, signal: duplicateAbort.signal });
    expect(duplicate).toMatchObject({ status: "runtime-error", stderr: "A C++ run is already in progress." });
    expect(workerFactory).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.listeners.message.size).toBe(1);
    expect(worker.listeners.error.size).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    duplicateAbort.abort();
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.message(result("success", "original"));
    expect(await first).toMatchObject({ status: "success", stdout: "original" });
    expectClean(worker);
    runner.dispose();
  });

  it("disposes idle workers idempotently and permits a later fresh run", async () => {
    const { runner, workers } = setup();
    const pending = runner.run(request);
    workers[0].message(result());
    await pending;
    runner.dispose();
    runner.dispose();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const recovery = runner.run(request);
    expect(workers).toHaveLength(2);
    workers[1].message(result());
    await recovery;
    runner.dispose();
  });

  it("disposes active workers by settling their run as cancelled", async () => {
    const { runner, workers } = setup();
    const pending = runner.run(request);
    runner.dispose();
    expect((await pending).status).toBe("cancelled");
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expectClean(workers[0]);
    runner.dispose();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("does not create workers for invalid or already cancelled requests", async () => {
    const { runner, workerFactory } = setup();
    const controller = new AbortController();
    controller.abort();
    expect((await runner.run({ ...request, signal: controller.signal })).status).toBe("cancelled");
    expect((await runner.run({ source: "oversized", limits: { maxSourceBytes: 1 } })).status).toBe("limit-exceeded");
    expect(workerFactory).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns worker creation failures and permits retry", async () => {
    const worker = new FakeWorker();
    const workerFactory = vi.fn()
      .mockImplementationOnce(() => { throw new Error("Worker unavailable"); })
      .mockReturnValue(worker);
    const runner = new CppRunner({ workerFactory });
    expect(await runner.run(request)).toMatchObject({ status: "runtime-error", stderr: "Worker unavailable" });
    expectClean(worker);
    const recovery = runner.run(request);
    worker.message(result());
    expect((await recovery).status).toBe("success");
    runner.dispose();
  });

  it("reuses the default runCpp singleton", async () => {
    const worker = new FakeWorker();
    const WorkerMock = vi.fn(function () { return worker; });
    vi.stubGlobal("Worker", WorkerMock);
    const first = runCpp(request);
    worker.message(result("success", "first"));
    expect((await first).stdout).toBe("first");
    const second = runCpp(request);
    worker.message(result("success", "second"));
    expect((await second).stdout).toBe("second");
    expect(WorkerMock).toHaveBeenCalledTimes(1);
    expectClean(worker);
    // Release the module's cached fake worker for other tests.
    const controller = new AbortController();
    const cleanup = runCpp({ ...request, signal: controller.signal });
    controller.abort();
    expect((await cleanup).status).toBe("cancelled");
    expectClean(worker);
  });
});
