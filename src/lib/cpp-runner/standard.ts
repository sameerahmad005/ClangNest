export const CPP_STANDARD = "C++23";
// The WASI sysroot has no exception ABI; disable inline library exception references.
export const DEFAULT_CPP_FLAGS = ["-std=c++23", "-fno-exceptions"] as const;
