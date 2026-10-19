# ClangNest

> Browser-first C++23 practice with local WASM execution and optional AI-generated DSA challenges.

ClangNest is a browser-based C++23 practice workspace for learning data structures and algorithms. It combines Monaco editing, local IndexedDB projects, a Clang/WASI WebAssembly compiler running in a Web Worker, automatic two-example evaluation, and optional AI provider integrations. The local compiler works without an account, API key, server compiler, or execution service.

**GitHub description:** Browser-first C++23 DSA practice runner with local WASM execution, AI-generated challenges, model discovery/testing, and provider pricing filters.

## Highlights

- Run C++23 directly in the browser with `-std=c++23 -fno-exceptions`.
- Keep source and execution local with the WebAssembly/WASI runner.
- Compile and run stdin/stdout programs from a Monaco editor.
- Reuse compiled modules when only stdin changes.
- Practice AI-generated DSA problems with exactly two visible examples.
- Stream OpenAI-compatible AI responses with a safe unvalidated preview.
- Discover available models automatically and search/filter OpenRouter pricing.
- Test a selected AI model with a small JSON connectivity request.
- Store projects locally in IndexedDB.
- Deploy the frontend as a static Vite site on Vercel.

> **Current execution model:** Clang and LLD run inside browser WebAssembly. A future optional Vercel Sandbox native runner could provide faster changed-source compilation, but it is not included in the current release.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite, then enter stdin in the **Input** tab and press **Run** or `Ctrl+Enter`.

## C++ mode and complete programs

- The default is `-std=c++23 -fno-exceptions`: C++23 is the latest published standard; experimental C++26 mode is not the default. The UI and AI question prompt use the same standard label. Explicit flags passed through the runner API still override the whole default list; custom flags must also include `-fno-exceptions` for this sysroot's supported exception-free library mode.
- The bundled compiler identifies itself as **Clang 20.1.2**. Real WASM tests confirm `__cplusplus == 202302L`, C++23 `if consteval`, and `std::byteswap`. This changes compiler options, not the compiler binary, and is **not full C++23 library/runtime support**. Valid `std::print` and `std::format` calls now compile and run with the default options.
- The WASI sysroot lacks the C++ exception ABI. Previously, inline standard-library error paths could produce unresolved `__cxa_allocate_exception` / `__cxa_throw` references even in programs without an explicit `throw`. `-fno-exceptions` prevents these references in the verified library paths; it does not provide exception handling. Explicit `throw` and `try`/`catch` are unsupported and fail at compile time. A library error that would normally throw (for example, an invalid dynamic format string) can **abort with a runtime error instead**. Validate inputs and handle failures explicitly; no dummy exception symbols or ignored linker errors are used.
- Paste a complete program by **replacing** the starter code: focus the editor, press **Ctrl+A**, then paste. Keep exactly one `main()` definition. The runner compiles the editor contents unchanged; it does not wrap your code in another `main()` or remove duplicates for you.
- If Clang reports `redefinition of 'main'`, inspect both line locations and keep only the intended entry point. The Errors pane preserves the original compiler output once and adds replacement guidance. Changing the C++ version cannot fix two entry points. Existing saved source is never automatically rewritten.

## AI DSA question practice

1. Open **AI provider settings** using the gear in the top bar or **Provider settings** in the left DSA Practice tab.
2. **Choose a provider** in the numbered setup flow. Presets are **Google Gemini, OpenAI, Anthropic, OpenRouter, Groq, DeepSeek, Mistral, Together AI, and xAI**. **Custom OpenAI-compatible** is available for other servers. These are supported presets, not a claim to enumerate every AI vendor. The correct API route is filled for a preset; no API key or model name is embedded.
3. Enter your key in the password field. Available models **load automatically 700 ms after the last connection edit**, including when opening Settings with a saved valid connection. **Load available models** remains available for refresh/retry. Pick a returned model and **Save settings**. Discovery does not require a model name and never uses a guessed fallback. Existing saved models are preserved only if rediscovered when editing settings. For Custom, enter the complete `/chat/completions` endpoint; an optional models-list URL handles nonstandard routes. If that server has no listing API, explicitly enable **Manual model ID fallback**, which is labeled unverified and suppresses automatic discovery.
4. Select a DSA topic and Easy/Medium/Hard, then **Generate question**. Compatible streaming providers show a live, unvalidated text preview, elapsed wait time, and received character count. Only after the full response passes validation do the statement, formats, constraints, and exactly two examples become usable. Generation does not replace your code; it automatically selects the first example's stdin. For a no-input program, that input is an empty string.
5. Write a complete C++ program (C++23 mode). **Use input** selects an example for an ordinary Run. **Run 2 tests** feeds both inputs automatically, sequentially executing the current code. It reuses the compiled module when possible, not the program's previous output.
6. Inspect Passed/Failed, expected output, actual stdout, and compiler/runtime errors in the case cards. Passing requires successful execution, exit code 0, non-truncated output, and matching text. CRLF, trailing spaces/tabs on lines, and trailing newlines are ignored; leading and internal whitespace and all other text remain significant.

