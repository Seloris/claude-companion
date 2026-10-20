import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Read only (BR-01): readdir, stat and readFile, nothing that writes, moves or deletes in the boards folder.

const timestamp = z.number().int().nonnegative().max(8.64e15);

const phases = ["working", "awaiting-commit", "awaiting-answer", "job-done", "interrupted"] as const;
const phaseSchema = z.enum(phases);

const recapSchema = z.looseObject({
  text: z.string().nullable(),
  commits: z.array(z.looseObject({ sha: z.string(), subject: z.string() })),
});

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
  // Version 2 fields, optional in both versions: an older export or run carries none of them.
  phase: phaseSchema.optional(),
  pendingCommit: z.string().nullish(),
  recap: recapSchema.nullish(),
});

// The mod always sets the phase of a session (FR-28).
const sessionSchema = runSchema.extend({ phase: phaseSchema });

const activitySchema = z.looseObject({
  phase: z.enum([...phases, "idle"]),
  sessionId: z.string().nullable(),
  feature: z.string().nullable(),
  step: z.string().nullable(),
  since: timestamp.nullable(),
  pendingCommit: z.string().nullable(),
  recap: recapSchema.nullable(),
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

// The parse schemas of the mod's FactoryBoardExport, versions 1 and 2 (its types/index.d.ts). Version 2 adds the run
// phases, the activity and the sessions. `repo`, `models` and `squash` are not served: the application draws neither
// the models screen nor the squash.
const exportV1Schema = z.looseObject({
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

const exportV2Schema = exportV1Schema.extend({
  schemaVersion: z.literal(2),
  activity: activitySchema,
  sessions: z.array(sessionSchema),
});

export const factoryExportSchema = z.discriminatedUnion("schemaVersion", [exportV1Schema, exportV2Schema]);

export type FactoryExport = z.infer<typeof factoryExportSchema>;
export type FactoryExportV1 = z.infer<typeof exportV1Schema>;
export type FactoryExportV2 = z.infer<typeof exportV2Schema>;
export type ExportRun = z.infer<typeof runSchema>;
export type ExportSession = z.infer<typeof sessionSchema>;
export type ExportActivity = z.infer<typeof activitySchema>;

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
  if (version !== 1 && version !== 2) return { kind: "unsupported", schemaVersion: typeof version === "number" ? version : null };
  const parsed = factoryExportSchema.safeParse(value);
  return parsed.success ? { kind: "board", board: parsed.data } : { kind: "unreadable" };
}

// Claude Code's installed_plugins.json, read only: one list of installs per "{plugin}@{marketplace}" key.
const pluginInstallSchema = z.looseObject({
  scope: z.string(),
  projectPath: z.string().optional(),
  version: z.string(),
  installedAt: z.string().optional(),
  lastUpdated: z.string().optional(),
});
const installedPluginsSchema = z.looseObject({ plugins: z.record(z.string(), z.array(z.unknown())) });

export interface PluginInstall {
  // The plugin's name, without its marketplace.
  name: string;
  scope: string;
  projectPath: string | null;
  version: string;
  installedAt: string;
  lastUpdated: string;
}

// An unreadable or unexpected file gives no install: the board and the header show no version rather than an error.
export async function readInstalledPlugins(pluginsFile: string): Promise<PluginInstall[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(pluginsFile, "utf8")) as unknown;
  } catch {
    return [];
  }
  const file = installedPluginsSchema.safeParse(parsed);
  if (!file.success) return [];
  return Object.entries(file.data.plugins).flatMap(([key, installs]) => {
    const name = key.split("@")[0] ?? key;
    return installs.flatMap((value) => {
      const install = pluginInstallSchema.safeParse(value);
      if (!install.success) return [];
      const { scope, projectPath, version, installedAt, lastUpdated } = install.data;
      return [
        { name, scope, projectPath: projectPath ?? null, version, installedAt: installedAt ?? "", lastUpdated: lastUpdated ?? "" },
      ];
    });
  });
}
