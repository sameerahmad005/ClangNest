import { beforeEach, expect, it } from "vitest";
import type { PracticeProblem } from "../types/practice";
import {
  getPracticeProblemId,
  getPracticeScoreEntry,
  getPracticeScoreTotals,
  readPracticeScoreboard,
  recordPracticeCaseScore,
  recordPracticeScore,
  resetPracticeScoreboard,
  writePracticeScoreboard,
} from "./practice-scoreboard";

const problem: PracticeProblem = {
  title: "Sum two integers", topic: "Arrays", difficulty: "Easy", statement: "Print the sum.",
  constraints: "Small integers", inputFormat: "Two integers", outputFormat: "One integer",
  testCases: [
    { input: "5 9\n", expectedOutput: "14\n", explanation: "5 + 9" },
    { input: "20 22\n", expectedOutput: "42\n", explanation: "20 + 22" },
  ],
};

beforeEach(() => localStorage.clear());

it("persists category scores and calculates points and pass rate", () => {
  const first = recordPracticeScore(readPracticeScoreboard(), { topic: "Arrays", difficulty: "Easy", problemId: "p1", runId: "run-1", passedCases: 2, totalCases: 2 });
  const second = recordPracticeScore(first, { topic: "Strings", difficulty: "Medium", problemId: "p2", runId: "run-2", passedCases: 1, totalCases: 2 });
  expect(writePracticeScoreboard(second)).toBe(true);
  const restored = readPracticeScoreboard();
  expect(getPracticeScoreEntry(restored, "Arrays", "Easy")).toMatchObject({ points: 2, attempts: 1, passedCases: 2, totalCases: 2 });
  expect(getPracticeScoreTotals(restored)).toMatchObject({ points: 3, attempts: 2, passedCases: 3, totalCases: 4, passRate: 0.75 });
});

it("falls back to an empty scoreboard for malformed storage", () => {
  localStorage.setItem("cpp-practice.scoreboard", "{not-json");
  expect(readPracticeScoreboard()).toEqual({ version: 1, entries: {} });
  localStorage.setItem("cpp-practice.scoreboard", JSON.stringify({ version: 99, entries: { bad: "data" } }));
  expect(readPracticeScoreboard()).toEqual({ version: 1, entries: {} });
});

it("deduplicates the same problem/run while allowing a later attempt", () => {
  const first = recordPracticeScore(readPracticeScoreboard(), { topic: "Arrays", difficulty: "Easy", problemId: "same-problem", runId: "same-run", passedCases: 2 });
  const duplicate = recordPracticeScore(first, { topic: "Arrays", difficulty: "Easy", problemId: "same-problem", runId: "same-run", passedCases: 0 });
  expect(duplicate).toBe(first);
  const later = recordPracticeScore(duplicate, { topic: "Arrays", difficulty: "Easy", problemId: "same-problem", runId: "later-run", passedCases: 1 });
  expect(getPracticeScoreEntry(later, "Arrays", "Easy")).toMatchObject({ points: 3, attempts: 2, passedCases: 3, totalCases: 4 });
});

it("updates one run immediately as each visible case completes", () => {
  const first = recordPracticeCaseScore(readPracticeScoreboard(), { topic: "Arrays", difficulty: "Easy", problemId: "p1", runId: "run-1", caseIndex: 0, passed: true });
  expect(getPracticeScoreEntry(first, "Arrays", "Easy")).toMatchObject({ points: 1, attempts: 1, passedCases: 1, totalCases: 1 });
  const second = recordPracticeCaseScore(first, { topic: "Arrays", difficulty: "Easy", problemId: "p1", runId: "run-1", caseIndex: 1, passed: false });
  expect(getPracticeScoreEntry(second, "Arrays", "Easy")).toMatchObject({ points: 1, attempts: 1, passedCases: 1, totalCases: 2 });
  expect(recordPracticeCaseScore(second, { topic: "Arrays", difficulty: "Easy", problemId: "p1", runId: "run-1", caseIndex: 0, passed: true })).toBe(second);
});

it("creates a stable opaque identity from the generated problem", () => {
  expect(getPracticeProblemId(problem)).toBe(getPracticeProblemId({ ...problem, testCases: [...problem.testCases] }));
  expect(getPracticeProblemId(problem)).toMatch(/^problem-[0-9a-f]{8}$/);
});

it("resets persisted scores", () => {
  const scored = recordPracticeScore(readPracticeScoreboard(), { topic: "Arrays", difficulty: "Easy", problemId: "p1", runId: "run-1", passedCases: 1 });
  writePracticeScoreboard(scored);
  expect(resetPracticeScoreboard()).toEqual({ version: 1, entries: {} });
  expect(readPracticeScoreboard()).toEqual({ version: 1, entries: {} });
});