**Getting a key:** beneath the Provider dropdown, **Get an API key** links are available for Google Gemini, OpenAI, Anthropic, OpenRouter, Groq, DeepSeek, Mistral, Together AI, and xAI. Each opens the provider's official key page or console in a new tab with no opener or referrer access. Sign in and create the key directly on that provider's site, then enter it in this app's password field. Links are static and never include your key or custom endpoint. For Custom OpenAI-compatible servers, obtain a key from your server administrator; the app does not guess a key-management URL.

Only two **visible examples** are checked, not a hidden judge. AI-generated statements and expected answers can be incorrect, and passing both examples does not prove your solution correct for all inputs. Changing code invalidates old test results; editing during a run cancels that run. Compiler failure, cancellation, and timeout stop the remaining cases rather than inventing results. Generated questions are currently kept in page memory, not saved with projects.

### Model discovery and HTTP 404

- Gemini lists `/models` on its API base, follows page tokens, retains `generateContent` models, and removes the `models/` prefix before constructing the generation route. Enter its **base** URL, not a full `models/...:generateContent` URL.
- Anthropic lists models with native API headers and cursor pagination and generates through `/v1/messages`. Other presets use their OpenAI-compatible model-list/chat-completions routes. Together also supports its top-level model array response.
- Model lists come from your configured provider, not a bundled catalog of model IDs. Some lists expose non-chat models or models requiring additional access. Being listed does not prove that chat/JSON generation is available for your key.
- Listing automatically starts after a valid connection stays unchanged for 700 ms. It is cancellable while queued or in progress, and limited to 30 seconds, 50 pages, 5,000 returned entries and 2 MiB total response data. Only one automatic attempt is made for an unchanged connection; completion, errors, consent changes, searches and filters do not trigger retries. **Load available models** bypasses the debounce for manual refresh/retry without dispatching a second automatic request. Exceeding a limit reports an error rather than silently showing a partial list. The UI does not replace an unavailable model automatically.
- If generation returns **HTTP 404**, Settings opens with instructions to load a current model and check the endpoint. A model-list 404 is reported separately as a missing models route. The original error alone cannot distinguish a retired/inaccessible model from a wrong endpoint; discovery and route validation avoid common causes but do not bypass provider permissions.
- Changing provider, endpoint, models-list URL, or key invalidates the loaded list and cancels any old request. An old response cannot populate the new provider's dropdown.

### Testing a selected model

- Choosing a model (or rediscovering a saved selection) automatically queues a tiny JSON test after **500 ms**. Custom manual IDs are checked after the same pause once valid. **Test model** retries explicitly; **Cancel model test** stops queued or in-flight work.
- A real, correctly completed `{"ok":true}` response produces **Model responded (x ms)**. Timeouts and authentication, quota, route, malformed-response or network errors show **Model not verified** with an explanation. A timeout is not proof that a model is unavailable. No success is displayed merely because the model was listed.
- The check sends a fixed prompt directly to the configured generation endpoint with the selected model and key. It consumes quota and **may cost tokens**. It has a **20-second** deadline, a **64 KiB** response limit, no automatic retries, and never includes your source/projects. A successful tiny non-streaming JSON test does not guarantee full DSA generation, streaming support, remaining quota, or answer correctness. Saving remains possible without a passing test.
- Changing the connection/model, hiding the selection with filters, refreshing the list, closing Settings, or forgetting the key cancels old checks and discards late results. Searches/consent changes preserving the selected model do not repeat checks. Probe results are not persisted or logged.

### OpenRouter search and free models

