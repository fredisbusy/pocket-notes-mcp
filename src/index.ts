#!/usr/bin/env node

import { resolve } from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { NoteStore } from "./note-store";
import { createServer } from "./server";

const notesFile = resolve(process.env.POCKET_NOTES_FILE ?? "data/notes.json");
const store = new NoteStore(notesFile);
const server = createServer(store);
const transport = new StdioServerTransport();

await server.connect(transport);
