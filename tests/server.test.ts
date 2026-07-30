import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteStore } from "../src/note-store";
import { createServer } from "../src/server";

let temporaryDirectory: string;
let client: Client;
let server: ReturnType<typeof createServer>;
let store: NoteStore;
let noteId: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "pocket-notes-server-"));
  store = new NoteStore(join(temporaryDirectory, "notes.json"));
  const note = await store.create({
    title: "이번 주 장보기",
    body: "우유 1팩\n달걀 10개",
    tags: ["식료품", "이번주"],
  });
  noteId = note.id;

  server = createServer(store);
  client = new Client(
    { name: "pocket-notes-test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("Pocket Notes MCP protocol", () => {
  it("negotiates instructions and exposes the expected tools", async () => {
    expect(client.getInstructions()).toContain("Pocket Notes");

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_notes",
      "create_note",
      "analyze_notes",
      "summarize_note",
      "create_note_interactive",
      "list_workspace_roots",
    ]);
  });

  it("calls a tool and validates structured output", async () => {
    const result = await client.callTool({
      name: "list_notes",
      arguments: { tag: "식료품" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      count: 1,
      notes: [{ id: noteId, title: "이번 주 장보기" }],
    });
  });

  it("analyzes tags and reports progress", async () => {
    await store.create({
      title: "생활용품",
      body: "주방 세제\n휴지",
      tags: ["생활용품", "이번주"],
    });
    const progress: number[] = [];

    const result = await client.callTool(
      { name: "analyze_notes", arguments: {} },
      { onprogress: ({ progress: current }) => progress.push(current) },
    );

    expect(result.structuredContent).toEqual({
      noteCount: 2,
      tags: [
        { tag: "이번주", count: 2 },
        { tag: "생활용품", count: 1 },
        { tag: "식료품", count: 1 },
      ],
    });
    expect(progress).toEqual([1, 2]);
  });

  it("lists and reads note resources", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain("notes://catalog");
    expect(resources.map((resource) => resource.uri)).toContain(`notes://note/${noteId}`);

    const result = await client.readResource({ uri: `notes://note/${noteId}` });
    expect(result.contents[0]).toMatchObject({
      uri: new URL(`notes://note/${noteId}`).href,
      mimeType: "text/markdown",
    });
    expect("text" in result.contents[0]! ? result.contents[0].text : "").toContain(
      "# 이번 주 장보기",
    );
  });

  it("gets a prompt and completes its note ID argument", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toContain("prepare_shopping");

    const prompt = await client.getPrompt({
      name: "prepare_shopping",
      arguments: { noteId, style: "checklist" },
    });
    expect(prompt.description).toContain("checklist");
    expect(prompt.messages).toHaveLength(2);

    const completion = await client.complete({
      ref: { type: "ref/prompt", name: "prepare_shopping" },
      argument: { name: "noteId", value: "장보기" },
    });
    expect(completion.completion.values).toContain(noteId);
  });

  it("fails gracefully when the client does not support sampling", async () => {
    const result = CallToolResultSchema.parse(
      await client.callTool({
        name: "summarize_note",
        arguments: { noteId },
      }),
    );

    expect(result.isError).toBe(true);
    const firstContent = result.content[0];
    expect(firstContent?.type === "text" ? firstContent.text : "").toContain("sampling");
  });
});