1. Choose **OpenRouter** in AI provider settings and enter an **OpenRouter API key**, not a Gemini or other provider's key. The preset fills `https://openrouter.ai/api/v1/chat/completions`; model discovery uses `https://openrouter.ai/api/v1/models`.
2. Wait for the model list to load automatically, or click **Load available models** to refresh/retry. Search by model name or ID (case-insensitive); OpenRouter also offers **All / Free / Paid / Unknown** pricing categories with counts. Search and category filters combine locally without additional requests. Name/ID search is available for other providers too.
3. Select a visible model and **Save settings**, then **Generate question**. Filtering out your selection clears it and disables Save; no substitute is selected automatically. Changing the connection or reloading resets the filters.

Categories use OpenRouter's reported base pricing, never a `:free` suffix or a bundled list. **Free** requires valid zero prompt and completion prices, plus zero request/reasoning prices when those fields are reported. **Paid** means valid prices include a positive charge; missing or malformed required prices, or malformed reported request/reasoning prices, are **Unknown**. These labels describe reported text pricing, not your account's credits, quota, permissions, conditional pricing, future charges, or a guarantee that the model supports this app's JSON generation request. Refresh the list and check the provider's current terms before use.

### AI response time and streaming

- OpenRouter and other OpenAI-compatible chat providers receive `stream: true`. Answer text appears as it arrives, in a plain-text **Live response preview — not yet validated**. Providers that ignore streaming and return JSON still work; Gemini and Anthropic currently retain their native non-streaming JSON paths. Their answers cannot appear until the provider sends them.
- The wait indicator shows elapsed seconds; streamed replies show received characters. Slow-provider guidance appears after 10 seconds, Cancel remains available, and successful requests show total generation time including network/provider work. Preview text is not a usable problem, is never inserted into your source, and is cleared on success/failure/cancellation. Final schema and exactly-two-example validation are unchanged.
- The prompt is shorter and asks for concise prose/examples. No model is silently switched, no reasoning settings are guessed, and there are no automatic generation retries or extra discovery requests on Generate. The generation deadline remains 45 seconds. Provider queueing, reasoning, network conditions and quota still control actual completion time; streaming improves visibility, not the provider's computation speed.
- Streaming accepts bounded SSE: at most 1 MiB total wire data (including event overhead) and 128 KiB accumulated answer content. Refusals, truncated/error streams and limits fail safely; partial examples are never accepted. Provider reasoning fields are not copied into previews. The UI renders at most the first 6,000 preview characters as text, never HTML.

**Reproducible local evidence:** run `npm test -- src/lib/ai-practice/provider.test.ts src/lib/ai-practice/stream.test.ts`. An identical fixed problem with controlled **fake** delays becomes visible at 100 ms through SSE versus 1,000 ms through a full JSON response; both complete and validate at 1,000 ms. This demonstrates earlier preview, **not a measured live-provider speedup**. The Easy/Arrays prompt shrank from 862 to 689 UTF-8 bytes (173 bytes / 20.1% less input); output speed and AI correctness were not benchmarked against a live account.

### API-key privacy and network behavior

- Do not hardcode a personal key in source, `VITE_*` environment variables, example files, or public deployment configuration. Client-side environment variables become public bundle contents.
- Keys are kept in sessionStorage by default. **Remember on this device** explicitly opts into readable localStorage; neither is encrypted or protected from scripts on this origin/browser-profile access. **Forget key** removes it from both stores.
- Changing provider or endpoint clears the key field to prevent accidental forwarding. Generation, model testing, and model-list endpoints receive the key in an authentication header; if you supply a separate models URL, trust that endpoint too. Requests omit cookies, reject redirects, use 45-second generation/20-second model-test/30-second listing deadlines, and are not automatically retried.
- Only the chosen topic/difficulty and generation instructions are sent for AI generation. Your source files and saved projects are not sent to the AI provider by this feature. Prompts and provider responses are not logged by the application.
- Gemini uses `x-goog-api-key`; Anthropic uses `x-api-key`, the API version, and its explicit direct-browser-access header; OpenAI-compatible providers use `Authorization: Bearer`. These are personal-key browser requests, not a secure way to share an organization's secret key. A provider may block browser access via CORS or reject a model, and free quota availability is not guaranteed. The UI reports authentication/quota/network/malformed-response failures without falling back to fake questions or fake model lists.
- Rotate any key shared in chat or another public location. Use separate, limited-quota personal credentials. A public shared key requires a separately secured server design and must never be embedded in this app.

