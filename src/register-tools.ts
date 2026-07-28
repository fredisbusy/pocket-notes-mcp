import { scheduler } from "node:timers/promises";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createNoteInputSchema, noteSchema, toNoteSummary } from "./note";
import type { NoteStore } from "./note-store";
import { registerClientCapabilityTools } from "./register-client-tools";

const noteSummarySchema = noteSchema.pick({
  id: true,
  title: true,
  tags: true,
  createdAt: true,
});

const listNotesOutputSchema = z.object({
  notes: z.array(noteSummarySchema),
  count: z.number().int().nonnegative(),
});

const tagCountSchema = z.object({
  tag: z.string(),
  count: z.number().int().positive(),
});

export function registerTools(server: McpServer, store: NoteStore): void {
  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description: "List note summaries, optionally filtered by an exact tag.",
      inputSchema: z.object({
        tag: z.string().trim().min(1).optional().describe("Optional exact tag filter"),
      }),
      outputSchema: listNotesOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ tag }) => {
      const notes = (await store.list(tag)).map(toNoteSummary);
      const output = { notes, count: notes.length };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description: "Create a local note. This changes the notes JSON file but does not delete data.",
      inputSchema: createNoteInputSchema,
      outputSchema: noteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ title, body, tags }) => {
      const note = await store.create({ title, body, tags });
      server.sendResourceListChanged();

      await server.sendLoggingMessage({
        level: "info",
        logger: "pocket-notes",
        data: { event: "note_created", noteId: note.id },
      });

      return {
        content: [
          { type: "text", text: `메모를 생성했습니다: notes://note/${note.id}` },
          {
            type: "resource_link",
            uri: `notes://note/${note.id}`,
            name: note.title,
            mimeType: "text/markdown",
          },
        ],
        structuredContent: note,
      };
    },
  );

  server.registerTool(
    "analyze_notes",
    {
      title: "Analyze note tags",
      description:
        "Count notes by tag while demonstrating MCP progress notifications and cancellation.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        noteCount: z.number().int().nonnegative(),
        tags: z.array(tagCountSchema),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_arguments, ctx) => {
      const notes = await store.list();
      const counts = new Map<string, number>();

      for (const [index, note] of notes.entries()) {
        if (index > 0 && index % 100 === 0) {
          await scheduler.yield();
        }

        if (ctx.mcpReq.signal.aborted) {
          return {
            content: [{ type: "text", text: "메모 분석이 취소되었습니다." }],
            isError: true,
          };
        }

        for (const tag of note.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }

        if (ctx.mcpReq._meta?.progressToken !== undefined) {
          await ctx.mcpReq.notify({
            method: "notifications/progress",
            params: {
              progressToken: ctx.mcpReq._meta.progressToken,
              progress: index + 1,
              total: notes.length,
              message: `${index + 1}/${notes.length}개 메모 분석`,
            },
          });
        }
      }

      const tags = [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
      const output = { noteCount: notes.length, tags };

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  registerClientCapabilityTools(server, store);
}
