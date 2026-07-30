#!/usr/bin/env node

import { resolve } from "node:path";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { NoteStore } from "./note-store";
import { createServer } from "./server";

const notesFile = resolve(process.env.POCKET_NOTES_FILE ?? "data/notes.json");
const store = new NoteStore(notesFile);

serveStdio(() => createServer(store), {
  onerror: (error) => {
    console.error("[pocket-notes-mcp]", error);
  },
});
