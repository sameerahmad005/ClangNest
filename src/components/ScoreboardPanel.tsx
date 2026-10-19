import type { PracticeScoreEntry } from "../types/practice";
import type { ScoreboardSummary } from "../lib/practice-scoreboard";
import "./scoreboard.css";

export interface ScoreboardPanelProps {
  scoreTotals: ScoreboardSummary;
  entries: PracticeScoreEntry[];
  onReset(): void;
}

export function ScoreboardPanel({ scoreTotals, entries, onReset }: ScoreboardPanelProps) {
  return <section className="scoreboard-panel" aria-labelledby="scoreboard-title">
    <header className="scoreboard-header">
      <div><span className="practice-eyebrow">LOCAL PROGRESS</span><h2 id="scoreboard-title">Scoreboard</h2></div>
      <button type="button" className="scoreboard-reset" onClick={onReset}>Reset</button>
    </header>
    <div className="scoreboard-summary">
      <div><strong>{scoreTotals.points}</strong><span>Total points</span></div>
      <div><strong>{scoreTotals.attempts}</strong><span>Attempts</span></div>
      <div><strong>{Math.round(scoreTotals.passRate * 100)}%</strong><span>Pass rate</span></div>
      <div><strong>{scoreTotals.passedCases}/{scoreTotals.totalCases}</strong><span>Cases passed</span></div>
    </div>
    <div className="scoreboard-list" aria-live="polite">
      <div className="scoreboard-list-heading"><h3>Categories</h3><span>{entries.length} tracked</span></div>
      {entries.length ? entries.map((entry) => <article className="scoreboard-entry" key={`${entry.topic}-${entry.difficulty}`}>
        <div className="scoreboard-entry-heading"><strong>{entry.topic}</strong><span className="scoreboard-difficulty">{entry.difficulty}</span><b>{entry.points} pts</b></div>
        <div className="scoreboard-entry-meta"><span>{entry.attempts} {entry.attempts === 1 ? "attempt" : "attempts"}</span><span>{entry.passedCases}/{entry.totalCases} cases passed</span></div>
        <div className="scoreboard-progress" aria-hidden="true"><span style={{ width: `${entry.totalCases ? Math.min(100, (entry.passedCases / entry.totalCases) * 100) : 0}%` }} /></div>
      </article>) : <div className="scoreboard-empty"><span className="scoreboard-empty-mark">✦</span><h3>No scores yet</h3><p>Complete <strong>Run 2 tests</strong> in DSA Practice to start building your local progress.</p></div>}
    </div>
  </section>;
}

export default ScoreboardPanel;
