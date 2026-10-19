import type { Difficulty, DsaTopic, PracticeProblem, PracticeScoreEntry, PracticeScoreboard } from "../types/practice";

export const PRACTICE_SCOREBOARD_STORAGE_KEY = "cpp-practice.scoreboard";

export interface RecordPracticeScoreInput {
  topic: DsaTopic;
  difficulty: Difficulty;
  problemId: string;
  runId: string;
  /** Number of visible cases that passed in the completed two-case run. */
  passedCases?: number;
  /** Optional explicit score for callers that already calculated the points. */
  points?: number;
  totalCases?: number;
}

export interface RecordPracticeCaseScoreInput {
  topic: DsaTopic;
  difficulty: Difficulty;
  problemId: string;
  runId: string;
  caseIndex: number;
  passed: boolean;
}

export interface ScoreboardSummary {
  points: number;
  attempts: number;
  passedCases: number;
  totalCases: number;
  passRate: number;
}

const EMPTY_SCOREBOARD: PracticeScoreboard = { version: 1, entries: {} };

function emptyScoreboard(): PracticeScoreboard {
  return { version: 1, entries: {} };
}

function storageOrDefault(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isTopic(value: unknown): value is DsaTopic {
  return typeof value === "string" && ["Arrays", "Strings", "Searching", "Sorting", "Linked lists", "Stacks and queues", "Hashing", "Recursion", "Trees", "Graphs", "Greedy", "Dynamic programming"].includes(value as DsaTopic);
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "Easy" || value === "Medium" || value === "Hard";
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function cleanEntry(value: unknown): PracticeScoreEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<PracticeScoreEntry>;
  if (!isTopic(entry.topic) || !isDifficulty(entry.difficulty)) return null;
  const attempts = finiteCount(entry.attempts);
  const totalCases = finiteCount(entry.totalCases);
  const passedCases = Math.min(finiteCount(entry.passedCases), totalCases);
  const points = Math.min(finiteCount(entry.points), attempts * 2);
  const recordedRuns = Array.isArray(entry.recordedRuns)
    ? [...new Set(entry.recordedRuns.filter((run): run is string => typeof run === "string" && run.length > 0))]
    : [];
  return { topic: entry.topic, difficulty: entry.difficulty, points, attempts, passedCases, totalCases, recordedRuns };
}

function parseScoreboard(value: unknown): PracticeScoreboard {
  if (!value || typeof value !== "object") return emptyScoreboard();
  const candidate = value as Partial<PracticeScoreboard>;
  if (candidate.version !== 1 || !candidate.entries || typeof candidate.entries !== "object") return emptyScoreboard();
  const entries: Record<string, PracticeScoreEntry> = {};
  for (const [key, value] of Object.entries(candidate.entries)) {
    const entry = cleanEntry(value);
    if (entry) entries[key] = entry;
  }
  return { version: 1, entries };
}

export function createEmptyPracticeScoreboard(): PracticeScoreboard {
  return emptyScoreboard();
}

export function readPracticeScoreboard(storage?: Storage): PracticeScoreboard {
  const target = storageOrDefault(storage);
  if (!target) return emptyScoreboard();
  try {
    const raw = target.getItem(PRACTICE_SCOREBOARD_STORAGE_KEY);
    return raw ? parseScoreboard(JSON.parse(raw) as unknown) : emptyScoreboard();
  } catch {
    return emptyScoreboard();
  }
}

export function writePracticeScoreboard(scoreboard: PracticeScoreboard, storage?: Storage): boolean {
  const target = storageOrDefault(storage);
  if (!target) return false;
  try {
    target.setItem(PRACTICE_SCOREBOARD_STORAGE_KEY, JSON.stringify(parseScoreboard(scoreboard)));
    return true;
  } catch {
    return false;
  }
}

export function resetPracticeScoreboard(storage?: Storage): PracticeScoreboard {
  const scoreboard = emptyScoreboard();
  writePracticeScoreboard(scoreboard, storage);
  return scoreboard;
}

export function scoreboardCategoryKey(topic: DsaTopic, difficulty: Difficulty): string {
  return `${topic}::${difficulty}`;
}

export function getPracticeScoreEntry(scoreboard: PracticeScoreboard, topic: DsaTopic, difficulty: Difficulty): PracticeScoreEntry {
  return scoreboard.entries[scoreboardCategoryKey(topic, difficulty)] ?? {
    topic, difficulty, points: 0, attempts: 0, passedCases: 0, totalCases: 0, recordedRuns: [],
  };
}

export function summarizeScoreEntry(entry: Pick<PracticeScoreEntry, "points" | "attempts" | "passedCases" | "totalCases">): ScoreboardSummary {
  return { ...entry, passRate: entry.totalCases > 0 ? entry.passedCases / entry.totalCases : 0 };
}

export function getPracticeScoreTotals(scoreboard: PracticeScoreboard): ScoreboardSummary {
  return summarizeScoreEntry(Object.values(scoreboard.entries).reduce((total, entry) => ({
    points: total.points + entry.points,
    attempts: total.attempts + entry.attempts,
    passedCases: total.passedCases + entry.passedCases,
    totalCases: total.totalCases + entry.totalCases,
  }), { points: 0, attempts: 0, passedCases: 0, totalCases: 0 }));
}

export function getTopPracticeScoreEntries(scoreboard: PracticeScoreboard, limit = 3): PracticeScoreEntry[] {
  return Object.values(scoreboard.entries)
    .filter((entry) => entry.attempts > 0)
    .sort((left, right) => right.points - left.points || right.passedCases / Math.max(1, right.totalCases) - left.passedCases / Math.max(1, left.totalCases) || right.attempts - left.attempts)
    .slice(0, Math.max(0, limit));
}

export function recordPracticeScore(scoreboard: PracticeScoreboard, input: RecordPracticeScoreInput): PracticeScoreboard {
  if (!input.problemId || !input.runId) return scoreboard;
  const key = scoreboardCategoryKey(input.topic, input.difficulty);
  const current = getPracticeScoreEntry(scoreboard, input.topic, input.difficulty);
  const runKey = `${input.problemId}::${input.runId}`;
  if (current.recordedRuns.includes(runKey)) return scoreboard;
  const totalCases = Math.max(0, Math.floor(input.totalCases ?? 2));
  const passedCases = Math.min(totalCases, Math.max(0, Math.floor(input.passedCases ?? input.points ?? 0)));
  const points = Math.min(2, passedCases);
  const nextEntry: PracticeScoreEntry = {
    ...current,
    points: current.points + points,
    attempts: current.attempts + 1,
    passedCases: current.passedCases + passedCases,
    totalCases: current.totalCases + totalCases,
    recordedRuns: [...current.recordedRuns, runKey],
  };
  return { version: 1, entries: { ...scoreboard.entries, [key]: nextEntry } };
}

/** Record one completed visible case immediately while keeping one attempt per run. */
export function recordPracticeCaseScore(scoreboard: PracticeScoreboard, input: RecordPracticeCaseScoreInput): PracticeScoreboard {
  if (!input.problemId || !input.runId || !Number.isInteger(input.caseIndex) || input.caseIndex < 0) return scoreboard;
  const key = scoreboardCategoryKey(input.topic, input.difficulty);
  const current = getPracticeScoreEntry(scoreboard, input.topic, input.difficulty);
  const runKey = `${input.problemId}::${input.runId}`;
  const caseKey = `${runKey}::case-${input.caseIndex}`;
  if (current.recordedRuns.includes(caseKey)) return scoreboard;
  const runAlreadyCounted = current.recordedRuns.some(recordedRun => recordedRun.startsWith(`${runKey}::case-`));
  const passedCases = input.passed ? 1 : 0;
  const nextEntry: PracticeScoreEntry = {
    ...current,
    points: current.points + passedCases,
    attempts: current.attempts + (runAlreadyCounted ? 0 : 1),
    passedCases: current.passedCases + passedCases,
    totalCases: current.totalCases + 1,
    recordedRuns: [...current.recordedRuns, caseKey],
  };
  return { version: 1, entries: { ...scoreboard.entries, [key]: nextEntry } };
}

export function createPracticeRunId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fall through to a non-cryptographic unique-enough browser run ID.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function stableSerialize(problem: PracticeProblem): string {
  return JSON.stringify({
    title: problem.title, topic: problem.topic, difficulty: problem.difficulty,
    statement: problem.statement, inputFormat: problem.inputFormat, outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    testCases: problem.testCases.map((test) => ({ input: test.input, expectedOutput: test.expectedOutput, explanation: test.explanation })),
  });
}

/** A compact deterministic identity for a generated problem; it never includes editor/project source. */
export function getPracticeProblemId(problem: PracticeProblem): string {
  const serialized = stableSerialize(problem);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `problem-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const EMPTY_PRACTICE_SCOREBOARD = EMPTY_SCOREBOARD;
