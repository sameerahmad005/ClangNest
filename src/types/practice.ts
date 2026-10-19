import type { CppRunnerResult } from "./cpp-runner";

export const DSA_TOPICS = ["Arrays", "Strings", "Searching", "Sorting", "Linked lists", "Stacks and queues", "Hashing", "Recursion", "Trees", "Graphs", "Greedy", "Dynamic programming"] as const;
export type DsaTopic = typeof DSA_TOPICS[number];
export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = typeof DIFFICULTIES[number];

export type AiProviderId = "gemini" | "openai" | "anthropic" | "openrouter" | "groq" | "deepseek" | "mistral" | "together" | "xai" | "openai-compatible";

export interface AiSettings {
  provider: AiProviderId;
  endpoint: string;
  modelsEndpoint?: string;
  model: string;
  apiKey: string;
  rememberKey: boolean;
}

export interface AiModel {
  id: string;
  name: string;
  pricingCategory?: "free" | "paid" | "unknown";
}

export interface AiGenerationProgress {
  phase: "waiting" | "receiving" | "validating";
  receivedChars: number;
  preview: string;
}

export interface AiProviderPreset {
  id: AiProviderId;
  name: string;
  endpoint: string;
  protocol: "gemini" | "anthropic" | "openai-compatible";
  apiKeyUrl?: string;
}

export interface PracticeCase {
  input: string;
  expectedOutput: string;
  explanation: string;
}

export interface PracticeProblem {
  title: string;
  topic: DsaTopic;
  difficulty: Difficulty;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  testCases: [PracticeCase, PracticeCase];
}

export interface PracticeCaseResult {
  index: number;
  expectedOutput: string;
  result: CppRunnerResult;
  passed: boolean;
}

export interface PracticeScoreEntry {
  topic: DsaTopic;
  difficulty: Difficulty;
  points: number;
  attempts: number;
  passedCases: number;
  totalCases: number;
  recordedRuns: string[];
}

export interface PracticeScoreboard {
  version: 1;
  entries: Record<string, PracticeScoreEntry>;
}