## Public deployment security and privacy

**Security and privacy notes from developer Sameer Ahmad:**

- The default compiler is browser-only: C++ source and stdin stay local to the browser's WebAssembly/WASI runner. The app has no backend native runner currently.
- User API keys are user-controlled browser secrets. A public frontend cannot make them theft-proof: keys are sent directly to the configured provider, and browser-origin scripts or extensions with access to the origin may be able to read them.
- `sessionStorage` is the default key store. `localStorage` is used only when **Remember on this device** is explicitly selected. Neither store is encrypted against scripts running in the same origin.
- The app never bundles a project or provider key, and it does not log source, project data, provider queries/prompts, provider responses, or referrers. Direct provider requests still require users to trust the configured HTTPS endpoint and provider.
- Monaco is bundled from the project dependencies with local worker files; the public deployment does not need to execute Monaco's CDN `loader.js`.
- The deployment Content Security Policy is defense-in-depth, not a guarantee. Use restricted, rotatable, limited-quota keys, and do not use an organization-wide secret in a public frontend.
- A remote native runner would require a separate authenticated sandbox with its own isolation and resource controls; it is not part of this deployment.
- C++ compile times are limited by WebAssembly and browser resources. A warm worker/cache makes repeated runs faster, but it does not guarantee a fixed time or promise a 15-second fix for changed-source compilation.

For public responsible-disclosure reports, use the repository's [Issues page](https://github.com/sameerahmad005/ClangNest/issues). Do not post API keys or other secrets in an issue.

Useful checks:

```bash
npm test
npm run test:integration
npm run build
npm run preview
```

The first compilation downloads/initializes roughly 90 MB of compiler assets in the browser. Later runs can reuse the browser cache. A production build is large because it includes Clang, LLD, and the C++ sysroot; this is the trade-off for not using a paid or hosted execution API.

## Faster repeated runs

- One worker stays warm between successful runs and ordinary compilation errors.
- Compiled Clang/LLD WebAssembly engine modules and extracted sysroot entries stay in memory for that worker. Asset downloads and engine compilation start in parallel. Emscripten's `instantiateWasm` hook creates a **fresh instance** from each cached engine module; compiler memory, filesystem and one-shot `callMain` state are never shared between invocations.
- Compiler-driver arguments are reused when the filename and flags match. Each one-shot compiler/linker invocation receives a fresh argument array, since Emscripten mutates it.
- Only the most recent successful compiled module is cached, keyed by the exact source, filename, and flags. Pressing Run again or changing only stdin skips compilation, but still creates and runs a **new WASI instance**. Program output is never replayed from a cache.
- Editing source invalidates the module cache, including when that edit fails to compile. Changed code still takes seconds to compile with this toolchain.
- Stop, execution failure, timeout, and refresh discard the warm worker/cache. The next run initializes it again. Keeping compiler assets warm uses additional browser memory; it is not a measured memory quota.

The terminal's `ms total` value is measured request-to-result latency, including compilation when needed, not a CPU-only execution time.

### Reproducible real-toolchain check and benchmark

Run `npm run test:integration`. This opt-in test uses the **real browsercc Clang/LLD binaries and WASI shim in Node**, bridging only asset transport and Worker messaging. It verifies Hello World, changed source, fresh stdin on cached runs, empty input/nonzero exit, syntax errors without stale output, recovery, older language features, C++23 mode and newer features, valid `std::print`/`std::format`/`vector::at` calls, reproduction of the old missing-symbol failure when exception-free flags are overridden, compile-time rejection of explicit exception handling, runtime abort/recovery for an invalid dynamic format string, explicit flag cache invalidation, and duplicate-main diagnostics at lines 3 and 12 followed by a successful single-main correction. The normal `npm test` suite separately covers worker lifecycle, cancellation, watchdogs, and cache behavior with controlled mocks.

One Windows run using Node **v24.14.0**, browsercc **0.1.1**, `-std=c++17`, and identical Hello World source measured:

| Workload | Individual samples (ms) | Median (ms) |
| --- | --- | --- |
| Fresh worker-module state / full compilation | 4912.02, 5747.59, 5391.70 | 5391.70 |
| Same worker / cached module / fresh execution | 0.94, 0.61, 1.20 | 0.94 |

