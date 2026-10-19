import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Check, ChevronDown, ChevronRight, Copy, FileCode2, Folder, Settings, BookOpen,
  Moon, PanelBottom, Play, Plus, RotateCcw, Save, Sun, Trash2,
  X, Zap,
} from "lucide-react";
import "./app.css";
import "./workspace.css";
import { runCpp } from "./lib/cpp-runner";
import { CPP_STANDARD } from "./lib/cpp-runner/standard";
import { createProjectStorage } from "./lib/project-storage";
import type { CppProject } from "./types/project";
import type { CppRunnerResult } from "./types/cpp-runner";
import type { AiGenerationProgress, AiSettings, Difficulty, DsaTopic, PracticeCaseResult, PracticeProblem, PracticeScoreboard } from "./types/practice";
import { generateProblem, loadAiSettings, saveAiSettings } from "./lib/ai-practice";
import { evaluateCase, runPracticeTests } from "./lib/practice-evaluator";
import { createPracticeRunId, getPracticeProblemId, getPracticeScoreEntry, getPracticeScoreTotals, getTopPracticeScoreEntries, readPracticeScoreboard, recordPracticeScore, resetPracticeScoreboard, writePracticeScoreboard } from "./lib/practice-scoreboard";
import { PracticePanel } from "./components/PracticePanel";
import { AiSettingsDialog } from "./components/AiSettingsDialog";

const DEFAULT_SOURCE = `#include <iostream>

int main() {
    std::cout << "Hello, World!\\n";
    return 0;
}`;

let storage: ReturnType<typeof createProjectStorage> | undefined;
function getStorage() {
  return storage ??= createProjectStorage();
}

function hasDuplicateMain(result: CppRunnerResult) {
  const redefinition = /^redefinition of ['"‘“](?:int\s+)?main(?:\s*\([^'"’”\r\n]*\))?['"’”]/i;
  return result.status === "compile-error" && (
    result.diagnostics.some((item) => item.severity === "error" && redefinition.test(item.message)) ||
    result.compileOutput.slice(0, 64 * 1024).split(/\r?\n/).some((line) => {
      const diagnostic = /^(?:.*?:\d+(?::\d+)?:\s*)?(?:fatal )?error:\s*(.*)$/.exec(line);
      return diagnostic !== null && redefinition.test(diagnostic[1]);
    })
  );
}

