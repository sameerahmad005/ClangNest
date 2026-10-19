import { useEffect, useId, useState } from "react";
import { DIFFICULTIES, DSA_TOPICS } from "../types/practice";
import type { AiGenerationProgress, Difficulty, DsaTopic, PracticeCaseResult, PracticeProblem, PracticeScoreEntry } from "../types/practice";
import type { ScoreboardSummary } from "../lib/practice-scoreboard";
import "./practice.css";

export interface PracticePanelProps {
  topic: DsaTopic;
  difficulty: Difficulty;
  onTopicChange(topic: DsaTopic): void;
  onDifficultyChange(difficulty: Difficulty): void;
  problem: PracticeProblem | null;
  generating: boolean;
  generationProgress?: AiGenerationProgress | null;
  generationDurationMs?: number | null;
  generationStartedAt?: number | null;
  error: string;
  onGenerate(): void;
  onCancelGenerate(): void;
  onOpenSettings(): void;
  onUseCase(index: number): void;
  onRunTests(): void;
  running: boolean;
  testResults: PracticeCaseResult[];
  selectedCase: number | null;
  currentScore: PracticeScoreEntry;
  scoreTotals: ScoreboardSummary;
  topScoreEntries: PracticeScoreEntry[];
  onResetScoreboard(): void;
}

