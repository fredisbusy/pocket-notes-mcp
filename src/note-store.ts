import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { type Note, noteCollectionSchema } from "./note";

export interface CreateNoteInput {
  title: string;
  body: string;
  tags?: string[];
}

export class NoteStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {}

  public async list(tag?: string): Promise<Note[]> {
    const notes = await this.readAll();
    if (tag === undefined || tag.trim() === "") {
      return notes;
    }

    const normalizedTag = tag.trim().toLowerCase();
    return notes.filter((note) =>
      note.tags.some((candidate) => candidate.toLowerCase() === normalizedTag),
    );
  }

  public async get(id: string): Promise<Note | undefined> {
    const notes = await this.readAll();
    return notes.find((note) => note.id === id);
  }

  public async create(input: CreateNoteInput): Promise<Note> {
    const operation = this.mutationQueue.then(async () => {
      const notes = await this.readAll();
      const note: Note = {
        id: createNoteId(input.title),
        title: input.title.trim(),
        body: input.body.trim(),
        tags: normalizeTags(input.tags ?? []),
        createdAt: new Date().toISOString(),
      };

      notes.push(note);
      await this.writeAll(notes);
      return note;
    });

    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  public async tags(): Promise<string[]> {
    const notes = await this.readAll();
    return [...new Set(notes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b));
  }

  private async readAll(): Promise<Note[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return noteCollectionSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async writeAll(notes: Note[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(notes, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function createNoteId(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = randomUUID().slice(0, 8);
  return slug === "" ? `note-${suffix}` : `${slug}-${suffix}`;
}

function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
