import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { NoteStore } from "./note-store.js";

const reviewStyles = ["beginner", "quiz", "summary", "interview"] as const;

export function registerPrompts(server: McpServer, store: NoteStore): void {
  server.registerPrompt(
    "review_note",
    {
      title: "Review a note",
      description: "Create a reusable learning prompt for one saved note.",
      argsSchema: {
        noteId: completable(z.string().min(1), async (value: string) => {
          const normalizedValue = value.toLowerCase();
          return (await store.list())
            .filter(
              (note) =>
                note.id.toLowerCase().includes(normalizedValue) ||
                note.title.toLowerCase().includes(normalizedValue),
            )
            .map((note) => note.id)
            .slice(0, 20);
        }),
        style: completable(
          z.enum(reviewStyles).default("beginner"),
          (value: string | undefined) =>
            reviewStyles.filter((style) => style.startsWith(value?.toLowerCase() ?? "")),
        ),
      },
    },
    async ({ noteId, style }) => {
      const note = await store.get(noteId);
      if (note === undefined) {
        throw new Error(`메모를 찾을 수 없습니다: ${noteId}`);
      }

      return {
        description: `${note.title} 메모를 ${style} 방식으로 복습합니다.`,
        messages: [
          {
            role: "user",
            content: {
              type: "resource",
              resource: {
                uri: `notes://note/${note.id}`,
                mimeType: "text/markdown",
                text: note.body,
              },
            },
          },
          {
            role: "user",
            content: {
              type: "text",
              text: instructionForStyle(style),
            },
          },
        ],
      };
    },
  );
}

function instructionForStyle(style: (typeof reviewStyles)[number]): string {
  switch (style) {
    case "beginner":
      return "이 내용을 처음 접하는 사람도 이해할 수 있도록 쉬운 예시와 함께 설명해 주세요.";
    case "quiz":
      return "핵심 개념을 확인하는 짧은 질문 세 개를 한 번에 하나씩 내주세요.";
    case "summary":
      return "핵심 내용을 세 개의 불릿으로 요약해 주세요.";
    case "interview":
      return "기술 면접관처럼 개념과 적용 방법을 차례로 질문해 주세요.";
  }
}
