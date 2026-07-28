import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteStore } from "../src/note-store";
import { createServer } from "../src/server";

let temporaryDirectory: string;
let client: Client;
let server: ReturnType<typeof createServer>;
let noteId: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "pocket-notes-server-"));
  const store = new NoteStore(join(temporaryDirectory, "notes.json"));
  const note = await store.create({
    title: "MCP Host",
    body: "Host 안의 Client가 Server와 통신합니다.",
    tags: ["mcp", "architecture"],
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
      arguments: { tag: "mcp" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      count: 1,
      notes: [{ id: noteId, title: "MCP Host" }],
    });
  });

  it("lists and reads note resources", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain("notes://catalog");
    expect(resources.map((resource) => resource.uri)).toContain(`notes://note/${noteId}`);

    const result = await client.readResource({ uri: `notes://note/${noteId}` });
    expect(result.contents[0]).toMatchObject({
      uri: `notes://note/${noteId}`,
      mimeType: "text/markdown",
    });
    expect("text" in result.contents[0]! ? result.contents[0].text : "").toContain("# MCP Host");
  });

  it("gets a prompt and completes its note ID argument", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toContain("review_note");

    const prompt = await client.getPrompt({
      name: "review_note",
      arguments: { noteId, style: "quiz" },
    });
    expect(prompt.description).toContain("quiz");
    expect(prompt.messages).toHaveLength(2);

    const completion = await client.complete({
      ref: { type: "ref/prompt", name: "review_note" },
      argument: { name: "noteId", value: "mcp" },
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
