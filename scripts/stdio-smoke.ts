import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "pocket-notes-stdio-"));
const notesFile = join(temporaryDirectory, "notes.json");
const serverEntry = resolve("dist/index.js");

const client = new Client({
  name: "pocket-notes-stdio-smoke",
  version: "1.0.0",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  env: {
    ...process.env,
    POCKET_NOTES_FILE: notesFile,
  },
});

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === "create_note")) {
    throw new Error("create_note tool was not advertised");
  }

  const created = await client.callTool({
    name: "create_note",
    arguments: {
      title: "주말 장보기",
      body: "우유 1팩\n사과 4개",
      tags: ["식료품"],
    },
  });
  if (created.isError === true) {
    throw new Error("create_note returned an MCP tool error");
  }

  const listed = await client.callTool({
    name: "list_notes",
    arguments: {},
  });
  if (
    typeof listed.structuredContent !== "object" ||
    listed.structuredContent === null ||
    !("count" in listed.structuredContent) ||
    listed.structuredContent.count !== 1
  ) {
    throw new Error("list_notes did not return the created memo");
  }

  console.log(`stdio smoke passed: ${tools.length} tools, 1 shopping memo`);
} finally {
  await client.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
