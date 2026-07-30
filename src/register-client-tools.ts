import {
  acceptedContent,
  inputRequired,
  inputResponse,
  type McpServer,
} from "@modelcontextprotocol/server";
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
    async ({ noteId }, ctx) => {
      const note = await requireNote(store, noteId);
      const response = inputResponse(ctx.mcpReq.inputResponses, "summary");

      if (response.kind === "missing") {
        return inputRequired({
          inputRequests: {
            summary: inputRequired.createMessage({
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
            }),
          },
        });
      }

      if (response.kind !== "sampling") {
        return {
          content: [
            {
              type: "text",
              text: "연결된 MCP Client가 sampling 입력 요청을 처리하지 못했습니다.",
            },
          ],
          isError: true,
        };
      }

      const samplingContent = Array.isArray(response.result.content)
        ? response.result.content.find((content) => content.type === "text")
        : response.result.content;
      const text =
        samplingContent?.type === "text"
          ? samplingContent.text
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
    async (_arguments, ctx) => {
      const response = inputResponse(ctx.mcpReq.inputResponses, "note");

      if (response.kind === "elicit" && response.action !== "accept") {
        return {
          content: [
            { type: "text", text: `장보기 메모를 만들지 않았습니다: ${response.action}` },
          ],
        };
      }

      const content = acceptedContent(ctx.mcpReq.inputResponses, "note", createNoteInputSchema);
      if (content === undefined) {
        return inputRequired({
          inputRequests: {
            note: inputRequired.elicit({
              mode: "form",
              message: "무엇을 사야 하나요? 장보기 내용을 간단히 적어 주세요.",
              requestedSchema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    title: "메모 이름",
                    minLength: 1,
                    maxLength: 120,
                  },
                  body: {
                    type: "string",
                    title: "살 것",
                    minLength: 1,
                    maxLength: 10_000,
                  },
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
            }),
          },
        });
      }

      const note = await store.create({
        title: content.title,
        body: content.body,
        tags: content.tags ?? [],
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
    async (_arguments, ctx) => {
      const response = inputResponse(ctx.mcpReq.inputResponses, "roots");
      if (response.kind === "missing") {
        return inputRequired({
          inputRequests: {
            roots: inputRequired.listRoots(),
          },
        });
      }

      if (response.kind !== "roots") {
        return {
          content: [
            { type: "text", text: "연결된 MCP Client가 roots 입력 요청을 처리하지 못했습니다." },
          ],
          isError: true,
        };
      }

      const { roots } = response;
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
