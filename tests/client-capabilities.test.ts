import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { expect, it } from "vitest";

import { NoteStore } from "../src/note-store";
import { createServer } from "../src/server";

it("uses sampling, elicitation, and roots declared by the client", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "pocket-notes-capabilities-"));
  const store = new NoteStore(join(temporaryDirectory, "notes.json"));
  const note = await store.create({
    title: "주말 장보기",
    body: "사과 4개\n요거트 2개",
    tags: ["식료품"],
  });

  const server = createServer(store);
  const client = new Client(
    { name: "capable-test-client", version: "1.0.0" },
    {
      capabilities: {
        sampling: {},
        elicitation: { form: {} },
        roots: { listChanged: false },
      },
    },
  );

  client.setRequestHandler("sampling/createMessage", () => ({
    role: "assistant",
    model: "test-model",
    content: { type: "text", text: "샘플링으로 생성한 요약" },
    stopReason: "endTurn",
  }));
  client.setRequestHandler("elicitation/create", () => ({
    action: "accept",
    content: {
      title: "생활용품",
      body: "주방 세제 1개",
      tags: ["생활용품"],
    },
  }));
  client.setRequestHandler("roots/list", () => ({
    roots: [{ uri: "file:///workspace", name: "Workspace" }],
  }));

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const summary = CallToolResultSchema.parse(
      await client.callTool({
        name: "summarize_note",
        arguments: { noteId: note.id },
      }),
    );
    expect(summary.content[0]).toMatchObject({
      type: "text",
      text: "샘플링으로 생성한 요약",
    });

    const interactive = CallToolResultSchema.parse(
      await client.callTool({
        name: "create_note_interactive",
        arguments: {},
      }),
    );
    expect(interactive.isError).not.toBe(true);
    await expect(store.list()).resolves.toHaveLength(2);

    const roots = CallToolResultSchema.parse(
      await client.callTool({
        name: "list_workspace_roots",
        arguments: {},
      }),
    );
    expect(roots.structuredContent).toEqual({
      roots: [{ uri: "file:///workspace", name: "Workspace" }],
    });
  } finally {
    await client.close();
    await server.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
