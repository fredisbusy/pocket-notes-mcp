import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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
      title: "Summarize note with the host model",
      description:
        "Read a note and ask the MCP client's language model to summarize it using MCP sampling.",
      inputSchema: {
        noteId: z.string().min(1),
      },
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
              text: `다음 메모를 초보자가 이해하기 쉽게 세 문장 이내로 요약해 주세요.\n\n${note.body}`,
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
      title: "Create note interactively",
      description:
        "Ask the user for non-sensitive note fields through MCP form elicitation, then create the note.",
      inputSchema: {},
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
        message: "새 메모의 내용을 입력해 주세요. 비밀번호나 API 키는 입력하지 마세요.",
        requestedSchema: {
          type: "object",
          properties: {
            title: { type: "string", title: "제목", minLength: 1, maxLength: 120 },
            body: { type: "string", title: "본문", minLength: 1, maxLength: 10_000 },
            tags: {
              type: "array",
              title: "태그",
              items: {
                type: "string",
                enum: [
                  "mcp",
                  "architecture",
                  "tools",
                  "resources",
                  "prompts",
                  "learning",
                  "other",
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
          content: [{ type: "text", text: `메모 생성을 진행하지 않았습니다: ${result.action}` }],
        };
      }

      const parsed = z
        .object({
          title: z.string(),
          body: z.string(),
          tags: z.array(z.string()).optional(),
        })
        .safeParse(result.content);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: "호스트가 올바르지 않은 메모 입력을 반환했습니다." }],
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
          { type: "text", text: `메모를 생성했습니다: notes://note/${note.id}` },
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
      inputSchema: {},
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
