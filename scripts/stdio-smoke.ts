import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "pocket-notes-stdio-"));
const notesFile = join(temporaryDirectory, "notes.json");
const serverEntry = resolve("dist/index.js");

const client = new Client(
  {
    name: "pocket-notes-stdio-smoke",
    version: "1.0.0",
  },
  {
    capabilities: {
      elicitation: { form: {} },
    },
    versionNegotiation: {
      mode: { pin: "2026-07-28" },
    },
  },
);
client.setRequestHandler("elicitation/create", () => ({
  action: "accept",
  content: {
    title: "생활용품",
    body: "주방 세제 1개",
    tags: ["생활용품"],
  },
}));

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

  if (client.getProtocolEra() !== "modern") {
    throw new Error(`expected modern MCP era, got ${client.getProtocolEra() ?? "none"}`);
  }

  const discovery = client.getDiscoverResult();
  if (
    discovery?.supportedVersions.includes("2026-07-28") !== true ||
    discovery.ttlMs !== 60_000 ||
    discovery.cacheScope !== "public"
  ) {
    throw new Error("server/discover did not advertise the modern protocol and cache hints");
  }

  const subscription = await client.listen({ resourcesListChanged: true });

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

  const interactive = await client.callTool({
    name: "create_note_interactive",
    arguments: {},
  });
  if (interactive.isError === true) {
    throw new Error("modern multi-round-trip elicitation failed");
  }

  const listedAfterInteractive = await client.callTool({
    name: "list_notes",
    arguments: {},
  });
  if (
    typeof listedAfterInteractive.structuredContent !== "object" ||
    listedAfterInteractive.structuredContent === null ||
    !("count" in listedAfterInteractive.structuredContent) ||
    listedAfterInteractive.structuredContent.count !== 2
  ) {
    throw new Error("multi-round-trip elicitation did not create the second memo");
  }

  await subscription.close();
  console.log(`stdio smoke passed: modern discovery, subscription, ${tools.length} tools`);
} finally {
  await client.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
