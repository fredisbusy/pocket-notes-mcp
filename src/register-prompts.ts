import { completable } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { NoteStore } from "./note-store";

const shoppingStyles = ["simple", "checklist", "budget", "meal"] as const;

export function registerPrompts(server: McpServer, store: NoteStore): void {
  server.registerPrompt(
    "prepare_shopping",
    {
      title: "장보기 준비하기",
      description: "저장된 메모를 실제 장보기에 쓰기 좋게 정리합니다.",
      argsSchema: z.object({
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
          z.enum(shoppingStyles).default("simple"),
          (value: string | undefined) =>
            shoppingStyles.filter((style) => style.startsWith(value?.toLowerCase() ?? "")),
        ),
      }),
    },
    async ({ noteId, style }) => {
      const note = await store.get(noteId);
      if (note === undefined) {
        throw new Error(`메모를 찾을 수 없습니다: ${noteId}`);
      }

      return {
        description: `${note.title} 메모를 ${style} 방식으로 장보기 좋게 정리합니다.`,
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

function instructionForStyle(style: (typeof shoppingStyles)[number]): string {
  switch (style) {
    case "simple":
      return "살 것만 짧고 쉬운 목록으로 정리해 주세요.";
    case "checklist":
      return "매장에서 하나씩 확인할 수 있는 체크리스트로 만들어 주세요.";
    case "budget":
      return "꼭 필요한 것과 나중에 사도 되는 것을 나누고, 절약 팁을 덧붙여 주세요.";
    case "meal":
      return "이 재료로 만들 수 있는 간단한 식사와 빠진 재료를 알려 주세요.";
  }
}