A changed-source compilation took **3710.58 ms**, and changing only stdin afterwards took **0.75 ms**, with outputs `14` then `42`. These numbers measure the local Node worker-code path, excluding React, browser messaging, and network download time. Fresh-state samples reset module caches in Node; they do not restart the OS or flush its filesystem/V8 caches. They illustrate the benefit of avoiding recompilation, **not a promised browser speedup or a like-for-like deployed before/after benchmark**. Browser performance depends on device and cache state. Updated browser verification was blocked when the built-in browser could not create a tab; do not treat the Node measurements as a browser check.

### Measured engine-module reuse and IDE-speed limits

The latest optimization reuses the compiled Clang/LLD engine code instead of initializing each factory from `wasmBinary` again. Fresh compiler instances still parse and compile every changed source. Before/after checks used the same input/output and C++23 `-fno-exceptions` flags, with three genuinely changed sources per header to prevent cached program execution from masquerading as compilation.

Environment: Windows x64, Node **v24.14.0**, V8 **13.6.233.17-node.41**, Clang **20.1.2**, browsercc **0.1.1**, AMD Ryzen 5 5500U (12 logical CPUs), about 7.33 GiB RAM. Two sequential before/after pairs restored the original implementation for each baseline. This is the Node-bridged real-WASM worker path, excluding browser messaging, HTTP downloads and React. It is not a browser or native-compiler benchmark. Times were noisy; the more conservative second comparison was:

| Changed-source workload | Before samples (ms) | After samples (ms) | Median before → after | Reduction |
| --- | --- | --- | --- | --- |
| `<iostream>` | 5451.987, 4805.541, 4900.671 | 4949.786, 4569.905, 4776.199 | 4900.671 → 4776.199 ms | 124.472 ms / 2.54% |
| `<bits/stdc++.h>` | 6840.514, 6564.946, 6147.202 | 6295.730, 6127.980, 6210.352 | 6564.946 → 6210.352 ms | 354.594 ms / 5.40% |

The first comparison measured medians of 4997.166 → 4509.475 ms for `<iostream>` and 6575.571 → 6079.807 ms for `<bits/stdc++.h>` (9.76% and 7.54%). The second pair's single cold-Hello samples were 7554.350 → 7191.970 ms; unchanged cached executions remained around 1 ms, with no reliable improvement claimed for that already-fast path. “Cold” resets worker module state, not OS disk cache or browser HTTP cache. Engine code is retained for the worker lifetime; browser-specific latency and memory were not measured.

Reproduce the current workload with `npm run test:integration -- -t "benchmarks cold, changed-source"`. It logs every sample, environment, flags, medians and verified output. Profiling found actual C++ parsing/code generation dominant, not just setup. A split-sysroot experiment was reverted because end-to-end gains were inconsistent.

For practical speed: keep the page/worker warm, rerun without changing source when only stdin differs, and include only the headers needed instead of `<bits/stdc++.h>`. **Native IDE-like changed-source compilation generally needs a local/native Clang or GCC integration**, rather than LLVM running inside WebAssembly. No local service, execution server or new toolchain was installed; adding one would change deployment and sandbox requirements. This optimization is modest, not a promise of instant browser compilation.

## Compiler integration

