# ClangNest

> AI-assisted DSA practice with a local C++23 compiler that runs in your browser.

ClangNest helps students practice data structures and algorithms without setting up a native C++ toolchain first. Choose a topic and difficulty, generate a structured question with an AI provider, solve it in Monaco, run the code against two visible examples, and inspect the exact output and diagnostics.

- **Owner:** [Sameer Ahmad](https://www.linkedin.com/in/sameer-abrar/)
- **Source:** [github.com/sameerahmad005/ClangNest](https://github.com/sameerahmad005/ClangNest)
- **Issues:** [Report a bug or request an improvement](https://github.com/sameerahmad005/ClangNest/issues)

## Contents

- [Why ClangNest?](#why-clangnest)
- [Features](#features)
- [How it works](#how-it-works)
- [Technology stack](#technology-stack)
- [Run locally](#run-locally)
- [AI-powered DSA practice](#ai-powered-dsa-practice)
- [C++23 execution model](#c23-execution-model)
- [Architecture](#architecture)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security, privacy, and limitations](#security-privacy-and-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License and acknowledgments](#license-and-acknowledgments)
- [Developer details](#developer-details)

## Why ClangNest?

DSA practice usually requires three separate tasks: finding a suitable problem, preparing a compiler, and figuring out why a solution failed. ClangNest brings those steps into one browser workspace:

- structured practice by topic and difficulty;
- a local C++23 editor and compiler;
- visible, repeatable example inputs;
- compiler, runtime, and output diagnostics in the same screen; and
- optional AI assistance for generating new practice questions.

The application is designed for learning, not for replacing a full IDE or a hidden-judge platform.

## Features

### DSA practice

- Choose from Arrays, Strings, Searching, Sorting, Linked lists, Stacks and queues, Hashing, Recursion, Trees, Graphs, Greedy, and Dynamic programming.
- Choose Easy, Medium, or Hard difficulty.
- Generate a question with a title, statement, constraints, input/output formats, and exactly two visible examples.
- Validate the returned topic, difficulty, required fields, example count, size limits, and topic-specific content before the question becomes usable.
- Keep the generated question in page memory; it is not attached to saved C++ projects.

### Browser-local C++23 workspace

- Edit C++ in Monaco Editor.
- Compile and execute through Clang and LLD compiled to WebAssembly/WASI.
- Run code in a dedicated Web Worker instead of a server-side execution service.
- Use batch stdin through the Input tab and inspect Output or Errors in the terminal.
- Save multiple projects locally in IndexedDB.
- Start with a basic editable C++ template rather than a completed example program.

### Transparent example testing

- **Run** executes the current input once.
- **Run 2 tests** executes both visible examples sequentially.
- Review expected output, actual output, standard error, compiler output, diagnostics, and pass/fail status.
- Receive a success or failure toast after a run; successful test runs include a small celebratory spark animation.
- Use the separate local Scoreboard page to view points, attempts, pass rate, cases passed, and progress by topic/difficulty.

The scoreboard is local browser data, not an account-backed leaderboard. There is no authentication, cloud synchronization, streak system, adaptive difficulty engine, hidden judge, or server-side learning history in this repository.

### AI provider configuration

The settings dialog supports these configured providers:

- Google Gemini
- OpenAI
- Anthropic
- OpenRouter
- Groq
- DeepSeek
- Mistral
- Together AI
- xAI
- Custom OpenAI-compatible endpoints

The app can discover models from the configured provider, test a selected model with a small JSON request, and filter OpenRouter models by provider-reported pricing metadata. Model discovery does not prove that a model can generate a correct DSA question, supports every requested feature, or has available quota.

## How it works

1. Open **DSA Practice**.
2. Select a topic and **Easy**, **Medium**, or **Hard**.
3. Open **Provider settings**, choose a provider, and enter your own API key.
4. Load the provider's available models and select one. Custom OpenAI-compatible servers can use an explicitly enabled manual model ID fallback.
5. Select **Generate question**.
6. Read the statement, constraints, formats, and two visible examples.
7. Replace the starter template with your complete C++23 solution. Keep one `main()` function.
8. Use an example's **Use input** button for an ordinary run, or choose **Run 2 tests** to evaluate both examples.
9. Review the case cards, terminal output, diagnostics, toast feedback, and Scoreboard page.

AI-generated questions and expected outputs can be wrong. The two visible examples are examples, not a hidden judge. Passing both does not prove correctness for every possible input.

## Technology stack

- React 18 and TypeScript
- Vite
- Monaco Editor and locally bundled Monaco workers
- `browsercc` for Clang/LLD WebAssembly assets
- `@bjorn3/browser_wasi_shim` for WASI stdin/stdout/stderr integration
- Web Workers for compiler execution
- IndexedDB for local project persistence
- Browser `sessionStorage`/`localStorage` for AI settings and optional remembered keys
- Direct browser requests to configured AI provider APIs
- Vitest, jsdom, and a Node-based real-WASM integration suite

## Run locally

### Requirements

Use a current Node.js release supported by your environment. The repository is tested with Node.js 24.x, npm, and TypeScript 5.7.x. The integration tests require enough memory and time to initialize the bundled compiler assets.

### Clone, install, and start the development server

Clone the repository and enter the project directory:

```bash
git clone https://github.com/sameerahmad005/ClangNest.git
cd ClangNest
```

Install dependencies and start Vite:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`. The app does not require an API key to edit or run local C++ code. An API key is required only for AI-powered question generation and provider/model requests.

To stop the development server, press `Ctrl+C` in the terminal.

### Run the production build locally

Use these commands to create and preview the same type of static build used for deployment:

```bash
npm run build
npm run preview
```

Open the preview URL printed by Vite, usually `http://localhost:4173`.

### Available scripts

```bash
npm test                 # unit and UI tests with Vitest/jsdom
npm run lint             # TypeScript project check
npm run build            # TypeScript check plus production Vite build
npm run test:integration # real Clang/WASI integration tests in Node
npm run preview          # serve the production build locally
```

## AI-powered DSA practice

1. Open the gear icon or **Provider settings**.
2. Choose a provider from the supported list.
3. Use the provider's official key link, create a personal key, and enter it in the password field.
4. Wait for model discovery or choose **Load available models**.
5. Select a returned model and save the settings.
6. Optionally use **Test model**. This sends a small request and may consume quota or cost tokens.
7. Return to DSA Practice, choose a topic and difficulty, and select **Generate question**.

Provider requests happen directly from the browser. Provider CORS rules, permissions, model availability, quotas, pricing, and JSON/streaming support vary. A provider key is not included in the repository and no model ID is guessed automatically.

For custom servers, use a complete OpenAI-compatible `/chat/completions` endpoint. An optional models-list URL can be supplied for nonstandard discovery routes. If the server has no model-list API, enable the clearly labeled manual model ID fallback.

## C++23 execution model

The editor sends source, stdin, compiler flags, and limits to a Web Worker. The worker loads the bundled Clang, LLD, and WASI assets, compiles the source, links an in-memory executable, and runs it with batch stdin.

The default flags are:

```text
-std=c++23 -fno-exceptions
```

The real integration suite verifies C++23 mode (`__cplusplus == 202302L`), selected features such as `if consteval`, `std::byteswap`, `std::print`, and `std::format`, but this is not a claim of complete C++23 library/runtime coverage.

Important constraints:

- Explicit `throw` and `try`/`catch` are unsupported because the bundled WASI sysroot has no C++ exception ABI.
- Input is batch stdin and reaches EOF; the app is not an interactive terminal.
- Default source limit: 256 KiB.
- Default stdin limit: 64 KiB.
- Default stdout and compiler-diagnostic limits: 64 KiB each.
- Default execution timeout: 3 seconds.
- Compilation has a 30-second limit.
- The browser runner does not provide a strong per-program memory quota.
- A browser WebAssembly runner is not identical to an unrestricted native compiler or a hardened hostile-code sandbox.

The initial editor template is intentionally minimal:

```cpp
#include <iostream>

int main() {
    // Write your C++23 solution here.
    return 0;
}
```

Replace it with your complete program rather than appending another complete `main()` function.

## Architecture

```text
Browser
└── React app (src/App.tsx)
    ├── Monaco editor and terminal
    ├── DSA Practice panel
    │   ├── topic/difficulty selection
    │   ├── AI question generation
    │   └── visible example evaluation
    ├── Scoreboard panel
    │   └── localStorage aggregate progress
    ├── Projects panel
    │   └── IndexedDB project storage
    └── CppRunner
        └── Web Worker (runner.worker.ts)
            └── Clang + LLD + WASI WebAssembly
```

Key modules:

- `src/App.tsx` — application state, editor/terminal flow, project actions, test runs, score recording, and toast feedback.
- `src/components/PracticePanel.tsx` — question controls, generated problem content, visible examples, and test controls.
- `src/components/ScoreboardPanel.tsx` — local progress view.
- `src/lib/ai-practice/` — provider presets, settings validation, model discovery, model testing, streaming, transport, and generated-problem validation.
- `src/lib/cpp-runner/` — typed runner API, limits, diagnostics, compiler invocation, Worker, and WASM asset loading.
- `src/lib/practice-evaluator.ts` — compiler-independent output normalization and visible-example evaluation.
- `src/lib/practice-scoreboard.ts` — local aggregate scoring, deduplication, summaries, and persistence.
- `src/lib/project-storage/` — IndexedDB project CRUD.
- `integration/runner.integration.test.ts` — real Clang/WASI execution checks.

The evaluator compares the program's output to the expected visible output. It does not ask an AI model to judge code.

## Testing

Run the standard checks before opening a pull request:

```bash
npm test
npm run lint
npm run build
```

Run the real toolchain suite when changing compiler, Worker, evaluator, or asset-loading behavior:

```bash
npm run test:integration
```

The normal suite uses mocks for provider/network and many Worker boundaries. The integration suite runs actual bundled Clang/LLD/WASI code in Node and checks C++23 behavior, caching, fresh stdin, failures, recovery, duplicate `main()` diagnostics, and visible-example evaluation. Neither suite verifies live access to a user's AI provider, generated-question quality from every model, or every deployed-browser combination.

## Deployment

ClangNest is a static Vite application suitable for Vercel:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

`vercel.json` configures these settings, immutable caching for `/assets/*`, security headers, and a Content Security Policy. The build emits the compiler assets as static files. After deployment, verify in the browser Network panel that the generated `clang.wasm`, `lld.wasm`, and `sysroot.tar` requests return the assets rather than the SPA HTML.

No deployment environment variable is required by the application. AI keys are entered by users at runtime and must not be placed in `VITE_*` variables or public deployment configuration.

### Deploy through the Vercel dashboard

You can deploy your own copy directly from GitHub without adding a backend:

1. Push your ClangNest repository to GitHub.
2. Open [Vercel](https://vercel.com/) and sign in.
3. Select **Add New… → Project**.
4. Import `sameerahmad005/ClangNest`, or select your own fork.
5. Keep the detected framework as **Vite**.
6. Confirm these project settings:
   - **Install Command:** `npm install`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
7. Leave environment variables empty. Provider API keys are entered by each user in the browser at runtime; never paste a provider key into Vercel project settings.
8. Select **Deploy**.

After the deployment finishes, open the Vercel URL and test the editor. In the browser Network panel, confirm that `clang.wasm`, `lld.wasm`, and `sysroot.tar` load successfully. A failed asset request that returns the SPA HTML usually means the deployment or asset path is incorrect.

### Deploy with the Vercel CLI

The dashboard is recommended for first-time deployment. The CLI can be used from a cloned project as follows:

```bash
npm install
npm run build
npm install --global vercel
vercel login
vercel
vercel --prod
```

When prompted, link the directory to your Vercel account and project. The repository's `vercel.json` already declares the Vite build command, `dist` output directory, cache headers, and security headers.

## Security, privacy, and limitations

- C++ source and stdin are processed in the browser's Web Worker/WASM runner; there is no backend native runner in this repository.
- Projects are stored locally in IndexedDB for the browser origin.
- AI settings are stored locally. API keys use `sessionStorage` by default; **Remember on this device** opts into readable `localStorage`.
- Browser storage is not encrypted against scripts or extensions that can access the same origin.
- AI generation sends the selected topic/difficulty and generation instructions to the configured provider. Project source, saved projects, and stdin are not sent by this feature.
- Model listing and model testing send the configured key to the configured provider endpoint. These requests can consume quota and may incur provider charges.
- Requests omit cookies and reject redirects, but a public frontend cannot make a browser-held provider key theft-proof.
- Do not use an organization-wide secret in this public frontend. Use a personal, limited-quota key and rotate any key accidentally exposed.
- Worker timeouts and output limits reduce some risks, but browser/OS resource exhaustion and limitations of browser WASI remain possible.

## Troubleshooting

### Compiler assets fail to load

If the page reports an error such as `expected magic word ... <!doctype`, a WASM or sysroot request may have returned `index.html`. Rebuild and confirm that `clang.wasm`, `lld.wasm`, and `sysroot.tar` return successful asset responses.

### Duplicate `main()` error

The editor contents are compiled as-is. Keep one `main()` function. Replace the starter program with your complete solution instead of pasting a second complete program below it.

### Exception-related compiler errors

The default runner uses `-fno-exceptions`. Explicit `throw` and `try`/`catch` do not compile. Some library paths that normally throw can abort at runtime; validate inputs and handle errors explicitly.

### Missing API key, model, or HTTP 404

Open provider settings, verify the endpoint type, reload the model list, and select a model returned for the current key. A 404 can mean an outdated model ID, an incorrect endpoint, or missing provider access. The app does not silently retry with another model.

### Quota, CORS, or provider errors

Check the provider's quota, permissions, endpoint, and browser CORS support. A successful model-list request does not guarantee that generation is available for that model.

### Projects disappeared

Check that the browser allows IndexedDB for the current origin. Private browsing settings, storage-clearing extensions, or clearing site data can remove local projects.

## Contributing

1. Fork the repository.
2. Create a focused feature branch.
3. Make the smallest change that solves the problem.
4. Run the relevant tests, type check, and production build.
5. Open a pull request describing the behavior change and verification performed.

Please do not include API keys, provider responses containing secrets, generated private data, or browser storage exports in issues or pull requests.

## Roadmap

The current repository provides local browser execution, optional AI-generated DSA questions, visible-example evaluation, local projects, and a local scoreboard. Possible future work includes broader automated evaluation, stronger learning analytics, and an authenticated service for shared progress. Those are not current product capabilities.

## License and acknowledgments

No repository license file is currently tracked, so no project license is asserted here. Add a license file before publishing a formal reuse policy.

ClangNest uses and should preserve attribution for:

- [browsercc](https://github.com/BertalanD/browsercc), which provides the browser-oriented LLVM/Clang toolchain wrapper and WASM assets.
- [@bjorn3/browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim), which provides the WASI JavaScript shim used for stdin/stdout/stderr integration.
- [Monaco Editor](https://microsoft.github.io/monaco-editor/), used for the browser code editor.

Review upstream license notices before redistributing a built copy.

## Feedback and support

Use the [GitHub Issues page](https://github.com/sameerahmad005/ClangNest/issues) for reproducible bugs and focused feature requests. Include your browser/OS, reproduction steps, the visible status or diagnostic message, and the relevant non-sensitive configuration. Never include API keys, cookies, tokens, or private provider payloads.

## Developer details

- **Developer and project owner:** Sameer Ahmad
- **Project:** ClangNest — AI-assisted DSA practice with browser-based C++23 execution
- **GitHub repository:** https://github.com/sameerahmad005/ClangNest
- **LinkedIn:** https://www.linkedin.com/in/sameer-abrar/
- **Bug reports and support:** https://github.com/sameerahmad005/ClangNest/issues
- **Technology focus:** React, TypeScript, Vite, Monaco Editor, Clang/WASI WebAssembly, Web Workers, IndexedDB, and AI provider integrations

For collaboration, feature requests, and reproducible bug reports, use GitHub Issues or open a pull request. Do not share API keys, access tokens, cookies, or private provider data in public project communication.
