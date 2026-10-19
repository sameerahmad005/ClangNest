export interface CppProject {
  id: string;
  name: string;
  source: string;
  stdin: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectDraft = Pick<CppProject, "name" | "source" | "stdin"> &
  Partial<Pick<CppProject, "id" | "createdAt" | "updatedAt">>;

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}