function hasUnsupportedExceptions(result: CppRunnerResult) {
  const unsupported = /^(?:[^\r\n]*\.(?:a(?:\([^()\r\n]+\))?|o):\s*)?undefined symbol:\s*__cxa_(?:allocate_exception|throw)\s*$|^cannot use ['"‘“]?(?:throw|try)['"’”]? with exceptions disabled\s*$/;
  return result.status === "compile-error" && (
    result.diagnostics.some((item) => item.severity === "error" && unsupported.test(item.message)) ||
    result.compileOutput.slice(0, 64 * 1024).split(/\r?\n/).some((line) => {
      const diagnostic = /^(?:wasm-ld:\s*|[^\s|][^|\r\n]*?:\d+(?::\d+)?:\s*)?(?:fatal )?error:\s*(.*)$/.exec(line);
      return diagnostic !== null && unsupported.test(diagnostic[1]);
    })
  );
}

function resultText(result: CppRunnerResult | null, tab: PanelTab) {
  if (!result) return "Run your program to see results here.";
  if (tab === "input") return "stdin is preserved between runs. Edit it above, then run again.";
  if (tab === "errors") {
    const diagnostics = result.diagnostics.map((item) => `${item.file ?? "main.cpp"}:${item.line ?? ""}:${item.column ?? ""} ${item.severity}: ${item.message}`).join("\n");
    const errors = [result.compileOutput.trim() ? result.compileOutput : diagnostics, result.stderr].filter(Boolean).join("\n") || "No errors.";
    const hints = [];
    if (hasDuplicateMain(result)) hints.push("Hint: Keep one main() function only. Replace the starter program rather than appending a complete program: focus the editor, press Ctrl+A, then paste.");
    if (hasUnsupportedExceptions(result)) hints.push("Hint: This browser runner lacks C++ exception handling: throw/try/catch are unsupported. Handle errors explicitly, for example with return values. If this is older default linker output, reload the updated runner and try again.");
    return [errors, ...hints].join("\n\n");
  }
  if (result.status === "compile-error") return "Compilation failed. Open Errors for diagnostics.";
  if (result.status === "timeout") return `${result.stderr || "Execution timed out."}`;
  if (result.status === "cancelled") return "Execution cancelled.";
  return result.stdout || (result.status === "success" ? "Program finished without output." : result.stderr || "Program failed.");
}

type PanelTab = "input" | "output" | "errors" | "examples";
type RunPhase = "initializing" | "compiling" | "cached";

function runPhaseLabel(phase: RunPhase | null) {
  if (phase === "initializing") return "Initializing compiler assets…";
  if (phase === "compiling") return "Compiling C++…";
  if (phase === "cached") return "Using cached module…";
  return "Running";
}

function runNotice(phase: RunPhase, durationMs: number) {
  const total = `${Math.round(durationMs)} ms total`;
  if (phase === "initializing") return `First run initializes compiler assets in browser WASM; ${total}. Later unchanged runs can use the cached module. Browser WASM is slower than a native IDE.`;
  if (phase === "cached") return `Unchanged source used the cached module for fast execution; ${total}. Browser WASM is slower than a native IDE.`;
  return `Changed source compiled and ran in browser WASM; ${total}. Browser WASM is slower than a native IDE.`;
}

export function App() {
  const [projects, setProjects] = useState<CppProject[]>([]);
  const [project, setProject] = useState<CppProject | null>(null);
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [stdin, setStdin] = useState("");
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CppRunnerResult | null>(null);
  const [tab, setTab] = useState<PanelTab>("output");
  const [dark, setDark] = useState(() => localStorage.getItem("forgerun-theme") !== "light");
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("forgerun-font-size") ?? 14));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const [aiSettings, setAiSettings] = useState(loadAiSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<"practice" | "projects">("practice");
  const [topic, setTopic] = useState<DsaTopic>("Arrays");
  const [difficulty, setDifficulty] = useState<Difficulty>("Easy");
  const [problem, setProblem] = useState<PracticeProblem | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<AiGenerationProgress | null>(null);
  const [generationDurationMs, setGenerationDurationMs] = useState<number | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [testResults, setTestResults] = useState<PracticeCaseResult[]>([]);
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [scoreboard, setScoreboard] = useState<PracticeScoreboard>(() => readPracticeScoreboard());
  const controller = useRef<AbortController | null>(null);
  const generationController = useRef<AbortController | null>(null);
  const evaluationEpoch = useRef(0);
  const initialization = useRef<Promise<CppProject[]> | null>(null);
  const editVersion = useRef(0);
  const projectRequest = useRef(0);
  const mounted = useRef(false);
  const compilerInitialized = useRef(false);
  const lastCompiledSource = useRef<string | null>(null);
  const [runPhase, setRunPhase] = useState<RunPhase | null>(null);

  const refreshProjects = useCallback(async () => {
    const saved = await getStorage().list();
    if (mounted.current) setProjects(saved);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      controller.current = null;
      generationController.current?.abort();
      generationController.current = null;
    };
  }, []);

  const invalidateEvaluation = () => {
    evaluationEpoch.current++;
    setTestResults([]);
    setNotice(""); setResult(null);
    controller.current?.abort();
  };

  const useCase = (index: number) => {
    const test = problem?.testCases[index];
    if (!test || controller.current) return;
    invalidateEvaluation();
    setStdin(test.input); setSelectedCase(index); setDirty(true); editVersion.current++;
    setTab("input"); setTerminalOpen(true);
  };

  const generate = async () => {
    if (generationController.current || controller.current) return;
    if (!aiSettings.apiKey.trim() || !aiSettings.model.trim()) {
      setGenerationError("Choose a provider, add your API key, then load and select an available model in Provider settings first. No key or model is guessed by the app.");
      setSettingsOpen(true);
      return;
    }
    const abort = new AbortController(); generationController.current = abort;
    const startedAt = performance.now();
    setGenerationStartedAt(startedAt);
    setGenerationProgress({ phase: "waiting", receivedChars: 0, preview: "" });
    setGenerationDurationMs(null);
    setGenerating(true); setGenerationError("");
    try {
      const next = await generateProblem(aiSettings, topic, difficulty, abort.signal, (progress) => {
        if (mounted.current && generationController.current === abort && !abort.signal.aborted) setGenerationProgress(progress);
      });
      if (generationController.current !== abort || abort.signal.aborted) return;
      setGenerationDurationMs(performance.now() - startedAt);
      invalidateEvaluation(); setProblem(next); setSelectedCase(0);
      setStdin(next.testCases[0].input); setDirty(true); editVersion.current++;
      setResult(null); setTab("input"); setTerminalOpen(true);
    } catch (error) {
      if (generationController.current === abort && mounted.current) {
        const message = error instanceof Error ? error.message : "Could not generate a question. Check provider settings.";
        setGenerationError(message);
        if (/HTTP 404/.test(message)) setSettingsOpen(true);
      }
    } finally {
      if (generationController.current === abort) { setGenerating(false); setGenerationProgress(null); generationController.current = null; }
    }
  };

  const saveProviderSettings = (settings: AiSettings) => {
    saveAiSettings(settings);
    generationController.current?.abort();
    generationController.current = null; setGenerating(false);
    setGenerationProgress(null); setGenerationDurationMs(null);
    setAiSettings(settings); setSettingsOpen(false); setGenerationError("");
  };

  useEffect(() => {
    let active = true;
    // StrictMode re-subscribes to the same work rather than creating a second default project.
    initialization.current ??= (async () => {
      const saved = await getStorage().list();
      return saved.length ? saved : [await getStorage().save({ name: "main.cpp", source: DEFAULT_SOURCE, stdin: "" })];
    })();
    void initialization.current.then((saved) => {
      if (!active || projectRequest.current !== 0) return;
      const last = saved[0];
      setProject(last); setProjects(saved);
      if (editVersion.current === 0) { setSource(last.source); setStdin(last.stdin); }
    }).catch(() => {
      if (active) setStorageError("Could not open local project storage. You can still edit and run code.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("forgerun-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => { localStorage.setItem("forgerun-font-size", String(fontSize)); }, [fontSize]);

  const saveNow = useCallback(async () => {
    const version = editVersion.current;
    const request = projectRequest.current;
    try {
      const target = project ?? (await initialization.current?.catch(() => []))?.[0];
      if (!mounted.current || request !== projectRequest.current) return;
      const saved = await getStorage().save({ id: target?.id, createdAt: target?.createdAt, name: target?.name ?? "main.cpp", source, stdin });
      if (!mounted.current || request !== projectRequest.current) return;
      setProject(saved);
      if (version === editVersion.current) setDirty(false);
      setStorageError("");
      await refreshProjects();
      if (mounted.current) {
        setNotice("Saved locally");
        window.setTimeout(() => setNotice((current) => current === "Saved locally" ? "" : current), 1600);
      }
    } catch {
      if (mounted.current) setStorageError("Could not save locally. Your edits are still in the editor; try Save again.");
    }
  }, [project, refreshProjects, source, stdin]);

  useEffect(() => {
    if (!project || !dirty) return;
    const timer = window.setTimeout(() => { void saveNow(); }, 650);
    return () => window.clearTimeout(timer);
  }, [dirty, project, saveNow]);

  const selectProject = async (id: string) => {
    if (dirty && !window.confirm("Discard unsaved changes and open another project?")) return;
    const request = ++projectRequest.current;
    const version = editVersion.current;
    try {
      const selected = await getStorage().get(id);
      if (mounted.current && selected && request === projectRequest.current && version === editVersion.current) {
        invalidateEvaluation(); setSelectedCase(null);
        setProject(selected); setSource(selected.source); setStdin(selected.stdin); setDirty(false); setResult(null);
      }
    } catch { if (mounted.current) setStorageError("Could not open this project."); }
  };

  const newProject = async () => {
    if (dirty && !window.confirm("Discard unsaved changes and create a new project?")) return;
    const request = ++projectRequest.current;
    const version = editVersion.current;
    try {
      await initialization.current?.catch(() => []);
      const created = await getStorage().save({ name: `project-${projects.length + 1}.cpp`, source: DEFAULT_SOURCE, stdin: "" });
      await refreshProjects();
      if (mounted.current && request === projectRequest.current && version === editVersion.current) {
        invalidateEvaluation(); setSelectedCase(null);
        setProject(created); setSource(created.source); setStdin(""); setDirty(false); setResult(null); setStorageError("");
      }
    } catch { if (mounted.current) setStorageError("Could not save the new project. Your current edits are still in the editor."); }
  };

  const deleteProject = async () => {
    if (!project || projects.length === 1 || !window.confirm(`Delete ${project.name}? This cannot be undone.`)) return;
    const request = ++projectRequest.current;
    const version = editVersion.current;
    try {
      await getStorage().delete(project.id);
      const remaining = await getStorage().list();
      if (!mounted.current || request !== projectRequest.current) return;
      setProjects(remaining);
      if (version !== editVersion.current) { setProject(null); return; }
      const next = remaining[0];
      invalidateEvaluation(); setSelectedCase(null);
      setProject(next ?? null); setSource(next?.source ?? DEFAULT_SOURCE); setStdin(next?.stdin ?? ""); setResult(null); setDirty(false);
    } catch { if (mounted.current) setStorageError("Could not delete this project."); }
  };

  const run = async () => {
    if (controller.current || generationController.current || settingsOpen) return;
    const epoch = evaluationEpoch.current;
    const abort = new AbortController(); controller.current = abort;
    const phase: RunPhase = compilerInitialized.current && lastCompiledSource.current === source
      ? "cached"
      : compilerInitialized.current ? "compiling" : "initializing";
    setTesting(false); setTestResults([]);
    setRunning(true); setRunPhase(phase); setResult(null); setTab("output"); setNotice("");
    try {
      const next = await runCpp({ source, stdin, signal: abort.signal });
      if (controller.current !== abort || evaluationEpoch.current !== epoch) return;
      setResult(next); setTab(next.status === "compile-error" || next.status === "runtime-error" ? "errors" : "output");
      const test = selectedCase !== null ? problem?.testCases[selectedCase] : undefined;
      if (test && test.input === stdin) setTestResults([evaluateCase(selectedCase!, test, next)]);
      if (next.status === "success" || next.status === "compile-error") compilerInitialized.current = true;
      if (next.status === "success") lastCompiledSource.current = source;
      setNotice(runNotice(phase, next.durationMs));
    } catch (error) {
      if (controller.current !== abort || evaluationEpoch.current !== epoch) return;
      setResult({ status: "runtime-error", stdout: "", stderr: error instanceof Error ? error.message : String(error), compileOutput: "", diagnostics: [], exitCode: null, durationMs: 0, outputTruncated: false });
      setTab("errors");
    } finally {
      if (controller.current === abort) {
        setRunning(false); setRunPhase(null); controller.current = null;
      }
    }
  };

  const runAllTests = async () => {
    if (!problem || controller.current || generationController.current) return;
    const problemSnapshot = problem;
    const problemId = getPracticeProblemId(problemSnapshot);
    const runId = createPracticeRunId();
    const abort = new AbortController(); controller.current = abort;
    const epoch = evaluationEpoch.current;
    setTesting(true); setRunning(true); setTestResults([]); setResult(null); setTab("output"); setTerminalOpen(true);
    // Snapshot source and problem for the whole batch; editing cancels and invalidates the results.
    try {
      const completed = await runPracticeTests(source, problem.testCases, abort.signal, (test) => {
        if (controller.current !== abort || evaluationEpoch.current !== epoch) return;
        setTestResults((previous) => [...previous, test]); setResult(test.result);
        setSelectedCase(test.index); setStdin(problem.testCases[test.index].input); setDirty(true); editVersion.current++;
        setTab(test.result.status === "compile-error" || test.result.status === "runtime-error" ? "errors" : "output");
      });
      if (evaluationEpoch.current === epoch && mounted.current) {
        const completeRun = completed.length === problemSnapshot.testCases.length;
        if (completeRun) {
          const passedCases = completed.filter((test) => test.passed).length;
          setScoreboard((previous) => {
            const next = recordPracticeScore(previous, { topic: problemSnapshot.topic, difficulty: problemSnapshot.difficulty, problemId, runId, passedCases, totalCases: 2 });
            if (next !== previous) writePracticeScoreboard(next);
            return next;
          });
          setTab("examples");
        }
        setNotice(completeRun && completed.every((test) => test.passed) ? "2/2 visible examples passed" : "Some examples failed or were not run; see DSA Practice");
      }
    } catch {
      if (mounted.current && evaluationEpoch.current === epoch) setNotice("Test execution failed. Try running again.");
    } finally {
      if (controller.current === abort) { controller.current = null; setRunning(false); setTesting(false); }
    }
  };

  const resetScoreboard = () => {
    if (!window.confirm("Reset the local practice scoreboard? This cannot be undone.")) return;
    setScoreboard(resetPracticeScoreboard());
  };

  const reset = () => {
    if (dirty && !window.confirm("Reset this file to the starter template?")) return;
    invalidateEvaluation();
    editVersion.current++;
    setSource(DEFAULT_SOURCE); setDirty(true); setResult(null);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (settingsOpen) return;
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void run(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveNow(); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  });

  const status = result?.status ?? "ready";
  const statusLabel = running ? (testing ? "Checking examples" : runPhaseLabel(runPhase)) : status === "success" ? "Finished" : status === "ready" ? "Ready" : status.replace("-", " ");
  const footerStatus = storageError || (running ? runPhaseLabel(runPhase) : notice || statusLabel);
  const output = useMemo(() => resultText(result, tab), [result, tab]);
  const currentScore = getPracticeScoreEntry(scoreboard, topic, difficulty);
  const scoreTotals = getPracticeScoreTotals(scoreboard);
  const topScoreEntries = getTopPracticeScoreEntries(scoreboard);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Zap size={16} /></span><span>ClangNest</span><span className="brand-sub">{CPP_STANDARD} practice</span></div>
      <div className="top-actions">
        <span className="wasm-badge"><span className="live-dot" /> Runs in your browser</span>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="AI provider settings" aria-label="AI provider settings"><Settings size={17} /></button>
        <button className="icon-btn" onClick={() => setDark((value) => !value)} title="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button className="icon-btn mobile-only" onClick={() => setSidebarOpen((value) => !value)} title="Toggle practice panel" aria-label="Toggle practice panel">{sidebarOpen ? <X size={17} /> : <BookOpen size={17} />}</button>
      </div>
    </header>

    <div className="workspace">
      <aside className={`sidebar practice-sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <nav className="workspace-tabs" aria-label="Sidebar view">
          <button className={leftTab === "practice" ? "active" : ""} onClick={() => setLeftTab("practice")}><BookOpen size={14} /> DSA Practice</button>
          <button className={leftTab === "projects" ? "active" : ""} onClick={() => setLeftTab("projects")}><Folder size={14} /> Projects</button>
        </nav>
        {leftTab === "practice" ? <PracticePanel topic={topic} difficulty={difficulty} onTopicChange={setTopic} onDifficultyChange={setDifficulty}
           generationProgress={generationProgress} generationDurationMs={generationDurationMs} generationStartedAt={generationStartedAt}
           problem={problem} generating={generating} error={generationError} onGenerate={() => void generate()}
           onCancelGenerate={() => generationController.current?.abort()} onOpenSettings={() => setSettingsOpen(true)}
           onUseCase={useCase} onRunTests={() => void runAllTests()} running={running} testResults={testResults} selectedCase={selectedCase}
           currentScore={currentScore} scoreTotals={scoreTotals} topScoreEntries={topScoreEntries} onResetScoreboard={resetScoreboard} /> : <>
        <div className="sidebar-heading"><span>PROJECTS</span><button className="tiny-btn" onClick={() => void newProject()} title="New project"><Plus size={15} /></button></div>
        <div className="project-list">
          {projects.map((item) => <button key={item.id} className={`project-row ${item.id === project?.id ? "selected" : ""}`} onClick={() => void selectProject(item.id)}><FileCode2 size={16} /><span>{item.name}</span>{item.id === project?.id && <span className="project-check"><Check size={13} /></span>}</button>)}
        </div>
        <div className="sidebar-foot"><div className="storage-note"><Check size={13} /> Saved in IndexedDB</div><button className="delete-btn" onClick={() => void deleteProject()} disabled={projects.length <= 1}><Trash2 size={14} /> Delete project</button></div>
        </>}
      </aside>

      <main className="main-pane">
        <div className="editor-toolbar">
          <div className="file-title"><FileCode2 size={17} /><strong>{project?.name ?? "main.cpp"}</strong>{dirty && <span className="dirty-dot" title="Unsaved changes" />}</div>
          <div className="editor-actions"><span className="standard-chip" title={`${CPP_STANDARD} no-exceptions mode; compiler and standard-library support is partial. Some ${CPP_STANDARD} APIs may be unavailable.`}>{CPP_STANDARD}</span><button className="text-btn" onClick={reset}><RotateCcw size={14} /> Reset</button><button className="text-btn" onClick={() => void saveNow()}><Save size={14} /> Save</button><button className="run-btn" disabled={generating && !running} onClick={() => running ? controller.current?.abort() : void run()}>{running ? <X size={16} /> : <Play size={16} fill="currentColor" />} {running ? "Stop" : "Run"}<kbd>Ctrl ↵</kbd></button></div>
        </div>
         <div className="editor-wrap"><Editor height="100%" language="cpp" theme={dark ? "vs-dark" : "light"} value={source} onChange={(value) => { invalidateEvaluation(); editVersion.current++; setSource(value ?? ""); setDirty(true); }} options={{ fontSize, minimap: { enabled: false }, automaticLayout: true, padding: { top: 18, bottom: 18 }, scrollBeyondLastLine: false, smoothScrolling: true, tabSize: 4, wordWrap: "on", suggestOnTriggerCharacters: true }} /></div>
        <div className={`terminal ${terminalOpen ? "expanded" : "collapsed"}`}>
          <div className="terminal-head"><button className="terminal-toggle" onClick={() => setTerminalOpen((value) => !value)}><PanelBottom size={15} /> TERMINAL {terminalOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>{terminalOpen && <div className="terminal-meta"><span className={`run-state ${status}`}>{running && <span className="spinner" />}{statusLabel}</span>{result?.durationMs ? <span title="Total elapsed time, including compilation on a cache miss">{Math.round(result.durationMs)} ms total</span> : null}<button className="copy-btn" onClick={() => void navigator.clipboard?.writeText(resultText(result, "output"))} title="Copy output"><Copy size={14} /> Copy</button></div>}</div>
           {terminalOpen && <div className="terminal-body"><div className="terminal-tabs">{(["input", "output", "errors", "examples"] as PanelTab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "input" ? "Input" : item === "output" ? "Output" : item === "examples" ? "Examples" : `Errors${result?.diagnostics.length ? ` (${result.diagnostics.length})` : ""}`}</button>)}</div><div className="terminal-content">{tab === "input" ? <textarea aria-label="Program input" value={stdin} onChange={(event) => { invalidateEvaluation(); setSelectedCase(null); editVersion.current++; setStdin(event.target.value); setDirty(true); }} placeholder="Enter stdin here..." spellCheck={false} /> : tab === "examples" ? <div className="terminal-examples">{!problem ? <p className="terminal-empty">Generate a DSA question to see its visible examples here.</p> : problem.testCases.map((testCase, index) => { const caseResult = testResults.find((item) => item.index === index); const casePassed = caseResult?.passed && caseResult.result.status === "success"; const caseRun = caseResult?.result; return <article className="terminal-example" key={index}><div className="terminal-example-head"><strong>Example {index + 1}</strong><span className={caseResult ? (casePassed ? "terminal-pass" : "terminal-fail") : "terminal-pending"}>{caseResult ? (casePassed ? "Passed" : "Failed") : "Not run"}</span><button className="terminal-use-case" type="button" onClick={() => useCase(index)} disabled={running || generating}>Use input</button></div><div className="terminal-example-grid"><div><span>Input</span><pre>{testCase.input || "(empty input)"}</pre></div><div><span>Expected output</span><pre>{testCase.expectedOutput || "(empty output)"}</pre></div></div>{caseRun && <div className="terminal-example-result"><span>Actual output</span><pre>{caseRun.stdout || "(empty output)"}</pre>{caseRun.stderr && <><span>Standard error</span><pre className="error-text">{caseRun.stderr}</pre></>}{caseRun.compileOutput && <><span>Compiler output</span><pre className="error-text">{caseRun.compileOutput}</pre></>}{caseRun.diagnostics.length > 0 && <><span>Compile diagnostics</span><pre className="error-text">{caseRun.diagnostics.map((item) => `${item.file ?? "main.cpp"}${item.line !== undefined ? `:${item.line}` : ""}${item.column !== undefined ? `:${item.column}` : ""} ${item.severity}: ${item.message}`).join("\n\n")}</pre></>}</div>}</article>; })}</div> : <pre className={tab === "errors" ? "error-text" : ""}>{output}</pre>}</div></div>}
        </div>
         <footer className="statusbar"><span role={storageError ? "alert" : "status"}><span className={`status-led ${running ? "busy" : ""}`} />{footerStatus}</span><span>Clang / WASI · {CPP_STANDARD}</span><span className="font-control">Font <button onClick={() => setFontSize((value) => Math.max(12, value - 1))}>−</button><strong>{fontSize}</strong><button onClick={() => setFontSize((value) => Math.min(22, value + 1))}>+</button></span></footer>
      </main>
    </div>
    {settingsOpen && <AiSettingsDialog settings={aiSettings} onSave={saveProviderSettings} onClose={() => setSettingsOpen(false)} />}
  </div>;
}
