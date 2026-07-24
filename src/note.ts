import { z } from "zod";

export const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)),
  createdAt: z.iso.datetime(),
});

export const noteCollectionSchema = z.array(noteSchema);

export type Note = z.infer<typeof noteSchema>;

export type NoteSummary = Pick<Note, "id" | "title" | "tags" | "createdAt">;

export function toNoteSummary(note: Note): NoteSummary {
  const { id, title, tags, createdAt } = note;
  return { id, title, tags, createdAt };
}

export function noteToMarkdown(note: Note): string {
  const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(" ") : "태그 없음";

  return [
    `# ${note.title}`,
    "",
    `- ID: \`${note.id}\``,
    `- 생성: ${note.createdAt}`,
    `- 태그: ${tags}`,
    "",
    note.body,
  ].join("\n");
}
