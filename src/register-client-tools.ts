import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createNoteInputSchema } from "./note";
import type { NoteStore } from "./note-store";

/**
 * Tools in this file demonstrate capabilities provided by the MCP Client.
 * They are kept separate from ordinary server-side tools because not every
 * Host supports sampling, elicitation, or roots.
 */
export function registerClientCapabilityTools(server: McpServer, store: NoteStore): void {
  server.registerTool(
    "summarize_note",
    {
      title: "장보기 메모 간단히 정리",
      description:
        "장보기 메모를 읽고 MCP Client의 모델에게 짧게 정리해 달라고 요청합니다.",
      inputSchema: z.object({
        noteId: z.string().min(1),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ noteId }) => {
      if (server.server.getClientCapabilities()?.sampling === undefined) {
        return unsupportedCapability("sampling");
      }

      const note = await requireNote(store, noteId);
      const response = await server.server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `다음 장보기 메모를 매장에서 바로 볼 수 있는 짧은 목록으로 정리해 주세요.\n\n${note.body}`,
            },
          },
        ],
        maxTokens: 300,
      });

      const text =
        response.content.type === "text"
          ? response.content.text
          : "호스트 모델이 텍스트가 아닌 응답을 반환했습니다.";
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "create_note_interactive",
    {
      title: "대화형 장보기 메모 만들기",
      description:
        "간단한 MCP 입력 폼으로 살 것을 물어보고 장보기 메모를 만듭니다.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      if (server.server.getClientCapabilities()?.elicitation === undefined) {
        return unsupportedCapability("elicitation");
      }

      const result = await server.server.elicitInput({
        mode: "form",
        message: "무엇을 사야 하나요? 장보기 내용을 간단히 적어 주세요.",
        requestedSchema: {
          type: "object",
          properties: {
            title: { type: "string", title: "메모 이름", minLength: 1, maxLength: 120 },
            body: { type: "string", title: "살 것", minLength: 1, maxLength: 10_000 },
            tags: {
              type: "array",
              title: "분류",
              items: {
                type: "string",
                enum: [
                  "식료품",
                  "채소",
                  "과일",
                  "간식",
                  "생활용품",
                  "이번주",
                  "기타",
                ],
              },
              maxItems: 10,
            },
          },
          required: ["title", "body"],
        },
      });

      if (result.action !== "accept") {
        return {
          content: [
            { type: "text", text: `장보기 메모를 만들지 않았습니다: ${result.action}` },
          ],
        };
      }

      const parsed = createNoteInputSchema.safeParse(result.content);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: "장보기 메모의 입력 내용을 확인해 주세요." }],
          isError: true,
        };
      }

      const note = await store.create({
        title: parsed.data.title,
        body: parsed.data.body,
        tags: parsed.data.tags ?? [],
      });
      server.sendResourceListChanged();
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
      };
    },
  );

  server.registerTool(
    "list_workspace_roots",
    {
      title: "List client workspace roots",
      description:
        "Ask the MCP client which workspace roots it has made available to this server.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      if (server.server.getClientCapabilities()?.roots === undefined) {
        return unsupportedCapability("roots");
      }

      const { roots } = await server.server.listRoots();
      return {
        content: [{ type: "text", text: JSON.stringify({ roots }, null, 2) }],
        structuredContent: { roots },
      };
    },
  );
}

async function requireNote(store: NoteStore, id: string) {
  const note = await store.get(id);
  if (note === undefined) {
    throw new Error(`메모를 찾을 수 없습니다: ${id}`);
  }
  return note;
}

function unsupportedCapability(capability: "sampling" | "elicitation" | "roots") {
  return {
    content: [
      {
        type: "text" as const,
        text: `연결된 MCP Client가 ${capability} capability를 지원하지 않습니다.`,
      },
    ],
    isError: true,
  };
}
