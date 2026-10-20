import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Read only (BR-07): readdir, stat and readFile, nothing that writes to the sessions or logs folders.
// The {pid}.{hash}.key files of the sessions folder hold credentials: only names matching STATUS_FILE are ever opened.

const timestamp = z.number().int().nonnegative().max(8.64e15);

// Loose: Claude Code adds fields often, only the ones the live view uses are narrowed. The session id becomes a file
// name in the logs folder, so it is restricted to the characters of an id.
export const statusFileSchema = z.looseObject({
  pid: z.number().int().positive(),
  sessionId: z.string().regex(/^[\w-]+$/),
  cwd: z.string(),
  // Milliseconds since the epoch, within the range of a Date: a crafted value must not make a date invalid.
  startedAt: timestamp,
  entrypoint: z.string().nullish(),
  // The desktop app's id of the session. No regex here: a strict shape would make a live session look dead when the value
  // is unexpected. The shape is checked by desktopSessionIdOf, where the link is built.
  hostSessionId: z.string().nullish(),
  name: z.string().nullish(),
  status: z.string().nullish(),
  waitingFor: z.string().nullish(),
  statusUpdatedAt: timestamp.nullish(),
  updatedAt: timestamp.nullish(),
});

export type StatusFile = z.infer<typeof statusFileSchema>;

export interface StatusFileRead {
  fileName: string;
  // Null: the file could not be read or does not match the schema (Claude Code may be rewriting it).
  status: StatusFile | null;
}

export interface SessionLogLocation {
  mainPath: string;
  folderPath: string;
}

const STATUS_FILE = /^\d+\.json$/;

export async function readStatusFiles(sessionsDir: string): Promise<{ isDirReadable: boolean; files: StatusFileRead[] }> {
  let names: string[];
  try {
    names = await readdir(sessionsDir);
  } catch {
    return { isDirReadable: false, files: [] };
  }
  const files = await Promise.all(
    names
      .filter((name) => STATUS_FILE.test(name))
      .sort()
      .map(async (fileName): Promise<StatusFileRead> => ({ fileName, status: await readStatusFile(path.join(sessionsDir, fileName)) })),
  );
  return { isDirReadable: true, files };
}

async function readStatusFile(file: string): Promise<StatusFile | null> {
  try {
    const parsed = statusFileSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// BR-01: signal 0 only tests that the process exists. EPERM: it exists, owned by someone else.
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}

// The main log is {logsDir}/{any folder}/{sessionId}.jsonl. Folder names vary in case, so they are never rebuilt from
// the working directory.
export async function findSessionLog(logsDir: string, sessionId: string): Promise<SessionLogLocation | null> {
  let folders: Dirent[];
  try {
    folders = await readdir(logsDir, { withFileTypes: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return null;
    }
    throw error;
  }
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const folderPath = path.join(logsDir, folder.name);
    const mainPath = path.join(folderPath, `${sessionId}.jsonl`);
    try {
      if ((await stat(mainPath)).isFile()) return { mainPath, folderPath };
    } catch {
      // Not in this folder, or unreadable: look in the next one.
    }
  }
  return null;
}
