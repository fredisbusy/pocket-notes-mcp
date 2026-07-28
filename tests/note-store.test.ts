import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NoteStore } from "../src/note-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("NoteStore", () => {
  it("creates, normalizes, and filters notes", async () => {
    const store = await createTemporaryStore();

    const created = await store.create({
      title: " MCP Tools ",
      body: " 모델이 호출하는 기능 ",
      tags: ["MCP", " tools ", "mcp"],
    });

    expect(created.title).toBe("MCP Tools");
    expect(created.body).toBe("모델이 호출하는 기능");
    expect(created.tags).toEqual(["mcp", "tools"]);
    await expect(store.list("MCP")).resolves.toHaveLength(1);
    await expect(store.get(created.id)).resolves.toEqual(created);
  });

  it("persists valid, formatted JSON", async () => {
    const { store, filePath } = await createTemporaryStoreWithPath();
    await store.create({ title: "Resource", body: "읽기 전용 컨텍스트" });

    const persisted = await readFile(filePath, "utf8");
    expect(JSON.parse(persisted)).toHaveLength(1);
    expect(persisted.endsWith("\n")).toBe(true);
  });

  it("does not lose concurrent writes", async () => {
    const store = await createTemporaryStore();

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.create({
          title: `Note ${index}`,
          body: `Body ${index}`,
        }),
      ),
    );

    await expect(store.list()).resolves.toHaveLength(20);
  });
});

async function createTemporaryStore(): Promise<NoteStore> {
  return (await createTemporaryStoreWithPath()).store;
}

async function createTemporaryStoreWithPath(): Promise<{
  store: NoteStore;
  filePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "pocket-notes-"));
  temporaryDirectories.push(directory);
  const filePath = join(directory, "notes.json");
  return { store: new NoteStore(filePath), filePath };
}
