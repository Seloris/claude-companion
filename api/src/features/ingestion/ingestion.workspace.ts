import { existsSync } from "node:fs";
import path from "node:path";

export interface ResolvedWorkspace {
  pathKey: string;
  path: string;
  name: string;
  isScratch: boolean;
}

export const SCRATCH_PATH_KEY = "scratch";

const WORKTREE_SEGMENT = /[\\/]\.claude[\\/]worktrees[\\/][^\\/]+/i;

export function resolveWorkspace(
  cwd: string,
  options: { scratchRoot: string; findRepoRoot: (cwd: string) => string | null },
): ResolvedWorkspace {
  const scratchKey = toPathKey(options.scratchRoot);
  const cwdKey = toPathKey(cwd);
  if (scratchKey !== "" && (cwdKey === scratchKey || cwdKey.startsWith(`${scratchKey}/`))) {
    return { pathKey: SCRATCH_PATH_KEY, path: trimSeparators(options.scratchRoot), name: "Scratch", isScratch: true };
  }
  // A worktree holds its own .git file: it must be matched before the repository walk.
  const worktree = WORKTREE_SEGMENT.exec(cwd);
  const resolved = worktree !== null ? cwd.slice(0, worktree.index) : (options.findRepoRoot(cwd) ?? cwd);
  const resolvedPath = trimSeparators(resolved);
  return {
    pathKey: toPathKey(resolvedPath),
    path: resolvedPath,
    name: resolvedPath.split(/[\\/]/).filter((segment) => segment !== "").at(-1) ?? resolvedPath,
    isScratch: false,
  };
}

// The nearest ancestor holding a .git file or folder; null when the folder is gone or outside any repository.
export function findRepoRoot(cwd: string): string | null {
  let current = cwd;
  for (;;) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function toPathKey(value: string): string {
  return trimSeparators(value.replace(/\\/g, "/")).toLowerCase();
}

function trimSeparators(value: string): string {
  const trimmed = value.replace(/[\\/]+$/, "");
  return trimmed === "" ? value : trimmed;
}
