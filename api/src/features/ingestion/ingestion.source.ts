import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Read only (BR-01): readdir, stat and readFile, nothing that writes to the logs folder.

export interface FileStat {
  path: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export interface SubagentFileStat extends FileStat {
  agentId: string;
  // The sibling meta.json, which may not exist.
  metaPath: string;
}

export interface ScannedSession {
  sessionId: string;
  mainFile: FileStat;
  subagentFiles: SubagentFileStat[];
}

export interface LogsScan {
  isLogsDirFound: boolean;
  sessions: ScannedSession[];
}

const SESSION_FILE = /^(.+)\.jsonl$/;
const SUBAGENT_FILE = /^agent-(.+)\.jsonl$/;

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
      const subagentFiles = await scanSubagentFiles(folderPath, sessionId);
      sessions.push({ sessionId, mainFile: await statFile(path.join(folderPath, file.name)), subagentFiles });
    }
  }
  return { isLogsDirFound: true, sessions };
}

// The `{sessionId}/subagents/agent-*.jsonl` files beside a session's main log.
export async function scanSubagentFiles(folderPath: string, sessionId: string): Promise<SubagentFileStat[]> {
  const subagentsDir = path.join(folderPath, sessionId, "subagents");
  const subagentFiles: SubagentFileStat[] = [];
  for (const subagent of (await listEntries(subagentsDir)) ?? []) {
    const agentId = SUBAGENT_FILE.exec(subagent.name)?.[1];
    if (subagent.isFile() && agentId !== undefined) {
      subagentFiles.push({
        ...(await statFile(path.join(subagentsDir, subagent.name))),
        agentId,
        metaPath: path.join(subagentsDir, `agent-${agentId}.meta.json`),
      });
    }
  }
  return subagentFiles;
}

// FR-02: true when a file is new, changed or gone since `stored` was recorded.
export function haveFilesChanged(scanned: FileStat[], stored: FileStat[]): boolean {
  if (scanned.length !== stored.length) return true;
  const storedByPath = new Map(stored.map((file) => [file.path, file]));
  return scanned.some((file) => {
    const previous = storedByPath.get(file.path);
    return (
      previous === undefined ||
      previous.sizeBytes !== file.sizeBytes ||
      previous.modifiedAt.getTime() !== file.modifiedAt.getTime()
    );
  });
}

export async function readLines(file: string): Promise<string[]> {
  return (await readFile(file, "utf8")).split(/\r?\n/);
}

// The parsed meta.json of a subagent, or null when it cannot be read or is not valid JSON: the meta only adds
// details, one bad file must not fail the whole refresh.
export async function readMeta(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function listEntries(dir: string): Promise<Dirent[] | null> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function statFile(file: string): Promise<FileStat> {
  const stats = await stat(file);
  return { path: file, sizeBytes: stats.size, modifiedAt: stats.mtime };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
