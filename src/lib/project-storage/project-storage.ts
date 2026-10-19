import type { CppProject, ProjectDraft, ProjectSummary } from "../../types/project";

export const PROJECT_DATABASE_NAME = "cpp-practice-runner";
export const PROJECT_DATABASE_VERSION = 1;
export const PROJECT_STORE_NAME = "projects";

export interface ProjectStorageOptions {
  databaseName?: string;
  databaseVersion?: number;
  indexedDB?: IDBFactory;
}

export function createProjectId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeProjectDraft(draft: ProjectDraft, now = Date.now()): CppProject {
  const id = draft.id?.trim() || createProjectId();
  const createdAt = draft.createdAt ?? now;
  return {
    id,
    name: draft.name.trim() || "Untitled C++ project",
    source: draft.source,
    stdin: draft.stdin ?? "",
    createdAt,
    updatedAt: draft.updatedAt ?? now,
  };
}

function cloneProject(project: CppProject): CppProject {
  return { ...project };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class ProjectStorage {
  private readonly databaseName: string;
  private readonly databaseVersion: number;
  private readonly indexedDBFactory: IDBFactory;
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(options: ProjectStorageOptions = {}) {
    this.databaseName = options.databaseName ?? PROJECT_DATABASE_NAME;
    this.databaseVersion = options.databaseVersion ?? PROJECT_DATABASE_VERSION;
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error("IndexedDB is not available in this environment");
    this.indexedDBFactory = factory;
  }

  open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.indexedDBFactory.open(this.databaseName, this.databaseVersion);
        request.onupgradeneeded = () => {
          const database = request.result;
          const store = database.objectStoreNames.contains(PROJECT_STORE_NAME)
            ? request.transaction?.objectStore(PROJECT_STORE_NAME)
            : database.createObjectStore(PROJECT_STORE_NAME, { keyPath: "id" });
          if (store && !store.indexNames.contains("updatedAt")) {
            store.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Unable to open project storage"));
      });
    }
    return this.databasePromise;
  }

  async get(id: string): Promise<CppProject | undefined> {
    const database = await this.open();
    const transaction = database.transaction(PROJECT_STORE_NAME, "readonly");
    const result = await requestResult(transaction.objectStore(PROJECT_STORE_NAME).get(id));
    return result ? cloneProject(result as CppProject) : undefined;
  }

  async list(): Promise<CppProject[]> {
    const database = await this.open();
    const transaction = database.transaction(PROJECT_STORE_NAME, "readonly");
    const values = (await requestResult(transaction.objectStore(PROJECT_STORE_NAME).getAll())) as CppProject[];
    return values
      .map(cloneProject)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async listSummaries(): Promise<ProjectSummary[]> {
    const projects = await this.list();
    return projects.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
  }

  async save(draft: ProjectDraft): Promise<CppProject> {
    const previous = draft.id ? await this.get(draft.id) : undefined;
    const now = Date.now();
    const project = normalizeProjectDraft(
      {
        ...draft,
        createdAt: draft.createdAt ?? previous?.createdAt,
        updatedAt: now,
      },
      now,
    );
    const database = await this.open();
    const transaction = database.transaction(PROJECT_STORE_NAME, "readwrite");
    transaction.objectStore(PROJECT_STORE_NAME).put(project);
    await transactionComplete(transaction);
    return cloneProject(project);
  }

  async delete(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PROJECT_STORE_NAME, "readwrite");
    transaction.objectStore(PROJECT_STORE_NAME).delete(id);
    await transactionComplete(transaction);
  }

  async clear(): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PROJECT_STORE_NAME, "readwrite");
    transaction.objectStore(PROJECT_STORE_NAME).clear();
    await transactionComplete(transaction);
  }

  close(): void {
    this.databasePromise?.then((database) => database.close());
    this.databasePromise = undefined;
  }
}

export function createProjectStorage(options?: ProjectStorageOptions): ProjectStorage {
  return new ProjectStorage(options);
}