export function PracticePanel({ topic, difficulty, onTopicChange, onDifficultyChange, problem, generating, generationProgress, generationDurationMs, generationStartedAt, error, onGenerate, onCancelGenerate, onOpenSettings, onUseCase, onRunTests, running, testResults, selectedCase, currentScore, scoreTotals, topScoreEntries, onResetScoreboard }: PracticePanelProps) {
  const id = useId();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!generating) { setElapsedSeconds(0); return; }
    const startedAt = generationStartedAt ?? performance.now();
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((performance.now() - startedAt) / 1000)));
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [generating, generationStartedAt]);
  const selectionChanged = problem && (problem.topic !== topic || problem.difficulty !== difficulty);
  const allPassed = problem && !running && !generating && problem.testCases.every((_, index) =>
    testResults.some((item) => item.index === index && item.passed && item.result.status === "success"));

  return <section className="practice-panel" aria-labelledby={`${id}-title`}>
    <header className="practice-header">
      <div><span className="practice-eyebrow">AI QUESTION LAB</span><h2 id={`${id}-title`}>DSA Practice</h2></div>
      <button type="button" className="practice-link" onClick={onOpenSettings}>Provider settings</button>
    </header>

    <div className="practice-controls">
      <div className="practice-selects">
        <label className="practice-field" htmlFor={`${id}-topic`}>Topic
          <select id={`${id}-topic`} value={topic} disabled={generating} onChange={(event) => onTopicChange(event.target.value as DsaTopic)}>
            {DSA_TOPICS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="practice-field" htmlFor={`${id}-difficulty`}>Difficulty
          <select id={`${id}-difficulty`} value={difficulty} disabled={generating} onChange={(event) => onDifficultyChange(event.target.value as Difficulty)}>
            {DIFFICULTIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="practice-actions">
        <button type="button" className="practice-button practice-primary" onClick={onGenerate} disabled={generating || running}>
          {generating ? "Generating question…" : "Generate question"}
        </button>
        {generating && <button type="button" className="practice-button" onClick={onCancelGenerate}>Cancel</button>}
      </div>
      <p className="practice-hint">Generate a question without changing your editor. Use an example to copy only its input.</p>
      {generating && <>
        <p className="practice-hint" role="status">{generationProgress?.phase === "validating" ? "Checking response…" : generationProgress?.phase === "receiving" ? `Receiving reply… ${generationProgress.receivedChars} characters` : "Waiting for your AI provider…"} · {elapsedSeconds} s</p>
        {elapsedSeconds >= 10 && <p className="practice-hint">Provider queueing or model reasoning may take longer. You can cancel and choose another model in Provider settings.</p>}
        {generationProgress?.preview && <details className="practice-stream-preview" open>
          <summary>Live response preview — not yet validated</summary>
          <pre className="practice-code" aria-label="Unvalidated AI response preview" tabIndex={0}>{generationProgress.preview.slice(0, 6000)}</pre>
          {generationProgress.preview.length > 6000 && <p className="practice-hint">Showing the first 6,000 characters. The full response will be validated before use.</p>}
        </details>}
      </>}
      {!generating && generationDurationMs != null && <p className="practice-hint">Generated in {(generationDurationMs / 1000).toFixed(1)} s · includes provider and network time.</p>}
      {error && <p className="practice-error" role="alert">{error}</p>}
    </div>

    <section className="practice-scoreboard" aria-labelledby={`${id}-scoreboard`}>
      <div className="practice-scoreboard-heading"><div><span className="practice-eyebrow">LOCAL SCOREBOARD</span><h3 id={`${id}-scoreboard`}>{topic} · {difficulty}</h3></div><button type="button" aria-label="Reset scoreboard" className="practice-scoreboard-reset" onClick={onResetScoreboard}>Reset</button></div>
      <div className="practice-score-grid">
        <div><strong>{currentScore.points}</strong><span>Current points</span></div>
        <div><strong>{scoreTotals.points}</strong><span>Total points</span></div>
        <div><strong>{scoreTotals.attempts}</strong><span>Attempts</span></div>
        <div><strong>{Math.round(scoreTotals.passRate * 100)}%</strong><span>Pass rate</span></div>
      </div>
      <div className="practice-scoreboard-detail">Current category: {currentScore.points} pts across {currentScore.attempts} {currentScore.attempts === 1 ? "attempt" : "attempts"}</div>
      <div className="practice-top-categories"><span className="practice-score-label">Top categories</span>{topScoreEntries.length ? topScoreEntries.map((entry) => <div className="practice-top-category" key={`${entry.topic}-${entry.difficulty}`}><span>{entry.topic} · {entry.difficulty}</span><strong>{entry.points} pts</strong></div>) : <span className="practice-score-empty">Complete Run 2 tests to start scoring.</span>}</div>
    </section>

    <div className="practice-content">
      {!problem ? <div className="practice-empty"><span className="practice-empty-mark" aria-hidden="true">{ "{ }" }</span><h3>Your next challenge starts here</h3><p>Choose a topic and difficulty, set up your AI provider, and generate a question with two visible examples.</p></div> : <>
        <article className="practice-problem" aria-labelledby={`${id}-problem`}>
          <div className="practice-tags"><span className="practice-tag">{problem.topic}</span><span className="practice-tag">{problem.difficulty}</span></div>
          <h3 id={`${id}-problem`}>{problem.title}</h3>
          {selectionChanged && <p className="practice-notice">Showing the previous {problem.topic} · {problem.difficulty} question. Generate to apply your new selections.</p>}
          <p className="practice-prose">{problem.statement}</p>
          <h4>Input format</h4><p className="practice-prose">{problem.inputFormat}</p>
          <h4>Output format</h4><p className="practice-prose">{problem.outputFormat}</p>
          <h4>Constraints</h4><p className="practice-prose">{problem.constraints}</p>
        </article>

        <section className="practice-examples" aria-labelledby={`${id}-examples`}>
          <div className="practice-section-heading"><h3 id={`${id}-examples`}>Visible examples</h3><span className="practice-count">2 cases</span></div>
          <p className="practice-warning">AI-generated questions and cases may be wrong. Review the examples before relying on them.</p>
          {problem.testCases.map((testCase, index) => {
            const caseResult = testResults.find((item) => item.index === index);
            const result = caseResult?.result;
            const passed = caseResult?.passed && result?.status === "success";
            return <article key={index} className={`practice-case${selectedCase === index ? " practice-case-selected" : ""}`} aria-labelledby={`${id}-case-${index}`}>
              <div className="practice-case-heading">
                <h4 id={`${id}-case-${index}`}>Example {index + 1}</h4>
                {selectedCase === index && <span className="practice-selected-label">Input selected</span>}
                <button type="button" className="practice-button practice-small" aria-pressed={selectedCase === index} onClick={() => onUseCase(index)} disabled={running || generating}>Use input</button>
              </div>
              <span className="practice-code-label">Input</span><pre className="practice-code" tabIndex={0}>{testCase.input || "(empty input)"}</pre>
              <span className="practice-code-label">Expected output</span><pre className="practice-code" tabIndex={0}>{testCase.expectedOutput || "(empty output)"}</pre>
              <p className="practice-prose practice-explanation"><strong>Explanation</strong>{testCase.explanation}</p>
              {caseResult && result && <div className="practice-result">
                <p className={`practice-result-status ${passed ? "practice-passed" : "practice-failed"}`}>{passed ? "Passed" : "Failed"} · {result.status.replaceAll("-", " ")}{result.exitCode !== null && result.exitCode !== 0 ? ` · exit ${result.exitCode}` : ""}</p>
                <span className="practice-code-label">Expected for this run</span><pre className="practice-code" tabIndex={0}>{caseResult.expectedOutput || "(empty output)"}</pre>
                <span className="practice-code-label">Actual output</span><pre className="practice-code" tabIndex={0}>{result.stdout || "(empty output)"}</pre>
                {result.stderr && <><span className="practice-code-label">Standard error</span><pre className="practice-code practice-diagnostic" tabIndex={0}>{result.stderr}</pre></>}
                {result.compileOutput && <><span className="practice-code-label">Compiler output</span><pre className="practice-code practice-diagnostic" tabIndex={0}>{result.compileOutput}</pre></>}
                {result.diagnostics.length > 0 && <><span className="practice-code-label">Compile diagnostics</span><pre className="practice-code practice-diagnostic" tabIndex={0}>{result.diagnostics.map((item) => `${item.file ?? "main.cpp"}${item.line !== undefined ? `:${item.line}` : ""}${item.column !== undefined ? `:${item.column}` : ""} ${item.severity}: ${item.message}${item.raw && item.raw !== item.message ? `\n${item.raw}` : ""}`).join("\n\n")}</pre></>}
                {result.outputTruncated && <p className="practice-warning">Output was truncated by the runner limit.</p>}
              </div>}
            </article>;
          })}
        </section>
      </>}
    </div>

    <footer className="practice-footer">
      <button type="button" className="practice-button practice-primary" onClick={onRunTests} disabled={!problem || running || generating}>{running ? "Running 2 tests…" : "Run 2 tests"}</button>
      <div className="practice-test-summary" role="status">{allPassed ? <><strong className="practice-passed">All visible examples passed</strong><span>This does not guarantee acceptance on other inputs.</span></> : <span>{running ? "Compiling and checking the visible examples…" : "Checks your current code against the two visible examples only."}</span>}</div>
    </footer>
  </section>;
}

export default PracticePanel;
