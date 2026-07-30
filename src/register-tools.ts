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
      title: "장보기 메모 보기",
      description: "저장된 장보기 메모를 봅니다. 분류 태그로 골라볼 수도 있습니다.",
      inputSchema: z.object({
        tag: z.string().trim().min(1).optional().describe("찾고 싶은 분류 태그 (선택)"),
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
      title: "장보기 메모 만들기",
      description: "살 것과 필요한 내용을 로컬 장보기 메모로 저장합니다.",
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

      console.error(
        `[pocket-notes] ${JSON.stringify({ event: "note_created", noteId: note.id })}`,
      );

      return {
        content: [
          { type: "text", text: `장보기 메모를 만들었습니다: notes://note/${note.id}` },
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
      title: "장보기 분류 확인",
      description:
        "장보기 메모를 분류별로 세어 봅니다. 진행 알림과 취소도 함께 보여주는 예제입니다.",
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
            content: [{ type: "text", text: "장보기 메모 확인을 취소했습니다." }],
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
              message: `${index + 1}/${notes.length}개 장보기 메모 확인`,
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
