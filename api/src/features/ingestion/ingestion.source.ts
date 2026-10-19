import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Read only (BR-01): readdir, stat and readFile, nothing that writes to the logs folder.

export interface FileStat {
  path: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export interface ScannedSession {
  sessionId: string;
  mainFile: FileStat;
  subagentFiles: FileStat[];
}

export interface LogsScan {
  isLogsDirFound: boolean;
  sessions: ScannedSession[];
}

const SESSION_FILE = /^(.+)\.jsonl$/;
const SUBAGENT_FILE = /^agent-.+\.jsonl$/;

export async function scanLogs(logsDir: string): Promise<LogsScan> {
  const folders = await listEntries(logsDir);
  if (folders === null) return { isLogsDirFound: false, sessions: [] };
  const sessions: ScannedSession[] = [];
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const folderPath = path.join(logsDir, folder.name);
    for (const file of (await listEntries(folderPath)) ?? []) {
      const sessionId = SESSION_FILE.exec(file.name)?.[1];
      if (!file.isFile() || sessionId === undefined) continue;
      const subagentsDir = path.join(folderPath, sessionId, "subagents");
      const subagentFiles: FileStat[] = [];
      for (const subagent of (await listEntries(subagentsDir)) ?? []) {
        if (subagent.isFile() && SUBAGENT_FILE.test(subagent.name)) {
          subagentFiles.push(await statFile(path.join(subagentsDir, subagent.name)));
        }
      }
      sessions.push({ sessionId, mainFile: await statFile(path.join(folderPath, file.name)), subagentFiles });
    }
  }
  return { isLogsDirFound: true, sessions };
}

export async function readLines(file: string): Promise<string[]> {
  return (await readFile(file, "utf8")).split(/\r?\n/);
}

async function listEntries(dir: string): Promise<Dirent[] | null> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function statFile(file: string): Promise<FileStat> {
  const stats = await stat(file);
  return { path: file, sizeBytes: stats.size, modifiedAt: stats.mtime };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
