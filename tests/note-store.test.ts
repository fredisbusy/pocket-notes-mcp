import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NoteStore } from "../src/note-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("NoteStore", () => {
  it("creates, normalizes, and filters shopping memos", async () => {
    const store = await createTemporaryStore();

    const created = await store.create({
      title: " 이번 주 장보기 ",
      body: " 우유 1팩 ",
      tags: ["식료품", " 이번주 ", "식료품"],
    });

    expect(created.title).toBe("이번 주 장보기");
    expect(created.body).toBe("우유 1팩");
    expect(created.tags).toEqual(["식료품", "이번주"]);
    await expect(store.list("식료품")).resolves.toHaveLength(1);
    await expect(store.get(created.id)).resolves.toEqual(created);
  });

  it("persists valid, formatted JSON", async () => {
    const { store, filePath } = await createTemporaryStoreWithPath();
    await store.create({ title: "과일", body: "사과 4개" });

    const persisted = await readFile(filePath, "utf8");
    expect(JSON.parse(persisted)).toHaveLength(1);
    expect(persisted.endsWith("\n")).toBe(true);
  });

  it("rejects input that becomes invalid after normalization", async () => {
    const { store, filePath } = await createTemporaryStoreWithPath();

    await expect(store.create({ title: "   ", body: "Valid body" })).rejects.toThrow();
    await expect(store.create({ title: "Valid title", body: "\n\t" })).rejects.toThrow();
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not lose concurrent writes", async () => {
    const store = await createTemporaryStore();

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.create({
          title: `장보기 ${index}`,
          body: `살 것 ${index}`,
        }),
      ),
    );

    await expect(store.list()).resolves.toHaveLength(20);
  });

  it("serializes writes across stores in the same process", async () => {
    const { store: firstStore, filePath } = await createTemporaryStoreWithPath();
    const secondStore = new NoteStore(filePath);

    await Promise.all([
      firstStore.create({ title: "식료품", body: "우유" }),
      secondStore.create({ title: "생활용품", body: "휴지" }),
    ]);

    await expect(firstStore.list()).resolves.toHaveLength(2);
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
