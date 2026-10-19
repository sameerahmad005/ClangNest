export function parseCompilerInvocation(driverOutput: string) {
  const commands = driverOutput.split("\n")
    .filter((line) => line.trimStart().startsWith('"'))
    .map((line) => [...line.matchAll(/"((?:\\.|[^"\\])*)"/g)]
      .map((match) => match[1].replace(/\\(["\\])/g, "$1")));

  const invocation = (key: "-cc1" | "wasm-ld") => {
    const command = commands.find((args) => key === "-cc1"
      ? args[1] === key
      : args[0]?.split("/").pop() === key);
    if (!command) throw new Error(`Clang driver did not emit a ${key} invocation.`);
    const args = command.slice(1);
    const outputIndex = args.indexOf("-o");
    const output = args[outputIndex + 1];
    if (outputIndex === -1 || !output) {
      throw new Error(`Clang driver ${key} invocation is missing an output file.`);
    }
    return { args, output };
  };

  return { compiler: invocation("-cc1"), linker: invocation("wasm-ld") };
}
