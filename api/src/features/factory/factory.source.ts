import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Read only (BR-01): readdir, stat and readFile, nothing that writes, moves or deletes in the boards folder.

const timestamp = z.number().int().nonnegative().max(8.64e15);

// Loose at every level, so a field the mod adds does not break the read. The enums are strict: an unknown value cannot
// be drawn, and the mod announces such a change with its schemaVersion.
const runSchema = z.looseObject({
  sessionId: z.string(),
  feature: z.string().nullable(),
  folder: z.string().nullable(),
  command: z.string(),
  step: z.string(),
  lastStep: z.string().nullish(),
  agentId: z.string().optional(),
  status: z.enum(["running", "waiting", "done", "interrupted"]),
  since: timestamp,
  updatedAt: timestamp,
});

const planSchema = z.looseObject({
  folder: z.string(),
  title: z.string(),
  stages: z.array(
    z.looseObject({
      number: z.number().int(),
      title: z.string(),
      commit: z.string().nullable(),
      sha: z.string().nullable(),
      done: z.number().int(),
      total: z.number().int(),
    }),
  ),
  validationDone: z.number().int(),
  validationTotal: z.number().int(),
  reviewDone: z.boolean(),
  isDraft: z.boolean(),
});

const promptSchema = z.looseObject({ label: z.string(), prompt: z.string() });

const featureSchema = z.looseObject({
  slug: z.string(),
  title: z.string(),
  state: z.enum(["empty", "spec", "plan", "running", "review", "done"]),
  isNewPlan: z.boolean(),
  hasSpec: z.boolean(),
  specStatus: z.string().nullable(),
  plan: planSchema.nullable(),
  plans: z.array(z.string()),
  autopilot: runSchema.nullable(),
  next: promptSchema.extend({ all: promptSchema.optional(), autopilot: promptSchema.optional() }).nullable(),
  steps: z.array(
    z.looseObject({
      step: z.string(),
      title: z.string(),
      detail: z.string(),
      marker: z.enum(["done", "running", "next", "pending"]),
      runs: z.array(runSchema),
    }),
  ),
});

// The parse schema of the mod's FactoryBoardExport v1 (its types/index.d.ts). `repo`, `models` and `squash` are not
// served: the application draws neither the models screen nor the squash.
export const factoryExportSchema = z.looseObject({
  schemaVersion: z.literal(1),
  scannedAt: timestamp,
  root: z.string(),
  branch: z.string().nullable(),
  baseBranch: z.string(),
  aheadCount: z.number().int().nullable(),
  changedCount: z.number().int(),
  error: z.string().nullable(),
  markers: z.looseObject({ review: z.string(), browser: z.string() }),
  live: z.array(runSchema),
  features: z.array(featureSchema),
});

export type FactoryExport = z.infer<typeof factoryExportSchema>;
export type ExportRun = z.infer<typeof runSchema>;

export type BoardFileRead =
  | { kind: "board"; board: FactoryExport }
  | { kind: "unsupported"; schemaVersion: number | null }
  | { kind: "unreadable" };

export interface BoardFile {
  fileName: string;
  mtimeMs: number;
  size: number;
}

export async function listBoardFiles(boardsDir: string): Promise<{ isDirReadable: boolean; names: string[]; files: BoardFile[] }> {
  let names: string[];
  try {
    const entries = await readdir(boardsDir, { withFileTypes: true });
    names = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { isDirReadable: false, names: [], files: [] };
  }
  const files: BoardFile[] = [];
  for (const fileName of names) {
    try {
      const { mtimeMs, size } = await stat(path.join(boardsDir, fileName));
      files.push({ fileName, mtimeMs, size });
    } catch {
      // Gone or locked between the listing and the stat: left out of this read.
    }
  }
  // `names` holds every file of the folder, `files` only those that could be stat-ed: a file busy at this instant still exists.
  return { isDirReadable: true, names, files };
}

// The mod does not write atomically: a half-written file, a locked one and one that no longer fits the schema are all
// "unreadable", and the caller keeps the last good board (FR-21).
export async function readBoardFile(boardsDir: string, fileName: string): Promise<BoardFileRead> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path.join(boardsDir, fileName), "utf8"));
  } catch {
    return { kind: "unreadable" };
  }
  const version = typeof value === "object" && value !== null && "schemaVersion" in value ? value.schemaVersion : undefined;
  if (version !== 1) return { kind: "unsupported", schemaVersion: typeof version === "number" ? version : null };
  const parsed = factoryExportSchema.safeParse(value);
  return parsed.success ? { kind: "board", board: parsed.data } : { kind: "unreadable" };
}
