import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { noteToMarkdown, toNoteSummary } from "./note";
import type { NoteStore } from "./note-store";

export function registerResources(server: McpServer, store: NoteStore): void {
  server.registerResource(
    "note-catalog",
    "notes://catalog",
    {
      title: "장보기 메모 목록",
      description: "저장된 장보기 메모를 한눈에 보는 JSON 목록입니다.",
      mimeType: "application/json",
    },
    async (uri) => {
      const notes = (await store.list()).map(toNoteSummary);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ notes, count: notes.length }, null, 2),
          },
        ],
      };
    },
  );

  const noteTemplate = new ResourceTemplate("notes://note/{id}", {
    list: async () => {
      const notes = await store.list();
      return {
        resources: notes.map((note) => ({
          uri: `notes://note/${note.id}`,
          name: note.title,
          description: note.tags.map((tag) => `#${tag}`).join(" "),
          mimeType: "text/markdown",
        })),
      };
    },
    complete: {
      id: async (value) => {
        const normalizedValue = value.toLowerCase();
        return (await store.list())
          .filter(
            (note) =>
              note.id.toLowerCase().includes(normalizedValue) ||
              note.title.toLowerCase().includes(normalizedValue),
          )
          .map((note) => note.id)
          .slice(0, 20);
      },
    },
  });

  server.registerResource(
    "note",
    noteTemplate,
    {
      title: "장보기 메모",
      description: "장보기 메모 하나를 읽기 쉬운 Markdown으로 보여줍니다.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const id = decodeURIComponent(firstTemplateValue(variables.id));
      const note = await store.get(id);
      if (note === undefined) {
        throw new Error(`메모를 찾을 수 없습니다: ${id}`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: noteToMarkdown(note),
          },
        ],
      };
    },
  );
}

function firstTemplateValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}
