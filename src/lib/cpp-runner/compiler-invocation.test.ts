import { describe, expect, it } from "vitest";
import { parseCompilerInvocation } from "./compiler-invocation";

describe("compiler invocation", () => {
  const compiler = ' "/clang++" "-cc1" "-o" "/tmp/main.o" "main.cpp"';
  const linker = ' "/wasm-ld" "-o" "a.out" "/tmp/main.o" "-lc++"';

  it("separates compiler and linker arguments from newline-delimited driver output", () => {
    const result = parseCompilerInvocation([
      "clang version 19", 'note: use "-cc1" or "wasm-ld"', compiler, linker, "",
    ].join("\n"));
    expect(result.compiler).toEqual({
      args: ["-cc1", "-o", "/tmp/main.o", "main.cpp"], output: "/tmp/main.o",
    });
    expect(result.linker).toEqual({
      args: ["-o", "a.out", "/tmp/main.o", "-lc++"], output: "a.out",
    });
  });

  it("preserves spaces and decodes quoted arguments", () => {
    const result = parseCompilerInvocation([
      String.raw` "/clang++" "-cc1" "-DNAME=\"hello\"" "-o" "/tmp/my file.o" "my file.cpp"`,
      linker,
    ].join("\r\n"));
    expect(result.compiler.args).toContain('-DNAME="hello"');
    expect(result.compiler.args).toContain("my file.cpp");
    expect(result.compiler.output).toBe("/tmp/my file.o");
  });

  it("reports a missing invocation instead of invoking an empty command", () => {
    expect(() => parseCompilerInvocation(compiler)).toThrow("did not emit a wasm-ld invocation");
    expect(() => parseCompilerInvocation(linker)).toThrow("did not emit a -cc1 invocation");
  });

  it("requires an output path for both stages", () => {
    expect(() => parseCompilerInvocation(`"clang++" "-cc1"\n${linker}`)).toThrow("missing an output file");
    expect(() => parseCompilerInvocation(`${compiler}\n"wasm-ld" "-o"`)).toThrow("missing an output file");
  });
});
