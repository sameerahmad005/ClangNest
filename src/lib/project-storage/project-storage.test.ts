import { describe, expect, it } from "vitest";
import { normalizeProjectDraft, ProjectStorage } from "./project-storage";

function makeFakeIndexedDB(): IDBFactory {
  const databases = new Map<string, Map<string, unknown>>();
  const createRequest = () => ({ result: undefined as unknown, error: null as DOMException | null, transaction: undefined as unknown, onupgradeneeded: null as ((event: Event) => void) | null, onsuccess: null as ((event: Event) => void) | null, onerror: null as ((event: Event) => void) | null });
  const makeDatabase = (name: string, stores: Map<string, unknown>) => {
    const objectStoreNames = { contains: (storeName: string) => stores.has(storeName) };
    const database = {
      name,
      version: 1,
      objectStoreNames,
      createObjectStore(storeName: string) {
        stores.set(storeName, new Map<string, unknown>());
        return makeStore(stores.get(storeName) as Map<string, unknown>, null);
      },
      transaction(storeName: string) {
        const transaction = {
          error: null,
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onabort: null as (() => void) | null,
          objectStore: () => makeStore(stores.get(storeName) as Map<string, unknown>, transaction),
        };
        return transaction;
      },
      close() {},
    };
    return database;
  };
  const makeStore = (records: Map<string, unknown>, transaction: { oncomplete: (() => void) | null } | null) => ({
    indexNames: { contains: () => false },
    createIndex() {},
    put(value: { id: string }) {
      records.set(value.id, value);
      setTimeout(() => transaction?.oncomplete?.(), 0);
      return createRequest();
    },
    delete(id: string) {
      records.delete(id);
      setTimeout(() => transaction?.oncomplete?.(), 0);
      return createRequest();
    },
    clear() {
      records.clear();
      setTimeout(() => transaction?.oncomplete?.(), 0);
      return createRequest();
    },
    get(id: string) {
      const request = createRequest();
      request.result = records.get(id);
      setTimeout(() => request.onsuccess?.({} as Event), 0);
      return request;
    },
    getAll() {
      const request = createRequest();
      request.result = [...records.values()];
      setTimeout(() => request.onsuccess?.({} as Event), 0);
      return request;
    },
  });
  return {
    open(name: string) {
      const request = createRequest();
      const stores = databases.get(name) ?? new Map<string, unknown>();
      databases.set(name, stores);
      const database = makeDatabase(name, stores);
      request.result = database;
      request.transaction = { objectStore: (storeName: string) => makeStore(stores.get(storeName) as Map<string, unknown>, null) };
      setTimeout(() => {
        if (!stores.has("projects")) {
          request.onupgradeneeded?.({} as Event);
        }
        request.onsuccess?.({} as Event);
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
}

describe("project storage", () => {
  it("normalizes drafts while retaining stable identity and timestamps", () => {
    const project = normalizeProjectDraft({ name: "  Demo  ", source: "int main(){}", stdin: "" }, 123);
    expect(project).toMatchObject({
      name: "Demo",
      source: "int main(){}",
      stdin: "",
      createdAt: 123,
      updatedAt: 123,
    });
    expect(project.id).toMatch(/^project-|^[0-9a-f-]{36}$/i);
  });

  it("uses IndexedDB when the host provides it", async () => {
    const storage = new ProjectStorage({ indexedDB: makeFakeIndexedDB() });
    const saved = await storage.save({ name: "Saved", source: "int main(){}", stdin: "" });
    expect(await storage.get(saved.id)).toEqual(saved);
    expect((await storage.listSummaries())[0]).toMatchObject({ id: saved.id, name: "Saved" });
    await storage.delete(saved.id);
    expect(await storage.get(saved.id)).toBeUndefined();
    storage.close();
  });
});
