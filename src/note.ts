import { z } from "zod";

export const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)),
  createdAt: z.iso.datetime(),
});

export const noteCollectionSchema = z.array(noteSchema);

export const createNoteInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

export type Note = z.infer<typeof noteSchema>;

export type NoteSummary = Pick<Note, "id" | "title" | "tags" | "createdAt">;

export type CreateNoteInput = z.input<typeof createNoteInputSchema>;

export function toNoteSummary(note: Note): NoteSummary {
  const { id, title, tags, createdAt } = note;
  return { id, title, tags, createdAt };
}

export function noteToMarkdown(note: Note): string {
  const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(" ") : "분류 없음";

  return [
    `# ${note.title}`,
    "",
    `- ID: \`${note.id}\``,
    `- 만든 날짜: ${note.createdAt}`,
    `- 분류: ${tags}`,
    "",
    note.body,
  ].join("\n");
}
