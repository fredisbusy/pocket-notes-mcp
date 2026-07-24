import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { NoteStore } from "./note-store.js";
import { registerPrompts } from "./register-prompts.js";
import { registerResources } from "./register-resources.js";
import { registerTools } from "./register-tools.js";

export function createServer(store: NoteStore): McpServer {
  const server = new McpServer(
    {
      name: "pocket-notes-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions: [
        "Pocket Notes is a local learning server.",
        "Use list_notes before reading a note when its ID is unknown.",
        "Prefer the notes://note/{id} resource when the full note body is needed.",
        "Creating a note writes only to the configured local JSON file.",
        "Sampling, elicitation, and roots tools require matching client capabilities.",
      ].join(" "),
    },
  );

  registerTools(server, store);
  registerResources(server, store);
  registerPrompts(server, store);
  return server;
}