The adapter uses [`browsercc`](https://github.com/BertalanD/browsercc) 0.1.x, which packages an LLVM/Clang WASM compiler and WASI target, plus [`@bjorn3/browser_wasi_shim`](https://github.com/bjorn3/browser_wasi_shim) for stdin/stdout/stderr. The adapter passes `-std=c++23 -fno-exceptions` by default, configured in `src/lib/cpp-runner/standard.ts`, and the worker links a WASI executable in memory. The historical timing table above was measured in C++17 mode, not the new default.

The browsercc package's default loader expects compiler files beside its generated module. `src/lib/cpp-runner/runner.worker.ts` instead imports Vite asset URLs explicitly and supplies `locateFile`, which is important for both Vite development and production builds.

The Clang driver, Clang `cc1`, and `wasm-ld` stages run in separate compiler instances because the Emscripten toolchain's `callMain` entry point is one-shot. The linker instance is initialized with `thisProgram: "wasm-ld"`; using the generic `lld` program name makes it print a driver-help message instead of linking.

The toolchain is licensed by its upstream projects; keep the package and LLVM/WASI notices when redistributing built assets. The browsercc wrapper is MIT and browser_wasi_shim is MIT/Apache-2.0. Review upstream notices before publishing a copy outside this project.

## Safety and limits

- User code runs in a dedicated Web Worker as WebAssembly/WASI, never through `eval`, `new Function`, or a server endpoint.
- The worker has no application filesystem or network API exposed to the compiled program.
- Source, stdin, compiler diagnostics, and output have byte limits.
- Compilation and execution are bounded by worker watchdogs. Timeout/cancel terminates the worker; the next run creates a fresh one.
- The default execution timeout is 3 seconds and the hard ceiling is 30 seconds.
- The default source limit is 256 KiB, input 64 KiB, output 64 KiB, and compiler diagnostics 64 KiB.
- WASI/browser WebAssembly does not provide a strong per-program memory quota here. The UI does not claim complete sandbox security, and browser/OS resource exhaustion cannot be ruled out as completely as it can in a hardened server sandbox.
- This is batch stdin: input is supplied before execution and reaches EOF. It is not an interactive terminal.
- browsercc's WASI toolchain does not provide all POSIX features, C++ exceptions, or threading. Programs using unsupported features may fail to compile or run.

## Project structure

```text
src/
  main.tsx                         React entry point
  App.tsx                          workspace orchestration
  components/PracticePanel.tsx      DSA question and test-case UI
  components/AiSettingsDialog.tsx   provider and credential settings
  app.css                          responsive dark/light workspace styles
  lib/cpp-runner/                  typed adapter, Worker, limits, diagnostics
  lib/ai-practice/                 provider adapters, response validation, local settings
  lib/practice-evaluator.ts         compiler-independent testcase evaluation
  lib/project-storage/             IndexedDB project persistence
  types/                            runner and project contracts
```

The runner contract remains independent from Monaco and the AI provider. The practice evaluator consumes source, stdin and expected output through that contract; it does not use an AI model to judge code.

## Deployment to Vercel

Import the project as a Vite app. Vercel detects the defaults automatically; use:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

No environment variables are required. Vercel must serve `.wasm` files as WebAssembly assets; Vercel's static asset handling does this by default. Verify the production URL with `npm run preview` and the browser Network panel: `clang.wasm`, `lld.wasm`, and `sysroot.tar` must return successful responses rather than the SPA HTML fallback.

## Troubleshooting

- **The page loads but Run fails with `expected magic word ... <!doctype`:** an asset URL is returning `index.html`. Rebuild with the current worker implementation and verify the three compiler asset requests in the Network panel.
- **A compile error appears:** open the Errors tab; Clang diagnostics are preserved and stale output is cleared before every run.
- **`__cxa_allocate_exception` / `__cxa_throw` are undefined:** reload the updated runner to use its exception-free defaults. If calling the runner API with custom flags, include `-fno-exceptions`. This fixes the verified inline library references, not arbitrary exception-dependent libraries; programs requiring exception handling need a different runtime/toolchain.
- **An infinite loop does not stop immediately:** the worker is terminated by the watchdog. The browser may need a moment to release the WebAssembly instance, but the editor remains usable.
- **Projects disappear:** check that the browser allows IndexedDB for the origin. Private browsing modes and storage-clearing extensions can remove local projects.
- **Generation needs an API key:** open the gear menu and enter your own key; there is intentionally no embedded secret.
- **AI authentication, quota, or CORS errors:** check provider/model access and quota. A custom endpoint must accept browser-origin requests and JSON-mode chat completions (SSE streaming or a complete JSON response). Saving validates configuration only; listing happens automatically after a valid connection is ready or on **Load available models**, model tests run after selection or on **Test model**, and generation happens on **Generate question**.

## Verification

`npm test` covers provider request formats with fake credentials, bounded SSE parsing and progress previews, fake-delay responsiveness measurements, debounced automatic model discovery and selected-model JSON tests, OpenRouter pricing classification, combined model search/category filters and selection safety, schema/size validation, cancellation, sanitized failures, key persistence, provider setup and stale-response handling, UI generation and automatic stdin flows, wrong answers, compiled-engine reuse with fresh compiler instances, and the existing runner/storage behavior. `npm run test:integration` runs actual Clang/WASI programs and the practice evaluator with fixed, explicitly non-AI fixtures; it does not contact an AI service. Live model tests, discovery and generation must be checked separately with a user-entered credential; mocked tests are not proof that a particular key/model has working access or quota. An unauthenticated check reached OpenRouter's public catalog with HTTP 200; that checks catalog reachability only, not the app's authenticated browser flow or generation access.
